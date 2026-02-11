# Story 3.7: 底部操作栏与上传触发按钮

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-7 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 3-5 (上传进度聚合与实时展示) -- 已完成, Story 3-6 (上传完成、链接产出与一键复制) -- 已完成 |
| FRs 覆盖 | FR14 (上传完成状态) |
| NFRs 关联 | NFR1 (文件列表渲染 <1s) |

## User Story

As a 用户,
I want 在待上传列表下方看到一个上传按钮来启动上传,
So that 我可以在确认文件列表后一键触发上传流程。

---

## Acceptance Criteria

### AC-1: 底部操作栏基础布局与文件统计

**Given** 用户已通过拖拽或文件选择器添加了文件到待上传队列
**When** 查看上传页面底部
**Then** 底部固定区域（`sticky bottom-0`）显示操作栏
**And** 左侧显示文件统计信息："N 个文件，X.X GB"（文件数 + 总大小，使用 `formatFileSize` 格式化）
**And** 右侧显示 [开始上传] 按钮（Primary 样式，品牌蓝 `#3B82F6`，圆角 6px，高 36px）
**And** 保留期暂用默认值 7 天（硬编码，Story 5.1 替换为下拉选择器）
**And** 操作栏上方有 1px `border-t` 分隔线（`border-border`）

### AC-2: 空队列禁用状态

**Given** 待上传队列为空（`pendingFiles.length === 0`）且无活跃上传任务
**When** 查看底部区域
**Then** UploadActionBar 不渲染（隐藏），页面显示全尺寸 FileDropZone

### AC-3: 上传触发

**Given** 用户点击 [开始上传] 按钮
**When** 触发上传
**Then** 调用 `uploadStore.startUpload(7)` 启动上传流程（`7` 为硬编码保留天数）
**And** `startUpload` action 将 `pendingFiles` 转为 `activeTasks`，进度开始显示
**And** 按钮状态立即切换为禁用（防止重复点击）

### AC-4: 上传进行中禁用状态

**Given** 上传已在进行中（`activeTasks` 中存在 `status === 'uploading'` 的任务）
**When** 查看底部区域
**Then** [开始上传] 按钮置灰禁用，不可点击
**And** 左侧统计信息显示 "N 个文件上传中"（N 为 `activeTasks` 中的任务总数）

### AC-5: 全部上传完成状态

**Given** 所有文件上传完成（`allUploadsComplete` 为 `true`）
**When** 查看底部区域
**Then** 左侧统计信息变为 "N 个文件上传完成"（N 为 `activeTasks` 中 `status === 'completed'` 的任务数）
**And** [开始上传] 按钮替换为 [清空列表] 按钮（Secondary 样式：白色背景 + 灰色边框 `border-border` + 深色文字）
**And** 点击 [清空列表] 后调用 `uploadStore.clearCompletedTasks()` 清除所有已完成的上传任务
**And** 清除操作将 `activeTasks` 重置为 `{}`、`allUploadsComplete` 重置为 `false`
**And** 页面回到初始拖拽区状态，用户可以拖入新文件开始下一轮上传
**And** 清空操作不弹确认对话框，直接执行（已完成的记录可在历史记录中查看）

### AC-6: uploadStore 扩展 -- clearCompletedTasks action

**Given** 用户点击 [清空列表] 按钮
**When** 需要重置上传状态
**Then** `uploadStore` 新增 `clearCompletedTasks` action：

```typescript
clearCompletedTasks: () => void;
```

**And** 实现逻辑：将 `activeTasks` 设为 `{}`，`allUploadsComplete` 设为 `false`
**And** 在 `UploadState` interface 中声明此 action

### AC-7: 组件结构与定位

**Given** UploadActionBar 组件
**When** 渲染在 UploadPage 中
**Then** 组件文件命名为 `UploadActionBar.tsx`，放在 `src/components/upload/` 下
**And** 底部区域使用 `sticky bottom-0` 固定定位，背景色为 `bg-surface`（白色）
**And** 内容使用 `flex justify-between items-center` 布局，内边距 `px-4 py-3`
**And** UploadPage 在 `UploadFileList` 下方渲染 `UploadActionBar`

### AC-8: 无障碍属性

**Given** UploadActionBar 组件
**When** 渲染时
**Then** 操作栏区域使用 `<nav>` 语义化标签，带有 `aria-label="上传操作"`
**And** [开始上传] 和 [清空列表] 按钮使用原生 `<button>` 元素
**And** 禁用状态按钮包含 `disabled` 属性和 `aria-disabled="true"`
**And** 统计信息区域使用 `aria-live="polite"`，状态变化时通知屏幕阅读器

### AC-9: 单元测试

**Given** 前端功能实现完成
**When** 执行测试
**Then** 前端测试（`stores/uploadStore.test.ts` 追加）：
- **clearCompletedTasks action**：验证 `activeTasks` 变为 `{}`、`allUploadsComplete` 变为 `false`
**And** 前端测试（`components/upload/UploadActionBar.test.tsx` 新建）：
- **渲染 -- 有 pending 文件时**：验证显示文件统计和启用的 [开始上传] 按钮
- **渲染 -- 无文件时**：验证组件不渲染
- **点击 [开始上传]**：验证调用 `startUpload(7)`
- **上传中状态**：验证 [开始上传] 按钮禁用
- **全部完成状态**：验证显示 "N 个文件上传完成" 和 [清空列表] 按钮
- **点击 [清空列表]**：验证调用 `clearCompletedTasks()`
**And** `pnpm test` 前端测试通过
**And** `pnpm lint` 无错误

---

## Technical Design

### 现状分析

Story 3-5/3-6 已完成以下基础设施：

- `src/stores/uploadStore.ts` — `pendingFiles` + `activeTasks` + `allUploadsComplete` 状态，`startUpload(lifetime)` 启动上传，`setTaskFileComplete` / `setAllComplete` 完成处理
- `src/types/upload.ts` — `PendingFile`、`FileEntry`、`UploadTaskProgress` 类型（含 `status: 'uploading' | 'completed' | 'error'` 和可选 `downloadUrl`）
- `src/components/upload/UploadPage.tsx` — 容器组件，渲染 `FileDropZone` + `UploadFileList`，调用 `useUploadEvents()`
- `src/components/upload/UploadFileList.tsx` — 渲染 pending 文件和 active 任务列表
- `src/components/upload/UploadFileItem.tsx` — 单文件列表项，支持 pending/uploading/completed/error 状态
- `src/lib/format.ts` — `formatFileSize(bytes)` 格式化工具函数
- `src/App.css` — Tailwind `@theme` 设计 Token（`--color-brand`、`--color-border`、`--color-surface` 等）

**关键集成点：**

- `uploadStore.startUpload(lifetime)` 已实现：将 `pendingFiles` 转为 `activeTasks`，调用 Rust `start_upload` command
- `uploadStore.allUploadsComplete` 已实现：由 `upload:all-complete` 事件驱动
- `uploadStore` 无清空已完成任务的 action（`clearFiles()` 仅清空 `pendingFiles`）
- `UploadPage.tsx` 无底部操作栏组件
- UX 设计规范中定义了 Primary Button 样式（品牌蓝背景 + 白色文字，圆角 6px，高 36px）和 Secondary Button 样式（白色背景 + 灰色边框 + 深色文字）

### 新增/修改模块

#### 1. `stores/uploadStore.ts` -- clearCompletedTasks action（修改）

**修改点：在 UploadState interface 和 store 实现中添加 `clearCompletedTasks` action**

```typescript
interface UploadState {
  // ... 现有字段 ...
  clearCompletedTasks: () => void;  // 新增
}

// 实现：
clearCompletedTasks: () => set({ activeTasks: {}, allUploadsComplete: false }),
```

#### 2. `components/upload/UploadActionBar.tsx` -- 底部操作栏组件（新建）

```tsx
import { useUploadStore } from '@/stores/uploadStore';
import { formatFileSize } from '@/lib/format';

function UploadActionBar() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const activeTasks = useUploadStore((s) => s.activeTasks);
  const allUploadsComplete = useUploadStore((s) => s.allUploadsComplete);
  const startUpload = useUploadStore((s) => s.startUpload);
  const clearCompletedTasks = useUploadStore((s) => s.clearCompletedTasks);

  const activeTaskList = Object.values(activeTasks);
  const hasActiveTasks = activeTaskList.length > 0;
  const hasPendingFiles = pendingFiles.length > 0;

  // 不渲染条件：无 pending 文件且无 active 任务
  if (!hasPendingFiles && !hasActiveTasks) return null;

  // 派生状态
  const isUploading = activeTaskList.some((t) => t.status === 'uploading');
  const completedCount = activeTaskList.filter((t) => t.status === 'completed').length;

  // 统计信息
  let statsText: string;
  if (allUploadsComplete) {
    statsText = `${completedCount} 个文件上传完成`;
  } else if (isUploading) {
    statsText = `${activeTaskList.length} 个文件上传中`;
  } else {
    const totalSize = pendingFiles.reduce((sum, f) => sum + f.fileSize, 0);
    statsText = `${pendingFiles.length} 个文件，${formatFileSize(totalSize)}`;
  }

  const handleStartUpload = () => {
    startUpload(7);
  };

  const handleClearCompleted = () => {
    clearCompletedTasks();
  };

  const isStartDisabled = !hasPendingFiles || isUploading;

  return (
    <nav
      aria-label="上传操作"
      className="sticky bottom-0 border-t border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary" aria-live="polite">
          {statsText}
        </span>

        {allUploadsComplete ? (
          <button
            type="button"
            onClick={handleClearCompleted}
            className="rounded-md border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary hover:bg-bg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            清空列表
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartUpload}
            disabled={isStartDisabled}
            aria-disabled={isStartDisabled}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始上传
          </button>
        )}
      </div>
    </nav>
  );
}

export default UploadActionBar;
```

#### 3. `components/upload/UploadPage.tsx` -- 集成 UploadActionBar（修改）

```tsx
import FileDropZone from '@/components/upload/FileDropZone';
import UploadActionBar from '@/components/upload/UploadActionBar';
import UploadFileList from '@/components/upload/UploadFileList';
import { useUploadEvents } from '@/hooks/useUploadEvents';
import { useUploadStore } from '@/stores/uploadStore';

function UploadPage() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const hasActiveTasks = useUploadStore((s) => Object.keys(s.activeTasks).length > 0);
  const removeFile = useUploadStore((s) => s.removeFile);
  const hasFiles = pendingFiles.length > 0 || hasActiveTasks;

  useUploadEvents();

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <FileDropZone collapsed={hasFiles} />
      {hasFiles && <UploadFileList files={pendingFiles} onRemoveFile={removeFile} />}
      <UploadActionBar />  {/* 新增 */}
    </div>
  );
}

export default UploadPage;
```

### 数据流

```
用户添加文件:
  → uploadStore.addFiles() → pendingFiles 更新
  → UploadActionBar 渲染：显示 "N 个文件，X.X GB" + [开始上传]

用户点击 [开始上传]:
  → UploadActionBar handleStartUpload()
  → uploadStore.startUpload(7)
    → pendingFiles 清空，activeTasks 填充，allUploadsComplete = false
    → Rust start_upload command 调用
  → UploadActionBar 重渲染：显示 "N 个文件上传中" + [开始上传] 禁用

上传完成:
  → upload:all-complete 事件 → uploadStore.setAllComplete()
  → allUploadsComplete = true
  → UploadActionBar 重渲染：显示 "N 个文件上传完成" + [清空列表]

用户点击 [清空列表]:
  → UploadActionBar handleClearCompleted()
  → uploadStore.clearCompletedTasks()
    → activeTasks = {}, allUploadsComplete = false
  → UploadActionBar 返回 null（不渲染）
  → UploadPage hasFiles = false → FileDropZone 恢复全尺寸
```

### 设计决策

1. **UploadActionBar 不使用 `React.memo`**：该组件本身不接受外部 props（所有状态通过 Zustand 选择器获取），不存在父组件传递 props 导致的无关重渲染。Zustand 选择器已提供精确的订阅机制。

2. **保留期硬编码为 7 天**：AC 明确指出 "保留期暂用默认值 7 天（硬编码，Story 5.1 替换为下拉选择器）"。`startUpload(7)` 中的 `7` 将在 Story 5.1 中替换为用户选择的值。

3. **`clearCompletedTasks` 而非复用 `clearFiles`**：`clearFiles()` 仅清空 `pendingFiles`，用途不同。`clearCompletedTasks()` 清空 `activeTasks` + 重置 `allUploadsComplete`，语义清晰。

4. **使用 `<nav>` 语义标签**：底部操作栏是页面的导航/操作区域，`<nav>` 配合 `aria-label` 提供清晰的无障碍语义。

5. **Zustand 多选择器分离**：UploadActionBar 使用多个独立选择器（`pendingFiles`、`activeTasks`、`allUploadsComplete`、`startUpload`、`clearCompletedTasks`）而非单个选择器返回对象。这确保只有相关状态变化时才触发重渲染。

6. **`sticky bottom-0` 而非 `fixed`**：`sticky` 使操作栏在 UploadPage 的 flex 布局中自然定位到底部，不脱离文档流，避免 `fixed` 定位需要处理的 z-index 和覆盖问题。

7. **操作栏可见性由组件内部控制**：UploadActionBar 在内部判断 `!hasPendingFiles && !hasActiveTasks` 时返回 `null`，不需要父组件传递显示条件。这简化了 UploadPage 的逻辑。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.5（进度聚合） | 本 Story 依赖 3.5 的 `activeTasks` 状态来判断上传中/完成状态 |
| Story 3.6（链接产出） | 本 Story 依赖 3.6 的 `allUploadsComplete` 状态和 `setAllComplete` action |
| Story 5.1（保留期选择） | Story 5.1 将在 UploadActionBar 中添加保留期 DropdownMenu，替换硬编码的 `7` 天 |

---

## Tasks

### Task 1: uploadStore 扩展 -- clearCompletedTasks action

**文件:** `src/stores/uploadStore.ts`（修改）
**依赖:** 无

**Subtasks:**

1.1. 在 `UploadState` interface 中添加 `clearCompletedTasks: () => void` 声明
1.2. 实现 `clearCompletedTasks` action：`set({ activeTasks: {}, allUploadsComplete: false })`

### Task 2: 创建 UploadActionBar 组件

**文件:** `src/components/upload/UploadActionBar.tsx`（新建）
**依赖:** Task 1

**Subtasks:**

2.1. 创建 `src/components/upload/UploadActionBar.tsx` 文件
2.2. 使用 Zustand 选择器订阅 `pendingFiles`、`activeTasks`、`allUploadsComplete`、`startUpload`、`clearCompletedTasks`
2.3. 实现不渲染条件：无 pending 文件且无 active 任务时返回 `null`
2.4. 实现统计信息计算：
    - pending 状态："N 个文件，X.X GB"（使用 `formatFileSize`）
    - uploading 状态："N 个文件上传中"
    - complete 状态："N 个文件上传完成"
2.5. 实现 [开始上传] 按钮（Primary 样式）：
    - 品牌蓝背景 + 白色文字
    - `disabled` 条件：`!hasPendingFiles || isUploading`
    - 点击调用 `startUpload(7)`
2.6. 实现 [清空列表] 按钮（Secondary 样式）：
    - 白色背景 + 灰色边框 + 深色文字
    - `allUploadsComplete` 为 true 时替换 [开始上传] 按钮
    - 点击调用 `clearCompletedTasks()`
2.7. 布局样式：`sticky bottom-0`、`border-t border-border`、`bg-surface`、`px-4 py-3`、`flex justify-between items-center`
2.8. 无障碍属性：`<nav aria-label="上传操作">`、按钮 `disabled` + `aria-disabled`、统计文本 `aria-live="polite"`

### Task 3: UploadPage 集成 UploadActionBar

**文件:** `src/components/upload/UploadPage.tsx`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 添加 `UploadActionBar` 导入
3.2. 在 `UploadFileList` 之后渲染 `<UploadActionBar />`

### Task 4: 编写测试

**文件:** 多文件
**依赖:** Task 1, Task 2, Task 3

**Subtasks:**

4.1. 前端测试：`stores/uploadStore.test.ts` -- `clearCompletedTasks` action：设置 activeTasks 和 allUploadsComplete 后调用，验证 activeTasks 变为 `{}`、allUploadsComplete 变为 `false`
4.2. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 有 pending 文件时渲染统计信息和启用的 [开始上传] 按钮
4.3. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 无文件时组件不渲染（返回 null）
4.4. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 点击 [开始上传] 调用 `startUpload(7)`
4.5. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 上传中状态按钮禁用
4.6. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 全部完成时显示完成统计和 [清空列表] 按钮
4.7. 前端测试：`components/upload/UploadActionBar.test.tsx` -- 点击 [清空列表] 调用 `clearCompletedTasks()`

### Task 5: 代码质量验证

**文件:** 无新文件
**依赖:** Task 4

**Subtasks:**

5.1. 执行 `pnpm test` 确认前端测试通过
5.2. 执行 `pnpm lint` 确认 ESLint 无错误
5.3. 执行 `pnpm format:check` 确认 Prettier 格式正确

---

## Task 依赖顺序

```
Task 1 (uploadStore 扩展) ──→ Task 2 (UploadActionBar 组件) ──→ Task 3 (UploadPage 集成)
                                                                        │
                                                                        ↓
                                                                   Task 4 (测试)
                                                                        │
                                                                        ↓
                                                                   Task 5 (质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src/components/upload/UploadActionBar.tsx` | 底部操作栏组件：文件统计 + [开始上传]/[清空列表] 按钮切换、sticky 定位、无障碍属性 |
| `src/components/upload/UploadActionBar.test.tsx` | UploadActionBar 单元测试：渲染条件、按钮点击、状态切换、禁用状态验证 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src/stores/uploadStore.ts` | 添加 `clearCompletedTasks` action（清空 activeTasks + 重置 allUploadsComplete） |
| `src/stores/uploadStore.test.ts` | 追加 `clearCompletedTasks` action 测试 |
| `src/components/upload/UploadPage.tsx` | 导入并渲染 `<UploadActionBar />` 组件 |

### 禁止修改

- `src-tauri/` -- 整个 Rust 后端目录，本 Story 为纯前端实现
- `src/App.css` -- 设计 Token 不变（`--color-brand`、`--color-border`、`--color-surface` 已定义）
- `src/App.tsx` -- 应用入口不变
- `src/stores/appStore.ts` -- 不涉及
- `src/stores/historyStore.ts` -- 不涉及
- `src/types/upload.ts` -- 类型定义不变（`PendingFile`、`UploadTaskProgress` 已满足需求）
- `src/lib/format.ts` -- `formatFileSize` 已存在，无需修改
- `src/lib/tauri.ts` -- 不涉及
- `src/hooks/useUploadEvents.ts` -- 不涉及
- `src/components/upload/FileDropZone.tsx` -- 不涉及
- `src/components/upload/UploadFileList.tsx` -- 不涉及
- `src/components/upload/UploadFileItem.tsx` -- 不涉及
- `src/components/shared/CopyButton.tsx` -- 不涉及

---

## Technical Notes

### Zustand 选择器与重渲染优化

UploadActionBar 使用 5 个独立的 Zustand 选择器，而非 `useShallow` 合并选择。原因：

- `pendingFiles` 和 `activeTasks` 是引用类型，每次 store 更新都会创建新引用
- 使用独立选择器时，Zustand 对每个选择器独立做浅比较（primitive 值）或引用比较（对象值）
- `startUpload` 和 `clearCompletedTasks` 是稳定的函数引用，不会触发重渲染

```typescript
// 正确：独立选择器
const pendingFiles = useUploadStore((s) => s.pendingFiles);
const allUploadsComplete = useUploadStore((s) => s.allUploadsComplete);

// 错误：不要解构整个 store
const { pendingFiles, allUploadsComplete } = useUploadStore();
```

### Button 样式规范

**Primary Button（[开始上传]）：**

```
bg-brand text-white rounded-md px-4 py-1.5 text-sm font-medium
hover:bg-brand/90
disabled:opacity-50 disabled:cursor-not-allowed
focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none
```

**Secondary Button（[清空列表]）：**

```
bg-surface text-text-primary border border-border rounded-md px-4 py-1.5 text-sm font-medium
hover:bg-bg
focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none
```

样式来源：UX 设计规范中的按钮层级体系（Primary = 品牌蓝背景 + 白色文字，Secondary = 白底灰边）。

### sticky 定位行为

```css
/* UploadActionBar 使用 sticky 定位 */
sticky bottom-0
```

`sticky bottom-0` 在 UploadPage 的 `flex flex-col` 布局中：
- 当 UploadFileList 内容不超过可视区域时，UploadActionBar 自然位于列表底部
- 当 UploadFileList 内容超出可视区域时，UploadActionBar 固定在可视区域底部
- 不需要额外的 `z-index`，因为 sticky 元素在其父容器的堆叠上下文中自然置顶

### 统计信息计算

```typescript
// Pending 状态：合计 pendingFiles
const totalSize = pendingFiles.reduce((sum, f) => sum + f.fileSize, 0);
const statsText = `${pendingFiles.length} 个文件，${formatFileSize(totalSize)}`;

// Uploading 状态：计数 activeTasks
const statsText = `${activeTaskList.length} 个文件上传中`;

// Complete 状态：计数 completed 的 activeTasks
const completedCount = activeTaskList.filter((t) => t.status === 'completed').length;
const statsText = `${completedCount} 个文件上传完成`;
```

`formatFileSize` 来自 `src/lib/format.ts`，已验证存在并支持 B/KB/MB/GB 格式化。

### Story 5.1 集成预留

Story 5.1 将在 UploadActionBar 中添加保留期 DropdownMenu（Radix UI），替换当前的硬编码 `7`。预期修改点：

1. UploadActionBar 中 [开始上传] 按钮左侧添加 DropdownMenu 组件
2. `handleStartUpload` 中的 `startUpload(7)` 改为 `startUpload(selectedLifetime)`
3. `uploadStore` 添加 `lifetime` 状态字段

当前设计已为此预留空间：按钮左侧的统计信息区域和按钮之间有足够的 `justify-between` 空间。

---

## Definition of Done

- [ ] `uploadStore.ts` 添加 `clearCompletedTasks` action 声明
- [ ] `clearCompletedTasks` 实现：`activeTasks` 重置为 `{}`、`allUploadsComplete` 重置为 `false`
- [ ] `UploadActionBar.tsx` 创建，放在 `src/components/upload/` 下
- [ ] 操作栏使用 `sticky bottom-0` 固定定位
- [ ] 操作栏使用 `bg-surface` 背景色 + `border-t border-border` 上边框
- [ ] 左侧统计信息：pending 状态显示 "N 个文件，X.X GB"（使用 formatFileSize）
- [ ] 左侧统计信息：uploading 状态显示 "N 个文件上传中"
- [ ] 左侧统计信息：complete 状态显示 "N 个文件上传完成"
- [ ] 右侧 [开始上传] 按钮：Primary 样式（品牌蓝 #3B82F6）
- [ ] [开始上传] 点击调用 `uploadStore.startUpload(7)`（硬编码 7 天）
- [ ] 待上传队列为空时 [开始上传] 按钮置灰禁用
- [ ] 上传进行中时 [开始上传] 按钮置灰禁用（防止重复触发）
- [ ] 无文件（无 pending 无 active）时 UploadActionBar 不渲染
- [ ] 全部上传完成时 [开始上传] 替换为 [清空列表]（Secondary 样式：白底灰边）
- [ ] [清空列表] 点击调用 `clearCompletedTasks()`
- [ ] 点击 [清空列表] 后页面回到初始拖拽区状态
- [ ] 清空操作不弹确认对话框，直接执行
- [ ] `<nav aria-label="上传操作">` 语义化标签
- [ ] 按钮使用原生 `<button>` 元素
- [ ] 禁用按钮包含 `disabled` 和 `aria-disabled` 属性
- [ ] 统计信息使用 `aria-live="polite"`
- [ ] UploadPage 中正确集成 UploadActionBar
- [ ] Zustand 使用精确选择器，不解构整个 store
- [ ] 前端测试：clearCompletedTasks action 验证
- [ ] 前端测试：UploadActionBar 渲染条件（有文件/无文件）
- [ ] 前端测试：[开始上传] 点击调用 startUpload(7)
- [ ] 前端测试：上传中按钮禁用
- [ ] 前端测试：完成状态显示 [清空列表]
- [ ] 前端测试：[清空列表] 点击调用 clearCompletedTasks
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误
