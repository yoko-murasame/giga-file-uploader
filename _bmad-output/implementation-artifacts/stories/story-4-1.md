# Story 4.1: 上传历史持久化存储

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 4-1 |
| Epic | Epic 4: 历史记录与链接管理 |
| 前置依赖 | Story 3-6 (上传完成、链接产出与一键复制) -- 已完成 |
| FRs 覆盖 | FR18 (历史记录持久化) |
| NFRs 关联 | NFR11 (应用崩溃不丢失已保存记录) |

## User Story

As a 用户,
I want 每次上传成功的文件记录自动保存到本地,
So that 我以后可以找到之前上传的文件链接。

---

## Acceptance Criteria

### AC-1: 上传成功后自动保存历史记录

**Given** 单个文件上传成功（`upload:file-complete` 事件触发）
**When** 系统处理上传完成事件
**Then** 自动将记录保存到本地存储（FR18），包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String` | UUID v4，记录唯一标识 |
| `fileName` | `String` | 文件名 |
| `downloadUrl` | `String` | 下载链接 |
| `fileSize` | `u64` / `number` | 文件大小（字节） |
| `uploadedAt` | `String` | 上传时间，ISO 8601 格式 |
| `expiresAt` | `String` | 过期日期，ISO 8601 格式，根据保留期（`config.lifetime` 天）从上传时间计算 |

**And** 保存操作在 Rust 后端 `upload_engine.rs` 的 `upload_file` 函数内完成，位于 `upload:file-complete` 事件发射之后
**And** 这是 Rust-to-Rust 调用（`storage::history::add_record()`），不经过 IPC
**And** 保存失败仅记录日志（`log::error!`），不影响上传流程的正常完成

### AC-2: 使用 tauri-plugin-store 写入 history.json

**Given** 系统需要持久化历史记录
**When** 调用 `storage::history` 的任意写操作（`add_record`、`delete_record`）
**Then** 使用 `tauri-plugin-store` 的 `StoreExt` trait 访问 `history.json` 存储文件
**And** 记录以 JSON 数组形式存储在 `"records"` key 下
**And** 每次写操作后立即调用 `store.save()` 将数据持久化到磁盘

### AC-3: 崩溃安全持久化（NFR11）

**Given** 用户上传了多个文件，部分已成功
**When** 应用在上传过程中崩溃或异常退出
**Then** 已成功保存的历史记录不丢失
**And** 保证机制：每条记录写入后立即调用 `store.save()` 刷盘，不依赖应用正常退出时的批量写入
**And** 保存操作在 Rust 后端执行（不依赖前端事件监听），upload_engine 在发射 `upload:file-complete` 事件后直接调用 `storage::history::add_record()`

### AC-4: storage/history.rs CRUD 函数

**Given** `storage/history.rs` 模块
**When** 被其他 Rust 模块调用
**Then** 提供以下三个公开函数：

```rust
/// 添加一条历史记录，立即持久化到磁盘
pub fn add_record(app: &tauri::AppHandle, record: HistoryRecord) -> crate::error::Result<()>;

/// 读取所有历史记录，按上传时间倒序排列（最新在前）
pub fn get_all(app: &tauri::AppHandle) -> crate::error::Result<Vec<HistoryRecord>>;

/// 根据 ID 删除一条历史记录，立即持久化到磁盘
pub fn delete_record(app: &tauri::AppHandle, id: &str) -> crate::error::Result<()>;
```

**And** 所有错误使用 `AppError::Storage` 变体
**And** `get_all()` 在 `"records"` key 不存在时返回空数组（首次使用场景）

### AC-5: models/history.rs 定义 HistoryRecord 结构体

**Given** `models/history.rs` 模块
**When** 定义 IPC 边界数据结构
**Then** 定义如下结构体：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub file_name: String,
    pub download_url: String,
    pub file_size: u64,
    pub uploaded_at: String,
    pub expires_at: String,
}
```

**And** 遵循 `#[serde(rename_all = "camelCase")]` 规范（与 `models/upload.rs` 一致）

### AC-6: commands/history.rs 定义 IPC commands

**Given** `commands/history.rs` 模块
**When** 前端通过 `invoke()` 调用
**Then** 提供以下两个 Tauri command：

```rust
#[tauri::command]
pub fn get_history(app: tauri::AppHandle) -> Result<Vec<HistoryRecord>, String>;

#[tauri::command]
pub fn delete_history(id: String, app: tauri::AppHandle) -> Result<(), String>;
```

**And** command 内部调用 `storage::history` 对应函数，通过 `.map_err(|e| e.to_string())` 转换错误
**And** `lib.rs` 的 `invoke_handler` 注册 `get_history` 和 `delete_history`

### AC-7: 前端类型与 IPC 封装

**Given** 前端需要与后端历史记录交互
**When** 实现前端集成层
**Then** 新建 `src/types/history.ts` 定义 TypeScript 接口：

```typescript
export interface HistoryRecord {
  id: string;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  uploadedAt: string;
  expiresAt: string;
}
```

**And** 在 `src/lib/tauri.ts` 添加 IPC 封装函数：

```typescript
export async function getHistory(): Promise<HistoryRecord[]>;
export async function deleteHistory(id: string): Promise<void>;
```

### AC-8: historyStore 基础实现

**Given** 前端 `historyStore.ts` 目前是占位符
**When** 实现基础 store
**Then** `historyStore` 提供以下状态和 actions：

```typescript
interface HistoryState {
  records: HistoryRecord[];
  loadHistory: () => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}
```

**And** `loadHistory()` 调用 `getHistory()` IPC 加载记录到 `records` 状态
**And** `deleteRecord(id)` 调用 `deleteHistory(id)` IPC 后从 `records` 中移除对应记录
**And** 使用 Zustand 精确选择器模式，不解构整个 store

### AC-9: 单元测试

**Given** 后端和前端功能实现完成
**When** 执行测试
**Then** Rust 测试（`storage/history.rs` 内联 `#[cfg(test)] mod tests`）：
- **add_record + get_all**：添加一条记录后 `get_all()` 返回包含该记录的列表
- **多条记录排序**：添加多条记录后 `get_all()` 按上传时间倒序返回
- **delete_record**：添加记录后删除，`get_all()` 不再包含该记录
- **delete 不存在的 ID**：不报错，静默忽略
- **get_all 空存储**：首次调用返回空数组

**And** Rust 测试（`models/history.rs` 内联 `#[cfg(test)] mod tests`）：
- **HistoryRecord serde camelCase**：序列化后 JSON key 为 camelCase 格式
- **HistoryRecord serde roundtrip**：序列化 + 反序列化后数据一致

**And** 前端测试（`src/stores/historyStore.test.ts` 新建）：
- **loadHistory**：mock `getHistory` IPC，验证 `records` 被正确填充
- **deleteRecord**：mock `deleteHistory` IPC，验证 `records` 中对应记录被移除

**And** `pnpm test` 前端测试通过
**And** `pnpm lint` ESLint 无错误
**And** `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过

---

## Technical Design

### 现状分析

Epic 3 已完成核心上传引擎，关键集成点：

- `src-tauri/src/services/upload_engine.rs` — `upload_file` 函数在文件上传完成后发射 `upload:file-complete` 事件（第 208-216 行），此时拥有 `AppHandle`、`task.file_name`、`download_url`、`task.file_size`、`config.lifetime` 所有所需数据
- `src-tauri/src/lib.rs` — 已注册 `tauri-plugin-store`（第 15 行），`invoke_handler` 在第 21-25 行，需追加新 commands
- `src-tauri/src/error.rs` — `AppError::Storage(String)` 变体已定义，可直接用于存储错误
- `src-tauri/src/models/mod.rs:9` — 预留 TODO: `pub mod history;`
- `src-tauri/src/storage/mod.rs:7` — 预留 TODO: `pub mod history;`
- `src-tauri/src/commands/mod.rs:10` — 预留 TODO: `pub mod history;`
- `src/stores/historyStore.ts` — Zustand store 占位符，需替换为完整实现
- `src/lib/tauri.ts` — IPC 封装入口，需添加 `getHistory()`、`deleteHistory()` 函数

**关键设计决策 — Rust 端直接保存（非 IPC 触发）：**

保存历史记录在 Rust 端 `upload_engine.rs` 内完成，而非通过前端监听 `upload:file-complete` 事件后调用 IPC command。原因：
1. **NFR11 崩溃安全**：如果依赖前端触发保存，应用在事件发射和前端处理之间崩溃会丢失记录
2. **数据完整性**：`upload_engine` 已拥有所有必需数据（`file_name`、`download_url`、`file_size`、`config.lifetime`），无需跨 IPC 传递
3. **关注点分离**：持久化是后端关注点，前端仅负责读取和展示

### 新增/修改模块

#### 1. `models/history.rs` -- HistoryRecord 数据结构（新建）

```rust
use serde::{Deserialize, Serialize};

/// A single upload history record persisted to local storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    /// Unique identifier (UUID v4 hex, 32 chars).
    pub id: String,
    /// Original file name.
    pub file_name: String,
    /// Download URL from gigafile.nu.
    pub download_url: String,
    /// File size in bytes.
    pub file_size: u64,
    /// Upload timestamp in ISO 8601 format (e.g., "2026-02-11T08:30:00+00:00").
    pub uploaded_at: String,
    /// Expiration timestamp in ISO 8601 format, calculated as uploaded_at + lifetime days.
    pub expires_at: String,
}
```

#### 2. `storage/history.rs` -- CRUD 操作（新建）

```rust
use tauri_plugin_store::StoreExt;
use crate::error::AppError;
use crate::models::history::HistoryRecord;

const STORE_FILE: &str = "history.json";
const RECORDS_KEY: &str = "records";

pub fn add_record(app: &tauri::AppHandle, record: HistoryRecord) -> crate::error::Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::Storage(e.to_string()))?;
    let mut records = load_records(&store);
    records.insert(0, record); // newest first
    store.set(RECORDS_KEY, serde_json::to_value(&records)?);
    store.save().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

pub fn get_all(app: &tauri::AppHandle) -> crate::error::Result<Vec<HistoryRecord>> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(load_records(&store))
}

pub fn delete_record(app: &tauri::AppHandle, id: &str) -> crate::error::Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::Storage(e.to_string()))?;
    let mut records = load_records(&store);
    records.retain(|r| r.id != id);
    store.set(RECORDS_KEY, serde_json::to_value(&records)?);
    store.save().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

fn load_records(store: &tauri_plugin_store::Store<tauri::Wry>) -> Vec<HistoryRecord> {
    store.get(RECORDS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}
```

#### 3. `commands/history.rs` -- IPC commands（新建）

```rust
use crate::models::history::HistoryRecord;
use crate::storage::history;

#[tauri::command]
pub fn get_history(app: tauri::AppHandle) -> Result<Vec<HistoryRecord>, String> {
    history::get_all(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history(id: String, app: tauri::AppHandle) -> Result<(), String> {
    history::delete_record(&app, &id).map_err(|e| e.to_string())
}
```

#### 4. `services/upload_engine.rs` -- 集成历史保存（修改）

在 `upload_file` 函数中，`upload:file-complete` 事件发射之后，添加历史记录保存：

```rust
// 现有代码（第 208-216 行）:
let _ = app.emit("upload:file-complete", FileCompletePayload { ... });

// 新增：保存历史记录（NFR11: crash-safe persistence）
let now = chrono::Utc::now();
let expires = now + chrono::Duration::days(config.lifetime as i64);
let history_record = crate::models::history::HistoryRecord {
    id: uuid::Uuid::new_v4().simple().to_string(),
    file_name: task.file_name.clone(),
    download_url: download_url.clone(),
    file_size: task.file_size,
    uploaded_at: now.to_rfc3339(),
    expires_at: expires.to_rfc3339(),
};
if let Err(e) = crate::storage::history::add_record(&app, history_record) {
    log::error!("Failed to save history record for '{}': {}", task.file_name, e);
}
```

#### 5. `lib.rs` -- 注册新 commands（修改）

```rust
.invoke_handler(tauri::generate_handler![
    commands::files::resolve_dropped_paths,
    commands::upload::start_upload,
    commands::upload::cancel_upload,
    commands::history::get_history,     // 新增
    commands::history::delete_history,  // 新增
])
```

#### 6. `Cargo.toml` -- 添加 chrono 依赖（修改）

```toml
[dependencies]
# ... existing deps ...
chrono = { version = "0.4", features = ["serde"] }
```

#### 7. `src/types/history.ts` -- 前端类型定义（新建）

```typescript
/** Upload history record from local storage */
export interface HistoryRecord {
  id: string;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  uploadedAt: string;
  expiresAt: string;
}
```

#### 8. `src/lib/tauri.ts` -- IPC 封装（修改）

```typescript
import type { HistoryRecord } from '@/types/history';

/** Get all upload history records. */
export async function getHistory(): Promise<HistoryRecord[]> {
  return invoke<HistoryRecord[]>('get_history');
}

/** Delete a history record by ID. */
export async function deleteHistory(id: string): Promise<void> {
  return invoke<void>('delete_history', { id });
}
```

#### 9. `src/stores/historyStore.ts` -- 完整 store 实现（修改）

```typescript
import { create } from 'zustand';

import { deleteHistory, getHistory } from '@/lib/tauri';

import type { HistoryRecord } from '@/types/history';

interface HistoryState {
  records: HistoryRecord[];
  loadHistory: () => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  records: [],

  loadHistory: async () => {
    try {
      const records = await getHistory();
      set({ records });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  deleteRecord: async (id) => {
    try {
      await deleteHistory(id);
      set({ records: get().records.filter((r) => r.id !== id) });
    } catch (error) {
      console.error('Failed to delete history record:', error);
    }
  },
}));
```

### 数据流

```
文件上传完成 (Rust upload_engine.rs):
  -> upload_file() 所有分片完成
  -> 发射 upload:file-complete 事件到前端
  -> 调用 storage::history::add_record()
    -> tauri-plugin-store 写入 history.json "records" 数组
    -> store.save() 立即刷盘（NFR11）
  -> 保存失败仅 log::error!，不影响上传结果

前端读取历史 (Story 4.2 使用):
  -> historyStore.loadHistory()
  -> lib/tauri.ts getHistory()
  -> invoke('get_history')
  -> commands::history::get_history()
  -> storage::history::get_all()
  -> 返回 Vec<HistoryRecord> -> HistoryRecord[] -> set({ records })

前端删除记录 (Story 4.2 使用):
  -> historyStore.deleteRecord(id)
  -> lib/tauri.ts deleteHistory(id)
  -> invoke('delete_history', { id })
  -> commands::history::delete_history()
  -> storage::history::delete_record()
  -> store.save() 刷盘
  -> 前端 set({ records: filtered })
```

### 设计决策

1. **Rust 端直接保存，非 IPC 触发**：`upload_engine.rs` 在发射 `upload:file-complete` 事件后直接调用 `storage::history::add_record()`。如果依赖前端监听事件后回调 IPC command 来保存，应用在事件发射到前端处理之间崩溃会丢失记录。Rust-to-Rust 调用消除了这一窗口（NFR11）。

2. **保存失败不中断上传流程**：历史记录是辅助功能，如果因存储错误（如磁盘满）导致保存失败，仅记录错误日志，不影响 `upload_file` 函数返回 `Ok(())`。用户的文件已成功上传到 gigafile.nu，链接已通过 `upload:file-complete` 事件传递到前端。

3. **ISO 8601 时间戳使用 chrono crate**：需要当前时间 + 保留天数计算过期日期，`chrono` 是 Rust 生态中处理时间的标准库，提供 `to_rfc3339()` 直接生成 ISO 8601 格式字符串。

4. **records 数组按时间倒序存储**：`add_record()` 将新记录插入到数组头部（`insert(0, record)`），`get_all()` 直接返回原序。这样 Story 4.2 的历史列表默认最新在前，无需额外排序。

5. **不单独暴露 add_history IPC command**：保存操作是 Rust 内部行为（`upload_engine -> storage::history`），前端不需要也不应该直接触发保存。只暴露 `get_history` 和 `delete_history` 两个读/删 command。

6. **historyStore 错误处理使用 try/catch + console.error**：与 `uploadStore.startUpload` 的错误处理模式一致（见 `uploadStore.ts:64`）。Store actions 捕获 IPC 错误并记录日志，不抛出异常给组件。

7. **HistoryRecord.id 使用 UUID v4**：与项目中其他 ID 生成方式一致（如 `upload_engine.rs` 中的 `task_id`），保证唯一性。

8. **tauri-plugin-store 存储文件命名为 `history.json`**：与 Epic AC 一致。tauri-plugin-store 默认将文件存储在应用数据目录（`AppData/giga-file-uploader/`）中。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3-6（链接产出） | 本 Story 依赖 3-6 的 `upload:file-complete` 事件和 `FileCompletePayload` 数据 |
| Story 3-7（上传操作栏） | 本 Story 依赖 3-7 的保留期硬编码（7 天），用于计算过期日期 |
| Story 4-2（历史列表展示） | Story 4-2 将使用本 Story 提供的 `historyStore`、`getHistory` IPC 和 `HistoryRecord` 类型构建 UI |
| Story 5-1（保留期选择） | Story 5-1 将用户选择的保留期传递给 `startUpload`，本 Story 的过期日期计算自动适配（使用 `config.lifetime`） |

---

## Tasks

### Task 1: 添加 chrono 依赖

**文件:** `src-tauri/Cargo.toml`（修改）
**依赖:** 无

**Subtasks:**

1.1. 在 `[dependencies]` 中添加 `chrono = { version = "0.4", features = ["serde"] }`
1.2. 验证 `cargo check --manifest-path src-tauri/Cargo.toml` 通过

### Task 2: 定义 HistoryRecord 结构体

**文件:** `src-tauri/src/models/history.rs`（新建），`src-tauri/src/models/mod.rs`（修改）
**依赖:** 无

**Subtasks:**

2.1. 创建 `src-tauri/src/models/history.rs`，定义 `HistoryRecord` 结构体（`#[serde(rename_all = "camelCase")]`）
2.2. 在 `src-tauri/src/models/mod.rs` 中将 TODO 注释替换为 `pub mod history;`
2.3. 添加内联 `#[cfg(test)] mod tests`：serde camelCase 键名验证、序列化/反序列化 roundtrip 测试

### Task 3: 实现 storage/history.rs CRUD 函数

**文件:** `src-tauri/src/storage/history.rs`（新建），`src-tauri/src/storage/mod.rs`（修改）
**依赖:** Task 1, Task 2

**Subtasks:**

3.1. 创建 `src-tauri/src/storage/history.rs`，实现 `add_record()`、`get_all()`、`delete_record()` 函数
3.2. 实现内部 `load_records()` 辅助函数，处理 `"records"` key 不存在时返回空数组
3.3. 每个写操作后调用 `store.save()` 确保立即持久化（NFR11）
3.4. 所有错误使用 `AppError::Storage` 变体
3.5. 在 `src-tauri/src/storage/mod.rs` 中将 TODO 注释替换为 `pub mod history;`
3.6. 添加内联 `#[cfg(test)] mod tests`：注意 tauri-plugin-store 需要 `AppHandle` 运行环境，单元测试可能需要使用 `tauri::test` 工具或通过集成测试覆盖。如果 `tauri::test` 不支持 store 插件，在 tests 中使用 mock 或将核心逻辑（records 数组操作）提取为纯函数进行测试

### Task 4: 实现 commands/history.rs IPC commands

**文件:** `src-tauri/src/commands/history.rs`（新建），`src-tauri/src/commands/mod.rs`（修改），`src-tauri/src/lib.rs`（修改）
**依赖:** Task 3

**Subtasks:**

4.1. 创建 `src-tauri/src/commands/history.rs`，实现 `get_history` 和 `delete_history` Tauri commands
4.2. 在 `src-tauri/src/commands/mod.rs` 中将 TODO 注释替换为 `pub mod history;`
4.3. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册 `commands::history::get_history` 和 `commands::history::delete_history`

### Task 5: upload_engine 集成历史保存

**文件:** `src-tauri/src/services/upload_engine.rs`（修改）
**依赖:** Task 1, Task 3

**Subtasks:**

5.1. 在 `upload_file` 函数中，`upload:file-complete` 事件发射之后，添加 `HistoryRecord` 构建和 `storage::history::add_record()` 调用
5.2. 使用 `chrono::Utc::now()` 生成上传时间，`now + chrono::Duration::days(config.lifetime as i64)` 计算过期日期
5.3. 保存失败使用 `log::error!` 记录，不影响函数返回值

### Task 6: 前端类型与 IPC 封装

**文件:** `src/types/history.ts`（新建），`src/lib/tauri.ts`（修改）
**依赖:** Task 4

**Subtasks:**

6.1. 创建 `src/types/history.ts`，定义 `HistoryRecord` TypeScript 接口
6.2. 在 `src/lib/tauri.ts` 中添加 `getHistory()` 和 `deleteHistory()` IPC 封装函数
6.3. 在 `tauri.ts` 中添加 `import type { HistoryRecord } from '@/types/history'`

### Task 7: historyStore 实现

**文件:** `src/stores/historyStore.ts`（修改）
**依赖:** Task 6

**Subtasks:**

7.1. 替换 `historyStore.ts` 占位内容为完整实现：`records` 状态 + `loadHistory()` + `deleteRecord()` actions
7.2. 使用 Zustand 精确选择器模式

### Task 8: 编写前端测试

**文件:** `src/stores/historyStore.test.ts`（新建）
**依赖:** Task 7

**Subtasks:**

8.1. `historyStore.test.ts`：测试 `loadHistory` 调用 `getHistory` IPC 并填充 `records`
8.2. `historyStore.test.ts`：测试 `deleteRecord` 调用 `deleteHistory` IPC 并从 `records` 中移除对应记录

### Task 9: 代码质量验证

**文件:** 无新文件
**依赖:** Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

**Subtasks:**

9.1. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认 Rust 测试通过
9.2. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无 lint 警告
9.3. 执行 `pnpm test` 确认前端测试通过
9.4. 执行 `pnpm lint` 确认 ESLint 无错误
9.5. 执行 `pnpm format:check` 确认 Prettier 格式正确

---

## Task 依赖顺序

```
Task 1 (chrono 依赖) ──→ Task 3 (storage CRUD) ──→ Task 4 (IPC commands) ──→ Task 6 (前端类型/IPC)
                              │                          │                          │
Task 2 (HistoryRecord) ──────┘                          │                          ↓
                                                         │                    Task 7 (historyStore)
                                                         │                          │
Task 5 (upload_engine 集成) ←─── Task 1 + Task 3         │                          ↓
                                                         │                    Task 8 (前端测试)
                                                         │                          │
                                                         ↓                          ↓
                                                    Task 9 (代码质量验证) ←─── 所有 Tasks
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/models/history.rs` | `HistoryRecord` 结构体定义（`#[serde(rename_all = "camelCase")]`），含 serde 测试 |
| `src-tauri/src/storage/history.rs` | CRUD 函数：`add_record()`、`get_all()`、`delete_record()`，使用 `tauri-plugin-store` 读写 `history.json`，含单元测试 |
| `src-tauri/src/commands/history.rs` | Tauri IPC commands：`get_history`、`delete_history` |
| `src/types/history.ts` | `HistoryRecord` TypeScript 接口定义 |
| `src/stores/historyStore.test.ts` | historyStore 单元测试：loadHistory、deleteRecord |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src-tauri/Cargo.toml` | 添加 `chrono = { version = "0.4", features = ["serde"] }` 依赖 |
| `src-tauri/src/models/mod.rs` | 将 TODO 注释替换为 `pub mod history;` |
| `src-tauri/src/storage/mod.rs` | 将 TODO 注释替换为 `pub mod history;` |
| `src-tauri/src/commands/mod.rs` | 将 TODO 注释替换为 `pub mod history;` |
| `src-tauri/src/services/upload_engine.rs` | 在 `upload_file` 函数中添加历史记录保存逻辑（`upload:file-complete` 事件发射后） |
| `src-tauri/src/lib.rs` | 在 `invoke_handler` 中注册 `get_history` 和 `delete_history` commands |
| `src/lib/tauri.ts` | 添加 `getHistory()` 和 `deleteHistory()` IPC 封装函数 |
| `src/stores/historyStore.ts` | 替换占位内容为完整 store 实现（`records` 状态 + `loadHistory` + `deleteRecord` actions） |

### 禁止修改

- `src-tauri/src/api/` -- API 层不涉及
- `src-tauri/src/services/chunk_manager.rs` -- 分片逻辑不涉及
- `src-tauri/src/services/progress.rs` -- 进度聚合不涉及
- `src-tauri/src/services/retry_engine.rs` -- 重试逻辑不涉及
- `src-tauri/src/error.rs` -- `AppError::Storage` 已存在，无需修改
- `src-tauri/src/models/upload.rs` -- 上传模型不涉及
- `src-tauri/src/models/file.rs` -- 文件模型不涉及
- `src-tauri/src/commands/upload.rs` -- 上传 commands 不涉及
- `src/App.tsx` -- 应用入口不变
- `src/App.css` -- 设计 Token 不变
- `src/stores/uploadStore.ts` -- 上传 store 不变
- `src/stores/appStore.ts` -- 不涉及
- `src/types/upload.ts` -- 上传类型不变
- `src/hooks/useUploadEvents.ts` -- 事件监听不变（保存在 Rust 端完成）
- `src/components/` -- 所有 UI 组件不涉及（UI 展示在 Story 4.2）
- `src/lib/format.ts` -- 格式化工具不涉及

---

## Technical Notes

### tauri-plugin-store v2 API 使用

```rust
use tauri_plugin_store::StoreExt;

// 获取或创建 store（自动关联 history.json 文件）
let store = app.store("history.json")?;

// 读取：返回 Option<serde_json::Value>
let value = store.get("records");

// 写入：设置内存中的值
store.set("records", serde_json::to_value(&records)?);

// 持久化：将内存中的值写入磁盘文件
store.save()?;
```

`tauri-plugin-store` 已在 `lib.rs:15` 注册（`.plugin(tauri_plugin_store::Builder::new().build())`）。Store 文件存储在应用数据目录中（macOS: `~/Library/Application Support/nu.gigafile.uploader/`，Windows: `%APPDATA%/nu.gigafile.uploader/`）。

### chrono 时间处理

```rust
use chrono::{Duration, Utc};

let now = Utc::now();
let uploaded_at = now.to_rfc3339();  // "2026-02-11T08:30:00.123456789+00:00"

let expires = now + Duration::days(config.lifetime as i64);
let expires_at = expires.to_rfc3339();
```

`to_rfc3339()` 生成的格式是 ISO 8601 兼容的 RFC 3339 格式，可以直接在前端使用 `new Date(string)` 解析。

### upload_engine 修改点

修改位于 `upload_engine.rs` 的 `upload_file` 函数（第 200-218 行附近），在现有的 `upload:file-complete` 事件发射代码之后添加保存逻辑。`upload_file` 函数签名无需修改，已有 `app: tauri::AppHandle` 和 `config: &UploadConfig` 参数。

```rust
// 现有代码不变:
let download_url = task.shards[0].download_url.clone().unwrap_or_default();
let _ = app.emit("upload:file-complete", FileCompletePayload { ... });

// 新增保存逻辑 (在 Ok(()) 之前):
let now = chrono::Utc::now();
let history_record = crate::models::history::HistoryRecord {
    id: uuid::Uuid::new_v4().simple().to_string(),
    file_name: task.file_name.clone(),
    download_url: download_url.clone(),
    file_size: task.file_size,
    uploaded_at: now.to_rfc3339(),
    expires_at: (now + chrono::Duration::days(config.lifetime as i64)).to_rfc3339(),
};
if let Err(e) = crate::storage::history::add_record(&app, history_record) {
    log::error!("Failed to save history record for '{}': {}", task.file_name, e);
}

Ok(())
```

### Rust 测试注意事项

`storage/history.rs` 的 CRUD 函数依赖 `tauri::AppHandle` 和 `tauri-plugin-store`。直接单元测试可能受限于 Tauri 测试运行环境：

1. **优先方案**：使用 `tauri::test::mock_builder()` 创建模拟 AppHandle 并注册 store 插件
2. **备选方案**：将核心逻辑（records 数组的增删操作）提取为纯函数，对纯函数做单元测试，对 store 交互做集成测试
3. **models/history.rs 测试**：`HistoryRecord` 的 serde 测试不依赖 Tauri 运行环境，可以直接测试

### 前端测试 mock 策略

```typescript
// historyStore.test.ts
import { vi } from 'vitest';

// Mock lib/tauri.ts 的 IPC 函数
vi.mock('@/lib/tauri', () => ({
  getHistory: vi.fn(),
  deleteHistory: vi.fn(),
}));
```

使用 Vitest 的 `vi.mock` 拦截 IPC 调用，验证 store actions 的行为。遵循 `uploadStore.test.ts` 中已有的 mock 模式。

### Story 4.2 集成预留

Story 4.2 将在"历史记录" Tab 中构建 UI，使用本 Story 提供的：
- `useHistoryStore` — `records` 状态 + `loadHistory()`/`deleteRecord()` actions
- `HistoryRecord` 类型 — 渲染列表项
- `getHistory`/`deleteHistory` IPC — 已封装在 store 中，组件不直接调用

---

## Definition of Done

- [ ] `Cargo.toml` 添加 `chrono` 依赖
- [ ] `models/history.rs` 定义 `HistoryRecord` 结构体，`#[serde(rename_all = "camelCase")]`
- [ ] `models/mod.rs` 注册 `pub mod history;`
- [ ] `storage/history.rs` 实现 `add_record()`、`get_all()`、`delete_record()` 三个 CRUD 函数
- [ ] `add_record()` 将新记录插入数组头部（最新在前）
- [ ] `get_all()` 在无数据时返回空数组
- [ ] `delete_record()` 删除不存在的 ID 时不报错
- [ ] 每次写操作后调用 `store.save()` 立即刷盘（NFR11）
- [ ] 所有存储错误使用 `AppError::Storage` 变体
- [ ] `storage/mod.rs` 注册 `pub mod history;`
- [ ] `commands/history.rs` 实现 `get_history` 和 `delete_history` Tauri commands
- [ ] commands 通过 `.map_err(|e| e.to_string())` 转换错误
- [ ] `commands/mod.rs` 注册 `pub mod history;`
- [ ] `lib.rs` invoke_handler 注册 `get_history` 和 `delete_history`
- [ ] `upload_engine.rs` 在 `upload:file-complete` 事件发射后调用 `storage::history::add_record()` 保存记录
- [ ] 历史记录包含 `id`、`fileName`、`downloadUrl`、`fileSize`、`uploadedAt`、`expiresAt` 六个字段
- [ ] `uploadedAt` 使用 `chrono::Utc::now().to_rfc3339()` 生成 ISO 8601 格式
- [ ] `expiresAt` 使用 `now + Duration::days(config.lifetime)` 计算
- [ ] 保存失败仅 `log::error!`，不影响上传流程
- [ ] `src/types/history.ts` 定义 `HistoryRecord` TypeScript 接口
- [ ] `src/lib/tauri.ts` 添加 `getHistory()` 和 `deleteHistory()` IPC 封装
- [ ] `src/stores/historyStore.ts` 实现 `records` 状态 + `loadHistory()` + `deleteRecord()` actions
- [ ] Zustand 使用精确选择器，不解构整个 store
- [ ] Rust 测试：HistoryRecord serde camelCase 键名验证
- [ ] Rust 测试：HistoryRecord serde roundtrip
- [ ] Rust 测试：storage CRUD 操作覆盖（add、get_all、delete）
- [ ] 前端测试：historyStore loadHistory 填充 records
- [ ] 前端测试：historyStore deleteRecord 移除对应记录
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml` 无 lint 警告
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误

---

## Review Feedback (Round 1)

**Reviewer:** Story Reviewer (C3)
**Verdict:** NEEDS_IMPROVE
**Date:** 2026-02-11

### Checklist Results

| # | Item | Result | Feedback |
|---|------|--------|----------|
| RC-1 | AC clarity | PASS | All ACs use Given/When/Then format, specific and testable |
| RC-2 | Task sequence | PASS | Dependencies correct, no circular deps, execution order valid |
| RC-3 | Technical feasibility | **FAIL** | `download_url` use-after-move compile error in proposed upload_engine.rs integration code (see Issue 1) |
| RC-4 | Requirement consistency | **FAIL** | AC-1/AC-3 save-after-emit ordering contradicts NFR11 crash safety goal (see Issue 2) |
| RC-5 | Scope sizing | PASS | Reasonable scope for single sprint cycle |
| RC-6 | Dependency documentation | PASS | Story 3-6/3-7 dependencies and 4-2/5-1 downstream correctly documented |
| RC-7 | File scope declaration | PASS | New/modified/forbidden file lists complete and accurate |
| RC-8 | API/method existence | PASS (with warnings) | All codebase references verified; 2 warnings on external API naming (see Warnings) |

### Issue 1 (RC-3 FAIL): `download_url` use-after-move in upload_engine.rs

**Location:** Technical Design section 4 / AC-1 / Task 5

In `upload_engine.rs:207-216`, the existing code is:
```rust
let download_url = task.shards[0].download_url.clone().unwrap_or_default(); // String
let _ = app.emit("upload:file-complete", FileCompletePayload {
    task_id,           // task_id: String — MOVED
    file_name: task.file_name.clone(),
    download_url,      // download_url: String — MOVED
    file_size: task.file_size,
});
```

After the emit, `download_url` is **moved** into `FileCompletePayload` and no longer available. The story's proposed code then uses `download_url.clone()` to build `HistoryRecord` — this will not compile.

**Fix:** Move the history record construction and save **BEFORE** the `app.emit()` call. This simultaneously fixes Issue 2 (crash safety ordering). The `download_url` variable is still available before the emit. The proposed code should become:

```rust
let download_url = task.shards[0].download_url.clone().unwrap_or_default();

// Save history record BEFORE emit (NFR11: crash-safe persistence)
let now = chrono::Utc::now();
let history_record = crate::models::history::HistoryRecord {
    id: uuid::Uuid::new_v4().simple().to_string(),
    file_name: task.file_name.clone(),
    download_url: download_url.clone(),
    file_size: task.file_size,
    uploaded_at: now.to_rfc3339(),
    expires_at: (now + chrono::Duration::days(config.lifetime as i64)).to_rfc3339(),
};
if let Err(e) = crate::storage::history::add_record(&app, history_record) {
    log::error!("Failed to save history record for '{}': {}", task.file_name, e);
}

// Emit event to frontend (download_url moves here)
let _ = app.emit("upload:file-complete", FileCompletePayload {
    task_id,
    file_name: task.file_name.clone(),
    download_url,
    file_size: task.file_size,
});

Ok(())
```

### Issue 2 (RC-4 FAIL): NFR11 save ordering contradiction

**Location:** AC-1, AC-3, Technical Design section 4

AC-1 states: "保存操作在 `upload:file-complete` 事件发射之后". AC-3 restates the same ordering. The design rationale claims this provides crash safety (NFR11).

**Contradiction:** Saving AFTER emit leaves a crash window between emit and save where the record would be lost. If the app crashes after emitting the event but before `add_record()` completes, the history record is permanently lost. Saving BEFORE emit eliminates this window entirely — the `upload:file-complete` event is merely a UI notification; if it is lost due to crash, the frontend will pick up the record on the next `loadHistory()` call when the app restarts.

**Fix:** Update AC-1 and AC-3 to state save happens BEFORE emit. Change: "位于 `upload:file-complete` 事件发射之后" → "位于 `upload:file-complete` 事件发射之前". Update the data flow diagram accordingly. This also resolves Issue 1.

### Warnings (RC-8)

1. **`chrono::Duration::days()` deprecation:** In chrono 0.4.35+, `Duration::days()` is deprecated in favor of `chrono::TimeDelta::days()`. If the project picks up chrono >= 0.4.35, `cargo clippy` will emit deprecation warnings. Consider using `chrono::TimeDelta::days(config.lifetime as i64)` instead, or pin chrono version to `"0.4"` and accept the warning risk. Non-blocking.

2. **`Store<tauri::Wry>` type parameter in `load_records`:** The `load_records` helper signature uses `Store<tauri::Wry>`. In tauri-plugin-store v2, the generic parameter may be `Store<R: Runtime>` rather than hard-coded `Wry`. Dev runner should verify the actual type returned by `app.store()` and adjust accordingly. Non-blocking.

### API Verifications

| Reference | Location | Codebase File | Result |
|-----------|----------|---------------|--------|
| `upload:file-complete` emit | AC-1 | `upload_engine.rs:208-216` | Confirmed |
| `download_url` variable | Task 5 | `upload_engine.rs:207` | Confirmed (but moved at :213) |
| `AppError::Storage(String)` | AC-4 | `error.rs:18` | Confirmed |
| `models/mod.rs` TODO | Task 2 | `models/mod.rs:9` | Confirmed |
| `storage/mod.rs` TODO | Task 3 | `storage/mod.rs:7` | Confirmed |
| `commands/mod.rs` TODO | Task 4 | `commands/mod.rs:10` | Confirmed |
| `tauri-plugin-store` registered | AC-2 | `lib.rs:15` | Confirmed |
| `tauri-plugin-store` in Cargo.toml | AC-2 | `Cargo.toml:18` | Confirmed |
| `invoke_handler` location | Task 4 | `lib.rs:21-25` | Confirmed |
| `historyStore.ts` placeholder | AC-8 | `historyStore.ts:1-11` | Confirmed |
| `lib/tauri.ts` structure | AC-7 | `tauri.ts:1-46` | Confirmed |
| `setTaskFileComplete` action | cross-ref | `uploadStore.ts:18,129` | Confirmed |
| `FileCompletePayload` interface | cross-ref | `types/upload.ts:61-66` | Confirmed |
| `chrono` NOT in Cargo.toml | Task 1 | `Cargo.toml:15-26` | Confirmed (needs adding) |
| `uuid` in Cargo.toml | Task 5 | `Cargo.toml:24` | Confirmed |
| `chrono::Duration::days()` | Task 5 | external crate | Warning: possibly deprecated |
| `Store<tauri::Wry>` | AC-4 | external crate | Warning: verify type param |
