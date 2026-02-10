# Story 3.2: 文件分块管理器

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-2 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 1-3 (Rust 后端模块骨架与错误处理基础) -- 已完成, Story 3-1 (API 抽象层与服务器发现) -- 已完成 |
| FRs 覆盖 | FR6 (大文件自动分片), FR7 (分片分块并发上传 — 数据模型部分) |
| NFRs 关联 | NFR12 (单文件隔离 — UploadTask 独立模型支撑) |

## User Story

As a 开发者,
I want 实现文件自动分片和分块切割功能,
So that 大文件可以按照 gigafile.nu 协议被切分为可上传的块。

---

## Acceptance Criteria

### AC-1: 上传数据模型定义

**Given** Rust 后端模块骨架已建立（Story 1-3），`models/mod.rs` 中有 `// TODO: Story 3.2 - pub mod upload;` 占位
**When** 创建 `models/upload.rs` 模块
**Then** 定义以下结构体：
- `UploadConfig` — 上传配置，包含 `lifetime: u32`（保留天数）
- `UploadTask` — 单文件上传任务，包含 `task_id: String`、`file_name: String`、`file_path: String`、`file_size: u64`、`shards: Vec<Shard>`、`status: UploadStatus`、`download_url: Option<String>`
- `Shard` — 逻辑分片，包含 `shard_index: u32`、`offset: u64`、`size: u64`、`chunks: Vec<Chunk>`、`upload_id: String`、`status: ShardStatus`、`download_url: Option<String>`
- `Chunk` — 上传块，包含 `chunk_index: u32`、`offset: u64`、`size: u64`、`status: ChunkStatus`
**And** 定义以下状态枚举：
- `UploadStatus` — `Pending | Uploading | Completed | Error`
- `ShardStatus` — `Pending | Uploading | Completed | Error`
- `ChunkStatus` — `Pending | Uploading | Completed | Error`
**And** 所有结构体和枚举标注 `#[serde(rename_all = "camelCase")]`（IPC 序列化）
**And** 所有结构体派生 `Debug, Clone, Serialize, Deserialize`
**And** 所有枚举额外派生 `PartialEq`（用于状态比较）
**And** `models/mod.rs` 中将 TODO 注释替换为 `pub mod upload;`

### AC-2: 小文件分块（单分片）

**Given** 一个待上传的文件，文件大小 <= 1GB（1_073_741_824 字节）
**When** 调用 `plan_chunks(file_size)` 时
**Then** 返回恰好 1 个 Shard（FR6）
**And** 该 Shard 的 `shard_index` 为 0，`offset` 为 0，`size` 等于文件大小
**And** Shard 内的 chunks 按 100MB（104_857_600 字节）切分（FR7）
**And** 最后一个 chunk 的 size 可小于 100MB
**And** 每个 Chunk 的 `offset` 为其在原文件中的绝对偏移量
**And** 每个 Chunk 的 `chunk_index` 从 0 开始递增
**And** 所有 chunks 的 size 之和等于文件大小

### AC-3: 大文件分块（多分片）

**Given** 一个待上传的文件，文件大小 > 1GB
**When** 调用 `plan_chunks(file_size)` 时
**Then** 文件按 1GB 切分为多个 Shard（FR6）
**And** 每个 Shard 的 `shard_index` 从 0 开始递增
**And** 每个 Shard 内部再按 100MB 切分为 chunks（FR7）
**And** 最后一个 Shard 的 size 可小于 1GB
**And** 最后一个 chunk 的 size 可小于 100MB
**And** 所有 Chunk 的 `offset` 为其在原文件中的绝对偏移量（非分片内偏移）
**And** 所有分片的 size 之和等于原文件大小
**And** 每个分片内所有 chunks 的 size 之和等于该分片的 size

### AC-4: chunk_manager 模块实现

**Given** `services/mod.rs` 中有 `// TODO: Story 3.2 - pub mod chunk_manager;` 占位
**When** 创建 `services/chunk_manager.rs` 模块
**Then** 定义公开常量 `SHARD_SIZE: u64 = 1_073_741_824`（1 GiB）和 `CHUNK_SIZE: u64 = 104_857_600`（100 MiB）
**And** 实现 `pub fn plan_chunks(file_size: u64) -> Vec<Shard>` 函数
**And** 函数为纯计算，不执行任何文件 I/O（满足"不一次性读取整个文件到内存"的要求）
**And** 返回的 Shard 的 `upload_id` 为空字符串（由 upload_engine 在 Story 3.3 中填充）
**And** 返回的 `download_url` 为 `None`（由 upload_engine 在上传完成后填充）
**And** 返回的所有 status 字段为 `Pending`
**And** 当 `file_size` 为 0 时，返回空 `Vec`（无内容可上传）
**And** `services/mod.rs` 中将 TODO 注释替换为 `pub mod chunk_manager;`

### AC-5: 单元测试

**Given** 数据模型和 chunk_manager 实现完成
**When** 执行 `cargo test`
**Then** 包含以下测试覆盖：
- **小文件**（50 MiB = 52_428_800 字节）：1 shard, 1 chunk
- **中文件**（350 MiB = 367_001_600 字节）：1 shard, 4 chunks（3 个满块 + 1 个尾块）
- **大文件**（2.5 GiB = 2_684_354_560 字节）：3 shards，每个 shard 内有正确的 chunk 数量
- **恰好 100MB**（104_857_600 字节）：1 shard, 1 chunk，chunk size 恰好等于 CHUNK_SIZE
- **恰好 1GB**（1_073_741_824 字节）：1 shard（<= 1GB 属于单分片），11 chunks（10 个满块 + 1 个 25_165_824 字节尾块）
- **1GB + 1 字节**（1_073_741_825 字节）：2 shards（第一个 1GB，第二个 1 字节）
- **1 字节**：1 shard, 1 chunk（1 字节）
- **0 字节**：返回空 Vec
- **偏移连续性验证**：所有 chunks 的 offset + size 无缝覆盖整个文件，无间隙无重叠
- **数据模型构造**：验证 UploadTask、Shard、Chunk、UploadConfig 可正确构造
- **状态枚举**：验证 UploadStatus、ShardStatus、ChunkStatus 的 PartialEq 和 serde 序列化
**And** 所有测试不依赖文件系统或网络
**And** `cargo clippy` 无警告

---

## Technical Design

### 现状分析

Story 1-3 和 3-1 已完成以下基础设施：

- `src-tauri/src/models/mod.rs` — 模型入口，已有 `pub mod file;`，包含 TODO 占位 `// TODO: Story 3.2 - pub mod upload;`
- `src-tauri/src/models/file.rs` — `FileEntry` 结构体（`file_name`, `file_path`, `file_size`），已有 `#[serde(rename_all = "camelCase")]`
- `src-tauri/src/services/mod.rs` — 业务逻辑入口，包含 TODO 占位 `// TODO: Story 3.2 - pub mod chunk_manager;`
- `src-tauri/src/api/mod.rs` — 已定义 `ChunkUploadParams`（含 `data`, `chunk_index`, `total_chunks` 等字段）
- `src-tauri/src/error.rs` — 完整的 `AppError` 类型和 `Result<T>` 别名
- `src-tauri/Cargo.toml` — `serde = { version = "1", features = ["derive"] }` 和 `serde_json = "1"` 已配置

当前 `models/` 目录仅有 `mod.rs` 和 `file.rs`，`services/` 目录仅有 `mod.rs`。本 Story 将创建 `models/upload.rs` 和 `services/chunk_manager.rs`。

### 新增/修改模块

#### 1. `models/upload.rs` — 上传数据模型

```rust
use serde::{Deserialize, Serialize};

/// 上传配置，从前端通过 IPC 传入
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadConfig {
    pub lifetime: u32, // 保留天数: 3/5/7/14/30/60/100
}

/// 上传任务状态
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UploadStatus {
    Pending,
    Uploading,
    Completed,
    Error,
}

/// 逻辑分片状态
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShardStatus {
    Pending,
    Uploading,
    Completed,
    Error,
}

/// 上传块状态
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChunkStatus {
    Pending,
    Uploading,
    Completed,
    Error,
}

/// 单个上传块的元数据（不含实际文件数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    /// 分块在分片内的索引（对应 API 的 chunk 参数，从 0 开始）
    pub chunk_index: u32,
    /// 在原文件中的绝对字节偏移量（用于 seek 定位读取）
    pub offset: u64,
    /// 字节数
    pub size: u64,
    pub status: ChunkStatus,
}

/// 逻辑分片的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shard {
    pub shard_index: u32,
    /// 在原文件中的绝对字节偏移量
    pub offset: u64,
    /// 字节数
    pub size: u64,
    pub chunks: Vec<Chunk>,
    /// UUID v1 hex（32 字符），由 upload_engine 生成，chunk_manager 设为空字符串
    pub upload_id: String,
    pub status: ShardStatus,
    /// 该分片上传完成后服务端返回的下载链接
    pub download_url: Option<String>,
}

/// 单个文件的上传任务
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadTask {
    pub task_id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub shards: Vec<Shard>,
    pub status: UploadStatus,
    /// 文件级下载链接（单分片文件等同于 shard 链接）
    pub download_url: Option<String>,
}
```

#### 2. `services/chunk_manager.rs` — 分块规划器

```rust
use crate::models::upload::{Chunk, ChunkStatus, Shard, ShardStatus};

/// 逻辑分片大小: 1 GiB
pub const SHARD_SIZE: u64 = 1_073_741_824;
/// 上传块大小: 100 MiB
pub const CHUNK_SIZE: u64 = 104_857_600;

/// 根据文件大小规划分片和分块布局。
///
/// 纯计算函数，不执行任何文件 I/O。返回的 Shard 的 `upload_id` 为空字符串，
/// `status` 全部为 `Pending`，由上游 upload_engine 在启动上传时填充。
pub fn plan_chunks(file_size: u64) -> Vec<Shard> {
    if file_size == 0 {
        return Vec::new();
    }

    let mut shards = Vec::new();
    let mut file_offset: u64 = 0;
    let mut shard_index: u32 = 0;

    while file_offset < file_size {
        let shard_size = std::cmp::min(SHARD_SIZE, file_size - file_offset);
        let chunks = plan_shard_chunks(file_offset, shard_size);

        shards.push(Shard {
            shard_index,
            offset: file_offset,
            size: shard_size,
            chunks,
            upload_id: String::new(),
            status: ShardStatus::Pending,
            download_url: None,
        });

        file_offset += shard_size;
        shard_index += 1;
    }

    shards
}

/// 为单个分片规划内部分块布局。
fn plan_shard_chunks(shard_file_offset: u64, shard_size: u64) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let mut chunk_offset: u64 = 0;
    let mut chunk_index: u32 = 0;

    while chunk_offset < shard_size {
        let chunk_size = std::cmp::min(CHUNK_SIZE, shard_size - chunk_offset);
        chunks.push(Chunk {
            chunk_index,
            offset: shard_file_offset + chunk_offset, // 文件绝对偏移
            size: chunk_size,
            status: ChunkStatus::Pending,
        });
        chunk_offset += chunk_size;
        chunk_index += 1;
    }

    chunks
}
```

### 数据流

```
models/file.rs::FileEntry (Epic 2 已有)
  → file_name, file_path, file_size

services/chunk_manager.rs::plan_chunks(file_size)
  → Vec<Shard> (纯元数据: offset, size, chunk_index)

[Story 3.3] upload_engine 构造 UploadTask:
  → task_id: UUID 生成
  → file_name, file_path, file_size: 来自 FileEntry
  → shards: 来自 plan_chunks()，填充 upload_id
  → status: Pending

[Story 3.3] upload_engine 上传时:
  → 使用 Chunk.offset + Chunk.size 定位文件读取
  → 构造 api::ChunkUploadParams:
      data     ← File::seek(chunk.offset) + read(chunk.size)
      chunk_index   ← chunk.chunk_index
      total_chunks  ← shard.chunks.len() as u32
      upload_id     ← shard.upload_id
      ...
```

### 与 `api::ChunkUploadParams` 的映射关系

| `models::Chunk` 字段 | `api::ChunkUploadParams` 字段 | 说明 |
|----------------------|------------------------------|------|
| `chunk_index` | `chunk_index` | 直接对应 |
| `offset` + `size` | `data` | upload_engine 读取文件字节后填入 |
| — | `total_chunks` | `shard.chunks.len() as u32` |
| — | `file_name` | 来自 UploadTask |
| — | `upload_id` | 来自 Shard（engine 生成） |
| — | `lifetime` | 来自 UploadConfig |
| — | `server_url` | 来自 discover_server() |
| — | `cookie_jar` | engine 按 shard 创建 |

### 设计决策

1. **纯计算无 I/O**：`plan_chunks()` 只做数学运算，不打开或读取文件。满足 "分块操作不一次性读取整个文件到内存" 要求。实际的文件按需读取在 upload_engine（Story 3.3）中执行。

2. **绝对偏移量**：`Chunk.offset` 存储的是文件级绝对偏移量，而非分片内相对偏移。这简化了 upload_engine 的文件读取逻辑——直接 `File::seek(SeekFrom::Start(chunk.offset))` 即可定位。

3. **upload_id 延迟填充**：`Shard.upload_id` 在 chunk_manager 中设为空字符串，由 upload_engine（Story 3.3）在启动上传时生成 UUID v1 hex 填入。分块规划不应关心会话管理。

4. **download_url 延迟填充**：`Shard.download_url` 和 `UploadTask.download_url` 在 chunk_manager 中设为 `None`，由上传完成后（Story 3.3/3.6）从服务端响应中填充。

5. **0 字节文件返回空 Vec**：无内容可上传，由 upload_engine 决定如何处理（跳过或报错）。

6. **Shard 级 download_url**：gigafile.nu 每个分片是独立上传会话，最后一个 chunk 的响应包含该分片的下载链接。多分片文件会产生多个链接（每分片一个）。`UploadTask.download_url` 为文件级汇总链接。

7. **三套状态枚举分离**：`UploadStatus`、`ShardStatus`、`ChunkStatus` 虽然值相同，但保持独立类型以获得编译期类型安全——避免意外将 ChunkStatus 赋值给 ShardStatus。

---

## Tasks

### Task 1: 创建上传数据模型

**文件:** `src-tauri/src/models/upload.rs`（新建）、`src-tauri/src/models/mod.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 创建 `src-tauri/src/models/upload.rs` 文件
1.2. 定义 `UploadConfig` 结构体（`lifetime: u32`），派生 `Debug, Clone, Serialize, Deserialize`，标注 `#[serde(rename_all = "camelCase")]`
1.3. 定义 `UploadStatus` 枚举（`Pending, Uploading, Completed, Error`），派生 `Debug, Clone, PartialEq, Serialize, Deserialize`，标注 `#[serde(rename_all = "camelCase")]`
1.4. 定义 `ShardStatus` 枚举（同 UploadStatus 四个值），同样的派生和标注
1.5. 定义 `ChunkStatus` 枚举（同上），同样的派生和标注
1.6. 定义 `Chunk` 结构体（`chunk_index: u32`, `offset: u64`, `size: u64`, `status: ChunkStatus`），派生和标注同上（不含 PartialEq）
1.7. 定义 `Shard` 结构体（`shard_index: u32`, `offset: u64`, `size: u64`, `chunks: Vec<Chunk>`, `upload_id: String`, `status: ShardStatus`, `download_url: Option<String>`），派生和标注同上
1.8. 定义 `UploadTask` 结构体（`task_id: String`, `file_name: String`, `file_path: String`, `file_size: u64`, `shards: Vec<Shard>`, `status: UploadStatus`, `download_url: Option<String>`），派生和标注同上
1.9. 在 `models/mod.rs` 中将 `// TODO: Story 3.2 - pub mod upload;` 替换为 `pub mod upload;`

### Task 2: 实现 chunk_manager 分块规划器

**文件:** `src-tauri/src/services/chunk_manager.rs`（新建）、`src-tauri/src/services/mod.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 创建 `src-tauri/src/services/chunk_manager.rs` 文件
2.2. 添加 `use crate::models::upload::{Chunk, ChunkStatus, Shard, ShardStatus};`
2.3. 定义公开常量 `SHARD_SIZE: u64 = 1_073_741_824`（1 GiB）
2.4. 定义公开常量 `CHUNK_SIZE: u64 = 104_857_600`（100 MiB）
2.5. 实现 `pub fn plan_chunks(file_size: u64) -> Vec<Shard>`：
  - 0 字节返回空 Vec
  - 外层循环按 SHARD_SIZE 切分 shards
  - 内层循环按 CHUNK_SIZE 切分 chunks
  - 所有 offset 为文件级绝对偏移
  - 所有 status 为 Pending，upload_id 为空字符串，download_url 为 None
2.6. 提取 `fn plan_shard_chunks(shard_file_offset: u64, shard_size: u64) -> Vec<Chunk>` 私有辅助函数
2.7. 在 `services/mod.rs` 中将 `// TODO: Story 3.2 - pub mod chunk_manager;` 替换为 `pub mod chunk_manager;`

### Task 3: 编写单元测试 — 数据模型

**文件:** `src-tauri/src/models/upload.rs`（`#[cfg(test)] mod tests` 区块）
**依赖:** Task 1

**Subtasks:**

3.1. 测试 `UploadConfig` 构造和 serde 序列化/反序列化（验证 `camelCase` JSON 输出）
3.2. 测试 `UploadTask` 构造（所有字段类型兼容性）
3.3. 测试 `Shard` 构造（验证 `download_url: None`, `upload_id: ""`）
3.4. 测试 `Chunk` 构造
3.5. 测试三个状态枚举的 `PartialEq` 比较
3.6. 测试状态枚举的 serde 序列化（验证 `"pending"`, `"uploading"`, `"completed"`, `"error"` 的 camelCase 输出）

### Task 4: 编写单元测试 — chunk_manager 分块逻辑

**文件:** `src-tauri/src/services/chunk_manager.rs`（`#[cfg(test)] mod tests` 区块）
**依赖:** Task 2

**Subtasks:**

4.1. 测试小文件（50 MiB = 52_428_800 bytes）：1 shard, 1 chunk, chunk size = 52_428_800
4.2. 测试中文件（350 MiB = 367_001_600 bytes）：1 shard, 4 chunks, 前 3 个 104_857_600 + 尾块 52_428_800
4.3. 测试大文件（2.5 GiB = 2_684_354_560 bytes）：3 shards, 验证每个 shard 的 chunk 数量和 size 之和
4.4. 测试恰好 100MB（104_857_600 bytes）：1 shard, 1 chunk, chunk size = CHUNK_SIZE
4.5. 测试恰好 1GB（1_073_741_824 bytes）：1 shard, 11 chunks（10 x 104_857_600 + 25_165_824）
4.6. 测试 1GB + 1 字节（1_073_741_825 bytes）：2 shards（shard 0: 1GB, shard 1: 1 byte）
4.7. 测试 1 字节：1 shard, 1 chunk（1 byte）
4.8. 测试 0 字节：返回空 Vec
4.9. 测试偏移连续性：验证所有 chunks 的 (offset, offset+size) 无缝覆盖文件 [0, file_size)
4.10. 验证所有返回的 status 为 Pending，upload_id 为空字符串

### Task 5: 代码质量验证

**文件:** 无新文件
**依赖:** Task 3, Task 4

**Subtasks:**

5.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
5.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
5.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过（含 Story 3-1 现有测试）

---

## Task 依赖顺序

```
Task 1 (数据模型) ──┬──> Task 2 (chunk_manager 实现)
                    │           │
                    │           v
                    ├──> Task 3 (模型测试)
                    │           │
                    v           v
              Task 4 (chunk_manager 测试)
                         │
                         v
                  Task 5 (代码质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/models/upload.rs` | `UploadConfig`、`UploadTask`、`Shard`、`Chunk` 结构体 + 状态枚举 + 单元测试 |
| `src-tauri/src/services/chunk_manager.rs` | `plan_chunks()` 分块规划函数 + 常量 + 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/src/models/mod.rs` | 将 `// TODO: Story 3.2 - pub mod upload;` 替换为 `pub mod upload;` |
| `src-tauri/src/services/mod.rs` | 将 `// TODO: Story 3.2 - pub mod chunk_manager;` 替换为 `pub mod chunk_manager;` |

### 禁止修改

- `src-tauri/src/api/` — API 层已在 Story 3-1 完成，本 Story 不涉及 HTTP 交互
- `src-tauri/src/error.rs` — 已有 `AppError` 和所有必要的 `From` 实现
- `src-tauri/src/lib.rs` — 本 Story 不新增 Tauri command
- `src-tauri/src/commands/` — 上传 command 属于 Story 3.3
- `src-tauri/src/storage/` — 不涉及持久化
- `src-tauri/src/models/file.rs` — 已有的 FileEntry 模型不需修改
- `src-tauri/Cargo.toml` — 不需要新增依赖（serde 已有）
- `src/` — 本 Story 为纯 Rust 后端实现，不涉及前端变更

---

## Technical Notes

### 两级分块协议参考

根据架构文档和技术研究报告，gigafile.nu 使用两级分块协议：

```
原文件 (e.g., 2.5 GiB)
  ├── Shard 0 (1 GiB) ── 独立上传会话 (upload_id_0, cookie_jar_0)
  │     ├── Chunk 0 (100 MiB) ← 串行发送（建立 Cookie 会话）
  │     ├── Chunk 1 (100 MiB) ← 并行发送
  │     ├── ...
  │     └── Chunk 10 (~24 MiB)  ← 最后一块返回 download_url
  ├── Shard 1 (1 GiB) ── 独立上传会话 (upload_id_1, cookie_jar_1)
  │     ├── Chunk 0 (100 MiB) ← 串行
  │     └── ...
  └── Shard 2 (0.5 GiB) ── 独立上传会话 (upload_id_2, cookie_jar_2)
        ├── Chunk 0 (100 MiB) ← 串行
        └── ...
```

每个 shard 是独立的上传会话，有自己的 `upload_id`（UUID）和 `cookie_jar`。首块串行发送以建立服务端 Cookie 会话，后续块并行发送（默认 8 并发）。

### Shard 内 chunk 数量参考表

| 文件大小 | Shards | Shard 0 chunks | 最后 Shard chunks | 总 chunks |
|---------|--------|----------------|-------------------|-----------|
| 50 MiB  | 1      | 1              | —                 | 1         |
| 100 MiB | 1      | 1              | —                 | 1         |
| 350 MiB | 1      | 4              | —                 | 4         |
| 1 GiB   | 1      | 11             | —                 | 11        |
| 2.5 GiB | 3      | 11             | 6                 | 28        |
| 5 GiB   | 5      | 11             | 11                | 55        |

### models::upload 与 api::mod 类型的职责分离

- **`models::upload`**（本 Story）：上传任务的**生命周期数据模型**——描述文件如何被分片分块、各部分的状态和进度。不含实际文件数据。
- **`api::ChunkUploadParams`**（Story 3-1 已定义）：单次 HTTP 请求的**参数容器**——包含实际的文件数据 `Vec<u8>` 和 API 所需的所有字段。
- **桥接**：upload_engine（Story 3.3）使用 `models::Chunk` 的 offset/size 读取文件字节，然后构造 `api::ChunkUploadParams` 发起上传。

### 与后续 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.3（上传引擎核心） | 消费 `plan_chunks()` 返回的 `Vec<Shard>` 构建 `UploadTask`，生成 `upload_id`，使用 `Chunk.offset/size` 读取文件数据 |
| Story 3.4（重试引擎） | 使用 `ChunkStatus` 跟踪块级重试状态 |
| Story 3.5（进度聚合） | 使用 `ShardStatus`/`ChunkStatus` 计算分片级和文件级进度百分比 |
| Story 3.6（链接产出） | 填充 `Shard.download_url` 和 `UploadTask.download_url` |

---

## Definition of Done

- [ ] `models/upload.rs` 定义 `UploadConfig` 结构体（`lifetime` 字段）
- [ ] `models/upload.rs` 定义 `UploadTask` 结构体（7 个字段: task_id, file_name, file_path, file_size, shards, status, download_url）
- [ ] `models/upload.rs` 定义 `Shard` 结构体（7 个字段: shard_index, offset, size, chunks, upload_id, status, download_url）
- [ ] `models/upload.rs` 定义 `Chunk` 结构体（4 个字段: chunk_index, offset, size, status）
- [ ] `models/upload.rs` 定义 `UploadStatus`、`ShardStatus`、`ChunkStatus` 三个状态枚举
- [ ] 所有结构体和枚举标注 `#[serde(rename_all = "camelCase")]`
- [ ] 所有枚举派生 `PartialEq`
- [ ] `models/mod.rs` 中 TODO 注释替换为 `pub mod upload;`
- [ ] `services/chunk_manager.rs` 定义 `SHARD_SIZE`（1 GiB）和 `CHUNK_SIZE`（100 MiB）常量
- [ ] `services/chunk_manager.rs` 实现 `plan_chunks()` 纯计算函数，无文件 I/O
- [ ] `plan_chunks()` 对 <= 1GB 文件返回 1 个 shard
- [ ] `plan_chunks()` 对 > 1GB 文件返回多个 shard（按 1GB 切分）
- [ ] 每个 shard 内部按 100MB 切分 chunks
- [ ] 所有 Chunk.offset 为文件级绝对偏移量
- [ ] `plan_chunks(0)` 返回空 Vec
- [ ] `services/mod.rs` 中 TODO 注释替换为 `pub mod chunk_manager;`
- [ ] 单元测试覆盖：小文件、中文件、大文件、边界值（100MB, 1GB, 1GB+1）、0 字节、1 字节、偏移连续性
- [ ] 数据模型单元测试覆盖构造和 serde 序列化
- [ ] 所有测试不依赖文件系统或网络
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过

---

## Review History

### Review Round 1 — 2026-02-11

**Reviewer:** Story Reviewer Agent (BMM PM persona)
**Verdict:** PASSED

| # | Checklist Item | Result | Feedback |
|---|----------------|--------|----------|
| RC-1 | AC clarity | PASS | 5 个 AC 均具备明确的 Given/When/Then 结构，字段名、类型、字节常量值全部精确指定，可直接编写测试断言 |
| RC-2 | Task sequence | PASS | Task 1→2→3→4→5 的 DAG 无环依赖，Task 3/4 可部分并行，依赖图与文档一致 |
| RC-3 | Technical feasibility | PASS | 已验证 models/mod.rs:8 和 services/mod.rs:9 的 TODO 占位符存在；api/mod.rs ChunkUploadParams 字段与映射表完全匹配；serde derive 已在 Cargo.toml 中配置；纯计算逻辑无技术风险 |
| RC-4 | Requirement consistency | PASS | AC-2 (<=1GB → 1 shard) 与 AC-3 (>1GB → 多 shard) 边界清晰无矛盾；AC-5 测试用例覆盖边界值确认；Epic 中的 `split()` 函数名在 Story 中细化为 `plan_chunks()` 属正常 Story 级别细化 |
| RC-5 | Scope sizing | PASS | 2 个新文件 + 2 个单行修改，纯数学计算逻辑约 130 行实现 + 150 行测试，适合单开发周期 |
| RC-6 | Dependency documentation | PASS | 前置依赖 Story 1-3、3-1 明确标注且已完成；下游 Story 3.3/3.4/3.5/3.6 的消费关系在"与后续 Story 的关系"表中完整记录 |
| RC-7 | File scope declaration | PASS | 新增/修改/禁止修改文件列表完整且合理，禁止修改的文件附有理由 |
| RC-8 | API/method existence | PASS | 所有技术引用已通过代码检查验证：models/mod.rs TODO 占位符(line 8)、services/mod.rs TODO 占位符(line 9)、api::ChunkUploadParams 8 个字段(lines 16-25)、models/file.rs::FileEntry(lines 9-13)、error::AppError 类型(line 12) |

**API Verification Details:**
- `ChunkUploadParams.data: Vec<u8>` — confirmed at api/mod.rs:17
- `ChunkUploadParams.chunk_index: u32` — confirmed at api/mod.rs:20
- `ChunkUploadParams.total_chunks: u32` — confirmed at api/mod.rs:21
- `ChunkUploadParams.upload_id: String` — confirmed at api/mod.rs:19
- `ChunkUploadParams.file_name: String` — confirmed at api/mod.rs:18
- `ChunkUploadParams.lifetime: u32` — confirmed at api/mod.rs:22
- `ChunkUploadParams.server_url: String` — confirmed at api/mod.rs:23
- `ChunkUploadParams.cookie_jar: Arc<reqwest::cookie::Jar>` — confirmed at api/mod.rs:24
- `#[serde(rename_all = "camelCase")]` on FileEntry — confirmed at models/file.rs:8
- `// TODO: Story 3.2 - pub mod upload;` — confirmed at models/mod.rs:8
- `// TODO: Story 3.2 - pub mod chunk_manager;` — confirmed at services/mod.rs:9
