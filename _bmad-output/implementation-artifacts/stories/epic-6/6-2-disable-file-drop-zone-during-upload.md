# Story 6.2: 上传中文件添加区禁用

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-2 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | 无（独立交互修复，不依赖其他 Story） |
| FRs 覆盖 | 无（体验优化，非新增功能） |
| NFRs 关联 | 无 |

## User Story

As a 用户,
I want 上传进行中时无法通过拖拽或点击添加新文件,
So that 不会误操作导致上传状态混乱。

---

## Acceptance Criteria

### AC-1: 上传进行中时拖拽操作被阻止

**Given** 用户已点击"开始上传"，上传正在进行中（`activeTasks` 中存在 status 为 `'uploading'` 的任务）
**When** 用户尝试拖拽文件到窗口
**Then** 拖拽操作被阻止，文件不会被添加到队列
**And** 拖拽区视觉降低透明度（`opacity-50`）并显示 `cursor-not-allowed`

### AC-2: 上传进行中时点击操作被禁用

**Given** 上传正在进行中
**When** 用户尝试点击拖拽区打开文件选择器
**Then** 点击无响应，文件选择器不会打开
**And** 组件添加 `aria-disabled="true"` 无障碍属性
**And** `tabIndex` 设为 `-1`，移除键盘焦点

### AC-3: 上传完成或清空后恢复正常交互

**Given** 所有文件上传完成（`allUploadsComplete === true`）或用户清空已完成任务列表（`activeTasks` 为空）
**When** 回到初始状态
**Then** 拖拽区恢复正常交互：可点击、可拖拽、正常透明度、`cursor-pointer`、`aria-disabled` 移除

---

## Technical Design

### 现状分析

当前实现中没有"上传进行中"的禁用机制：

1. **`useDragDrop.ts`**：无条件监听 Tauri 原生拖拽事件，收到 `drop` 事件即调用 `addFiles`，无法根据上传状态阻止文件添加
2. **`FileDropZone.tsx`**：无条件响应 `onClick` 和 `onKeyDown`，始终可以打开文件选择器
3. **`uploadStore.ts`**：已有 `activeTasks` 和 `allUploadsComplete` 状态，可以派生"是否正在上传"的判断，无需新增 store 字段

### 禁用状态判断

"正在上传"的条件：`activeTasks` 中存在至少一个 status 为 `'uploading'` 的任务。

```typescript
// 在 UploadPage.tsx 中派生
const isUploading = useUploadStore(
  (s) => Object.values(s.activeTasks).some((t) => t.status === 'uploading')
);
```

选择 `some(t => t.status === 'uploading')` 而非 `Object.keys(activeTasks).length > 0`，因为：
- 当所有任务都 `completed` 或 `error` 但尚未清空时，`activeTasks` 仍有内容，但此时应允许用户继续添加文件
- `allUploadsComplete` 标志由 `setAllComplete` 设置，时机上可能有延迟，直接检查 task status 更精确

### 修复方案

```
UploadPage.tsx          -- 派生 isUploading，传入 FileDropZone
    |
    v
FileDropZone.tsx        -- 接收 disabled prop，控制 click/keyboard/视觉/aria
    |
    v
useDragDrop.ts          -- 接收 disabled 参数，drop 时 early return
```

### 设计决策

1. **禁用逻辑放在 `UploadPage` 而非 `FileDropZone` 内部**：FileDropZone 不应直接依赖 uploadStore 的上传状态，保持组件职责单一。由 UploadPage 作为容器组件负责状态派生和 prop 传递。

2. **`useDragDrop` 添加 `disabled` 参数**：hook 内部在 `handleDrop` 中 early return，避免在 disabled 状态下处理拖拽文件。视觉上仍然可以显示 `isDragOver` 状态变化（不阻止 `over` 事件），但 `drop` 时不执行 `addFiles`。这样用户能看到"拖到了但被拒绝"的反馈。

3. **视觉反馈使用 `opacity-50 cursor-not-allowed`**：直观告知用户当前无法操作。collapsed 和 expanded 两种模式都需要应用。

4. **不修改 `uploadStore`**：无需新增 store 字段或 action，所有判断通过 selector 派生。

---

## Tasks

### Task 1: 修改 useDragDrop hook 支持 disabled 参数

**依赖:** 无

**Subtasks:**

1.1. 在 `src/hooks/useDragDrop.ts` 中，为 `useDragDrop` 函数添加可选参数 `options?: { disabled?: boolean }`
1.2. 在 `handleDrop` 回调函数体开头，添加 early return 判断：如果 `options?.disabled` 为 `true`，直接 return 不执行 `addFiles`
1.3. 注意：`handleDrop` 的 `useCallback` 依赖数组需要包含 `disabled` 值

**验证:** hook 在 disabled 为 true 时，drop 事件不会触发文件添加

### Task 2: 修改 FileDropZone 支持 disabled prop

**依赖:** Task 1

**Subtasks:**

2.1. 在 `src/components/upload/FileDropZone.tsx` 的 `FileDropZoneProps` 接口中，添加 `disabled?: boolean` 属性
2.2. 将 `disabled` 从 props 解构中提取：`{ collapsed = false, disabled = false }`
2.3. 将 `disabled` 传递给 `useDragDrop`：`useDragDrop({ disabled })`
2.4. 修改 `handleClick`：在函数体开头添加 `if (disabled) return;` 的 early return
2.5. 修改 `handleKeyDown`：在函数体开头添加 `if (disabled) return;` 的 early return
2.6. 在 collapsed 模式的 `<div>` 上：
   - 添加条件 `aria-disabled={disabled || undefined}`（disabled 为 false 时不渲染此属性）
   - `tabIndex` 改为 `{disabled ? -1 : 0}`
   - className 中添加条件样式：`disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'`（移除原有的固定 `cursor-pointer`）
   - 移除 disabled 时的 hover 效果：将 `hover:border-brand` 改为条件 `${!disabled ? 'hover:border-brand' : ''}`
2.7. 在 expanded 模式的 `<div>` 上，应用相同的 disabled 处理：
   - 添加条件 `aria-disabled={disabled || undefined}`
   - `tabIndex` 改为 `{disabled ? -1 : 0}`
   - className 中添加条件样式：`disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'`（移除原有的固定 `cursor-pointer`）

**验证:** FileDropZone 在 disabled 为 true 时：click/keyboard 无响应、视觉降低透明度、光标变为 not-allowed、aria-disabled 正确设置

### Task 3: 在 UploadPage 中派生 isUploading 并传入 FileDropZone

**依赖:** Task 2

**Subtasks:**

3.1. 在 `src/components/upload/UploadPage.tsx` 中，添加 `isUploading` selector：
```typescript
const isUploading = useUploadStore(
  (s) => Object.values(s.activeTasks).some((t) => t.status === 'uploading')
);
```
3.2. 将 `disabled={isUploading}` 传入 `<FileDropZone>`：
```tsx
<FileDropZone collapsed={hasFiles} disabled={isUploading} />
```

**验证:** 上传进行中时 FileDropZone 被禁用，所有上传完成/出错后恢复

### Task 4: 手动验证（人工测试）

**依赖:** Task 1, 2, 3

**Subtasks:**

4.1. 运行 `pnpm tauri dev`，添加文件并开始上传
4.2. 上传进行中：确认拖拽文件到窗口不会添加新文件
4.3. 上传进行中：确认点击拖拽区不会打开文件选择器
4.4. 上传进行中：确认拖拽区显示降低透明度和 not-allowed 光标
4.5. 上传进行中：使用屏幕阅读器或检查 DOM，确认 `aria-disabled="true"` 存在
4.6. 所有上传完成后：确认拖拽区恢复正常交互
4.7. 清空已完成任务后：确认拖拽区恢复正常交互

---

## Task 依赖顺序

```
Task 1 (useDragDrop disabled 参数)
    |
    v
Task 2 (FileDropZone disabled prop)
    |
    v
Task 3 (UploadPage 派生 isUploading)
    |
    v
Task 4 (手动验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/hooks/useDragDrop.ts` | 添加 `disabled` 可选参数，drop 时 early return |
| `src/components/upload/FileDropZone.tsx` | 添加 `disabled` prop，控制 click/keyboard/视觉/aria |
| `src/components/upload/UploadPage.tsx` | 派生 `isUploading`，传入 FileDropZone |

### 禁止修改

- `src/stores/uploadStore.ts` -- 无需新增 store 字段，通过 selector 派生
- `src/components/upload/UploadActionBar.tsx` -- 不涉及本次修复
- `src/components/upload/UploadFileList.tsx` -- 不涉及本次修复
- `src-tauri/` -- 纯前端修改，不涉及 Rust 代码
- `package.json` -- 不涉及依赖变更

---

## Technical Notes

### Tauri 原生拖拽事件与 disabled 状态

Tauri 的 `onDragDropEvent` 是原生窗口级别事件，无法在 web 层阻止 `over` 事件的触发。因此 `useDragDrop` 在 disabled 状态下仍会收到 `over` 事件并更新 `isDragOver` 状态。但 `drop` 事件的 handler 会 early return，不调用 `addFiles`。

这意味着 disabled 状态下用户拖拽文件到窗口时，虽然不会有 `isDragOver` 的视觉反馈（因为 disabled 的样式覆盖了正常的拖拽高亮），但底层状态仍会变化。这是可接受的行为，因为视觉上已通过 `opacity-50 cursor-not-allowed` 明确告知用户不可操作。

### aria-disabled vs disabled 属性

使用 `aria-disabled="true"` 而非 HTML `disabled` 属性，因为 `<div role="button">` 不是原生表单元素，`disabled` 属性对 `<div>` 无效。`aria-disabled` 是 ARIA 规范推荐的方式，配合 `tabIndex={-1}` 移除键盘焦点。

---

## Definition of Done

- [ ] `useDragDrop` 支持 `disabled` 参数，disabled 时 drop 不执行 addFiles
- [ ] `FileDropZone` 支持 `disabled` prop
- [ ] disabled 时 click 和 keyboard 操作无响应
- [ ] disabled 时视觉显示 `opacity-50` 和 `cursor-not-allowed`
- [ ] disabled 时 `aria-disabled="true"` 且 `tabIndex={-1}`
- [ ] `UploadPage` 基于 activeTasks 中 uploading 状态派生 isUploading
- [ ] 上传进行中拖拽不添加文件
- [ ] 上传进行中点击不打开文件选择器
- [ ] 所有上传完成/出错后拖拽区恢复正常
- [ ] 清空任务后拖拽区恢复正常
