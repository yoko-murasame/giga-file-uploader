# Code Review Report — Story 3-4, Round 2

| Field | Value |
|-------|-------|
| Story Key | 3-4 |
| Review Round | 2 |
| Reviewer Persona | BMM Architect (Winston) |
| Strictness | strict |
| Verdict | **passed** |
| Date | 2026-02-11 |

## Summary

Round 2 re-review after 6 findings from Round 1. All findings have been correctly addressed. No new issues introduced by the fixes. All 77 tests pass, clippy reports no warnings.

## Round 1 Findings Verification

### RR-001/RR-006 [HIGH/LOW]: Simplify is_retryable Api branch — FIXED

**File:** `src-tauri/src/services/retry_engine.rs:71-76`

The `AppError::Api` branch now returns `false` unconditionally, collapsed into a single match arm with `Io`, `Storage`, and `Internal`. The doc comment (lines 64-70) correctly explains the design decision: HTTP 5xx errors flow through `reqwest::error_for_status()` into `AppError::Network`, so `Api` only contains gigafile.nu application-level JSON errors which are never transient. The test `test_not_retryable_api_regardless_of_content` (line 307-312) explicitly verifies that even an Api message containing "status=500" returns false. RR-006 (redundant individual substring checks) is resolved as a consequence.

### RR-002 [MEDIUM]: Deterministic jitter — FIXED

**File:** `src-tauri/src/services/retry_engine.rs:82-99`

`calculate_delay` signature extended to accept `chunk_index: u32`. Jitter seed now incorporates `chunk_index` via `(chunk_index as u64).wrapping_mul(31).wrapping_add(attempt as u64 * 7 + 13)`, differentiating concurrent chunks at the same retry attempt. Test `test_calculate_delay_different_chunks_produce_different_jitter` (line 277-290) verifies at least 2 of 3 chunks at the same attempt produce different delays. All existing delay tests updated to pass the new parameter. The caller in `retry_loop` (line 171) correctly forwards `chunk_index`.

Note: jitter remains deterministic (not truly random), but now varies per-chunk which is the primary thundering herd mitigation goal. True randomness would require a dependency (`fastrand`/`rand`) — acceptable trade-off for MVP.

### RR-003 [MEDIUM]: GigafileApiV1 per-retry construction — FIXED (documented)

**File:** `src-tauri/src/services/upload_engine.rs:211-214, 287-288`

TODO comments added at both closure sites (first-chunk and concurrent-chunk) documenting the performance debt and the planned fix (implement `Clone` on `GigafileApiV1`). Since `api/v1.rs` is outside Story 3-4 scope, this is the correct minimal fix. The comments are specific and actionable.

### RR-004 [MEDIUM]: No tests for retry_upload_chunk — FIXED

**File:** `src-tauri/src/services/retry_engine.rs:113-178, 372-509`

Core retry logic extracted into `retry_loop` (private async function, lines 113-178) which accepts a generic `on_warning: FnMut` callback, enabling testing without `tauri::AppHandle`. The public `retry_upload_chunk` (lines 185-221) is now a thin wrapper that supplies the Tauri event emission callback.

Four async tests added covering all requested scenarios:
1. `test_retry_loop_succeeds_after_transient_failures` — 3 Network errors then success, verifies 4 calls and correct result
2. `test_retry_loop_respects_max_retries` — max_retries=2, always-fail operation, verifies exactly 3 calls (attempts 0,1,2)
3. `test_retry_loop_non_retryable_error_returns_immediately` — Io error, verifies 1 call and error type preservation
4. `test_retry_loop_cancel_flag_stops_before_first_attempt` — Pre-set cancel flag, verifies 0 operation calls and Internal cancel error

### RR-005 [LOW]: Cancel vs error event distinction — FIXED (documented)

**File:** `src-tauri/src/services/upload_engine.rs:113-116`

TODO comment added with two concrete options: (a) add `cancelled: bool` field to `UploadErrorPayload`, or (b) emit separate `upload:cancelled` event. Correctly deferred to Story 3.5 where frontend event listening is implemented.

## New Issues Check

No new issues found. Specific checks performed:

- **`is_multiple_of` API stability:** Used at line 106 for warning throttle. Stabilized in Rust 1.85.0 (Feb 2025). Clippy passes without warnings, confirming toolchain compatibility.
- **`retry_loop` visibility:** Correctly private (`async fn`, no `pub`), accessible from `#[cfg(test)] mod tests` within the same module.
- **Scope compliance:** Only `retry_engine.rs` and `upload_engine.rs` modified (within declared file scope). No changes to `api/`, `error.rs`, `models/`, `commands/`, or frontend.
- **AC coverage:** All 7 acceptance criteria satisfied (verified against Story spec).
- **Security baseline:** No hardcoded credentials, no injection vectors, no unescaped user input.
- **Performance baseline:** No unbounded loops (retry has cancel_flag + optional max_retries), no N+1 patterns.
- **Test results:** 77 tests pass (0 failures), clippy clean, all retry_engine tests exercise realistic scenarios with minimal delays (1ms initial, 10ms max).

## Checklist Results

| # | Checklist Item | Result | Notes |
|---|----------------|--------|-------|
| 1 | AC Coverage | PASS | All 7 ACs implemented correctly |
| 2 | Test Coverage | PASS | Helper functions + 4 async retry_loop tests covering success, max_retries, non-retryable, cancel |
| 3 | Error Handling | PASS | is_retryable simplified, cancel/error distinction documented for Story 3.5 |
| 4 | Security Baseline | PASS | No hardcoded credentials, no injection vectors |
| 5 | Performance Baseline | PASS | Jitter differentiates by chunk_index; GigafileApiV1 per-retry debt documented |
| 6 | Scope Compliance | PASS | All modifications within declared file scope |

## Verdict

**passed** — All 6 Round 1 findings correctly resolved. No new issues introduced. Code quality verified (77 tests pass, clippy clean).
