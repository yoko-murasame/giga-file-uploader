# Story 5.1: 文件保留期选择

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 5-1 |
| Epic | Epic 5: 上传配置与离线体验 |
| 前置依赖 | Story 4-1 (上传历史持久化存储) -- 已完成, Story 3-7 (底部操作栏与上传触发按钮) -- 已完成 |
| FRs 覆盖 | FR23 (保留期选择) |
| NFRs 关联 | NFR11 (崩溃不丢失设置) |

## User Story

As a 用户,
I want 在上传前选择文件在 gigafile.nu 上的保留期限,
So that 我可以根据需要控制链接的有效时间。

---

## Acceptance Criteria

### AC-1: 保留期选择控件展示

**Given** 用户在"上传" Tab，待上传列表已有文件
**When** 查看底部固定区域（UploadActionBar，已由 Story 3.7 实现）
**Then** [开始上传] 按钮左侧新增保留期选择控件（`RetentionSelector` 组件，使用 Radix UI DropdownMenu），替换原有的硬编码默认值（FR23）
**And** 可选天数：3 / 5 / 7 / 14 / 30 / 60 / 100 天
**And** 控件显示格式为 "N 天" + 下拉箭头图标（Lucide React `ChevronDown`）
**And** 默认值为 7 天
**And** 下拉菜单项使用 Radix UI DropdownMenu.Item，当前选中项带有勾号标记（Lucide React `Check`）

### AC-2: 选择保留期更新 uploadStore

**Given** 用户点击保留期选择控件
**When** 选择了不同的保留期天数（例如 30 天）
**Then** `uploadStore` 的 `retentionDays` 状态更新为所选值
**And** 选择立即生效，无需额外确认
**And** RetentionSelector 控件上显示的文字更新为 "30 天"

### AC-3: 上传时传递保留期

**Given** 用户已选择保留期（例如 14 天）并点击 [开始上传] 按钮
**When** 上传请求发送到 Rust 后端
**Then** `uploadStore.startUpload()` 使用 `retentionDays` 状态值（而非硬编码 7）作为 `lifetime` 参数
**And** `lifetime` 字段通过 `UploadConfig` 传递给 Rust `start_upload` command
**And** Rust 上传引擎将 `lifetime` 传递给 gigafile.nu API（`upload_chunk` 的 `lifetime` 参数）
**And** `lifetime` 同时用于历史记录过期日期计算（`upload_engine.rs` 中已有 `config.lifetime` 计算逻辑，Story 4-1 实现）

### AC-4: 用户偏好持久化到 settings.json

**Given** 用户选择了非默认的保留期（例如 30 天）
**When** 选择完成
**Then** 保留期偏好通过 `uploadStore.setRetentionDays()` action 保存到 `settings.json`（通过 `save_settings` IPC command）
**And** 使用 `tauri-plugin-store` 写入 `settings.json` 的 `"settings"` key
**And** 每次写操作后立即调用 `store.save()` 刷盘

### AC-5: 应用启动时恢复偏好

**Given** 用户之前选择过保留期偏好（例如 30 天）并关闭了应用
**When** 用户重新启动 GigaFile 应用
**Then** `uploadStore` 在初始化时通过 `get_settings` IPC command 读取 `settings.json`
**And** `retentionDays` 状态恢复为上次保存的值（30 天）
**And** RetentionSelector 控件显示 "30 天"
**And** 如果 `settings.json` 不存在或无 `retentionDays` 字段，使用默认值 7 天

### AC-6: settings 后端模块

**Given** `storage/settings.rs` 模块
**When** 被 Rust commands 或前端 IPC 调用
**Then** 提供以下两个公开函数：

```rust
/// 读取应用设置，不存在时返回默认值
pub fn get_settings(app: &tauri::AppHandle) -> crate::error::Result<AppSettings>;

/// 保存应用设置，立即持久化到磁盘
pub fn save_settings(app: &tauri::AppHandle, settings: AppSettings) -> crate::error::Result<()>;
```

**And** 所有错误使用 `AppError::Storage` 变体

### AC-7: models/settings.rs 定义 AppSettings 结构体

**Given** `models/settings.rs` 模块
**When** 定义 IPC 边界数据结构
**Then** 定义如下结构体：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Retention days preference: 3/5/7/14/30/60/100
    pub retention_days: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { retention_days: 7 }
    }
}
```

**And** 遵循 `#[serde(rename_all = "camelCase")]` 规范

### AC-8: commands/settings.rs 定义 IPC commands

**Given** `commands/settings.rs` 模块
**When** 前端通过 `invoke()` 调用
**Then** 提供以下两个 Tauri commands：

```rust
#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String>;

#[tauri::command]
pub fn save_settings(settings: AppSettings, app: tauri::AppHandle) -> Result<(), String>;
```

**And** command 内部调用 `storage::settings` 对应函数，通过 `.map_err(|e| e.to_string())` 转换错误
**And** `lib.rs` 的 `invoke_handler` 注册 `get_settings` 和 `save_settings`

### AC-9: 前端类型与 IPC 封装

**Given** 前端需要与后端设置交互
**When** 实现前端集成层
**Then** 新建 `src/types/settings.ts` 定义 TypeScript 接口：

```typescript
export interface AppSettings {
  retentionDays: number;
}
```

**And** 在 `src/lib/tauri.ts` 添加 IPC 封装函数：

```typescript
export async function getSettings(): Promise<AppSettings>;
export async function saveSettings(settings: AppSettings): Promise<void>;
```

### AC-10: 单元测试

**Given** 后端和前端功能实现完成
**When** 执行测试
**Then** Rust 测试（`models/settings.rs` 内联 `#[cfg(test)] mod tests`）：
- **AppSettings serde camelCase**：序列化后 JSON key 为 `retentionDays`（camelCase 格式）
- **AppSettings serde roundtrip**：序列化 + 反序列化后数据一致
- **AppSettings default**：`Default::default()` 返回 `retention_days: 7`

**And** Rust 测试（`storage/settings.rs` 内联 `#[cfg(test)] mod tests`）：
- **核心逻辑测试**：验证 `AppSettings` 的 JSON 序列化/反序列化往返正确
- **默认值回退测试**：验证当 store 中无 settings key 时返回默认值

**And** 前端测试（`src/components/upload/RetentionSelector.test.tsx` 新建）：
- **渲染默认值**：组件默认显示 "7 天"
- **选择更新**：选择不同保留期后显示值更新

**And** `pnpm test` 前端测试通过
**And** `pnpm lint` ESLint 无错误
**And** `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过

---

## Technical Design

### 现状分析

Story 3-7 和 4-1 已建立关键基础设施：

- `src/components/upload/UploadActionBar.tsx` -- 底部操作栏，第 42 行 `await startUpload(7)` 硬编码 7 天保留期，需要替换为动态值
- `src/stores/uploadStore.ts` -- `startUpload(lifetime: number)` action 已接受 `lifetime` 参数（第 14 行），通过 `startUploadIpc(files, { lifetime })` 传递给后端
- `src-tauri/src/models/upload.rs` -- `UploadConfig { lifetime: u32 }` 已定义（第 13-16 行），后端已支持动态 lifetime
- `src-tauri/src/services/upload_engine.rs` -- `upload_file` 函数使用 `config.lifetime` 计算历史记录过期日期（Story 4-1 实现）并传递给 API
- `src-tauri/src/storage/mod.rs:8` -- 预留 TODO: `pub mod settings;`
- `src-tauri/src/commands/mod.rs:11` -- 预留 TODO: `pub mod settings;`
- `src/lib/tauri.ts` -- IPC 封装入口，需添加 `getSettings()`、`saveSettings()` 函数
- `src-tauri/src/lib.rs` -- `invoke_handler` 在第 21-27 行，需追加 `get_settings` 和 `save_settings` commands

**关键洞察 -- 上传链路已支持动态 lifetime：**

Story 3-7 设计时已预见 5-1 的需求，`uploadStore.startUpload(lifetime)` 和 `UploadConfig.lifetime` 从一开始就是参数化的。本 Story 只需：(1) 添加 UI 控件让用户选择 lifetime 值；(2) 替换 UploadActionBar 中的硬编码 `7`；(3) 添加设置持久化让偏好跨会话保留。

### 新增/修改模块

#### 1. `models/settings.rs` -- AppSettings 数据结构（新建）

```rust
use serde::{Deserialize, Serialize};

/// Application-level settings persisted to settings.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// File retention days on gigafile.nu: 3/5/7/14/30/60/100
    pub retention_days: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { retention_days: 7 }
    }
}
```

#### 2. `storage/settings.rs` -- 设置读写（新建）

```rust
use tauri_plugin_store::StoreExt;
use crate::error::AppError;
use crate::models::settings::AppSettings;

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

pub fn get_settings(app: &tauri::AppHandle) -> crate::error::Result<AppSettings> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::Storage(e.to_string()))?;
    let settings = store
        .get(SETTINGS_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(settings)
}

pub fn save_settings(app: &tauri::AppHandle, settings: AppSettings) -> crate::error::Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::Storage(e.to_string()))?;
    store.set(SETTINGS_KEY, serde_json::to_value(&settings)?);
    store.save().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}
```

> **设计与 `storage/history.rs` 一致**：使用相同的 `StoreExt` trait、`AppError::Storage` 错误变体、写后立即 `save()` 模式。

#### 3. `commands/settings.rs` -- IPC commands（新建）

```rust
use crate::models::settings::AppSettings;
use crate::storage::settings;

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    settings::get_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(settings_data: AppSettings, app: tauri::AppHandle) -> Result<(), String> {
    settings::save_settings(&app, settings_data).map_err(|e| e.to_string())
}
```

#### 4. `lib.rs` -- 注册新 commands（修改）

```rust
.invoke_handler(tauri::generate_handler![
    commands::files::resolve_dropped_paths,
    commands::upload::start_upload,
    commands::upload::cancel_upload,
    commands::history::get_history,
    commands::history::delete_history,
    commands::settings::get_settings,     // 新增
    commands::settings::save_settings,    // 新增
])
```

#### 5. `src/types/settings.ts` -- 前端类型定义（新建）

```typescript
/** Application settings persisted to settings.json */
export interface AppSettings {
  retentionDays: number;
}
```

#### 6. `src/lib/tauri.ts` -- IPC 封装（修改）

```typescript
import type { AppSettings } from '@/types/settings';

/** Get application settings. Returns defaults if no settings saved. */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings');
}

/** Save application settings. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings', { settingsData: settings });
}
```

> **注意**：`save_settings` command 的 Rust 参数名为 `settings_data`，Tauri IPC 自动映射为 camelCase `settingsData`。不使用 `settings` 作为参数名以避免与模块名冲突。

#### 7. `src/stores/uploadStore.ts` -- 添加 retentionDays 状态（修改）

在 `UploadState` interface 和 store 中添加：

```typescript
interface UploadState {
  // ... existing fields ...
  retentionDays: number;
  setRetentionDays: (days: number) => void;
  loadRetentionPreference: () => Promise<void>;
  // startUpload signature unchanged: (lifetime: number) => Promise<void>
}
```

新增 actions：

```typescript
retentionDays: 7, // default

setRetentionDays: async (days) => {
  set({ retentionDays: days });
  try {
    await saveSettingsIpc({ retentionDays: days });
  } catch (error) {
    console.error('Failed to save retention preference:', error);
  }
},

loadRetentionPreference: async () => {
  try {
    const settings = await getSettingsIpc();
    set({ retentionDays: settings.retentionDays });
  } catch (error) {
    console.error('Failed to load retention preference:', error);
  }
},
```

> **`startUpload` 不修改**：`startUpload` 签名保持 `(lifetime: number)` 不变，调用方（UploadActionBar）传入 `retentionDays` 值。

#### 8. `src/components/upload/RetentionSelector.tsx` -- 保留期选择器（新建）

```typescript
import { ChevronDown, Check } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { useUploadStore } from '@/stores/uploadStore';

const RETENTION_OPTIONS = [3, 5, 7, 14, 30, 60, 100] as const;

interface RetentionSelectorProps {
  disabled?: boolean;
}

function RetentionSelector({ disabled }: RetentionSelectorProps) {
  const retentionDays = useUploadStore((s) => s.retentionDays);
  const setRetentionDays = useUploadStore((s) => s.setRetentionDays);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface
                   px-3 py-2 text-sm text-text-primary hover:bg-bg
                   focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none
                   disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="选择文件保留期限"
      >
        {retentionDays} 天
        <ChevronDown className="h-4 w-4 text-text-secondary" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[120px] rounded-md border border-border bg-surface
                     p-1 shadow-md"
          sideOffset={4}
          align="start"
        >
          {RETENTION_OPTIONS.map((days) => (
            <DropdownMenu.Item
              key={days}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5
                         text-sm text-text-primary outline-none
                         data-[highlighted]:bg-bg"
              onSelect={() => setRetentionDays(days)}
            >
              <Check
                className={`h-4 w-4 ${days === retentionDays ? 'opacity-100' : 'opacity-0'}`}
              />
              {days} 天
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default RetentionSelector;
```

#### 9. `src/components/upload/UploadActionBar.tsx` -- 集成 RetentionSelector（修改）

变更点：

1. 导入 `RetentionSelector` 组件和 `retentionDays` 状态
2. 将硬编码 `startUpload(7)` 替换为 `startUpload(retentionDays)`
3. 在 [开始上传] 按钮左侧添加 `<RetentionSelector />` 组件

```typescript
import RetentionSelector from '@/components/upload/RetentionSelector';

// 在组件内部：
const retentionDays = useUploadStore((s) => s.retentionDays);

// handleStartUpload 修改：
const handleStartUpload = async () => {
  setIsStarting(true);
  try {
    await startUpload(retentionDays); // 替换硬编码 7
  } finally {
    setIsStarting(false);
  }
};

// JSX 中，在 [开始上传] 按钮前添加 RetentionSelector：
// <div className="flex items-center gap-3">
//   <RetentionSelector disabled={isUploading} />
//   <button ...>开始上传</button>
// </div>
```

#### 10. `src/App.tsx` -- 启动时加载设置偏好（修改）

在 `App.tsx` 的 `useEffect` 初始化逻辑中调用 `loadRetentionPreference()`：

```typescript
import { useUploadStore } from '@/stores/uploadStore';

// 在 App 组件中：
useEffect(() => {
  useUploadStore.getState().loadRetentionPreference();
}, []);
```

> **注意**：使用 `getState()` 避免订阅 store 变化导致 App 重渲染。如果 App.tsx 已有初始化 `useEffect`，将此调用合并到已有的 effect 中。

### 数据流

```
用户选择保留期（RetentionSelector 下拉菜单）：
  -> RetentionSelector onSelect()
  -> uploadStore.setRetentionDays(days)
  -> set({ retentionDays: days })  -- 立即更新 UI
  -> saveSettingsIpc({ retentionDays: days })  -- 异步持久化
    -> invoke('save_settings', { settingsData })
    -> commands::settings::save_settings()
    -> storage::settings::save_settings()
    -> tauri-plugin-store 写入 settings.json
    -> store.save() 刷盘

用户点击 [开始上传]：
  -> UploadActionBar handleStartUpload()
  -> uploadStore.startUpload(retentionDays)  -- 使用当前 retentionDays 值
  -> startUploadIpc(files, { lifetime: retentionDays })
  -> commands::upload::start_upload(files, config)
  -> upload_engine::start() 使用 config.lifetime
  -> api::v1::upload_chunk() 的 lifetime 参数
  -> history 过期日期计算使用 config.lifetime（Story 4-1 已实现）

应用启动时恢复偏好：
  -> App.tsx useEffect()
  -> uploadStore.loadRetentionPreference()
  -> getSettingsIpc()
    -> invoke('get_settings')
    -> commands::settings::get_settings()
    -> storage::settings::get_settings()
    -> settings.json 存在 -> 返回保存的值
    -> settings.json 不存在 -> 返回 AppSettings::default() (retention_days: 7)
  -> set({ retentionDays: settings.retentionDays })
  -> RetentionSelector 显示恢复的值
```

### 设计决策

1. **retentionDays 放在 uploadStore 而非 appStore**：保留期直接关联上传配置，属于上传域状态。`uploadStore` 已管理 `startUpload(lifetime)` 调用，将 `retentionDays` 放在同一 store 中保持内聚。不新增 store（项目限制为 3 个 store）。

2. **设置持久化采用乐观更新**：`setRetentionDays()` 先 `set()` 更新内存状态（UI 立即响应），再异步 `saveSettingsIpc()` 持久化。即使持久化失败，当前会话的上传仍使用正确的保留期。

3. **AppSettings 使用 `Default` trait**：当 `settings.json` 不存在（首次启动）时，`get_settings()` 返回 `AppSettings::default()`（`retention_days: 7`），与 Story 3-7 的硬编码默认值一致，行为无缝衔接。

4. **独立 settings.json 文件**：设置与历史记录分开存储（`settings.json` vs `history.json`），职责清晰。两者共享 `tauri-plugin-store` 基础设施和相同的读写模式。

5. **RetentionSelector 作为独立组件**：从 UploadActionBar 中提取为独立组件 `RetentionSelector.tsx`，遵循"一个组件一个文件"规则，保持 UploadActionBar 简洁。

6. **Radix UI DropdownMenu 而非 Select**：Epic AC 明确指定使用 DropdownMenu。DropdownMenu 提供完整的键盘导航和无障碍支持（WCAG 2.1 AA），7 个选项的固定列表适合 dropdown 模式。

7. **save_settings 参数命名为 settings_data**：避免与 Rust `settings` 模块名冲突。Tauri IPC 自动将 `settings_data` 映射为 camelCase `settingsData`，前端 `invoke('save_settings', { settingsData: ... })` 传参。

8. **uploadStore.startUpload 签名不变**：保持 `startUpload(lifetime: number)` 不变，避免破坏已有接口。调用方从 `startUpload(7)` 改为 `startUpload(retentionDays)`，变更最小。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3-7（上传操作栏） | 本 Story 修改 3-7 的 UploadActionBar，将硬编码 `startUpload(7)` 替换为动态 `startUpload(retentionDays)`，在按钮左侧添加 RetentionSelector |
| Story 4-1（历史持久化） | 本 Story 依赖 4-1 的 `config.lifetime` 过期日期计算逻辑，用户选择的保留期自动传递到历史记录过期计算 |
| Story 5-2（离线模式） | Story 5-2 将利用本 Story 的 `storage/settings.rs` 离线读取设置，确保无网络时设置正常加载 |

---

## Tasks

### Task 1: 定义 AppSettings 结构体

**文件:** `src-tauri/src/models/settings.rs`（新建），`src-tauri/src/models/mod.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 创建 `src-tauri/src/models/settings.rs`，定义 `AppSettings` 结构体（`#[serde(rename_all = "camelCase")]`，实现 `Default` trait，默认 `retention_days: 7`）
1.2. 在 `src-tauri/src/models/mod.rs` 中添加 `pub mod settings;`
1.3. 添加内联 `#[cfg(test)] mod tests`：serde camelCase 键名验证、序列化/反序列化 roundtrip 测试、Default 值测试

### Task 2: 实现 storage/settings.rs 设置读写

**文件:** `src-tauri/src/storage/settings.rs`（新建），`src-tauri/src/storage/mod.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 创建 `src-tauri/src/storage/settings.rs`，实现 `get_settings()` 和 `save_settings()` 函数
2.2. `get_settings()` 在 `"settings"` key 不存在时返回 `AppSettings::default()`（首次使用场景）
2.3. `save_settings()` 每次写操作后调用 `store.save()` 确保立即持久化
2.4. 所有错误使用 `AppError::Storage` 变体
2.5. 在 `src-tauri/src/storage/mod.rs` 中将 TODO 注释替换为 `pub mod settings;`
2.6. 添加内联 `#[cfg(test)] mod tests`：核心逻辑测试（JSON roundtrip）、默认值回退测试

### Task 3: 实现 commands/settings.rs IPC commands

**文件:** `src-tauri/src/commands/settings.rs`（新建），`src-tauri/src/commands/mod.rs`（修改），`src-tauri/src/lib.rs`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 创建 `src-tauri/src/commands/settings.rs`，实现 `get_settings` 和 `save_settings` Tauri commands
3.2. 在 `src-tauri/src/commands/mod.rs` 中将 TODO 注释替换为 `pub mod settings;`
3.3. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册 `commands::settings::get_settings` 和 `commands::settings::save_settings`

### Task 4: 前端类型与 IPC 封装

**文件:** `src/types/settings.ts`（新建），`src/lib/tauri.ts`（修改）
**依赖:** Task 3

**Subtasks:**

4.1. 创建 `src/types/settings.ts`，定义 `AppSettings` TypeScript 接口
4.2. 在 `src/lib/tauri.ts` 中添加 `getSettings()` 和 `saveSettings()` IPC 封装函数
4.3. 添加 `import type { AppSettings } from '@/types/settings'`

### Task 5: uploadStore 添加 retentionDays 状态

**文件:** `src/stores/uploadStore.ts`（修改）
**依赖:** Task 4

**Subtasks:**

5.1. 在 `UploadState` interface 中添加 `retentionDays: number`、`setRetentionDays: (days: number) => void`、`loadRetentionPreference: () => Promise<void>`
5.2. 添加初始值 `retentionDays: 7`
5.3. 实现 `setRetentionDays` action：乐观更新 `set({ retentionDays: days })` + 异步 `saveSettingsIpc()`
5.4. 实现 `loadRetentionPreference` action：调用 `getSettingsIpc()` 加载保存的偏好
5.5. 在 `src/lib/tauri.ts` 中导入 `getSettings` 和 `saveSettings`，在 store 中使用

### Task 6: 创建 RetentionSelector 组件

**文件:** `src/components/upload/RetentionSelector.tsx`（新建）
**依赖:** Task 5

**Subtasks:**

6.1. 创建 `RetentionSelector.tsx`，使用 Radix UI DropdownMenu
6.2. 可选项：3 / 5 / 7 / 14 / 30 / 60 / 100 天
6.3. 当前选中项使用 `Check` 图标标记
6.4. 触发器使用 `ChevronDown` 图标
6.5. 调用 `uploadStore.setRetentionDays()` 更新选择
6.6. 支持 `disabled` prop（上传中禁用选择）
6.7. 添加 `aria-label="选择文件保留期限"` 无障碍属性

### Task 7: 修改 UploadActionBar 集成 RetentionSelector

**文件:** `src/components/upload/UploadActionBar.tsx`（修改）
**依赖:** Task 6

**Subtasks:**

7.1. 导入 `RetentionSelector` 组件
7.2. 在 [开始上传] 按钮左侧添加 `<RetentionSelector />` 组件
7.3. 将 `startUpload(7)` 替换为 `startUpload(retentionDays)`（从 uploadStore 读取）
7.4. 上传进行中时 RetentionSelector 传入 `disabled={true}`
7.5. 保持 UploadActionBar 的所有现有功能不变

### Task 8: App.tsx 启动时加载设置偏好

**文件:** `src/App.tsx`（修改）
**依赖:** Task 5

**Subtasks:**

8.1. 在 App 组件的初始化 `useEffect` 中调用 `useUploadStore.getState().loadRetentionPreference()`
8.2. 使用 `getState()` 避免订阅导致 App 重渲染

### Task 9: 编写测试

**文件:** `src/components/upload/RetentionSelector.test.tsx`（新建）
**依赖:** Task 6, Task 7

**Subtasks:**

9.1. `RetentionSelector.test.tsx`：测试组件渲染默认显示 "7 天"
9.2. `RetentionSelector.test.tsx`：测试选择不同保留期后显示值更新

### Task 10: 代码质量验证

**文件:** 无新文件
**依赖:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9

**Subtasks:**

10.1. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认 Rust 测试通过
10.2. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无 lint 警告
10.3. 执行 `pnpm test` 确认前端测试通过
10.4. 执行 `pnpm lint` 确认 ESLint 无错误
10.5. 执行 `pnpm format:check` 确认 Prettier 格式正确

---

## Task 依赖顺序

```
Task 1 (AppSettings 模型) ──-> Task 2 (storage/settings CRUD) ──-> Task 3 (IPC commands)
                                                                          |
                                                                          v
                                                                    Task 4 (前端类型/IPC)
                                                                          |
                                                                          v
                                                                    Task 5 (uploadStore retentionDays)
                                                                       |           |
                                                                       v           v
                                                              Task 6 (Selector)  Task 8 (App.tsx 启动加载)
                                                                       |
                                                                       v
                                                              Task 7 (UploadActionBar 集成)
                                                                       |
                                                                       v
                                                              Task 9 (测试)
                                                                       |
                                                                       v
                                                              Task 10 (代码质量验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/models/settings.rs` | `AppSettings` 结构体定义（`#[serde(rename_all = "camelCase")]`），`Default` 实现，含 serde 测试 |
| `src-tauri/src/storage/settings.rs` | 设置读写函数：`get_settings()`、`save_settings()`，使用 `tauri-plugin-store` 读写 `settings.json`，含单元测试 |
| `src-tauri/src/commands/settings.rs` | Tauri IPC commands：`get_settings`、`save_settings` |
| `src/types/settings.ts` | `AppSettings` TypeScript 接口定义 |
| `src/components/upload/RetentionSelector.tsx` | 保留期选择器组件，Radix UI DropdownMenu |
| `src/components/upload/RetentionSelector.test.tsx` | RetentionSelector 组件测试 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src-tauri/src/models/mod.rs` | 添加 `pub mod settings;` |
| `src-tauri/src/storage/mod.rs` | 将 TODO 注释替换为 `pub mod settings;` |
| `src-tauri/src/commands/mod.rs` | 将 TODO 注释替换为 `pub mod settings;` |
| `src-tauri/src/lib.rs` | 在 `invoke_handler` 中注册 `get_settings` 和 `save_settings` commands |
| `src/lib/tauri.ts` | 添加 `getSettings()` 和 `saveSettings()` IPC 封装函数 |
| `src/stores/uploadStore.ts` | 添加 `retentionDays` 状态、`setRetentionDays()` 和 `loadRetentionPreference()` actions |
| `src/components/upload/UploadActionBar.tsx` | 集成 RetentionSelector 组件，替换硬编码 `startUpload(7)` 为 `startUpload(retentionDays)` |
| `src/App.tsx` | 启动时调用 `loadRetentionPreference()` |

### 禁止修改

- `src-tauri/src/api/` -- API 层不涉及（lifetime 已通过 UploadConfig 传递）
- `src-tauri/src/services/` -- 上传引擎不涉及（已通过 config.lifetime 支持动态值）
- `src-tauri/src/error.rs` -- `AppError::Storage` 已存在，无需修改
- `src-tauri/src/models/upload.rs` -- `UploadConfig.lifetime` 已定义，无需修改
- `src-tauri/src/models/history.rs` -- 历史模型不涉及
- `src-tauri/src/storage/history.rs` -- 历史存储不涉及
- `src-tauri/src/commands/upload.rs` -- 上传 commands 不涉及
- `src-tauri/src/commands/history.rs` -- 历史 commands 不涉及
- `src-tauri/Cargo.toml` -- 无需新依赖（Radix UI 和 Lucide React 已在前端安装）
- `src/stores/historyStore.ts` -- 历史 store 不涉及
- `src/stores/appStore.ts` -- 应用 store 不涉及
- `src/types/upload.ts` -- 上传类型不涉及
- `src/types/history.ts` -- 历史类型不涉及
- `src/hooks/` -- 无需新 hook
- `src/components/history/` -- 历史 UI 不涉及
- `src/components/shared/` -- 共享组件不涉及
- `src/App.css` -- 设计 Token 不变
- `src/lib/format.ts` -- 格式化工具不涉及

---

## Technical Notes

### tauri-plugin-store 设置存储

```rust
use tauri_plugin_store::StoreExt;

// 获取或创建 store（自动关联 settings.json 文件）
let store = app.store("settings.json")?;

// 读取：返回 Option<serde_json::Value>
let value = store.get("settings");

// 写入：设置内存中的值
store.set("settings", serde_json::to_value(&settings)?);

// 持久化：将内存中的值写入磁盘文件
store.save()?;
```

与 `storage/history.rs` 使用相同的 API 模式，存储在同一应用数据目录（macOS: `~/Library/Application Support/nu.gigafile.uploader/`）。

### Radix UI DropdownMenu 使用

项目已安装 `radix-ui` 统一包 v1.4.3，从 `@radix-ui/react-dropdown-menu` 导入组件：

```typescript
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
```

关键组件：`Root`、`Trigger`、`Portal`、`Content`、`Item`。样式通过 Tailwind CSS 类直接应用。

### Rust 测试注意事项

`storage/settings.rs` 的函数依赖 `tauri::AppHandle` 和 `tauri-plugin-store`。与 `storage/history.rs` 采用相同策略：

1. 将核心逻辑（JSON 序列化/反序列化、默认值回退）提取为可独立测试的逻辑
2. `models/settings.rs` 的 serde 测试不依赖 Tauri 运行环境，可直接测试

### UploadActionBar 修改范围

修改最小化：
- 第 42 行：`await startUpload(7)` -> `await startUpload(retentionDays)`
- 新增一行：`const retentionDays = useUploadStore((s) => s.retentionDays);`
- JSX 中在按钮前添加 `<RetentionSelector />` 组件
- 现有的统计文本、按钮状态、清空逻辑完全不变

### 前端测试 mock 策略

```typescript
// RetentionSelector.test.tsx
import { vi } from 'vitest';

// Mock lib/tauri.ts 的 IPC 函数
vi.mock('@/lib/tauri', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));
```

使用 Vitest 的 `vi.mock` 拦截 IPC 调用，验证组件和 store 行为。遵循项目中已有的 mock 模式。

---

## Definition of Done

- [ ] `models/settings.rs` 定义 `AppSettings` 结构体，`#[serde(rename_all = "camelCase")]`，实现 `Default` trait（`retention_days: 7`）
- [ ] `models/mod.rs` 注册 `pub mod settings;`
- [ ] `storage/settings.rs` 实现 `get_settings()` 和 `save_settings()` 两个函数
- [ ] `get_settings()` 在无数据时返回 `AppSettings::default()`
- [ ] `save_settings()` 每次写操作后调用 `store.save()` 立即刷盘
- [ ] 所有存储错误使用 `AppError::Storage` 变体
- [ ] `storage/mod.rs` 将 TODO 替换为 `pub mod settings;`
- [ ] `commands/settings.rs` 实现 `get_settings` 和 `save_settings` Tauri commands
- [ ] commands 通过 `.map_err(|e| e.to_string())` 转换错误
- [ ] `commands/mod.rs` 将 TODO 替换为 `pub mod settings;`
- [ ] `lib.rs` invoke_handler 注册 `get_settings` 和 `save_settings`
- [ ] `src/types/settings.ts` 定义 `AppSettings` TypeScript 接口
- [ ] `src/lib/tauri.ts` 添加 `getSettings()` 和 `saveSettings()` IPC 封装
- [ ] `uploadStore.ts` 添加 `retentionDays` 状态（默认 7）
- [ ] `uploadStore.ts` 实现 `setRetentionDays()` action（乐观更新 + 异步持久化）
- [ ] `uploadStore.ts` 实现 `loadRetentionPreference()` action
- [ ] `RetentionSelector.tsx` 使用 Radix UI DropdownMenu 实现保留期选择
- [ ] 可选天数：3 / 5 / 7 / 14 / 30 / 60 / 100 天
- [ ] 当前选中项带有 Check 图标标记
- [ ] 支持 `disabled` prop
- [ ] 具有 `aria-label` 无障碍属性
- [ ] `UploadActionBar.tsx` 集成 RetentionSelector，替换硬编码 `startUpload(7)` 为 `startUpload(retentionDays)`
- [ ] 上传中 RetentionSelector 禁用
- [ ] `App.tsx` 启动时调用 `loadRetentionPreference()` 恢复偏好
- [ ] Zustand 使用精确选择器，不解构整个 store
- [ ] Rust 测试：AppSettings serde camelCase 键名验证
- [ ] Rust 测试：AppSettings serde roundtrip
- [ ] Rust 测试：AppSettings Default 值为 retention_days: 7
- [ ] Rust 测试：storage settings 核心逻辑测试
- [ ] 前端测试：RetentionSelector 渲染默认值
- [ ] 前端测试：RetentionSelector 选择更新
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml` 无 lint 警告
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误
