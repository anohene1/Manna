pub const EVENT_AUDIO_LEVEL: &str = "audio_level";
pub const EVENT_TRANSCRIPT_PARTIAL: &str = "transcript_partial";
pub const EVENT_TRANSCRIPT_FINAL: &str = "transcript_final";

pub const EVENT_AUDIO_TEST_DEVICE: &str = "audio_test_device";
pub const EVENT_AUDIO_TEST_METER: &str = "audio_test_meter";
pub const EVENT_AUDIO_TEST_WAVEFORM: &str = "audio_test_waveform";
pub const EVENT_AUDIO_TEST_STOPPED: &str = "audio_test_stopped";

#[derive(Clone, serde::Serialize)]
pub struct AudioLevelPayload {
    pub rms: f32,
    pub peak: f32,
}

#[derive(Clone, serde::Serialize)]
pub struct TranscriptPayload {
    pub text: String,
    pub is_final: bool,
    pub confidence: f64,
}

/// One-shot payload emitted once when cpal actually opens a device. Lets the
/// UI confirm WHICH device the backend is reading (vs. what the user picked
/// — they can differ on fallback).
#[derive(Clone, serde::Serialize)]
pub struct AudioTestDevicePayload {
    pub requested_id: Option<String>,
    pub actual_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub fell_back: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct AudioTestMeterPayload {
    pub rms: f32,
    pub peak: f32,
    pub rms_db: f32,
    pub peak_db: f32,
}

/// Downsampled waveform window for visualization. ~128 points of normalized
/// f32 in -1.0..=1.0, covering the most recent ~50ms frame.
#[derive(Clone, serde::Serialize)]
pub struct AudioTestWaveformPayload {
    pub samples: Vec<f32>,
}

#[derive(Clone, serde::Serialize)]
pub struct AudioTestStoppedPayload {
    pub reason: String,
}
