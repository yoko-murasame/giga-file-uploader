# Review Report: Story 2-2 (Round 1)

**Story:** 2-2 — 文件选择器输入
**Reviewer Persona:** BMM Architect (Winston)
**Review Round:** 1
**Effective Strictness:** normal (HIGH+MEDIUM must fix, LOW optional)
**Degradation Applied:** none
**Session:** sprint-2026-02-11-002
**Date:** 2026-02-11

---

## Summary

Story 2-2 replaces the HTML `<input type="file">` with `tauri-plugin-dialog`'s native `open()` API. The implementation is structurally sound: dependencies installed correctly, plugin registered, capabilities granted, IPC wrapper added, component refactored, and old code removed cleanly. All 5 ACs are functionally addressed in the component code. Test suite passes (47/47). However, test coverage has gaps in failure/edge-case paths, and there is no concurrency guard against rapid repeated clicks.

---

## Findings

### RR-001 [MEDIUM] — Missing test for `resolveDroppedPaths` failure after successful file selection

**Category:** test-coverage
**Affected File:** `src/components/upload/FileDropZone.test.tsx`

**Description:** The test suite covers `openFilePicker` throwing an error (line 130-147), but does not test the scenario where `openFilePicker` succeeds (returns paths) and then `resolveDroppedPaths` throws an error. These are two distinct failure points inside the `try/catch` block in `handleClick`. The `resolveDroppedPaths` failure path — which exercises the Rust IPC layer failing after the dialog succeeded — is untested.

**Fix Instruction:** Add a test case where `mockOpenFilePicker` resolves with paths but `mockResolveDroppedPaths` rejects with an error. Assert that `console.error` is called with `'Failed to open file picker:'` and that `addFiles` is NOT called.

---

### RR-002 [MEDIUM] — Missing test for empty entries from `resolveDroppedPaths`

**Category:** test-coverage
**Affected File:** `src/components/upload/FileDropZone.test.tsx`

**Description:** `FileDropZone.tsx:23` has a guard `if (entries.length > 0)` before calling `addFiles`. This guard is never exercised by any test. All existing tests either return `null` from `openFilePicker` (skipping `resolveDroppedPaths` entirely) or return non-empty entries from `resolveDroppedPaths`. There is no test where `resolveDroppedPaths` resolves with an empty array `[]`, which can happen when all selected paths point to non-existent or inaccessible files.

**Fix Instruction:** Add a test case where `mockOpenFilePicker` resolves with paths (e.g., `['/tmp/gone.txt']`) and `mockResolveDroppedPaths` resolves with `[]`. Assert that `addFiles` is NOT called.

---

### RR-003 [MEDIUM] — No guard against concurrent file picker invocations

**Category:** error-handling
**Affected File:** `src/components/upload/FileDropZone.tsx`

**Description:** `handleClick` is async and calls `openFilePicker()` without any concurrency guard. If the user double-clicks rapidly (or clicks again before the native dialog fully appears), multiple `openFilePicker()` calls can be dispatched concurrently. While the native dialog is modal once visible, there is a brief async window between the click event and the dialog appearing during which additional clicks can queue. This could result in multiple dialogs appearing sequentially, or duplicate file additions if both resolve.

**Fix Instruction:** Add a `useRef<boolean>` flag (e.g., `isPickerOpenRef`) initialized to `false`. Set it to `true` at the start of `handleClick` and `false` in a `finally` block. Early-return if the flag is already `true`. This is the standard guard for async button handlers that should not be re-entrant.

```typescript
const isPickerOpenRef = useRef(false);

const handleClick = useCallback(async () => {
  if (isPickerOpenRef.current) return;
  isPickerOpenRef.current = true;
  try {
    // ... existing logic
  } catch (error) {
    console.error('Failed to open file picker:', error);
  } finally {
    isPickerOpenRef.current = false;
  }
}, [addFiles]);
```

---

### RR-004 [LOW] — Cargo.toml version specifier inconsistent with existing pattern

**Category:** code-clarity
**Affected File:** `src-tauri/Cargo.toml`

**Description:** The new dependency `tauri-plugin-dialog = "2.6.0"` uses a full semver string, while the existing Tauri plugin dependencies use major-only specifiers: `tauri-plugin-shell = "2"`, `tauri-plugin-store = "2"`. While `"2.6.0"` is semantically valid (Cargo treats it as `^2.6.0`), it is visually inconsistent and sets a minimum patch version without clear justification, since no 2.6.0-specific feature is required beyond the base `open()` API.

**Fix Instruction:** Change to `tauri-plugin-dialog = "2"` to match the existing convention, unless a specific 2.6.0 feature is needed. (Optional fix — LOW severity.)

---

## Verdict

| Metric | Value |
|--------|-------|
| Findings Total | 4 |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 1 |
| Findings After Filter | 4 |

**Decision:** `needs-fix`

Three MEDIUM findings must be addressed: two test coverage gaps (RR-001, RR-002) and one concurrency guard (RR-003). The LOW finding (RR-004) is optional.

---

## AC Coverage Check

| AC | Status | Notes |
|----|--------|-------|
| AC-1: Click triggers native file picker | Covered | `openFilePicker()` -> `open({ multiple: true })` |
| AC-2: Selected files added to queue | Covered | `resolveDroppedPaths` -> `addFiles` |
| AC-3: Cancel = no action | Covered | `if (paths === null) return` |
| AC-4: Keyboard Enter/Space | Covered | `handleKeyDown` dispatches `handleClick` |
| AC-5: Collapsed state click | Covered | Same `handleClick` in both render branches |

## Scope Compliance

All modified files are within the declared File Scope. No out-of-scope files were touched.
