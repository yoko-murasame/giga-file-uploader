# Story 3.4: 重试引擎与错误处理

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-4 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 3-3 (上传引擎核心 - 首块串行与并发上传) -- 已完成 |
| FRs 覆盖 | FR8 (静默自动重试), FR9 (超阈值失败提示) |
| NFRs 关联 | NFR9 (正常网络条件下用户感知失败率为 0), NFR10 (50 次以下完全无感知), NFR12 (单文件失败不影响其他) |

## User Story

As a 用户,
I want 上传过程中的网络瞬时故障被自动静默处理,
So that 我不会因为偶发的网络问题而看到错误提示。

---

## Acceptance Criteria

### AC-1: 重试引擎状态机（retry_engine.rs）

**Given** 需要一个独立的重试引擎模块
**When** 创建 `services/retry_engine.rs`
**Then** 实现 `RetryPolicy` 结构体，包含以下配置：
- `initial_delay_ms: u64` — 初始退避时间（默认 200ms）
- `max_delay_ms: u64` — 最大退避时间（默认 30000ms = 30s）
- `warning_threshold: u32` — 告警阈值（默认 50）
- `max_retries: Option<u32>` — 最大重试次数（默认 None = 无限制，由用户决策）
**And** 实现 `pub async fn retry_upload_chunk()` 函数，接受闭包形式的 upload_chunk 调用，自动执行重试
**And** 指数退避计算公式：`min(initial_delay_ms * 2^attempt, max_delay_ms)` + 抖动（±10%）
**And** 重试仅针对可重试的错误类型：`AppError::Network`（网络错误）和 5xx HTTP 响应（`AppError::Api` 中包含 status 5xx）
**And** 不可重试的错误（如 `AppError::Api` 非 5xx、`AppError::Io`、`AppError::Internal`）立即返回，不进行重试
**And** 定义常量 `DEFAULT_INITIAL_DELAY_MS: u64 = 200`、`DEFAULT_MAX_DELAY_MS: u64 = 30_000`、`DEFAULT_WARNING_THRESHOLD: u32 = 50`

### AC-2: 静默重试（重试次数 < 50）

**Given** 单个上传块请求失败（网络错误、超时、5xx 响应）
**When** 重试次数 < 50 次
**Then** 自动静默重试，用户完全无感知（FR8, NFR9, NFR10）
**And** 每次重试前等待指数退避时间
**And** 重试期间检查 cancel flag，若已取消则立即停止重试并返回取消错误
**And** 日志记录使用英文技术详情：`log::warn!("Chunk upload retry: attempt={}, chunk_index={}, error={}", attempt, chunk_index, err)`
**And** 日志级别：50 次以下使用 `warn`，不使用 `error`（避免误导）

### AC-3: 超阈值告警事件（重试次数 >= 50）

**Given** 单个上传块连续重试
**When** 重试次数 >= 50 次
**Then** 通过 Tauri event 发送 `upload:retry-warning` 事件到前端（FR9）
**And** 事件 payload 结构：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryWarningPayload {
    pub task_id: String,
    pub file_name: String,
    pub retry_count: u32,
    pub error_message: String,
}
```

**And** 每超过阈值 10 次发送一次事件（即第 50、60、70... 次），避免事件洪泛
**And** 日志级别提升为 `error`：`log::error!("Chunk upload exceeded retry threshold: attempt={}, chunk_index={}, file={}", attempt, chunk_index, file_name)`
**And** 超过阈值后继续重试（不自动放弃），等待用户通过 cancel_upload 主动取消

### AC-4: 不可恢复错误与文件级失败事件

**Given** 上传块遇到不可重试的错误，或用户取消上传
**When** 该文件上传彻底失败
**Then** 通过 Tauri event 发送 `upload:error` 事件到前端
**And** 事件 payload 结构：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadErrorPayload {
    pub task_id: String,
    pub file_name: String,
    pub error_message: String,
}
```

**And** 该文件的 `UploadTask.status` 设置为 `Error`
**And** 其他文件的上传不受影响，继续正常执行（NFR12）
**And** 错误信息使用英文技术详情记录到日志

### AC-5: upload_engine 集成重试引擎

**Given** Story 3.3 中 `upload_engine.rs` 的 `api.upload_chunk(params).await?` 调用点
**When** 集成重试引擎
**Then** 将首块串行上传（`upload_shard` 中 chunk_index == 0）包装到 `retry_upload_chunk()` 中
**And** 将并发块上传（`upload_shard` 中 chunk_index 1~N-1 的 tokio::spawn 内部）包装到 `retry_upload_chunk()` 中
**And** `upload_file()` 函数签名增加 `app: tauri::AppHandle` 和 `task_id: String` 参数（用于事件发射）
**And** `upload_shard()` 函数签名增加 `app: tauri::AppHandle` 和 `task_id: String` 参数
**And** `start()` 函数中将 `_app` 参数前缀去掉，改为 `app` 并传递到 `upload_file()`
**And** 在 `upload_file()` 错误处理中发射 `upload:error` 事件
**And** 在并发块 tokio::spawn 内将 `app` clone 传入用于重试告警事件发射

### AC-6: 错误分类辅助函数

**Given** 需要判断错误是否可重试
**When** 实现错误分类逻辑
**Then** 在 `retry_engine.rs` 中实现 `fn is_retryable(err: &AppError) -> bool`
**And** `AppError::Network(_)` — 始终可重试（网络瞬时故障）
**And** `AppError::Api(msg)` — 仅当 msg 包含 5xx 状态码关键词时可重试（服务端临时错误）
**And** `AppError::Io(_)` — 不可重试（本地文件系统错误）
**And** `AppError::Storage(_)` — 不可重试
**And** `AppError::Internal(_)` — 不可重试
**And** 包含单元测试覆盖每种 AppError 变体的分类结果

### AC-7: 单元测试

**Given** retry_engine 实现完成
**When** 执行 `cargo test`
**Then** 包含以下测试覆盖：
- **指数退避计算**：验证 attempt 0 → 200ms, attempt 1 → 400ms, attempt 5 → 6400ms, attempt 10 → 30000ms（命中上限）
- **抖动范围**：验证退避时间在 ±10% 范围内
- **可重试错误分类**：`AppError::Network` 返回 true
- **可重试错误分类**：`AppError::Api("status=500")` 返回 true
- **不可重试错误分类**：`AppError::Api("upload_chunk failed: status=1")` 返回 false
- **不可重试错误分类**：`AppError::Io`、`AppError::Storage`、`AppError::Internal` 返回 false
- **RetryPolicy 默认值**：验证 initial_delay=200, max_delay=30000, warning_threshold=50
- **告警节流**：验证只在第 50、60、70 次触发告警（每 10 次一次）
**And** 所有测试不依赖网络
**And** `cargo clippy` 无警告

---

## Technical Design

### 现状分析

Story 3-3 已完成以下基础设施：

- `src-tauri/src/services/upload_engine.rs` — `start()` 调度入口，`upload_file()` 单文件上传，`upload_shard()` 分片上传（首块串行 + 并发），`read_chunk_data()` 按需读取
- `src-tauri/src/commands/upload.rs` — `UploadState` 结构体，`start_upload` / `cancel_upload` Tauri commands
- `src-tauri/src/api/v1.rs` — `upload_chunk()` 完整实现，multipart/form-data POST
- `src-tauri/src/api/mod.rs` — `GigafileApi` trait，`ChunkUploadParams`，`ChunkUploadResponse`
- `src-tauri/src/error.rs` — `AppError`（Network/Api/Storage/Io/Internal），`From<reqwest::Error>`，`From<std::io::Error>`，`From<serde_json::Error>`
- `src-tauri/src/models/upload.rs` — `UploadTask`, `Shard`, `Chunk`, `UploadConfig`, 状态枚举
- `src-tauri/src/lib.rs` — `UploadState` managed state + `start_upload`/`cancel_upload` 注册

**当前 upload_engine.rs 的调用点（需要包装重试）：**

- 第 149 行：`let resp = api.upload_chunk(params).await?;` — 首块串行上传，无重试
- 第 202 行：`let resp = api.upload_chunk(params).await?;` — 并发块上传，无重试
- `upload_file()` 第 88 行：`_app` 参数未使用（前缀下划线），需传递到 upload_shard
- `upload_shard()` 没有 `app` 参数，无法发射事件

### 新增/修改模块

#### 1. `services/retry_engine.rs` — 重试引擎核心（新建）

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::future::Future;

use serde::Serialize;
use tauri::Emitter;

use crate::error::AppError;

/// Default initial backoff delay in milliseconds.
pub const DEFAULT_INITIAL_DELAY_MS: u64 = 200;
/// Default maximum backoff delay in milliseconds (30 seconds).
pub const DEFAULT_MAX_DELAY_MS: u64 = 30_000;
/// Default retry count threshold for emitting warning events.
pub const DEFAULT_WARNING_THRESHOLD: u32 = 50;
/// Warning event throttle interval (emit every N retries after threshold).
const WARNING_THROTTLE_INTERVAL: u32 = 10;

/// Retry warning event payload sent to frontend via Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryWarningPayload {
    pub task_id: String,
    pub file_name: String,
    pub retry_count: u32,
    pub error_message: String,
}

/// Upload error event payload sent to frontend via Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadErrorPayload {
    pub task_id: String,
    pub file_name: String,
    pub error_message: String,
}

/// Retry policy configuration.
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub warning_threshold: u32,
    pub max_retries: Option<u32>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            initial_delay_ms: DEFAULT_INITIAL_DELAY_MS,
            max_delay_ms: DEFAULT_MAX_DELAY_MS,
            warning_threshold: DEFAULT_WARNING_THRESHOLD,
            max_retries: None,
        }
    }
}

/// Check whether an error is retryable.
///
/// Network errors are always retryable. API errors are retryable only
/// for 5xx server errors. All other errors (Io, Storage, Internal) are not.
pub fn is_retryable(err: &AppError) -> bool {
    match err {
        AppError::Network(_) => true,
        AppError::Api(msg) => {
            // Check for 5xx status codes in the error message
            msg.contains("status=5")
                || msg.contains("500")
                || msg.contains("502")
                || msg.contains("503")
                || msg.contains("504")
        }
        AppError::Io(_) | AppError::Storage(_) | AppError::Internal(_) => false,
    }
}

/// Calculate exponential backoff delay with ±10% jitter.
pub fn calculate_delay(attempt: u32, policy: &RetryPolicy) -> u64 {
    let base = policy.initial_delay_ms.saturating_mul(1u64 << attempt.min(31));
    let capped = base.min(policy.max_delay_ms);
    // Add ±10% jitter
    let jitter_range = capped / 10;
    if jitter_range == 0 {
        return capped;
    }
    // Simple deterministic-ish jitter using attempt as seed
    let jitter = (attempt as u64 * 7 + 13) % (jitter_range * 2 + 1);
    capped - jitter_range + jitter
}

/// Whether a warning event should be emitted at this retry count.
///
/// Fires at threshold (50), then every 10 retries (60, 70, 80...).
pub fn should_emit_warning(attempt: u32, threshold: u32) -> bool {
    attempt >= threshold
        && (attempt == threshold || (attempt - threshold) % WARNING_THROTTLE_INTERVAL == 0)
}

/// Retry an upload chunk operation with exponential backoff.
///
/// Wraps a fallible async upload operation. On retryable errors, automatically
/// retries with exponential backoff. Emits `upload:retry-warning` events when
/// retry count exceeds the warning threshold.
pub async fn retry_upload_chunk<F, Fut, T>(
    policy: &RetryPolicy,
    cancel_flag: &Arc<AtomicBool>,
    app: &tauri::AppHandle,
    task_id: &str,
    file_name: &str,
    chunk_index: u32,
    mut operation: F,
) -> crate::error::Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = crate::error::Result<T>>,
{
    let mut attempt: u32 = 0;

    loop {
        // Check cancel before each attempt
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }

        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) => {
                if !is_retryable(&err) {
                    return Err(err);
                }

                // Check max retries
                if let Some(max) = policy.max_retries {
                    if attempt >= max {
                        return Err(err);
                    }
                }

                // Log retry
                if attempt < policy.warning_threshold {
                    log::warn!(
                        "Chunk upload retry: attempt={}, chunk_index={}, error={}",
                        attempt,
                        chunk_index,
                        err
                    );
                } else {
                    log::error!(
                        "Chunk upload exceeded retry threshold: attempt={}, chunk_index={}, file={}",
                        attempt,
                        chunk_index,
                        file_name
                    );

                    // Emit warning event (throttled)
                    if should_emit_warning(attempt, policy.warning_threshold) {
                        let _ = app.emit(
                            "upload:retry-warning",
                            RetryWarningPayload {
                                task_id: task_id.to_string(),
                                file_name: file_name.to_string(),
                                retry_count: attempt,
                                error_message: err.to_string(),
                            },
                        );
                    }
                }

                // Wait with exponential backoff
                let delay = calculate_delay(attempt, policy);
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;

                attempt = attempt.saturating_add(1);
            }
        }
    }
}
```

#### 2. `services/upload_engine.rs` — 集成重试（修改）

**修改点 1：`start()` 函数 — 去掉 `_app` 前缀，传递 `app` 到 `upload_file`**

```rust
pub async fn start(
    files: Vec<FileEntry>,
    config: UploadConfig,
    api: &GigafileApiV1,
    app: tauri::AppHandle,    // 去掉下划线前缀
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
) -> crate::error::Result<Vec<String>> {
    // ...
    // spawn 内部：
    let app_clone = app.clone();
    let task_id_for_upload = task_id.clone();
    tokio::spawn(async move {
        let result = upload_file(task, &server_url, &config, cancel_flag, app_clone, task_id_for_upload).await;
        // ... error handling with upload:error event emission
    });
}
```

**修改点 2：`upload_file()` 函数 — 增加 `app` 和 `task_id` 参数，错误时发射事件**

```rust
async fn upload_file(
    mut task: UploadTask,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: Arc<AtomicBool>,
    app: tauri::AppHandle,
    task_id: String,
) -> crate::error::Result<()> {
    task.status = UploadStatus::Uploading;

    for shard in &mut task.shards {
        if cancel_flag.load(Ordering::Relaxed) {
            task.status = UploadStatus::Error;
            let _ = app.emit("upload:error", UploadErrorPayload {
                task_id: task_id.clone(),
                file_name: task.file_name.clone(),
                error_message: "Upload cancelled by user".into(),
            });
            return Err(AppError::Internal("Upload cancelled by user".into()));
        }
        if let Err(e) = upload_shard(
            shard, &task.file_path, &task.file_name,
            server_url, config, &cancel_flag, &app, &task_id,
        ).await {
            task.status = UploadStatus::Error;
            let _ = app.emit("upload:error", UploadErrorPayload {
                task_id: task_id.clone(),
                file_name: task.file_name.clone(),
                error_message: e.to_string(),
            });
            return Err(e);
        }
    }

    if task.shards.len() == 1 {
        task.download_url = task.shards[0].download_url.clone();
    }
    task.status = UploadStatus::Completed;
    Ok(())
}
```

**修改点 3：`upload_shard()` 函数 — 增加参数，包装 upload_chunk 到重试引擎**

```rust
async fn upload_shard(
    shard: &mut Shard,
    file_path: &str,
    file_name: &str,
    server_url: &str,
    config: &UploadConfig,
    cancel_flag: &Arc<AtomicBool>,
    app: &tauri::AppHandle,
    task_id: &str,
) -> crate::error::Result<()> {
    // ...
    let retry_policy = RetryPolicy::default();

    // 首块串行 — 包装重试
    let first_data = read_chunk_data(file_path, first_chunk.offset, first_chunk.size).await?;
    let resp = {
        let mut first_data_opt = Some(first_data);
        retry_upload_chunk(
            &retry_policy, cancel_flag, app, task_id, file_name, 0,
            || {
                // 首次调用使用已读数据，重试时重新读取
                let file_path = file_path.to_string();
                let file_name_clone = file_name.to_string();
                let upload_id = shard.upload_id.clone();
                let server_url = server_url.to_string();
                let cookie_jar = cookie_jar.clone();
                let first_data_taken = first_data_opt.take();
                let offset = first_chunk.offset;
                let size = first_chunk.size;
                async move {
                    let data = match first_data_taken {
                        Some(d) => d,
                        None => read_chunk_data(&file_path, offset, size).await?,
                    };
                    let api = GigafileApiV1::new()?;
                    let params = ChunkUploadParams {
                        data,
                        file_name: file_name_clone,
                        upload_id,
                        chunk_index: 0,
                        total_chunks,
                        lifetime: config_lifetime,
                        server_url,
                        cookie_jar,
                    };
                    api.upload_chunk(params).await
                }
            },
        ).await?
    };

    // 并发块 — 在 tokio::spawn 内部包装重试
    // ... 每个 spawn 内部将 api.upload_chunk(params).await 替换为
    // retry_upload_chunk(&retry_policy, &cancel_flag, &app, &task_id, &file_name, chunk_index, || { ... }).await
}
```

### 数据流

```
upload_engine::upload_shard()
  → retry_engine::retry_upload_chunk(policy, cancel_flag, app, ...)
      → attempt 0: api.upload_chunk(params).await
          → 成功: 返回 Ok(response)
          → 失败 + is_retryable:
              → attempt < 50: log::warn, 指数退避等待, 重试
              → attempt >= 50: log::error, emit "upload:retry-warning" (节流), 退避, 重试
          → 失败 + !is_retryable: 立即返回 Err
      → 所有重试失败: 返回 Err

upload_engine::upload_file()
  → upload_shard() 返回 Err:
      → emit "upload:error" 事件
      → task.status = Error
      → 其他文件不受影响 (NFR12)
```

### 错误处理四层分级实现映射

```
L0 — HTTP 请求自动重试
  → reqwest 层面的连接级重试（reqwest 内置）
  → 映射为 AppError::Network，由 retry_engine 自动重试

L1 — 上传块静默重试
  → retry_engine::retry_upload_chunk() 中 attempt < 50
  → 用户完全无感知，仅 log::warn

L2 — 超阈值事件通知
  → retry_engine::retry_upload_chunk() 中 attempt >= 50
  → emit "upload:retry-warning" Tauri event
  → 前端展示琥珀色温和提示

L3 — UI 展示用户决策
  → upload_file() 捕获最终错误
  → emit "upload:error" Tauri event
  → 前端展示错误状态
```

### 设计决策

1. **重试包装而非拦截器模式**：直接在 upload_chunk 调用点包装 `retry_upload_chunk()` 闭包，而非使用中间件/拦截器。原因：闭包方式更显式，不需要修改 `GigafileApi` trait 签名，且重试逻辑对 chunk_index、file_name 等上下文信息有访问需求。

2. **无限重试 + 用户取消**：超过 50 次阈值后不自动放弃，而是继续重试并通知用户，由用户通过 `cancel_upload` 决定是否停止。这符合 Epic 定义中"提供操作选择"的要求——用户可能在不稳定网络下仍希望继续等待。

3. **告警事件节流**：超过 50 次后每 10 次发一次 `upload:retry-warning`（第 50、60、70...次），避免事件洪泛淹没前端。

4. **重试时重新读取 chunk 数据**：首次尝试使用已读取的数据（`Option::take`），重试时重新从文件读取。虽然增加 I/O 开销，但避免了在重试循环中持有大量内存（100MB chunk data）。

5. **is_retryable 判断基于字符串匹配**：检查 `AppError::Api` 消息中是否包含 5xx 状态码。这依赖于 `api/v1.rs` 中 `error_for_status()` 产生的 reqwest 错误消息格式（包含 HTTP status code）。对于 `upload_chunk` 返回非 0 status 的业务错误（非 HTTP 层面），消息格式为 `"upload_chunk failed: status=1, response=..."` — 不匹配 5xx 模式，因此不会被重试（正确行为）。

6. **tauri::Emitter trait**：Tauri 2.x 中 `app.emit()` 方法来自 `tauri::Emitter` trait，需要在使用处导入。

7. **retry_policy 在 upload_shard 内创建**：使用 `RetryPolicy::default()` 创建策略实例。后续如需配置化，可从 `UploadConfig` 中传入，但当前 MVP 阶段使用硬编码默认值即可。

### 与后续 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.5（进度聚合） | 重试期间进度不应倒退：重试 chunk 的进度在重试成功前保持不变。进度事件发射点在 retry 成功后 |
| Story 3.6（链接产出） | 重试引擎确保 chunk 最终成功上传后才进入完成流程，download_url 仍从最后 chunk 响应获取 |

---

## Tasks

### Task 1: 创建 retry_engine 核心模块

**文件:** `src-tauri/src/services/retry_engine.rs`（新建）、`src-tauri/src/services/mod.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 创建 `src-tauri/src/services/retry_engine.rs` 文件
1.2. 定义常量 `DEFAULT_INITIAL_DELAY_MS`、`DEFAULT_MAX_DELAY_MS`、`DEFAULT_WARNING_THRESHOLD`、`WARNING_THROTTLE_INTERVAL`
1.3. 定义 `RetryPolicy` 结构体及 `Default` 实现
1.4. 定义 `RetryWarningPayload` 结构体（`#[serde(rename_all = "camelCase")]`）
1.5. 定义 `UploadErrorPayload` 结构体（`#[serde(rename_all = "camelCase")]`）
1.6. 实现 `pub fn is_retryable(err: &AppError) -> bool`
1.7. 实现 `pub fn calculate_delay(attempt: u32, policy: &RetryPolicy) -> u64`
1.8. 实现 `pub fn should_emit_warning(attempt: u32, threshold: u32) -> bool`
1.9. 实现 `pub async fn retry_upload_chunk()` 异步重试函数
1.10. 在 `services/mod.rs` 中将 `// TODO: Story 3.4 - pub mod retry_engine;` 替换为 `pub mod retry_engine;`

### Task 2: 集成重试引擎到 upload_engine

**文件:** `src-tauri/src/services/upload_engine.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 在文件顶部添加 `use crate::services::retry_engine::{...};` 导入
2.2. 修改 `start()` 函数：`_app` 参数去掉下划线前缀改为 `app`，将 `app.clone()` 和 `task_id.clone()` 传入 `upload_file()`
2.3. 修改 `upload_file()` 函数签名：增加 `app: tauri::AppHandle` 和 `task_id: String` 参数
2.4. 修改 `upload_file()` 错误处理：upload_shard 失败时发射 `upload:error` 事件
2.5. 修改 `upload_file()` 取消检查：发射 `upload:error` 事件
2.6. 修改 `upload_shard()` 函数签名：增加 `app: &tauri::AppHandle` 和 `task_id: &str` 参数
2.7. 修改 `upload_shard()` 首块上传：包装到 `retry_upload_chunk()` 中
2.8. 修改 `upload_shard()` 并发块上传：在 tokio::spawn 内部包装到 `retry_upload_chunk()` 中
2.9. 修改 `upload_shard()` 调用处（upload_file 中）：传入新增参数
2.10. 添加 `use tauri::Emitter;` 导入（Tauri 2.x emit 方法所需 trait）

### Task 3: 编写单元测试

**文件:** `src-tauri/src/services/retry_engine.rs`（`#[cfg(test)] mod tests`）
**依赖:** Task 1

**Subtasks:**

3.1. 测试 `calculate_delay` 指数退避：attempt 0 → 200ms, attempt 1 → 400ms, attempt 5 → 6400ms
3.2. 测试 `calculate_delay` 上限封顶：attempt 10+ → 不超过 30000ms
3.3. 测试 `calculate_delay` 抖动范围：结果在 base ±10% 内
3.4. 测试 `is_retryable` — `AppError::Network` 返回 true
3.5. 测试 `is_retryable` — `AppError::Api("status=500")` 返回 true
3.6. 测试 `is_retryable` — `AppError::Api("status=502")` 返回 true
3.7. 测试 `is_retryable` — `AppError::Api("upload_chunk failed: status=1")` 返回 false
3.8. 测试 `is_retryable` — `AppError::Io`、`AppError::Storage`、`AppError::Internal` 返回 false
3.9. 测试 `RetryPolicy::default()` 值正确
3.10. 测试 `should_emit_warning` — attempt 49 返回 false, 50 返回 true, 51-59 返回 false, 60 返回 true

### Task 4: 代码质量验证

**文件:** 无新文件
**依赖:** Task 2, Task 3

**Subtasks:**

4.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
4.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
4.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过（含 Story 3-1/3-2/3-3 现有测试）

---

## Task 依赖顺序

```
Task 1 (retry_engine 核心) ──→ Task 2 (upload_engine 集成)
         │                            │
         └──→ Task 3 (单元测试) ──→ Task 4 (代码质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/services/retry_engine.rs` | `RetryPolicy` 配置、`is_retryable()` 错误分类、`calculate_delay()` 退避计算、`should_emit_warning()` 节流判断、`retry_upload_chunk()` 异步重试函数、`RetryWarningPayload` / `UploadErrorPayload` 事件 payload、单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/src/services/upload_engine.rs` | `start()` 传递 app 参数；`upload_file()` 增加 app/task_id 参数和 `upload:error` 事件发射；`upload_shard()` 增加 app/task_id 参数，包装 upload_chunk 到 retry_upload_chunk；添加 retry_engine 和 tauri::Emitter 导入 |
| `src-tauri/src/services/mod.rs` | 将 `// TODO: Story 3.4 - pub mod retry_engine;` 替换为 `pub mod retry_engine;` |

### 禁止修改

- `src-tauri/src/api/mod.rs` — `GigafileApi` trait 定义不变
- `src-tauri/src/api/v1.rs` — `upload_chunk()` 实现不变，重试在调用侧处理
- `src-tauri/src/error.rs` — `AppError` 已有所有必要变体和 From 实现
- `src-tauri/src/models/upload.rs` — 数据模型不变
- `src-tauri/src/models/file.rs` — `FileEntry` 不变
- `src-tauri/src/services/chunk_manager.rs` — 分块规划器不变
- `src-tauri/src/commands/upload.rs` — command 层不变（重试逻辑在 services 层）
- `src-tauri/src/lib.rs` — 无需新增 command 注册或 managed state
- `src-tauri/Cargo.toml` — 不需要新增依赖（serde、log、tauri 已有）
- `src/` — 本 Story 为纯 Rust 后端实现，前端事件监听在 Story 3.5 实现

---

## Technical Notes

### 指数退避算法

```
delay = min(initial_delay_ms * 2^attempt, max_delay_ms) ± 10% jitter

attempt 0:  200ms  ± 20ms   → [180ms,  220ms]
attempt 1:  400ms  ± 40ms   → [360ms,  440ms]
attempt 2:  800ms  ± 80ms   → [720ms,  880ms]
attempt 3:  1600ms ± 160ms  → [1440ms, 1760ms]
attempt 4:  3200ms ± 320ms  → [2880ms, 3520ms]
attempt 5:  6400ms ± 640ms  → [5760ms, 7040ms]
attempt 6:  12800ms ± 1280ms → [11520ms, 14080ms]
attempt 7:  25600ms ± 2560ms → [23040ms, 28160ms]
attempt 8+: 30000ms ± 3000ms → [27000ms, 33000ms] (命中上限)
```

### Tauri 2.x 事件发射

```rust
// Tauri 2.x 需要导入 Emitter trait
use tauri::Emitter;

// 发射事件到所有前端窗口
app.emit("upload:retry-warning", payload)?;
app.emit("upload:error", payload)?;
```

### 重试引擎与 upload_chunk 的包装模式

```rust
// 重试前（Story 3.3）：
let resp = api.upload_chunk(params).await?;

// 重试后（Story 3.4）：
let resp = retry_upload_chunk(
    &retry_policy,
    cancel_flag,
    app,
    task_id,
    file_name,
    chunk_index,
    || {
        // 每次重试需要重新构建 params（因为 data 被 move）
        let data = read_chunk_data(&file_path, offset, size);
        async move {
            let data = data.await?;
            let api = GigafileApiV1::new()?;
            let params = ChunkUploadParams { data, ... };
            api.upload_chunk(params).await
        }
    },
).await?;
```

### 与前端的交互（后续 Story 3.5 实现监听）

```
Rust 事件发射：
  upload:retry-warning → RetryWarningPayload { taskId, fileName, retryCount, errorMessage }
  upload:error → UploadErrorPayload { taskId, fileName, errorMessage }

前端（Story 3.5 实现）：
  useUploadEvents hook 订阅 "upload:retry-warning" → 更新 uploadStore 状态
  useUploadEvents hook 订阅 "upload:error" → 更新文件状态为 error
  UI 展示：琥珀色温和提示 "网络连接不稳定，已重试 XX 次..."
```

---

## Definition of Done

- [ ] `services/retry_engine.rs` 创建，包含完整的重试引擎实现
- [ ] `RetryPolicy` 结构体定义，包含 initial_delay_ms、max_delay_ms、warning_threshold、max_retries
- [ ] `RetryPolicy::default()` 值正确：200ms / 30000ms / 50 / None
- [ ] `is_retryable()` 正确分类：Network 可重试，Api 5xx 可重试，其他不可重试
- [ ] `calculate_delay()` 实现指数退避 + ±10% 抖动 + 上限封顶
- [ ] `should_emit_warning()` 实现节流逻辑：阈值处触发，之后每 10 次触发
- [ ] `retry_upload_chunk()` 实现异步重试循环，支持取消检查
- [ ] `RetryWarningPayload` 定义，camelCase 序列化，包含 taskId/fileName/retryCount/errorMessage
- [ ] `UploadErrorPayload` 定义，camelCase 序列化，包含 taskId/fileName/errorMessage
- [ ] 重试次数 < 50 时静默重试，仅 log::warn（FR8, NFR10）
- [ ] 重试次数 >= 50 时 emit `upload:retry-warning` 事件 + log::error（FR9）
- [ ] 告警事件节流：每 10 次发一次（50, 60, 70...）
- [ ] 重试期间检查 cancel_flag，已取消则立即返回错误
- [ ] `upload_engine.rs` `start()` 函数 `_app` 改为 `app`，传递到 upload_file
- [ ] `upload_file()` 增加 app + task_id 参数
- [ ] `upload_file()` 错误时发射 `upload:error` 事件
- [ ] `upload_shard()` 增加 app + task_id 参数
- [ ] `upload_shard()` 首块上传包装到 `retry_upload_chunk()`
- [ ] `upload_shard()` 并发块上传包装到 `retry_upload_chunk()`
- [ ] `services/mod.rs` TODO 替换为 `pub mod retry_engine;`
- [ ] 添加 `use tauri::Emitter;` 导入
- [ ] 单元测试：指数退避计算正确性
- [ ] 单元测试：退避上限封顶
- [ ] 单元测试：抖动在 ±10% 范围内
- [ ] 单元测试：is_retryable 对每种 AppError 变体的分类
- [ ] 单元测试：RetryPolicy 默认值
- [ ] 单元测试：should_emit_warning 节流逻辑
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过
