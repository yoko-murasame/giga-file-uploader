//! Upload engine — orchestrates file uploads with first-chunk-serial protocol
//! and concurrent chunk uploading with ordered completion.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use tokio::sync::{Mutex, Semaphore};

use crate::api::v1::GigafileApiV1;
use crate::api::{ChunkUploadParams, GigafileApi};
use crate::error::AppError;
use crate::models::file::FileEntry;
use crate::models::upload::*;
use crate::services::chunk_manager;

/// Default concurrent chunk uploads per shard.
pub const DEFAULT_CONCURRENT_CHUNKS: usize = 8;

/// Upload scheduling entry point. Spawns an independent tokio task for each file
/// and returns the list of task IDs immediately (non-blocking).
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    _app: tauri::AppHandle,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
) -> crate::error::Result<Vec<String>> {
    // 1. Discover server
    let server_url = api.discover_server().await?;

    // 2. Create UploadTask for each file and spawn independent tasks
    let mut task_ids = Vec::with_capacity(files.len());

    for file in files {
        let task_id = uuid::Uuid::new_v4().simple().to_string();
        let shards = chunk_manager::plan_chunks(file.file_size);

        // Assign upload_id to each shard
        let shards: Vec<Shard> = shards
            .into_iter()
            .map(|mut s| {
                s.upload_id = uuid::Uuid::new_v4().simple().to_string();
                s
            })
            .collect();

        let task = UploadTask {
            task_id: task_id.clone(),
            file_name: file.file_name.clone(),
            file_path: file.file_path.clone(),
            file_size: file.file_size,
            shards,
            status: UploadStatus::Pending,
            download_url: None,
        };

        // Register cancel flag
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = cancel_flags.lock().await;
            flags.insert(task_id.clone(), cancel_flag.clone());
        }

        // Spawn independent upload task
        let server_url = server_url.clone();
        let config = config.clone();
        let cancel_flags_clone = cancel_flags.clone();
        let task_id_clone = task_id.clone();
        let file_name = file.file_name.clone();
        tokio::spawn(async move {
            let result = upload_file(task, &server_url, &config, cancel_flag).await;
            if let Err(e) = &result {
                log::error!("Upload failed for file '{}': {}", file_name, e);
            }
            // Clean up cancel flag
            let mut flags = cancel_flags_clone.lock().await;
            flags.remove(&task_id_clone);
        });

        task_ids.push(task_id);
    }

    Ok(task_ids)
}

/// Upload all shards for a single file.
async fn upload_file(
    mut task: UploadTask,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: Arc<AtomicBool>,
) -> crate::error::Result<()> {
    task.status = UploadStatus::Uploading;

    for shard in &mut task.shards {
        if cancel_flag.load(Ordering::Relaxed) {
            task.status = UploadStatus::Error;
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }
        upload_shard(
            shard,
            &task.file_path,
            &task.file_name,
            server_url,
            config,
            &cancel_flag,
        )
        .await?;
    }

    // Collect shard download URLs
    if task.shards.len() == 1 {
        task.download_url = task.shards[0].download_url.clone();
    }
    task.status = UploadStatus::Completed;

    Ok(())
}

/// Upload a single shard: first chunk serial (establishes Cookie session),
/// then remaining chunks concurrently with ordered completion.
async fn upload_shard(
    shard: &mut Shard,
    file_path: &str,
    file_name: &str,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: &Arc<AtomicBool>,
) -> crate::error::Result<()> {
    shard.status = ShardStatus::Uploading;
    let cookie_jar = Arc::new(reqwest::cookie::Jar::default());
    let total_chunks = shard.chunks.len() as u32;
    let api = GigafileApiV1::new()?;

    // --- First chunk serial (establish Cookie session) ---
    let first_chunk = &shard.chunks[0];
    let data = read_chunk_data(file_path, first_chunk.offset, first_chunk.size).await?;
    let params = ChunkUploadParams {
        data,
        file_name: file_name.to_string(),
        upload_id: shard.upload_id.clone(),
        chunk_index: 0,
        total_chunks,
        lifetime: config.lifetime,
        server_url: server_url.to_string(),
        cookie_jar: cookie_jar.clone(),
    };
    let resp = api.upload_chunk(params).await?;
    shard.chunks[0].status = ChunkStatus::Completed;

    if total_chunks == 1 {
        shard.download_url = resp.download_url;
        shard.status = ShardStatus::Completed;
        return Ok(());
    }

    // --- Remaining chunks: concurrent upload with ordered completion ---
    let semaphore = Arc::new(Semaphore::new(DEFAULT_CONCURRENT_CHUNKS));
    let completed_counter = Arc::new(AtomicU32::new(1)); // chunk 0 already done
    let mut handles = Vec::new();

    for chunk in &shard.chunks[1..] {
        if cancel_flag.load(Ordering::Relaxed) {
            shard.status = ShardStatus::Error;
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }

        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| AppError::Internal(format!("Semaphore error: {}", e)))?;
        let file_path = file_path.to_string();
        let file_name = file_name.to_string();
        let upload_id = shard.upload_id.clone();
        let server_url = server_url.to_string();
        let cookie_jar = cookie_jar.clone();
        let completed_counter = completed_counter.clone();
        let chunk_index = chunk.chunk_index;
        let chunk_offset = chunk.offset;
        let chunk_size = chunk.size;
        let lifetime = config.lifetime;
        let cancel_flag = cancel_flag.clone();

        let handle = tokio::spawn(async move {
            // Read chunk data
            let data = read_chunk_data(&file_path, chunk_offset, chunk_size).await?;

            // Create API instance and upload
            let api = GigafileApiV1::new()?;
            let params = ChunkUploadParams {
                data,
                file_name,
                upload_id,
                chunk_index,
                total_chunks,
                lifetime,
                server_url,
                cookie_jar,
            };
            let resp = api.upload_chunk(params).await?;

            // Ordered completion: wait for our turn
            loop {
                if cancel_flag.load(Ordering::Relaxed) {
                    return Err(AppError::Internal("Upload cancelled by user".into()));
                }
                if completed_counter.load(Ordering::Acquire) == chunk_index {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            completed_counter.store(chunk_index + 1, Ordering::Release);

            drop(permit);
            Ok::<_, AppError>(resp)
        });

        handles.push((chunk_index, handle));
    }

    // Collect results
    let mut last_url: Option<String> = None;
    for (idx, handle) in handles {
        let resp = handle
            .await
            .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))??;
        if idx == total_chunks - 1 {
            last_url = resp.download_url;
        }
    }

    // Update shard status
    for chunk in &mut shard.chunks[1..] {
        chunk.status = ChunkStatus::Completed;
    }
    shard.download_url = last_url;
    shard.status = ShardStatus::Completed;

    Ok(())
}

/// Read chunk data from file at the specified offset and size.
///
/// Uses spawn_blocking to avoid blocking the tokio runtime.
pub async fn read_chunk_data(
    file_path: &str,
    offset: u64,
    size: u64,
) -> crate::error::Result<Vec<u8>> {
    let file_path = file_path.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = std::fs::File::open(&file_path)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut buf = vec![0u8; size as usize];
        let bytes_read = file.read(&mut buf)?;
        buf.truncate(bytes_read);
        Ok(buf)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking join error: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[tokio::test]
    async fn test_read_chunk_data_from_offset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.bin");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(&[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).unwrap();
        }
        let data = read_chunk_data(path.to_str().unwrap(), 3, 4).await.unwrap();
        assert_eq!(data, vec![3, 4, 5, 6]);
    }

    #[tokio::test]
    async fn test_read_chunk_data_at_file_end() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.bin");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(&[10, 20, 30, 40, 50]).unwrap();
        }
        // Request more bytes than available from offset 3
        let data = read_chunk_data(path.to_str().unwrap(), 3, 100)
            .await
            .unwrap();
        assert_eq!(data, vec![40, 50]);
    }

    #[tokio::test]
    async fn test_read_chunk_data_file_not_found() {
        let result = read_chunk_data("/nonexistent/path/file.bin", 0, 10).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Io(_) => {} // expected
            other => panic!("Expected AppError::Io, got: {:?}", other),
        }
    }

    #[test]
    fn test_uuid_v4_hex_is_32_chars() {
        let id = uuid::Uuid::new_v4().simple().to_string();
        assert_eq!(id.len(), 32);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_default_concurrent_chunks_value() {
        assert_eq!(DEFAULT_CONCURRENT_CHUNKS, 8);
    }
}
