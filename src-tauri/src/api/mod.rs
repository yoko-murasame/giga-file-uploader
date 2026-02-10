//! gigafile.nu API abstraction layer (NFR6).
//!
//! This module defines the `GigafileApi` trait, which is the sole interface for all
//! HTTP interactions with gigafile.nu. All network requests to the gigafile.nu service
//! MUST be implemented within the `api/` directory. Upper-layer modules (`services/`,
//! `commands/`) call through this trait and never construct HTTP requests directly.
//!
//! This design satisfies NFR6 (API replaceability): when the gigafile.nu API changes,
//! only the implementation within this module needs to be updated.

use std::sync::Arc;

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
    #[test]
    fn module_loads() {
        // Verify the api module can be loaded successfully.
        // Note: GigafileApi trait uses RPITIT (return-position impl Trait in traits),
        // which is not object-safe. A module_loads test is used instead of
        // trait_is_object_safe.
    }
}
