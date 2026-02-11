# Story 1.3: Rust 后端模块骨架与错误处理基础

## Story Info

- **Story Key:** 1-3
- **Epic:** Epic 1 - 项目基础设施与开发环境搭建
- **Status:** story-doc-review
- **Created:** 2026-02-11
- **FRs Covered:** FR24 (macOS), FR25 (Windows)
- **NFRs Covered:** NFR6 (API 可替换), NFR12 (单文件错误隔离)
- **Depends on:** Story 1-1 (项目初始化与开发环境搭建) - done
- **Blocks:** Story 3.1 (gigafile.nu API 抽象层与服务器发现), Story 3.2 (文件分块管理器), Story 4.1 (上传历史持久化存储)

## User Story

As a 开发者,
I want Rust 后端具有清晰的分层模块结构和统一的错误处理类型,
So that 后续功能开发有一致的架构基础可以依赖。

## Acceptance Criteria

### AC-1: Rust 模块目录结构

**Given** 项目已通过 Story 1.1 初始化，`src-tauri/src/` 目录存在
**When** 检查 `src-tauri/src/` 目录结构
**Then** 包含以下模块目录和文件：
  - `commands/mod.rs` -- Tauri IPC command handlers 入口，包含模块级文档注释说明职责
  - `services/mod.rs` -- 业务逻辑层入口，包含模块级文档注释说明职责
  - `api/mod.rs` -- gigafile.nu API 抽象层入口，包含 `GigafileApi` trait 定义
  - `storage/mod.rs` -- 本地持久化入口，包含模块级文档注释说明职责
  - `models/mod.rs` -- 数据模型入口，包含模块级文档注释说明职责
  - `error.rs` -- 统一 `AppError` 错误类型
**And** 每个模块文件都可以被 `lib.rs` 正确导入（编译通过）

### AC-2: 统一 AppError 错误类型

**Given** `src-tauri/src/error.rs` 文件已创建
**When** 检查 `AppError` 类型定义
**Then** `AppError` 是一个 `enum`，包含以下错误变体：
  - `Network(String)` -- 网络请求错误（reqwest 错误）
  - `Api(String)` -- gigafile.nu API 响应错误
  - `Storage(String)` -- 本地存储读写错误
  - `Io(String)` -- 文件 I/O 错误
  - `Internal(String)` -- 内部逻辑错误
**And** `AppError` 实现了 `std::fmt::Display` trait，每个变体输出英文技术描述（如 `"Network error: connection refused"`）
**And** `AppError` 实现了 `std::error::Error` trait
**And** `AppError` 实现了 `From<std::io::Error>`，转换为 `AppError::Io`
**And** `AppError` 实现了 `From<reqwest::Error>`，转换为 `AppError::Network`
**And** `AppError` 实现了 `From<serde_json::Error>`，转换为 `AppError::Internal`
**And** `AppError` 派生了 `Debug`
**And** `AppError` 可通过 `to_string()` 序列化为 `String`，用于 Tauri IPC 错误返回
**And** 定义了类型别名 `pub type Result<T> = std::result::Result<T, AppError>`，简化签名

### AC-3: GigafileApi trait 接口定义

**Given** `src-tauri/src/api/mod.rs` 文件已创建
**When** 检查 `GigafileApi` trait 定义
**Then** trait 名称为 `GigafileApi`，约束为 `Send + Sync`
**And** trait 包含以下方法签名（async 方法）：
  - `discover_server(&self) -> Result<String, AppError>` -- 动态发现当前可用的上传服务器 URL
  - `upload_chunk(&self, params: ChunkUploadParams) -> Result<ChunkUploadResponse, AppError>` -- 上传单个数据块
  - `verify_upload(&self, params: VerifyUploadParams) -> Result<VerifyResult, AppError>` -- 验证上传完成并获取下载链接
**And** `ChunkUploadParams`、`ChunkUploadResponse`、`VerifyUploadParams`、`VerifyResult` 已定义为占位结构体（unit struct），带有 `#[derive(Debug)]`，标注 `TODO: Story 3.1 添加完整字段`
**And** trait 和相关类型均为 `pub` 可见性
**And** 模块级文档注释说明此 trait 是 gigafile.nu API 的抽象层（NFR6），所有 HTTP 交互限制在 `api/` 目录内

### AC-4: lib.rs 模块声明与导出

**Given** 所有模块文件已创建
**When** 检查 `src-tauri/src/lib.rs`
**Then** 文件顶部包含以下模块声明：
  - `pub mod api;`
  - `pub mod commands;`
  - `pub mod error;`
  - `pub mod models;`
  - `pub mod services;`
  - `pub mod storage;`
**And** `run()` 函数保持 Tauri 应用入口逻辑
**And** `tauri_plugin_store` 插件已注册（已在 Story 1.1 完成，保持不变）
**And** `tauri_plugin_shell` 插件已注册（保持不变）
**And** 移除了 Story 1.1 遗留的 `greet` command 函数及其在 `generate_handler!` 中的注册
**And** `invoke_handler` 保留为空的 `tauri::generate_handler![]`（无注册命令），后续 Story 添加具体 commands

### AC-5: main.rs 入口验证

**Given** `lib.rs` 已更新模块声明
**When** 检查 `src-tauri/src/main.rs`
**Then** `main.rs` 调用 `giga_file_uploader_lib::run()`（保持不变）
**And** `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 属性保持不变
**And** `cargo build` 在 `src-tauri/` 目录下可以成功编译

### AC-6: cargo clippy 零警告

**Given** 所有 Rust 代码文件已创建或修改
**When** 在 `src-tauri/` 目录下执行 `cargo clippy -- -D warnings`
**Then** 命令执行通过，零 warning，零 error
**And** `cargo fmt --check` 执行通过（代码格式符合 rustfmt 标准）

### AC-7: 测试骨架

**Given** 所有模块的 `mod.rs` 文件已创建
**When** 检查每个模块文件
**Then** 每个模块文件（`commands/mod.rs`、`services/mod.rs`、`api/mod.rs`、`storage/mod.rs`、`models/mod.rs`、`error.rs`）包含 `#[cfg(test)] mod tests { ... }` 测试模块
**And** 每个测试模块包含至少一个基础测试函数，验证模块可以正常加载
**And** `error.rs` 的测试模块包含 `AppError` 的基础测试：
  - 验证 `AppError::Network` 的 `Display` 输出包含 `"Network error"`
  - 验证 `From<std::io::Error>` 转换正确
  - 验证 `to_string()` 返回非空字符串
**And** 在 `src-tauri/` 目录下执行 `cargo test`，所有测试通过

## Tasks

### Task 1: 创建 error.rs 统一错误类型

**对应 AC:** AC-2
**依赖:** 无

**Subtasks:**

1.1. 创建 `src-tauri/src/error.rs` 文件
1.2. 定义 `AppError` 枚举，包含五个变体：`Network(String)`、`Api(String)`、`Storage(String)`、`Io(String)`、`Internal(String)`，派生 `Debug`
1.3. 为 `AppError` 实现 `std::fmt::Display` trait，每个变体输出 `"{Category} error: {message}"` 格式的英文技术描述
1.4. 为 `AppError` 实现 `std::error::Error` trait（空实现体，依赖 `Display`）
1.5. 实现 `From<std::io::Error> for AppError`，转换为 `AppError::Io(err.to_string())`
1.6. 实现 `From<reqwest::Error> for AppError`，转换为 `AppError::Network(err.to_string())`
1.7. 实现 `From<serde_json::Error> for AppError`，转换为 `AppError::Internal(err.to_string())`
1.8. 定义类型别名 `pub type Result<T> = std::result::Result<T, AppError>;`
1.9. 添加 `#[cfg(test)] mod tests`，包含以下测试：
  - `test_display_network_error`：验证 `AppError::Network("timeout".into()).to_string()` 包含 `"Network error"`
  - `test_display_api_error`：验证 `AppError::Api` 变体的 Display 输出
  - `test_from_io_error`：创建 `std::io::Error`，验证 `AppError::from()` 转换为 `Io` 变体
  - `test_to_string_non_empty`：验证所有变体的 `to_string()` 返回非空字符串

### Task 2: 创建 models/mod.rs 数据模型入口

**对应 AC:** AC-1, AC-7
**依赖:** 无

**Subtasks:**

2.1. 创建 `src-tauri/src/models/` 目录
2.2. 创建 `src-tauri/src/models/mod.rs` 文件
2.3. 添加模块级文档注释：`//! Data models for the giga-file-uploader application.`，说明此模块包含上传任务、历史记录等数据结构定义
2.4. 添加 TODO 注释：`// TODO: Story 3.2 - pub mod upload; (UploadTask, Shard, Chunk, UploadConfig)` 和 `// TODO: Story 4.1 - pub mod history; (HistoryRecord)`
2.5. 添加 `#[cfg(test)] mod tests`，包含一个 `module_loads` 基础测试

### Task 3: 创建 api/mod.rs 及 GigafileApi trait

**对应 AC:** AC-1, AC-3, AC-7
**依赖:** Task 1（依赖 `error::AppError`）

**Subtasks:**

3.1. 创建 `src-tauri/src/api/` 目录
3.2. 创建 `src-tauri/src/api/mod.rs` 文件
3.3. 添加模块级文档注释，说明此模块是 gigafile.nu API 的抽象层（NFR6），所有与 gigafile.nu 的 HTTP 交互限制在此目录内
3.4. 导入 `crate::error::AppError`
3.5. 定义占位结构体 `ChunkUploadParams`（`#[derive(Debug)]`），标注 `/// TODO: Story 3.1 - 添加字段: data, shard_index, chunk_index, server_url, cookie_jar`
3.6. 定义占位结构体 `ChunkUploadResponse`（`#[derive(Debug)]`），标注 `/// TODO: Story 3.1 - 添加字段: success, cookie, download_url`
3.7. 定义占位结构体 `VerifyUploadParams`（`#[derive(Debug)]`），标注 `/// TODO: Story 3.1 - 添加字段: server_url, file_id`
3.8. 定义占位结构体 `VerifyResult`（`#[derive(Debug)]`），标注 `/// TODO: Story 3.1 - 添加字段: success, download_url`
3.9. 定义 `GigafileApi` trait，约束 `Send + Sync`，包含三个 async 方法签名：
  - `async fn discover_server(&self) -> std::result::Result<String, AppError>` -- 带文档注释说明用途
  - `async fn upload_chunk(&self, params: ChunkUploadParams) -> std::result::Result<ChunkUploadResponse, AppError>` -- 带文档注释
  - `async fn verify_upload(&self, params: VerifyUploadParams) -> std::result::Result<VerifyResult, AppError>` -- 带文档注释
3.10. 添加 TODO 注释：`// TODO: Story 3.1 - pub mod v1; (GigafileApiV1 实现)`
3.11. 添加 `#[cfg(test)] mod tests`，包含一个 `trait_is_object_safe` 测试（如 trait 非 object-safe 则改为 `module_loads` 测试）

### Task 4: 创建 commands/mod.rs IPC 命令入口

**对应 AC:** AC-1, AC-7
**依赖:** 无

**Subtasks:**

4.1. 创建 `src-tauri/src/commands/` 目录
4.2. 创建 `src-tauri/src/commands/mod.rs` 文件
4.3. 添加模块级文档注释：`//! Tauri IPC command handlers.`，说明此模块是前端通过 invoke() 调用的入口层，command 只做参数解析和转发，业务逻辑在 services 层
4.4. 添加 TODO 注释：`// TODO: Story 3.3 - pub mod upload; (start_upload, cancel_upload)` 和 `// TODO: Story 4.1 - pub mod history; (get_history, delete_history)` 和 `// TODO: Story 5.1 - pub mod settings; (get_settings, save_settings)`
4.5. 添加 `#[cfg(test)] mod tests`，包含一个 `module_loads` 基础测试

### Task 5: 创建 services/mod.rs 业务逻辑层入口

**对应 AC:** AC-1, AC-7
**依赖:** 无

**Subtasks:**

5.1. 创建 `src-tauri/src/services/` 目录
5.2. 创建 `src-tauri/src/services/mod.rs` 文件
5.3. 添加模块级文档注释：`//! Business logic layer.`，说明此模块包含上传引擎、分块管理、重试引擎、进度聚合等业务逻辑，被 commands 层调用
5.4. 添加 TODO 注释：`// TODO: Story 3.3 - pub mod upload_engine;` 和 `// TODO: Story 3.2 - pub mod chunk_manager;` 和 `// TODO: Story 3.4 - pub mod retry_engine;` 和 `// TODO: Story 3.5 - pub mod progress;`
5.5. 添加 `#[cfg(test)] mod tests`，包含一个 `module_loads` 基础测试

### Task 6: 创建 storage/mod.rs 本地持久化入口

**对应 AC:** AC-1, AC-7
**依赖:** 无

**Subtasks:**

6.1. 创建 `src-tauri/src/storage/` 目录
6.2. 创建 `src-tauri/src/storage/mod.rs` 文件
6.3. 添加模块级文档注释：`//! Local persistence layer using tauri-plugin-store.`，说明此模块负责历史记录和用户设置的本地持久化（JSON key-value store）
6.4. 添加 TODO 注释：`// TODO: Story 4.1 - pub mod history; (add_record, get_all, delete_record)` 和 `// TODO: Story 5.1 - pub mod settings; (get/save settings)`
6.5. 添加 `#[cfg(test)] mod tests`，包含一个 `module_loads` 基础测试

### Task 7: 更新 lib.rs 模块声明

**对应 AC:** AC-4
**依赖:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

**Subtasks:**

7.1. 修改 `src-tauri/src/lib.rs`，在文件顶部添加模块声明（按字母序）：
  - `pub mod api;`
  - `pub mod commands;`
  - `pub mod error;`
  - `pub mod models;`
  - `pub mod services;`
  - `pub mod storage;`
7.2. 移除 `greet` 函数定义（`#[tauri::command] fn greet(...)`）
7.3. 将 `invoke_handler` 修改为空注册：`.invoke_handler(tauri::generate_handler![])`
7.4. 保持 `tauri_plugin_shell::init()` 和 `tauri_plugin_store::Builder::new().build()` 插件注册不变
7.5. 保持 `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 属性不变
7.6. 执行 `cargo check`，确认编译通过

### Task 8: 代码质量验证

**对应 AC:** AC-5, AC-6, AC-7
**依赖:** Task 7

**Subtasks:**

8.1. 在 `src-tauri/` 目录下执行 `cargo fmt`，格式化所有 Rust 代码
8.2. 在 `src-tauri/` 目录下执行 `cargo clippy -- -D warnings`，确认零警告零错误
8.3. 如有 clippy 警告，修复后重新验证（常见问题：unused imports、needless pass by value）
8.4. 在 `src-tauri/` 目录下执行 `cargo test`，确认所有测试通过
8.5. 在 `src-tauri/` 目录下执行 `cargo build`，确认编译成功
8.6. 确认 `main.rs` 调用 `giga_file_uploader_lib::run()` 正常工作

## File Scope

以下是本 Story 允许创建或修改的文件列表。Dev Runner 不应修改此范围之外的文件。

### 将被创建的文件

- `src-tauri/src/error.rs` -- 统一 AppError 错误类型
- `src-tauri/src/api/mod.rs` -- GigafileApi trait 定义 + 占位类型
- `src-tauri/src/commands/mod.rs` -- IPC command handlers 入口（骨架）
- `src-tauri/src/services/mod.rs` -- 业务逻辑层入口（骨架）
- `src-tauri/src/storage/mod.rs` -- 本地持久化入口（骨架）
- `src-tauri/src/models/mod.rs` -- 数据模型入口（骨架）

### 将被修改的文件

- `src-tauri/src/lib.rs` -- 添加模块声明，移除 greet command，清空 invoke_handler

### 不允许修改的文件

- `src-tauri/src/main.rs` -- 入口不变，只做验证
- `src-tauri/Cargo.toml` -- 依赖已在 Story 1.1 添加完毕，不修改
- `src-tauri/tauri.conf.json` -- 不修改 Tauri 配置
- `src/` -- 不修改任何前端代码（属于 Story 1.2 范围）
- `_bmad-output/` -- 不修改规划文档（除 sprint-status.yaml 外）

## Technical Notes

### AppError 设计原则

AppError 遵循架构文档的错误处理策略：

- **英文技术描述：** `Display` 输出用于日志和 IPC 错误返回，使用英文技术详情（如 `"Network error: connection refused"`）
- **用户面向的中文消息：** 由前端在 L3 层根据 error 类别生成中文温和提示，AppError 本身不包含中文
- **IPC 序列化：** Tauri commands 返回 `Result<T, String>`，通过 `.map_err(|e| e.to_string())` 将 AppError 转为 String
- **`?` 运算符支持：** 通过 `From` trait 实现链式错误传播

示例用法（后续 Story 中的 command）：

```rust
#[tauri::command]
async fn start_upload(files: Vec<FileInput>, config: UploadConfig) -> Result<Vec<String>, String> {
    services::upload_engine::start(files, config)
        .await
        .map_err(|e| e.to_string())
}
```

### GigafileApi trait 设计原则

- **NFR6 可替换性：** trait 定义接口抽象，当前唯一实现将为 `GigafileApiV1`（Story 3.1）
- **所有 HTTP 交互限制在 `api/` 目录：** 上层模块（services/、commands/）通过 trait 调用，不直接构造 HTTP 请求
- **async 方法：** 使用 Rust 原生 `async fn in trait`（Rust 1.75+ 稳定支持）。如果后续 Story 实现时需要 `Send` bound 的 Future，可在 Story 3.1 中引入 `async-trait` crate 或使用 RPITIT 语法
- **占位类型：** `ChunkUploadParams` 等结构体在此 Story 中为 unit struct，Story 3.1 将添加完整字段并标注 `#[serde(rename_all = "camelCase")]`

### Rust 模块分层架构

```
commands/   -> Tauri IPC 入口，参数解析 + 转发，不含业务逻辑
services/   -> 核心业务逻辑（上传调度、分块、重试、进度）
api/        -> gigafile.nu HTTP 交互抽象层，独立可替换（NFR6）
storage/    -> 本地持久化（tauri-plugin-store）
models/     -> 共享数据结构定义
error.rs    -> 统一错误类型，所有模块使用
```

调用方向：`commands -> services -> api / storage`，模块间通过函数调用和参数传递通信，不使用全局可变状态。

### greet command 清理说明

Story 1.1 创建的 `greet` command 是脚手架模板遗留内容。Story 1.2 已完全重建前端 UI，不再调用 `greet`。本 Story 移除 `greet` 函数和 `invoke_handler` 中的注册，改为空的 `generate_handler![]`。后续 Story（如 3.3、4.1）将在此处注册实际的 command。

### 关键编码约定

- 模块级常量使用 `SCREAMING_SNAKE_CASE`（如 `MAX_RETRY_COUNT`）
- 结构体/枚举使用 `PascalCase`（如 `AppError`、`ChunkUploadParams`）
- 函数/方法使用 `snake_case`（如 `discover_server`）
- 跨 IPC 边界的结构体必须标注 `#[serde(rename_all = "camelCase")]`（本 Story 的占位结构体暂不需要，Story 3.1 添加字段时加上）
- 日志级别错误信息使用英文：`error!("HTTP request failed: status={}, url={}", status, url)`

### 技术栈版本参考

| 技术 | 版本 | 来源 |
|------|------|------|
| Rust | stable (2021 edition) | Cargo.toml |
| Tauri | 2.x | Cargo.toml |
| tokio | 1.x (full features) | Cargo.toml |
| reqwest | 0.12.x (json + cookies) | Cargo.toml |
| serde | 1.x (derive) | Cargo.toml |
| serde_json | 1.x | Cargo.toml |
| tauri-plugin-store | 2.x | Cargo.toml |

## Dependencies

- **Depends on:** Story 1-1 (项目初始化与开发环境搭建) - done
- **Parallel with:** Story 1-2 (前端目录结构与基础 UI 框架) - done，两者独立互不阻塞
- **Blocks:** Story 3.1 (API 抽象层实现依赖 GigafileApi trait), Story 3.2 (分块管理依赖 models 模块), Story 4.1 (历史存储依赖 storage 模块)

## Definition of Done

- [ ] AC-1: 六个模块文件已创建（commands/mod.rs, services/mod.rs, api/mod.rs, storage/mod.rs, models/mod.rs, error.rs）
- [ ] AC-2: AppError 枚举已定义，实现 Display + Error + From 转换，支持 ? 运算符
- [ ] AC-3: GigafileApi trait 已定义，包含 discover_server/upload_chunk/verify_upload 三个方法签名
- [ ] AC-4: lib.rs 正确声明所有六个模块，移除 greet command
- [ ] AC-5: main.rs 入口正常，cargo build 通过
- [ ] AC-6: cargo clippy -- -D warnings 零警告，cargo fmt --check 通过
- [ ] AC-7: 所有模块包含 #[cfg(test)] mod tests 测试骨架，cargo test 全部通过
