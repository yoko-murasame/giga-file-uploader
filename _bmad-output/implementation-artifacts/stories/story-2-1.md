# Story 2.1: 文件拖拽输入与拖拽区交互

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 2-1 |
| Epic | Epic 2: 文件输入与上传队列管理 |
| 前置依赖 | Epic 1 (Stories 1.1, 1.2, 1.3) — 已完成 |
| FRs 覆盖 | FR1 (拖拽添加文件), FR2 (拖拽添加文件夹递归) |
| NFRs 关联 | NFR1 (列表渲染 <1s) |

## User Story

As a 用户,
I want 将文件或文件夹拖拽到 GigaFile 窗口中添加到上传队列,
So that 我可以快速便捷地选择要上传的文件。

---

## Acceptance Criteria

### AC-1: 空列表时的大面积拖拽区域

**Given** 用户已打开 GigaFile 应用，处于"上传" Tab
**When** 待上传列表为空时
**Then** 主内容区显示大面积拖拽区域（占主内容区 80% 以上）
**And** 拖拽区域使用虚线边框 `#D1D5DB`（2px dashed）+ 浅灰背景（`#F9FAFB`）
**And** 区域内居中显示提示文案"将文件拖到这里，或点击选择文件"
**And** 提示文案使用 `text-text-secondary`（`#6B7280`），14px body 字号

### AC-2: 拖拽悬停视觉反馈

**Given** 用户将文件拖拽悬停在窗口上方
**When** 文件进入窗口区域时
**Then** 窗口整体显示蓝色实线边框（`#3B82F6`，2px solid）
**And** 叠加半透明蓝色覆盖层（`#3B82F6` / 20% 透明度）
**And** 拖拽区域内文案变为"松手即可添加"
**When** 文件拖拽离开窗口区域时
**Then** 视觉状态恢复为拖拽前状态

### AC-3: 散文件拖拽添加

**Given** 用户松手释放拖拽的文件
**When** 拖拽的是单个或多个散文件时
**Then** 所有文件被添加到 `uploadStore` 的待上传队列
**And** 每个文件记录包含：`id`(uuid)、`fileName`、`filePath`、`fileSize`(bytes)、`status: 'pending'`
**And** 文件列表在 1 秒内完成渲染（NFR1）

### AC-4: 文件夹递归遍历

**Given** 用户松手释放拖拽的文件夹
**When** 拖拽的是文件夹时
**Then** 系统通过 Tauri 后端 `resolve_dropped_paths` command 递归遍历文件夹中所有文件
**And** 遍历结果（扁平文件列表）返回前端并添加到队列
**And** 混合拖入（散文件 + 文件夹）自动正确处理——散文件直接添加，文件夹递归展开后添加
**And** 隐藏文件（以 `.` 开头）和系统文件（如 `.DS_Store`, `Thumbs.db`）被过滤排除

### AC-5: 追加拖拽（非空列表状态）

**Given** 待上传列表已有文件
**When** 用户再次拖拽新文件进入窗口
**Then** 新文件追加到现有队列末尾，不覆盖已有文件
**And** 拖拽区收缩为顶部小条（高度约 48px），显示"继续拖拽或点击添加文件"
**And** 小条区域仍支持拖拽和点击添加文件
**And** 整个窗口区域仍接受拖拽（全窗口拖拽目标）

### AC-6: 无障碍与键盘支持

**And** `FileDropZone` 组件具有 `role="button"` + `aria-label="添加文件"` 无障碍属性
**And** 键盘 Enter/Space 可触发隐藏的 `<input type="file">` 文件选择器
**And** 焦点指示器为 2px 品牌蓝环（`focus-visible` 而非 `focus`）

### AC-7: 减少动画偏好

**And** 尊重 `prefers-reduced-motion` 系统设置
**And** 开启时禁用拖拽区域的过渡动画（dragover 覆盖层出现/消失的 transition）
**And** 进度条更新等功能性动画不受影响

---

## Technical Design

### 数据流

```
用户拖拽文件/文件夹到窗口
  -> HTML5 Drag & Drop API (dragenter/dragover/dragleave/drop)
  -> useDragDrop hook 管理拖拽状态
  -> drop 事件获取 FileList / DataTransfer
     -> 散文件: 直接提取 { name, path, size }
     -> 文件夹/混合: 调用 invoke('resolve_dropped_paths', { paths })
        -> Rust command 递归遍历目录
        -> 返回 Vec<FileEntry> (扁平文件列表)
  -> uploadStore.addFiles(fileEntries)
  -> React 渲染更新
```

### 前端类型定义

```typescript
// src/types/upload.ts
interface PendingFile {
  id: string;           // crypto.randomUUID()
  fileName: string;     // 文件名（不含路径）
  filePath: string;     // 完整文件路径（Tauri 需要）
  fileSize: number;     // 文件大小（字节）
  status: 'pending';    // 待上传状态
}

// Rust command 返回的文件条目
interface FileEntry {
  fileName: string;
  filePath: string;
  fileSize: number;
}
```

### Rust Command 接口

```rust
// src-tauri/src/commands/files.rs

/// 解析拖拽路径：散文件直接返回，文件夹递归遍历。
/// 过滤隐藏文件和系统文件（.DS_Store, Thumbs.db 等）。
#[tauri::command]
async fn resolve_dropped_paths(paths: Vec<String>) -> Result<Vec<FileEntry>, String>
```

```rust
// src-tauri/src/models/file.rs

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
}
```

---

## Tasks

### Task 1: 定义前端类型 (types/upload.ts)

**文件:** `src/types/upload.ts`
**依赖:** 无

**Subtasks:**

1.1. 创建 `src/types/upload.ts`，定义 `PendingFile` 接口（id, fileName, filePath, fileSize, status）
1.2. 定义 `FileEntry` 接口（Rust command 返回类型：fileName, filePath, fileSize）
1.3. 定义 `DropZoneState` 类型：`'idle' | 'dragover' | 'collapsed'`

### Task 2: 实现 Rust 后端文件解析 command

**文件:** `src-tauri/src/models/file.rs`, `src-tauri/src/commands/files.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/models/mod.rs`, `src-tauri/src/lib.rs`
**依赖:** 无

**Subtasks:**

2.1. 创建 `src-tauri/src/models/file.rs`：定义 `FileEntry` 结构体，标注 `#[serde(rename_all = "camelCase")]`
2.2. 在 `src-tauri/src/models/mod.rs` 中添加 `pub mod file;`
2.3. 创建 `src-tauri/src/commands/files.rs`：实现 `resolve_dropped_paths` command
   - 接收 `Vec<String>` 路径列表
   - 对每个路径：如果是文件，直接构建 `FileEntry`；如果是目录，使用 `std::fs` 递归遍历
   - 过滤隐藏文件（文件名以 `.` 开头）和系统文件（`.DS_Store`, `Thumbs.db`, `desktop.ini`）
   - 返回 `Result<Vec<FileEntry>, String>`，错误通过 `AppError` 转换
2.4. 在 `src-tauri/src/commands/mod.rs` 中添加 `pub mod files;`
2.5. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册 `commands::files::resolve_dropped_paths`
2.6. 编写单元测试：空路径列表、单文件路径、目录路径（含隐藏文件过滤）、不存在路径的错误处理

### Task 3: 添加 Tauri IPC 封装函数

**文件:** `src/lib/tauri.ts`
**依赖:** Task 2

**Subtasks:**

3.1. 在 `src/lib/tauri.ts` 中添加 `resolveDroppedPaths(paths: string[]): Promise<FileEntry[]>` 封装函数
3.2. 引入 `FileEntry` 类型

### Task 4: 扩展 uploadStore — 文件队列管理

**文件:** `src/stores/uploadStore.ts`
**依赖:** Task 1

**Subtasks:**

4.1. 定义 `UploadState` 接口：`pendingFiles: PendingFile[]`
4.2. 实现 `addFiles(entries: FileEntry[])` action：将 `FileEntry[]` 映射为 `PendingFile[]`（生成 id，设 status='pending'），追加到 `pendingFiles` 队列末尾
4.3. 实现 `removeFile(id: string)` action：从 `pendingFiles` 中移除指定文件（Story 2.3 会用到，此处预埋）
4.4. 实现 `clearFiles()` action：清空待上传队列
4.5. 编写单元测试：addFiles 追加行为、removeFile 删除行为、clearFiles 清空行为、addFiles 不覆盖已有文件

### Task 5: 实现 useDragDrop hook

**文件:** `src/hooks/useDragDrop.ts`
**依赖:** Task 3, Task 4

**Subtasks:**

5.1. 创建 `src/hooks/useDragDrop.ts`
5.2. 管理拖拽状态：`isDragOver: boolean`（用于 UI dragover 反馈）
5.3. 使用 `useRef` 跟踪 dragenter/dragleave 计数器（解决嵌套元素导致的事件闪烁问题）
5.4. `handleDrop` 处理逻辑：
   - 从 `DataTransfer` 提取文件路径列表
   - 注意：Tauri 2 中拖拽文件通过 `event.dataTransfer.files` 获取，但路径需要通过 Tauri 的 drag-drop 事件获取（见 Task 5.5）
5.5. 集成 Tauri 2 的 `onDragDropEvent` API（`@tauri-apps/api/webviewWindow`）处理原生文件拖拽：
   - 监听 `drag-enter`、`drag-over`、`drag-leave`、`drag-drop` 事件
   - `drag-drop` 事件携带 `paths: string[]`（文件系统绝对路径）
   - 对获取的 paths 调用 `resolveDroppedPaths()` 获取完整文件信息
   - 调用 `uploadStore.addFiles()` 添加到队列
5.6. 返回 `{ isDragOver, dropZoneRef }` 供组件绑定
5.7. 尊重 `prefers-reduced-motion`：导出 `prefersReducedMotion` 状态，供组件决定是否启用过渡动画

### Task 6: 实现 FileDropZone 组件

**文件:** `src/components/upload/FileDropZone.tsx`
**依赖:** Task 5

**Subtasks:**

6.1. 创建 `src/components/upload/FileDropZone.tsx`
6.2. 接收 props：`interface FileDropZoneProps { collapsed?: boolean }`
6.3. **idle 状态**（`collapsed=false` 且 `pendingFiles.length === 0`）：
   - 大面积拖拽区域，`min-h-[320px]`，占父容器 flex-1
   - 虚线边框 `border-2 border-dashed border-[#D1D5DB]`
   - 浅灰背景 `bg-[#F9FAFB]`
   - 居中图标（Lucide `Upload` 图标，48px，`text-text-secondary`）+ 文案"将文件拖到这里，或点击选择文件"
   - 圆角 `rounded-lg`
6.4. **dragover 状态**（`isDragOver=true`）：
   - 蓝色实线边框 `border-2 border-solid border-brand`
   - 半透明蓝色覆盖层 `bg-brand/20`
   - 文案变为"松手即可添加"
   - 过渡动画 `transition-all duration-200`（尊重 `prefers-reduced-motion` 时移除 transition）
6.5. **collapsed 状态**（`collapsed=true`，即列表非空时）：
   - 收缩为顶部条 `h-12`（48px），水平布局
   - 虚线边框保留但更细 `border border-dashed border-[#D1D5DB]`
   - 文案"继续拖拽或点击添加文件"，12px caption 字号
   - 仍接受拖拽和点击
6.6. 点击事件：触发隐藏的 `<input type="file" multiple>` 元素
   - 通过 `useRef` 引用 input 元素
   - input 的 `onChange` 事件获取选中文件并调用 `resolveDroppedPaths` -> `addFiles`
   - 注意：此处文件选择器功能为基础骨架，Story 2.2 会完善
6.7. 无障碍属性：`role="button"`, `aria-label="添加文件"`, `tabIndex={0}`
6.8. 键盘支持：`onKeyDown` 处理 Enter/Space 触发文件选择器
6.9. 焦点样式：`focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`

### Task 7: 更新 UploadPage 集成 FileDropZone

**文件:** `src/components/upload/UploadPage.tsx`
**依赖:** Task 6

**Subtasks:**

7.1. 重构 `UploadPage.tsx`：移除占位内容
7.2. 从 `uploadStore` 读取 `pendingFiles` 列表长度判断是否 collapsed
7.3. 渲染 `FileDropZone` 组件，传入 `collapsed` prop
7.4. 当 `pendingFiles.length > 0` 时，渲染文件列表占位区域（文件列表 UI 将在 Story 2.3 实现）
7.5. 布局使用 `flex flex-col h-full`，FileDropZone 占据可用空间

### Task 8: 更新 Tauri capabilities 权限

**文件:** `src-tauri/capabilities/default.json`
**依赖:** 无

**Subtasks:**

8.1. 确认 `core:default` 权限是否包含 drag-drop 事件支持（Tauri 2 默认包含）
8.2. 如果需要，添加 `drag-drop` 相关权限到 capabilities

### Task 9: 编写前端测试

**文件:** `src/components/upload/FileDropZone.test.tsx`, `src/hooks/useDragDrop.test.ts`, `src/stores/uploadStore.test.ts`
**依赖:** Task 4, Task 5, Task 6

**Subtasks:**

9.1. `src/stores/uploadStore.test.ts`：
   - 测试 `addFiles` 将文件追加到队列
   - 测试 `addFiles` 多次调用不覆盖已有文件
   - 测试 `removeFile` 正确移除
   - 测试 `clearFiles` 清空队列
9.2. `src/components/upload/FileDropZone.test.tsx`：
   - 测试 idle 状态渲染正确文案
   - 测试 collapsed 状态渲染收缩样式
   - 测试无障碍属性存在（role, aria-label）
   - 测试键盘 Enter 触发文件选择器
   - 测试点击触发文件选择器

---

## Task 依赖顺序

```
Task 1 (类型定义)  ──┬──> Task 4 (uploadStore) ──┐
                     │                            │
Task 2 (Rust cmd)  ──┴──> Task 3 (IPC 封装)     ──┴──> Task 5 (useDragDrop hook)
                                                        │
Task 8 (capabilities) ─────────────────────────────────>│
                                                        v
                                                  Task 6 (FileDropZone)
                                                        │
                                                        v
                                                  Task 7 (UploadPage 集成)
                                                        │
                                                        v
                                                  Task 9 (前端测试)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/types/upload.ts` | 上传相关 TypeScript 类型定义 |
| `src/hooks/useDragDrop.ts` | 拖拽逻辑封装 hook |
| `src/hooks/useDragDrop.test.ts` | useDragDrop hook 测试 |
| `src/components/upload/FileDropZone.tsx` | 文件拖拽区组件 |
| `src/components/upload/FileDropZone.test.tsx` | FileDropZone 组件测试 |
| `src-tauri/src/commands/files.rs` | 文件解析 Tauri command |
| `src-tauri/src/models/file.rs` | 文件条目数据模型 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/stores/uploadStore.ts` | 扩展为完整的文件队列状态管理 |
| `src/stores/uploadStore.test.ts` | 新增/更新 uploadStore 测试（如果已存在则修改，否则新建） |
| `src/lib/tauri.ts` | 添加 `resolveDroppedPaths` 封装函数 |
| `src/components/upload/UploadPage.tsx` | 集成 FileDropZone，替换占位内容 |
| `src-tauri/src/commands/mod.rs` | 添加 `pub mod files;` |
| `src-tauri/src/models/mod.rs` | 添加 `pub mod file;` |
| `src-tauri/src/lib.rs` | 注册 `resolve_dropped_paths` command |
| `src-tauri/capabilities/default.json` | 按需添加 drag-drop 权限 |

### 禁止修改

- `src/stores/appStore.ts` — 不属于本 Story 范围
- `src/stores/historyStore.ts` — 不属于本 Story 范围
- `src-tauri/src/api/` — 不涉及 gigafile.nu API
- `src-tauri/src/services/` — 不涉及业务逻辑层
- `src-tauri/src/storage/` — 不涉及持久化

---

## Technical Notes

### Tauri 2 拖拽文件路径获取

Tauri 2 的 WebView 中，HTML5 原生 `drop` 事件的 `DataTransfer` 不包含文件系统绝对路径（浏览器安全限制）。需要使用 Tauri 2 提供的原生拖拽事件 API：

```typescript
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const appWindow = getCurrentWebviewWindow();
const unlisten = await appWindow.onDragDropEvent((event) => {
  if (event.payload.type === 'drop') {
    // event.payload.paths: string[] — 文件系统绝对路径
  }
  if (event.payload.type === 'enter') {
    // 文件进入窗口区域
  }
  if (event.payload.type === 'leave') {
    // 文件离开窗口区域
  }
});
```

`useDragDrop` hook 应基于此 API 实现拖拽监听，而非 HTML5 原生 drag/drop 事件。

### 隐藏文件过滤规则

Rust `resolve_dropped_paths` command 应过滤以下文件：
- 文件名以 `.` 开头的隐藏文件（Unix 惯例）
- `.DS_Store`（macOS）
- `Thumbs.db`、`desktop.ini`（Windows）
- `__MACOSX` 目录

### uploadStore 设计要点

- `pendingFiles` 数组为纯前端状态，不需要持久化
- `addFiles` 使用 `crypto.randomUUID()` 生成文件 ID
- 组件使用精确选择器订阅：`useUploadStore(s => s.pendingFiles.length)` 而非整个 store

### prefers-reduced-motion

使用 CSS media query 或 `window.matchMedia('(prefers-reduced-motion: reduce)')` 检测。推荐在 `useDragDrop` hook 中通过 `matchMedia` 检测并返回状态，`FileDropZone` 根据此状态决定是否添加 `transition` 类名。

---

## Definition of Done

- [ ] 空列表时显示大面积拖拽区域（虚线边框 + 提示文案）
- [ ] 拖拽悬停时显示蓝色边框 + 半透明覆盖层
- [ ] 散文件拖拽落入后正确添加到 uploadStore 队列
- [ ] 文件夹拖拽落入后通过 Rust 后端递归遍历并添加
- [ ] 混合拖入（散文件 + 文件夹）正确处理
- [ ] 隐藏文件和系统文件被过滤
- [ ] 非空列表时拖拽区收缩为顶部小条
- [ ] 追加拖拽不覆盖已有文件
- [ ] FileDropZone 具有正确的无障碍属性
- [ ] 键盘 Enter/Space 可触发文件选择器
- [ ] prefers-reduced-motion 开启时禁用过渡动画
- [ ] Rust command 通过 cargo clippy 无警告
- [ ] Rust 单元测试通过
- [ ] 前端 Vitest 测试通过
- [ ] pnpm lint 无错误
