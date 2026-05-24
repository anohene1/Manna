#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

use crate::events::{
    AudioTestDevicePayload, AudioTestMeterPayload, AudioTestStoppedPayload,
    AudioTestWaveformPayload, EVENT_AUDIO_TEST_DEVICE, EVENT_AUDIO_TEST_METER,
    EVENT_AUDIO_TEST_STOPPED, EVENT_AUDIO_TEST_WAVEFORM,
};
use crate::state::AppState;
use rhema_audio::{AudioConfig, AudioFrame, DeviceInfo};

/// List all available audio input devices.
#[tauri::command]
pub fn get_audio_devices(
    _state: State<'_, Mutex<AppState>>,
) -> Result<Vec<DeviceInfo>, String> {
    rhema_audio::device::enumerate_devices().map_err(|e| e.to_string())
}

/// Start a standalone audio capture loop for device testing. Reads the same
/// 16 kHz mono i16 samples the STT pipeline would see, computes RMS/peak,
/// downsamples to a small waveform window, and emits both at ~30 Hz. Stops
/// when `stop_audio_test` flips the active flag.
#[tauri::command]
pub fn start_audio_test(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
    device_id: Option<String>,
    gain: Option<f32>,
) -> Result<(), String> {
    let test_active = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        if app_state.audio_test_active.load(Ordering::Relaxed) {
            log::info!("[AUDIO-TEST] already running — no-op");
            return Ok(());
        }
        app_state.audio_test_active.clone()
    };

    let resolved = rhema_audio::device::resolve_actual_device(device_id.as_deref())
        .map_err(|e| e.to_string())?;

    log::info!(
        "[AUDIO-TEST] device='{}' rate={} ch={} fell_back={}",
        resolved.actual_name,
        resolved.sample_rate,
        resolved.channels,
        resolved.fell_back
    );

    let _ = app.emit(
        EVENT_AUDIO_TEST_DEVICE,
        AudioTestDevicePayload {
            requested_id: device_id.clone(),
            actual_name: resolved.actual_name,
            sample_rate: resolved.sample_rate,
            channels: resolved.channels,
            fell_back: resolved.fell_back,
        },
    );

    test_active.store(true, Ordering::SeqCst);

    let gain_val = gain.unwrap_or(1.0).clamp(0.0, 2.0);
    let thread_active = test_active.clone();
    let thread_app = app.clone();

    std::thread::Builder::new()
        .name("audio-test-fanout".into())
        .spawn(move || {
            let config = AudioConfig {
                device_id,
                sample_rate: 16_000,
                gain: gain_val,
            };

            let (tx, rx) = crossbeam_channel::bounded::<AudioFrame>(64);

            let capture = match rhema_audio::capture::start(config, tx) {
                Ok(c) => c,
                Err(e) => {
                    log::error!("[AUDIO-TEST] capture::start failed: {e}");
                    thread_active.store(false, Ordering::SeqCst);
                    let _ = thread_app.emit(
                        EVENT_AUDIO_TEST_STOPPED,
                        AudioTestStoppedPayload { reason: e.to_string() },
                    );
                    return;
                }
            };

            log::info!("[AUDIO-TEST] capture started");

            let mut frame_count: u64 = 0;
            loop {
                if !thread_active.load(Ordering::SeqCst) {
                    break;
                }

                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(frame) => {
                        frame_count = frame_count.wrapping_add(1);

                        // Meter every frame (~30 Hz at typical buffer sizes)
                        let level = rhema_audio::meter::compute_level(&frame.samples);
                        let rms_db = if level.rms > 0.0 {
                            20.0 * level.rms.log10()
                        } else {
                            -120.0
                        };
                        let peak_db = if level.peak > 0.0 {
                            20.0 * level.peak.log10()
                        } else {
                            -120.0
                        };
                        let _ = thread_app.emit(
                            EVENT_AUDIO_TEST_METER,
                            AudioTestMeterPayload {
                                rms: level.rms,
                                peak: level.peak,
                                rms_db,
                                peak_db,
                            },
                        );

                        // Waveform every other frame to keep payload light.
                        // Downsample to 128 points by bucket-peak: preserves
                        // visual transients better than naive decimation.
                        if frame_count % 2 == 0 {
                            let wave = downsample_waveform(&frame.samples, 128);
                            let _ = thread_app.emit(
                                EVENT_AUDIO_TEST_WAVEFORM,
                                AudioTestWaveformPayload { samples: wave },
                            );
                        }
                    }
                    Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                    Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
                }
            }

            capture.stop();
            thread_active.store(false, Ordering::SeqCst);
            log::info!("[AUDIO-TEST] capture stopped");
            let _ = thread_app.emit(
                EVENT_AUDIO_TEST_STOPPED,
                AudioTestStoppedPayload { reason: "user_stop".into() },
            );
        })
        .map_err(|e| {
            test_active.store(false, Ordering::SeqCst);
            format!("spawn audio-test thread: {e}")
        })?;

    Ok(())
}

#[tauri::command]
pub fn stop_audio_test(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;
    app_state
        .audio_test_active
        .store(false, Ordering::SeqCst);
    Ok(())
}

/// Capture `duration_ms` of audio from the mic, write a 16-bit PCM WAV in
/// memory, and return it as a base64 string so the frontend can play it back
/// directly via a Data URL — no temp file, no asset-protocol scope juggling.
/// Useful for "record + play back" sanity checks where the user wants to hear
/// exactly what the cpal pipeline captured.
///
/// Runs its own cpal stream independently of `start_audio_test`, so the user
/// can record while the live meter is also running.
#[tauri::command]
pub async fn record_audio_clip(
    device_id: Option<String>,
    gain: Option<f32>,
    duration_ms: u64,
) -> Result<String, String> {
    let duration_ms = duration_ms.clamp(500, 30_000);
    let gain_val = gain.unwrap_or(1.0).clamp(0.0, 2.0);

    tokio::task::spawn_blocking(move || record_clip_sync(device_id, gain_val, duration_ms))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "duration math operates on bounded values"
)]
fn record_clip_sync(
    device_id: Option<String>,
    gain: f32,
    duration_ms: u64,
) -> Result<String, String> {
    use std::sync::mpsc;

    let (out_tx, out_rx) = mpsc::channel::<Result<String, String>>();

    std::thread::Builder::new()
        .name("audio-clip-recorder".into())
        .spawn(move || {
            let cfg = AudioConfig {
                device_id,
                sample_rate: 16_000,
                gain,
            };
            let (tx, rx) = crossbeam_channel::bounded::<AudioFrame>(64);
            let capture = match rhema_audio::capture::start(cfg, tx) {
                Ok(c) => c,
                Err(e) => {
                    let _ = out_tx.send(Err(format!("capture start: {e}")));
                    return;
                }
            };

            let target_samples = (16_000_u64 * duration_ms / 1000) as usize;
            let hard_deadline = std::time::Instant::now()
                + Duration::from_millis(duration_ms + 2_000);

            let mut buf: Vec<i16> = Vec::with_capacity(target_samples);
            while buf.len() < target_samples
                && std::time::Instant::now() < hard_deadline
            {
                match rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(frame) => buf.extend_from_slice(&frame.samples),
                    Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                    Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
                }
            }
            capture.stop();
            buf.truncate(target_samples);

            let wav = encode_wav_pcm16_mono(&buf, 16_000);
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&wav);

            log::info!(
                "[AUDIO-CLIP] captured {} samples ({:.2}s), {} bytes WAV",
                buf.len(),
                buf.len() as f32 / 16_000.0,
                wav.len()
            );
            let _ = out_tx.send(Ok(b64));
        })
        .map_err(|e| format!("spawn recorder thread: {e}"))?;

    out_rx
        .recv()
        .map_err(|e| format!("recorder channel closed: {e}"))?
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "sample count fits in u32 for realistic recording lengths"
)]
fn encode_wav_pcm16_mono(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let block_align: u16 = channels * (bits_per_sample / 8);
    let byte_rate: u32 = sample_rate * u32::from(block_align);
    let data_size: u32 = (samples.len() * 2) as u32;
    let riff_size: u32 = 36 + data_size;

    let mut out = Vec::with_capacity(44 + samples.len() * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&bits_per_sample.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// Bucket-peak downsample: split `samples` into `target_len` buckets and emit
/// the signed sample with the largest |amplitude| from each bucket, normalized
/// to -1.0..=1.0. Preserves transients (loud spikes) better than averaging,
/// which is what you want for a visual waveform.
#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "audio viz arithmetic — small ranges, intentional truncation"
)]
fn downsample_waveform(samples: &[i16], target_len: usize) -> Vec<f32> {
    if samples.is_empty() || target_len == 0 {
        return Vec::new();
    }
    if samples.len() <= target_len {
        return samples
            .iter()
            .map(|&s| f32::from(s) / f32::from(i16::MAX))
            .collect();
    }

    let bucket = samples.len() as f64 / target_len as f64;
    let mut out = Vec::with_capacity(target_len);
    for i in 0..target_len {
        let start = (i as f64 * bucket) as usize;
        let end = ((i + 1) as f64 * bucket) as usize;
        let end = end.min(samples.len()).max(start + 1);
        let slice = &samples[start..end];

        let mut max_abs: i32 = 0;
        let mut signed: i16 = 0;
        for &s in slice {
            let abs = i32::from(s).abs();
            if abs > max_abs {
                max_abs = abs;
                signed = s;
            }
        }
        out.push(f32::from(signed) / f32::from(i16::MAX));
    }
    out
}
