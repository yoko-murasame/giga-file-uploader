# Story 3.6: 上传完成、链接产出与一键复制

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-6 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 3-3 (上传引擎核心) -- 已完成, Story 3-4 (重试引擎与错误处理) -- 已完成, Story 3-5 (上传进度聚合与实时展示) -- 已完成 |
| FRs 覆盖 | FR14 (上传完成状态), FR15 (文件链接产出), FR16 (一键复制链接), FR17 (标准 gigafile.nu 链接) |
| NFRs 关联 | NFR3 (链接复制操作 200ms 内完成) |

## User Story

As a 用户,
I want 文件上传完成后立即看到下载链接并一键复制,
So that 我可以快速将链接分享给他人。

---

## Acceptance Criteria

### AC-1: Rust 文件完成事件发射（upload:file-complete）

**Given** 单个文件的所有分片上传完成（`upload_file()` 返回 `Ok(())`）
**When** 服务端返回下载链接
**Then** 在 `upload_file()` 成功完成时，通过 Tauri event `upload:file-complete` 推送到前端（FR15）
**And** 事件 payload 结构：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCompletePayload {
    pub task_id: String,
    pub file_name: String,
    pub download_url: String,
    pub file_size: u64,
}
```

**And** 单分片文件：`download_url` 取 `task.shards[0].download_url`
**And** 多分片文件：`download_url` 取 `task.shards[0].download_url`（首分片 URL 作为代表链接）
**And** 产出的链接为标准 gigafile.nu 格式，与平台原生上传完全兼容（FR17）
**And** `FileCompletePayload` 定义在 `services/upload_engine.rs` 中（与现有 `UploadErrorPayload` 使用模式一致）

### AC-2: Rust 全部完成事件发射（upload:all-complete）

**Given** 多个文件同时上传
**When** 最后一个文件完成处理（成功或失败）
**Then** 通过 Tauri event `upload:all-complete` 推送到前端
**And** 使用 `Arc<AtomicU32>` 计数器跟踪剩余文件数，在 `start()` 中初始化为文件总数
**And** 每个文件的 tokio::spawn 任务完成时（无论成功/失败）递减计数器
**And** 当计数器从 1 递减到 0 时发射 `upload:all-complete` 事件
**And** 事件 payload 为空对象（前端可自行汇总 activeTasks 状态）：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllCompletePayload {}
```

### AC-3: 前端类型定义扩展

**Given** Rust 后端新增 `upload:file-complete` 和 `upload:all-complete` 事件
**When** 前端需要接收这些事件
**Then** 在 `types/upload.ts` 中添加类型定义：

```typescript
/** File complete event payload from Rust upload:file-complete event */
export interface FileCompletePayload {
  taskId: string;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
}

/** All files complete event payload from Rust upload:all-complete event */
export interface AllCompletePayload {}
```

**And** 扩展 `UploadTaskProgress` 接口，添加 `downloadUrl` 可选字段：

```typescript
export interface UploadTaskProgress {
  taskId: string;
  fileName: string;
  fileSize: number;
  fileProgress: number;
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
  downloadUrl?: string;  // 新增：上传完成后的下载链接
}
```

### AC-4: uploadStore 完成状态管理

**Given** 前端需要处理上传完成和链接数据
**When** 扩展 `uploadStore`
**Then** 添加 `setTaskFileComplete` action：

```typescript
setTaskFileComplete: (taskId: string, downloadUrl: string) => void;
```

**And** `setTaskFileComplete` 更新对应 task：`status` 设为 `'completed'`，`fileProgress` 设为 `100`，`downloadUrl` 设为传入的链接
**And** 添加 `allUploadsComplete` 状态字段（`boolean`，初始值 `false`）
**And** 添加 `setAllComplete` action：将 `allUploadsComplete` 设为 `true`
**And** `startUpload` action 中将 `allUploadsComplete` 重置为 `false`
**And** 现有的 `setTaskCompleted` action 保留（用于无链接的完成场景），`setTaskFileComplete` 为带链接的完成

### AC-5: useUploadEvents hook 扩展

**Given** Rust 后端发射 `upload:file-complete` 和 `upload:all-complete` 事件
**When** 扩展 `useUploadEvents` hook
**Then** 新增订阅 `upload:file-complete` 事件：

```typescript
const unlisten3 = await listen<FileCompletePayload>('upload:file-complete', (event) => {
  useUploadStore.getState().setTaskFileComplete(
    event.payload.taskId,
    event.payload.downloadUrl,
  );
});
```

**And** 新增订阅 `upload:all-complete` 事件：

```typescript
const unlisten4 = await listen<AllCompletePayload>('upload:all-complete', () => {
  useUploadStore.getState().setAllComplete();
});
```

**And** 在 unmount 时取消这两个新增的事件监听
**And** 保持现有 `upload:progress` 和 `upload:error` 监听不变

### AC-6: CopyButton 共享组件

**Given** 用户需要复制下载链接
**When** 创建 `src/components/shared/CopyButton.tsx` 组件
**Then** 组件接受 `text` prop（待复制文本）和可选 `className` prop
**And** 默认显示复制图标（Lucide React `Copy`），点击后调用 `copyToClipboard(text)`
**And** 复制成功后图标变为勾号（Lucide React `Check`），1.5 秒后恢复为复制图标
**And** 复制操作在 200ms 内完成（NFR3）
**And** `aria-label` 默认为 `"复制链接"`，复制成功后变为 `"已复制"`
**And** 按钮样式为 Ghost Icon Button（32x32px），与现有删除按钮风格一致
**And** 组件使用 `React.memo` 包裹

### AC-7: 剪贴板功能封装

**Given** 需要将文本复制到系统剪贴板
**When** 实现剪贴板功能
**Then** 在 `lib/tauri.ts` 中添加 `copyToClipboard` 函数：

```typescript
/** Copy text to system clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
```

**And** CopyButton 通过 `lib/tauri.ts` 调用此函数（保持 IPC 抽象层统一入口模式）
**And** `navigator.clipboard.writeText()` 在 Tauri webview 中可直接使用，无需额外插件

### AC-8: UploadFileItem 完成状态 UI

**Given** 前端收到 `upload:file-complete` 事件，uploadStore 中对应 task 状态为 `completed`
**When** 渲染 UploadFileItem 组件
**Then** 进度条背景色变为绿色（Success `#10B981`，Tailwind class `bg-success`）
**And** 进度条右侧显示勾号图标（Lucide React `CheckCircle2`，绿色）替代百分比数字
**And** 文件名下方显示下载链接文本（截断，悬停 Tooltip 显示完整链接）
**And** 链接文本右侧显示 CopyButton 组件（FR16）
**And** 状态标签显示"已完成"（FR14）
**And** 隐藏删除按钮（已完成的文件不可删除）
**And** 使用 Zustand 精确选择器（`useUploadStore(s => s.activeTasks[taskId])`），仅变化的 task 触发重渲染

### AC-9: 单元测试

**Given** 前端功能实现完成
**When** 执行测试
**Then** 前端测试（`stores/uploadStore.test.ts` 追加）：
- **setTaskFileComplete action**：验证状态变为 completed、fileProgress 为 100、downloadUrl 已设置
- **setAllComplete action**：验证 allUploadsComplete 变为 true
- **startUpload action 重置**：验证 startUpload 后 allUploadsComplete 重置为 false
**And** 前端测试（`components/shared/CopyButton.test.tsx` 新建）：
- **渲染与点击**：验证点击后调用 clipboard API（mock `navigator.clipboard.writeText`）
- **图标切换**：验证点击后 aria-label 变为"已复制"
**And** Rust 测试不需要新增（`upload:file-complete` 事件发射逻辑通过集成测试覆盖，依赖 `AppHandle` 无法在单元测试中构造）
**And** `cargo clippy` 无警告
**And** `pnpm test` 前端测试通过
**And** `pnpm lint` 无错误

---

## Technical Design

### 现状分析

Story 3-3/3-4/3-5 已完成以下基础设施：

- `src-tauri/src/services/upload_engine.rs` — `start()` 调度入口（接受 `progress: Arc<ProgressAggregator>`），`upload_file()` 单文件上传（接受 `app: tauri::AppHandle` + `task_id: String` + `progress`），`upload_shard()` 分片上传（首块串行 + 并发 + 进度追踪）
- `src-tauri/src/services/retry_engine.rs` — `retry_upload_chunk()` 异步重试，`UploadErrorPayload` 事件 payload
- `src-tauri/src/services/progress.rs` — `ProgressAggregator` 进度聚合器，50ms 定时发射
- `src-tauri/src/commands/upload.rs` — `UploadState`（`cancel_flags` + `progress`），`start_upload` / `cancel_upload` Tauri commands
- `src-tauri/src/lib.rs` — `.setup()` hook 初始化 `UploadState` + 3 个 command 注册
- `src/stores/uploadStore.ts` — `pendingFiles` + `activeTasks`，包含 `startUpload`/`updateProgress`/`setTaskError`/`setTaskCompleted` actions
- `src/types/upload.ts` — `PendingFile`、`FileEntry`、`ShardProgress`、`UploadTaskProgress`、`ProgressPayload`、`UploadErrorPayload`、`RetryWarningPayload` 类型
- `src/lib/tauri.ts` — `resolveDroppedPaths`、`openFilePicker`、`startUpload`、`cancelUpload` 函数，导出 `invoke`/`listen`
- `src/hooks/useUploadEvents.ts` — 订阅 `upload:progress` 和 `upload:error` 事件
- `src/components/upload/UploadFileItem.tsx` — 文件名 + 大小 + 删除按钮 + 进度条（Radix UI Progress），支持分片级进度展开
- `src/components/upload/UploadPage.tsx` — FileDropZone + UploadFileList + useUploadEvents
- `src/components/upload/UploadFileList.tsx` — 渲染 pendingFiles 和 activeTaskIds

**关键集成点：**

- `upload_file()` 已在成功完成时设置 `task.status = UploadStatus::Completed` 和 `task.download_url`（单分片）/ `shard.download_url`（各分片），但未发射 `upload:file-complete` 事件
- `start()` 的 `tokio::spawn` 完成后仅清理 progress 和 cancel_flags，无 all-complete 追踪机制
- `UploadTaskProgress` 类型无 `downloadUrl` 字段
- `useUploadEvents` 未订阅 `upload:file-complete` 和 `upload:all-complete`
- `UploadFileItem` 无完成状态 UI（无绿色进度条、无链接展示、无复制按钮）

### 新增/修改模块

#### 1. `services/upload_engine.rs` — 事件发射（修改）

**修改点 1：添加 `FileCompletePayload` 和 `AllCompletePayload` 结构体**

```rust
use serde::Serialize;

/// File upload completion event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCompletePayload {
    pub task_id: String,
    pub file_name: String,
    pub download_url: String,
    pub file_size: u64,
}

/// All files complete event payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllCompletePayload {}
```

**修改点 2：`upload_file()` — 成功完成后发射 `upload:file-complete`**

```rust
async fn upload_file(
    mut task: UploadTask,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: Arc<AtomicBool>,
    app: tauri::AppHandle,
    task_id: String,
    progress: Arc<ProgressAggregator>,
) -> crate::error::Result<()> {
    // ... 现有 shard 上传循环 ...

    // 收集 download URL
    if task.shards.len() == 1 {
        task.download_url = task.shards[0].download_url.clone();
    }
    task.status = UploadStatus::Completed;

    // 新增：发射 upload:file-complete 事件
    let download_url = task.shards[0]
        .download_url
        .clone()
        .unwrap_or_default();
    let _ = app.emit(
        "upload:file-complete",
        FileCompletePayload {
            task_id,
            file_name: task.file_name.clone(),
            download_url,
            file_size: task.file_size,
        },
    );

    Ok(())
}
```

**修改点 3：`start()` — 使用 `AtomicU32` 追踪文件完成数，发射 `upload:all-complete`**

```rust
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    app: tauri::AppHandle,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    progress: Arc<ProgressAggregator>,
) -> crate::error::Result<Vec<String>> {
    let server_url = api.discover_server().await?;
    let mut task_ids = Vec::with_capacity(files.len());

    progress.start_emitter();

    // 新增：文件完成计数器
    let remaining_files = Arc::new(AtomicU32::new(files.len() as u32));

    for file in files {
        // ... 现有 task 创建逻辑 ...

        let remaining_files_clone = remaining_files.clone();
        let app_for_complete = app.clone();

        tokio::spawn(async move {
            let result = upload_file(
                task, &server_url, &config, cancel_flag,
                app_clone, task_id_for_upload, progress_clone.clone(),
            ).await;

            if let Err(e) = &result {
                log::error!("Upload failed for file '{}': {}", file_name, e);
            }

            // Clean up progress tracking and cancel flag
            progress_clone.remove_task(&task_id_clone).await;
            let mut flags = cancel_flags_clone.lock().await;
            flags.remove(&task_id_clone);

            // 新增：检查是否所有文件都已完成
            if remaining_files_clone.fetch_sub(1, Ordering::AcqRel) == 1 {
                let _ = app_for_complete.emit("upload:all-complete", AllCompletePayload {});
            }
        });

        task_ids.push(task_id);
    }

    Ok(task_ids)
}
```

#### 2. `types/upload.ts` — 新增完成事件类型（修改）

```typescript
/** File complete event payload from Rust upload:file-complete event */
export interface FileCompletePayload {
  taskId: string;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
}

/** All files complete event payload from Rust upload:all-complete event */
export interface AllCompletePayload {}
```

扩展 `UploadTaskProgress`：

```typescript
export interface UploadTaskProgress {
  taskId: string;
  fileName: string;
  fileSize: number;
  fileProgress: number;
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
  downloadUrl?: string;  // 新增
}
```

#### 3. `stores/uploadStore.ts` — 完成状态管理（修改）

```typescript
interface UploadState {
  pendingFiles: PendingFile[];
  activeTasks: Record<string, UploadTaskProgress>;
  allUploadsComplete: boolean;  // 新增
  addFiles: (entries: FileEntry[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  startUpload: (lifetime: number) => Promise<void>;
  updateProgress: (payload: ProgressPayload) => void;
  setTaskError: (taskId: string) => void;
  setTaskCompleted: (taskId: string) => void;
  setTaskFileComplete: (taskId: string, downloadUrl: string) => void;  // 新增
  setAllComplete: () => void;  // 新增
}
```

新增 actions：

```typescript
setTaskFileComplete: (taskId, downloadUrl) =>
  set((state) => {
    const existing = state.activeTasks[taskId];
    if (!existing) return state;
    return {
      activeTasks: {
        ...state.activeTasks,
        [taskId]: {
          ...existing,
          status: 'completed',
          fileProgress: 100,
          downloadUrl,
        },
      },
    };
  }),

setAllComplete: () => set({ allUploadsComplete: true }),
```

修改 `startUpload` action：在开始上传时重置 `allUploadsComplete`：

```typescript
startUpload: async (lifetime) => {
  // ... 现有逻辑 ...
  set((state) => ({
    pendingFiles: [],
    activeTasks: { ...state.activeTasks, ...newActiveTasks },
    allUploadsComplete: false,  // 重置
  }));
},
```

#### 4. `lib/tauri.ts` — 剪贴板封装（修改）

```typescript
/** Copy text to system clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
```

#### 5. `hooks/useUploadEvents.ts` — 新增事件订阅（修改）

```typescript
import type {
  FileCompletePayload,
  AllCompletePayload,
  ProgressPayload,
  UploadErrorPayload,
} from '@/types/upload';

export function useUploadEvents() {
  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const setup = async () => {
      // ... 现有 upload:progress 和 upload:error 订阅 ...

      // 新增：upload:file-complete
      const unlisten3 = await listen<FileCompletePayload>(
        'upload:file-complete',
        (event) => {
          useUploadStore.getState().setTaskFileComplete(
            event.payload.taskId,
            event.payload.downloadUrl,
          );
        },
      );
      if (cancelled) { unlisten3(); return; }
      cleanups.push(unlisten3);

      // 新增：upload:all-complete
      const unlisten4 = await listen<AllCompletePayload>(
        'upload:all-complete',
        () => {
          useUploadStore.getState().setAllComplete();
        },
      );
      if (cancelled) { unlisten4(); return; }
      cleanups.push(unlisten4);
    };

    setup();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
```

#### 6. `components/shared/CopyButton.tsx` — 复制按钮组件（新建）

```tsx
import { memo, useCallback, useRef, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { copyToClipboard } from '@/lib/tauri';

interface CopyButtonProps {
  text: string;
  className?: string;
}

function CopyButtonInner({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? '已复制' : '复制链接'}
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-border hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${className ?? ''}`}
    >
      {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
    </button>
  );
}

const CopyButton = memo(CopyButtonInner);
export default CopyButton;
```

#### 7. `components/upload/UploadFileItem.tsx` — 完成状态 UI（修改）

添加完成状态的条件渲染：

```tsx
import { Check, CheckCircle2, ChevronDown, ChevronRight, File, X } from 'lucide-react';
import CopyButton from '@/components/shared/CopyButton';

// 在组件内部：

const isCompleted = taskProgress?.status === 'completed';
const isError = taskProgress?.status === 'error';

// 进度条区域修改：
{isUploading && (
  <div className="mt-2">
    <Progress.Root className="h-2 w-full overflow-hidden rounded-full bg-border">
      <Progress.Indicator
        className={`h-full ${isCompleted ? 'bg-success' : 'bg-brand'}`}
        style={{
          width: `${taskProgress.fileProgress}%`,
          transition: 'width 300ms ease',
        }}
      />
    </Progress.Root>

    {/* 完成状态：显示链接 + 复制按钮 */}
    {isCompleted && taskProgress.downloadUrl && (
      <div className="mt-1.5 flex items-center gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <a
              href={taskProgress.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-xs text-brand hover:underline"
            >
              {taskProgress.downloadUrl}
            </a>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="max-w-xs break-all rounded-md bg-text-primary px-2 py-1 text-xs text-surface"
              sideOffset={4}
            >
              {taskProgress.downloadUrl}
              <Tooltip.Arrow className="fill-text-primary" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <CopyButton text={taskProgress.downloadUrl} />
      </div>
    )}

    {/* 分片详情（未完成时显示） */}
    {!isCompleted && hasMultipleShards && (
      // ... 现有分片展开逻辑 ...
    )}
  </div>
)}

// 百分比/勾号区域修改：
{isUploading && (
  isCompleted ? (
    <CheckCircle2 size={18} className="shrink-0 text-success" />
  ) : (
    <span className="shrink-0 text-sm font-medium text-text-primary">
      {Math.round(taskProgress.fileProgress)}%
    </span>
  )
)}
```

### 数据流

```
Rust upload_file() 成功完成:
  → task.status = Completed
  → download_url = task.shards[0].download_url
  → app.emit("upload:file-complete", FileCompletePayload)
  → (在 spawn 块中) remaining_files.fetch_sub(1)
  → if remaining == 0: app.emit("upload:all-complete", AllCompletePayload)

Frontend:
  → useUploadEvents hook: listen("upload:file-complete")
      → uploadStore.setTaskFileComplete(taskId, downloadUrl)
          → activeTasks[taskId].status = 'completed'
          → activeTasks[taskId].fileProgress = 100
          → activeTasks[taskId].downloadUrl = downloadUrl
  → useUploadEvents hook: listen("upload:all-complete")
      → uploadStore.setAllComplete()
          → allUploadsComplete = true
  → UploadFileItem: useUploadStore(s => s.activeTasks[taskId])
      → isCompleted = true
      → 渲染绿色进度条 + 勾号 + 链接 + CopyButton
  → CopyButton click:
      → copyToClipboard(downloadUrl)
      → navigator.clipboard.writeText(downloadUrl) (< 200ms)
      → 图标切换 Copy → Check (1.5s 后恢复)
```

### 设计决策

1. **`FileCompletePayload` 定义在 `upload_engine.rs`**：与 `UploadErrorPayload`（定义在 `retry_engine.rs`）保持一致的模式——事件 payload 定义在发射它的模块中。不创建独立的 events 模块，避免过度抽象。

2. **`download_url` 使用 `String` 而非 `Option<String>`**：如果 upload_file 成功完成但 shard 没有 download_url（理论上不应发生），使用 `unwrap_or_default()` 提供空字符串。前端检查空字符串并不显示链接。这比 Option 更简单且不会 panic。

3. **多分片文件使用首分片 URL**：gigafile.nu 对 >1GB 文件的每个分片产出独立下载链接。MVP 阶段使用首分片 URL 作为代表链接。完整的多分片 URL 列表展示可在 Phase 2 中实现。

4. **`allUploadsComplete` 由 Rust 事件驱动**：不在前端轮询 activeTasks 状态，而是由 Rust 端的 `AtomicU32` 计数器在最后一个文件完成时发射 `upload:all-complete`。这确保完成检测的准确性（包括 spawn 内部的清理操作完成后）。

5. **剪贴板使用 `navigator.clipboard.writeText()`**：Tauri webview 中此 API 可直接使用，无需 `tauri-plugin-clipboard-manager` 插件。通过 `lib/tauri.ts` 的 `copyToClipboard()` 函数封装，保持统一入口模式。如需切换到插件实现，仅修改此函数即可。

6. **`setTaskFileComplete` 与 `setTaskCompleted` 并存**：`setTaskCompleted` 是 Story 3-5 添加的无链接完成 action（用于通用场景）。`setTaskFileComplete` 是带 `downloadUrl` 的完成 action。`upload:file-complete` 事件触发 `setTaskFileComplete`，确保 `downloadUrl` 被正确存储。

7. **CopyButton 为共享组件**：放在 `components/shared/` 目录，Story 4.2（历史记录）将复用此组件。使用 `React.memo` 和 `useCallback` 优化重渲染。

8. **完成后隐藏分片详情**：文件上传完成后不再需要分片级进度视图，改为显示链接和复制按钮。保持 UI 简洁。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.5（进度聚合） | 本 Story 复用 3.5 的 `activeTasks` 状态和 `UploadFileItem` 组件，在其基础上添加完成状态展示 |
| Story 4.1（历史持久化） | Story 4.1 将在 `upload:file-complete` 事件触发时同步保存记录到本地存储。可在 Rust 端或前端 hook 中实现 |
| Story 4.2（历史记录列表） | 将复用本 Story 创建的 `CopyButton` 共享组件 |

---

## Tasks

### Task 1: Rust 事件 payload 定义与发射

**文件:** `src-tauri/src/services/upload_engine.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 添加 `use serde::Serialize;` 导入（如尚未导入）
1.2. 定义 `FileCompletePayload` 结构体（`#[serde(rename_all = "camelCase")]`，含 task_id、file_name、download_url、file_size）
1.3. 定义 `AllCompletePayload` 结构体（`#[serde(rename_all = "camelCase")]`，空结构体）
1.4. 在 `upload_file()` 成功完成处（`task.status = UploadStatus::Completed` 之后），收集 download_url 并发射 `upload:file-complete` 事件
1.5. 在 `start()` 中创建 `Arc<AtomicU32>` 计数器，初始化为 `files.len() as u32`
1.6. 在每个 `tokio::spawn` 块末尾，clone 计数器和 app handle，递减计数器
1.7. 当 `fetch_sub(1, Ordering::AcqRel)` 返回 1 时（最后一个文件），发射 `upload:all-complete` 事件

### Task 2: 前端类型定义扩展

**文件:** `src/types/upload.ts`（修改）
**依赖:** 无

**Subtasks:**

2.1. 添加 `FileCompletePayload` interface
2.2. 添加 `AllCompletePayload` interface
2.3. 在 `UploadTaskProgress` 中添加 `downloadUrl?: string` 可选字段

### Task 3: uploadStore 完成状态扩展

**文件:** `src/stores/uploadStore.ts`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 在 UploadState interface 中添加 `allUploadsComplete: boolean` 状态字段
3.2. 在 UploadState interface 中添加 `setTaskFileComplete: (taskId: string, downloadUrl: string) => void` action
3.3. 在 UploadState interface 中添加 `setAllComplete: () => void` action
3.4. 实现 `setTaskFileComplete` action：更新 status/fileProgress/downloadUrl
3.5. 实现 `setAllComplete` action：设置 `allUploadsComplete = true`
3.6. 在初始 state 中设置 `allUploadsComplete: false`
3.7. 在 `startUpload` action 中重置 `allUploadsComplete: false`

### Task 4: 剪贴板封装与 tauri.ts 扩展

**文件:** `src/lib/tauri.ts`（修改）
**依赖:** 无

**Subtasks:**

4.1. 添加 `copyToClipboard(text: string): Promise<void>` 函数

### Task 5: useUploadEvents hook 扩展

**文件:** `src/hooks/useUploadEvents.ts`（修改）
**依赖:** Task 2, Task 3

**Subtasks:**

5.1. 添加 `FileCompletePayload` 和 `AllCompletePayload` 类型导入
5.2. 新增 `upload:file-complete` 事件监听，调用 `setTaskFileComplete`
5.3. 新增 `upload:all-complete` 事件监听，调用 `setAllComplete`
5.4. 在 cleanup 中取消新增的事件监听

### Task 6: 创建 CopyButton 共享组件

**文件:** `src/components/shared/CopyButton.tsx`（新建）
**依赖:** Task 4

**Subtasks:**

6.1. 创建 `src/components/shared/CopyButton.tsx` 文件
6.2. 定义 `CopyButtonProps` interface（`text: string`，`className?: string`）
6.3. 实现点击复制逻辑（调用 `copyToClipboard`）
6.4. 实现图标切换状态（Copy → Check，1.5 秒后恢复）
6.5. 添加 `aria-label` 动态切换（"复制链接" → "已复制"）
6.6. 样式：Ghost Icon Button 32x32px
6.7. 使用 `React.memo` 包裹

### Task 7: UploadFileItem 完成状态 UI

**文件:** `src/components/upload/UploadFileItem.tsx`（修改）
**依赖:** Task 3, Task 6

**Subtasks:**

7.1. 添加 `CheckCircle2` 导入（Lucide React）和 `CopyButton` 导入
7.2. 添加 `isCompleted` 派生状态（`taskProgress?.status === 'completed'`）
7.3. 修改进度条颜色：完成时使用 `bg-success` 替代 `bg-brand`
7.4. 修改百分比区域：完成时显示 `CheckCircle2` 绿色勾号图标，替代百分比数字
7.5. 添加完成状态链接展示：链接文本（truncate + Tooltip）+ CopyButton
7.6. 完成后隐藏分片级进度展开区域
7.7. 完成后隐藏删除按钮（已由 `!isUploading` 条件覆盖）

### Task 8: 编写测试

**文件:** 多文件
**依赖:** Task 1, Task 3, Task 5, Task 6, Task 7

**Subtasks:**

8.1. 前端测试：`stores/uploadStore.test.ts` — `setTaskFileComplete` action 验证 status/fileProgress/downloadUrl
8.2. 前端测试：`stores/uploadStore.test.ts` — `setAllComplete` action 验证 allUploadsComplete 为 true
8.3. 前端测试：`stores/uploadStore.test.ts` — `startUpload` action 验证 allUploadsComplete 重置为 false
8.4. 前端测试：`components/shared/CopyButton.test.tsx` — 点击调用 clipboard API
8.5. 前端测试：`components/shared/CopyButton.test.tsx` — 点击后 aria-label 变为"已复制"

### Task 9: 代码质量验证

**文件:** 无新文件
**依赖:** Task 8

**Subtasks:**

9.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
9.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
9.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过
9.4. 执行 `pnpm test` 确认前端测试通过
9.5. 执行 `pnpm lint` 确认 ESLint 无错误

---

## Task 依赖顺序

```
Task 1 (Rust 事件发射)
                                                    ↘
Task 2 (前端类型) ──→ Task 3 (uploadStore) ──→ Task 7 (UploadFileItem UI) ──→ Task 8 (测试)
                          │                                                       │
Task 4 (tauri.ts) ──→ Task 6 (CopyButton) ─────────────→ Task 7                  │
                          │                                                       │
                          └──→ Task 5 (useUploadEvents) ──→ Task 8               │
                                                                                  │
                                                                             Task 9 (质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src/components/shared/CopyButton.tsx` | 共享复制按钮组件：点击复制到剪贴板、图标切换（Copy → Check，1.5s）、aria-label 动态切换、React.memo 包裹 |
| `src/components/shared/CopyButton.test.tsx` | CopyButton 单元测试：点击调用 clipboard API、aria-label 切换验证 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src-tauri/src/services/upload_engine.rs` | 添加 `FileCompletePayload` / `AllCompletePayload` 结构体定义；`upload_file()` 成功后发射 `upload:file-complete` 事件；`start()` 添加 `AtomicU32` 计数器和 `upload:all-complete` 事件发射 |
| `src/types/upload.ts` | 添加 `FileCompletePayload`、`AllCompletePayload` 类型；`UploadTaskProgress` 添加 `downloadUrl?` 字段 |
| `src/stores/uploadStore.ts` | 添加 `allUploadsComplete` 状态；添加 `setTaskFileComplete`、`setAllComplete` actions；`startUpload` 中重置 `allUploadsComplete` |
| `src/stores/uploadStore.test.ts` | 追加 `setTaskFileComplete`、`setAllComplete`、`startUpload` 重置 allUploadsComplete 测试 |
| `src/hooks/useUploadEvents.ts` | 新增 `upload:file-complete` 和 `upload:all-complete` 事件监听 |
| `src/lib/tauri.ts` | 添加 `copyToClipboard()` 函数 |
| `src/components/upload/UploadFileItem.tsx` | 完成状态 UI：绿色进度条、CheckCircle2 勾号、下载链接展示、CopyButton 集成 |

### 禁止修改

- `src-tauri/src/api/mod.rs` — `GigafileApi` trait 定义不变
- `src-tauri/src/api/v1.rs` — `upload_chunk()` 实现不变
- `src-tauri/src/error.rs` — `AppError` 已有所有必要变体
- `src-tauri/src/models/upload.rs` — 数据模型不变（`UploadTask.download_url` 已有）
- `src-tauri/src/models/file.rs` — `FileEntry` 不变
- `src-tauri/src/services/chunk_manager.rs` — 分块规划器不变
- `src-tauri/src/services/retry_engine.rs` — 重试引擎不变
- `src-tauri/src/services/progress.rs` — 进度聚合器不变
- `src-tauri/src/services/mod.rs` — 无需修改（upload_engine 已注册）
- `src-tauri/src/commands/upload.rs` — command 层不变（事件发射在 services 层）
- `src-tauri/src/lib.rs` — 无需新增 command 注册或 managed state
- `src-tauri/Cargo.toml` — 不需要新增依赖（serde、tauri 已有）
- `src/App.css` — 设计 Token 不变（`--color-success` 已定义）
- `src/App.tsx` — 应用入口不变
- `src/stores/appStore.ts` — 不涉及
- `src/stores/historyStore.ts` — 不涉及
- `src/components/upload/UploadFileList.tsx` — 不需要修改（已正确传递 taskId 到 UploadFileItem）
- `src/components/upload/UploadPage.tsx` — 不需要修改（已调用 useUploadEvents）
- `src/components/upload/FileDropZone.tsx` — 不涉及

---

## Technical Notes

### Tauri 2.x 事件发射

```rust
use tauri::Emitter;

// 发射文件完成事件
app.emit("upload:file-complete", FileCompletePayload { ... })?;

// 发射全部完成事件
app.emit("upload:all-complete", AllCompletePayload {})?;
```

`tauri::Emitter` trait 在 `upload_engine.rs` 中已导入（Story 3-4 添加）。

### AtomicU32 完成追踪

```rust
let remaining = Arc::new(AtomicU32::new(files.len() as u32));

// 在每个 spawn 块末尾：
// fetch_sub 返回操作前的值。如果返回 1，说明当前操作将值从 1 减到 0，
// 即当前是最后一个完成的文件。
if remaining.fetch_sub(1, Ordering::AcqRel) == 1 {
    app.emit("upload:all-complete", AllCompletePayload {}).ok();
}
```

使用 `AcqRel` ordering 确保所有文件完成的副作用（progress 清理、cancel flag 移除）在 all-complete 事件发射前对其他线程可见。

### 剪贴板 API

`navigator.clipboard.writeText()` 是 Web API，在 Tauri 2.x 的 WebView 中默认可用。它是异步的，返回 `Promise<void>`。在正常情况下执行时间远低于 200ms（NFR3）。

如后续需要切换到 `tauri-plugin-clipboard-manager`：
1. `cargo add tauri-plugin-clipboard-manager`
2. `pnpm add @tauri-apps/plugin-clipboard-manager`
3. `lib.rs` 注册 `.plugin(tauri_plugin_clipboard_manager::init())`
4. `lib/tauri.ts` 中修改：`import { writeText } from '@tauri-apps/plugin-clipboard-manager';`

### CopyButton 图标切换时序

```
用户点击 → copyToClipboard(text) → 成功
  → setCopied(true) → 图标变 Check + aria-label 变 "已复制"
  → setTimeout(1500ms) → setCopied(false) → 图标恢复 Copy + aria-label 恢复 "复制链接"
```

使用 `useRef` 保存 timer ID，在连续快速点击时清除上一个 timer 重新计时。

### 与 Story 4.1（历史持久化）的集成点

Story 4.1 需要在文件上传成功后自动保存记录到本地存储。可选的集成方式：

1. **Rust 端**：在 `upload_file()` 发射 `upload:file-complete` 的同时，调用 `storage::history::add_record()`
2. **前端端**：在 `useUploadEvents` 的 `upload:file-complete` 处理函数中，调用 `historyStore.addRecord()`

两种方式均可。Story 4.1 实现时将根据具体设计选择其一。本 Story 不预先实现历史保存逻辑。

### UploadFileItem 完成状态视觉规范

```
完成前:
┌─────────────────────────────────────────────────────┐
│ [File] test.zip                                 67% │
│        1.2 GB  上传中                               │
│ ████████████████████░░░░░░░░░░░░  (品牌蓝)         │
│   ▼ 分片详情 (2)                                    │
│     分片 1  ████████████████████ 100%  已完成        │
│     分片 2  ████████████░░░░░░░  34%  上传中         │
└─────────────────────────────────────────────────────┘

完成后:
┌─────────────────────────────────────────────────────┐
│ [File] test.zip                              [✓✓]   │
│        1.2 GB  已完成                               │
│ ████████████████████████████████  (绿色 success)    │
│   https://46.gigafile.nu/abc123...      [复制]      │
└─────────────────────────────────────────────────────┘
```

- 进度条满格 100%，颜色从品牌蓝（`bg-brand`）变为成功绿（`bg-success`）
- 百分比数字替换为 `CheckCircle2` 绿色勾号图标
- 分片详情折叠并隐藏
- 新增链接文本行 + CopyButton

---

## Definition of Done

- [ ] `upload_engine.rs` 添加 `FileCompletePayload` 结构体定义（camelCase 序列化）
- [ ] `upload_engine.rs` 添加 `AllCompletePayload` 结构体定义（camelCase 序列化）
- [ ] `upload_file()` 成功完成后发射 `upload:file-complete` 事件
- [ ] `upload:file-complete` payload 包含 taskId、fileName、downloadUrl、fileSize
- [ ] downloadUrl 为标准 gigafile.nu 格式（FR17）
- [ ] 单分片文件：downloadUrl 取 shard[0].download_url
- [ ] 多分片文件：downloadUrl 取 shard[0].download_url（首分片 URL）
- [ ] `start()` 添加 `AtomicU32` 计数器跟踪文件完成数
- [ ] 最后一个文件完成时发射 `upload:all-complete` 事件
- [ ] `upload:all-complete` 在所有文件处理完毕后发射（含失败的文件）
- [ ] `types/upload.ts` 添加 `FileCompletePayload` 和 `AllCompletePayload` 类型
- [ ] `UploadTaskProgress` 添加 `downloadUrl?: string` 可选字段
- [ ] `uploadStore` 添加 `allUploadsComplete` 状态字段
- [ ] `uploadStore` 添加 `setTaskFileComplete` action（设置 completed + downloadUrl）
- [ ] `uploadStore` 添加 `setAllComplete` action
- [ ] `startUpload` action 中重置 `allUploadsComplete` 为 false
- [ ] `lib/tauri.ts` 添加 `copyToClipboard()` 函数
- [ ] `useUploadEvents` 新增 `upload:file-complete` 事件监听
- [ ] `useUploadEvents` 新增 `upload:all-complete` 事件监听
- [ ] 所有新增事件在 unmount 时取消监听
- [ ] `CopyButton` 组件创建，使用 React.memo
- [ ] CopyButton 点击后 200ms 内完成复制（NFR3）
- [ ] CopyButton 点击后图标变为勾号 1.5 秒后恢复（FR16）
- [ ] CopyButton aria-label 动态切换："复制链接" ↔ "已复制"
- [ ] `UploadFileItem` 完成状态：进度条变绿色（bg-success）
- [ ] `UploadFileItem` 完成状态：CheckCircle2 勾号替代百分比数字
- [ ] `UploadFileItem` 完成状态：显示下载链接文本 + CopyButton
- [ ] `UploadFileItem` 完成状态：链接过长时 truncate + Tooltip 显示完整链接
- [ ] `UploadFileItem` 完成后隐藏分片详情
- [ ] `UploadFileItem` 完成后隐藏删除按钮
- [ ] 使用 Zustand 精确选择器（`s => s.activeTasks[taskId]`）
- [ ] 前端测试：setTaskFileComplete action 验证
- [ ] 前端测试：setAllComplete action 验证
- [ ] 前端测试：startUpload 重置 allUploadsComplete 验证
- [ ] 前端测试：CopyButton 点击调用 clipboard API
- [ ] 前端测试：CopyButton aria-label 切换
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误
