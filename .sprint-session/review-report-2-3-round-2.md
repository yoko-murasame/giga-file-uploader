# Code Review Report — Story 2-3 (Round 2)

| Field | Value |
|-------|-------|
| Story | 2-3: 待上传文件列表预览与管理 |
| Reviewer | BMM Architect (Winston) |
| Round | 2 |
| Session | sprint-2026-02-11-002 |
| Strictness | Normal (HIGH+MEDIUM must fix, LOW optional) |
| Verdict | **passed** |

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |
| **Total** | **0** |
| **Must Fix** | **0** |

All 3 MEDIUM findings from Round 1 have been correctly fixed. No new issues introduced by the fixes. All 73 tests pass across 9 test files.

---

## Round 1 Fix Verification

### RR-001 [MEDIUM] — Missing `overflow-hidden` breaks removal collapse animation

**Status:** FIXED

**Verification:** `src/components/upload/UploadFileItem.tsx:38` — the `<li>` element now includes `overflow-hidden` in its className, ensuring the `max-height` transition from `max-h-12` to `max-h-0` correctly clips content during the removal animation.

---

### RR-002 [MEDIUM] — Missing test coverage for removal animation CSS state

**Status:** FIXED

**Verification:** `src/components/upload/UploadFileItem.test.tsx:85-97` — new test case "should apply opacity-0 and max-h-0 classes after clicking delete" verifies:
1. Before clicking delete: `<li>` has `opacity-100` and `max-h-12` classes
2. After clicking delete: `<li>` transitions to `opacity-0` and `max-h-0` classes

This confirms the intermediate animation state is correctly applied during the 200ms transition window.

---

### RR-003 [MEDIUM] — Missing test for `prefers-reduced-motion` immediate removal

**Status:** FIXED

**Verification:** `src/components/upload/UploadFileItem.test.tsx:99-130` — new test case "should call onRemove immediately when prefers-reduced-motion is enabled" verifies:
1. Mocks `window.matchMedia` to return `matches: true` for `(prefers-reduced-motion: reduce)` query
2. Asserts `onRemove` is called immediately after button click (no setTimeout)
3. Asserts `<li>` does NOT receive `opacity-0` class (animation skipped entirely)
4. Properly restores original `matchMedia` after test

The mock implementation is thorough — it includes all `MediaQueryList` interface methods and correctly matches the specific reduced-motion query string.

---

## Round 1 LOW Findings (Optional — Not Fixed)

| Finding | Status | Notes |
|---------|--------|-------|
| RR-004 [LOW] matchMedia on every render | Not fixed | Acceptable — `React.memo` limits re-renders, performance impact negligible |
| RR-005 [LOW] Missing formatted size assertions in UploadFileList test | Not fixed | Acceptable — size formatting is tested in `UploadFileItem.test.tsx` and `format.test.ts` |
| RR-006 [LOW] No Tooltip hover test | Not fixed | Acceptable — Tooltip is a Radix UI primitive; testing the framework's hover behavior adds limited value |

All LOW findings were optional in Round 1 and remain acceptable as-is.

---

## AC Coverage Matrix

| AC | Status | Notes |
|----|--------|-------|
| AC-1: 文件列表展示 | Pass | File name + size display, truncate + Tooltip, semantic `<ul>`/`<li>`, `h-12` height — all implemented and tested |
| AC-2: 文件大小格式化 | Pass | `formatFileSize` correct with 11 unit tests covering all ranges and edge cases |
| AC-3: 删除文件 | Pass | Delete button + fadeout animation (opacity + max-height + overflow-hidden) working. Animation CSS state tested. 200ms timeout verified. |
| AC-4: 删除后队列为空恢复拖拽区 | Pass | `UploadPage` uses conditional `hasFiles` rendering correctly |
| AC-5: React.memo 优化 | Pass | `UploadFileItem` wrapped with `memo()` at line 78 |
| AC-6: 无障碍 | Pass | `aria-label="删除 {fileName}"` present and tested. `prefers-reduced-motion` implemented and tested. Semantic structure verified. |

## Scope Compliance

No files outside the declared scope were modified. All files match the File Scope declaration in the Story spec.

## Test Results

- 9 test files, 73 tests — all passing
- Key coverage: `format.test.ts` (11), `UploadFileItem.test.tsx` (8), `UploadFileList.test.tsx` (4)

## Recommendation

**Verdict: passed** — All Round 1 MEDIUM findings are correctly fixed. No new issues introduced. All AC items fully covered with tests. Code is ready for done state.
