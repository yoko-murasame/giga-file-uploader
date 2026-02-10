# Review Report: Story 2-2 (Round 2)

**Story:** 2-2 — 文件选择器输入
**Reviewer Persona:** BMM Architect (Winston)
**Review Round:** 2
**Effective Strictness:** normal (HIGH+MEDIUM must fix, LOW optional)
**Degradation Applied:** none
**Session:** sprint-2026-02-11-002
**Date:** 2026-02-11

---

## Round 1 Fix Verification

All three MEDIUM findings from Round 1 have been correctly fixed in commit ea8b485:

### RR-001 [MEDIUM] — Missing test for `resolveDroppedPaths` failure path
**Status:** FIXED
**Verification:** Test added at `FileDropZone.test.tsx:149-173`. The test sets `mockOpenFilePicker` to resolve with paths, then `mockResolveDroppedPaths` to reject with an error. Correctly asserts that `addFiles` is NOT called and `console.error` is invoked with the expected message. The test exercises the distinct failure point where dialog succeeds but Rust IPC fails — exactly what was requested.

### RR-002 [MEDIUM] — Missing test for empty entries guard
**Status:** FIXED
**Verification:** Test added at `FileDropZone.test.tsx:175-189`. The test resolves `mockOpenFilePicker` with paths and `mockResolveDroppedPaths` with `[]`. Correctly asserts that `addFiles` is NOT called. This exercises the `if (entries.length > 0)` guard at `FileDropZone.tsx:26`.

### RR-003 [MEDIUM] — No guard against concurrent file picker invocations
**Status:** FIXED
**Verification:** `useRef<boolean>` guard (`isPickerOpenRef`) added at `FileDropZone.tsx:16`. Early return at line 19 if flag is `true`. Flag set to `true` at line 20, reset in `finally` block at line 32. Test at `FileDropZone.test.tsx:191-213` uses a pending promise pattern to verify the second click is blocked. The `finally` block correctly resets the flag even on early return (when `paths === null`), allowing subsequent clicks after cancel.

### RR-004 [LOW] — Cargo.toml version specifier inconsistent
**Status:** NOT FIXED (optional, LOW severity)
`tauri-plugin-dialog = "2.6.0"` remains at `Cargo.toml:23` while other Tauri plugins use `"2"`. As this was explicitly optional in Round 1, no action required.

---

## Round 2 Full Review

### FileDropZone.tsx (`src/components/upload/FileDropZone.tsx`)

**Structure:** Clean single-component file, 89 lines. No extraneous code.

**Import order:** (1) `useCallback, useRef` from react, (2) `Upload` from lucide-react, (3) internal `@/lib/tauri`, `@/stores/uploadStore`, `@/hooks/useDragDrop`. Follows project convention.

**Props interface:** `FileDropZoneProps` — follows `{ComponentName}Props` naming convention.

**Zustand selector:** `useUploadStore((s) => s.addFiles)` — precise selector, not destructuring entire store. Correct.

**Concurrency guard:** `isPickerOpenRef` pattern is the standard async re-entrancy guard. `finally` block ensures the flag is always reset, including on cancel (`paths === null` early return) and on error (catch block). No leak path.

**AC coverage in code:**
- AC-1: `handleClick` calls `openFilePicker()` which invokes `open({ multiple: true })` — native dialog
- AC-2: `resolveDroppedPaths(paths)` -> `addFiles(entries)` — queue addition
- AC-3: `if (paths === null) return` — no action on cancel
- AC-4: `handleKeyDown` dispatches `handleClick` on Enter/Space
- AC-5: Same `handleClick`/`handleKeyDown` bound in collapsed render branch (line 55-56)

**Accessibility:** `role="button"`, `aria-label="添加文件"`, `tabIndex={0}`, `focus-visible` ring styles — consistent in both render branches.

**i18n:** User-facing strings in Chinese ("将文件拖到这里，或点击选择文件", "松手即可添加", "继续拖拽或点击添加文件", "添加文件"). Error log in English ("Failed to open file picker:"). Correct per project rules.

**No issues found.**

### FileDropZone.test.tsx (`src/components/upload/FileDropZone.test.tsx`)

**Test count:** 20 tests across 2 describe blocks (14 idle, 6 collapsed).

**Mock setup:** `vi.mock('@/lib/tauri', ...)` with factory function. `beforeEach` clears all mocks and resets store state. Clean isolation.

**Coverage assessment:**
- Click triggers `openFilePicker` (idle + collapsed) — covered
- Files selected -> `resolveDroppedPaths` -> `addFiles` (idle + collapsed) — covered
- Cancel (null return) -> no action — covered
- Keyboard Enter + Space — covered
- `openFilePicker` error -> console.error, no crash — covered
- `resolveDroppedPaths` error after successful dialog -> console.error, no addFiles — covered (RR-001 fix)
- Empty entries guard -> no addFiles — covered (RR-002 fix)
- Concurrent click guard -> only one invocation — covered (RR-003 fix)
- No `<input type="file">` in DOM (idle + collapsed) — covered
- Accessibility attributes (role, aria-label, tabindex) — covered

**No gaps found.**

### tauri.ts (`src/lib/tauri.ts`)

`openFilePicker()` handles all three return types from `open()`: `null` (cancel), `string` (single file), `string[]` (multiple files). Normalization to `string[] | null` is correct. No error swallowing — errors propagate to callers.

**No issues found.**

### lib.rs (`src-tauri/src/lib.rs`)

`tauri_plugin_dialog::init()` registered at line 11, before `invoke_handler` at line 14. Correct per Task 2.2 requirement.

**No issues found.**

### capabilities/default.json (`src-tauri/capabilities/default.json`)

`"dialog:default"` permission added at line 17. Grants the necessary dialog API access.

**No issues found.**

### Cargo.toml (`src-tauri/Cargo.toml`)

`tauri-plugin-dialog = "2.6.0"` at line 23. Functional, correctly resolved by Cargo as `^2.6.0`. Minor visual inconsistency with other plugins using `"2"` — carried forward as LOW from Round 1, optional.

---

## Findings

No new findings in Round 2. All Round 1 MEDIUM fixes are correct and introduce no regressions.

---

## Verdict

| Metric | Value |
|--------|-------|
| Findings Total | 0 (new) |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 0 |
| Round 1 Fixes Verified | 3/3 |
| Round 1 LOW Unaddressed | 1 (optional, acceptable) |

**Decision:** `passed`

All three MEDIUM findings from Round 1 are correctly fixed. No new issues introduced. All 5 ACs are fully implemented with comprehensive test coverage (20 tests). Code follows all project conventions. Scope compliance verified — no out-of-scope file modifications.

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
