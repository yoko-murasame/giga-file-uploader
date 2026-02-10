# Review Report: Story 2-1 (Round 2)

**Story:** 2-1 - 文件拖拽输入与拖拽区交互
**Reviewer Persona:** Winston (BMM Architect)
**Review Round:** 2
**Review Strictness:** Normal (HIGH+MEDIUM must fix, LOW optional)
**Effective Strictness:** Normal (no degradation — Round 2)
**Degradation Applied:** none
**Verdict:** passed

---

## Test Results

| Suite | Result |
|-------|--------|
| Frontend (Vitest) | 43 passed, 0 failed (6 test files) |
| Rust (cargo test) | 21 passed, 0 failed |
| ESLint | Clean |
| Cargo Clippy | Clean |

---

## Round 1 Fix Verification

All 4 must-fix items from Round 1 have been correctly resolved:

### RR-001 [HIGH] Missing useDragDrop hook test file — FIXED

`src/hooks/useDragDrop.test.ts` created with 10 comprehensive tests covering:
- `onDragDropEvent` subscription on mount
- Unlisten called on unmount
- `isDragOver` state transitions for `over`, `cancel`, and `drop` events
- `handleDrop` calls `resolveDroppedPaths` then `addFiles`
- Empty paths array is a no-op
- `resolveDroppedPaths` rejection handled gracefully (console.error)
- `prefersReducedMotion` reflects `matchMedia` state (both true and false)

All 10 tests pass.

### RR-002 [MEDIUM] No error handling in handleDrop — FIXED

- `useDragDrop.ts:35-42`: `resolveDroppedPaths` call wrapped in try/catch with `console.error`
- `FileDropZone.tsx:54-61`: File input `resolveDroppedPaths` call wrapped in try/catch with `console.error`

Both async IPC boundaries now have proper error handling. Test `useDragDrop.test.ts` line 167-190 verifies the error path.

### RR-003 [MEDIUM] Blocking I/O on async tokio runtime — FIXED

`files.rs:70-75`: `resolve_dropped_paths` now wraps the blocking `resolve_paths_inner` call with `tokio::task::spawn_blocking`:

```rust
pub async fn resolve_dropped_paths(paths: Vec<String>) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || resolve_paths_inner(paths))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

The `JoinError` is properly mapped to `String` before the inner `AppError` mapping. Clean separation.

### RR-004 [MEDIUM] FileDropZone handleFileInput silent failure — FIXED

`FileDropZone.tsx:45-50`: The file path access now includes a `console.warn` when the `path` property is absent:

```typescript
const filePath = (file as unknown as { path?: string }).path;
if (filePath) {
  paths.push(filePath);
} else {
  console.warn('File input entry missing native path property:', file.name);
}
```

Silent failure eliminated. Developers will see the warning in console.

---

## New Findings (Round 2)

No new HIGH or MEDIUM issues found. Three LOW observations documented below.

### RR-006 [LOW] — Async event listener cleanup race condition in useDragDrop

**Category:** error-handling
**Affected files:** `src/hooks/useDragDrop.ts:47-69`

The `onDragDropEvent` setup uses an async promise pattern inside `useEffect`. If the component unmounts before the promise resolves, the cleanup function finds `unlisten` as `undefined` and the event listener is never unsubscribed:

```typescript
useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(handler)
      .then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };  // no-op if promise hasn't resolved
}, [handleDrop]);
```

The standard fix is a `cancelled` flag pattern:

```typescript
let cancelled = false;
// ...
.then((fn) => { if (cancelled) fn(); else unlisten = fn; });
return () => { cancelled = true; unlisten?.(); };
```

**Practical impact:** Minimal in this application — `FileDropZone` is mounted for the duration of the upload tab's lifecycle, and `handleDrop` has a stable reference (Zustand `addFiles` is referentially stable), so the effect runs once on mount. The race window (mount -> promise resolution) is also extremely short for local event registration. Not a regression from fixes.

---

### RR-007 [LOW] — Double unknown cast for Tauri File path property

**Category:** code-clarity
**Affected files:** `src/components/upload/FileDropZone.tsx:45`

```typescript
const filePath = (file as unknown as { path?: string }).path;
```

The double cast through `unknown` to access Tauri's non-standard `path` property on the `File` object is functional but fragile. The Round 1 fix (RR-004) correctly added the `console.warn` fallback. The optional suggestion to extract this to a typed utility in `src/types/upload.ts` remains open — can be addressed in Story 2.2 when the file input functionality is completed.

---

### RR-008 [LOW] — Type bypass in useDragDrop test

**Category:** test-quality
**Affected files:** `src/hooks/useDragDrop.test.ts:133`

```typescript
useUploadStore.setState({ addFiles: addFilesSpy } as never);
```

The `as never` cast bypasses Zustand's type checking for partial state updates. This is a common test pattern but masks potential type mismatches. A more type-safe alternative: use `useUploadStore.setState` with a complete state shape, or use `Partial<UploadState>`.

---

## AC Coverage Summary

| AC | Status | Notes |
|----|--------|-------|
| AC-1: Empty list drop zone | Implemented | Correct styling (dashed border, bg, text), layout (min-h-[320px] flex-1) |
| AC-2: Drag hover feedback | Implemented | Blue border + overlay via `isDragOver`, text changes to "松手即可添加" |
| AC-3: File drop add | Implemented | Error handling added (RR-002 fixed) |
| AC-4: Folder recursion | Implemented | spawn_blocking for I/O (RR-003 fixed), hidden/system file filtering |
| AC-5: Append drag | Implemented | Collapsed state (h-12), append behavior, full-window drag target |
| AC-6: Accessibility | Implemented | role="button", aria-label="添加文件", tabIndex=0, Enter/Space keyboard |
| AC-7: Reduced motion | Implemented | useSyncExternalStore + conditional transition class |

All 7 ACs fully implemented and verified.

## Review Summary

- **Findings total:** 3 (new in Round 2)
- **HIGH:** 0
- **MEDIUM:** 0
- **LOW:** 3 (RR-006: async cleanup race, RR-007: double cast, RR-008: test type bypass)
- **Must-fix count:** 0
- **Round 1 fixes verified:** 4/4 all correct

All Round 1 must-fix items (1 HIGH + 3 MEDIUM) have been correctly resolved. The fixes are clean and do not introduce new issues. Test coverage increased from 33 to 43 frontend tests with the addition of the 10-test useDragDrop hook test file. All 7 ACs are fully implemented. The codebase is architecturally sound with proper separation between Tauri events, UI, state management, and backend file resolution.
