# Code Review Report — Story 3-4, Round 1

| Field | Value |
|-------|-------|
| Story Key | 3-4 |
| Review Round | 1 |
| Reviewer Persona | BMM Architect (Winston) |
| Strictness | strict |
| Verdict | **needs-fix** |
| Date | 2026-02-11 |

## Summary

Story 3-4 implements the retry engine and integrates it with the upload engine. The overall structure is sound — separation of concerns between `retry_engine.rs` (policy + retry loop) and `upload_engine.rs` (integration) is clean. However, the review identified 6 findings (1 HIGH, 3 MEDIUM, 2 LOW) that require attention before passing.

## Findings

### RR-001 [HIGH] — `is_retryable` Api 5xx detection is dead code with false positive risk

**File:** `src-tauri/src/services/retry_engine.rs:71-78`

**Description:** The `is_retryable` function checks `AppError::Api` messages for 5xx HTTP status code patterns (`"500"`, `"502"`, `"503"`, `"504"`). This logic is both dead code and a false positive risk:

1. **Dead code:** Under the current error flow, HTTP 5xx responses trigger `reqwest::Response::error_for_status()` (at `api/v1.rs:89`), producing a `reqwest::Error` that converts to `AppError::Network` via `From<reqwest::Error>`. HTTP 5xx errors **never** become `AppError::Api`. The Api variant is only created for application-level JSON response errors (`"upload_chunk failed: status=1, response=..."`), where the `status` field is the gigafile.nu JSON status (0/1/2...), not an HTTP status code.

2. **False positive risk:** The substring checks `msg.contains("500")`, `msg.contains("502")`, etc. can match incidental occurrences in the JSON response body. For example, if the gigafile response body contains `{"bytes":15020}` or a URL containing `"500"`, the error message `"upload_chunk failed: status=1, response={\"bytes\":15020}"` would match `"502"` and be incorrectly classified as retryable.

**Fix instruction:** Simplify the `AppError::Api` branch to return `false` unconditionally, since 5xx HTTP errors are handled by the `AppError::Network` branch. Add a code comment explaining this design decision. Alternatively, if future-proofing against error flow changes is desired, use a structured approach (e.g., regex `r"status=5\d{2}\b"`) instead of bare substring matching.

---

### RR-002 [MEDIUM] — Deterministic jitter defeats thundering herd prevention

**File:** `src-tauri/src/services/retry_engine.rs:94-96`

**Description:** The jitter calculation `(attempt as u64 * 7 + 13) % (jitter_range * 2 + 1)` is fully deterministic. All concurrent chunk uploads (up to 8 per shard) at the same retry attempt will compute identical delay values, causing them to retry simultaneously. This defeats the primary purpose of jitter — desynchronizing concurrent retries to avoid thundering herd effects on the server.

**Fix instruction:** Use a lightweight random source for jitter. Since `rand` is a heavy dependency, consider `fastrand` (zero-dependency, no-std compatible) or use `std::collections::hash_map::RandomState` as a cheap entropy source:

```rust
let jitter = fastrand::u64(0..=jitter_range * 2);
capped - jitter_range + jitter
```

If adding a dependency is undesirable, use the thread ID or a combination of `chunk_index` and `attempt` to at least differentiate between concurrent chunks:

```rust
let seed = (chunk_index as u64).wrapping_mul(31).wrapping_add(attempt as u64 * 7 + 13);
let jitter = seed % (jitter_range * 2 + 1);
```

Note: `calculate_delay` currently does not receive `chunk_index`. The function signature would need to be extended, or the jitter could be added at the call site.

---

### RR-003 [MEDIUM] — New GigafileApiV1 created per retry attempt

**File:** `src-tauri/src/services/upload_engine.rs:207` and `src-tauri/src/services/upload_engine.rs:279`

**Description:** Inside the retry closure, `GigafileApiV1::new()?` is called on every attempt. This constructs a new `reqwest::Client` each time (TLS context, connection pool initialization). While `upload_chunk` internally creates yet another client with cookie support, the outer client construction is pure overhead — especially under high retry counts (potentially hundreds of attempts before threshold warning).

This occurs because `GigafileApiV1` is not `Clone`, preventing it from being captured by the `FnMut` closure across multiple invocations.

**Fix instruction:** Since `api/v1.rs` is outside Story 3-4 scope, the minimal fix is to construct `GigafileApiV1` once per closure invocation instead of recreating it. However, the real fix (for a follow-up story) is to implement `Clone` on `GigafileApiV1` (trivial since `reqwest::Client` is `Clone` via internal `Arc`), then create it once outside the closure and clone it in.

For now, document this as a known performance debt with a `// TODO: make GigafileApiV1 Clone to avoid per-retry construction` comment.

---

### RR-004 [MEDIUM] — No unit tests for core `retry_upload_chunk` async function

**File:** `src-tauri/src/services/retry_engine.rs:187-332`

**Description:** The test module covers `calculate_delay`, `is_retryable`, `should_emit_warning`, and `RetryPolicy::default()` — all helper functions. However, the core `retry_upload_chunk` async function has **zero test coverage**. This is the most critical function in the module, responsible for:

- Cancel flag checking
- Max retries enforcement
- Correct logging level transitions (warn -> error at threshold)
- Warning event emission at correct intervals
- Retry/non-retry error classification integration

While testing this function is more complex (requires mock `tauri::AppHandle`), the cancel flag behavior and max_retries logic can be tested by extracting testable sub-behaviors or using a test-only AppHandle mock.

**Fix instruction:** Add at least the following tests:
1. `retry_upload_chunk` with a mock operation that fails N times then succeeds — verify it retries correctly
2. `retry_upload_chunk` with `max_retries = Some(2)` — verify it stops after 2 retries
3. `retry_upload_chunk` with non-retryable error — verify immediate return
4. `retry_upload_chunk` with cancel_flag set — verify immediate cancellation

If `tauri::AppHandle` cannot be mocked, consider extracting the retry loop logic into a testable inner function that takes a generic event emitter trait or callback.

---

### RR-005 [LOW] — `upload:error` event does not distinguish cancellation from actual errors

**File:** `src-tauri/src/services/upload_engine.rs:113-121`

**Description:** When a cancel flag is detected in `upload_file`, the code emits an `upload:error` event with `error_message: "Upload cancelled by user"`. Semantically, user-initiated cancellation is not an error — it's a deliberate action. The frontend will need to parse the error message string to distinguish between "user cancelled" and "actual error", which is fragile.

**Fix instruction:** Either: (a) add a `cancelled: bool` field to `UploadErrorPayload` so the frontend can distinguish programmatically, or (b) emit a separate `upload:cancelled` event for cancellation instead of reusing the error event. Option (b) is cleaner but may require frontend coordination in Story 3.5. For now, add a TODO comment noting this distinction for the frontend story.

---

### RR-006 [LOW] — Redundant individual status code checks in `is_retryable`

**File:** `src-tauri/src/services/retry_engine.rs:73-77`

**Description:** The check `msg.contains("status=5")` already covers all 5xx patterns in the `status=NNN` format. The additional checks for `"500"`, `"502"`, `"503"`, `"504"` are both redundant (subsumed by `status=5` for properly formatted messages) and harmful (they match bare substrings without format constraints, creating false positive risk as documented in RR-001).

**Fix instruction:** This is subsumed by the RR-001 fix. If the Api branch is simplified to always return `false`, these checks are removed entirely.

---

## Checklist Results

| # | Checklist Item | Result | Notes |
|---|----------------|--------|-------|
| 1 | AC Coverage | PASS | All 7 ACs implemented correctly |
| 2 | Test Coverage | FAIL | Core `retry_upload_chunk` function untested (RR-004) |
| 3 | Error Handling | FAIL | `is_retryable` Api branch is dead code with false positive risk (RR-001) |
| 4 | Security Baseline | PASS | No hardcoded credentials, no injection vectors |
| 5 | Performance Baseline | WARN | Deterministic jitter (RR-002), unnecessary API construction (RR-003) |
| 6 | Scope Compliance | PASS | All modifications within declared file scope |

## Verdict

**needs-fix** — 1 HIGH and 3 MEDIUM findings require resolution before passing.
