# Review Report: Story 3-1, Round 1

**Reviewer:** Winston (BMM Architect)
**Story:** 3-1 (gigafile.nu API abstraction layer and server discovery)
**Session:** sprint-2026-02-11-001
**Review Round:** 1
**Strictness:** strict (all severity levels must pass)
**Degradation Applied:** none

---

## Checklist Evaluation

| # | Checklist Item | Result | Notes |
|---|----------------|--------|-------|
| 1 | AC Satisfaction | PASS (with caveats) | All 7 ACs implemented. AC-1 through AC-7 verified against code. |
| 2 | Test Coverage | PASS | 7 tests cover: HTML extraction success (2 variants), failure (2 variants), instance construction, ChunkUploadParams construction, VerifyUploadParams construction. All pass (28/28 total, 7 in api::v1). No network dependency. |
| 3 | Error Handling | FAIL | See RR-001, RR-002 below. |
| 4 | Security Baseline | PASS | No hardcoded credentials. HTTPS enforced. All HTTP code in `api/` directory. |
| 5 | Performance Baseline | PASS | No unbounded iterations, no N+1 patterns, no sync blocking in async. |
| 6 | Scope Compliance | PASS | Only 3 files modified, all within declared scope. No forbidden files touched. |

## Code Quality Checks

- `cargo test`: 28 passed, 0 failed
- `cargo clippy`: 0 warnings
- `cargo fmt --check`: pass

---

## Findings

### RR-001 [MEDIUM] — No HTTP request timeout configured on reqwest Client

**Category:** error-handling
**Affected Files:** `src-tauri/src/api/v1.rs` (lines 22-24)
**Description:**
`GigafileApiV1::new()` builds a `reqwest::Client` without configuring `.timeout()`. reqwest 0.12 has no default timeout. If gigafile.nu is unreachable or extremely slow, `discover_server()` will hang indefinitely, blocking the upload session startup with no error feedback to the user.

AC-6 specifies: "network errors (connection failures, timeouts) propagate via `AppError::Network`." For timeout errors to propagate, a timeout must actually be configured. Without one, the failure path "server unreachable/slow" never completes and never produces a meaningful error.

**Fix Instruction:**
Add a reasonable timeout to the Client builder in `GigafileApiV1::new()`:

```rust
let client = reqwest::Client::builder()
    .user_agent(USER_AGENT)
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;
```

30 seconds is reasonable for a homepage GET request. The timeout will cause reqwest to return a `reqwest::Error` with `is_timeout() == true`, which the existing `From<reqwest::Error>` converts to `AppError::Network`.

---

### RR-002 [MEDIUM] — No HTTP status code check in discover_server()

**Category:** error-handling
**Affected Files:** `src-tauri/src/api/v1.rs` (lines 43-50)
**Description:**
`discover_server()` calls `.send().await?.text().await?` without checking the HTTP status code. reqwest does not error on non-2xx responses by default. If gigafile.nu returns 503 Service Unavailable or 403 Forbidden, the response body will still be parsed as HTML, and the regex extraction will fail with a generic "Failed to extract server URL from homepage HTML" message. This masks the actual root cause (server error) with a misleading error description.

AC-6 requires: "API response errors (parse failures, unexpected responses) propagate via `AppError::Api`." A non-2xx HTTP status is an "unexpected response" that should be reported clearly before attempting HTML parsing.

**Fix Instruction:**
Add `.error_for_status()` after `.send().await?` to convert non-2xx responses into reqwest errors (which then propagate as `AppError::Network` via the existing `From` impl):

```rust
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
```

This produces a clearer error like "Network error: HTTP status client error (403 Forbidden)" instead of the misleading "API error: Failed to extract server URL from homepage HTML".

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 0 |
| **Total** | **2** |

**Verdict: NEEDS-FIX**

Two MEDIUM findings in the error-handling category. Both relate to robustness of the `discover_server()` HTTP call path: (1) no timeout means indefinite hang on network issues, (2) no status code check means misleading error messages on server errors. Both fixes are single-line additions with no architectural impact.

**Effective Strictness:** strict (all findings reported, all must be fixed)
