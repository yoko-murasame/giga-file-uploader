//! GigafileApiV1 — concrete implementation of the GigafileApi trait for gigafile.nu.
//!
//! Handles server discovery via HTML scraping and provides stub implementations
//! for upload_chunk and verify_upload (to be completed in Story 3.3).

use regex::Regex;

use super::{
    ChunkUploadParams, ChunkUploadResponse, GigafileApi, VerifyResult, VerifyUploadParams,
};
use crate::error::AppError;

const GIGAFILE_HOME_URL: &str = "https://gigafile.nu/";
const USER_AGENT: &str = "GigaFileUploader/0.1.0";

pub struct GigafileApiV1 {
    client: reqwest::Client,
}

impl GigafileApiV1 {
    pub fn new() -> crate::error::Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;
        Ok(Self { client })
    }

    /// Extract server hostname from gigafile.nu homepage HTML.
    /// Separated as pub(crate) for unit testing without network.
    pub(crate) fn extract_server_from_html(html: &str) -> crate::error::Result<String> {
        let re = Regex::new(r#"var server = "(.+?)""#)
            .map_err(|e| AppError::Internal(format!("Regex compile error: {}", e)))?;
        re.captures(html)
            .and_then(|caps| caps.get(1))
            .map(|m| format!("https://{}", m.as_str()))
            .ok_or_else(|| AppError::Api("Failed to extract server URL from homepage HTML".into()))
    }
}

impl GigafileApi for GigafileApiV1 {
    async fn discover_server(&self) -> crate::error::Result<String> {
        let html = self
            .client
            .get(GIGAFILE_HOME_URL)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        Self::extract_server_from_html(&html)
    }

    async fn upload_chunk(
        &self,
        params: ChunkUploadParams,
    ) -> crate::error::Result<ChunkUploadResponse> {
        // Create a temporary client with the shard's cookie jar
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .cookie_provider(params.cookie_jar.clone())
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build upload client: {}", e)))?;

        // Build multipart form
        let form = reqwest::multipart::Form::new()
            .text("id", params.upload_id)
            .text("name", params.file_name)
            .text("chunk", params.chunk_index.to_string())
            .text("chunks", params.total_chunks.to_string())
            .text("lifetime", params.lifetime.to_string())
            .part(
                "file",
                reqwest::multipart::Part::bytes(params.data)
                    .file_name("blob")
                    .mime_str("application/octet-stream")
                    .map_err(|e| AppError::Internal(format!("MIME parse error: {}", e)))?,
            );

        // POST to upload_chunk.php
        let url = format!("{}/upload_chunk.php", params.server_url);
        let resp = client
            .post(&url)
            .multipart(form)
            .send()
            .await?
            .error_for_status()?;

        // Parse response JSON
        let body: serde_json::Value = resp.json().await?;
        let status = body["status"].as_i64().unwrap_or(-1) as i32;
        let download_url = body["url"].as_str().map(|s| s.to_string());

        if status != 0 {
            return Err(AppError::Api(format!(
                "upload_chunk failed: status={}, response={}",
                status, body
            )));
        }

        Ok(ChunkUploadResponse {
            status,
            download_url,
        })
    }

    async fn verify_upload(
        &self,
        _params: VerifyUploadParams,
    ) -> crate::error::Result<VerifyResult> {
        Err(AppError::Internal(
            "verify_upload not yet implemented -- see Story 3.3".into(),
        ))
    }
}

/// Lightweight connectivity check to gigafile.nu.
///
/// Sends an HTTP HEAD request with a 5-second timeout. Returns `true` if the
/// server responds (any HTTP status), `false` if the request fails (network error,
/// timeout, DNS failure). This is NOT an error condition — offline is a normal
/// application state.
pub async fn check_connectivity() -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client.head(GIGAFILE_HOME_URL).send().await.is_ok()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[test]
    fn test_extract_server_from_html_success() {
        let html = r#"<html><script>var server = "46.gigafile.nu"</script></html>"#;
        let result = GigafileApiV1::extract_server_from_html(html);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "https://46.gigafile.nu");
    }

    #[test]
    fn test_extract_server_from_html_different_server() {
        let html = r#"<script>var server = "99.gigafile.nu"</script>"#;
        let result = GigafileApiV1::extract_server_from_html(html);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "https://99.gigafile.nu");
    }

    #[test]
    fn test_extract_server_from_html_no_server_variable() {
        let html = r#"<html><body>No server variable here</body></html>"#;
        let result = GigafileApiV1::extract_server_from_html(html);
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Api(msg) => {
                assert!(
                    msg.contains("Failed to extract server URL"),
                    "Expected extraction failure message, got: {}",
                    msg
                );
            }
            other => panic!("Expected AppError::Api, got: {:?}", other),
        }
    }

    #[test]
    fn test_extract_server_from_html_empty_string() {
        let result = GigafileApiV1::extract_server_from_html("");
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Api(msg) => {
                assert!(
                    msg.contains("Failed to extract server URL"),
                    "Expected extraction failure message, got: {}",
                    msg
                );
            }
            other => panic!("Expected AppError::Api, got: {:?}", other),
        }
    }

    #[test]
    fn test_new_creates_instance_successfully() {
        let result = GigafileApiV1::new();
        assert!(result.is_ok(), "GigafileApiV1::new() should succeed");
    }

    #[test]
    fn test_chunk_upload_params_construction() {
        let jar = Arc::new(reqwest::cookie::Jar::default());
        let params = super::super::ChunkUploadParams {
            data: vec![0u8; 100],
            file_name: "test.zip".into(),
            upload_id: "a".repeat(32),
            chunk_index: 0,
            total_chunks: 5,
            lifetime: 7,
            server_url: "https://46.gigafile.nu".into(),
            cookie_jar: jar,
        };
        assert_eq!(params.file_name, "test.zip");
        assert_eq!(params.chunk_index, 0);
        assert_eq!(params.total_chunks, 5);
        assert_eq!(params.lifetime, 7);
        assert_eq!(params.data.len(), 100);
    }

    #[test]
    fn test_verify_upload_params_construction() {
        let params = super::super::VerifyUploadParams {
            download_url: "https://gigafile.nu/abc123".into(),
            expected_size: 1024 * 1024,
        };
        assert_eq!(params.download_url, "https://gigafile.nu/abc123");
        assert_eq!(params.expected_size, 1024 * 1024);
    }

    #[test]
    fn test_chunk_upload_response_intermediate_chunk() {
        // Intermediate chunk response: {"status": 0} — no url field
        let body: serde_json::Value = serde_json::from_str(r#"{"status": 0}"#).unwrap();
        let status = body["status"].as_i64().unwrap_or(-1) as i32;
        let download_url = body["url"].as_str().map(|s| s.to_string());

        assert_eq!(status, 0);
        assert!(download_url.is_none());

        let resp = ChunkUploadResponse {
            status,
            download_url,
        };
        assert_eq!(resp.status, 0);
        assert!(resp.download_url.is_none());
    }

    #[test]
    fn test_chunk_upload_response_last_chunk() {
        // Last chunk response: {"status": 0, "url": "https://..."}
        let body: serde_json::Value =
            serde_json::from_str(r#"{"status": 0, "url": "https://46.gigafile.nu/abc123"}"#)
                .unwrap();
        let status = body["status"].as_i64().unwrap_or(-1) as i32;
        let download_url = body["url"].as_str().map(|s| s.to_string());

        assert_eq!(status, 0);
        assert_eq!(
            download_url.as_deref(),
            Some("https://46.gigafile.nu/abc123")
        );

        let resp = ChunkUploadResponse {
            status,
            download_url,
        };
        assert_eq!(resp.status, 0);
        assert_eq!(
            resp.download_url.as_deref(),
            Some("https://46.gigafile.nu/abc123")
        );
    }

    #[test]
    fn test_chunk_upload_response_error_status() {
        // Error response: non-zero status
        let body: serde_json::Value = serde_json::from_str(r#"{"status": 1}"#).unwrap();
        let status = body["status"].as_i64().unwrap_or(-1) as i32;
        assert_ne!(status, 0);
    }

    #[tokio::test]
    async fn test_check_connectivity_compiles_and_returns_bool() {
        // Compilation verification: check_connectivity exists and returns bool.
        // We do NOT assert the result because CI network state is unpredictable.
        let _result: bool = check_connectivity().await;
    }
}
