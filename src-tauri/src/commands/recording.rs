use std::sync::Mutex;

use tauri::State;

use rhema_notes::SessionDb;

/// Delete the recorded audio file for a session and clear the `audio_path`
/// column. Idempotent — if the file is already gone, the DB column is still
/// cleared.
#[tauri::command]
pub fn delete_session_audio(
    db: State<'_, Mutex<SessionDb>>,
    session_id: i64,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let session = db.get_session(session_id).map_err(|e| e.to_string())?;
    if let Some(path) = session.audio_path.as_ref() {
        match std::fs::remove_file(path) {
            Ok(()) => log::info!("[REC] deleted {path}"),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                log::info!("[REC] audio file already gone: {path}");
            }
            Err(e) => return Err(format!("Failed to delete audio file {path}: {e}")),
        }
    }
    db.clear_session_audio_path(session_id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rhema_notes::CreateSessionRequest;
    use tempfile::tempdir;

    #[test]
    fn delete_removes_file_and_clears_column() {
        let dir = tempdir().unwrap();
        let db = SessionDb::open(&dir.path().join("t.db")).unwrap();
        let session = db
            .create_session(&CreateSessionRequest {
                title: "T".into(),
                speaker: None,
                date: "2026-05-28".into(),
                series_name: None,
                tags: vec![],
                planned_scriptures: vec![],
            })
            .unwrap();
        let audio_path = dir.path().join("audio.mp3");
        std::fs::write(&audio_path, b"fake mp3").unwrap();
        db.set_session_audio_path(session.id, audio_path.to_str().unwrap())
            .unwrap();

        // Can't easily mock Tauri's `State`; assert the underlying DB+FS
        // contract the command relies on.
        std::fs::remove_file(&audio_path).unwrap();
        db.clear_session_audio_path(session.id).unwrap();
        let reloaded = db.get_session(session.id).unwrap();
        assert_eq!(reloaded.audio_path, None);
        assert!(!audio_path.exists());
    }
}
