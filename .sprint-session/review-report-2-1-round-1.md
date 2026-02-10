# Review Report: Story 2-1 (Round 1)

**Story:** 2-1 - 文件拖拽输入与拖拽区交互
**Reviewer Persona:** Winston (BMM Architect)
**Review Round:** 1
**Review Strictness:** Normal (HIGH+MEDIUM must fix, LOW optional)
**Verdict:** needs-fix

---

## Test Results

| Suite | Result |
|-------|--------|
| Frontend (Vitest) | 33 passed, 0 failed |
| Rust (cargo test) | 21 passed, 0 failed |
| ESLint | Clean |
| Cargo Clippy | Clean |

---

## Findings

### RR-001 [HIGH] — Missing useDragDrop hook test file

**Category:** test-coverage
**Affected files:** `src/hooks/useDragDrop.test.ts` (missing)
**AC affected:** AC-2 (dragover feedback), AC-3 (file drop), AC-4 (folder resolution), AC-7 (reduced-motion)

The Story File Scope explicitly lists `src/hooks/useDragDrop.test.ts` as a required new file. The `useDragDrop` hook is the core integration point — it manages Tauri native drag-drop event subscriptions, async path resolution via `resolveDroppedPaths`, store updates via `addFiles`, and `prefers-reduced-motion` detection. None of this logic has dedicated test coverage.

The `FileDropZone.test.tsx` mocks away `@/lib/tauri` entirely, so the actual hook behavior (event subscription lifecycle, `handleDrop` async flow, `useSyncExternalStore` for reduced-motion) is never exercised.

**Fix instruction:** Create `src/hooks/useDragDrop.test.ts` with tests covering:
- `onDragDropEvent` subscription and cleanup (unlisten called on unmount)
- `isDragOver` state transitions for `over`, `drop`, and cancel events
- `handleDrop` calls `resolveDroppedPaths` then `addFiles`
- `handleDrop` with empty paths array is a no-op
- `prefersReducedMotion` reflects `matchMedia` state

---

### RR-002 [MEDIUM] — No error handling in handleDrop for resolveDroppedPaths failure

**Category:** error-handling
**Affected files:** `src/hooks/useDragDrop.ts:33-39`, `src/components/upload/FileDropZone.tsx:50-55`
**AC affected:** AC-3 (file drop), AC-4 (folder resolution)

`useDragDrop.ts` line 33-39:
```typescript
const handleDrop = useCallback(
  async (paths: string[]) => {
    if (paths.length === 0) return;
    const entries = await resolveDroppedPaths(paths);
    // ...
  },
  [addFiles],
);
```

`resolveDroppedPaths` invokes the Rust backend which can fail (path doesn't exist, permission denied, I/O errors). The `await` has no `try/catch` — an unhandled promise rejection provides zero user feedback and silently drops files.

The same pattern appears in `FileDropZone.tsx:50-55` for the file input `onChange` handler.

**Fix instruction:** Wrap both `resolveDroppedPaths` calls in try/catch blocks. At minimum, log the error with `console.error`. For user-facing feedback, consider a brief toast or status message (can be deferred to a later Story if toast infrastructure doesn't exist yet, but the catch block must exist now).

---

### RR-003 [MEDIUM] — Blocking I/O on async tokio runtime in resolve_dropped_paths

**Category:** performance
**Affected files:** `src-tauri/src/commands/files.rs:70-88`
**AC affected:** AC-4 (folder recursive traversal)

The Tauri command `resolve_dropped_paths` is `pub async fn` which runs on the tokio async runtime. It delegates to `resolve_paths_inner` which performs blocking `std::fs::metadata()`, `std::fs::read_dir()`, and recursive directory traversal — all synchronous I/O. For deeply nested directories with thousands of files, this blocks the tokio event loop thread, potentially stalling other async tasks (future upload operations, event listeners).

**Fix instruction:** Wrap the blocking I/O call with `tokio::task::spawn_blocking`:

```rust
#[tauri::command]
pub async fn resolve_dropped_paths(paths: Vec<String>) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || resolve_paths_inner(paths))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| e.to_string())
}
```

---

### RR-004 [MEDIUM] — FileDropZone handleFileInput relies on undocumented File.path property with silent failure

**Category:** error-handling
**Affected files:** `src/components/upload/FileDropZone.tsx:45-47`
**AC affected:** AC-3 (file click-to-select)

```typescript
if ((file as unknown as { path?: string }).path) {
  paths.push((file as unknown as { path?: string }).path as string);
}
```

This double-cast through `unknown` accesses a non-standard `path` property on the `File` object. If the property is absent (e.g., certain Tauri WebView configurations, or future Tauri API changes), the `paths` array stays empty, `resolveDroppedPaths` is never called, and the user gets zero feedback that their file selection was silently ignored. The Story notes this is "基础骨架" for Story 2.2, but even skeletal code should not silently fail.

**Fix instruction:** Add a `console.warn` when the path property is absent so the failure is at least visible in dev tools. Consider extracting the Tauri File path type into a utility or typed wrapper in `src/types/upload.ts` to avoid the double `unknown` cast.

---

### RR-005 [LOW] — Out-of-scope file modifications

**Category:** scope-compliance
**Affected files:** `src/test/setup.ts`, `src/App.test.tsx`, `src/components/shared/TabNav.test.tsx`

These three files are not listed in the Story's File Scope section (neither "New Files" nor "Modified Files"). The changes are understandable — `setup.ts` adds Tauri API mocks needed by the new components, and the test files update assertions to match the new UploadPage content. However, this is technically a scope compliance violation.

**Fix instruction:** (Optional) No code change required — this is an acceptable scope extension for test infrastructure maintenance. Acknowledge in Story completion notes.

---

## AC Coverage Summary

| AC | Status | Notes |
|----|--------|-------|
| AC-1: Empty list drop zone | Implemented | Correct styling, text, layout |
| AC-2: Drag hover feedback | Implemented | Blue border + overlay via isDragOver state |
| AC-3: File drop add | Implemented | Missing error handling (RR-002) |
| AC-4: Folder recursion | Implemented | Blocking I/O concern (RR-003) |
| AC-5: Append drag | Implemented | Collapsed state + append behavior correct |
| AC-6: Accessibility | Implemented | role, aria-label, keyboard Enter/Space |
| AC-7: Reduced motion | Implemented | useSyncExternalStore + conditional transition class |

## Review Summary

- **Findings total:** 5
- **HIGH:** 1 (RR-001: missing hook test file)
- **MEDIUM:** 3 (RR-002: unhandled async errors, RR-003: blocking I/O on tokio, RR-004: silent file input failure)
- **LOW:** 1 (RR-005: out-of-scope test files)
- **Must-fix count:** 4 (1 HIGH + 3 MEDIUM)

The implementation is architecturally sound — clean separation between Tauri events (useDragDrop), UI presentation (FileDropZone), state management (uploadStore), and backend file resolution (commands/files.rs). All ACs are functionally implemented. The primary concerns are (1) missing dedicated hook tests and (2) absent error handling on async IPC boundaries.
