# Review Report: Story 6-5 — Realtime Upload Speed Display

| Field | Value |
|-------|-------|
| Story Key | 6-5 |
| Review Round | 1 |
| Reviewer Persona | BMM Architect (Winston) |
| Dev Commit | 5f4ad3a |
| Verdict | **PASSED** |
| Effective Strictness | normal |
| Degradation Applied | none |

---

## AC Compliance

### AC-1: Upload shows realtime speed next to progress percentage
**Status: PASS**

`UploadFileItem.tsx:111-118` — Speed displayed via `formatSpeed(taskProgress.speed ?? 0)` as `text-xs text-text-secondary` span, positioned left of the percentage display within a `flex items-center gap-2` container. When completed, the entire block is replaced by a `CheckCircle2` icon. Correct.

### AC-2: Speed based on sliding window (40 samples / 2 seconds)
**Status: PASS**

`progress.rs:19` — `SPEED_WINDOW_SIZE = 40`. At 50ms emission intervals, this equals a 2-second window. `start_emitter` maintains a local `HashMap<String, VecDeque<SpeedSample>>` (line 148), pushes `(now, total_bytes)` each tick (lines 185-188), pops front when exceeding window size (lines 189-191), and calls `calculate_speed` (line 192). The sliding window logic is correct and matches the spec exactly.

### AC-3: Speed hidden or shows "--" when completed or speed is 0
**Status: PASS**

Two-layer protection:
1. `UploadFileItem.tsx:108-109` — When `isCompleted`, renders `CheckCircle2` icon instead of the speed+percentage block. Speed is not shown.
2. `format.ts:10` — `formatSpeed` returns `'--'` when `bytesPerSec <= 0`. Combined with the `?? 0` fallback in the component (line 113), undefined/zero speed correctly shows `--`.

### AC-4: Multi-thread concurrent speed naturally aggregated via AtomicU64 counters
**Status: PASS**

`progress.rs:161-168` — The emitter iterates all shards per task, loading each shard's `AtomicU64` counter (`bytes_uploaded.load(Ordering::Relaxed)`) and summing into `total_bytes`. Since all concurrent upload threads write to the same per-shard `AtomicU64` counters, `total_bytes` naturally includes all thread contributions. The speed sample records this aggregated `total_bytes`, so calculated speed inherently reflects multi-thread throughput. No additional aggregation logic needed.

### AC-5: Speed formatted with appropriate unit (B/s, KB/s, MB/s, GB/s), 0 shows "--"
**Status: PASS**

`format.ts:9-16` — `formatSpeed` implementation:
- `<= 0` -> `--`
- `< 1024` -> `{n} B/s`
- `< 1024*1024` -> `{n.toFixed(1)} KB/s`
- `< 1024^3` -> `{n.toFixed(1)} MB/s`
- `>= 1024^3` -> `{n.toFixed(2)} GB/s`

Matches spec. 10 unit tests in `format.test.ts` cover all boundaries including negative values, exact boundary values (1024, 1024^2, 1024^3), and representative mid-range values.

---

## Objective Checklist Evaluation

### Scope Compliance
**PASS** — Files modified: `progress.rs`, `upload.ts`, `uploadStore.ts`, `format.ts`, `format.test.ts`, `UploadFileItem.tsx`, `sprint-status.yaml`. All within declared scope. No forbidden files (`models/upload.rs`, `api/`, `upload_engine.rs`, `commands/`) were touched.

### Test Coverage
**PASS** — 4 Rust unit tests added:
- `test_calculate_speed_basic` — verifies 1MB/1sec = 1048576 bytes/sec
- `test_calculate_speed_empty_samples` — empty VecDeque returns 0
- `test_calculate_speed_single_sample` — single sample returns 0
- `test_progress_payload_speed_serialization` — JSON contains `"speed"` key with correct value

10 frontend tests for `formatSpeed` covering all unit tiers and edge cases. 170/170 frontend tests pass.

### Error Handling
**PASS** — `calculate_speed` handles edge cases: empty samples (return 0), single sample (return 0), near-zero duration `< 0.001s` (return 0), reverse byte delta via `saturating_sub` (prevents underflow). `formatSpeed` handles negative input (returns `--`). Component uses `?? 0` fallback for undefined speed.

### Security Baseline
**PASS** — No credentials, no user input rendering, no SQL. Changes are purely computational (speed calculation) and display (formatting).

### Performance Baseline
**PASS** — `speed_trackers` is bounded by `SPEED_WINDOW_SIZE` (40 entries per task). Cleanup via `speed_trackers.retain()` (line 212) prevents unbounded growth for removed tasks. `VecDeque` push/pop operations are O(1). No N+1 patterns.

### Code Quality Notes
- `SpeedSample` struct and `calculate_speed` function are module-private (no `pub`), correctly scoped
- `or_insert_with(VecDeque::new)` could use `or_default()` — minor style preference, not a finding
- `Instant::now()` captured once per tick (`let now = Instant::now()`) and reused across all tasks in the same tick — consistent timestamps, correct design
- Speed state kept local to emitter task (not in shared `TaskProgress`) — avoids lock contention, clean separation

---

## Findings

No findings at any severity level. Implementation precisely follows the technical design spec with correct sliding window mechanics, proper cleanup, comprehensive tests, and clean UI integration.

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |

---

## Verdict

**PASSED** — Story 6-5 implementation is complete, correct, and well-tested. All 5 acceptance criteria are satisfied. No scope violations. Speed calculation logic is sound with proper edge case handling. Ready for `done` status.
