use std::ffi::{c_void, CStr, CString};
use std::ptr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};

use jpeg_encoder::{ColorType, Encoder};
use serde::Serialize;
use thiserror::Error;

use crate::ndi_sdk::{NdiSdk, NdiSdkError};

type NdiFindInstance = *mut c_void;
type NdiRecvInstance = *mut c_void;
type NdiFindCreateFn = unsafe extern "C" fn(*const NdiFindCreate) -> NdiFindInstance;
type NdiFindDestroyFn = unsafe extern "C" fn(NdiFindInstance);
type NdiFindWaitFn = unsafe extern "C" fn(NdiFindInstance, u32) -> bool;
type NdiFindSourcesFn = unsafe extern "C" fn(NdiFindInstance, *mut u32) -> *const NdiSource;
type NdiRecvCreateFn = unsafe extern "C" fn(*const NdiRecvCreate) -> NdiRecvInstance;
type NdiRecvDestroyFn = unsafe extern "C" fn(NdiRecvInstance);
type NdiRecvCaptureFn =
    unsafe extern "C" fn(NdiRecvInstance, *mut NdiVideoFrame, *mut c_void, *mut c_void, u32) -> i32;
type NdiRecvFreeVideoFn = unsafe extern "C" fn(NdiRecvInstance, *const NdiVideoFrame);

const FRAME_TYPE_VIDEO: i32 = 1;
const FRAME_TYPE_ERROR: i32 = 4;
const RECV_COLOR_RGBX_RGBA: i32 = 2;
const RECV_BANDWIDTH_HIGHEST: i32 = 100;
const MAX_WIDTH: u32 = 1920;
const MAX_HEIGHT: u32 = 1080;

#[repr(C)]
#[derive(Clone, Copy)]
struct NdiSource {
    name: *const i8,
    url_address: *const i8,
}

#[repr(C)]
struct NdiFindCreate {
    show_local_sources: bool,
    groups: *const i8,
    extra_ips: *const i8,
}

#[repr(C)]
struct NdiRecvCreate {
    source: NdiSource,
    color_format: i32,
    bandwidth: i32,
    allow_video_fields: bool,
    receiver_name: *const i8,
}

#[repr(C)]
#[derive(Default)]
struct NdiVideoFrame {
    xres: i32,
    yres: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    data: *mut u8,
    line_stride_in_bytes: i32,
    metadata: *const i8,
    timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiInputSource {
    pub name: String,
    pub url_address: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiInputStatus {
    pub active: bool,
    pub connected: bool,
    pub source_name: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub sequence: u64,
    pub error: Option<String>,
}

#[derive(Default)]
struct LatestFrame {
    sequence: u64,
    width: u32,
    height: u32,
    jpeg: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum NdiInputError {
    #[error("NDI source name must not be empty")]
    EmptySourceName,
    #[error("unable to locate NDI library at {0}")]
    LibraryNotFound(String),
    #[error("failed to load NDI library: {0}")]
    LibraryLoad(String),
    #[error("failed to load NDI symbol {symbol}: {message}")]
    SymbolLoad {
        symbol: &'static str,
        message: String,
    },
    #[error("NDI initialization failed")]
    InitializeFailed,
    #[error("failed to create NDI finder")]
    FinderCreateFailed,
    #[error("failed to create NDI receiver")]
    ReceiverCreateFailed,
    #[error("NDI input state lock was poisoned")]
    StatePoisoned,
    #[error("JPEG encode failed: {0}")]
    Jpeg(String),
}

pub fn list_sources() -> Result<Vec<NdiInputSource>, NdiInputError> {
    let sdk = NdiSdk::global().map_err(map_sdk_error)?;
    let create = sdk
        .symbol::<NdiFindCreateFn>(b"NDIlib_find_create_v2\0", "NDIlib_find_create_v2")
        .map_err(map_sdk_error)?;
    let destroy = sdk
        .symbol::<NdiFindDestroyFn>(b"NDIlib_find_destroy\0", "NDIlib_find_destroy")
        .map_err(map_sdk_error)?;
    let wait = sdk
        .symbol::<NdiFindWaitFn>(
            b"NDIlib_find_wait_for_sources\0",
            "NDIlib_find_wait_for_sources",
        )
        .map_err(map_sdk_error)?;
    let get_sources = sdk
        .symbol::<NdiFindSourcesFn>(
            b"NDIlib_find_get_current_sources\0",
            "NDIlib_find_get_current_sources",
        )
        .map_err(map_sdk_error)?;
    let settings = NdiFindCreate {
        show_local_sources: true,
        groups: ptr::null(),
        extra_ips: ptr::null(),
    };
    // SAFETY: settings contains only valid values and null optional pointers.
    let finder = unsafe { create(ptr::from_ref(&settings)) };
    if finder.is_null() {
        return Err(NdiInputError::FinderCreateFailed);
    }
    // SAFETY: finder is valid until destroy below. Source strings are copied before destruction.
    unsafe { wait(finder, 700) };
    let mut count = 0_u32;
    // SAFETY: finder is valid and count points to writable memory.
    let sources = unsafe { get_sources(finder, ptr::from_mut(&mut count)) };
    let mut result = Vec::with_capacity(count as usize);
    if !sources.is_null() {
        // SAFETY: the SDK promises `count` contiguous source records until the next finder call.
        for source in unsafe { std::slice::from_raw_parts(sources, count as usize) } {
            let name = c_string(source.name);
            if name.is_empty() {
                continue;
            }
            let url_address = c_string(source.url_address);
            result.push(NdiInputSource {
                name,
                url_address: (!url_address.is_empty()).then_some(url_address),
            });
        }
    }
    // SAFETY: finder was created successfully and is no longer used afterward.
    unsafe { destroy(finder) };
    result.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(result)
}

#[derive(Default)]
pub struct NdiInputRuntime {
    session: Option<ActiveNdiInput>,
}

impl std::fmt::Debug for NdiInputRuntime {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NdiInputRuntime")
            .field("active", &self.session.is_some())
            .finish()
    }
}

impl NdiInputRuntime {
    pub fn start(
        &mut self,
        source_name: String,
        url_address: Option<&str>,
    ) -> Result<NdiInputStatus, NdiInputError> {
        self.stop();
        let session = ActiveNdiInput::start(source_name, url_address)?;
        let status = session.status()?;
        self.session = Some(session);
        Ok(status)
    }

    pub fn stop(&mut self) {
        if let Some(mut session) = self.session.take() {
            session.stop();
        }
    }

    pub fn status(&self) -> Result<NdiInputStatus, NdiInputError> {
        self.session
            .as_ref()
            .map_or_else(|| Ok(NdiInputStatus::default()), ActiveNdiInput::status)
    }

    pub fn frame_packet(&self, after_sequence: u64) -> Result<Vec<u8>, NdiInputError> {
        let Some(session) = &self.session else {
            return Ok(Vec::new());
        };
        let latest = session
            .latest
            .lock()
            .map_err(|_| NdiInputError::StatePoisoned)?;
        Ok(build_frame_packet(&latest, after_sequence))
    }
}

fn build_frame_packet(latest: &LatestFrame, after_sequence: u64) -> Vec<u8> {
    if latest.sequence <= after_sequence || latest.jpeg.is_empty() {
        return Vec::new();
    }
    let mut packet = Vec::with_capacity(20 + latest.jpeg.len());
    packet.extend_from_slice(b"MNDF");
    packet.extend_from_slice(&latest.sequence.to_le_bytes());
    packet.extend_from_slice(&latest.width.to_le_bytes());
    packet.extend_from_slice(&latest.height.to_le_bytes());
    packet.extend_from_slice(&latest.jpeg);
    packet
}

impl Drop for NdiInputRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

struct ActiveNdiInput {
    stop: Arc<AtomicBool>,
    latest: Arc<Mutex<LatestFrame>>,
    status: Arc<Mutex<NdiInputStatus>>,
    thread: Option<JoinHandle<()>>,
}

impl ActiveNdiInput {
    fn start(source_name: String, url_address: Option<&str>) -> Result<Self, NdiInputError> {
        if source_name.trim().is_empty() {
            return Err(NdiInputError::EmptySourceName);
        }
        let worker = NdiReceiverWorker::create(&source_name, url_address)?;
        let stop = Arc::new(AtomicBool::new(false));
        let latest = Arc::new(Mutex::new(LatestFrame::default()));
        let status = Arc::new(Mutex::new(NdiInputStatus {
            active: true,
            source_name: Some(source_name),
            ..NdiInputStatus::default()
        }));
        let thread_stop = Arc::clone(&stop);
        let thread_latest = Arc::clone(&latest);
        let thread_status = Arc::clone(&status);
        let handle = thread::Builder::new()
            .name("manna-ndi-input".to_string())
            .spawn(move || worker.run(&thread_stop, &thread_latest, &thread_status))
            .map_err(|error| NdiInputError::LibraryLoad(error.to_string()))?;
        Ok(Self {
            stop,
            latest,
            status,
            thread: Some(handle),
        })
    }

    fn status(&self) -> Result<NdiInputStatus, NdiInputError> {
        self.status
            .lock()
            .map(|status| status.clone())
            .map_err(|_| NdiInputError::StatePoisoned)
    }

    fn stop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = self.thread.take() {
            if handle.join().is_err() {
                log::warn!("NDI input thread panicked during shutdown");
            }
        }
    }
}

struct NdiReceiverWorker {
    _sdk: Arc<NdiSdk>,
    _source_name: CString,
    _url_address: Option<CString>,
    receiver: NdiRecvInstance,
    destroy: NdiRecvDestroyFn,
    capture: NdiRecvCaptureFn,
    free_video: NdiRecvFreeVideoFn,
}

// SAFETY: the opaque receiver is created before the move, then used and destroyed only on its worker thread.
unsafe impl Send for NdiReceiverWorker {}

impl NdiReceiverWorker {
    fn create(source_name: &str, url_address: Option<&str>) -> Result<Self, NdiInputError> {
        let sdk = NdiSdk::global().map_err(map_sdk_error)?;
        let create = sdk
            .symbol::<NdiRecvCreateFn>(b"NDIlib_recv_create_v3\0", "NDIlib_recv_create_v3")
            .map_err(map_sdk_error)?;
        let destroy = sdk
            .symbol::<NdiRecvDestroyFn>(b"NDIlib_recv_destroy\0", "NDIlib_recv_destroy")
            .map_err(map_sdk_error)?;
        let capture = sdk
            .symbol::<NdiRecvCaptureFn>(b"NDIlib_recv_capture_v2\0", "NDIlib_recv_capture_v2")
            .map_err(map_sdk_error)?;
        let free_video = sdk
            .symbol::<NdiRecvFreeVideoFn>(
                b"NDIlib_recv_free_video_v2\0",
                "NDIlib_recv_free_video_v2",
            )
            .map_err(map_sdk_error)?;
        let source_name = CString::new(source_name).map_err(|_| NdiInputError::EmptySourceName)?;
        let url_address = url_address
            .filter(|value| !value.is_empty())
            .map(CString::new)
            .transpose()
            .map_err(|_| NdiInputError::EmptySourceName)?;
        let source = NdiSource {
            name: source_name.as_ptr(),
            url_address: url_address
                .as_ref()
                .map_or(ptr::null(), |value| value.as_ptr()),
        };
        let settings = NdiRecvCreate {
            source,
            color_format: RECV_COLOR_RGBX_RGBA,
            bandwidth: RECV_BANDWIDTH_HIGHEST,
            allow_video_fields: false,
            receiver_name: ptr::null(),
        };
        // SAFETY: the source CStrings remain owned by the returned worker for the receiver lifetime.
        let receiver = unsafe { create(ptr::from_ref(&settings)) };
        if receiver.is_null() {
            return Err(NdiInputError::ReceiverCreateFailed);
        }
        Ok(Self {
            _sdk: sdk,
            _source_name: source_name,
            _url_address: url_address,
            receiver,
            destroy,
            capture,
            free_video,
        })
    }

    fn run(self, stop: &AtomicBool, latest: &Mutex<LatestFrame>, status: &Mutex<NdiInputStatus>) {
        while !stop.load(Ordering::Acquire) {
            let mut frame = NdiVideoFrame::default();
            // SAFETY: receiver belongs exclusively to this thread. Audio and metadata are intentionally null.
            let frame_type = unsafe {
                (self.capture)(
                    self.receiver,
                    ptr::from_mut(&mut frame),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    100,
                )
            };
            if frame_type == FRAME_TYPE_VIDEO {
                let result = encode_frame(&frame);
                // SAFETY: every captured video frame is returned exactly once to the same receiver.
                unsafe { (self.free_video)(self.receiver, ptr::from_ref(&frame)) };
                match result {
                    Ok((jpeg, width, height)) => {
                        let fps = frame_rate(&frame);
                        let sequence = if let Ok(mut latest) = latest.lock() {
                            latest.sequence = latest.sequence.saturating_add(1);
                            latest.width = width;
                            latest.height = height;
                            latest.jpeg = jpeg;
                            latest.sequence
                        } else {
                            break;
                        };
                        if let Ok(mut status) = status.lock() {
                            status.connected = true;
                            status.width = Some(width);
                            status.height = Some(height);
                            status.fps = fps;
                            status.sequence = sequence;
                            status.error = None;
                        }
                    }
                    Err(error) => set_status_error(status, error.to_string()),
                }
            } else if frame_type == FRAME_TYPE_ERROR {
                set_status_error(status, "NDI source disconnected".to_string());
            }
        }
        if let Ok(mut status) = status.lock() {
            status.active = false;
            status.connected = false;
        }
    }
}

impl Drop for NdiReceiverWorker {
    fn drop(&mut self) {
        // SAFETY: receiver was created by this SDK instance and is destroyed once after capture stops.
        unsafe { (self.destroy)(self.receiver) };
    }
}

fn set_status_error(status: &Mutex<NdiInputStatus>, error: String) {
    if let Ok(mut status) = status.lock() {
        status.connected = false;
        status.error = Some(error);
    }
}

fn frame_rate(frame: &NdiVideoFrame) -> Option<u32> {
    if frame.frame_rate_n <= 0 || frame.frame_rate_d <= 0 {
        return None;
    }
    let numerator = u64::try_from(frame.frame_rate_n).ok()?;
    let denominator = u64::try_from(frame.frame_rate_d).ok()?;
    let rounded = (numerator + denominator / 2) / denominator;
    u32::try_from(rounded).ok()
}

fn encode_frame(frame: &NdiVideoFrame) -> Result<(Vec<u8>, u32, u32), NdiInputError> {
    let (rgb, width, height) = frame_rgb_pixels(frame)?;
    let jpeg_width = u16::try_from(width)
        .map_err(|_| NdiInputError::Jpeg("frame width exceeds JPEG limits".to_string()))?;
    let jpeg_height = u16::try_from(height)
        .map_err(|_| NdiInputError::Jpeg("frame height exceeds JPEG limits".to_string()))?;
    let mut jpeg = Vec::with_capacity(width as usize * height as usize / 3);
    Encoder::new(&mut jpeg, 82)
        .encode(&rgb, jpeg_width, jpeg_height, ColorType::Rgb)
        .map_err(|error| NdiInputError::Jpeg(error.to_string()))?;
    Ok((jpeg, width, height))
}

fn frame_rgb_pixels(frame: &NdiVideoFrame) -> Result<(Vec<u8>, u32, u32), NdiInputError> {
    if frame.xres <= 0 || frame.yres <= 0 || frame.data.is_null() || frame.line_stride_in_bytes == 0
    {
        return Err(NdiInputError::Jpeg("invalid video frame".to_string()));
    }
    let source_width = u32::try_from(frame.xres)
        .map_err(|_| NdiInputError::Jpeg("invalid video frame width".to_string()))?;
    let source_height = u32::try_from(frame.yres)
        .map_err(|_| NdiInputError::Jpeg("invalid video frame height".to_string()))?;
    let (width, height) = bounded_dimensions(source_width, source_height);
    let stride = frame.line_stride_in_bytes.unsigned_abs() as usize;
    if stride < source_width as usize * 4 {
        return Err(NdiInputError::Jpeg(
            "video frame stride is too small".to_string(),
        ));
    }
    let source_len = stride.saturating_mul(source_height as usize);
    // SAFETY: the NDI SDK guarantees frame.data covers stride * height bytes until free_video is called.
    let source = unsafe { std::slice::from_raw_parts(frame.data, source_len) };
    let mut rgb = vec![0_u8; width as usize * height as usize * 3];
    for y in 0..height as usize {
        let source_y = y * source_height as usize / height as usize;
        let row = if frame.line_stride_in_bytes < 0 {
            source_height as usize - 1 - source_y
        } else {
            source_y
        };
        for x in 0..width as usize {
            let source_x = x * source_width as usize / width as usize;
            let source_offset = row * stride + source_x * 4;
            let target_offset = (y * width as usize + x) * 3;
            rgb[target_offset..target_offset + 3]
                .copy_from_slice(&source[source_offset..source_offset + 3]);
        }
    }
    Ok((rgb, width, height))
}

fn bounded_dimensions(source_width: u32, source_height: u32) -> (u32, u32) {
    if source_width <= MAX_WIDTH && source_height <= MAX_HEIGHT {
        return (source_width, source_height);
    }
    let source_width_64 = u64::from(source_width);
    let source_height_64 = u64::from(source_height);
    if source_width_64 * u64::from(MAX_HEIGHT) >= source_height_64 * u64::from(MAX_WIDTH) {
        let height = (source_height_64 * u64::from(MAX_WIDTH) / source_width_64).max(1);
        (MAX_WIDTH, u32::try_from(height).unwrap_or(MAX_HEIGHT))
    } else {
        let width = (source_width_64 * u64::from(MAX_HEIGHT) / source_height_64).max(1);
        (u32::try_from(width).unwrap_or(MAX_WIDTH), MAX_HEIGHT)
    }
}

fn c_string(pointer: *const i8) -> String {
    if pointer.is_null() {
        return String::new();
    }
    // SAFETY: NDI source fields are documented as null-terminated UTF-8 strings.
    unsafe { CStr::from_ptr(pointer) }
        .to_string_lossy()
        .into_owned()
}

fn map_sdk_error(error: NdiSdkError) -> NdiInputError {
    match error {
        NdiSdkError::LibraryNotFound(path) => NdiInputError::LibraryNotFound(path),
        NdiSdkError::LibraryLoad(message) => NdiInputError::LibraryLoad(message),
        NdiSdkError::SymbolLoad { symbol, message } => {
            NdiInputError::SymbolLoad { symbol, message }
        }
        NdiSdkError::InitializeFailed => NdiInputError::InitializeFailed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_packet_is_empty_when_no_new_frame_exists() {
        let runtime = NdiInputRuntime::default();
        assert!(runtime.frame_packet(0).expect("packet lookup").is_empty());
    }

    #[test]
    fn frame_rate_returns_rounded_progressive_rate() {
        let frame = NdiVideoFrame {
            frame_rate_n: 30_000,
            frame_rate_d: 1_001,
            ..NdiVideoFrame::default()
        };
        assert_eq!(frame_rate(&frame), Some(30));
    }

    #[test]
    fn frame_packet_contains_sequence_dimensions_and_jpeg() {
        let packet = build_frame_packet(
            &LatestFrame {
                sequence: 9,
                width: 1280,
                height: 720,
                jpeg: vec![0xff, 0xd8, 0xff],
            },
            8,
        );
        let mut expected = b"MNDF".to_vec();
        expected.extend_from_slice(&9_u64.to_le_bytes());
        expected.extend_from_slice(&1280_u32.to_le_bytes());
        expected.extend_from_slice(&720_u32.to_le_bytes());
        assert_eq!(&packet[..20], expected.as_slice());
    }

    #[test]
    fn frame_packet_drops_already_consumed_sequence() {
        let latest = LatestFrame {
            sequence: 4,
            jpeg: vec![1],
            ..LatestFrame::default()
        };
        assert!(build_frame_packet(&latest, 4).is_empty());
    }

    #[test]
    fn rgbx_pixels_are_converted_to_rgb() {
        let mut pixels = vec![10, 20, 30, 255, 40, 50, 60, 255];
        let frame = NdiVideoFrame {
            xres: 2,
            yres: 1,
            data: pixels.as_mut_ptr(),
            line_stride_in_bytes: 8,
            ..NdiVideoFrame::default()
        };
        let (rgb, width, height) = frame_rgb_pixels(&frame).expect("pixel conversion");
        assert_eq!((width, height), (2, 1));
        assert_eq!(rgb, vec![10, 20, 30, 40, 50, 60]);
    }

    #[test]
    fn latest_frame_storage_replaces_instead_of_queueing() {
        let mut latest = LatestFrame {
            sequence: 1,
            jpeg: vec![1, 2, 3],
            ..LatestFrame::default()
        };
        latest.sequence = 2;
        latest.jpeg = vec![4, 5];
        let packet = build_frame_packet(&latest, 1);
        assert_eq!(&packet[20..], &[4, 5]);
    }
}
