//! Progress aggregator — tracks upload progress per file and shard,
//! emits `upload:progress` events to the frontend at 50ms intervals.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::Emitter;
use tokio::sync::RwLock;

use crate::models::upload::{Shard, ShardStatus};

/// Progress event emission interval in milliseconds.
pub const PROGRESS_EMIT_INTERVAL_MS: u64 = 50;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub task_id: String,
    pub file_progress: f64,
    pub shards: Vec<ShardProgressPayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardProgressPayload {
    pub shard_index: u32,
    pub progress: f64,
    pub status: String,
}

pub struct ShardProgress {
    pub shard_index: u32,
    pub shard_size: u64,
    pub bytes_uploaded: Arc<AtomicU64>,
    pub status: RwLock<ShardStatus>,
}

pub struct TaskProgress {
    pub task_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub shards: Vec<ShardProgress>,
}

pub struct ProgressAggregator {
    tasks: Arc<RwLock<HashMap<String, TaskProgress>>>,
    app: tauri::AppHandle,
}

impl ProgressAggregator {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            app,
        }
    }

    pub async fn register_task(
        &self,
        task_id: String,
        file_name: String,
        file_size: u64,
        shards: &[Shard],
    ) {
        let shard_progress: Vec<ShardProgress> = shards
            .iter()
            .map(|s| ShardProgress {
                shard_index: s.shard_index,
                shard_size: s.size,
                bytes_uploaded: Arc::new(AtomicU64::new(0)),
                status: RwLock::new(ShardStatus::Pending),
            })
            .collect();

        let mut tasks = self.tasks.write().await;
        tasks.insert(
            task_id.clone(),
            TaskProgress {
                task_id,
                file_name,
                file_size,
                shards: shard_progress,
            },
        );
    }

    pub async fn remove_task(&self, task_id: &str) {
        let mut tasks = self.tasks.write().await;
        tasks.remove(task_id);
    }

    pub async fn get_shard_counter(
        &self,
        task_id: &str,
        shard_index: u32,
    ) -> Option<Arc<AtomicU64>> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).and_then(|t| {
            t.shards
                .iter()
                .find(|s| s.shard_index == shard_index)
                .map(|s| s.bytes_uploaded.clone())
        })
    }

    pub async fn update_shard_status(&self, task_id: &str, shard_index: u32, status: ShardStatus) {
        let tasks = self.tasks.read().await;
        if let Some(task) = tasks.get(task_id) {
            if let Some(shard) = task.shards.iter().find(|s| s.shard_index == shard_index) {
                let mut s = shard.status.write().await;
                *s = status;
            }
        }
    }

    /// Start background emitter that sends progress events every 50ms.
    /// Returns a JoinHandle that stops when all tasks are removed.
    pub fn start_emitter(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(PROGRESS_EMIT_INTERVAL_MS))
                    .await;

                let tasks = this.tasks.read().await;
                if tasks.is_empty() {
                    break;
                }

                for task in tasks.values() {
                    let mut total_bytes: u64 = 0;
                    let mut shard_payloads = Vec::with_capacity(task.shards.len());

                    for shard in &task.shards {
                        let bytes = shard.bytes_uploaded.load(Ordering::Relaxed);
                        total_bytes += bytes;
                        let progress = if shard.shard_size > 0 {
                            (bytes as f64 / shard.shard_size as f64) * 100.0
                        } else {
                            100.0
                        };
                        let status = shard.status.read().await;
                        shard_payloads.push(ShardProgressPayload {
                            shard_index: shard.shard_index,
                            progress,
                            status: shard_status_to_str(&status).to_string(),
                        });
                    }

                    let file_progress = if task.file_size > 0 {
                        (total_bytes as f64 / task.file_size as f64) * 100.0
                    } else {
                        100.0
                    };

                    let _ = this.app.emit(
                        "upload:progress",
                        ProgressPayload {
                            task_id: task.task_id.clone(),
                            file_progress,
                            shards: shard_payloads,
                        },
                    );
                }
            }
        })
    }
}

fn shard_status_to_str(status: &ShardStatus) -> &'static str {
    match status {
        ShardStatus::Pending => "pending",
        ShardStatus::Uploading => "uploading",
        ShardStatus::Completed => "completed",
        ShardStatus::Error => "error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shard_status_to_str_pending() {
        assert_eq!(shard_status_to_str(&ShardStatus::Pending), "pending");
    }

    #[test]
    fn test_shard_status_to_str_uploading() {
        assert_eq!(shard_status_to_str(&ShardStatus::Uploading), "uploading");
    }

    #[test]
    fn test_shard_status_to_str_completed() {
        assert_eq!(shard_status_to_str(&ShardStatus::Completed), "completed");
    }

    #[test]
    fn test_shard_status_to_str_error() {
        assert_eq!(shard_status_to_str(&ShardStatus::Error), "error");
    }

    #[test]
    fn test_progress_payload_serde_camel_case() {
        let payload = ProgressPayload {
            task_id: "t1".to_string(),
            file_progress: 50.0,
            shards: vec![ShardProgressPayload {
                shard_index: 0,
                progress: 50.0,
                status: "uploading".to_string(),
            }],
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"taskId\""));
        assert!(json.contains("\"fileProgress\""));
        assert!(json.contains("\"shardIndex\""));
    }

    #[test]
    fn test_atomic_u64_increment_correctness() {
        let counter = Arc::new(AtomicU64::new(0));
        counter.fetch_add(100, Ordering::Relaxed);
        counter.fetch_add(200, Ordering::Relaxed);
        counter.fetch_add(300, Ordering::Relaxed);
        assert_eq!(counter.load(Ordering::Relaxed), 600);
    }

    #[test]
    fn test_atomic_u64_concurrent_increment() {
        let counter = Arc::new(AtomicU64::new(0));
        let mut handles = vec![];
        for _ in 0..10 {
            let c = counter.clone();
            handles.push(std::thread::spawn(move || {
                for _ in 0..100 {
                    c.fetch_add(1, Ordering::Relaxed);
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::Relaxed), 1000);
    }

    #[tokio::test]
    async fn test_register_task_and_get_shard_counter() {
        // We cannot construct a real AppHandle in tests, so we test
        // the data structures and logic directly.
        let shards = vec![
            Shard {
                shard_index: 0,
                offset: 0,
                size: 1000,
                chunks: vec![],
                upload_id: String::new(),
                status: ShardStatus::Pending,
                download_url: None,
            },
            Shard {
                shard_index: 1,
                offset: 1000,
                size: 500,
                chunks: vec![],
                upload_id: String::new(),
                status: ShardStatus::Pending,
                download_url: None,
            },
        ];

        // Directly test TaskProgress and ShardProgress without AppHandle
        let shard_progress: Vec<ShardProgress> = shards
            .iter()
            .map(|s| ShardProgress {
                shard_index: s.shard_index,
                shard_size: s.size,
                bytes_uploaded: Arc::new(AtomicU64::new(0)),
                status: RwLock::new(ShardStatus::Pending),
            })
            .collect();

        let tasks: Arc<RwLock<HashMap<String, TaskProgress>>> =
            Arc::new(RwLock::new(HashMap::new()));

        // Register
        {
            let mut t = tasks.write().await;
            t.insert(
                "task-1".to_string(),
                TaskProgress {
                    task_id: "task-1".to_string(),
                    file_name: "test.bin".to_string(),
                    file_size: 1500,
                    shards: shard_progress,
                },
            );
        }

        // Get shard counter
        {
            let t = tasks.read().await;
            let task = t.get("task-1").unwrap();
            let counter = task
                .shards
                .iter()
                .find(|s| s.shard_index == 0)
                .map(|s| s.bytes_uploaded.clone());
            assert!(counter.is_some());
            let c = counter.unwrap();
            c.fetch_add(500, Ordering::Relaxed);
            assert_eq!(c.load(Ordering::Relaxed), 500);
        }

        // Get shard counter for index 1
        {
            let t = tasks.read().await;
            let task = t.get("task-1").unwrap();
            let counter = task
                .shards
                .iter()
                .find(|s| s.shard_index == 1)
                .map(|s| s.bytes_uploaded.clone());
            assert!(counter.is_some());
            assert_eq!(counter.unwrap().load(Ordering::Relaxed), 0);
        }

        // Non-existent shard index
        {
            let t = tasks.read().await;
            let task = t.get("task-1").unwrap();
            let counter = task
                .shards
                .iter()
                .find(|s| s.shard_index == 99)
                .map(|s| s.bytes_uploaded.clone());
            assert!(counter.is_none());
        }
    }

    #[tokio::test]
    async fn test_remove_task_cleans_up() {
        let tasks: Arc<RwLock<HashMap<String, TaskProgress>>> =
            Arc::new(RwLock::new(HashMap::new()));

        // Register
        {
            let mut t = tasks.write().await;
            t.insert(
                "task-1".to_string(),
                TaskProgress {
                    task_id: "task-1".to_string(),
                    file_name: "test.bin".to_string(),
                    file_size: 1000,
                    shards: vec![ShardProgress {
                        shard_index: 0,
                        shard_size: 1000,
                        bytes_uploaded: Arc::new(AtomicU64::new(0)),
                        status: RwLock::new(ShardStatus::Pending),
                    }],
                },
            );
        }

        assert!(tasks.read().await.contains_key("task-1"));

        // Remove
        {
            let mut t = tasks.write().await;
            t.remove("task-1");
        }

        assert!(!tasks.read().await.contains_key("task-1"));

        // Get shard counter after remove returns None
        let t = tasks.read().await;
        assert!(t.get("task-1").is_none());
    }

    #[tokio::test]
    async fn test_progress_percentage_calculation() {
        let shard = ShardProgress {
            shard_index: 0,
            shard_size: 1000,
            bytes_uploaded: Arc::new(AtomicU64::new(500)),
            status: RwLock::new(ShardStatus::Uploading),
        };

        let bytes = shard.bytes_uploaded.load(Ordering::Relaxed);
        let progress = (bytes as f64 / shard.shard_size as f64) * 100.0;
        assert!((progress - 50.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_progress_percentage_zero_size_shard() {
        let shard_size: u64 = 0;
        let progress = if shard_size > 0 {
            (0_u64 as f64 / shard_size as f64) * 100.0
        } else {
            100.0
        };
        assert!((progress - 100.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_shard_status_update() {
        let shard = ShardProgress {
            shard_index: 0,
            shard_size: 1000,
            bytes_uploaded: Arc::new(AtomicU64::new(0)),
            status: RwLock::new(ShardStatus::Pending),
        };

        // Initial status
        {
            let s = shard.status.read().await;
            assert_eq!(*s, ShardStatus::Pending);
        }

        // Update to Uploading
        {
            let mut s = shard.status.write().await;
            *s = ShardStatus::Uploading;
        }
        {
            let s = shard.status.read().await;
            assert_eq!(*s, ShardStatus::Uploading);
        }

        // Update to Completed
        {
            let mut s = shard.status.write().await;
            *s = ShardStatus::Completed;
        }
        {
            let s = shard.status.read().await;
            assert_eq!(*s, ShardStatus::Completed);
        }
    }

    #[test]
    fn test_progress_emit_interval_constant() {
        assert_eq!(PROGRESS_EMIT_INTERVAL_MS, 50);
    }
}
