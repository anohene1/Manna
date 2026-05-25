#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use rhema_broadcast::ndi::{NdiRuntime, NdiSessionInfo, NdiStartRequest};

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiFrameRequest {
    pub output_id: String,
    pub width: u32,
    pub height: u32,
    pub rgba_base64: String,
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
#[tauri::command]
pub fn ensure_broadcast_window(app: tauri::AppHandle, output_id: String) -> Result<(), String> {
    let label = window_label(&output_id);
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App(window_url(&output_id).into()),
    )
    .title(if output_id == "alt" { "Manna Broadcast Alt" } else { "Manna Broadcast" })
    .inner_size(1920.0, 1080.0)
    .visible(false)
    .skip_taskbar(true)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_broadcast_window(
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
        pos.x, pos.y, size.width, size.height
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
        let win = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(180)).await;
            let _ = win.set_fullscreen(true);
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
    let window = WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App(window_url(&output_id).into()),
    )
    .title(title)
    .position(f64::from(pos.x), f64::from(pos.y))
    .inner_size(f64::from(size.width), f64::from(size.height))
    .decorations(false)
    .resizable(false)
    .always_on_top(false)
    .skip_taskbar(false)
    .focused(true)
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;

    // Wait a moment for the window to settle on the target monitor before
    // entering native fullscreen — macOS uses the window's CURRENT screen as
    // the fullscreen target, so we must let the move land first.
    let win = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        let _ = win.set_fullscreen(true);
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
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| e.to_string())?;
    if fullscreen {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn is_broadcast_fullscreen(
    app: tauri::AppHandle,
    output_id: String,
) -> Result<bool, String> {
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
    runtime
        .start(output_id, request)
        .map_err(|e| e.to_string())
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

#[tauri::command]
pub fn push_ndi_frame(
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: NdiFrameRequest,
) -> Result<(), String> {
    let rgba_data = base64::engine::general_purpose::STANDARD
        .decode(&request.rgba_base64)
        .map_err(|e| format!("base64 decode error: {e}"))?;
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime
        .send_frame_rgba(&request.output_id, request.width, request.height, &rgba_data)
        .map_err(|e| e.to_string())
}
