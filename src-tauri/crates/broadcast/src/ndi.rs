use std::ffi::{c_void, CString};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::ndi_sdk::{NdiSdk, NdiSdkError};

type NdiSendInstance = *mut c_void;
type NdiSendCreateFn = unsafe extern "C" fn(*const NdiSendCreate) -> NdiSendInstance;
type NdiSendDestroyFn = unsafe extern "C" fn(NdiSendInstance);
type NdiSendVideoV2Fn = unsafe extern "C" fn(NdiSendInstance, *const NdiVideoFrameV2);

#[repr(C)]
struct NdiSendCreate {
    p_ndi_name: *const i8,
    p_groups: *const i8,
    clock_video: bool,
    clock_audio: bool,
}

#[repr(C)]
struct NdiVideoFrameV2 {
    xres: i32,
    yres: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    p_data: *mut u8,
    line_stride_in_bytes: i32,
    p_metadata: *const i8,
    timestamp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiStartRequest {
    pub source_name: String,
    pub resolution: NdiResolution,
    pub frame_rate: NdiFrameRate,
    pub alpha_mode: NdiAlphaMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiResolution {
    R720p,
    R1080p,
    R4k,
}

impl NdiResolution {
    pub fn dimensions(&self) -> (u32, u32) {
        match self {
            Self::R720p => (1280, 720),
            Self::R1080p => (1920, 1080),
            Self::R4k => (3840, 2160),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiFrameRate {
    Fps24,
    Fps30,
    Fps60,
}

impl NdiFrameRate {
    pub fn fps(&self) -> u32 {
        match self {
            Self::Fps24 => 24,
            Self::Fps30 => 30,
            Self::Fps60 => 60,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiAlphaMode {
    NoneOpaque,
    StraightAlpha,
    PremultipliedAlpha,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiSessionInfo {
    pub source_name: String,
    pub resolution: NdiResolution,
    pub frame_rate: NdiFrameRate,
    pub alpha_mode: NdiAlphaMode,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[non_exhaustive]
#[derive(Debug, Clone, Error)]
pub enum NdiError {
    #[error("NDI source name must not be empty")]
    EmptySourceName,
    #[error("unable to locate NDI library at {0}")]
    LibraryNotFound(String),
    #[error("failed to load NDI library: {0}")]
    LibraryLoad(String),
    #[error("failed to load symbol {symbol}: {message}")]
    SymbolLoad {
        symbol: &'static str,
        message: String,
    },
    #[error("NDI initialization failed")]
    InitializeFailed,
    #[error("failed to create NDI sender instance")]
    SenderCreateFailed,
    #[error("NDI session is not active")]
    SessionNotActive,
    #[error(
        "frame dimensions do not match active NDI settings ({expected_width}x{expected_height})"
    )]
    FrameDimensionsMismatch {
        expected_width: u32,
        expected_height: u32,
    },
    #[error("frame buffer size is invalid for dimensions {width}x{height}")]
    InvalidFrameBufferSize { width: u32, height: u32 },
}

#[derive(Default)]
pub struct NdiRuntime {
    sessions: std::collections::HashMap<String, ActiveNdiSession>,
}

impl std::fmt::Debug for NdiRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NdiRuntime")
            .field("active_sessions", &self.sessions.len())
            .finish()
    }
}

impl NdiRuntime {
    /// Check if a specific session is active.
    pub fn is_active(&self, session_id: &str) -> bool {
        self.sessions.contains_key(session_id)
    }

    /// Check if any session is active.
    pub fn any_active(&self) -> bool {
        !self.sessions.is_empty()
    }

    pub fn start(
        &mut self,
        session_id: String,
        request: NdiStartRequest,
    ) -> Result<NdiSessionInfo, NdiError> {
        // Stop existing session with this ID if running
        if let Some(existing) = self.sessions.remove(&session_id) {
            log::info!("NDI[{session_id}]: shutting down existing session before restart");
            drop(existing);
        }

        log::info!(
            "NDI[{session_id}]: starting session '{}'",
            request.source_name
        );
        let session = ActiveNdiSession::create(request)?;
        let info = session.info.clone();
        log::info!(
            "NDI[{session_id}]: session active — {}x{} @ {}fps",
            info.width,
            info.height,
            info.fps
        );
        self.sessions.insert(session_id, session);
        Ok(info)
    }

    pub fn stop(&mut self, session_id: &str) {
        if let Some(existing) = self.sessions.remove(session_id) {
            log::info!("NDI[{session_id}]: stopping session");
            drop(existing);
        }
    }

    pub fn stop_all(&mut self) {
        for (id, _session) in self.sessions.drain() {
            log::info!("NDI[{id}]: stopping session");
        }
    }

    pub fn current_info(&self, session_id: &str) -> Option<NdiSessionInfo> {
        self.sessions.get(session_id).map(|s| s.info.clone())
    }

    pub fn send_frame_rgba(
        &mut self,
        session_id: &str,
        width: u32,
        height: u32,
        rgba_data: &[u8],
    ) -> Result<(), NdiError> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or(NdiError::SessionNotActive)?;
        session.send_frame_rgba(width, height, rgba_data)
    }
}

struct ActiveNdiSession {
    _sdk: Arc<NdiSdk>,
    _sender_name: CString,
    sender: NdiSendInstance,
    send_destroy: NdiSendDestroyFn,
    send_video: NdiSendVideoV2Fn,
    info: NdiSessionInfo,
    frame_count: u64,
    frame_buffer: Vec<u8>,
}

// SAFETY: ActiveNdiSession is only accessed behind a Mutex in app state.
// It contains opaque NDI pointers/function pointers and owned buffers.
unsafe impl Send for ActiveNdiSession {}
unsafe impl Sync for ActiveNdiSession {}

// SAFETY: NdiRuntime is stored behind Mutex and only mutated under lock.
unsafe impl Send for NdiRuntime {}
unsafe impl Sync for NdiRuntime {}

impl ActiveNdiSession {
    #[expect(
        clippy::needless_pass_by_value,
        reason = "request fields are destructured and moved into the session"
    )]
    fn create(request: NdiStartRequest) -> Result<Self, NdiError> {
        let source_name = request.source_name.trim().to_string();
        if source_name.is_empty() {
            return Err(NdiError::EmptySourceName);
        }

        let sdk = NdiSdk::global().map_err(map_sdk_error)?;
        let send_create_fn = sdk
            .symbol::<NdiSendCreateFn>(b"NDIlib_send_create\0", "NDIlib_send_create")
            .map_err(map_sdk_error)?;
        let send_destroy_fn = sdk
            .symbol::<NdiSendDestroyFn>(b"NDIlib_send_destroy\0", "NDIlib_send_destroy")
            .map_err(map_sdk_error)?;
        let send_video_fn = sdk
            .symbol::<NdiSendVideoV2Fn>(b"NDIlib_send_send_video_v2\0", "NDIlib_send_send_video_v2")
            .map_err(map_sdk_error)?;

        let name = CString::new(source_name.clone()).map_err(|_| NdiError::EmptySourceName)?;
        let create = NdiSendCreate {
            p_ndi_name: name.as_ptr(),
            p_groups: std::ptr::null(),
            clock_video: false,
            clock_audio: false,
        };

        // SAFETY: send_create_fn is a valid function pointer. The NdiSendCreate struct has valid
        // pointers (name is a CString kept alive by _sender_name field). p_groups is null which
        // NDI accepts.
        let create_ptr = std::ptr::from_ref(&create);
        let sender = unsafe { send_create_fn(create_ptr) };
        if sender.is_null() {
            return Err(NdiError::SenderCreateFailed);
        }

        let (width, height) = request.resolution.dimensions();
        let fps = request.frame_rate.fps();

        Ok(Self {
            _sdk: sdk,
            _sender_name: name,
            sender,
            send_destroy: send_destroy_fn,
            send_video: send_video_fn,
            info: NdiSessionInfo {
                source_name,
                resolution: request.resolution,
                frame_rate: request.frame_rate,
                alpha_mode: request.alpha_mode,
                width,
                height,
                fps,
            },
            frame_buffer: vec![0; (width * height * 4) as usize],
            frame_count: 0,
        })
    }

    fn send_frame_rgba(
        &mut self,
        width: u32,
        height: u32,
        rgba_data: &[u8],
    ) -> Result<(), NdiError> {
        if width != self.info.width || height != self.info.height {
            return Err(NdiError::FrameDimensionsMismatch {
                expected_width: self.info.width,
                expected_height: self.info.height,
            });
        }

        let expected = (width * height * 4) as usize;
        if rgba_data.len() != expected {
            return Err(NdiError::InvalidFrameBufferSize { width, height });
        }

        if self.frame_buffer.len() != expected {
            self.frame_buffer.resize(expected, 0);
        }

        // Convert RGBA -> BGRA for NDIlib_FourCC_type_BGRA.
        #[allow(
            clippy::chunks_exact_to_as_chunks,
            reason = "slice::as_chunks is newer than the crate's Rust 1.85 MSRV"
        )]
        for (idx, px) in rgba_data.chunks_exact(4).enumerate() {
            let offset = idx * 4;
            self.frame_buffer[offset] = px[2];
            self.frame_buffer[offset + 1] = px[1];
            self.frame_buffer[offset + 2] = px[0];
            self.frame_buffer[offset + 3] = match self.info.alpha_mode {
                NdiAlphaMode::NoneOpaque => 255,
                NdiAlphaMode::StraightAlpha | NdiAlphaMode::PremultipliedAlpha => px[3],
            };
        }

        #[expect(
            clippy::cast_possible_wrap,
            reason = "NDI FFI requires i32 for dimensions/rates that are always positive and small"
        )]
        #[expect(
            clippy::cast_precision_loss,
            reason = "NDI FFI requires f32 aspect ratio; u32 dimensions fit in f32 without loss"
        )]
        let frame = NdiVideoFrameV2 {
            xres: width as i32,
            yres: height as i32,
            fourcc: u32::from_le_bytes(*b"BGRA"),
            frame_rate_n: (self.info.fps * 1000) as i32,
            frame_rate_d: 1000,
            picture_aspect_ratio: (width as f32) / (height as f32),
            frame_format_type: 1, // NDIlib_frame_format_type_progressive
            timecode: i64::MAX,   // NDIlib_send_timecode_synthesize
            p_data: self.frame_buffer.as_mut_ptr(),
            line_stride_in_bytes: (width * 4) as i32,
            p_metadata: std::ptr::null(),
            timestamp: 0,
        };

        // SAFETY: sender is a valid NDI send instance. frame points to self.frame_buffer which
        // is correctly sized and will outlive this call.
        let sender = self.sender;
        let frame_ptr = std::ptr::from_ref(&frame);
        unsafe {
            (self.send_video)(sender, frame_ptr);
        }
        self.frame_count += 1;
        if self.frame_count == 1 {
            log::info!(
                "NDI: first frame sent ({width}x{height}, {} bytes)",
                self.frame_buffer.len()
            );
        } else if self.frame_count.is_multiple_of(300) {
            log::info!("NDI: {} frames sent", self.frame_count);
        }
        Ok(())
    }
}

impl Drop for ActiveNdiSession {
    fn drop(&mut self) {
        // SAFETY: sender was created by NDIlib_send_create and is non-null (validated in create()).
        // send_destroy is a valid function pointer loaded from the NDI library.
        // NDIlib_destroy is deliberately process-lifetime: input and output
        // sessions can coexist, and destroying the global SDK from either
        // individual session would invalidate the other session's handles.
        // The shared SDK owner remains alive for the process lifetime.
        let sender = self.sender;
        unsafe {
            (self.send_destroy)(sender);
        }
    }
}

fn map_sdk_error(error: NdiSdkError) -> NdiError {
    match error {
        NdiSdkError::LibraryNotFound(path) => NdiError::LibraryNotFound(path),
        NdiSdkError::LibraryLoad(message) => NdiError::LibraryLoad(message),
        NdiSdkError::SymbolLoad { symbol, message } => NdiError::SymbolLoad { symbol, message },
        NdiSdkError::InitializeFailed => NdiError::InitializeFailed,
    }
}
