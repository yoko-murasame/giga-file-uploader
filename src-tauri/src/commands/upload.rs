//! Tauri IPC command handlers for upload lifecycle.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::api::v1::GigafileApiV1;
use crate::models::file::FileEntry;
use crate::models::upload::UploadConfig;
use crate::services::progress::ProgressAggregator;
use crate::services::upload_engine;

/// Tauri managed state for upload lifecycle.
pub struct UploadState {
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub progress: Arc<ProgressAggregator>,
}

impl UploadState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
            progress: Arc::new(ProgressAggregator::new(app)),
        }
    }
}

#[tauri::command]
pub async fn start_upload(
    files: Vec<FileEntry>,
    config: UploadConfig,
    app: tauri::AppHandle,
    state: tauri::State<'_, UploadState>,
) -> Result<Vec<String>, String> {
    let api = GigafileApiV1::new().map_err(|e| e.to_string())?;
    upload_engine::start(
        files,
        config,
        &api,
        app,
        state.cancel_flags.clone(),
        state.progress.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_upload(
    task_id: String,
    state: tauri::State<'_, UploadState>,
) -> Result<(), String> {
    let flags = state.cancel_flags.lock().await;
    match flags.get(&task_id) {
        Some(flag) => {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
            Ok(())
        }
        None => Err(format!("No active upload task with id: {}", task_id)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    /// Helper to create cancel_flags for testing without requiring AppHandle.
    fn test_cancel_flags() -> Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> {
        Arc::new(Mutex::new(HashMap::new()))
    }

    #[test]
    fn test_cancel_flags_initially_empty() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let flags = test_cancel_flags();
            let f = flags.lock().await;
            assert!(f.is_empty());
        });
    }

    #[test]
    fn test_cancel_flag_set_and_read() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let flags = test_cancel_flags();
            let flag = Arc::new(AtomicBool::new(false));
            {
                let mut f = flags.lock().await;
                f.insert("task-1".to_string(), flag.clone());
            }
            assert!(!flag.load(Ordering::Relaxed));
            flag.store(true, Ordering::Relaxed);
            assert!(flag.load(Ordering::Relaxed));
        });
    }
}
