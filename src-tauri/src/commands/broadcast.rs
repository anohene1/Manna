#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command extractors require pass-by-value"
)]

use std::sync::Mutex;

use rhema_broadcast::ndi::{NdiRuntime, NdiSessionInfo, NdiStartRequest};
use rhema_broadcast::ndi_input::{self, NdiInputRuntime, NdiInputSource, NdiInputStatus};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Map `output_id` ("main" | "alt") to Tauri window label.
fn window_label(output_id: &str) -> &'static str {
    match output_id {
        "alt" => "broadcast-alt",
        _ => "broadcast",
    }
}

/// Map `output_id` to broadcast-output.html URL with query param.
fn window_url(output_id: &str) -> String {
    format!("broadcast-output.html?output={output_id}")
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale: f64,
    pub is_primary: bool,
}

#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().ok().flatten();
    // Identify primary by name first (stable, unique even when displays
    // share position via mirroring). Fall back to position when name absent.
    let primary_name = primary.as_ref().and_then(|m| m.name().cloned());
    let primary_pos = primary.as_ref().map(|m| {
        let p = m.position();
        (p.x, p.y)
    });
    let mut found_primary = false;
    Ok(monitors
        .iter()
        .map(|m| {
            let size = m.size();
            let pos = m.position();
            let name = m.name().cloned();
            let mut is_primary = match (&primary_name, &name) {
                (Some(pn), Some(n)) => pn == n,
                _ => primary_pos
                    .map(|(px, py)| px == pos.x && py == pos.y)
                    .unwrap_or(false),
            };
            // Mirroring fallback: if both displays share the primary's name+pos
            // we'd still flag both — clamp to the first match so only one
            // monitor wears the "Primary" badge.
            if is_primary && found_primary {
                is_primary = false;
            }
            if is_primary {
                found_primary = true;
            }
            MonitorInfo {
                name: name.unwrap_or_else(|| "Unknown".to_string()),
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y,
                scale: m.scale_factor(),
                is_primary,
            }
        })
        .collect())
}

/// Ensure the broadcast window for a given output exists (creates hidden if not).
///
/// MUST stay `async`. `WebviewWindowBuilder::build()` deadlocks on Windows
/// when called from a *synchronous* Tauri command — the native window is
/// created but the WebView2 controller never finishes initializing, so the
/// window shows up permanently blank and the command never returns. Async
/// commands run off the main thread, which avoids the deadlock. See the
/// "Known issues" note on `WebviewWindowBuilder::new`.
#[tauri::command]
pub async fn ensure_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
) -> Result<(), String> {
    let label = window_label(&output_id);
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(window_url(&output_id).into()))
        .title(if output_id == "alt" {
            "Manna Broadcast Alt"
        } else {
            "Manna Broadcast"
        })
        .inner_size(1920.0, 1080.0)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    log::info!("[broadcast] hidden broadcast window '{label}' created");
    Ok(())
}

/// Open (or move) the visible projector window on the given monitor.
///
/// MUST stay `async` — see the note on `ensure_broadcast_window`.
/// `WebviewWindowBuilder::build()` deadlocks on Windows when called from a
/// synchronous command, which manifests as a projector window that appears
/// on the right display but stays permanently blank.
#[tauri::command]
pub async fn open_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    monitor_index: usize,
) -> Result<(), String> {
    let label = window_label(&output_id);
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;

    log::info!(
        "[broadcast] open_broadcast_window: requested monitor_index={monitor_index}, available={}",
        monitors.len()
    );
    for (i, m) in monitors.iter().enumerate() {
        let pos = m.position();
        let size = m.size();
        log::info!(
            "[broadcast]   monitor[{i}] name={:?} pos=({},{}) size={}x{} scale={}",
            m.name(),
            pos.x,
            pos.y,
            size.width,
            size.height,
            m.scale_factor()
        );
    }

    let monitor = monitors
        .get(monitor_index)
        .ok_or_else(|| format!("Monitor index {monitor_index} out of range"))?;

    let pos = monitor.position();
    let size = monitor.size();
    log::info!(
        "[broadcast] target monitor pos=({},{}) size={}x{}",
        pos.x,
        pos.y,
        size.width,
        size.height
    );

    // If window already exists, reposition + resize it in place, then re-enter
    // native fullscreen on the (possibly new) target monitor. Toggle off→on so
    // macOS moves the fullscreen Space to the new display when changing monitor.
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_fullscreen(false);
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: pos.x,
                y: pos.y,
            }))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: size.height,
            }))
            .map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().ok();
        // Re-enter fullscreen after the window has been physically moved.
        // See the comment in ensure_broadcast_window on why this blocking
        // dispatcher call runs via spawn_blocking rather than inline.
        let win = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(180)).await;
            let _ = tauri::async_runtime::spawn_blocking(move || win.set_fullscreen(true)).await;
        });
        return Ok(());
    }

    let title = if output_id == "alt" {
        "Projector - Alt"
    } else {
        "Projector - Program"
    };

    // Borderless window sized to the target monitor's full bounds. Lives
    // natively on the target display, then we promote to native fullscreen so
    // the OS menu bar / dock disappear on the projector display.
    //
    // NOTE: WebviewWindowBuilder::position()/inner_size() take LOGICAL pixels,
    // but `pos`/`size` above are PHYSICAL (from Monitor::position()/size()).
    // Feeding physical values straight into the logical-pixel builder places
    // the window at the wrong spot (and wrong size) on any monitor whose
    // scale factor isn't exactly 1.0 — the window then lands off the target
    // display entirely. Convert with the monitor's own scale factor and pass
    // logical values to the builder.
    let scale = monitor.scale_factor();
    let logical_x = f64::from(pos.x) / scale;
    let logical_y = f64::from(pos.y) / scale;
    let logical_w = f64::from(size.width) / scale;
    let logical_h = f64::from(size.height) / scale;

    let window =
        WebviewWindowBuilder::new(&app, label, WebviewUrl::App(window_url(&output_id).into()))
            .title(title)
            .position(logical_x, logical_y)
            .inner_size(logical_w, logical_h)
            .background_throttling(BackgroundThrottlingPolicy::Disabled)
            .decorations(false)
            .resizable(false)
            .always_on_top(false)
            .skip_taskbar(false)
            .focused(true)
            .visible(true)
            .build()
            .map_err(|e| e.to_string())?;

    log::info!("[broadcast] projector window '{label}' created on monitor {monitor_index}");

    // Wait a moment for the window to settle on the target monitor before
    // entering native fullscreen — macOS uses the window's CURRENT screen as
    // the fullscreen target, so we must let the move land first.
    // `set_fullscreen` is a blocking dispatcher call, so run it on the
    // blocking pool rather than inline in this async task.
    let win = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        let _ = tauri::async_runtime::spawn_blocking(move || win.set_fullscreen(true)).await;
    });

    Ok(())
}

#[tauri::command]
pub fn set_broadcast_fullscreen(
    app: tauri::AppHandle,
    output_id: String,
    fullscreen: bool,
) -> Result<(), String> {
    let label = window_label(&output_id);
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Broadcast window '{output_id}' not open"))?;

    if fullscreen {
        // Enter native fullscreen. macOS animates into a fullscreen Space; the
        // chrome is hidden by the OS regardless of decorations flag.
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        // Restore chrome BEFORE exiting fullscreen — on macOS the styleMask
        // applied at exit-time determines whether the restored window has a
        // titlebar and resize handles. Applying these after `set_fullscreen
        // (false)` lands too late and the window stays borderless + locked.
        let _ = window.set_decorations(true);
        let _ = window.set_resizable(true);
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        // Re-apply on the next tick — macOS sometimes drops the styleMask
        // changes during the fullscreen exit animation.
        let win = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let _ = win.set_decorations(true);
                let _ = win.set_resizable(true);
            })
            .await;
        });
    }
    Ok(())
}

#[tauri::command]
pub fn is_broadcast_fullscreen(app: tauri::AppHandle, output_id: String) -> Result<bool, String> {
    let label = window_label(&output_id);
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Broadcast window '{output_id}' not open"))?;
    window.is_fullscreen().map_err(|e| e.to_string())
}

/// True when ANY broadcast window exists for this output — visible projector
/// OR hidden NDI-only window. `goLive` checks this so it never recreates an
/// existing window. NDI-only mode keeps a hidden window alive for capture; we
/// must not silently make it visible on the operator's last-chosen monitor.
#[tauri::command]
pub fn is_broadcast_open(app: tauri::AppHandle, output_id: String) -> bool {
    let label = window_label(&output_id);
    app.get_webview_window(label).is_some()
}

#[tauri::command]
pub fn close_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<(), String> {
    let label = window_label(&output_id);
    if let Some(window) = app.get_webview_window(label) {
        let ndi_active = runtime
            .lock()
            .map_err(|e| e.to_string())?
            .is_active(&output_id);
        if ndi_active {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn start_ndi(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: NdiStartRequest,
) -> Result<NdiSessionInfo, String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime.start(output_id, request).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_ndi(output_id: String, runtime: State<'_, Mutex<NdiRuntime>>) -> Result<(), String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime.stop(&output_id);
    Ok(())
}

#[derive(Serialize)]
pub struct NdiStatusResponse {
    pub active: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[tauri::command]
pub fn get_ndi_status(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<Option<NdiStatusResponse>, String> {
    let runtime = runtime.lock().map_err(|e| e.to_string())?;
    match runtime.current_info(&output_id) {
        Some(info) => Ok(Some(NdiStatusResponse {
            active: true,
            width: info.width,
            height: info.height,
            fps: info.fps,
        })),
        None => Ok(None),
    }
}

/// Push a composited RGBA output frame without JSON/base64 expansion.
/// Packet layout: output byte (0 main, 1 alt), width LE u32, height LE u32, RGBA bytes.
#[tauri::command]
pub fn push_ndi_frame_binary(
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(packet) = request.body() else {
        return Err("binary NDI frame command requires a raw IPC body".to_string());
    };
    if packet.len() < 9 {
        return Err("binary NDI frame header is incomplete".to_string());
    }
    let output_id = if packet[0] == 1 { "alt" } else { "main" };
    let width = u32::from_le_bytes(
        packet[1..5]
            .try_into()
            .map_err(|_| "invalid width header")?,
    );
    let height = u32::from_le_bytes(
        packet[5..9]
            .try_into()
            .map_err(|_| "invalid height header")?,
    );
    let expected = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "binary NDI frame dimensions overflow the platform size".to_string())?;
    if packet.len() - 9 != expected {
        return Err(format!(
            "binary NDI frame has {} bytes; expected {expected}",
            packet.len() - 9
        ));
    }
    runtime
        .lock()
        .map_err(|error| error.to_string())?
        .send_frame_rgba(output_id, width, height, &packet[9..])
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_ndi_sources() -> Result<Vec<NdiInputSource>, String> {
    tauri::async_runtime::spawn_blocking(ndi_input::list_sources)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_ndi_input(
    source_name: String,
    url_address: Option<String>,
    runtime: State<'_, Mutex<NdiInputRuntime>>,
) -> Result<NdiInputStatus, String> {
    runtime
        .lock()
        .map_err(|error| error.to_string())?
        .start(source_name, url_address.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stop_ndi_input(runtime: State<'_, Mutex<NdiInputRuntime>>) -> Result<(), String> {
    runtime.lock().map_err(|error| error.to_string())?.stop();
    Ok(())
}

#[tauri::command]
pub fn get_ndi_input_status(
    runtime: State<'_, Mutex<NdiInputRuntime>>,
) -> Result<NdiInputStatus, String> {
    runtime
        .lock()
        .map_err(|error| error.to_string())?
        .status()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pull_ndi_frame(
    after_sequence: u64,
    runtime: State<'_, Mutex<NdiInputRuntime>>,
) -> Result<Response, String> {
    let packet = runtime
        .lock()
        .map_err(|error| error.to_string())?
        .frame_packet(after_sequence)
        .map_err(|error| error.to_string())?;
    Ok(Response::new(packet))
}
