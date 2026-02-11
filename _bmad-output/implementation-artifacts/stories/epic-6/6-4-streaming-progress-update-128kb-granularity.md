# Story 6.4: 上传进度流式更新（128KB 粒度）

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-4 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | 无（基于现有 Story 3.5 进度聚合基础设施） |
| FRs 覆盖 | 无（体验优化，非新增功能） |
| NFRs 关联 | NFR2（上传进度更新粒度不低于每 128KB） |

## User Story

As a 用户,
I want 上传大文件时进度条平滑推进而非长时间静止后跳跃,
So that 我能直觉感受到上传在持续进行，不会误以为上传卡住。

---

## Acceptance Criteria

### AC-1: 进度条平滑更新，无长时间静止

**Given** 用户上传一个 2.9GB 文件（3 个逻辑分片，33 个 100MB chunks）
**When** 上传进行中
**Then** 进度条平滑更新，无超过 2 秒的静止期
**And** 进度更新粒度为每 128KB（NFR2），而非每 100MB chunk 完成后

### AC-2: upload_chunk 使用流式 Body 发送数据

**Given** 上传引擎通过 reqwest 发送 HTTP 请求
**When** 发送 100MB chunk 数据
**Then** 使用流式 Body（`reqwest::Body::wrap_stream` 或等效的 `reqwest::Body::new(stream)`），每发送 128KB 调用 `counter.fetch_add(131_072, Ordering::Relaxed)`
**And** 现有 50ms debounce 聚合机制（`ProgressAggregator::start_emitter`）保持不变

### AC-3: 多线程并发进度更新线程安全

**Given** 多个 chunk 并发上传（默认 8 并发）
**When** 多线程同时更新 `AtomicU64` 计数器
**Then** 原子操作保证线程安全，进度汇总准确无丢失
**And** 所有并发线程共享同一个 `Arc<AtomicU64>` shard 计数器（已由 `ProgressAggregator::get_shard_counter` 提供）

### AC-4: upload_engine 移除粗粒度 chunk 级 fetch_add

**Given** 流式 Body 已在 API 层实现 128KB 粒度进度更新
**When** chunk 上传完成
**Then** `upload_engine.rs` 中原有的 chunk 完成后 `counter.fetch_add(chunk_size)` 调用被移除
**And** 进度完全由 API 层流式回调驱动，避免重复计数

---

## Technical Design

### 现状分析

当前进度更新流程：

```
upload_engine.rs (upload_shard)
  ├── 首块上传完成后: counter.fetch_add(first_chunk_size)    ← 一次性加 100MB (第316-318行)
  ├── 并发块上传完成后: counter.fetch_add(chunk_size)        ← 一次性加 100MB (第398-400行)
  └── ProgressAggregator 每 50ms 读取 counter 并 emit
```

问题：进度计数器只在整个 chunk（100MB）上传完成后才更新一次。以 10MB/s 的上传速度计算，一个 100MB chunk 需要 ~10 秒才会触发一次进度更新，用户看到的进度条会静止 10 秒后突然跳跃。

### 修复方案

将进度更新从"chunk 完成后一次性累加"改为"HTTP Body 发送过程中每 128KB 实时累加"：

```
api/v1.rs (upload_chunk)
  ├── 接收 Arc<AtomicU64> 进度计数器
  ├── 将 chunk 数据包装为自定义 Stream
  │   └── 每 yield 128KB 数据: counter.fetch_add(131_072)    ← 每 128KB 更新一次
  └── 使用 reqwest::Body::wrap_stream(stream) 作为 multipart Part

upload_engine.rs (upload_shard)
  ├── 将 shard 的 AtomicU64 计数器传入 ChunkUploadParams
  └── 移除原有的 chunk 完成后 fetch_add 调用

api/mod.rs (ChunkUploadParams)
  └── 新增 progress_counter: Option<Arc<AtomicU64>> 字段
```

### 流式 Body 实现细节

在 `api/v1.rs` 中实现一个辅助函数，将 `Vec<u8>` 转换为带进度回调的 `Stream`：

```rust
use futures_util::stream;
use bytes::Bytes;

const PROGRESS_CHUNK_SIZE: usize = 128 * 1024; // 128KB

fn progress_stream(
    data: Vec<u8>,
    counter: Option<Arc<AtomicU64>>,
) -> impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> {
    let chunks: Vec<Bytes> = data
        .chunks(PROGRESS_CHUNK_SIZE)
        .map(|chunk| Bytes::copy_from_slice(chunk))
        .collect();

    stream::iter(chunks.into_iter().map(move |chunk| {
        if let Some(ref c) = counter {
            c.fetch_add(chunk.len() as u64, Ordering::Relaxed);
        }
        Ok(chunk)
    }))
}
```

关键点：
- 使用 `data.chunks(131_072)` 将 `Vec<u8>` 切分为 128KB 片段
- 每个片段 yield 时调用 `counter.fetch_add(actual_chunk_len)`，使用实际长度而非固定 131072（处理末尾不足 128KB 的情况）
- `reqwest::multipart::Part::stream(Body::wrap_stream(progress_stream(...)))` 替代原有的 `Part::bytes(data)`
- 需要显式设置 Content-Length，因为 stream body 默认不携带 Content-Length

### multipart Part 构建变更

```rust
// 当前 (Part::bytes)
let part = reqwest::multipart::Part::bytes(params.data)
    .file_name("blob")
    .mime_str("application/octet-stream")?;

// 修改后 (Part::stream + Content-Length)
let data_len = params.data.len() as u64;
let body = reqwest::Body::wrap_stream(progress_stream(params.data, params.progress_counter));
let part = reqwest::multipart::Part::stream_with_length(body, data_len)
    .file_name("blob")
    .mime_str("application/octet-stream")?;
```

使用 `Part::stream_with_length` 而非 `Part::stream`，确保 multipart form 包含正确的 Content-Length（NFR7 完整性校验）。

### 设计决策

1. **进度计数器通过 `ChunkUploadParams` 传递而非全局状态**：遵循项目规范"No global mutable state — use function params or Tauri managed state"。将 `Option<Arc<AtomicU64>>` 作为参数传入，API 层无需感知 `ProgressAggregator` 的存在。

2. **使用 `Option<Arc<AtomicU64>>` 而非 `Arc<AtomicU64>`**：允许在不需要进度追踪的场景（如单元测试）中传入 `None`，保持 API 的灵活性。

3. **使用 `fetch_add(actual_len)` 而非 `fetch_add(131_072)`**：最后一个 128KB 切片可能不足 128KB，使用实际长度确保进度计算精确。

4. **聚合器无需改动**：`progress.rs` 中的 `start_emitter` 已经每 50ms 读取 `AtomicU64` 并 emit，128KB 粒度的更新自然被 50ms 定时器采样并推送。

5. **新增 `bytes` 和 `futures-util` 依赖**：`bytes::Bytes` 用于零拷贝切片，`futures_util::stream::iter` 用于构造异步 Stream。需确认 `Cargo.toml` 中是否已有这些依赖（reqwest 通常已传递依赖 bytes）。

---

## Tasks

### Task 1: 修改 ChunkUploadParams 添加进度计数器字段

**依赖:** 无

**Subtasks:**

1.1. 在 `src-tauri/src/api/mod.rs` 的 `ChunkUploadParams` 结构体中，添加字段 `pub progress_counter: Option<Arc<AtomicU64>>`
1.2. 在文件顶部添加 `use std::sync::atomic::AtomicU64;` import（`Arc` 已有）

**验证:** `cargo check` 编译通过（会因使用处未传入新字段而报错，Task 3 修复）

### Task 2: 在 api/v1.rs 实现流式 Body 进度回调

**依赖:** Task 1

**Subtasks:**

2.1. 在 `src-tauri/Cargo.toml` 中确认 `futures-util` 依赖存在，如不存在则添加（`bytes` 通常由 reqwest 传递依赖，无需额外添加）
2.2. 在 `src-tauri/src/api/v1.rs` 顶部添加必要的 import：
   - `use std::sync::atomic::{AtomicU64, Ordering};`
   - `use std::sync::Arc;`
   - `use futures_util::stream;`
   - `use bytes::Bytes;`
2.3. 在 `GigafileApiV1` impl 块外添加常量 `const PROGRESS_CHUNK_SIZE: usize = 128 * 1024;`
2.4. 在 `GigafileApiV1` impl 块外添加辅助函数 `progress_stream(data: Vec<u8>, counter: Option<Arc<AtomicU64>>) -> impl Stream<Item = Result<Bytes, std::io::Error>>`，逻辑如 Technical Design 所述
2.5. 修改 `upload_chunk()` 方法中的 multipart Part 构建：
   - 将 `Part::bytes(params.data)` 替换为 `Part::stream_with_length(Body::wrap_stream(progress_stream(params.data, params.progress_counter)), data_len)`
   - 在构建 Part 前记录 `let data_len = params.data.len() as u64;`（必须在 `params.data` 被 move 之前）

**验证:** `cargo check` 编译通过；流式 Body 正确携带 Content-Length

### Task 3: 修改 upload_engine.rs 传入计数器并移除粗粒度更新

**依赖:** Task 1, Task 2

**Subtasks:**

3.1. 在 `upload_shard()` 函数中，修改首块上传的 `ChunkUploadParams` 构造（约第 297-306 行），添加 `progress_counter: counter.clone()` 字段
3.2. 移除首块上传成功后的粗粒度进度更新代码（第 316-318 行）：
   ```rust
   // 删除以下代码
   if let Some(ref c) = counter {
       c.fetch_add(first_chunk_size, Ordering::Relaxed);
   }
   ```
3.3. 在并发块上传的 `ChunkUploadParams` 构造（约第 381-390 行），添加 `progress_counter: progress_counter.clone()` 字段
3.4. 移除并发块上传成功后的粗粒度进度更新代码（第 397-400 行）：
   ```rust
   // 删除以下代码
   if let Some(ref c) = progress_counter {
       c.fetch_add(chunk_size, Ordering::Relaxed);
   }
   ```

**验证:** `cargo check` 编译通过；不再有 chunk 完成后的 `fetch_add` 调用

### Task 4: 编译验证与单元测试更新

**依赖:** Task 3

**Subtasks:**

4.1. 运行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
4.2. 更新 `api/v1.rs` 中 `test_chunk_upload_params_construction` 测试，为 `ChunkUploadParams` 添加 `progress_counter: None` 字段
4.3. 在 `api/v1.rs` tests 模块中添加 `test_progress_stream_128kb_granularity` 测试：
   - 构造一个 300KB 的 `Vec<u8>` + `Arc<AtomicU64>` 计数器
   - 调用 `progress_stream()` 并消费所有 stream items
   - 断言计数器最终值等于 300 * 1024
   - 断言 stream 产出 3 个 items（128KB + 128KB + 44KB）
4.4. 在 `api/v1.rs` tests 模块中添加 `test_progress_stream_no_counter` 测试：
   - 传入 `None` 作为计数器
   - 确认 stream 正常产出数据，不 panic
4.5. 运行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过

**验证:** `cargo clippy` 无警告，`cargo test` 全部通过

### Task 5: 手动验证（人工测试）

**依赖:** Task 4

**Subtasks:**

5.1. 运行 `pnpm tauri dev`，上传一个 500MB+ 的文件
5.2. 观察进度条是否平滑推进，无超过 2 秒的静止期
5.3. 确认上传完成后进度达到 100%，链接正常产出
5.4. 上传一个小文件（< 100MB），确认进度和链接正常
5.5. 多文件并发上传，确认各文件进度独立、准确、无丢失

---

## Task 依赖顺序

```
Task 1 (ChunkUploadParams 添加字段)
    |
    v
Task 2 (api/v1.rs 流式 Body 实现)
    |
    v
Task 3 (upload_engine.rs 传入计数器 + 移除粗粒度更新)
    |
    v
Task 4 (编译验证 + 单元测试)
    |
    v
Task 5 (手动验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/api/mod.rs` | `ChunkUploadParams` 添加 `progress_counter: Option<Arc<AtomicU64>>` 字段 |
| `src-tauri/src/api/v1.rs` | 添加 `progress_stream()` 辅助函数；`upload_chunk()` 使用 `Part::stream_with_length` 替代 `Part::bytes`；更新测试 |
| `src-tauri/src/services/upload_engine.rs` | 传入 `progress_counter` 到 `ChunkUploadParams`；移除 chunk 完成后的 `fetch_add` 调用 |
| `src-tauri/Cargo.toml` | 添加 `futures-util` 依赖（如尚未存在） |

### 禁止修改

- `src-tauri/src/services/progress.rs` -- 聚合器逻辑无需改动，50ms 定时器自然采样 128KB 粒度更新
- `src-tauri/src/models/upload.rs` -- 数据模型无需改动
- `src-tauri/src/commands/` -- IPC 层无需改动
- `src/` -- 前端代码无需改动（进度事件 payload 结构不变）

---

## Technical Notes

### reqwest multipart Part::stream_with_length vs Part::stream

`Part::stream(body)` 不设置 Content-Length，服务器可能拒绝没有 Content-Length 的 multipart part。`Part::stream_with_length(body, len)` 显式设置已知长度，确保 NFR7（Content-Length 校验）仍然满足。这是从 `Part::bytes()` 迁移到流式 Body 时必须注意的关键点。

### AtomicU64 fetch_add 语义

`fetch_add(val, Ordering::Relaxed)` 是原子操作，多线程并发调用保证不丢失更新。`Relaxed` ordering 足够，因为进度计数器不需要与其他内存操作建立 happens-before 关系——聚合器只是周期性读取近似值。

### 128KB vs 131072

128 * 1024 = 131,072 bytes。在 Story AC 和 Epic 中 `131_072` 和 `128KB` 可互换使用，实际代码使用 `128 * 1024` 常量以提高可读性。

---

## Definition of Done

- [ ] `ChunkUploadParams` 包含 `progress_counter: Option<Arc<AtomicU64>>` 字段
- [ ] `api/v1.rs` 实现 `progress_stream()` 函数，每 128KB yield 一次并更新计数器
- [ ] `upload_chunk()` 使用 `Part::stream_with_length` 发送流式 Body
- [ ] `upload_engine.rs` 将 shard 计数器传入 `ChunkUploadParams`
- [ ] `upload_engine.rs` 中首块和并发块的 `fetch_add(chunk_size)` 调用已移除
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 全部通过（含新增的 progress_stream 测试）
- [ ] 上传 500MB+ 文件时进度条平滑推进，无超过 2 秒静止
- [ ] 上传完成后进度 100%，链接正常产出
- [ ] 多文件并发上传进度独立且准确
