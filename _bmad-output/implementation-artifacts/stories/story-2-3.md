# Story 2.3: 待上传文件列表预览与管理

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 2-3 |
| Epic | Epic 2: 文件输入与上传队列管理 |
| 前置依赖 | Story 2-1 (文件拖拽输入) — 已完成, Story 2-2 (文件选择器) — 已完成 |
| FRs 覆盖 | FR4 (待上传列表预览), FR5 (从列表移除文件) |
| NFRs 关联 | NFR1 (列表渲染 <1s) |

## User Story

As a 用户,
I want 在上传前查看待上传文件列表并删除不需要的文件,
So that 我可以确认要上传的内容是正确的。

---

## Acceptance Criteria

### AC-1: 文件列表展示（文件名 + 文件大小）

**Given** 用户已通过拖拽或文件选择器添加了文件到队列
**When** 待上传列表展示时
**Then** 每个文件显示：文件名和文件大小（自动格式化为 KB/MB/GB）（FR4）
**And** 文件名过长时截断显示，鼠标悬停时通过 Radix UI Tooltip 显示完整名称
**And** 列表使用语义化 `<ul>/<li>` 结构
**And** 列表项高度 48px，垂直间距均匀

### AC-2: 文件大小格式化

**Given** 文件大小以字节数存储在 `PendingFile.fileSize` 中
**When** 在列表中展示文件大小时
**Then** 使用 `src/lib/format.ts` 中的 `formatFileSize` 函数自动格式化：
- 小于 1024 字节：显示 `{n} B`
- 小于 1024 KB：显示 `{n} KB`（保留 1 位小数）
- 小于 1024 MB：显示 `{n} MB`（保留 1 位小数）
- 大于等于 1024 MB：显示 `{n} GB`（保留 2 位小数）

### AC-3: 删除文件

**Given** 用户查看待上传列表中的某个文件
**When** 用户点击该文件的删除按钮（Ghost Icon Button，32x32px，使用 Lucide `X` 图标）
**Then** 该文件从待上传队列中移除（调用 `uploadStore.removeFile(id)`）（FR5）
**And** 列表项淡出消失（200ms transition，使用 CSS opacity + height 过渡）
**And** 删除操作不弹确认对话框，直接执行

### AC-4: 删除后队列为空时恢复拖拽区

**Given** 待上传列表中只剩一个文件
**When** 用户删除该文件后队列为空
**Then** 拖拽区域恢复为大面积展示状态（`FileDropZone` 的 `collapsed` prop 变为 `false`）
**And** UploadPage 不再渲染文件列表区域

### AC-5: React.memo 优化

**Given** 列表中有多个文件
**When** 其中一个文件被删除或列表发生变化时
**Then** 仅受影响的列表项重新渲染，其他列表项不触发重渲染
**And** `UploadFileItem` 组件使用 `React.memo` 包裹

### AC-6: 无障碍

**Given** 用户使用键盘或屏幕阅读器导航
**When** 焦点移至文件列表或删除按钮时
**Then** 删除按钮具有 `aria-label="删除 {fileName}"` 属性
**And** 列表项被删除后，焦点不丢失（自然移动到下一项或上一项）
**And** 列表使用语义化 `<ul>/<li>` 结构

---

## Technical Design

### 现状分析

Story 2-1 和 2-2 已完成以下基础设施：

- `src/types/upload.ts` — 定义了 `PendingFile` 接口（`id`, `fileName`, `filePath`, `fileSize`, `status`）
- `src/stores/uploadStore.ts` — 已实现 `addFiles`, `removeFile`, `clearFiles` actions
- `src/components/upload/UploadPage.tsx` — 包含占位符文字 "已添加 X 个文件 - 文件列表待实现"
- `src/components/upload/FileDropZone.tsx` — 已实现 `collapsed` prop 支持

当前 `UploadPage` 中文件列表区域是占位内容，本 Story 将其替换为完整的文件列表组件。

### 新增组件

#### 1. `UploadFileItem` — 单文件列表项

```typescript
// src/components/upload/UploadFileItem.tsx

interface UploadFileItemProps {
  id: string;
  fileName: string;
  fileSize: number;
  onRemove: (id: string) => void;
}
```

- 使用 `React.memo` 包裹
- 渲染为 `<li>` 元素，高度 48px
- 文件名使用 `truncate`（Tailwind class）截断，外层包裹 Radix UI `Tooltip` 显示完整名称
- 文件大小调用 `formatFileSize()` 格式化
- 删除按钮使用 Lucide React `X` 图标，32x32px Ghost Icon Button 样式
- 删除时列表项淡出（200ms CSS transition on opacity），淡出结束后通过 `onTransitionEnd` 或延时调用 `onRemove`

#### 2. `UploadFileList` — 文件列表容器

```typescript
// src/components/upload/UploadFileList.tsx

interface UploadFileListProps {
  files: PendingFile[];
  onRemoveFile: (id: string) => void;
}
```

- 渲染 `<ul>` 语义化列表
- 遍历 `files` 渲染 `UploadFileItem`
- 接收 `files` 和 `onRemoveFile` 作为 props（从 UploadPage 传入）

#### 3. `formatFileSize` — 文件大小格式化工具函数

```typescript
// src/lib/format.ts

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
```

### 数据流

```
uploadStore.pendingFiles (Zustand)
  -> UploadPage 通过选择器读取 pendingFiles
  -> 传入 UploadFileList 组件
  -> UploadFileList 遍历渲染 UploadFileItem
  -> 用户点击删除按钮
     -> UploadFileItem 触发 onRemove(id) 回调
     -> 淡出动画完成后
     -> UploadPage 中的 handleRemoveFile 调用 uploadStore.removeFile(id)
  -> Zustand 更新 pendingFiles
  -> React 重渲染
  -> 如果 pendingFiles 为空 -> FileDropZone 恢复大面积展示
```

### 删除动画实现方案

使用 React state 管理淡出动画，避免引入额外动画库：

```typescript
// UploadFileItem 内部
const [isRemoving, setIsRemoving] = useState(false);

const handleRemove = useCallback(() => {
  setIsRemoving(true);
  // 等待 CSS transition 完成后通知父组件真正删除
  setTimeout(() => onRemove(id), 200);
}, [id, onRemove]);
```

CSS transition 使用 Tailwind 类：`transition-[opacity,max-height] duration-200`

- `isRemoving` 为 false 时：`opacity-100 max-h-12`
- `isRemoving` 为 true 时：`opacity-0 max-h-0`

需要尊重 `prefers-reduced-motion`：启用时跳过动画直接删除。

### Radix UI Tooltip 使用

文件名截断后需要 Tooltip 显示完整名称：

```tsx
import * as Tooltip from 'radix-ui/react-tooltip';

<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <span className="truncate">{fileName}</span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content>
        {fileName}
        <Tooltip.Arrow />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

注意：`Tooltip.Provider` 应在 `UploadFileList` 或 `UploadPage` 级别包裹，避免每个 `UploadFileItem` 重复创建 Provider。

---

## Tasks

### Task 1: 创建 `formatFileSize` 工具函数

**文件:** `src/lib/format.ts`
**依赖:** 无

**Subtasks:**

1.1. 创建 `src/lib/format.ts` 文件
1.2. 实现 `formatFileSize(bytes: number): string` 函数
   - `bytes < 1024` -> `"{bytes} B"`
   - `bytes < 1024^2` -> `"{n} KB"`（1 位小数）
   - `bytes < 1024^3` -> `"{n} MB"`（1 位小数）
   - `bytes >= 1024^3` -> `"{n} GB"`（2 位小数）
1.3. 处理边界情况：`bytes` 为 0 时返回 `"0 B"`，负数视为 0

### Task 2: 创建 `formatFileSize` 单元测试

**文件:** `src/lib/format.test.ts`
**依赖:** Task 1

**Subtasks:**

2.1. 测试 0 字节返回 `"0 B"`
2.2. 测试小文件（如 512 字节）返回 `"512 B"`
2.3. 测试 KB 范围（如 1024 字节 -> `"1.0 KB"`）
2.4. 测试 MB 范围（如 1048576 字节 -> `"1.0 MB"`）
2.5. 测试 GB 范围（如 1073741824 字节 -> `"1.00 GB"`）
2.6. 测试小数精度（如 1536 字节 -> `"1.5 KB"`）
2.7. 测试大文件（如 8.5 GB）

### Task 3: 创建 `UploadFileItem` 组件

**文件:** `src/components/upload/UploadFileItem.tsx`
**依赖:** Task 1

**Subtasks:**

3.1. 定义 `UploadFileItemProps` 接口：`id: string`, `fileName: string`, `fileSize: number`, `onRemove: (id: string) => void`
3.2. 实现组件渲染为 `<li>` 元素，固定高度 48px（`h-12`）
3.3. 左侧显示文件图标（Lucide `File` 图标，16px，text-secondary 色）
3.4. 中间显示文件名（`truncate` 截断）+ Radix UI `Tooltip` 悬停显示完整名称
3.5. 文件名下方或右侧显示格式化后的文件大小（Caption 样式，12px，text-secondary 色），调用 `formatFileSize(fileSize)`
3.6. 右侧显示删除按钮：Ghost Icon Button，32x32px，Lucide `X` 图标，`aria-label="删除 {fileName}"`
3.7. 实现删除淡出动画：点击删除 -> `isRemoving` state 设为 true -> CSS transition opacity+max-height 200ms -> `setTimeout` 200ms 后调用 `onRemove(id)`
3.8. 尊重 `prefers-reduced-motion`：使用 `useSyncExternalStore` 或 `matchMedia` 检测；启用时跳过动画直接调用 `onRemove(id)`
3.9. 使用 `React.memo` 包裹导出组件

### Task 4: 创建 `UploadFileList` 组件

**文件:** `src/components/upload/UploadFileList.tsx`
**依赖:** Task 3

**Subtasks:**

4.1. 定义 `UploadFileListProps` 接口：`files: PendingFile[]`, `onRemoveFile: (id: string) => void`
4.2. 渲染 `<ul>` 语义化列表，无列表样式（`list-none`）
4.3. 遍历 `files`，为每个文件渲染 `UploadFileItem`，`key` 使用 `file.id`
4.4. 外层包裹 Radix UI `Tooltip.Provider`（`delayDuration={300}`），为所有 Tooltip 共享 Provider
4.5. 列表区域可滚动：`overflow-y-auto flex-1`

### Task 5: 修改 `UploadPage` — 集成文件列表

**文件:** `src/components/upload/UploadPage.tsx`
**依赖:** Task 4

**Subtasks:**

5.1. 从 `uploadStore` 通过选择器获取 `pendingFiles` 和 `removeFile`
5.2. 移除占位符内容（"已添加 X 个文件 - 文件列表待实现"）
5.3. 当 `pendingFiles.length > 0` 时渲染 `UploadFileList` 组件，传入 `files={pendingFiles}` 和 `onRemoveFile={removeFile}`
5.4. 当 `pendingFiles.length === 0` 时仅渲染大面积 `FileDropZone`（`collapsed={false}`）
5.5. 确认删除最后一个文件后，UI 正确恢复到大面积拖拽区状态

### Task 6: 编写前端组件测试

**文件:** `src/components/upload/UploadFileItem.test.tsx`, `src/components/upload/UploadFileList.test.tsx`
**依赖:** Task 5

**Subtasks:**

6.1. `UploadFileItem.test.tsx`:
   - 测试渲染文件名和格式化后的文件大小
   - 测试长文件名截断（验证 `truncate` class 存在）
   - 测试点击删除按钮触发 `onRemove` 回调（验证传入正确的 `id`）
   - 测试删除按钮具有 `aria-label="删除 {fileName}"` 属性
   - 测试 `<li>` 语义化元素渲染

6.2. `UploadFileList.test.tsx`:
   - 测试渲染多个文件列表项
   - 测试 `<ul>` 语义化列表结构
   - 测试空文件数组时不渲染列表

---

## Task 依赖顺序

```
Task 1 (formatFileSize) ──> Task 2 (format 测试)
        │
        v
Task 3 (UploadFileItem) ──> Task 4 (UploadFileList)
                                      │
                                      v
                            Task 5 (修改 UploadPage)
                                      │
                                      v
                            Task 6 (组件测试)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src/lib/format.ts` | `formatFileSize` 工具函数 |
| `src/lib/format.test.ts` | `formatFileSize` 单元测试 |
| `src/components/upload/UploadFileItem.tsx` | 单文件列表项组件（React.memo 包裹） |
| `src/components/upload/UploadFileList.tsx` | 文件列表容器组件 |
| `src/components/upload/UploadFileItem.test.tsx` | UploadFileItem 组件测试 |
| `src/components/upload/UploadFileList.test.tsx` | UploadFileList 组件测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/components/upload/UploadPage.tsx` | 移除占位符，集成 UploadFileList 组件 |

### 禁止修改

- `src/stores/uploadStore.ts` — `removeFile` action 已在 Story 2-1 实现，无需修改
- `src/types/upload.ts` — `PendingFile` 类型已满足需求，无需新增字段
- `src/components/upload/FileDropZone.tsx` — `collapsed` prop 已支持，无需修改
- `src/hooks/useDragDrop.ts` — 拖拽逻辑不受文件列表变更影响
- `src/lib/tauri.ts` — 不涉及新的 IPC 调用
- `src/stores/appStore.ts` — 不属于本 Story 范围
- `src/stores/historyStore.ts` — 不属于本 Story 范围
- `src-tauri/` — 本 Story 为纯前端实现，不涉及 Rust 后端变更

---

## Technical Notes

### Radix UI Tooltip 注意事项

1. **统一包引用：** 项目使用 `radix-ui` 统一包 v1.4.3，import 路径为 `radix-ui/react-tooltip`（非独立包 `@radix-ui/react-tooltip`）
2. **Provider 共享：** `Tooltip.Provider` 在 `UploadFileList` 级别创建一次，所有列表项共享同一个 Provider 实例
3. **延迟配置：** `delayDuration={300}` — 悬停 300ms 后显示 Tooltip，避免鼠标快速划过时频繁弹出
4. **Portal 渲染：** Tooltip 内容通过 `Tooltip.Portal` 渲染到 body 层，避免被列表 `overflow-y-auto` 裁切

### 删除动画边界情况

1. **快速连续删除：** 用户快速点击多个文件的删除按钮时，每个文件独立管理 `isRemoving` state，互不干扰
2. **reduced-motion 偏好：** 检测 `prefers-reduced-motion: reduce`，启用时跳过动画直接调用 `onRemove`，不使用 `setTimeout`
3. **组件卸载安全：** `setTimeout` 回调中的 `onRemove` 调用需要考虑组件可能已卸载的情况。由于 `onRemove` 是 store action（稳定引用），调用 store action 在组件卸载后仍然安全

### 文件名截断策略

- 使用 Tailwind `truncate` class（`overflow-hidden text-ellipsis whitespace-nowrap`）
- 文件名容器需要明确的 `max-width` 或 `min-w-0`（flex 子项中 `truncate` 需要 `min-w-0` 才能生效）
- Tooltip 仅在文件名确实被截断时才有意义，但为实现简单，对所有文件名都添加 Tooltip（短文件名悬停时 Tooltip 内容与可见文本相同，用户体验无影响）

### UploadPage 组件结构

修改后的 UploadPage 渲染结构：

```tsx
<div className="flex h-full flex-col gap-2 p-4">
  <FileDropZone collapsed={hasFiles} />
  {hasFiles && <UploadFileList files={pendingFiles} onRemoveFile={removeFile} />}
</div>
```

### 与后续 Story 的关系

- Story 3.5（上传进度展示）将扩展 `UploadFileItem`，增加 `uploading`/`completed`/`error` 状态渲染。当前 Story 仅实现 `pending` 状态下的预览与删除功能
- `UploadFileItem` 的 props 接口设计为当前最小集（`id`, `fileName`, `fileSize`, `onRemove`），后续 Story 将根据需要扩展 props

---

## Definition of Done

- [ ] `src/lib/format.ts` 已创建，`formatFileSize` 函数正确格式化 B/KB/MB/GB
- [ ] `src/lib/format.test.ts` 测试覆盖各种文件大小范围和边界值
- [ ] `UploadFileItem` 组件正确渲染文件名（截断 + Tooltip）和格式化文件大小
- [ ] `UploadFileItem` 使用 `React.memo` 包裹
- [ ] 删除按钮为 Ghost Icon Button（32x32px），点击后列表项淡出消失（200ms）
- [ ] 删除操作不弹确认对话框
- [ ] 删除后队列为空时，拖拽区恢复大面积展示
- [ ] 列表使用语义化 `<ul>/<li>` 结构
- [ ] 列表项高度 48px
- [ ] 删除按钮具有 `aria-label="删除 {fileName}"` 无障碍属性
- [ ] 尊重 `prefers-reduced-motion` 系统设置
- [ ] `UploadFileItem.test.tsx` 和 `UploadFileList.test.tsx` 测试通过
- [ ] `pnpm lint` 无错误
- [ ] `pnpm test` 所有测试通过
