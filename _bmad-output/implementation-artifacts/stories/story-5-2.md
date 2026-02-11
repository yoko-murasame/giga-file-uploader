# Story 5.2: 离线模式与网络状态感知

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 5-2 |
| Epic | Epic 5: 上传配置与离线体验 |
| 前置依赖 | Story 5-1 (文件保留期选择) -- 已完成 |
| FRs 覆盖 | FR26 (离线可用) |
| NFRs 关联 | NFR4 (冷启动 <3s), NFR9 (失败率为 0), NFR10 (50 次静默重试) |

## User Story

As a 用户,
I want 在无网络状态下仍能正常打开应用并查看历史记录,
So that 我在离线时也能找到之前上传的链接信息。

---

## Acceptance Criteria

### AC-1: 无网络启动 -- 应用正常打开

**Given** 用户在无网络状态下启动 GigaFile
**When** 应用加载
**Then** 应用正常打开，显示主界面（FR26）
**And** 历史记录正常加载和展示（`get_history` 读取本地 `history.json`，不依赖网络）
**And** 设置正常读取（`get_settings` 读取本地 `settings.json`，不依赖网络）
**And** 应用启动过程中的网络检测失败不阻塞 UI 渲染，不弹出错误对话框
**And** `appStore.isOnline` 设置为 `false`

### AC-2: 无网络上传 -- 温和提示阻止上传

**Given** 用户在无网络状态下已添加文件到上传队列
**When** 查看底部操作栏
**Then** 操作栏统计信息区域显示离线提示文字："当前无网络连接，请连接网络后上传"（中文温和措辞）
**And** [开始上传] 按钮处于禁用状态（`disabled`），不可点击
**And** 待上传文件队列保持不变，不会被清空
**And** 用户仍可添加或移除待上传文件

### AC-3: 网络恢复后自动解除限制

**Given** 用户之前处于离线状态，待上传文件队列中有文件
**When** 网络连接恢复
**Then** `appStore.isOnline` 更新为 `true`
**And** 离线提示文字消失，操作栏恢复正常统计信息（文件数、总大小）
**And** [开始上传] 按钮恢复可用状态
**And** 用户无需刷新或重启应用即可直接上传

### AC-4: 上传中网络短暂中断 -- 静默重试覆盖

**Given** 用户正在上传文件，网络发生短暂中断
**When** 网络中断时间较短（重试引擎可覆盖）
**Then** 用户无感知，上传自动恢复（由 Story 3-4 的重试引擎处理，指数退避，50 次以下静默）
**And** 本 Story 不修改重试引擎逻辑，仅验证离线场景下现有重试机制正常工作

### AC-5: Rust 后端网络检测命令

**Given** 前端需要检测网络连接状态
**When** 调用 `check_network` Tauri command
**Then** Rust 后端执行轻量级 HTTP HEAD 请求到 `https://gigafile.nu`（超时 5 秒）
**And** 请求成功（任意 HTTP 状态码）返回 `true`（在线）
**And** 请求失败（网络错误、超时、DNS 解析失败）返回 `false`（离线）
**And** 该检测函数位于 `api/v1.rs` 中（遵循 "所有 gigafile.nu HTTP 交互在 api/ 内" 规则）
**And** 使用独立的 reqwest 客户端（短超时），不影响上传引擎的长连接客户端
**And** 检测函数不使用 `AppError` -- 连接失败是预期的正常状态而非错误

### AC-6: appStore 网络状态字段

**Given** `appStore` 需要管理应用级网络状态
**When** 扩展 `appStore`
**Then** 新增以下字段和 actions：

```typescript
interface AppState {
  currentTab: TabId;
  isOnline: boolean;
  setCurrentTab: (tab: TabId) => void;
  setOnlineStatus: (online: boolean) => void;
  checkNetworkStatus: () => Promise<void>;
}
```

**And** `isOnline` 初始值为 `true`（乐观默认，避免启动闪烁）
**And** `setOnlineStatus` 直接更新 `isOnline` 状态
**And** `checkNetworkStatus` 调用 `checkNetwork()` IPC 函数并更新 `isOnline`
**And** `checkNetworkStatus` 的 catch 分支将 `isOnline` 设为 `false`（IPC 调用本身失败也意味着问题）

### AC-7: 前端网络状态监听与生命周期

**Given** 应用需要实时感知网络状态变化
**When** 前端初始化网络监听
**Then** `App.tsx` 在 `useEffect` 中执行以下初始化：
1. 调用 `appStore.checkNetworkStatus()` 获取初始网络状态
2. 注册 `window.addEventListener('online', handler)` -- 浏览器上线事件触发时调用 `checkNetworkStatus()`（通过 Rust 后端验证实际连通性）
3. 注册 `window.addEventListener('offline', handler)` -- 浏览器离线事件触发时立即将 `isOnline` 设为 `false`（离线无需验证）

**And** useEffect cleanup 中移除事件监听器
**And** 网络检测失败不阻塞应用启动（`checkNetworkStatus` 内部 try-catch）
**And** 使用 `getState()` 调用 store actions，避免订阅导致 App 重渲染

### AC-8: IPC 封装与类型

**Given** 前端需要调用 `check_network` 命令
**When** 扩展 IPC 封装层
**Then** 在 `src/lib/tauri.ts` 中添加：

```typescript
/** Check if gigafile.nu is reachable. Returns true if online, false if offline. */
export async function checkNetwork(): Promise<boolean> {
  return invoke<boolean>('check_network');
}
```

### AC-9: 单元测试

**Given** 后端和前端功能实现完成
**When** 执行测试
**Then** Rust 测试（`api/v1.rs` 内联 `#[cfg(test)] mod tests`）：
- **check_connectivity function exists**: 验证函数可编译调用（不做实际网络请求）

**And** 前端测试（`src/stores/appStore.test.ts` 新建）：
- **isOnline 默认为 true**: 验证 store 初始状态
- **setOnlineStatus updates state**: 验证 `setOnlineStatus(false)` 将 `isOnline` 更新为 `false`
- **setOnlineStatus(true) restores online**: 验证恢复在线状态

**And** 前端测试（`src/components/upload/UploadActionBar.test.tsx` 已有文件中追加）：
- **离线时上传按钮禁用**: 当 `appStore.isOnline === false` 时，上传按钮处于 disabled 状态
- **离线时显示提示文字**: 当 `appStore.isOnline === false` 时，显示 "当前无网络连接" 提示

**And** `pnpm test` 前端测试通过
**And** `pnpm lint` ESLint 无错误
**And** `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过

---

## Technical Design

### 现状分析

Story 5-1 和之前的 Epic 1-4 已建立完整的基础设施：

- `src/stores/appStore.ts` -- 当前仅包含 `currentTab`/`setCurrentTab`（第 5-8 行），需要扩展网络状态字段
- `src/App.tsx` -- 已有 `useEffect` 初始化逻辑（第 7-9 行调用 `loadRetentionPreference()`），需要追加网络检测初始化
- `src-tauri/src/api/v1.rs` -- gigafile.nu API 实现，所有 HTTP 交互集中于此，新增 `check_connectivity()` 函数
- `src-tauri/src/commands/mod.rs` -- 现有 `files`, `upload`, `history`, `settings` 子模块，需新增 `network` 模块
- `src-tauri/src/lib.rs` -- `invoke_handler` 已注册 7 个 commands（第 21-29 行），需追加 `check_network`
- `src/lib/tauri.ts` -- IPC 封装入口（第 1-67 行），需添加 `checkNetwork()` 函数
- `src/components/upload/UploadActionBar.tsx` -- 底部操作栏（第 7-94 行），需添加离线状态判断逻辑
- `src-tauri/src/services/retry_engine.rs` -- 重试引擎（Story 3-4 实现），已处理上传中网络中断场景，本 Story 不修改

**关键洞察 -- 离线启动已天然支持：**

当前应用启动时的操作全部为本地读取：`loadRetentionPreference()` 读取 `settings.json`、`historyStore` 读取 `history.json`。这些操作使用 `tauri-plugin-store` 读取本地文件，不依赖网络。因此 AC-1（无网络启动）的核心功能已天然工作。本 Story 需要做的是：(1) 添加网络检测机制让 UI 感知在线/离线状态；(2) 在离线时阻止上传并给出温和提示；(3) 网络恢复时自动解除限制。

**关键洞察 -- 上传中网络中断已有覆盖：**

Story 3-4 的重试引擎已实现指数退避重试（初始 200ms，最大 30s），50 次以下静默。网络短暂中断时，上传块失败会被自动重试。本 Story 不需要修改重试引擎，只需确保该机制在离线场景下正常工作（AC-4 为验证性 AC）。

### 新增/修改模块

#### 1. `api/v1.rs` -- 新增 check_connectivity 函数（修改）

```rust
/// Lightweight connectivity check to gigafile.nu.
///
/// Sends an HTTP HEAD request with a 5-second timeout. Returns `true` if the
/// server responds (any HTTP status), `false` if the request fails (network error,
/// timeout, DNS failure). This is NOT an error condition — offline is a normal
/// application state.
pub async fn check_connectivity() -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client.head("https://gigafile.nu").send().await.is_ok()
}
```

> **设计决策**：不使用 `AppError` 返回值。连接失败是预期的正常状态（用户处于离线环境），不是错误。返回 `bool` 最简洁。使用独立的短超时 reqwest 客户端，不与上传引擎的客户端共享，避免超时配置互相影响。

#### 2. `commands/network.rs` -- 网络检测 IPC command（新建）

```rust
use crate::api::v1;

#[tauri::command]
pub async fn check_network() -> Result<bool, String> {
    Ok(v1::check_connectivity().await)
}
```

> **注意**：返回 `Result<bool, String>` 遵循 Tauri command 惯例。`check_connectivity()` 不会返回错误（它将网络失败转为 `false`），所以 `Result` 始终为 `Ok`。

#### 3. `commands/mod.rs` -- 注册 network 模块（修改）

添加 `pub mod network;`。

#### 4. `lib.rs` -- 注册 check_network 命令（修改）

在 `invoke_handler` 中追加 `commands::network::check_network`。

#### 5. `src/lib/tauri.ts` -- IPC 封装（修改）

```typescript
/** Check if gigafile.nu is reachable. Returns true if online, false if offline. */
export async function checkNetwork(): Promise<boolean> {
  return invoke<boolean>('check_network');
}
```

#### 6. `src/stores/appStore.ts` -- 扩展网络状态（修改）

```typescript
import { create } from 'zustand';

import { checkNetwork } from '@/lib/tauri';

import type { TabId } from '@/types/app';

interface AppState {
  currentTab: TabId;
  isOnline: boolean;
  setCurrentTab: (tab: TabId) => void;
  setOnlineStatus: (online: boolean) => void;
  checkNetworkStatus: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentTab: 'upload',
  isOnline: true,

  setCurrentTab: (tab) => set({ currentTab: tab }),

  setOnlineStatus: (online) => set({ isOnline: online }),

  checkNetworkStatus: async () => {
    try {
      const online = await checkNetwork();
      set({ isOnline: online });
    } catch {
      set({ isOnline: false });
    }
  },
}));
```

> **设计决策**：`isOnline` 初始值为 `true`（乐观默认）。原因：避免应用启动时短暂出现 "无网络" 提示后又消失的闪烁体验。启动后异步调用 `checkNetworkStatus()` 如果发现离线会更新为 `false`。

#### 7. `src/App.tsx` -- 启动初始化与事件监听（修改）

```typescript
import { useEffect } from 'react';

import TabNav from '@/components/shared/TabNav';
import { useUploadStore } from '@/stores/uploadStore';
import { useAppStore } from '@/stores/appStore';

function App() {
  useEffect(() => {
    useUploadStore.getState().loadRetentionPreference();
    useAppStore.getState().checkNetworkStatus();

    const handleOnline = () => {
      useAppStore.getState().checkNetworkStatus();
    };
    const handleOffline = () => {
      useAppStore.getState().setOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg font-sans text-sm text-text-primary">
      <TabNav />
    </div>
  );
}

export default App;
```

> **设计决策**：
> - `handleOnline` 触发 Rust 后端验证（浏览器 `online` 事件不保证实际连通性，Rust HEAD 请求验证 gigafile.nu 可达性）
> - `handleOffline` 直接设置 `false`（离线无需验证，浏览器事件可信）
> - 使用 `getState()` 避免订阅导致 App 重渲染

#### 8. `src/components/upload/UploadActionBar.tsx` -- 离线状态处理（修改）

变更点：

1. 从 `appStore` 读取 `isOnline` 状态
2. 离线时修改 `statsText` 显示提示信息
3. 离线时禁用上传按钮

```typescript
import { useAppStore } from '@/stores/appStore';

// 在组件内部：
const isOnline = useAppStore((s) => s.isOnline);

// statsText 逻辑修改：在现有分支最前面添加离线判断
let statsText: string;
if (!isOnline && !hasActiveTasks) {
  statsText = '当前无网络连接，请连接网络后上传';
} else if (allUploadsComplete) {
  statsText = `${completedCount} 个文件上传完成`;
} else if (allFailed) {
  // ... 现有逻辑不变
}

// isStartDisabled 添加离线条件：
const isStartDisabled = isStarting || !hasPendingFiles || isUploading || !isOnline;
```

> **设计决策**：离线提示仅在非上传状态时显示（`!hasActiveTasks`）。如果用户在上传过程中网络断开，重试引擎会处理，不在 UI 上覆盖进度信息。

### 数据流

```
应用启动时网络检测：
  -> App.tsx useEffect()
  -> appStore.checkNetworkStatus()
  -> checkNetwork() IPC
    -> invoke('check_network')
    -> commands::network::check_network()
    -> api::v1::check_connectivity()
    -> HEAD https://gigafile.nu (5s timeout)
    -> 成功 -> return true -> set({ isOnline: true })
    -> 失败 -> return false -> set({ isOnline: false })

浏览器 online 事件：
  -> window 'online' event
  -> appStore.checkNetworkStatus()
  -> (同上，通过 Rust 后端验证实际连通性)
  -> isOnline 更新 -> UploadActionBar 自动重渲染 -> 按钮恢复可用

浏览器 offline 事件：
  -> window 'offline' event
  -> appStore.setOnlineStatus(false)
  -> isOnline = false -> UploadActionBar 重渲染 -> 按钮禁用 + 提示文字

离线时用户点击上传（如果按钮未被禁用，例如竞态条件）：
  -> handleStartUpload()
  -> uploadStore.startUpload(retentionDays)
  -> startUploadIpc(files, { lifetime })
  -> Rust start_upload -> discover_server() 失败
  -> 重试引擎接管 -> 最终上传失败
  -> 前端 catch -> console.error (现有行为，graceful degradation)
```

### 设计决策

1. **isOnline 放在 appStore 而非 uploadStore**：网络状态是应用级关注点，不仅影响上传（未来可能影响其他功能如自动更新检查）。放在 `appStore` 遵循既有的职责划分。

2. **乐观默认 isOnline: true**：避免启动闪烁。大多数用户在有网络环境下使用应用，首次渲染不应该显示离线警告。异步网络检测完成后如果发现离线会立即更新。

3. **双重检测机制（浏览器 + Rust）**：
   - 浏览器 `navigator.onLine` / `online` / `offline` 事件提供即时反馈（毫秒级）
   - Rust `check_connectivity()` 提供权威验证（实际检测 gigafile.nu 可达性）
   - `online` 事件触发时通过 Rust 验证（浏览器可能误报在线）
   - `offline` 事件直接设置离线（无需验证，可信度高）

4. **HEAD 请求而非 GET**：HEAD 不返回 body，网络开销最小。检测连通性只需要看请求是否成功，不需要响应内容。

5. **独立 reqwest 客户端**：`check_connectivity()` 创建独立客户端（5s 超时），不与上传引擎共享客户端实例。上传引擎的客户端可能有不同的超时配置和 Cookie jar。

6. **不修改重试引擎**：Story 3-4 的重试机制已充分处理上传中网络中断。本 Story 的职责是在上传前阻止无效尝试，不干预上传中的网络中断处理。

7. **离线提示仅在非上传状态时显示**：如果上传已经在进行中且网络断开，statsText 继续显示 "N 个文件上传中"（重试引擎在后台处理）。离线提示仅在用户准备发起新上传时显示。

8. **不添加持久性离线 banner**：最小化 UI 变更。离线状态通过 UploadActionBar 的 statsText 和按钮禁用状态传达，不在应用顶部添加额外的 banner 组件。保持 UI 简洁。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 3-4（重试引擎） | 本 Story 依赖 3-4 的重试引擎处理上传中网络中断。本 Story 不修改重试逻辑，AC-4 为验证性 AC |
| Story 5-1（文件保留期） | 本 Story 依赖 5-1 的 settings 基础设施（`storage/settings.rs`）。离线启动时 `get_settings` 正常读取本地 `settings.json` |
| Story 4-1（历史持久化） | 本 Story 依赖 4-1 的 history 基础设施。离线启动时 `get_history` 正常读取本地 `history.json` |

---

## Tasks

### Task 1: 实现 Rust 网络检测函数

**文件:** `src-tauri/src/api/v1.rs`（修改）
**依赖:** 无

**Subtasks:**

1.1. 在 `api/v1.rs` 中添加 `check_connectivity()` 公开异步函数
1.2. 函数内部创建独立 reqwest 客户端，超时 5 秒
1.3. 发送 HTTP HEAD 请求到 `https://gigafile.nu`
1.4. 请求成功返回 `true`，任何失败返回 `false`
1.5. 在 `#[cfg(test)] mod tests` 中添加编译验证测试（验证函数签名正确、可调用）

### Task 2: 实现 commands/network.rs IPC command

**文件:** `src-tauri/src/commands/network.rs`（新建），`src-tauri/src/commands/mod.rs`（修改），`src-tauri/src/lib.rs`（修改）
**依赖:** Task 1

**Subtasks:**

2.1. 创建 `commands/network.rs`，实现 `check_network` async Tauri command，调用 `api::v1::check_connectivity()`
2.2. 在 `commands/mod.rs` 中添加 `pub mod network;`
2.3. 在 `lib.rs` 的 `invoke_handler` 中注册 `commands::network::check_network`

### Task 3: 前端 IPC 封装

**文件:** `src/lib/tauri.ts`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 在 `src/lib/tauri.ts` 中添加 `checkNetwork()` IPC 封装函数，返回 `Promise<boolean>`

### Task 4: 扩展 appStore 网络状态

**文件:** `src/stores/appStore.ts`（修改）
**依赖:** Task 3

**Subtasks:**

4.1. 在 `AppState` interface 中添加 `isOnline: boolean`、`setOnlineStatus: (online: boolean) => void`、`checkNetworkStatus: () => Promise<void>`
4.2. 添加初始值 `isOnline: true`（乐观默认）
4.3. 实现 `setOnlineStatus` action：直接更新 `isOnline`
4.4. 实现 `checkNetworkStatus` action：调用 `checkNetwork()` IPC，成功则更新 `isOnline`，catch 分支设为 `false`
4.5. 导入 `checkNetwork` from `@/lib/tauri`

### Task 5: App.tsx 启动初始化与事件监听

**文件:** `src/App.tsx`（修改）
**依赖:** Task 4

**Subtasks:**

5.1. 在现有 `useEffect` 中追加 `useAppStore.getState().checkNetworkStatus()` 调用
5.2. 在同一 `useEffect` 中注册 `window.addEventListener('online', handleOnline)` -- 调用 `checkNetworkStatus()`
5.3. 在同一 `useEffect` 中注册 `window.addEventListener('offline', handleOffline)` -- 调用 `setOnlineStatus(false)`
5.4. 在 `useEffect` cleanup 中移除两个事件监听器
5.5. 导入 `useAppStore` from `@/stores/appStore`
5.6. 使用 `getState()` 调用 store actions，避免订阅导致 App 重渲染

### Task 6: UploadActionBar 离线状态处理

**文件:** `src/components/upload/UploadActionBar.tsx`（修改）
**依赖:** Task 4

**Subtasks:**

6.1. 从 `appStore` 读取 `isOnline` 状态：`const isOnline = useAppStore((s) => s.isOnline)`
6.2. 在 `statsText` 计算逻辑中，最前面添加离线分支：当 `!isOnline && !hasActiveTasks` 时显示 "当前无网络连接，请连接网络后上传"
6.3. 在 `isStartDisabled` 条件中添加 `|| !isOnline`
6.4. 导入 `useAppStore` from `@/stores/appStore`
6.5. 现有的所有功能（统计文本、按钮状态、清空逻辑、RetentionSelector）保持不变

### Task 7: 编写测试

**文件:** `src/stores/appStore.test.ts`（新建），`src/components/upload/UploadActionBar.test.tsx`（修改，已有文件）
**依赖:** Task 4, Task 5, Task 6

**Subtasks:**

7.1. 创建 `src/stores/appStore.test.ts`：
  - 测试 `isOnline` 默认值为 `true`
  - 测试 `setOnlineStatus(false)` 更新为 `false`
  - 测试 `setOnlineStatus(true)` 恢复为 `true`

7.2. 在 `src/components/upload/UploadActionBar.test.tsx` 中追加：
  - 测试离线时上传按钮处于 `disabled` 状态
  - 测试离线时显示 "当前无网络连接" 提示文字

### Task 8: 代码质量验证

**文件:** 无新文件
**依赖:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7

**Subtasks:**

8.1. 执行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认 Rust 测试通过
8.2. 执行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无 lint 警告
8.3. 执行 `pnpm test` 确认前端测试通过
8.4. 执行 `pnpm lint` 确认 ESLint 无错误
8.5. 执行 `pnpm format:check` 确认 Prettier 格式正确

---

## Task 依赖顺序

```
Task 1 (api/v1 check_connectivity) --> Task 2 (commands/network IPC)
                                             |
                                             v
                                       Task 3 (前端 IPC 封装)
                                             |
                                             v
                                       Task 4 (appStore 网络状态)
                                          |           |
                                          v           v
                                   Task 5 (App.tsx)  Task 6 (UploadActionBar)
                                          |           |
                                          v           v
                                       Task 7 (测试)
                                             |
                                             v
                                       Task 8 (代码质量验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src-tauri/src/commands/network.rs` | `check_network` Tauri IPC command，调用 `api::v1::check_connectivity()` |
| `src/stores/appStore.test.ts` | appStore 网络状态测试：默认值、状态更新 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src-tauri/src/api/v1.rs` | 新增 `pub async fn check_connectivity() -> bool` 函数（HEAD 请求 gigafile.nu，5s 超时） |
| `src-tauri/src/commands/mod.rs` | 添加 `pub mod network;` |
| `src-tauri/src/lib.rs` | 在 `invoke_handler` 中注册 `commands::network::check_network` |
| `src/lib/tauri.ts` | 添加 `checkNetwork()` IPC 封装函数 |
| `src/stores/appStore.ts` | 添加 `isOnline` 状态、`setOnlineStatus()` 和 `checkNetworkStatus()` actions |
| `src/App.tsx` | 追加网络检测初始化调用、注册/清理 online/offline 事件监听器 |
| `src/components/upload/UploadActionBar.tsx` | 导入 `useAppStore`，添加离线判断逻辑（statsText 离线提示、按钮禁用条件） |
| `src/components/upload/UploadActionBar.test.tsx` | 追加离线场景测试用例 |

### 禁止修改

- `src-tauri/src/api/mod.rs` -- trait 定义不变，`check_connectivity` 是独立函数而非 trait 方法
- `src-tauri/src/services/retry_engine.rs` -- 重试引擎不修改（AC-4 为验证性 AC）
- `src-tauri/src/services/upload_engine.rs` -- 上传引擎不修改
- `src-tauri/src/services/progress.rs` -- 进度聚合不修改
- `src-tauri/src/services/chunk_manager.rs` -- 分块管理不修改
- `src-tauri/src/storage/` -- 存储层不修改（已支持离线读取）
- `src-tauri/src/models/` -- 数据模型不修改
- `src-tauri/src/error.rs` -- 错误类型不修改（网络检测不使用 AppError）
- `src-tauri/src/commands/upload.rs` -- 上传 commands 不修改
- `src-tauri/src/commands/history.rs` -- 历史 commands 不修改
- `src-tauri/src/commands/settings.rs` -- 设置 commands 不修改
- `src-tauri/Cargo.toml` -- 无需新依赖（reqwest 已安装）
- `src/stores/uploadStore.ts` -- 上传 store 不修改（网络状态在 appStore）
- `src/stores/historyStore.ts` -- 历史 store 不修改
- `src/types/` -- 无需新增类型文件（isOnline 是简单 boolean）
- `src/hooks/` -- 无需新 hook
- `src/components/history/` -- 历史 UI 不修改
- `src/components/shared/` -- 共享组件不修改
- `src/components/upload/FileDropZone.tsx` -- 拖拽区不修改
- `src/components/upload/UploadFileItem.tsx` -- 文件列表项不修改
- `src/components/upload/RetentionSelector.tsx` -- 保留期选择器不修改
- `src/App.css` -- 设计 Token 不变
- `src/lib/format.ts` -- 格式化工具不修改

---

## Technical Notes

### reqwest HEAD 请求

```rust
// check_connectivity() 使用独立客户端，5s 超时
let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(5))
    .build()?;

// HEAD 请求不下载响应体，网络开销最小
// .is_ok() 将任何成功的 HTTP 响应（包括重定向、4xx）视为在线
// 只有网络层面的失败（连接超时、DNS 失败）才返回 false
client.head("https://gigafile.nu").send().await.is_ok()
```

### 浏览器 online/offline 事件

```typescript
// WebView (Tauri) 中的 navigator.onLine 和 online/offline 事件行为：
// - offline 事件：当网络接口断开时触发，可靠性高
// - online 事件：当网络接口恢复时触发，但不保证实际互联网连通性
//   (例如连接了 WiFi 但无互联网，仍会触发 online)
// 因此 online 事件需要通过 Rust 后端二次验证
```

### appStore 测试 mock 策略

```typescript
// appStore.test.ts
import { vi } from 'vitest';

// Mock lib/tauri.ts 的 IPC 函数
vi.mock('@/lib/tauri', () => ({
  checkNetwork: vi.fn(),
}));
```

### UploadActionBar 离线测试策略

```typescript
// UploadActionBar.test.tsx 中测试离线状态
// 需要同时 mock uploadStore 和 appStore

// 方法 1：直接设置 appStore 状态
import { useAppStore } from '@/stores/appStore';
beforeEach(() => {
  useAppStore.setState({ isOnline: false });
});
```

### Rust 测试注意事项

`api/v1.rs` 的 `check_connectivity()` 执行实际网络请求，不适合在 CI 中运行。测试策略：
- 编译验证测试：确认函数签名正确、可调用
- 不做断言网络请求结果的测试（CI 环境网络状态不可控）

---

## Definition of Done

- [ ] `api/v1.rs` 新增 `check_connectivity()` 公开异步函数，HEAD 请求 gigafile.nu，5s 超时
- [ ] `check_connectivity()` 成功返回 `true`，任何失败返回 `false`
- [ ] `check_connectivity()` 不使用 `AppError`（离线是正常状态）
- [ ] `commands/network.rs` 实现 `check_network` Tauri command
- [ ] `commands/mod.rs` 添加 `pub mod network;`
- [ ] `lib.rs` invoke_handler 注册 `check_network`
- [ ] `src/lib/tauri.ts` 添加 `checkNetwork()` IPC 封装
- [ ] `appStore.ts` 新增 `isOnline` 状态（初始值 `true`）
- [ ] `appStore.ts` 实现 `setOnlineStatus()` action
- [ ] `appStore.ts` 实现 `checkNetworkStatus()` action（调用 Rust 检测，catch 设为 false）
- [ ] `App.tsx` 启动时调用 `checkNetworkStatus()` 获取初始网络状态
- [ ] `App.tsx` 注册 `window.addEventListener('online')` -- 触发 `checkNetworkStatus()`
- [ ] `App.tsx` 注册 `window.addEventListener('offline')` -- 设置 `isOnline = false`
- [ ] `App.tsx` useEffect cleanup 移除事件监听器
- [ ] 网络检测失败不阻塞应用启动
- [ ] `UploadActionBar.tsx` 读取 `appStore.isOnline`
- [ ] 离线时 statsText 显示 "当前无网络连接，请连接网络后上传"
- [ ] 离线时 [开始上传] 按钮禁用
- [ ] 离线时待上传文件队列保持不变
- [ ] 网络恢复后按钮自动恢复可用、提示消失
- [ ] Zustand 使用精确选择器，不解构整个 store
- [ ] Rust 测试：check_connectivity 编译验证
- [ ] 前端测试：appStore isOnline 默认值为 true
- [ ] 前端测试：setOnlineStatus 更新状态
- [ ] 前端测试：UploadActionBar 离线时按钮禁用
- [ ] 前端测试：UploadActionBar 离线时显示提示文字
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` Rust 测试通过
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml` 无 lint 警告
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误
