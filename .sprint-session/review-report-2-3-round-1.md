# Code Review Report — Story 2-3 (Round 1)

| Field | Value |
|-------|-------|
| Story | 2-3: 待上传文件列表预览与管理 |
| Reviewer | BMM Architect (Winston) |
| Round | 1 |
| Session | sprint-2026-02-11-002 |
| Strictness | Normal (HIGH+MEDIUM must fix, LOW optional) |
| Verdict | **needs-fix** |

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 3 |
| **Total** | **6** |
| **Must Fix** | **3** (MEDIUM) |

All 71 tests pass. Code structure, import order, naming conventions, and Zustand usage all comply with project rules. The primary gaps are: (1) a missing CSS class that breaks the intended removal collapse animation, (2) insufficient test coverage for the removal animation behavior, and (3) missing test coverage for `prefers-reduced-motion` — both of which are explicit AC requirements.

---

## Findings

### RR-001 [MEDIUM] — Missing `overflow-hidden` breaks removal collapse animation

**Category:** UI Defect
**File:** `src/components/upload/UploadFileItem.tsx:38`
**AC:** AC-3 (删除文件 — 列表项淡出消失, opacity + height 过渡)

The `<li>` element transitions `max-height` from `max-h-12` to `max-h-0` on removal, but the element lacks `overflow-hidden`. Without it:

- Content overflows the container even when `max-height` is 0
- The height collapse portion of the animation has no visual effect — items below "jump" instead of smoothly sliding up
- Invisible overflowing content (opacity-0) may intercept pointer events for the 200ms animation window

```tsx
// Current (line 38-40):
className={`flex h-12 items-center gap-3 rounded-md px-3 transition-[opacity,max-height] duration-200 ${
  isRemoving ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'
}`}
```

**Fix:** Add `overflow-hidden` to the `<li>` className:

```tsx
className={`flex h-12 items-center gap-3 overflow-hidden rounded-md px-3 transition-[opacity,max-height] duration-200 ${
  isRemoving ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'
}`}
```

---

### RR-002 [MEDIUM] — Missing test coverage for removal animation CSS state

**Category:** Test Coverage
**File:** `src/components/upload/UploadFileItem.test.tsx`
**AC:** AC-3 (列表项淡出消失, 200ms transition, CSS opacity + height 过渡)

The test at line 58-74 verifies that `onRemove` is eventually called with the correct `id`, but does not verify the intermediate animation state. AC-3 explicitly requires CSS opacity + height transition on removal. There is no test asserting that:

1. After clicking delete, the `<li>` element receives `opacity-0` and `max-h-0` classes
2. The element is still in the DOM during the 200ms animation window (before `onRemove` fires)

**Fix:** Add a test case:

```tsx
it('should apply removal animation classes after clicking delete', async () => {
  const user = userEvent.setup();
  render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

  const listItem = screen.getByRole('listitem');
  expect(listItem).toHaveClass('opacity-100');

  const deleteButton = screen.getByRole('button', { name: /删除/ });
  await user.click(deleteButton);

  expect(listItem).toHaveClass('opacity-0');
  expect(listItem).toHaveClass('max-h-0');
});
```

---

### RR-003 [MEDIUM] — Missing test for `prefers-reduced-motion` immediate removal

**Category:** Test Coverage
**File:** `src/components/upload/UploadFileItem.test.tsx`
**AC:** AC-6 (无障碍), Story Technical Notes (prefers-reduced-motion)

The Story spec explicitly requires respecting `prefers-reduced-motion: reduce` — when enabled, the animation must be skipped and `onRemove` called immediately (no `setTimeout`). There is no test for this behavior. The current test setup mocks `matchMedia` to return `matches: false` (no reduced motion), but never tests the `matches: true` path.

**Fix:** Add a test case that temporarily mocks `window.matchMedia` to return `matches: true`:

```tsx
it('should call onRemove immediately when prefers-reduced-motion is enabled', async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });

  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<UploadFileItem {...defaultProps} onRemove={onRemove} />, { wrapper: Wrapper });

  const deleteButton = screen.getByRole('button', { name: /删除/ });
  await user.click(deleteButton);

  // Should be called immediately, no setTimeout
  expect(onRemove).toHaveBeenCalledWith('test-id-1');

  window.matchMedia = originalMatchMedia;
});
```

---

### RR-004 [LOW] — `window.matchMedia` called on every render

**Category:** Performance
**File:** `src/components/upload/UploadFileItem.tsx:23-25`

`prefersReducedMotion` is computed inline during render, calling `window.matchMedia()` each time the component renders. While mitigated by `React.memo` (renders are infrequent for unchanged props), this creates a new `MediaQueryList` object each render. The Story spec Task 3.8 suggests `useSyncExternalStore` or `matchMedia` — the latter is used but without caching.

**Fix (optional):** Wrap in a module-level helper or `useMemo`:

```tsx
const prefersReducedMotion = useMemo(
  () => typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  [],
);
```

---

### RR-005 [LOW] — Missing test for formatted file sizes in UploadFileList

**Category:** Test Coverage
**File:** `src/components/upload/UploadFileList.test.tsx`

The test verifies file names are displayed (line 46-52) but does not verify formatted file sizes. The mock data includes `1048576` (1 MB), `2097152` (2 MB), and `1073741824` (1 GB) — none of the expected formatted strings (`"1.0 MB"`, `"2.0 MB"`, `"1.00 GB"`) are asserted.

**Fix (optional):** Add size assertions to the existing test or a new test case.

---

### RR-006 [LOW] — No test for Tooltip hover behavior

**Category:** Test Coverage
**File:** `src/components/upload/UploadFileItem.test.tsx`
**AC:** AC-1 (文件名过长时截断显示, 鼠标悬停时通过 Tooltip 显示完整名称)

AC-1 requires a Tooltip to show the full file name on hover for truncated names. No test verifies this interaction. The truncate CSS class is tested (line 43-56), but the Tooltip popup content is never asserted after hover.

**Fix (optional):** Add a hover interaction test using `userEvent.hover()` and assert the Tooltip content appears.

---

## AC Coverage Matrix

| AC | Status | Notes |
|----|--------|-------|
| AC-1: 文件列表展示 | Partial | File name + size display OK. Tooltip present but untested (RR-006). `<ul>/<li>` semantic structure OK. `h-12` height OK. |
| AC-2: 文件大小格式化 | Pass | `formatFileSize` correct with good test coverage. |
| AC-3: 删除文件 | Partial | Delete button + `onRemove` work. Animation broken due to missing `overflow-hidden` (RR-001). Animation not tested (RR-002). |
| AC-4: 删除后队列为空恢复拖拽区 | Pass | `UploadPage` correctly uses `hasFiles` conditional rendering. |
| AC-5: React.memo 优化 | Pass | `UploadFileItem` wrapped with `memo()`. |
| AC-6: 无障碍 | Partial | `aria-label` correct. `prefers-reduced-motion` implemented but untested (RR-003). Focus management after deletion not tested. |

## Scope Compliance

No files outside the declared scope were modified. All new files match the File Scope declaration in the Story spec.

## Recommendation

**Verdict: needs-fix** — 3 MEDIUM findings require attention before approval. The animation defect (RR-001) is a one-line fix. The test gaps (RR-002, RR-003) are important because they cover explicit AC requirements.
