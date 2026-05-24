use cpal::traits::{DeviceTrait, HostTrait};

use crate::error::AudioError;
use crate::types::DeviceInfo;

/// Enumerate all available audio input devices.
/// The default input device is marked with `is_default: true`.
pub fn enumerate_devices() -> Result<Vec<DeviceInfo>, AudioError> {
    let host = cpal::default_host();

    let default_device_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let input_devices = host
        .input_devices()
        .map_err(|e| AudioError::StreamError(format!("Failed to enumerate input devices: {e}")))?;

    let mut devices = Vec::new();

    for device in input_devices {
        let name = device
            .name()
            .unwrap_or_else(|_| "Unknown Device".to_string());

        let default_config = device
            .default_input_config()
            .map_err(|e| {
                AudioError::StreamError(format!(
                    "Failed to get default config for device '{name}': {e}"
                ))
            })?;

        let is_default = default_device_name
            .as_ref()
            .is_some_and(|dn| dn == &name);

        devices.push(DeviceInfo {
            id: name.clone(),
            name: name.clone(),
            sample_rate: default_config.sample_rate().0,
            channels: default_config.channels(),
            is_default,
        });
    }

    if devices.is_empty() {
        return Err(AudioError::NoInputDevices);
    }

    Ok(devices)
}

/// Metadata for the device cpal *actually* opens for a given requested id.
/// Mirrors the selection rules inside `capture::start` so callers can show
/// the user which device will really be read — especially useful when the
/// requested name isn't present and we fall back to the default.
#[derive(Debug, Clone)]
pub struct ResolvedDevice {
    pub actual_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub fell_back: bool,
}

/// Resolve which input device `capture::start` would open for `requested_id`,
/// without actually starting a stream. `requested_id` is the device name
/// (cpal uses names as ids); `None` or empty means default.
pub fn resolve_actual_device(
    requested_id: Option<&str>,
) -> Result<ResolvedDevice, AudioError> {
    let host = cpal::default_host();

    let (device, fell_back) = match requested_id {
        Some(id) if !id.is_empty() => {
            let mut found = None;
            let input_devices = host.input_devices().map_err(|e| {
                AudioError::StreamError(format!("enumerate devices: {e}"))
            })?;
            for d in input_devices {
                if let Ok(name) = d.name() {
                    if name == id {
                        found = Some(d);
                        break;
                    }
                }
            }
            if let Some(d) = found {
                (d, false)
            } else {
                let d = host
                    .default_input_device()
                    .ok_or(AudioError::NoInputDevices)?;
                (d, true)
            }
        }
        _ => {
            let d = host
                .default_input_device()
                .ok_or(AudioError::NoInputDevices)?;
            (d, false)
        }
    };

    let actual_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
    let cfg = device.default_input_config().map_err(|e| {
        AudioError::StreamError(format!("default_input_config: {e}"))
    })?;

    Ok(ResolvedDevice {
        actual_name,
        sample_rate: cfg.sample_rate().0,
        channels: cfg.channels(),
        fell_back,
    })
}
