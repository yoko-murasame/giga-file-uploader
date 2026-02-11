//! Retry engine — exponential backoff with jitter for upload chunk retries.
//!
//! Wraps upload chunk operations with automatic retry on transient errors
//! (network failures, 5xx server errors). Silent below warning threshold (50),
//! emits `upload:retry-warning` Tauri events above threshold.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::Emitter;

use crate::error::AppError;

/// Default initial backoff delay in milliseconds.
pub const DEFAULT_INITIAL_DELAY_MS: u64 = 200;
/// Default maximum backoff delay in milliseconds (30 seconds).
pub const DEFAULT_MAX_DELAY_MS: u64 = 30_000;
/// Default retry count threshold for emitting warning events.
pub const DEFAULT_WARNING_THRESHOLD: u32 = 50;
/// Warning event throttle interval (emit every N retries after threshold).
const WARNING_THROTTLE_INTERVAL: u32 = 10;

/// Retry warning event payload sent to frontend via Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryWarningPayload {
    pub task_id: String,
    pub file_name: String,
    pub retry_count: u32,
    pub error_message: String,
}

/// Upload error event payload sent to frontend via Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadErrorPayload {
    pub task_id: String,
    pub file_name: String,
    pub error_message: String,
}

/// Retry policy configuration.
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub warning_threshold: u32,
    pub max_retries: Option<u32>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            initial_delay_ms: DEFAULT_INITIAL_DELAY_MS,
            max_delay_ms: DEFAULT_MAX_DELAY_MS,
            warning_threshold: DEFAULT_WARNING_THRESHOLD,
            max_retries: None,
        }
    }
}

/// Check whether an error is retryable.
///
/// Network errors are always retryable. API errors are retryable only
/// for 5xx server errors. All other errors (Io, Storage, Internal) are not.
pub fn is_retryable(err: &AppError) -> bool {
    match err {
        AppError::Network(_) => true,
        AppError::Api(msg) => {
            // Check for 5xx status codes in the error message
            msg.contains("status=5")
                || msg.contains("500")
                || msg.contains("502")
                || msg.contains("503")
                || msg.contains("504")
        }
        AppError::Io(_) | AppError::Storage(_) | AppError::Internal(_) => false,
    }
}

/// Calculate exponential backoff delay with +/-10% jitter.
pub fn calculate_delay(attempt: u32, policy: &RetryPolicy) -> u64 {
    let base = policy
        .initial_delay_ms
        .saturating_mul(1u64 << attempt.min(31));
    let capped = base.min(policy.max_delay_ms);
    // Add +/-10% jitter
    let jitter_range = capped / 10;
    if jitter_range == 0 {
        return capped;
    }
    // Simple deterministic-ish jitter using attempt as seed
    let jitter = (attempt as u64 * 7 + 13) % (jitter_range * 2 + 1);
    capped - jitter_range + jitter
}

/// Whether a warning event should be emitted at this retry count.
///
/// Fires at threshold (50), then every 10 retries (60, 70, 80...).
pub fn should_emit_warning(attempt: u32, threshold: u32) -> bool {
    attempt >= threshold
        && (attempt == threshold || (attempt - threshold).is_multiple_of(WARNING_THROTTLE_INTERVAL))
}

/// Retry an upload chunk operation with exponential backoff.
///
/// Wraps a fallible async upload operation. On retryable errors, automatically
/// retries with exponential backoff. Emits `upload:retry-warning` events when
/// retry count exceeds the warning threshold.
pub async fn retry_upload_chunk<F, Fut, T>(
    policy: &RetryPolicy,
    cancel_flag: &Arc<AtomicBool>,
    app: &tauri::AppHandle,
    task_id: &str,
    file_name: &str,
    chunk_index: u32,
    mut operation: F,
) -> crate::error::Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = crate::error::Result<T>>,
{
    let mut attempt: u32 = 0;

    loop {
        // Check cancel before each attempt
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }

        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) => {
                if !is_retryable(&err) {
                    return Err(err);
                }

                // Check max retries
                if let Some(max) = policy.max_retries {
                    if attempt >= max {
                        return Err(err);
                    }
                }

                // Log retry
                if attempt < policy.warning_threshold {
                    log::warn!(
                        "Chunk upload retry: attempt={}, chunk_index={}, error={}",
                        attempt,
                        chunk_index,
                        err
                    );
                } else {
                    log::error!(
                        "Chunk upload exceeded retry threshold: attempt={}, chunk_index={}, file={}",
                        attempt,
                        chunk_index,
                        file_name
                    );

                    // Emit warning event (throttled)
                    if should_emit_warning(attempt, policy.warning_threshold) {
                        let _ = app.emit(
                            "upload:retry-warning",
                            RetryWarningPayload {
                                task_id: task_id.to_string(),
                                file_name: file_name.to_string(),
                                retry_count: attempt,
                                error_message: err.to_string(),
                            },
                        );
                    }
                }

                // Wait with exponential backoff
                let delay = calculate_delay(attempt, policy);
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;

                attempt = attempt.saturating_add(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_delay_exponential_backoff() {
        let policy = RetryPolicy::default();
        // attempt 0 -> base 200ms
        let d0 = calculate_delay(0, &policy);
        assert!(d0 >= 180 && d0 <= 220, "attempt 0: got {}", d0);
        // attempt 1 -> base 400ms
        let d1 = calculate_delay(1, &policy);
        assert!(d1 >= 360 && d1 <= 440, "attempt 1: got {}", d1);
        // attempt 5 -> base 6400ms
        let d5 = calculate_delay(5, &policy);
        assert!(d5 >= 5760 && d5 <= 7040, "attempt 5: got {}", d5);
    }

    #[test]
    fn test_calculate_delay_capped_at_max() {
        let policy = RetryPolicy::default();
        // attempt 10+ should be capped at 30000ms (+/-10%)
        let d10 = calculate_delay(10, &policy);
        assert!(d10 >= 27000 && d10 <= 33000, "attempt 10: got {}", d10);
        let d15 = calculate_delay(15, &policy);
        assert!(d15 >= 27000 && d15 <= 33000, "attempt 15: got {}", d15);
        let d31 = calculate_delay(31, &policy);
        assert!(d31 >= 27000 && d31 <= 33000, "attempt 31: got {}", d31);
    }

    #[test]
    fn test_calculate_delay_jitter_within_10_percent() {
        let policy = RetryPolicy::default();
        for attempt in 0..20 {
            let delay = calculate_delay(attempt, &policy);
            let base = policy
                .initial_delay_ms
                .saturating_mul(1u64 << attempt.min(31));
            let capped = base.min(policy.max_delay_ms);
            let lower = capped - capped / 10;
            let upper = capped + capped / 10;
            assert!(
                delay >= lower && delay <= upper,
                "attempt {}: delay {} not in [{}, {}]",
                attempt,
                delay,
                lower,
                upper
            );
        }
    }

    #[test]
    fn test_is_retryable_network_error() {
        let err = AppError::Network("connection reset".into());
        assert!(is_retryable(&err));
    }

    #[test]
    fn test_is_retryable_api_500() {
        let err = AppError::Api("status=500 Internal Server Error".into());
        assert!(is_retryable(&err));
    }

    #[test]
    fn test_is_retryable_api_502() {
        let err = AppError::Api("status=502 Bad Gateway".into());
        assert!(is_retryable(&err));
    }

    #[test]
    fn test_is_retryable_api_503() {
        let err = AppError::Api("status=503 Service Unavailable".into());
        assert!(is_retryable(&err));
    }

    #[test]
    fn test_is_retryable_api_504() {
        let err = AppError::Api("status=504 Gateway Timeout".into());
        assert!(is_retryable(&err));
    }

    #[test]
    fn test_not_retryable_api_business_error() {
        let err = AppError::Api("upload_chunk failed: status=1, response=...".into());
        assert!(!is_retryable(&err));
    }

    #[test]
    fn test_not_retryable_io_error() {
        let err = AppError::Io("file not found".into());
        assert!(!is_retryable(&err));
    }

    #[test]
    fn test_not_retryable_storage_error() {
        let err = AppError::Storage("store read failed".into());
        assert!(!is_retryable(&err));
    }

    #[test]
    fn test_not_retryable_internal_error() {
        let err = AppError::Internal("unexpected state".into());
        assert!(!is_retryable(&err));
    }

    #[test]
    fn test_retry_policy_defaults() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.initial_delay_ms, 200);
        assert_eq!(policy.max_delay_ms, 30_000);
        assert_eq!(policy.warning_threshold, 50);
        assert!(policy.max_retries.is_none());
    }

    #[test]
    fn test_should_emit_warning_below_threshold() {
        assert!(!should_emit_warning(0, 50));
        assert!(!should_emit_warning(49, 50));
    }

    #[test]
    fn test_should_emit_warning_at_threshold() {
        assert!(should_emit_warning(50, 50));
    }

    #[test]
    fn test_should_emit_warning_between_intervals() {
        // 51-59 should not fire
        for attempt in 51..60 {
            assert!(
                !should_emit_warning(attempt, 50),
                "attempt {} should not emit",
                attempt
            );
        }
    }

    #[test]
    fn test_should_emit_warning_at_intervals() {
        assert!(should_emit_warning(60, 50));
        assert!(should_emit_warning(70, 50));
        assert!(should_emit_warning(80, 50));
        assert!(should_emit_warning(100, 50));
    }
}
