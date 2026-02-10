# Review Report: Story 3-3 (Round 1)

## Summary

| Field | Value |
|-------|-------|
| Story | 3-3: Upload Engine Core - First-chunk Serial & Concurrent Upload |
| Reviewer | Review Runner (Winston / BMM Architect) |
| Round | 1 |
| Strictness | strict (all HIGH/MEDIUM/LOW must be fixed) |
| Verdict | **needs-fix** |
| Findings Total | 1 |
| Findings by Severity | HIGH: 0, MEDIUM: 1, LOW: 0 |
| Degradation Applied | none |

## Review Checklist

| # | Checklist Item | Result | Notes |
|---|----------------|--------|-------|
| 1 | AC Satisfaction | PASS | All 9 ACs implemented: upload_chunk (AC-1), start() entry (AC-2), first-chunk serial (AC-3), concurrent + ordered completion (AC-4), error isolation (AC-5), Tauri commands (AC-6), cancel support (AC-7), spawn_blocking I/O (AC-8), unit tests (AC-9) |
| 2 | Test Coverage | PASS | All AC-9 test cases present: read_chunk_data offset/boundary/not-found, UUID hex 32 chars, UploadState default, cancel flag set/read, response parsing intermediate/last chunk. All 58 tests pass. |
| 3 | Error Handling | PARTIAL | Errors propagate correctly via AppError and `?` operator. However, concurrent chunk failure leaves orphaned spin-waiting tasks (see RR-001). |
| 4 | Security Baseline | PASS | No hardcoded credentials, no raw SQL, no unescaped user input. File paths used for local I/O only (expected for file uploader). |
| 5 | Performance Baseline | PASS | Semaphore(8) concurrency control, spawn_blocking for file I/O, no unbounded iterations. Ordered-completion spin-wait at 10ms interval is acceptable for 100MB+ chunk upload durations. |
| 6 | Scope Compliance | PASS | Modified files match story file scope exactly: Cargo.toml, api/v1.rs, commands/mod.rs, commands/upload.rs, lib.rs, services/mod.rs, services/upload_engine.rs. No prohibited files touched. |

## Code Quality Verification

- `cargo test`: 58 passed, 0 failed
- `cargo clippy`: 0 warnings
- `cargo fmt --check`: pass

## Findings

### RR-001 [MEDIUM] — Orphaned spin-waiting tasks on concurrent chunk failure

**Category:** error-handling / resource-leak

**Description:**
In `upload_shard()` (`src-tauri/src/services/upload_engine.rs:158-232`), when a concurrent chunk upload fails, the error propagates out through the result collection loop (`handle.await...??` at line 226-228). This causes `upload_shard` to return early, but other spawned tokio tasks that are in the ordered-completion spin-wait loop (lines 205-213) continue spinning indefinitely.

These orphaned tasks spin-wait at 10ms intervals checking:
1. `cancel_flag` — never set (the failure is from an upload error, not a cancel request)
2. `completed_counter` — never reaches their `chunk_index` because the failed chunk never incremented it

The spawned task in `start()` (line 71-79) logs the error and removes the `task_id` from `cancel_flags`, so `cancel_upload` can no longer reach these orphaned tasks either.

**Impact:** Each orphaned task holds a tokio task slot, wakes every 10ms, and runs until the application is shut down. In a scenario where multiple shards fail across multiple files, this accumulates unbounded orphaned tasks.

**Affected files:**
- `src-tauri/src/services/upload_engine.rs` (lines 158-232, upload_shard concurrent section)

**Fix instruction:**
Introduce a shared error/abort signal (e.g., `Arc<AtomicBool>` as a `shard_abort` flag) that is set to `true` when any concurrent chunk fails or when `upload_shard` exits early. Each spin-waiting task should check this flag alongside `cancel_flag` and exit with an error if it's set. Alternatively, set the existing `cancel_flag` to `true` when a chunk error is detected during result collection, so all sibling tasks observe the abort.

Recommended approach (minimal change): wrap the result collection loop in a pattern that sets `cancel_flag` on first error before propagating:

```rust
// Collect results
let mut last_url: Option<String> = None;
for (idx, handle) in handles {
    let resp = match handle.await {
        Ok(Ok(resp)) => resp,
        Ok(Err(e)) => {
            cancel_flag.store(true, Ordering::Relaxed);
            return Err(e);
        }
        Err(e) => {
            cancel_flag.store(true, Ordering::Relaxed);
            return Err(AppError::Internal(format!("Task join error: {}", e)));
        }
    };
    if idx == total_chunks - 1 {
        last_url = resp.download_url;
    }
}
```

This ensures orphaned spin-waiting tasks observe `cancel_flag == true` and exit their loops gracefully.

---

## AC Coverage Matrix

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: upload_chunk implementation | PASS | `v1.rs:55-107` — multipart form with all 6 fields, temp client with cookie_jar, JSON response parsing, non-0 status error |
| AC-2: upload engine entry | PASS | `upload_engine.rs:22-85` — start() discovers server, creates UploadTask per file, spawns independent tokio tasks, returns task_ids |
| AC-3: first-chunk serial | PASS | `upload_engine.rs:136-150` — chunk_index 0 sent serially before concurrent section |
| AC-4: concurrent + ordered completion | PASS | `upload_engine.rs:158-232` — Semaphore(8), AtomicU32 counter, spin-wait for ordered completion |
| AC-5: error isolation | PASS | `upload_engine.rs:71-79` — each file in independent tokio::spawn, failure logged per-file |
| AC-6: Tauri commands | PASS | `commands/upload.rs` — UploadState, start_upload, cancel_upload; `lib.rs:14-18` — managed state + invoke_handler registration |
| AC-7: cancel support | PASS | Cancel flag checked in upload_file (line 97), upload_shard spawn loop (line 164), and spin-wait loop (line 206) |
| AC-8: file I/O | PASS | `upload_engine.rs:247-264` — spawn_blocking + File::seek + File::read, truncate for EOF |
| AC-9: unit tests | PASS | All 6 specified test categories present and passing |

## Recommendation

Verdict: **needs-fix** (1 MEDIUM finding under strict mode)

The implementation is architecturally sound and follows the Story design closely. The single finding (RR-001) is a concrete resource leak scenario in the concurrent chunk error path. The fix is localized to the result collection section of `upload_shard` and does not require structural changes.
