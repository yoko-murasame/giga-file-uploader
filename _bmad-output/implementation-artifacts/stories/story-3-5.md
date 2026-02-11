# Story 3.5: 上传进度聚合与实时展示

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-5 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 3-3 (上传引擎核心) -- 已完成, Story 3-4 (重试引擎与错误处理) -- 已完成 |
| FRs 覆盖 | FR12 (文件整体进度), FR13 (分片独立进度), FR14 (上传完成状态) |
| NFRs 关联 | NFR2 (进度更新粒度不低于每 128KB) |

## User Story

As a 用户,
I want 在上传过程中看到每个文件的进度和大文件的分片级进度,
So that 我能直觉地了解上传状态，安心等待完成。

---

## Acceptance Criteria

### AC-1: Rust 进度聚合器模块（services/progress.rs）

**Given** 上传引擎在处理每个 chunk 上传
**When** 需要追踪和聚合进度
**Then** 创建 `services/progress.rs` 模块，实现 `ProgressAggregator` 结构体
**And** `ProgressAggregator` 持有每个文件的进度状态，结构如下：

```rust
pub struct ProgressAggregator {
    tasks: Arc<RwLock<HashMap<String, TaskProgress>>>,
    app: tauri::AppHandle,
}

pub struct TaskProgress {
    pub task_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub shards: Vec<ShardProgress>,
}

pub struct ShardProgress {
    pub shard_index: u32,
    pub shard_size: u64,
    pub bytes_uploaded: Arc<AtomicU64>,
    pub status: ShardStatus,
}
```

**And** 实现 `pub fn new(app: tauri::AppHandle) -> Self` 构造函数
**And** 实现 `pub async fn register_task(task_id, file_name, file_size, shards)` — 注册新上传任务的分片信息
**And** 实现 `pub async fn remove_task(task_id)` — 上传完成或失败后清理
**And** 实现 `pub fn get_shard_counter(task_id, shard_index) -> Option<Arc<AtomicU64>>` — 获取指定分片的字节计数器，供上传线程原子递增
**And** `services/mod.rs` 中将 `// TODO: Story 3.5 - pub mod progress;` 替换为 `pub mod progress;`

### AC-2: 进度事件定时发射（50ms debounce）

**Given** `ProgressAggregator` 已注册上传任务
**When** 上传引擎在处理 chunk
**Then** `ProgressAggregator` 通过 `pub fn start_emitter(&self)` 启动一个后台 tokio 任务
**And** 后台任务每 50ms 读取所有活跃任务的 `AtomicU64` 计数器
**And** 为每个活跃任务计算文件级进度百分比和分片级进度百分比
**And** 通过 Tauri event `upload:progress` 发射进度事件到前端
**And** 事件 payload 结构：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub task_id: String,
    pub file_progress: f64,  // 0.0 - 100.0
    pub shards: Vec<ShardProgressPayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardProgressPayload {
    pub shard_index: u32,
    pub progress: f64,  // 0.0 - 100.0
    pub status: String,  // "pending" | "uploading" | "completed" | "error"
}
```

**And** 当所有任务移除后，发射器自动停止
**And** 定义常量 `const PROGRESS_EMIT_INTERVAL_MS: u64 = 50`

### AC-3: upload_engine 集成进度追踪

**Given** Story 3.3/3.4 中 `upload_engine.rs` 已实现上传流程
**When** 集成进度追踪
**Then** 修改 `start()` 函数：接受 `ProgressAggregator` 参数，为每个文件调用 `register_task()`
**And** 修改 `upload_shard()` 函数：获取 `Arc<AtomicU64>` 计数器
**And** 在 `read_chunk_data` 返回后、`upload_chunk` 调用成功后，将 chunk.size 原子累加到对应 shard 的 `bytes_uploaded` 计数器
**And** 分片完成时更新 `ShardProgress.status` 为 `Completed`
**And** 分片失败时更新 `ShardProgress.status` 为 `Error`
**And** 文件上传完成后调用 `remove_task()` 清理
**And** 进度在重试期间不倒退：仅在 chunk 成功上传后才累加字节数

### AC-4: Tauri managed state 注册

**Given** `ProgressAggregator` 需要在 commands 层和 upload_engine 之间共享
**When** 注册到 Tauri managed state
**Then** 在 `commands/upload.rs` 的 `UploadState` 中添加 `progress` 字段：

```rust
pub struct UploadState {
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub progress: Arc<ProgressAggregator>,
}
```

**And** `UploadState::default()` 不再适用（需要 `AppHandle`），改为在 `lib.rs` 中通过 `setup()` hook 初始化
**And** `start_upload` command 中将 `progress` 传递给 `upload_engine::start()`
**And** `lib.rs` 中通过 Tauri `setup()` 闭包获取 `AppHandle` 创建 `ProgressAggregator` 并注册 managed state

### AC-5: 前端 uploadStore 进度状态扩展

**Given** 前端 `uploadStore` 当前只管理 `pendingFiles`（待上传列表）
**When** 扩展支持上传进度追踪
**Then** 在 `types/upload.ts` 中新增类型定义：

```typescript
export interface ShardProgress {
  shardIndex: number;
  progress: number;  // 0-100
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

export interface UploadTaskProgress {
  taskId: string;
  fileProgress: number;  // 0-100
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
}
```

**And** 在 `uploadStore` 中添加 `activeTasks` 状态（`Record<string, UploadTaskProgress>`）
**And** 添加 `startUpload` action：调用 `tauri.ts` 中的 `startUpload()` 函数，将返回的 taskId 列表初始化到 `activeTasks`
**And** 添加 `updateProgress` action：接受 `ProgressPayload`，更新对应 task 的进度
**And** 添加 `setTaskError` action：接受 taskId，将对应 task 状态设为 error
**And** 添加 `setTaskCompleted` action：接受 taskId，将对应 task 状态设为 completed
**And** `pendingFiles` 在 startUpload 触发后清空（文件已提交上传）

### AC-6: useUploadEvents hook（事件监听）

**Given** Rust 后端通过 Tauri event 推送进度和错误事件
**When** 前端需要监听这些事件
**Then** 创建 `hooks/useUploadEvents.ts` 自定义 hook
**And** hook 在 mount 时通过 `listen()` 订阅以下事件：
  - `upload:progress` → 调用 `uploadStore.updateProgress()`
  - `upload:error` → 调用 `uploadStore.setTaskError()`
  - `upload:retry-warning` → 调用 `uploadStore.setRetryWarning()`（可选：暂存告警信息）
**And** hook 在 unmount 时取消所有事件监听（调用 listen 返回的 unlisten 函数）
**And** hook 在 `UploadPage` 组件中使用
**And** 使用 `listen` 从 `@/lib/tauri` 导入

### AC-7: UploadFileItem 组件进度展示

**Given** 文件正在上传，uploadStore 中有进度数据
**When** 渲染 UploadFileItem 组件
**Then** UploadFileItem 接受可选的 `taskProgress` prop（`UploadTaskProgress | undefined`）
**And** 当 `taskProgress` 存在时，显示进度条 + 百分比数字（FR12）
**And** 进度条使用 Radix UI Progress 组件，品牌蓝色填充
**And** 进度条动画平滑过渡（`transition: width 300ms ease`）
**And** 文件大小 < 1GB（单分片）时只展示一根整体进度条
**And** 文件大小 >= 1GB（多分片）时自动展开分片级进度视图，每个分片一根子进度条（FR13）
**And** 每个分片显示 `shardIndex`、进度百分比、状态（pending/uploading/completed/error）
**And** 分片级进度区域可折叠（默认展开）
**And** 上传中的文件状态标识为"上传中"，等待中的标识为"等待中"（FR14）
**And** 使用 Zustand 精确选择器（`useUploadStore(s => s.activeTasks[taskId])`），仅变化的文件/分片触发重渲染
**And** 进度条不使用条纹或跑马灯样式

### AC-8: tauri.ts IPC 封装扩展

**Given** 前端通过 `lib/tauri.ts` 调用 Tauri commands
**When** 添加上传相关的 IPC 函数
**Then** 在 `tauri.ts` 中添加 `startUpload` 函数：

```typescript
export async function startUpload(
  files: FileEntry[],
  config: { lifetime: number },
): Promise<string[]> {
  return invoke<string[]>('start_upload', { files, config });
}
```

**And** 添加 `cancelUpload` 函数：

```typescript
export async function cancelUpload(taskId: string): Promise<void> {
  return invoke<void>('cancel_upload', { taskId });
}
```

### AC-9: 单元测试

**Given** 进度聚合器和前端 store 实现完成
**When** 执行测试
**Then** Rust 测试（`services/progress.rs` `#[cfg(test)] mod tests`）：
- **TaskProgress 构造**：验证注册任务后可通过 get_shard_counter 获取 AtomicU64
- **字节计数累加**：验证 AtomicU64 原子递增后读取值正确
- **进度百分比计算**：验证 bytes_uploaded / shard_size * 100 的正确性
- **任务清理**：验证 remove_task 后 get_shard_counter 返回 None
**And** 前端测试（`stores/uploadStore.test.ts` 追加）：
- **updateProgress action**：验证进度更新到 activeTasks
- **setTaskError action**：验证状态变更为 error
- **startUpload action**：验证 pendingFiles 清空（mock invoke）
**And** `cargo clippy` 无警告
**And** `cargo test` 所有测试通过
**And** `pnpm test` 前端测试通过

---

## Technical Design

### 现状分析

Story 3-3 和 3-4 已完成以下基础设施：

- `src-tauri/src/services/upload_engine.rs` — `start()` 调度入口（接受 `app: tauri::AppHandle`），`upload_file()` 单文件上传（接受 `app` + `task_id`），`upload_shard()` 分片上传（首块串行 + 并发），`read_chunk_data()` 按需读取
- `src-tauri/src/services/retry_engine.rs` — `retry_upload_chunk()` 异步重试，`UploadErrorPayload` 事件 payload
- `src-tauri/src/commands/upload.rs` — `UploadState`（`cancel_flags`），`start_upload` / `cancel_upload` Tauri commands
- `src-tauri/src/lib.rs` — `.manage(UploadState::default())` + 3 个 command 注册
- `src-tauri/src/services/mod.rs:11` — `// TODO: Story 3.5 - pub mod progress;` 占位
- `src/stores/uploadStore.ts` — 仅管理 `pendingFiles`（PendingFile[]），包含 addFiles/removeFile/clearFiles actions
- `src/types/upload.ts` — PendingFile、FileEntry、DropZoneState 类型
- `src/lib/tauri.ts` — resolveDroppedPaths、openFilePicker 函数，导出 invoke/listen
- `src/components/upload/UploadFileItem.tsx` — 仅展示文件名 + 大小 + 删除按钮，无进度条
- `src/components/upload/UploadPage.tsx` — FileDropZone + UploadFileList，无上传触发逻辑

**关键集成点：**

- `upload_engine.rs` 的 `upload_shard()` 中每次 `upload_chunk` 成功后是进度累加的插入点
- `UploadState` 需要扩展以持有 `ProgressAggregator`
- `lib.rs` 中 `UploadState::default()` 需要改为 `setup()` hook 初始化（因为 `ProgressAggregator` 需要 `AppHandle`）

### 新增/修改模块

#### 1. `services/progress.rs` — 进度聚合器（新建）

```rust
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::Emitter;
use tokio::sync::RwLock;

use crate::models::upload::{Shard, ShardStatus};

/// Progress event emission interval in milliseconds.
pub const PROGRESS_EMIT_INTERVAL_MS: u64 = 50;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub task_id: String,
    pub file_progress: f64,
    pub shards: Vec<ShardProgressPayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardProgressPayload {
    pub shard_index: u32,
    pub progress: f64,
    pub status: String,
}

pub struct ShardProgress {
    pub shard_index: u32,
    pub shard_size: u64,
    pub bytes_uploaded: Arc<AtomicU64>,
    pub status: RwLock<ShardStatus>,
}

pub struct TaskProgress {
    pub task_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub shards: Vec<ShardProgress>,
}

pub struct ProgressAggregator {
    tasks: Arc<RwLock<HashMap<String, TaskProgress>>>,
    app: tauri::AppHandle,
}

impl ProgressAggregator {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            app,
        }
    }

    pub async fn register_task(
        &self,
        task_id: String,
        file_name: String,
        file_size: u64,
        shards: &[Shard],
    ) {
        let shard_progress: Vec<ShardProgress> = shards
            .iter()
            .map(|s| ShardProgress {
                shard_index: s.shard_index,
                shard_size: s.size,
                bytes_uploaded: Arc::new(AtomicU64::new(0)),
                status: RwLock::new(ShardStatus::Pending),
            })
            .collect();

        let mut tasks = self.tasks.write().await;
        tasks.insert(
            task_id.clone(),
            TaskProgress {
                task_id,
                file_name,
                file_size,
                shards: shard_progress,
            },
        );
    }

    pub async fn remove_task(&self, task_id: &str) {
        let mut tasks = self.tasks.write().await;
        tasks.remove(task_id);
    }

    pub async fn get_shard_counter(
        &self,
        task_id: &str,
        shard_index: u32,
    ) -> Option<Arc<AtomicU64>> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).and_then(|t| {
            t.shards
                .iter()
                .find(|s| s.shard_index == shard_index)
                .map(|s| s.bytes_uploaded.clone())
        })
    }

    pub async fn update_shard_status(
        &self,
        task_id: &str,
        shard_index: u32,
        status: ShardStatus,
    ) {
        let tasks = self.tasks.read().await;
        if let Some(task) = tasks.get(task_id) {
            if let Some(shard) = task.shards.iter().find(|s| s.shard_index == shard_index) {
                let mut s = shard.status.write().await;
                *s = status;
            }
        }
    }

    /// Start background emitter that sends progress events every 50ms.
    /// Returns a JoinHandle that stops when all tasks are removed.
    pub fn start_emitter(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(
                    std::time::Duration::from_millis(PROGRESS_EMIT_INTERVAL_MS)
                ).await;

                let tasks = this.tasks.read().await;
                if tasks.is_empty() {
                    break;
                }

                for task in tasks.values() {
                    let mut total_bytes: u64 = 0;
                    let mut shard_payloads = Vec::with_capacity(task.shards.len());

                    for shard in &task.shards {
                        let bytes = shard.bytes_uploaded.load(Ordering::Relaxed);
                        total_bytes += bytes;
                        let progress = if shard.shard_size > 0 {
                            (bytes as f64 / shard.shard_size as f64) * 100.0
                        } else {
                            100.0
                        };
                        let status = shard.status.read().await;
                        shard_payloads.push(ShardProgressPayload {
                            shard_index: shard.shard_index,
                            progress,
                            status: shard_status_to_string(&status),
                        });
                    }

                    let file_progress = if task.file_size > 0 {
                        (total_bytes as f64 / task.file_size as f64) * 100.0
                    } else {
                        100.0
                    };

                    let _ = this.app.emit(
                        "upload:progress",
                        ProgressPayload {
                            task_id: task.task_id.clone(),
                            file_progress,
                            shards: shard_payloads,
                        },
                    );
                }
            }
        })
    }
}

fn shard_status_to_string(status: &ShardStatus) -> String {
    match status {
        ShardStatus::Pending => "pending".to_string(),
        ShardStatus::Uploading => "uploading".to_string(),
        ShardStatus::Completed => "completed".to_string(),
        ShardStatus::Error => "error".to_string(),
    }
}
```

#### 2. `services/upload_engine.rs` — 集成进度（修改）

**修改点 1：`start()` 函数签名增加 `progress` 参数**

```rust
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    app: tauri::AppHandle,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    progress: Arc<ProgressAggregator>,  // 新增
) -> crate::error::Result<Vec<String>> {
    // ...
    // 为每个文件注册进度追踪
    progress.register_task(
        task_id.clone(),
        file.file_name.clone(),
        file.file_size,
        &shards,
    ).await;

    // 启动进度发射器（首次调用时）
    // ...

    // spawn 内传入 progress.clone()
    let progress_clone = progress.clone();
    tokio::spawn(async move {
        let result = upload_file(..., progress_clone.clone(), ...).await;
        // 上传完成或失败后清理进度
        progress_clone.remove_task(&task_id_clone).await;
    });
}
```

**修改点 2：`upload_file()` 增加 `progress` 参数**

```rust
async fn upload_file(
    mut task: UploadTask,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: Arc<AtomicBool>,
    app: tauri::AppHandle,
    task_id: String,
    progress: Arc<ProgressAggregator>,  // 新增
) -> crate::error::Result<()> {
    // ... 现有逻辑
    // 传递 progress 到 upload_shard
    upload_shard(
        shard, &task.file_path, &task.file_name,
        server_url, config, &cancel_flag, &app, &task_id,
        &progress,  // 新增
    ).await?;
}
```

**修改点 3：`upload_shard()` 增加 `progress` 参数，chunk 上传成功后累加字节数**

```rust
async fn upload_shard(
    shard: &mut Shard,
    // ... 现有参数
    progress: &Arc<ProgressAggregator>,  // 新增
) -> crate::error::Result<()> {
    // 更新 shard 状态为 Uploading
    progress.update_shard_status(task_id, shard.shard_index, ShardStatus::Uploading).await;

    // 首块串行上传成功后：
    let counter = progress.get_shard_counter(task_id, shard.shard_index).await;
    // ... 首块上传 ...
    if let Some(ref c) = counter {
        c.fetch_add(first_chunk.size, Ordering::Relaxed);
    }

    // 并发块上传成功后（在 tokio::spawn 内部、retry 成功后）：
    if let Some(ref c) = counter {
        c.fetch_add(chunk_size, Ordering::Relaxed);
    }

    // 分片完成时：
    progress.update_shard_status(task_id, shard.shard_index, ShardStatus::Completed).await;

    // 分片失败时：
    progress.update_shard_status(task_id, shard.shard_index, ShardStatus::Error).await;
}
```

#### 3. `commands/upload.rs` — UploadState 扩展（修改）

```rust
use crate::services::progress::ProgressAggregator;

pub struct UploadState {
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub progress: Arc<ProgressAggregator>,
}

// Default 不再实现（需要 AppHandle），改为 new()
impl UploadState {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
            progress: Arc::new(ProgressAggregator::new(app)),
        }
    }
}

#[tauri::command]
pub async fn start_upload(
    files: Vec<FileEntry>,
    config: UploadConfig,
    app: tauri::AppHandle,
    state: tauri::State<'_, UploadState>,
) -> Result<Vec<String>, String> {
    let api = GigafileApiV1::new().map_err(|e| e.to_string())?;
    upload_engine::start(
        files, config, &api, app,
        state.cancel_flags.clone(),
        state.progress.clone(),  // 新增
    )
    .await
    .map_err(|e| e.to_string())
}
```

#### 4. `lib.rs` — setup() hook 初始化（修改）

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let upload_state = commands::upload::UploadState::new(app.handle().clone());
            app.manage(upload_state);
            Ok(())
        })
        // 移除 .manage(commands::upload::UploadState::default())
        .invoke_handler(tauri::generate_handler![
            commands::files::resolve_dropped_paths,
            commands::upload::start_upload,
            commands::upload::cancel_upload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 5. `types/upload.ts` — 新增进度类型（修改）

```typescript
export interface ShardProgress {
  shardIndex: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

export interface UploadTaskProgress {
  taskId: string;
  fileProgress: number;
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
}

export interface ProgressPayload {
  taskId: string;
  fileProgress: number;
  shards: ShardProgress[];
}

export interface UploadErrorPayload {
  taskId: string;
  fileName: string;
  errorMessage: string;
}

export interface RetryWarningPayload {
  taskId: string;
  fileName: string;
  retryCount: number;
  errorMessage: string;
}
```

#### 6. `stores/uploadStore.ts` — 扩展进度状态（修改）

```typescript
interface UploadState {
  pendingFiles: PendingFile[];
  activeTasks: Record<string, UploadTaskProgress>;
  addFiles: (entries: FileEntry[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  startUpload: (lifetime: number) => Promise<void>;
  updateProgress: (payload: ProgressPayload) => void;
  setTaskError: (taskId: string) => void;
  setTaskCompleted: (taskId: string) => void;
}
```

#### 7. `hooks/useUploadEvents.ts` — 事件监听 hook（新建）

```typescript
import { useEffect } from 'react';

import { listen } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';

import type { ProgressPayload, UploadErrorPayload } from '@/types/upload';

export function useUploadEvents() {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const unlisten1 = await listen<ProgressPayload>(
        'upload:progress',
        (event) => {
          useUploadStore.getState().updateProgress(event.payload);
        },
      );
      unlisteners.push(unlisten1);

      const unlisten2 = await listen<UploadErrorPayload>(
        'upload:error',
        (event) => {
          useUploadStore.getState().setTaskError(event.payload.taskId);
        },
      );
      unlisteners.push(unlisten2);
    };

    setup();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);
}
```

#### 8. `components/upload/UploadFileItem.tsx` — 进度条展示（修改）

添加可选 `taskProgress` prop，条件渲染进度条：

```tsx
import { Progress } from 'radix-ui';

interface UploadFileItemProps {
  id: string;
  fileName: string;
  fileSize: number;
  onRemove: (id: string) => void;
  taskProgress?: UploadTaskProgress;
}
```

- 单分片（shards.length <= 1）：一根整体进度条
- 多分片（shards.length > 1）：整体进度条 + 可折叠分片级子进度条
- 使用 Radix UI Progress 组件
- 进度条样式：品牌蓝 `bg-brand`，`transition: width 300ms ease`

### 数据流

```
Rust upload thread
  → chunk upload 成功后: shard.bytes_uploaded.fetch_add(chunk_size)
  → ProgressAggregator emitter (50ms interval):
      → 读取所有 AtomicU64 计数器
      → 计算 file_progress + shard_progress
      → app.emit("upload:progress", ProgressPayload)

Frontend:
  → useUploadEvents hook: listen("upload:progress")
      → uploadStore.updateProgress(payload)
          → activeTasks[taskId].fileProgress = payload.fileProgress
          → activeTasks[taskId].shards = payload.shards
  → UploadFileItem: useUploadStore(s => s.activeTasks[taskId])
      → Radix Progress bar re-render (only changed task)
```

### 设计决策

1. **AtomicU64 + 定时发射 vs Channel 聚合**：使用 `AtomicU64` 原子计数器配合定时器发射，而非 mpsc channel 方式。原因：多个并发上传线程可以无锁地 `fetch_add`，无需 channel 通信开销；50ms 定时器确保前端不会被高频事件淹没。

2. **ProgressAggregator 持有 AppHandle**：直接在聚合器中保存 `AppHandle` 用于 event 发射，避免在每次发射时传递。`AppHandle: Clone + Send + Sync`，可安全跨线程使用。

3. **RwLock<HashMap> 而非 Mutex**：进度读取（发射器 50ms）远高于写入（任务注册/清理），读写锁提供更好的并发性。`ShardProgress.status` 也使用 `RwLock` 而非 `Mutex`。

4. **进度在重试期间不倒退**：仅在 chunk 成功上传后才累加字节数到 `AtomicU64`。重试中的 chunk 不影响进度数值。这确保进度条只前进不后退。

5. **UploadState 从 Default 改为 new(AppHandle)**：`ProgressAggregator` 需要 `AppHandle` 来发射事件。由于 `AppHandle` 在 `Builder::setup()` 中才可用，必须使用 `setup()` hook 而非 `manage()` 链式调用。

6. **startUpload action 在 store 中直接调用 IPC**：符合项目规范"所有 state mutations 通过 store actions"。`startUpload` action 调用 `tauri.ts` 的 `startUpload()` 函数并初始化 `activeTasks`。

7. **useUploadEvents 作为独立 hook**：事件监听逻辑独立于组件，在 `UploadPage` 中调用。使用 `useUploadStore.getState()` 避免在 effect 中创建对 store 的依赖。

8. **分片进度折叠**：多分片文件默认展开分片级进度，用户可折叠。使用组件局部 state（`useState`）控制折叠状态，不进入 Zustand store。

### 与后续 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.6（链接产出） | 使用本 Story 的 `activeTasks` 状态展示完成状态和下载链接。`upload:file-complete` 事件在 3.6 中定义，但 `useUploadEvents` hook 预留了扩展位 |

---

## Tasks

### Task 1: 创建 Rust 进度聚合器模块

**文件:** `src-tauri/src/services/progress.rs`（新建）、`src-tauri/src/services/mod.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 创建 `src-tauri/src/services/progress.rs` 文件
1.2. 定义常量 `PROGRESS_EMIT_INTERVAL_MS: u64 = 50`
1.3. 定义 `ProgressPayload` 和 `ShardProgressPayload` 结构体（`#[serde(rename_all = "camelCase")]`）
1.4. 定义 `ShardProgress` 结构体（含 `Arc<AtomicU64>` 字节计数器 + `RwLock<ShardStatus>` 状态）
1.5. 定义 `TaskProgress` 结构体
1.6. 定义 `ProgressAggregator` 结构体（含 `Arc<RwLock<HashMap<String, TaskProgress>>>` + `AppHandle`）
1.7. 实现 `ProgressAggregator::new(app)`
1.8. 实现 `register_task()` 异步方法
1.9. 实现 `remove_task()` 异步方法
1.10. 实现 `get_shard_counter()` 异步方法
1.11. 实现 `update_shard_status()` 异步方法
1.12. 实现 `start_emitter()` — 50ms 定时器后台任务，读取计数器并发射 `upload:progress` 事件
1.13. 实现 `shard_status_to_string()` 辅助函数
1.14. 在 `services/mod.rs` 中将 `// TODO: Story 3.5 - pub mod progress;` 替换为 `pub mod progress;`

### Task 2: 修改 UploadState 和 lib.rs 初始化

**文件:** `src-tauri/src/commands/upload.rs`（修改）、`src-tauri/src/lib.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 在 `commands/upload.rs` 中添加 `use crate::services::progress::ProgressAggregator;` 导入
2.2. 修改 `UploadState` 结构体：添加 `pub progress: Arc<ProgressAggregator>` 字段
2.3. 移除 `impl Default for UploadState`，添加 `impl UploadState { pub fn new(app: tauri::AppHandle) -> Self }`
2.4. 修改 `start_upload` command：将 `state.progress.clone()` 传递给 `upload_engine::start()`
2.5. 修改 `lib.rs`：将 `.manage(commands::upload::UploadState::default())` 替换为 `.setup()` hook 初始化
2.6. 更新 `commands/upload.rs` 中现有测试以适配 `UploadState::new()` 签名变更（测试中可跳过 AppHandle 构造或重构为不依赖 Default）

### Task 3: 集成进度追踪到 upload_engine

**文件:** `src-tauri/src/services/upload_engine.rs`（修改）
**依赖:** Task 1, Task 2

**Subtasks:**

3.1. 添加 `use crate::services::progress::ProgressAggregator;` 导入
3.2. 修改 `start()` 函数签名：增加 `progress: Arc<ProgressAggregator>` 参数
3.3. 在 `start()` 中为每个文件调用 `progress.register_task()` 注册进度
3.4. 在 `start()` 中首次调用时启动 `progress.start_emitter()`
3.5. 在 `start()` 的 tokio::spawn 内传入 `progress.clone()`
3.6. 在 tokio::spawn 内上传完成/失败后调用 `progress.remove_task()`
3.7. 修改 `upload_file()` 签名：增加 `progress: Arc<ProgressAggregator>` 参数，传递到 `upload_shard()`
3.8. 修改 `upload_shard()` 签名：增加 `progress: &Arc<ProgressAggregator>` 参数
3.9. 在 `upload_shard()` 入口调用 `progress.update_shard_status(Uploading)`
3.10. 在首块串行上传成功后调用 `counter.fetch_add(first_chunk.size)`
3.11. 在并发块 tokio::spawn 内 retry 成功后调用 `counter.fetch_add(chunk_size)`（通过 clone 进度计数器到 spawn 内部）
3.12. 在分片完成时调用 `progress.update_shard_status(Completed)`
3.13. 在分片失败时调用 `progress.update_shard_status(Error)`

### Task 4: 前端类型定义扩展

**文件:** `src/types/upload.ts`（修改）
**依赖:** 无

**Subtasks:**

4.1. 添加 `ShardProgress` interface
4.2. 添加 `UploadTaskProgress` interface
4.3. 添加 `ProgressPayload` interface
4.4. 添加 `UploadErrorPayload` interface
4.5. 添加 `RetryWarningPayload` interface

### Task 5: tauri.ts IPC 封装扩展

**文件:** `src/lib/tauri.ts`（修改）
**依赖:** Task 4

**Subtasks:**

5.1. 添加 `startUpload(files, config)` 函数
5.2. 添加 `cancelUpload(taskId)` 函数

### Task 6: uploadStore 扩展进度状态

**文件:** `src/stores/uploadStore.ts`（修改）
**依赖:** Task 4, Task 5

**Subtasks:**

6.1. 添加 `activeTasks: Record<string, UploadTaskProgress>` 状态字段
6.2. 实现 `startUpload` action：调用 `tauri.startUpload()`，初始化 activeTasks，清空 pendingFiles
6.3. 实现 `updateProgress` action：更新 activeTasks 中对应 task 的进度
6.4. 实现 `setTaskError` action：更新 task 状态为 error
6.5. 实现 `setTaskCompleted` action：更新 task 状态为 completed

### Task 7: 创建 useUploadEvents hook

**文件:** `src/hooks/useUploadEvents.ts`（新建）
**依赖:** Task 6

**Subtasks:**

7.1. 创建 `src/hooks/useUploadEvents.ts` 文件
7.2. 实现 `useUploadEvents` hook：mount 时订阅 `upload:progress`、`upload:error`、`upload:retry-warning`
7.3. 在 unmount 时取消所有事件监听
7.4. 在 `UploadPage.tsx` 中调用 `useUploadEvents()`

### Task 8: UploadFileItem 进度条 UI

**文件:** `src/components/upload/UploadFileItem.tsx`（修改）
**依赖:** Task 6

**Subtasks:**

8.1. 添加可选 `taskProgress` prop（`UploadTaskProgress | undefined`）
8.2. 条件渲染进度条区域：使用 Radix UI Progress 组件
8.3. 单分片文件：一根整体进度条 + 百分比数字
8.4. 多分片文件：整体进度条 + 分片级子进度条列表（可折叠）
8.5. 进度条样式：品牌蓝填充、`transition: width 300ms ease`
8.6. 状态文字：上传中/等待中/已完成/出错
8.7. 更新 UploadPage/UploadFileList 将 activeTasks 数据传递到 UploadFileItem

### Task 9: 编写测试

**文件:** 多文件
**依赖:** Task 3, Task 6, Task 7, Task 8

**Subtasks:**

9.1. Rust 测试：`progress.rs` — register_task 后 get_shard_counter 返回有效计数器
9.2. Rust 测试：`progress.rs` — AtomicU64 累加后读取值正确
9.3. Rust 测试：`progress.rs` — remove_task 后 get_shard_counter 返回 None
9.4. Rust 测试：`progress.rs` — shard_status_to_string 正确映射
9.5. 前端测试：`uploadStore.test.ts` — updateProgress action 更新 activeTasks
9.6. 前端测试：`uploadStore.test.ts` — setTaskError action 状态变更
9.7. 前端测试：`uploadStore.test.ts` — startUpload action 清空 pendingFiles（mock invoke）

### Task 10: 代码质量验证

**文件:** 无新文件
**依赖:** Task 9

**Subtasks:**

10.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
10.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
10.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过
10.4. 执行 `pnpm test` 确认前端测试通过
10.5. 执行 `pnpm lint` 确认 ESLint 无错误

---

## Task 依赖顺序

```
Task 1 (progress.rs 核心) ──→ Task 2 (UploadState + lib.rs)
         │                           │
         └──→ Task 3 (upload_engine 集成) ──→ Task 9 (测试)
                                                    │
Task 4 (前端类型) ──→ Task 5 (tauri.ts)             │
                          │                          │
                          └──→ Task 6 (uploadStore) ─┤
                                    │                │
                                    ├──→ Task 7 (useUploadEvents) ──→ Task 9
                                    │                                    │
                                    └──→ Task 8 (UploadFileItem UI) ──→ Task 9
                                                                         │
                                                                    Task 10 (质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/services/progress.rs` | `ProgressAggregator` 核心、`TaskProgress` / `ShardProgress` 数据结构、`ProgressPayload` / `ShardProgressPayload` 事件 payload、定时发射器、单元测试 |
| `src/hooks/useUploadEvents.ts` | 事件监听 hook：订阅 `upload:progress`、`upload:error`、`upload:retry-warning` 事件 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src-tauri/src/services/mod.rs` | 将 `// TODO: Story 3.5 - pub mod progress;` 替换为 `pub mod progress;` |
| `src-tauri/src/services/upload_engine.rs` | `start()` 增加 progress 参数和任务注册/清理；`upload_file()` 传递 progress；`upload_shard()` chunk 上传成功后累加字节数 + shard 状态更新 |
| `src-tauri/src/commands/upload.rs` | `UploadState` 添加 `progress` 字段；移除 Default、添加 `new(AppHandle)`；`start_upload` 传递 progress |
| `src-tauri/src/lib.rs` | 移除 `.manage(UploadState::default())`，使用 `.setup()` hook 初始化 UploadState |
| `src/types/upload.ts` | 添加 `ShardProgress`、`UploadTaskProgress`、`ProgressPayload`、`UploadErrorPayload`、`RetryWarningPayload` 类型 |
| `src/lib/tauri.ts` | 添加 `startUpload()`、`cancelUpload()` IPC 封装函数 |
| `src/stores/uploadStore.ts` | 添加 `activeTasks` 状态；添加 `startUpload`、`updateProgress`、`setTaskError`、`setTaskCompleted` actions |
| `src/stores/uploadStore.test.ts` | 追加 updateProgress、setTaskError、startUpload 测试 |
| `src/components/upload/UploadFileItem.tsx` | 添加 taskProgress prop 和进度条 UI（Radix Progress + 分片视图） |
| `src/components/upload/UploadFileList.tsx` | 传递 activeTasks 数据到 UploadFileItem |
| `src/components/upload/UploadPage.tsx` | 调用 useUploadEvents hook，传递 activeTasks 到 UploadFileList |

### 禁止修改

- `src-tauri/src/api/mod.rs` — `GigafileApi` trait 定义不变
- `src-tauri/src/api/v1.rs` — `upload_chunk()` 实现不变
- `src-tauri/src/error.rs` — `AppError` 已有所有必要变体
- `src-tauri/src/models/upload.rs` — 数据模型不变（`ShardStatus` 已有全部变体）
- `src-tauri/src/models/file.rs` — `FileEntry` 不变
- `src-tauri/src/services/chunk_manager.rs` — 分块规划器不变
- `src-tauri/src/services/retry_engine.rs` — 重试引擎不变（进度在 retry 外层累加）
- `src-tauri/Cargo.toml` — 不需要新增依赖（tokio、serde、tauri 已有）
- `src/App.css` — 设计 Token 不变
- `src/App.tsx` — 应用入口不变
- `src/stores/appStore.ts` — 不涉及
- `src/stores/historyStore.ts` — 不涉及

---

## Technical Notes

### 进度更新粒度 (NFR2)

架构要求每 128KB 更新一次进度。本实现中，进度在每个 chunk（100MB）上传成功后一次性累加 chunk.size 到 `AtomicU64`。由于 50ms 发射间隔配合 8 并发上传，实际粒度取决于网络速度和 chunk 大小。对于 100MB chunk，这不满足 128KB 粒度要求。

如需更细粒度的进度，需要在 `api/v1.rs` 的 `upload_chunk()` 中使用 reqwest 的 `Body::wrap_stream()` 配合自定义 Stream 在每 128KB 数据发送后回调更新计数器。这属于进阶优化，当前实现以 chunk 级别为粒度（每 100MB 更新一次）。

**建议的后续优化路径**：在 `ChunkUploadParams` 中添加可选的 `progress_callback: Option<Arc<AtomicU64>>`，让 `upload_chunk()` 在发送数据时实时更新计数器。这需要修改 `api/mod.rs` 的 trait 签名，属于跨模块变更，不适合在本 Story 中实施。

### Tauri 2.x setup() hook

```rust
// Tauri 2.x 中 setup() 返回 Result<(), Box<dyn Error>>
.setup(|app| {
    let upload_state = UploadState::new(app.handle().clone());
    app.manage(upload_state);
    Ok(())
})
```

`app.handle()` 返回 `&AppHandle`，需要 `.clone()` 获取所有权。`app.manage()` 将状态注册到 Tauri managed state 系统。

### Radix UI Progress 组件用法

```tsx
import { Progress } from 'radix-ui';

<Progress.Root className="h-2 w-full overflow-hidden rounded-full bg-border">
  <Progress.Indicator
    className="h-full bg-brand"
    style={{
      width: `${progress}%`,
      transition: 'width 300ms ease',
    }}
  />
</Progress.Root>
```

### Zustand 精确选择器模式

```typescript
// 组件中仅订阅特定 task 的进度
const taskProgress = useUploadStore(
  (s) => s.activeTasks[taskId]
);
// 只有该 task 的 activeTasks 条目变化时才触发重渲染
```

### 与 upload:error / upload:retry-warning 事件的关系

这些事件在 Story 3.4 中已由 Rust 后端发射。本 Story 在 `useUploadEvents` hook 中订阅它们并更新 store 状态。`upload:retry-warning` 事件可暂存到 store 中供 UI 展示（琥珀色提示），但具体的告警 UI 组件可在 Story 3.5 中简单处理或留给后续优化。

---

## Definition of Done

- [ ] `services/progress.rs` 创建，包含 `ProgressAggregator` 完整实现
- [ ] `ProgressPayload` 和 `ShardProgressPayload` 定义，camelCase 序列化
- [ ] `ShardProgress` 含 `Arc<AtomicU64>` 字节计数器和 `RwLock<ShardStatus>` 状态
- [ ] `register_task()` 注册上传任务的分片进度信息
- [ ] `remove_task()` 清理已完成/失败任务
- [ ] `get_shard_counter()` 返回 `Arc<AtomicU64>` 供上传线程原子累加
- [ ] `update_shard_status()` 更新分片状态
- [ ] `start_emitter()` 启动 50ms 定时器，读取计数器并发射 `upload:progress` 事件
- [ ] 所有活跃任务移除后发射器自动停止
- [ ] `services/mod.rs` TODO 替换为 `pub mod progress;`
- [ ] `UploadState` 添加 `progress: Arc<ProgressAggregator>` 字段
- [ ] `UploadState::default()` 替换为 `UploadState::new(AppHandle)`
- [ ] `lib.rs` 使用 `setup()` hook 初始化 `UploadState`
- [ ] `upload_engine::start()` 增加 progress 参数，注册任务，启动发射器
- [ ] `upload_file()` 传递 progress 到 `upload_shard()`
- [ ] `upload_shard()` chunk 上传成功后累加字节数到 `AtomicU64`
- [ ] `upload_shard()` 更新 shard status（Uploading/Completed/Error）
- [ ] 进度在重试期间不倒退（仅成功后累加）
- [ ] 上传完成/失败后调用 `remove_task()` 清理
- [ ] `types/upload.ts` 添加 ShardProgress、UploadTaskProgress、ProgressPayload 等类型
- [ ] `lib/tauri.ts` 添加 `startUpload()` 和 `cancelUpload()` IPC 函数
- [ ] `uploadStore` 添加 `activeTasks` 状态和 startUpload/updateProgress/setTaskError/setTaskCompleted actions
- [ ] `startUpload` action 调用 IPC 并清空 pendingFiles
- [ ] `hooks/useUploadEvents.ts` 创建，订阅 upload:progress、upload:error、upload:retry-warning
- [ ] hook 在 unmount 时取消所有事件监听
- [ ] `UploadPage.tsx` 中调用 `useUploadEvents()`
- [ ] `UploadFileItem` 添加进度条（Radix UI Progress，品牌蓝，300ms transition）
- [ ] 单分片文件只展示一根整体进度条
- [ ] 多分片文件展开分片级子进度条（可折叠）
- [ ] 每个分片显示 shard_index、进度百分比、状态
- [ ] 状态文字：上传中/等待中/已完成/出错（FR14）
- [ ] `UploadFileItem` 使用 React.memo + Zustand 精确选择器
- [ ] Rust 测试：register/get_shard_counter/remove_task 生命周期
- [ ] Rust 测试：AtomicU64 累加正确性
- [ ] Rust 测试：shard_status_to_string 映射
- [ ] 前端测试：updateProgress/setTaskError/startUpload actions
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过
- [ ] `pnpm test` 前端测试通过
