//! gigafile.nu API abstraction layer (NFR6).
//!
//! This module defines the `GigafileApi` trait, which is the sole interface for all
//! HTTP interactions with gigafile.nu. All network requests to the gigafile.nu service
//! MUST be implemented within the `api/` directory. Upper-layer modules (`services/`,
//! `commands/`) call through this trait and never construct HTTP requests directly.
//!
//! This design satisfies NFR6 (API replaceability): when the gigafile.nu API changes,
//! only the implementation within this module needs to be updated.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::Notify;

use crate::error::AppError;

#[derive(Debug)]
pub struct ChunkUploadParams {
    pub data: Vec<u8>,
    pub file_name: String,
    pub upload_id: String,
    pub chunk_index: u32,
    pub total_chunks: u32,
    pub lifetime: u32,
    pub server_url: String,
    pub cookie_jar: Arc<reqwest::cookie::Jar>,
    pub progress_counter: Option<Arc<AtomicU64>>,
    pub ordered_completion_gate: Option<UploadOrderGate>,
}

#[derive(Debug, Clone)]
pub struct UploadOrderGate {
    next_chunk_to_complete: Arc<AtomicU32>,
    notify: Arc<Notify>,
}

impl UploadOrderGate {
    pub fn new(start_chunk_index: u32) -> Self {
        Self {
            next_chunk_to_complete: Arc::new(AtomicU32::new(start_chunk_index)),
            notify: Arc::new(Notify::new()),
        }
    }

    pub async fn wait_turn(&self, chunk_index: u32) {
        loop {
            if self.next_chunk_to_complete.load(Ordering::Acquire) == chunk_index {
                return;
            }
            self.notify.notified().await;
        }
    }

    pub fn complete_turn(&self, chunk_index: u32) {
        self.next_chunk_to_complete
            .store(chunk_index + 1, Ordering::Release);
        self.notify.notify_waiters();
    }
}

#[derive(Debug)]
pub struct ChunkUploadResponse {
    pub status: i32,
    pub download_url: Option<String>,
}

#[derive(Debug)]
pub struct VerifyUploadParams {
    pub download_url: String,
    pub expected_size: u64,
}

#[derive(Debug)]
pub struct VerifyResult {
    pub is_valid: bool,
    pub remote_size: u64,
}

/// Abstraction trait for gigafile.nu API interactions.
///
/// All HTTP communication with gigafile.nu is encapsulated behind this trait.
/// The current implementation is `GigafileApiV1` (Story 3.1). When the API changes,
/// a new implementation can be swapped in without affecting upper layers.
pub trait GigafileApi: Send + Sync {
    /// Discover the currently active upload server URL.
    ///
    /// Extracts the active upload server from the gigafile.nu homepage HTML.
    /// Must be called before each upload session; server URLs are never hardcoded (NFR8).
    fn discover_server(
        &self,
    ) -> impl std::future::Future<Output = std::result::Result<String, AppError>> + Send;

    /// Upload a single data chunk to the server.
    ///
    /// The first chunk of each shard must be sent serially to establish the server-side
    /// Cookie session. Subsequent chunks can be sent in parallel.
    fn upload_chunk(
        &self,
        params: ChunkUploadParams,
    ) -> impl std::future::Future<Output = std::result::Result<ChunkUploadResponse, AppError>> + Send;

    /// Verify that an upload is complete and retrieve the download URL.
    ///
    /// Called after all chunks of a shard have been uploaded to confirm completion
    /// and obtain the gigafile.nu download link.
    fn verify_upload(
        &self,
        params: VerifyUploadParams,
    ) -> impl std::future::Future<Output = std::result::Result<VerifyResult, AppError>> + Send;
}

pub mod v1;

#[cfg(test)]
mod tests {
    use super::UploadOrderGate;

    #[test]
    fn module_loads() {
        // Verify the api module can be loaded successfully.
        // Note: GigafileApi trait uses RPITIT (return-position impl Trait in traits),
        // which is not object-safe. A module_loads test is used instead of
        // trait_is_object_safe.
    }

    #[tokio::test]
    async fn test_upload_order_gate_blocks_until_turn() {
        let gate = UploadOrderGate::new(1);
        let waiter_gate = gate.clone();

        let waiter = tokio::spawn(async move {
            waiter_gate.wait_turn(2).await;
        });

        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert!(!waiter.is_finished());

        gate.complete_turn(1);

        tokio::time::timeout(std::time::Duration::from_millis(200), waiter)
            .await
            .expect("waiter should complete after previous turn is released")
            .expect("waiter task should not panic");
    }

    #[tokio::test]
    async fn test_upload_order_gate_immediate_when_turn_matches() {
        let gate = UploadOrderGate::new(3);
        tokio::time::timeout(std::time::Duration::from_millis(100), gate.wait_turn(3))
            .await
            .expect("wait_turn should return immediately for current turn");
    }
}
