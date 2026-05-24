use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use rhema_bible::BibleDb;
use rhema_detection::{DetectionPipeline, QuotationMatcher, SermonContext};
use rhema_stt::SttProvider;

pub struct AppState {
    pub bible_db: Option<BibleDb>,
    pub detection_pipeline: DetectionPipeline,
    pub sermon_context: SermonContext,
    pub quotation_matcher: QuotationMatcher,
    pub active_translation_id: i64,
    pub audio_active: Arc<AtomicBool>,
    pub stt_active: Arc<AtomicBool>,
    /// Standalone test-capture loop (no STT). Toggled by `start_audio_test` /
    /// `stop_audio_test`. Separate from `audio_active` so the user can probe
    /// the mic while a transcription session is also running.
    pub audio_test_active: Arc<AtomicBool>,
    /// Handle to the currently running STT provider. `stop_transcription` calls
    /// `.stop()` on this to cancel the WS client deterministically, rather than
    /// relying on the audio channel drop to propagate cancellation.
    pub stt_provider: Option<Arc<dyn SttProvider>>,
    #[expect(dead_code, reason = "reserved for future Deepgram key injection")]
    pub deepgram_api_key: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            bible_db: None,
            detection_pipeline: DetectionPipeline::new(),
            sermon_context: SermonContext::new(),
            quotation_matcher: QuotationMatcher::new(),
            active_translation_id: 1, // Default to first translation (KJV)
            audio_active: Arc::new(AtomicBool::new(false)),
            stt_active: Arc::new(AtomicBool::new(false)),
            audio_test_active: Arc::new(AtomicBool::new(false)),
            stt_provider: None,
            deepgram_api_key: None,
        }
    }
}
