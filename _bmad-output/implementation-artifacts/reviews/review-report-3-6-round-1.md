# Story 3-6 Code Review Report -- Round 1

## Review Parameters

| Parameter | Value |
|-----------|-------|
| Story Key | 3-6 |
| Review Round | 1 |
| Session ID | sprint-2026-02-11-001 |
| Reviewer Persona | BMM Architect (Winston) |
| Configured Strictness | strict |
| Effective Strictness | strict (all severities enforced) |
| Degradation Applied | none |

## Checklist Evaluation

| # | Checklist Item | Result | Notes |
|---|----------------|--------|-------|
| 1 | AC Satisfaction | PASS with notes | All 9 ACs implemented in code. Test coverage gaps in AC-5 and AC-6 (see RR-001, RR-002). |
| 2 | Test Coverage | NEEDS-FIX | Missing callback behavior tests for new events (RR-001), missing timer reset test (RR-002), missing UploadFileItem completed UI tests (RR-005). |
| 3 | Error Handling | PASS with note | CopyButton has try/catch, Rust error paths emit events, store guards non-existent tasks. Timer cleanup on unmount missing (RR-003). |
| 4 | Security Baseline | PASS | No hardcoded credentials. Clipboard uses standard Web API. Links use `rel="noopener noreferrer"`. |
| 5 | Performance Baseline | PASS | `navigator.clipboard.writeText()` is inherently fast (<200ms, satisfies NFR3). No unbounded iterations. |
| 6 | Scope Compliance | PASS | All changes within declared file scope. No modifications to forbidden files. |

## Findings Summary

| Total | HIGH | MEDIUM | LOW | After Filter |
|-------|------|--------|-----|-------------|
| 5 | 0 | 3 | 2 | 5 (strict: all reported) |

## Findings

### RR-001 [MEDIUM] -- Test Coverage: useUploadEvents missing callback tests for new events

- **Category:** test-coverage
- **AC Reference:** AC-5, AC-9
- **Affected files:** `src/hooks/useUploadEvents.test.ts`
- **Description:** The existing tests verify that `upload:file-complete` and `upload:all-complete` listeners are registered (line 39-40) and cleaned up on unmount (line 48: expects 4 unlisteners), but do NOT test the actual callback behavior. The test file has callback behavior tests for `upload:progress` (lines 58-89) and `upload:error` (lines 91-122) that simulate event payloads and verify store mutations, but no equivalent tests verify that the `upload:file-complete` callback calls `setTaskFileComplete` correctly, or that `upload:all-complete` calls `setAllComplete`. This is inconsistent with the testing pattern established for the two existing events and leaves AC-5 callback logic partially unverified.
- **Fix instruction:** Add two test cases to `useUploadEvents.test.ts`:
  1. "should call setTaskFileComplete when file-complete event is received" -- set up an active task, trigger the `upload:file-complete` mock callback with `{ taskId, downloadUrl }` payload, verify `activeTasks[taskId].status === 'completed'`, `downloadUrl` is set, `fileProgress === 100`.
  2. "should call setAllComplete when all-complete event is received" -- trigger the `upload:all-complete` mock callback, verify `useUploadStore.getState().allUploadsComplete === true`.

### RR-002 [MEDIUM] -- Test Coverage: CopyButton 1.5s timer icon reset not tested

- **Category:** test-coverage
- **AC Reference:** AC-6
- **Affected files:** `src/components/shared/CopyButton.test.tsx`
- **Description:** AC-6 specifies "复制成功后图标变为勾号（Lucide React Check），1.5 秒后恢复为复制图标". The test verifies the initial state change (aria-label changes to "已复制" in the "should change aria-label" test) but does NOT verify that after 1.5 seconds the aria-label/icon reverts to "复制链接". This leaves half of the icon toggle lifecycle untested.
- **Fix instruction:** Add a test case using `vi.useFakeTimers()`:
  1. Click the button, verify aria-label is "已复制"
  2. Advance timers by 1500ms via `vi.advanceTimersByTime(1500)`
  3. Verify aria-label reverts to "复制链接"
  4. Call `vi.useRealTimers()` in cleanup

### RR-003 [MEDIUM] -- Resource Leak: CopyButton timer not cleaned up on unmount

- **Category:** error-handling
- **AC Reference:** AC-6
- **Affected files:** `src/components/shared/CopyButton.tsx`
- **Description:** The `setTimeout` in `handleCopy` (line 21) stores its timer ID in `timerRef`, but there is no `useEffect` cleanup that clears this timer on unmount. If the component unmounts while the 1.5s timer is pending (e.g., user starts a new upload batch while the icon is in "已复制" state), the timer fires and calls `setCopied(false)` on an unmounted component. While React 18 tolerates this without console errors, the timer itself is a resource leak and the pattern is inconsistent with React cleanup best practices. Story 4.2 will reuse this component in the history list, amplifying the potential for unmount-during-timer scenarios.
- **Fix instruction:** Add a `useEffect` cleanup in `CopyButtonInner` to clear the pending timer on unmount:
  ```typescript
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  ```

### RR-004 [LOW] -- State Reset: useUploadEvents.test.ts beforeEach incomplete

- **Category:** code-clarity
- **AC Reference:** AC-9
- **Affected files:** `src/hooks/useUploadEvents.test.ts`
- **Description:** Line 29 resets state as `{ pendingFiles: [], activeTasks: {} }` but omits `allUploadsComplete: false`. This is inconsistent with `uploadStore.test.ts` line 16 which properly resets all three state fields. While this doesn't cause test failures today, adding the callback tests per RR-001 will require this field to be properly reset between tests.
- **Fix instruction:** Update line 29 to include `allUploadsComplete: false`:
  ```typescript
  useUploadStore.setState({ pendingFiles: [], activeTasks: {}, allUploadsComplete: false });
  ```

### RR-005 [LOW] -- Test Coverage: UploadFileItem completed state UI untested

- **Category:** test-coverage
- **AC Reference:** AC-8
- **Affected files:** `src/components/upload/UploadFileItem.test.tsx`
- **Description:** Story 3-6 adds significant conditional rendering to UploadFileItem: green progress bar (`bg-success`), CheckCircle2 icon replacing percentage, download link with Tooltip, CopyButton integration, and hiding shard details on completion. None of these UI behaviors have test coverage. While AC-9 does not explicitly list UploadFileItem tests, the component now has substantial untested conditional rendering paths that are central to Story 3-6's user-facing functionality.
- **Fix instruction:** Add at least two test cases to `UploadFileItem.test.tsx`:
  1. "should show CheckCircle2 icon and download link when task is completed with downloadUrl" -- set up activeTasks with completed status and downloadUrl, verify the link and copy button are rendered.
  2. "should hide shard details when task is completed" -- set up a completed multi-shard task, verify shard expansion UI is not rendered.

## Verdict

**NEEDS-FIX** -- 5 findings (3 MEDIUM, 2 LOW). All must be addressed in strict mode.

Primary concern: Test coverage gaps across three test files. The implementation code itself is solid -- well-structured, follows project conventions, and correctly implements all ACs. The findings are concentrated in insufficient test coverage for the new behaviors.
