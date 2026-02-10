# Story 3.1: gigafile.nu API 抽象层与服务器发现

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 3-1 |
| Epic | Epic 3: 核心上传引擎与链接产出 |
| 前置依赖 | Story 1-3 (Rust 后端模块骨架与错误处理基础) -- 已完成 |
| FRs 覆盖 | FR10 (动态服务器发现) |
| NFRs 关联 | NFR6 (API 可替换), NFR7 (Content-Length 校验), NFR8 (动态服务器发现不硬编码) |

## User Story

As a 开发者,
I want 实现 gigafile.nu API 的抽象接口和服务器动态发现功能,
So that 上传引擎可以通过统一接口与 gigafile.nu 通信，且 API 变更时只需修改实现层。

---

## Acceptance Criteria

### AC-1: GigafileApiV1 结构体实现 GigafileApi trait

**Given** Rust 后端模块骨架已建立（Story 1-3），`api/mod.rs` 中已定义 `GigafileApi` trait 骨架
**When** 创建 `api/v1.rs` 模块
**Then** 定义 `GigafileApiV1` 结构体，持有 `reqwest::Client` 实例
**And** `GigafileApiV1` 实现 `GigafileApi` trait 的所有三个方法（`discover_server`、`upload_chunk`、`verify_upload`）
**And** 提供 `GigafileApiV1::new()` 构造函数，内部创建配置好的 reqwest Client
**And** `api/mod.rs` 中添加 `pub mod v1;` 导出

### AC-2: discover_server() 动态服务器发现

**Given** `GigafileApiV1` 实例已创建
**When** 调用 `discover_server()` 方法
**Then** 通过 HTTP GET 请求 `https://gigafile.nu/` 首页（FR10）
**And** 从返回的 HTML 中使用正则表达式 `r#"var server = "(.+?)""#` 提取当前活跃上传服务器主机名
**And** 返回完整的服务器 URL（如 `https://46.gigafile.nu`）
**And** 服务器 URL 不硬编码，每次调用都动态获取（NFR8）
**And** 如果 HTML 中未找到 server 变量，返回 `AppError::Api("Failed to extract server URL from homepage HTML")`
**And** 如果网络请求失败，返回 `AppError::Network` 错误

### AC-3: upload_chunk() 方法签名与参数定义

**Given** `GigafileApi` trait 中的 `upload_chunk()` 占位签名
**When** 完善方法签名和参数类型
**Then** `ChunkUploadParams` 结构体包含以下字段：
- `data: Vec<u8>` -- 分块二进制数据
- `file_name: String` -- 原始文件名
- `upload_id: String` -- 上传会话唯一标识符（UUID v1 hex，32 字符）
- `chunk_index: u32` -- 当前分块编号（从 0 开始）
- `total_chunks: u32` -- 总分块数
- `lifetime: u32` -- 文件保留天数
- `server_url: String` -- 已发现的上传服务器 URL
- `cookie_jar: Arc<reqwest::cookie::Jar>` -- 用于会话 Cookie 管理的共享 cookie jar
**And** `ChunkUploadResponse` 结构体包含以下字段：
- `status: i32` -- 服务端返回状态（0 表示成功）
- `download_url: Option<String>` -- 下载页面 URL（仅最后一块返回）
**And** `GigafileApiV1::upload_chunk()` 提供桩实现，返回 `AppError::Internal("upload_chunk not yet implemented -- Story 3.3")`

### AC-4: verify_upload() 方法签名与参数定义

**Given** `GigafileApi` trait 中的 `verify_upload()` 占位签名
**When** 完善方法签名和参数类型
**Then** `VerifyUploadParams` 结构体包含以下字段：
- `download_url: String` -- 文件下载页面 URL
- `expected_size: u64` -- 本地文件的原始大小（字节）
**And** `VerifyResult` 结构体包含以下字段：
- `is_valid: bool` -- Content-Length 是否匹配预期大小
- `remote_size: u64` -- 服务端报告的文件大小
**And** `GigafileApiV1::verify_upload()` 提供桩实现，返回 `AppError::Internal("verify_upload not yet implemented -- Story 3.3")`

### AC-5: HTTP 客户端安全通信

**Given** `GigafileApiV1` 实例
**When** 发起任何 HTTP 请求时
**Then** 所有通信使用 HTTPS 协议
**And** 所有 HTTP 交互代码限制在 `src-tauri/src/api/` 目录内（NFR6）
**And** 请求设置合理的 User-Agent 头（避免被服务器拒绝）
**And** upload_chunk 实现时（Story 3.3）须包含 Content-Length 头用于完整性校验（NFR7）

### AC-6: 错误处理

**Given** API 层方法执行过程中发生错误
**When** 错误需要传播时
**Then** 网络错误（连接失败、超时）通过 `AppError::Network` 传播
**And** API 响应错误（解析失败、意外响应）通过 `AppError::Api` 传播
**And** 错误通过 `?` 运算符传播，利用 `error.rs` 中已有的 `From<reqwest::Error>` 转换
**And** 日志级别错误信息使用英文技术详情

### AC-7: 单元测试

**Given** API 模块实现完成
**When** 执行 `cargo test`
**Then** 包含以下测试：
- HTML 解析测试：验证从模拟 HTML 中正确提取 server URL
- HTML 解析失败测试：验证缺少 server 变量时返回 `AppError::Api`
- `GigafileApiV1::new()` 构造测试：验证实例可成功创建
- `ChunkUploadParams` 和 `VerifyUploadParams` 结构体可正确构造
**And** 测试不依赖网络（不实际请求 gigafile.nu）
**And** `cargo clippy` 无警告

---

## Technical Design

### 现状分析

Story 1-3 已完成以下基础设施：

- `src-tauri/src/api/mod.rs` -- 定义了 `GigafileApi` trait（使用 RPITIT），包含 `discover_server()`、`upload_chunk()`、`verify_upload()` 三个方法签名
- `ChunkUploadParams`、`ChunkUploadResponse`、`VerifyUploadParams`、`VerifyResult` 为空占位结构体（标记 TODO Story 3.1）
- `src-tauri/src/error.rs` -- 完整的 `AppError` 类型，已实现 `From<reqwest::Error>`、`From<std::io::Error>`、`From<serde_json::Error>` 转换，以及 `Result<T>` 类型别名
- `src-tauri/Cargo.toml` -- reqwest 已配置 `json` 和 `cookies` features
- `api/mod.rs` 尾部注释 `// TODO: Story 3.1 - pub mod v1;`

当前 `api/` 目录仅有 `mod.rs`，本 Story 将创建 `v1.rs` 实现文件并完善占位结构体。

### 新增/修改模块

#### 1. `api/mod.rs` -- 完善参数结构体

将现有 TODO 占位结构体替换为包含完整字段的定义：

```rust
use std::sync::Arc;

#[derive(Debug)]
pub struct ChunkUploadParams {
    pub data: Vec<u8>,
    pub file_name: String,
    pub upload_id: String,
    pub chunk_index: u32,
    pub total_chunks: u32,
    pub lifetime: u32,
    pub server_url: String,
    pub cookie_jar: Arc<reqwest::cookie::Jar>,
}

#[derive(Debug)]
pub struct ChunkUploadResponse {
    pub status: i32,
    pub download_url: Option<String>,
}

#[derive(Debug)]
pub struct VerifyUploadParams {
    pub download_url: String,
    pub expected_size: u64,
}

#[derive(Debug)]
pub struct VerifyResult {
    pub is_valid: bool,
    pub remote_size: u64,
}
```

添加 `pub mod v1;` 导出，移除所有 TODO 注释。

#### 2. `api/v1.rs` -- GigafileApiV1 实现

```rust
use regex::Regex;
use crate::error::AppError;
use super::{
    GigafileApi, ChunkUploadParams, ChunkUploadResponse,
    VerifyUploadParams, VerifyResult,
};

const GIGAFILE_HOME_URL: &str = "https://gigafile.nu/";
const USER_AGENT: &str = "GigaFileUploader/0.1.0";

pub struct GigafileApiV1 {
    client: reqwest::Client,
}

impl GigafileApiV1 {
    pub fn new() -> crate::error::Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()
            .map_err(|e| AppError::Internal(
                format!("Failed to build HTTP client: {}", e)
            ))?;
        Ok(Self { client })
    }

    /// Extract server hostname from gigafile.nu homepage HTML.
    /// Separated as pub(crate) for unit testing without network.
    pub(crate) fn extract_server_from_html(html: &str)
        -> crate::error::Result<String>
    {
        let re = Regex::new(r#"var server = "(.+?)""#)
            .map_err(|e| AppError::Internal(
                format!("Regex compile error: {}", e)
            ))?;
        re.captures(html)
            .and_then(|caps| caps.get(1))
            .map(|m| format!("https://{}", m.as_str()))
            .ok_or_else(|| AppError::Api(
                "Failed to extract server URL from homepage HTML".into()
            ))
    }
}
```

- `discover_server()` 完整实现：GET 首页 -> 提取 server -> 返回 URL
- `upload_chunk()` 和 `verify_upload()` 返回 `Err(AppError::Internal("not yet implemented"))`

### 数据流

```
上传引擎 (Story 3.3, 未实现)
  -> GigafileApiV1::discover_server()
     -> GET https://gigafile.nu/
     -> Regex 提取 var server = "46.gigafile.nu"
     -> 返回 "https://46.gigafile.nu"
  -> [Story 3.3] GigafileApiV1::upload_chunk(params)
     -> POST https://{server}/upload_chunk.php (multipart/form-data)
  -> [Story 3.3] GigafileApiV1::verify_upload(params)
     -> GET download.php, 校验 Content-Length
```

### 设计决策

1. **HTML 解析提取为独立函数**：`extract_server_from_html()` 标记为 `pub(crate)`，使其可在单元测试中直接调用，无需模拟网络请求
2. **reqwest Client 不带 cookie_store**：`GigafileApiV1` 的内部 client 仅用于 `discover_server()`（不需要 cookie）。`upload_chunk()` 实现时（Story 3.3）将使用 params 中的 `cookie_jar` 构建独立的 client 实例
3. **桩实现返回 AppError 而非 panic**：`upload_chunk()` 和 `verify_upload()` 的桩实现返回明确的错误信息而非 `todo!()`，避免运行时 panic 崩溃，让调用方可以优雅处理
4. **正则模式来源**：`r#"var server = "(.+?)""#` 来自 fireattack/gfile 开源项目（版本 3.2.5）的逆向工程实现，与技术研究报告一致

---

## Tasks

### Task 1: 添加 `regex` 依赖

**文件:** `src-tauri/Cargo.toml`
**依赖:** 无

**Subtasks:**

1.1. 在 `[dependencies]` 中添加 `regex = "1"`

### Task 2: 完善 API 参数结构体

**文件:** `src-tauri/src/api/mod.rs`
**依赖:** 无

**Subtasks:**

2.1. 添加 `use std::sync::Arc;` 引入
2.2. 替换 `ChunkUploadParams` 占位结构体为完整字段定义（`data`, `file_name`, `upload_id`, `chunk_index`, `total_chunks`, `lifetime`, `server_url`, `cookie_jar`）
2.3. 替换 `ChunkUploadResponse` 占位结构体为完整字段定义（`status`, `download_url`）
2.4. 替换 `VerifyUploadParams` 占位结构体为完整字段定义（`download_url`, `expected_size`）
2.5. 替换 `VerifyResult` 占位结构体为完整字段定义（`is_valid`, `remote_size`）
2.6. 将 `// TODO: Story 3.1 - pub mod v1;` 替换为 `pub mod v1;`
2.7. 移除所有 TODO Story 3.1 注释

### Task 3: 创建 GigafileApiV1 结构体与构造函数

**文件:** `src-tauri/src/api/v1.rs`
**依赖:** Task 1, Task 2

**Subtasks:**

3.1. 创建 `src-tauri/src/api/v1.rs` 文件
3.2. 定义 `GigafileApiV1` 结构体，包含 `client: reqwest::Client` 字段
3.3. 实现 `GigafileApiV1::new() -> crate::error::Result<Self>` 构造函数
3.4. Client 配置：设置 `user_agent("GigaFileUploader/0.1.0")`
3.5. 定义模块级常量 `GIGAFILE_HOME_URL: &str = "https://gigafile.nu/"` 和 `USER_AGENT: &str = "GigaFileUploader/0.1.0"`

### Task 4: 实现 discover_server() 方法

**文件:** `src-tauri/src/api/v1.rs`
**依赖:** Task 3

**Subtasks:**

4.1. 实现 `extract_server_from_html(html: &str) -> crate::error::Result<String>` 辅助函数（`pub(crate)` 可见性）
4.2. 使用 `Regex::new(r#"var server = "(.+?)""#)` 编译正则表达式
4.3. 从匹配结果提取服务器主机名，拼接为 `https://{hostname}` 格式返回
4.4. 未匹配时返回 `AppError::Api("Failed to extract server URL from homepage HTML")`
4.5. 实现 `GigafileApi::discover_server()`：GET `GIGAFILE_HOME_URL` -> 获取 HTML text -> 调用 `extract_server_from_html()`
4.6. 网络错误通过 `?` 自动转换为 `AppError::Network`（利用 `From<reqwest::Error>` 实现）

### Task 5: 桩实现 upload_chunk() 和 verify_upload()

**文件:** `src-tauri/src/api/v1.rs`
**依赖:** Task 3

**Subtasks:**

5.1. 实现 `upload_chunk()` 桩方法，返回 `Err(AppError::Internal("upload_chunk not yet implemented -- see Story 3.3".into()))`
5.2. 实现 `verify_upload()` 桩方法，返回 `Err(AppError::Internal("verify_upload not yet implemented -- see Story 3.3".into()))`

### Task 6: 编写单元测试

**文件:** `src-tauri/src/api/v1.rs`（`#[cfg(test)] mod tests` 区块）
**依赖:** Task 4, Task 5

**Subtasks:**

6.1. 测试 `extract_server_from_html()` -- 传入模拟 HTML 片段 `<script>var server = "46.gigafile.nu"</script>`，验证返回 `Ok("https://46.gigafile.nu")`
6.2. 测试不同 server 编号的 HTML 内容（如 `"99.gigafile.nu"`），验证正确解析
6.3. 测试 HTML 中无 server 变量时返回 `Err`，且错误类型为 `AppError::Api`
6.4. 测试空 HTML 字符串时返回 `Err`，且错误类型为 `AppError::Api`
6.5. 测试 `GigafileApiV1::new()` 成功创建实例（`assert!(result.is_ok())`）
6.6. 测试 `ChunkUploadParams` 结构体可正确构造（验证所有字段类型兼容性）
6.7. 所有测试不依赖网络

### Task 7: 代码质量验证

**文件:** 无新文件
**依赖:** Task 6

**Subtasks:**

7.1. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
7.2. 执行 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 确认格式正确
7.3. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有测试通过

---

## Task 依赖顺序

```
Task 1 (regex 依赖) ──┐
                       ├──> Task 3 (GigafileApiV1 结构体)
Task 2 (API 结构体)  ──┘         │
                                  ├──> Task 4 (discover_server)
                                  ├──> Task 5 (桩实现)
                                  │         │
                                  └─────────┴──> Task 6 (单元测试)
                                                       │
                                                       v
                                               Task 7 (代码质量)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/api/v1.rs` | `GigafileApiV1` 结构体 + `GigafileApi` trait 实现 + 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/Cargo.toml` | 添加 `regex = "1"` 依赖 |
| `src-tauri/src/api/mod.rs` | 完善占位结构体字段、添加 `pub mod v1;`、移除 TODO 注释 |

### 禁止修改

- `src-tauri/src/error.rs` -- 已有 `From<reqwest::Error>` 转换，无需修改
- `src-tauri/src/lib.rs` -- 本 Story 不新增 Tauri command，不修改应用入口
- `src-tauri/src/models/` -- 上传数据模型（`UploadTask`、`Shard`、`Chunk`）属于 Story 3.2
- `src-tauri/src/services/` -- 上传引擎属于 Story 3.3
- `src-tauri/src/commands/` -- 上传 command 属于 Story 3.3
- `src-tauri/src/storage/` -- 不涉及持久化
- `src/` -- 本 Story 为纯 Rust 后端实现，不涉及前端变更

---

## Technical Notes

### gigafile.nu 服务器发现机制

根据技术研究报告（`_bmad-output/planning-artifacts/research/technical-gigafile-nu-upload-api-research-2026-02-10.md`），gigafile.nu 首页 HTML 中包含 JavaScript 变量声明：

```javascript
var server = "46.gigafile.nu"
```

服务器编号（如 `46`）会动态变化，每次上传会话前必须重新获取。正则表达式来自开源项目 fireattack/gfile（版本 3.2.5）的逆向工程实现。

### upload_chunk.php 协议参考

`upload_chunk()` 的完整实现将在 Story 3.3 中完成，此处记录关键协议细节供后续参考：

- **端点:** `POST https://{server}/upload_chunk.php`
- **Content-Type:** `multipart/form-data`
- **表单字段:** `id`（UUID hex）、`name`（文件名）、`chunk`（当前块号）、`chunks`（总块数）、`lifetime`（保留天数）、`file`（二进制数据，字段名 `"blob"`，MIME `application/octet-stream`）
- **成功响应（中间块）:** `{"status": 0}`
- **成功响应（最后块）:** 包含 `url` 字段（下载页面 URL）
- **Cookie 管理:** 首块响应设置 Cookie，后续块必须携带相同 Cookie

### Cookie Jar 设计说明

`ChunkUploadParams` 中包含 `cookie_jar: Arc<reqwest::cookie::Jar>` 字段，设计意图：

- 每个逻辑分片（shard）创建一个独立的 `Jar` 实例
- 同一分片的所有上传块共享同一个 `Jar`（通过 `Arc` 共享）
- 首块上传后服务端返回的 Cookie 自动存储在 `Jar` 中
- 后续块上传时 `Jar` 自动附加 Cookie
- `upload_chunk()` 在 Story 3.3 实现时将使用此 `cookie_jar` 构建带有 `cookie_provider` 的 reqwest Client

### 桩实现策略

`upload_chunk()` 和 `verify_upload()` 使用 `Err(AppError::Internal(...))` 作为桩实现，而非 `todo!()` 或 `unimplemented!()`：
- `todo!()` 会在运行时 panic，不利于集成测试和调用方的错误处理
- 返回 `Err` 让调用方可以通过 `?` 优雅传播，符合项目错误处理链设计
- 错误消息明确指向后续 Story，便于追踪实现进度

### reqwest multipart feature

当前 Story 不需要 reqwest 的 `multipart` feature（`upload_chunk` 为桩实现）。Story 3.3 实现完整上传逻辑时需在 `Cargo.toml` 添加：

```toml
reqwest = { version = "0.12", features = ["json", "cookies", "multipart"] }
```

### 与后续 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3.2（文件分块管理器） | 定义 `models/upload.rs` 中的 `UploadTask`、`Shard`、`Chunk` 结构体，字段与 `ChunkUploadParams` 对应 |
| Story 3.3（上传引擎核心） | 实现 `upload_chunk()` 完整逻辑（multipart/form-data）和 `verify_upload()`，添加 reqwest `multipart` feature |
| Story 3.4（重试引擎） | 在 `upload_chunk()` 调用层包裹指数退避重试逻辑 |

---

## Definition of Done

- [ ] `src-tauri/Cargo.toml` 添加 `regex = "1"` 依赖
- [ ] `api/mod.rs` 中 `ChunkUploadParams` 结构体包含 8 个字段（data, file_name, upload_id, chunk_index, total_chunks, lifetime, server_url, cookie_jar）
- [ ] `api/mod.rs` 中 `ChunkUploadResponse` 结构体包含 status 和 download_url 字段
- [ ] `api/mod.rs` 中 `VerifyUploadParams` 结构体包含 download_url 和 expected_size 字段
- [ ] `api/mod.rs` 中 `VerifyResult` 结构体包含 is_valid 和 remote_size 字段
- [ ] `api/mod.rs` 中所有 TODO Story 3.1 注释已移除
- [ ] `api/v1.rs` 中 `GigafileApiV1` 结构体已创建，实现 `GigafileApi` trait
- [ ] `discover_server()` 方法通过 HTTP GET 请求首页并用正则提取服务器 URL
- [ ] `extract_server_from_html()` 辅助函数为 `pub(crate)` 可见性，支持独立测试
- [ ] `upload_chunk()` 和 `verify_upload()` 提供桩实现（返回 `AppError::Internal`）
- [ ] 所有 HTTP 交互代码限制在 `src-tauri/src/api/` 目录内
- [ ] 单元测试覆盖：HTML 解析成功（不同 server 编号）、HTML 解析失败（无 server 变量、空 HTML）、实例构造、结构体构造
- [ ] 测试不依赖网络
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 所有测试通过

---

## Review Feedback

### Review Round 1 (2026-02-11)

**Verdict: PASSED**

| # | Checklist Item | Result | Feedback |
|---|----------------|--------|----------|
| RC-1 | AC clarity | PASS | 7 ACs all have Given/When/Then structure, each independently testable with specific verifiable conditions |
| RC-2 | Task sequence | PASS | Dependency graph is acyclic: Task 1/2 parallel -> Task 3 -> Task 4/5 parallel -> Task 6 -> Task 7 |
| RC-3 | Technical feasibility | PASS | Verified against existing code: `api/mod.rs` has placeholder structs (lines 13-27) and TODO comment (line 62); `error.rs` has `From<reqwest::Error>` (line 45-48) and `Result<T>` alias (line 58); `Cargo.toml` reqwest has `json`+`cookies` features (line 22) |
| RC-4 | Requirement consistency | PASS | Minor wording difference between AC-3 stub message and Task 5.1 stub message ("-- Story 3.3" vs "-- see Story 3.3") is non-contradictory |
| RC-5 | Scope sizing | PASS | 1 new file (~150 lines), 2 modified files, 1 dependency addition, 7 unit tests -- appropriate for single dev cycle |
| RC-6 | Dependency documentation | PASS | Story 1-3 prerequisite marked done; downstream Stories 3.2/3.3/3.4 relationships documented in Technical Notes table |
| RC-7 | File scope declaration | PASS | New files (1), modified files (2), forbidden files (6) all declared with rationale |
| RC-8 | API/method existence | PASS | `reqwest::Client::builder()`, `reqwest::cookie::Jar`, `regex::Regex::new()`, `AppError` variants, `From<reqwest::Error>` -- all verified against existing codebase and standard crate APIs |
