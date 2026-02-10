# Story 3.3: 上传引擎核心 - 首块串行与并发上传

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-3 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 3-1 (API 抽象层与服务器发现) -- 已完成, Story 3-2 (文件分块管理器) -- 已完成 |
| FRs 覆盖 | FR7 (分片分块并发上传), FR11 (首块串行协议) |
| NFRs 关联 | NFR12 (单文件失败不影响其他上传) |

## User Story

As a 用户,
I want 点击上传后文件能可靠地上传到 gigafile.nu,
So that 我的文件可以被发送到服务器并最终获得下载链接。

---

## Acceptance Criteria

### AC-1: upload_chunk 实现（api/v1.rs）

**Given** `api/v1.rs` 中 `upload_chunk()` 当前为 stub（返回 `AppError::Internal("not yet implemented")`）
**When** 替换 stub 为完整的 HTTP multipart/form-data 上传实现
**Then** 构造 `POST https://{server_url}/upload_chunk.php` 请求
**And** 使用 `reqwest::multipart::Form` 构建表单数据，包含以下字段：

| 字段名 | 值来源 | 说明 |
|--------|--------|------|
| `id` | `params.upload_id` | 上传会话 UUID hex（32 字符） |
| `name` | `params.file_name` | 原始文件名 |
| `chunk` | `params.chunk_index.to_string()` | 当前块编号（0-based） |
| `chunks` | `params.total_chunks.to_string()` | 总块数 |
| `lifetime` | `params.lifetime.to_string()` | 保留天数 |
| `file` | `params.data` | 二进制数据，Part 名 `"file"`，file_name `"blob"`，MIME `application/octet-stream` |

**And** 使用 `params.cookie_jar` 创建带 Cookie 支持的临时 reqwest::Client 发起请求
**And** 解析响应 JSON：中间块返回 `{"status": 0}`，最后一块返回 `{"status": 0, "url": "..."}`
**And** 映射为 `ChunkUploadResponse { status, download_url }`
**And** 非 0 status 返回 `AppError::Api` 错误
**And** 错误通过 `AppError` 类型传播

### AC-2: 上传引擎调度入口

**Given** `services/mod.rs` 中有 `// TODO: Story 3.3 - pub mod upload_engine;` 占位
**When** 创建 `services/upload_engine.rs` 模块
**Then** 实现 `pub async fn start()` 函数作为上传调度入口
**And** 函数签名：

```rust
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    app: AppHandle,
    cancel_flags: Arc<DashMap<String, Arc<AtomicBool>>>,  // 简化：使用 HashMap
) -> crate::error::Result<Vec<String>>
```

注：实际实现使用 `Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>` 而非 DashMap，以避免新增依赖。

**And** 对每个文件执行：
  1. 生成 `task_id`（UUID v4 hex）
  2. 调用 `plan_chunks(file_size)` 获取 `Vec<Shard>`
  3. 为每个 shard 生成 `upload_id`（UUID v4 hex，32 字符）
  4. 构造 `UploadTask` 实例
**And** 调用 `api.discover_server()` 获取上传服务器 URL（FR10）
**And** 为每个文件 spawn 独立的 tokio 任务，每个任务独立执行上传流程
**And** 立即返回所有 `task_id` 列表（非阻塞）
**And** `services/mod.rs` 中将 TODO 注释替换为 `pub mod upload_engine;`

### AC-3: 首块串行建立 Cookie 会话

**Given** 一个文件的逻辑分片准备上传
**When** 开始上传该分片
**Then** 为该分片创建独立的 `Arc<reqwest::cookie::Jar>`（Cookie jar）
**And** 第一个上传块（chunk_index == 0）串行发送到服务器（FR11）
**And** 首块通过 `api.upload_chunk()` 发送，Cookie jar 随请求传递
**And** 首块响应中的 Cookie 被 jar 自动捕获并保存
**And** 首块成功后才启动后续块的并行上传
**And** 首块失败直接返回错误，不进行后续块上传

### AC-4: 并发上传与保序完成

**Given** 分片的首块已成功上传
**When** 上传该分片的剩余块（chunk_index 1 ~ N-1）
**Then** 使用 `tokio::sync::Semaphore` 控制并发，默认 8 个 permit（FR7）
**And** 所有并发块共享该分片的同一 Cookie jar
**And** 使用 `AtomicU32` 计数器实现保序完成机制：
  - 每个块上传完数据后，等待计数器值等于自己的 `chunk_index`
  - 匹配后处理响应，然后递增计数器
  - 确保块按顺序"完成"（发送可并行，完成必须有序）
**And** 最后一个块（chunk_index == total_chunks - 1）的响应包含 `download_url`
**And** 将 `download_url` 写入 `Shard.download_url` 字段
**And** 定义常量 `DEFAULT_CONCURRENT_CHUNKS: usize = 8`

### AC-5: 独立文件错误隔离

**Given** 多个文件同时上传
**When** 某个文件上传过程中发生错误
**Then** 该文件的 `UploadTask.status` 设置为 `Error`（NFR12）
**And** 其他文件的上传任务不受影响，继续正常执行
**And** 错误信息通过 `log::error!()` 记录，使用英文技术详情

### AC-6: Tauri commands 定义

**Given** `commands/mod.rs` 中有 `// TODO: Story 3.3 - pub mod upload;` 占位
**When** 创建 `commands/upload.rs` 模块
**Then** 定义 `start_upload` command：

```rust
#[tauri::command]
pub async fn start_upload(
    files: Vec<FileEntry>,
    config: UploadConfig,
    app: AppHandle,
    state: State<'_, UploadState>,
) -> Result<Vec<String>, String>
```

**And** `start_upload` 内部：
  1. 创建 `GigafileApiV1::new()`
  2. 调用 `upload_engine::start()` 传入 files、config、api、app、cancel_flags
  3. 返回 task_id 列表
  4. 错误通过 `.map_err(|e| e.to_string())` 转换

**And** 定义 `cancel_upload` command：

```rust
#[tauri::command]
pub async fn cancel_upload(
    task_id: String,
    state: State<'_, UploadState>,
) -> Result<(), String>
```

**And** `cancel_upload` 内部：
  1. 在 `UploadState.cancel_flags` 中查找 task_id 对应的 `AtomicBool`
  2. 将其设置为 `true`
  3. task_id 不存在时返回错误

**And** 定义 `UploadState` 结构体用于 Tauri managed state：

```rust
pub struct UploadState {
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}
```

**And** `commands/mod.rs` 中将 TODO 注释替换为 `pub mod upload;`
**And** `lib.rs` 中注册 `start_upload` 和 `cancel_upload` 到 `invoke_handler`
**And** `lib.rs` 中将 `UploadState` 注册为 Tauri managed state（`.manage()`）

### AC-7: 取消上传支持

**Given** 用户发起了上传任务
**When** 用户调用 `cancel_upload` command
**Then** 对应 task_id 的 cancel flag 设置为 true
**And** upload_engine 的上传循环在每个 chunk 上传前检查 cancel flag
**And** 检测到取消时立即停止该文件的后续上传
**And** 已发送的 chunk 不可撤回（服务端无删除 API）
**And** 该文件的 `UploadTask.status` 设置为 `Error`

### AC-8: 文件 I/O — 按需读取 chunk 数据

**Given** upload_engine 准备上传某个 chunk
**When** 需要读取文件数据
**Then** 使用 `tokio::task::spawn_blocking` + `std::fs::File` 读取
**And** 通过 `File::seek(SeekFrom::Start(chunk.offset))` 定位到 chunk 起始位置
**And** 读取恰好 `chunk.size` 字节数据到 `Vec<u8>`
**And** 不一次性读取整个文件到内存
**And** 读取失败通过 `AppError::Io` 传播

### AC-9: 单元测试

**Given** upload_engine 和 commands/upload 实现完成
**When** 执行 `cargo test`
**Then** 包含以下测试覆盖：
- **UploadState 构造**：验证 cancel_flags HashMap 初始化为空
- **cancel flag 设置**：验证设置 cancel flag 后读取为 true
- **upload_id 生成**：验证生成的 UUID hex 为 32 个十六进制字符
- **chunk 数据读取**：验证 `read_chunk_data()` 从文件指定 offset 读取指定 size 的数据
- **chunk 数据读取边界**：验证读取文件末尾不足 chunk_size 时返回实际可用字节
- **v1.rs upload_chunk response 解析**：验证中间块响应（无 url）和最后块响应（有 url）正确映射为 `ChunkUploadResponse`
**And** 所有测试不依赖网络（使用文件系统测试 I/O，使用 mock 测试响应解析）
**And** `cargo clippy` 无警告

---

## Technical Design

### 现状分析

Story 3-1 和 3-2 已完成以下基础设施：

- `src-tauri/src/api/mod.rs` — `GigafileApi` trait（`discover_server()`, `upload_chunk()`, `verify_upload()`），`ChunkUploadParams`（8 字段），`ChunkUploadResponse`
- `src-tauri/src/api/v1.rs` — `GigafileApiV1` 结构体，`discover_server()` 已实现，`upload_chunk()` 和 `verify_upload()` 为 stub
- `src-tauri/src/services/chunk_manager.rs` — `plan_chunks(file_size)` 纯计算函数，`SHARD_SIZE`/`CHUNK_SIZE` 常量
- `src-tauri/src/models/upload.rs` — `UploadTask`, `Shard`, `Chunk`, `UploadConfig`, 三个状态枚举
- `src-tauri/src/models/file.rs` — `FileEntry`（`file_name`, `file_path`, `file_size`）
- `src-tauri/src/error.rs` — `AppError`（Network/Api/Storage/Io/Internal），`Result<T>` 别名
- `src-tauri/src/commands/mod.rs` — 包含 TODO 占位 `// TODO: Story 3.3 - pub mod upload;`
- `src-tauri/src/services/mod.rs` — 包含 TODO 占位 `// TODO: Story 3.3 - pub mod upload_engine;`
- `src-tauri/src/lib.rs` — Tauri app builder，当前仅注册 `resolve_dropped_paths` command
- `src-tauri/Cargo.toml` — reqwest 启用 `json` 和 `cookies` feature，需添加 `multipart` feature 和 `uuid` 依赖

### 新增依赖

| 依赖 | 版本 | 用途 | 位置 |
|------|------|------|------|
| `uuid` | `1` (features = `["v4"]`) | 生成 upload_id 和 task_id | Cargo.toml [dependencies] |
| `log` | `0.4` | 结构化日志输出 | Cargo.toml [dependencies] |
| reqwest `multipart` feature | — | multipart/form-data 上传 | Cargo.toml reqwest features 追加 |

### 新增/修改模块

#### 1. `api/v1.rs` — upload_chunk 实现

替换 `upload_chunk()` stub，实现完整的 multipart/form-data POST：

```rust
async fn upload_chunk(
    &self,
    params: ChunkUploadParams,
) -> crate::error::Result<ChunkUploadResponse> {
    // 1. 使用 params.cookie_jar 创建带 Cookie 的临时 Client
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .cookie_provider(params.cookie_jar.clone())
        .timeout(std::time::Duration::from_secs(300)) // 5 min for large chunks
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build upload client: {}", e)))?;

    // 2. 构建 multipart form
    let form = reqwest::multipart::Form::new()
        .text("id", params.upload_id)
        .text("name", params.file_name)
        .text("chunk", params.chunk_index.to_string())
        .text("chunks", params.total_chunks.to_string())
        .text("lifetime", params.lifetime.to_string())
        .part(
            "file",
            reqwest::multipart::Part::bytes(params.data)
                .file_name("blob")
                .mime_str("application/octet-stream")
                .map_err(|e| AppError::Internal(format!("MIME parse error: {}", e)))?,
        );

    // 3. POST 到 upload_chunk.php
    let url = format!("{}/upload_chunk.php", params.server_url);
    let resp = client
        .post(&url)
        .multipart(form)
        .send()
        .await?
        .error_for_status()?;

    // 4. 解析响应 JSON
    let body: serde_json::Value = resp.json().await?;
    let status = body["status"].as_i64().unwrap_or(-1) as i32;
    let download_url = body["url"].as_str().map(|s| s.to_string());

    if status != 0 {
        return Err(AppError::Api(format!(
            "upload_chunk failed: status={}, response={}",
            status, body
        )));
    }

    Ok(ChunkUploadResponse {
        status,
        download_url,
    })
}
```

**设计决策：临时 Client per call**

`upload_chunk` 为每次调用创建一个带 `cookie_jar` 的临时 `reqwest::Client`。虽然 `GigafileApiV1` 有自己的 `client` 字段（用于 `discover_server`），但该 client 没有绑定 cookie provider。每个 shard 需要独立的 Cookie 会话，通过 `ChunkUploadParams.cookie_jar` 传入。临时 Client 的创建开销相对 100MB chunk 上传时间可忽略。

#### 2. `services/upload_engine.rs` — 上传调度核心

```rust
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

use crate::api::v1::GigafileApiV1;
use crate::api::{ChunkUploadParams, GigafileApi};
use crate::error::AppError;
use crate::models::file::FileEntry;
use crate::models::upload::*;
use crate::services::chunk_manager;

/// 默认并发上传块数
pub const DEFAULT_CONCURRENT_CHUNKS: usize = 8;

/// 上传调度入口。为每个文件 spawn 独立任务，立即返回 task_id 列表。
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    app: tauri::AppHandle,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
) -> crate::error::Result<Vec<String>> {
    // 1. 发现服务器
    let server_url = api.discover_server().await?;

    // 2. 为每个文件创建 UploadTask
    let mut task_ids = Vec::with_capacity(files.len());
    for file in files {
        let task_id = uuid::Uuid::new_v4().simple().to_string(); // 32 hex chars
        let shards = chunk_manager::plan_chunks(file.file_size);

        // 为每个 shard 生成 upload_id
        let shards: Vec<Shard> = shards.into_iter().map(|mut s| {
            s.upload_id = uuid::Uuid::new_v4().simple().to_string();
            s
        }).collect();

        let task = UploadTask {
            task_id: task_id.clone(),
            file_name: file.file_name.clone(),
            file_path: file.file_path.clone(),
            file_size: file.file_size,
            shards,
            status: UploadStatus::Pending,
            download_url: None,
        };

        // 注册 cancel flag
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = cancel_flags.lock().await;
            flags.insert(task_id.clone(), cancel_flag.clone());
        }

        // Spawn 独立上传任务
        let server_url = server_url.clone();
        let config = config.clone();
        let cancel_flags_clone = cancel_flags.clone();
        tokio::spawn(async move {
            let result = upload_file(task, &server_url, &config, cancel_flag).await;
            if let Err(e) = &result {
                log::error!("Upload failed for file '{}': {}", file.file_name, e);
            }
            // 清理 cancel flag
            let mut flags = cancel_flags_clone.lock().await;
            flags.remove(&task_id);
        });

        task_ids.push(task_id);
    }

    Ok(task_ids)
}
```

#### 3. `services/upload_engine.rs` — 单文件上传流程

```rust
/// 上传单个文件的所有分片。
async fn upload_file(
    mut task: UploadTask,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: Arc<AtomicBool>,
) -> crate::error::Result<()> {
    task.status = UploadStatus::Uploading;

    for shard in &mut task.shards {
        if cancel_flag.load(Ordering::Relaxed) {
            task.status = UploadStatus::Error;
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }
        upload_shard(shard, &task.file_path, &task.file_name, server_url, config, &cancel_flag).await?;
    }

    // 收集 shard download URLs
    // 单分片文件：直接使用 shard URL
    // 多分片文件：每个 shard 有独立 URL（gigafile.nu 特性）
    if task.shards.len() == 1 {
        task.download_url = task.shards[0].download_url.clone();
    }
    task.status = UploadStatus::Completed;

    Ok(())
}
```

#### 4. `services/upload_engine.rs` — 分片上传（首块串行 + 并发）

```rust
/// 上传单个分片：首块串行 + 后续块并发。
async fn upload_shard(
    shard: &mut Shard,
    file_path: &str,
    file_name: &str,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: &Arc<AtomicBool>,
) -> crate::error::Result<()> {
    shard.status = ShardStatus::Uploading;
    let cookie_jar = Arc::new(reqwest::cookie::Jar::default());
    let total_chunks = shard.chunks.len() as u32;
    let api = GigafileApiV1::new()?;

    // --- 首块串行（建立 Cookie 会话）---
    let first_chunk = &shard.chunks[0];
    let data = read_chunk_data(file_path, first_chunk.offset, first_chunk.size).await?;
    let params = ChunkUploadParams {
        data,
        file_name: file_name.to_string(),
        upload_id: shard.upload_id.clone(),
        chunk_index: 0,
        total_chunks,
        lifetime: config.lifetime,
        server_url: server_url.to_string(),
        cookie_jar: cookie_jar.clone(),
    };
    let resp = api.upload_chunk(params).await?;
    shard.chunks[0].status = ChunkStatus::Completed;

    if total_chunks == 1 {
        shard.download_url = resp.download_url;
        shard.status = ShardStatus::Completed;
        return Ok(());
    }

    // --- 后续块并发 + 保序完成 ---
    let semaphore = Arc::new(Semaphore::new(DEFAULT_CONCURRENT_CHUNKS));
    let completed_counter = Arc::new(AtomicU32::new(1)); // chunk 0 已完成
    let mut handles = Vec::new();

    for chunk in &shard.chunks[1..] {
        if cancel_flag.load(Ordering::Relaxed) {
            shard.status = ShardStatus::Error;
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }

        let permit = semaphore.clone().acquire_owned().await
            .map_err(|e| AppError::Internal(format!("Semaphore error: {}", e)))?;
        let file_path = file_path.to_string();
        let file_name = file_name.to_string();
        let upload_id = shard.upload_id.clone();
        let server_url = server_url.to_string();
        let cookie_jar = cookie_jar.clone();
        let completed_counter = completed_counter.clone();
        let chunk_index = chunk.chunk_index;
        let chunk_offset = chunk.offset;
        let chunk_size = chunk.size;
        let lifetime = config.lifetime;
        let cancel_flag = cancel_flag.clone();

        let handle = tokio::spawn(async move {
            // 读取 chunk 数据
            let data = read_chunk_data(&file_path, chunk_offset, chunk_size).await?;

            // 创建 API 实例并上传
            let api = GigafileApiV1::new()?;
            let params = ChunkUploadParams {
                data,
                file_name,
                upload_id,
                chunk_index,
                total_chunks,
                lifetime,
                server_url,
                cookie_jar,
            };
            let resp = api.upload_chunk(params).await?;

            // 保序完成：等待轮到自己
            loop {
                if cancel_flag.load(Ordering::Relaxed) {
                    return Err(AppError::Internal("Upload cancelled by user".into()));
                }
                if completed_counter.load(Ordering::Acquire) == chunk_index {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            completed_counter.store(chunk_index + 1, Ordering::Release);

            drop(permit); // 释放 semaphore permit
            Ok::<_, AppError>(resp)
        });

        handles.push((chunk_index, handle));
    }

    // 收集结果
    let mut last_url: Option<String> = None;
    for (idx, handle) in handles {
        let resp = handle.await
            .map_err(|e| AppError::Internal(format!("Task join error: {}", e)))??;
        if idx == total_chunks - 1 {
            last_url = resp.download_url;
        }
    }

    // 更新 shard 状态
    for chunk in &mut shard.chunks[1..] {
        chunk.status = ChunkStatus::Completed;
    }
    shard.download_url = last_url;
    shard.status = ShardStatus::Completed;

    Ok(())
}

/// 从文件指定偏移量读取指定大小的数据。
///
/// 使用 spawn_blocking 避免阻塞 tokio 运行时。
pub async fn read_chunk_data(file_path: &str, offset: u64, size: u64) -> crate::error::Result<Vec<u8>> {
    let file_path = file_path.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = std::fs::File::open(&file_path)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut buf = vec![0u8; size as usize];
        let bytes_read = file.read(&mut buf)?;
        buf.truncate(bytes_read);
        Ok(buf)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking join error: {}", e)))?
}
```

#### 5. `commands/upload.rs` — Tauri IPC 入口

```rust
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::api::v1::GigafileApiV1;
use crate::models::file::FileEntry;
use crate::models::upload::UploadConfig;
use crate::services::upload_engine;

/// Tauri managed state for upload lifecycle.
pub struct UploadState {
    pub cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for UploadState {
    fn default() -> Self {
        Self {
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
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
    upload_engine::start(files, config, &api, app, state.cancel_flags.clone())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_upload(
    task_id: String,
    state: tauri::State<'_, UploadState>,
) -> Result<(), String> {
    let flags = state.cancel_flags.lock().await;
    match flags.get(&task_id) {
        Some(flag) => {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
            Ok(())
        }
        None => Err(format!("No active upload task with id: {}", task_id)),
    }
}
```

### 数据流

```
Frontend: uploadStore.startUpload()
  → invoke('start_upload', { files: Vec<FileEntry>, config: UploadConfig })

commands/upload.rs::start_upload
  → GigafileApiV1::new()
  → upload_engine::start(files, config, api, app, cancel_flags)

upload_engine::start()
  → api.discover_server() → server_url
  → for each file:
      → uuid::Uuid::new_v4() → task_id
      → chunk_manager::plan_chunks(file_size) → Vec<Shard>
      → for each shard: uuid::Uuid::new_v4() → upload_id
      → construct UploadTask
      → tokio::spawn(upload_file(...))
  → return Vec<task_id>

upload_file(task)
  → for each shard:
      → upload_shard(shard, ...)

upload_shard(shard)
  → Arc<Jar>::default() → cookie_jar
  → read_chunk_data(path, chunk[0].offset, chunk[0].size) → Vec<u8>
  → api.upload_chunk(first_chunk_params) → 串行，建立 Cookie 会话
  → for chunk[1..N]:
      → Semaphore.acquire() → 限制 8 并发
      → tokio::spawn:
          → read_chunk_data(path, offset, size)
          → api.upload_chunk(params)
          → wait for completed_counter == chunk_index （保序）
          → increment completed_counter
  → collect download_url from last chunk response
  → shard.download_url = url
```

### 与 api::ChunkUploadParams 的字段映射

| 上传引擎内部数据 | ChunkUploadParams 字段 | 来源 |
|-----------------|----------------------|------|
| chunk 数据 | `data: Vec<u8>` | `read_chunk_data(file_path, chunk.offset, chunk.size)` |
| 文件名 | `file_name` | `UploadTask.file_name` |
| 分片会话 ID | `upload_id` | `Shard.upload_id`（UUID v4 hex） |
| 块索引 | `chunk_index` | `Chunk.chunk_index` |
| 总块数 | `total_chunks` | `shard.chunks.len() as u32` |
| 保留天数 | `lifetime` | `UploadConfig.lifetime` |
| 服务器地址 | `server_url` | `discover_server()` 返回值 |
| Cookie jar | `cookie_jar` | 每个 shard 独立创建的 `Arc<Jar>` |

### 设计决策

1. **文件并行，分片串行**：同一文件的多个 shard 按顺序上传（串行），不同文件的上传独立并行。理由：避免同时占用过多带宽和服务器资源，同时满足 NFR12 独立错误隔离。

2. **非阻塞 command 返回**：`start_upload` 立即返回 task_id 列表，上传在后台 tokio 任务中执行。进度和完成事件通过 Tauri event 推送（Story 3.5/3.6 实现事件发射）。

3. **使用 FileEntry 作为输入类型**：Epic 定义了 `FileInput` 类型，但 `models/file.rs` 中的 `FileEntry` 已具有完全相同的字段（`file_name`, `file_path`, `file_size`）且已标注 `#[serde(rename_all = "camelCase")]`。直接复用 `FileEntry` 避免冗余类型定义。

4. **UUID v4 替代 UUID v1**：研究报告中 gfile 使用 UUID v1（基于 MAC + 时间戳），但服务器仅将其作为唯一标识符使用，不校验 UUID 版本。UUID v4（纯随机）更简单且无需系统 MAC 地址访问。

5. **临时 Client per upload_chunk**：`upload_chunk` 为每次调用创建带 cookie_jar 的临时 reqwest::Client。`GigafileApiV1` 的 `self.client` 未绑定 cookie provider（用于 discover_server 等无 cookie 需求的场景）。临时 Client 的开销相对 100MB 数据传输可忽略。

6. **保序完成机制**：使用 `AtomicU32` 计数器而非 `tokio::sync::watch` 或 channel。每个并发 chunk 上传完数据后，通过轮询计数器等待轮到自己。10ms 轮询间隔在实际上传场景（每 chunk 数秒到数十秒）中开销极小。

7. **verify_upload 保持 stub**：`verify_upload()` 用于上传后的完整性校验，属于 Story 3.6（链接产出）的范围。本 Story 仅实现 upload_chunk。

8. **cancel_flags 使用 Mutex<HashMap>**：避免引入 `dashmap` 额外依赖。cancel_flags 的并发访问频率极低（仅在任务创建和取消时），Mutex 足够。

### 与后续 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.4（重试引擎） | 在 upload_chunk 调用外层包装重试逻辑，使用指数退避。本 Story 的 upload_shard 中的 `api.upload_chunk()` 调用点将被 retry_engine 包装 |
| Story 3.5（进度聚合） | 在 upload_shard 的 chunk 上传循环中插入进度更新回调，通过 Tauri event 推送到前端。本 Story 预留了 app: AppHandle 参数 |
| Story 3.6（链接产出） | 使用本 Story 写入的 `Shard.download_url` 字段，通过 Tauri event `upload:file-complete` 推送到前端。实现 `verify_upload()` |

---

## Tasks

### Task 1: 添加新依赖

**文件:** `src-tauri/Cargo.toml`（修改）
**依赖:** 无

**Subtasks:**

1.1. 在 `[dependencies]` 中添加 `uuid = { version = "1", features = ["v4"] }`
1.2. 在 `[dependencies]` 中添加 `log = "0.4"`
1.3. 在 reqwest 的 features 中追加 `"multipart"`：`reqwest = { version = "0.12", features = ["json", "cookies", "multipart"] }`
1.4. 执行 `cargo check` 确认依赖解析成功

### Task 2: 实现 upload_chunk（api/v1.rs）

**文件:** `src-tauri/src/api/v1.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 替换 `upload_chunk()` stub 为完整实现
2.2. 使用 `params.cookie_jar` 创建临时 `reqwest::Client`（`cookie_provider`）
2.3. 构建 `reqwest::multipart::Form`：字段 `id`, `name`, `chunk`, `chunks`, `lifetime`, `file`（Part）
2.4. POST 到 `{server_url}/upload_chunk.php`
2.5. 解析响应 JSON：提取 `status` 和可选 `url` 字段
2.6. 非 0 status 返回 `AppError::Api` 错误
2.7. 映射为 `ChunkUploadResponse { status, download_url }`
2.8. 超时设置为 300 秒（5 分钟，适配大 chunk 上传）
2.9. 添加 response JSON 解析的单元测试（mock 响应结构）

### Task 3: 创建 upload_engine 核心模块

**文件:** `src-tauri/src/services/upload_engine.rs`（新建）、`src-tauri/src/services/mod.rs`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 创建 `src-tauri/src/services/upload_engine.rs` 文件
3.2. 定义常量 `DEFAULT_CONCURRENT_CHUNKS: usize = 8`
3.3. 实现 `pub async fn start()` — 上传调度入口：发现服务器、创建 UploadTask、spawn 文件任务
3.4. 实现 `async fn upload_file()` — 单文件上传：遍历 shards 调用 upload_shard
3.5. 实现 `async fn upload_shard()` — 单分片上传：首块串行 + 后续并发 + 保序完成
3.6. 实现 `pub async fn read_chunk_data()` — 文件按需读取：spawn_blocking + seek + read
3.7. 在 `services/mod.rs` 中将 `// TODO: Story 3.3 - pub mod upload_engine;` 替换为 `pub mod upload_engine;`

### Task 4: 创建 commands/upload.rs 和注册

**文件:** `src-tauri/src/commands/upload.rs`（新建）、`src-tauri/src/commands/mod.rs`（修改）、`src-tauri/src/lib.rs`（修改）
**依赖:** Task 3

**Subtasks:**

4.1. 创建 `src-tauri/src/commands/upload.rs` 文件
4.2. 定义 `UploadState` 结构体（含 `cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>`）
4.3. 实现 `UploadState::default()`
4.4. 实现 `start_upload` Tauri command：创建 API 实例、调用 upload_engine::start、返回 task_id
4.5. 实现 `cancel_upload` Tauri command：查找并设置 cancel flag
4.6. 在 `commands/mod.rs` 中将 `// TODO: Story 3.3 - pub mod upload;` 替换为 `pub mod upload;`
4.7. 在 `lib.rs` 中添加 `.manage(commands::upload::UploadState::default())` 到 Tauri Builder
4.8. 在 `lib.rs` 的 `invoke_handler` 中注册 `commands::upload::start_upload` 和 `commands::upload::cancel_upload`

### Task 5: 编写单元测试

**文件:** `src-tauri/src/services/upload_engine.rs`（`#[cfg(test)] mod tests`）、`src-tauri/src/commands/upload.rs`（`#[cfg(test)] mod tests`）、`src-tauri/src/api/v1.rs`（追加测试）
**依赖:** Task 3, Task 4

**Subtasks:**

5.1. upload_engine 测试：`read_chunk_data` 从临时文件读取指定 offset 和 size 的数据
5.2. upload_engine 测试：`read_chunk_data` 文件末尾不足 size 时返回实际可用字节
5.3. upload_engine 测试：`read_chunk_data` 文件不存在时返回 `AppError::Io`
5.4. upload_engine 测试：验证 UUID v4 hex 生成为 32 个十六进制字符
5.5. commands/upload 测试：`UploadState::default()` 初始化 cancel_flags 为空
5.6. commands/upload 测试：cancel flag 设置后读取为 true
5.7. v1.rs 测试：验证中间块响应 `{"status": 0}` 解析为 `ChunkUploadResponse { status: 0, download_url: None }`
5.8. v1.rs 测试：验证最后块响应 `{"status": 0, "url": "https://..."}` 解析为 `ChunkUploadResponse { status: 0, download_url: Some("https://...") }`

### Task 6: 代码质量验证

**文件:** 无新文件
**依赖:** Task 5

**Subtasks:**

6.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
6.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
6.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过（含 Story 3-1 和 3-2 现有测试）

---

## Task 依赖顺序

```
Task 1 (依赖) ──> Task 2 (upload_chunk 实现)
                       │
                       v
                  Task 3 (upload_engine 核心)
                       │
                       v
                  Task 4 (commands + 注册)
                       │
                       v
                  Task 5 (单元测试)
                       │
                       v
                  Task 6 (代码质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/services/upload_engine.rs` | `start()` 调度入口、`upload_file()` 单文件上传、`upload_shard()` 分片上传（首块串行 + 并发）、`read_chunk_data()` 按需读取、单元测试 |
| `src-tauri/src/commands/upload.rs` | `UploadState` 结构体、`start_upload` command、`cancel_upload` command、单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/Cargo.toml` | 添加 `uuid`、`log` 依赖，reqwest 追加 `multipart` feature |
| `src-tauri/src/api/v1.rs` | 替换 `upload_chunk()` stub 为完整 multipart POST 实现 |
| `src-tauri/src/services/mod.rs` | 将 `// TODO: Story 3.3 - pub mod upload_engine;` 替换为 `pub mod upload_engine;` |
| `src-tauri/src/commands/mod.rs` | 将 `// TODO: Story 3.3 - pub mod upload;` 替换为 `pub mod upload;` |
| `src-tauri/src/lib.rs` | 注册 `UploadState` managed state + `start_upload`/`cancel_upload` commands |

### 禁止修改

- `src-tauri/src/api/mod.rs` — `GigafileApi` trait、`ChunkUploadParams`、`ChunkUploadResponse` 已在 Story 3-1 定义，无需变更
- `src-tauri/src/error.rs` — `AppError` 已有所有必要的 From 实现
- `src-tauri/src/models/upload.rs` — 数据模型已在 Story 3-2 完成
- `src-tauri/src/models/file.rs` — `FileEntry` 已有正确结构
- `src-tauri/src/services/chunk_manager.rs` — 分块规划器已在 Story 3-2 完成
- `src-tauri/src/storage/` — 不涉及持久化
- `src/` — 本 Story 为纯 Rust 后端实现，不涉及前端变更

---

## Technical Notes

### gigafile.nu upload_chunk.php 协议参考

基于技术研究报告（`_bmad-output/planning-artifacts/research/technical-gigafile-nu-upload-api-research-2026-02-10.md`）：

```
POST https://{server}/upload_chunk.php
Content-Type: multipart/form-data; boundary=...

--boundary
Content-Disposition: form-data; name="id"

{uuid_hex_32_chars}
--boundary
Content-Disposition: form-data; name="name"

{original_filename}
--boundary
Content-Disposition: form-data; name="chunk"

{chunk_index_0_based}
--boundary
Content-Disposition: form-data; name="chunks"

{total_chunks}
--boundary
Content-Disposition: form-data; name="lifetime"

{retention_days}
--boundary
Content-Disposition: form-data; name="file"; filename="blob"
Content-Type: application/octet-stream

{binary_data}
--boundary--
```

**响应格式：**
- 中间块成功：`{"status": 0}`
- 最后块成功：`{"status": 0, "url": "https://XX.gigafile.nu/XXXXX"}`
- 失败：`status` 非 0

### 保序完成机制示意

```
时间轴 →

Chunk 1: [====upload====][wait...][done] → counter=2
Chunk 2: [======upload======][wait][done] → counter=3
Chunk 3: [====upload====][wait........][done] → counter=4
Chunk 4: [========upload========][done] → counter=5

虽然 Chunk 3 的数据比 Chunk 4 更早上传完成，
但它必须等待 Chunk 2 完成（counter==3）后才能处理响应并推进 counter。
这确保服务端看到的块"完成"顺序是 1→2→3→4。
```

### reqwest multipart + cookie_jar 使用模式

```rust
// 每个 shard 创建独立 cookie_jar
let jar = Arc::new(reqwest::cookie::Jar::default());

// 每次 upload_chunk 调用使用该 jar 创建临时 Client
let client = reqwest::Client::builder()
    .cookie_provider(jar.clone())
    .build()?;

// 首块响应的 Set-Cookie 自动存入 jar
// 后续块的请求自动携带 jar 中的 Cookie
```

### 与前端 uploadStore 的交互点（Story 3.5/3.6 实现）

```
[本 Story 预留的扩展点]

upload_engine::start()
  → app: AppHandle 参数已传入
  → Story 3.5 将在 upload_shard 循环中插入:
      app.emit("upload:progress", progress_payload)
  → Story 3.6 将在 upload_file 完成时插入:
      app.emit("upload:file-complete", complete_payload)

commands/upload.rs
  → UploadState 可在 Story 3.5 扩展:
      pub active_tasks: Arc<Mutex<HashMap<String, UploadTask>>>
      用于查询当前上传进度
```

---

## Definition of Done

- [ ] `Cargo.toml` 添加 `uuid`（v4 feature）和 `log` 依赖
- [ ] `Cargo.toml` reqwest 追加 `multipart` feature
- [ ] `api/v1.rs` `upload_chunk()` 替换 stub 为完整 multipart/form-data POST 实现
- [ ] `upload_chunk()` 使用 `params.cookie_jar` 创建临时 Client
- [ ] `upload_chunk()` 正确构建表单字段：id, name, chunk, chunks, lifetime, file
- [ ] `upload_chunk()` 解析响应 JSON 并返回 `ChunkUploadResponse`
- [ ] `upload_chunk()` 非 0 status 返回 `AppError::Api`
- [ ] `services/upload_engine.rs` 实现 `start()` 调度入口
- [ ] `start()` 调用 `discover_server()` 获取服务器 URL
- [ ] `start()` 为每个文件生成 task_id（UUID v4 hex，32 字符）
- [ ] `start()` 为每个 shard 生成 upload_id（UUID v4 hex，32 字符）
- [ ] `start()` 使用 `plan_chunks()` 规划分片
- [ ] `start()` 为每个文件 spawn 独立 tokio 任务
- [ ] `start()` 非阻塞，立即返回 task_id 列表
- [ ] `upload_shard()` 首块串行上传建立 Cookie 会话
- [ ] `upload_shard()` 后续块通过 Semaphore 控制 8 并发
- [ ] `upload_shard()` 使用 AtomicU32 实现保序完成
- [ ] `upload_shard()` 每个 shard 使用独立 cookie jar
- [ ] `upload_shard()` 最后块的 download_url 写入 Shard.download_url
- [ ] `read_chunk_data()` 使用 spawn_blocking + seek + read 按需读取
- [ ] `read_chunk_data()` 不一次性读取整个文件到内存
- [ ] 多文件独立错误隔离（NFR12），单文件失败不影响其他
- [ ] 上传循环检查 cancel flag，支持取消
- [ ] `commands/upload.rs` 定义 `UploadState` 结构体
- [ ] `commands/upload.rs` 实现 `start_upload` Tauri command
- [ ] `commands/upload.rs` 实现 `cancel_upload` Tauri command
- [ ] `commands/mod.rs` TODO 替换为 `pub mod upload;`
- [ ] `services/mod.rs` TODO 替换为 `pub mod upload_engine;`
- [ ] `lib.rs` 注册 `UploadState` managed state
- [ ] `lib.rs` 注册 `start_upload` 和 `cancel_upload` commands
- [ ] 单元测试：read_chunk_data 正确读取、边界处理、文件不存在
- [ ] 单元测试：UUID v4 hex 为 32 个十六进制字符
- [ ] 单元测试：UploadState 构造和 cancel flag 设置
- [ ] 单元测试：upload_chunk 响应解析（中间块和最后块）
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过

---

## Review History

### Review Round 1 — 2026-02-11

**Reviewer:** Story Reviewer (BMM PM John persona)
**Verdict:** PASSED

| # | Checklist Item | Result | Feedback |
|---|----------------|--------|----------|
| RC-1 | AC clarity | PASS | All 9 ACs are specific, measurable, independently testable. Code signatures, error conditions, and expected behavior clearly specified. |
| RC-2 | Task sequence | PASS | Linear dependency chain Task 1->2->3->4->5->6, no circular dependencies. |
| RC-3 | Technical feasibility | PASS | All technical claims verified against actual codebase: upload_chunk stub (v1.rs:55-62), ChunkUploadParams 8 fields (mod.rs:16-25), plan_chunks (chunk_manager.rs:19), FileEntry (file.rs:9-13), TODO placeholders (commands/mod.rs:9, services/mod.rs:8), lib.rs invoke_handler (lib.rs:14-16), Cargo.toml reqwest features (Cargo.toml:23). All From implementations in error.rs confirmed. |
| RC-4 | Requirement consistency | PASS | Minor note: AC-2 signature shows DashMap but inline note immediately corrects to Arc<Mutex<HashMap>>; all code examples and Technical Design consistently use HashMap. FileEntry vs FileInput deviation explicitly justified in design decision #3. No contradictions. |
| RC-5 | Scope sizing | PASS | 1 API implementation + 1 new service module (4 functions) + 1 new command module (2 commands + 1 state struct) + 5 file modifications + 6 unit test categories. Tightly coupled, appropriate for single dev cycle. |
| RC-6 | Dependency documentation | PASS | Upstream: Story 3-1, 3-2 with completion status. Downstream: Story 3.4 (retry wrapper), 3.5 (progress events), 3.6 (verify_upload + link) with specific integration points documented. |
| RC-7 | File scope declaration | PASS | 2 new files + 5 modified files + 7 prohibited files explicitly listed. All paths verified against actual codebase. |
| RC-8 | API/method existence | PASS | reqwest::multipart (Form, Part), reqwest::cookie::Jar, tokio::sync::Semaphore, tokio::task::spawn_blocking, uuid::Uuid::new_v4(), log::error!(), tauri::State, tauri::AppHandle — all standard well-documented crate APIs. |

**Summary:** Story 3-3 is well-structured with comprehensive AC coverage of FR7, FR11, NFR12. Technical Design section provides detailed code examples consistent with the existing codebase. File scope declarations are precise and verified. Ready for development.
