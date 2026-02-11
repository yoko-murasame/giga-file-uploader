# Code Review Report: Story 3-7 (Round 1)

## Review Metadata

| Field | Value |
|-------|-------|
| Story Key | 3-7 |
| Story Title | 底部操作栏与上传触发按钮 |
| Review Round | 1 |
| Session ID | sprint-2026-02-11-002 |
| Reviewer Persona | BMM Architect (Winston) |
| Strictness Threshold | low (strict -- all findings >= LOW reported) |
| Degradation Applied | none |
| Verdict | **needs-fix** |

## Automated Checks

| Check | Result |
|-------|--------|
| `pnpm test` | PASS (12 files, 114 tests passed) |
| `pnpm lint` | PASS (no errors) |

## AC Coverage Matrix

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC-1 | 底部操作栏基础布局与文件统计 | PARTIAL | 布局/统计/按钮样式正确，但按钮高度 py-1.5 (~32px) 与 AC 规定 36px 不符 (见 RR-002) |
| AC-2 | 空队列禁用状态 | PASS | !hasPendingFiles && !hasActiveTasks 时返回 null |
| AC-3 | 上传触发 | PARTIAL | startUpload(7) 正确调用，但缺少立即禁用机制 (见 RR-001) |
| AC-4 | 上传进行中禁用状态 | PASS | isUploading 判断正确，统计文本格式正确 |
| AC-5 | 全部上传完成状态 | PASS | completedCount 统计、Secondary 样式、clearCompletedTasks 调用均正确 |
| AC-6 | uploadStore clearCompletedTasks | PASS | interface 声明 + 实现均正确 |
| AC-7 | 组件结构与定位 | PASS | 文件位置、sticky 定位、flex 布局、padding 均符合 |
| AC-8 | 无障碍属性 | PASS | nav + aria-label, button disabled + aria-disabled, aria-live="polite" |
| AC-9 | 单元测试 | PASS | 7 项测试用例全覆盖，含额外无障碍验证 |

## Findings

### RR-001 [MEDIUM] -- AC-3: [开始上传] 按钮点击后未立即禁用，存在双击竞态

**Category:** functional-defect
**Affected Files:** `src/components/upload/UploadActionBar.tsx`

**Description:**

AC-3 明确要求："按钮状态立即切换为禁用（防止重复点击）"。当前实现中，按钮的 `disabled` 状态依赖 store 派生值 `isUploading`（`activeTaskList.some(t => t.status === 'uploading')`），该值仅在 `startUpload` 异步 IPC 调用完成、store 状态更新后才变为 `true`。

竞态时间线：
1. 用户点击 -> `handleStartUpload()` -> `startUpload(7)` 开始执行
2. `startUpload` 内部: 同步读取 `pendingFiles`，然后 `await startUploadIpc(files, { lifetime })` 等待 Rust IPC
3. **等待期间**：store 状态未变，`isUploading` 仍为 `false`，按钮仍然可点击
4. 用户再次点击 -> 第二次 `startUpload(7)` 读取相同的 `pendingFiles`（尚未清空）
5. 两次 IPC 调用可能导致重复上传任务创建

**Fix Instruction:**

在 `handleStartUpload` 中添加本地 loading 状态防止重复点击：

```tsx
const [isStarting, setIsStarting] = useState(false);

const handleStartUpload = async () => {
  setIsStarting(true);
  try {
    await startUpload(7);
  } finally {
    setIsStarting(false);
  }
};

const isStartDisabled = isStarting || !hasPendingFiles || isUploading;
```

需要添加 `import { useState } from 'react';`。测试中也需要对应验证点击后按钮立即禁用。

---

### RR-002 [LOW] -- AC-1: 按钮高度与 AC 规格偏差

**Category:** spec-compliance
**Affected Files:** `src/components/upload/UploadActionBar.tsx`

**Description:**

AC-1 规定 [开始上传] 按钮 "高 36px"。当前两个按钮均使用 `py-1.5 text-sm`：
- `py-1.5` = 0.375rem = 6px each side = 12px vertical padding
- `text-sm` = line-height 1.25rem = 20px
- 实际按钮高度 = 12 + 20 = **32px**（差 4px）

注：Story 的 Technical Design 代码模板中也使用 `py-1.5`，因此存在 AC 正文与 Technical Design 的内部不一致。

**Fix Instruction:**

将两个按钮的 `py-1.5` 改为 `py-2`（0.5rem = 8px each side，总 padding 16px + line-height 20px = 36px），使实际高度与 AC 规格一致：

```
- className="... py-1.5 ..."
+ className="... py-2 ..."
```

两处均需修改（[开始上传] 按钮和 [清空列表] 按钮）。

---

### RR-003 [LOW] -- Edge Case: error 状态任务导致操作栏显示异常

**Category:** edge-case
**Affected Files:** `src/components/upload/UploadActionBar.tsx`

**Description:**

当所有 `activeTasks` 处于 `status === 'error'` 状态（上传全部失败），且 `pendingFiles` 已被清空时：
- `hasActiveTasks = true` -> 组件渲染（不返回 null）
- `allUploadsComplete = false` -> 不走完成分支
- `isUploading = false`（没有 uploading 状态的 task）-> 不走上传中分支
- 落入 else 分支 -> `statsText = "0 个文件，0 B"`
- `isStartDisabled = true`（!hasPendingFiles）

用户看到 "0 个文件，0 B" + 灰色禁用按钮，无法清空错误任务，操作栏处于死状态。

注：此场景可能属于后续 Story 的错误处理 UI 范畴。但当前代码在此边界条件下产生了不可恢复的 UI 状态。

**Fix Instruction:**

建议添加 error 状态分支处理（在 `allUploadsComplete` 和 `isUploading` 判断之间）：

```tsx
const errorCount = activeTaskList.filter((t) => t.status === 'error').length;
const allFailed = hasActiveTasks && !isUploading && errorCount === activeTaskList.length;

if (allUploadsComplete) {
  statsText = `${completedCount} 个文件上传完成`;
} else if (isUploading) {
  statsText = `${activeTaskList.length} 个文件上传中`;
} else if (allFailed) {
  statsText = `${errorCount} 个文件上传失败`;
} else {
  // pending state
}
```

同时在 `allFailed` 状态下也显示 [清空列表] 按钮（复用 `clearCompletedTasks` 语义），或者将该发现记录为后续 Story 的已知限制。

---

## Review Checklist Summary

| Checklist Item | Result | Notes |
|----------------|--------|-------|
| AC Satisfaction | PARTIAL | AC-3 immediate disable gap (RR-001), AC-1 height mismatch (RR-002) |
| Test Coverage | PASS | AC-9 所有测试用例完整覆盖，含无障碍验证 |
| Error Handling | PARTIAL | Error task edge case (RR-003) |
| Security Baseline | PASS | 无硬编码凭证、无 XSS 向量 |
| Performance Baseline | PASS | 无 N+1、无无界循环 |
| Scope Compliance | PASS | 修改文件均在声明范围内，无越界 |

## Code Quality Observations (non-findings)

以下为审查过程中确认符合规范的要点（非 finding，仅作记录）：

- **Zustand 选择器模式**: 5 个独立精确选择器，无整体解构，符合项目规范
- **Tailwind 使用**: 无独立 CSS 文件，使用 @theme token (bg-surface, border-border, bg-brand, text-text-primary, text-text-secondary)
- **Import 顺序**: 外部 -> 内部 @/ -> type，符合 CLAUDE.md 规范
- **命名规范**: handleStartUpload / handleClearCompleted 符合 handle{Event} 约定
- **语义 HTML**: `<nav aria-label>`, 原生 `<button>`, `aria-live="polite"` 均正确
- **组件结构**: 内部可见性控制（return null），不需要父组件传 prop 控制，设计简洁
- **Store 实现**: clearCompletedTasks 一行式实现，语义清晰，与 clearFiles 职责分离

## Findings Summary

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| RR-001 | MEDIUM | functional-defect | [开始上传] 点击后未立即禁用，async IPC 期间存在双击竞态 |
| RR-002 | LOW | spec-compliance | 按钮高度 ~32px 与 AC-1 规格 36px 不符 |
| RR-003 | LOW | edge-case | error 状态任务导致操作栏 "0 个文件，0 B" 死状态 |

**Total:** 3 findings (1 MEDIUM, 2 LOW)
**After filter (threshold=low):** 3 findings remain
**Verdict:** needs-fix
