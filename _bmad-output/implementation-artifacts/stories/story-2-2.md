# Story 2.2: 文件选择器输入

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 2-2 |
| Epic | Epic 2: 文件输入与上传队列管理 |
| 前置依赖 | Story 2-1 (文件拖拽输入与拖拽区交互) — 已完成 |
| FRs 覆盖 | FR3 (文件选择器添加文件) |
| NFRs 关联 | NFR1 (列表渲染 <1s) |

## User Story

As a 用户,
I want 通过点击按钮打开系统文件选择器来选择要上传的文件,
So that 我有除拖拽以外的备选文件添加方式。

---

## Acceptance Criteria

### AC-1: 点击触发系统原生文件选择器

**Given** 用户在"上传" Tab，拖拽区域显示中（idle 或 collapsed 状态均适用）
**When** 用户点击拖拽区域或"选择文件"提示文案
**Then** 打开系统原生文件选择器对话框（通过 `tauri-plugin-dialog` 的 `open()` API）（FR3）
**And** 文件选择器支持多选（`multiple: true`）
**And** 不限制文件类型过滤器（gigafile.nu 接受所有文件类型）

### AC-2: 选择文件后添加到队列

**Given** 用户在文件选择器中选择了一个或多个文件
**When** 用户确认选择
**Then** 选中的文件路径通过 `resolveDroppedPaths` Rust command 解析为 `FileEntry[]`
**And** 解析后的文件被添加到 `uploadStore` 的待上传队列
**And** 文件列表在 1 秒内完成渲染（NFR1）

### AC-3: 取消文件选择器

**Given** 用户在文件选择器中未选择任何文件
**When** 用户取消文件选择器（点击取消按钮或按 Escape）
**Then** `open()` 返回 `null`
**And** 不执行任何操作，界面保持不变
**And** 不触发任何错误或提示

### AC-4: 键盘触发文件选择器

**Given** 用户通过 Tab 键将焦点移到 FileDropZone 组件上
**When** 用户按下 Enter 或 Space 键
**Then** 同样打开系统原生文件选择器对话框（与点击行为一致）

### AC-5: collapsed 状态下的文件选择器

**Given** 待上传列表已有文件，拖拽区收缩为顶部小条
**When** 用户点击收缩后的拖拽区域
**Then** 打开系统原生文件选择器
**And** 选中的文件追加到现有队列末尾，不覆盖已有文件

---

## Technical Design

### 现状分析

Story 2-1 实现了 `FileDropZone` 组件中的文件选择器基础骨架，使用 HTML 原生 `<input type="file" multiple>` 元素。当前实现存在以下问题：

1. **路径获取不可靠：** HTML `<input type="file">` 在 Tauri WebView 中不保证提供原生文件系统路径（`file.path` 属性依赖 Tauri 内部注入，非标准 API）
2. **非原生体验：** HTML file input 的对话框不是系统原生文件选择器，外观和行为可能与平台不一致
3. **AC 要求：** Story 定义明确要求"通过 Tauri 文件系统 API"打开文件选择器

### 方案：替换为 `tauri-plugin-dialog`

使用 `tauri-plugin-dialog` 提供的 `open()` API 替换 HTML `<input type="file">`：

- `open()` 返回原生文件系统路径（`string | string[] | null`），格式与 `onDragDropEvent` 中的 `paths` 完全一致
- 对话框是系统原生的，macOS/Windows 各自使用平台原生文件选择器
- 无需依赖非标准的 `file.path` 属性
- 取消时返回 `null`，处理逻辑简洁

### 数据流

```
用户点击 FileDropZone / 按 Enter/Space
  -> handleClick() 调用 openFilePicker()
  -> openFilePicker() 调用 tauri-plugin-dialog 的 open({ multiple: true })
  -> 返回 string[] | string | null
     -> null: 用户取消，不做任何操作
     -> string | string[]: 归一化为 string[]
        -> 调用 resolveDroppedPaths(paths) (复用 Story 2-1 的 Rust command)
        -> 返回 FileEntry[]
        -> uploadStore.addFiles(entries) 添加到队列
  -> React 渲染更新
```

### API 调用签名

```typescript
// @tauri-apps/plugin-dialog
import { open } from '@tauri-apps/plugin-dialog';

const selected = await open({
  multiple: true,
  // 不设置 filters — gigafile.nu 接受所有文件类型
  // 不设置 directory — 只选文件，文件夹通过拖拽方式支持
});
// selected: string[] | string | null
```

### 前端封装函数

```typescript
// src/lib/tauri.ts (新增)

/** Open the system native file picker dialog. Returns selected file paths, or null if cancelled. */
export async function openFilePicker(): Promise<string[] | null> {
  const selected = await open({ multiple: true });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected : [selected];
}
```

### Rust 插件注册

```rust
// src-tauri/src/lib.rs (修改)
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    // ... 其他 plugin 和 command 注册
```

---

## Tasks

### Task 1: 安装 `tauri-plugin-dialog` 依赖

**文件:** `src-tauri/Cargo.toml`, `package.json`
**依赖:** 无

**Subtasks:**

1.1. 在 `src-tauri/` 目录下执行 `cargo add tauri-plugin-dialog` 添加 Rust 依赖
1.2. 在项目根目录执行 `pnpm add @tauri-apps/plugin-dialog` 添加前端 JS 绑定

### Task 2: 注册 dialog 插件到 Tauri app

**文件:** `src-tauri/src/lib.rs`
**依赖:** Task 1

**Subtasks:**

2.1. 在 `src-tauri/src/lib.rs` 的 `tauri::Builder::default()` 链中添加 `.plugin(tauri_plugin_dialog::init())`
2.2. 确认插件注册位置在 `invoke_handler` 之前

### Task 3: 更新 Tauri capabilities 权限

**文件:** `src-tauri/capabilities/default.json`
**依赖:** Task 2

**Subtasks:**

3.1. 在 `src-tauri/capabilities/default.json` 的 `permissions` 数组中添加 `"dialog:default"` 权限
3.2. 如需更精细的权限控制，可使用 `"dialog:allow-open"` 替代

### Task 4: 添加文件选择器 IPC 封装函数

**文件:** `src/lib/tauri.ts`
**依赖:** Task 1

**Subtasks:**

4.1. 在 `src/lib/tauri.ts` 顶部添加 `import { open } from '@tauri-apps/plugin-dialog'`
4.2. 添加 `openFilePicker(): Promise<string[] | null>` 封装函数
   - 调用 `open({ multiple: true })`
   - 如果返回 `null`（用户取消），返回 `null`
   - 如果返回 `string`（单文件），包装为 `[selected]` 数组
   - 如果返回 `string[]`（多文件），直接返回

### Task 5: 重构 FileDropZone 组件 — 使用原生文件选择器

**文件:** `src/components/upload/FileDropZone.tsx`
**依赖:** Task 4

**Subtasks:**

5.1. 移除 `useRef<HTMLInputElement>` 引用和隐藏的 `<input type="file" multiple>` 元素（idle 和 collapsed 两个渲染分支都要移除）
5.2. 移除 `handleFileInput` 回调（不再需要处理 HTML input change 事件）
5.3. 重写 `handleClick` 回调：
   - 调用 `openFilePicker()` 获取用户选择的文件路径
   - 如果返回 `null`，直接 return（用户取消）
   - 如果返回路径数组，调用 `resolveDroppedPaths(paths)` 解析为 `FileEntry[]`
   - 调用 `addFiles(entries)` 添加到上传队列
   - 使用 try/catch 包裹，错误时 `console.error('Failed to open file picker:', error)`
5.4. `handleKeyDown` 保持不变（Enter/Space 触发 `handleClick`）
5.5. 从 `@/lib/tauri` 的导入中移除不再需要的 `resolveDroppedPaths`（如果此组件不再直接使用——注意检查：`handleClick` 中仍需要 `resolveDroppedPaths`，所以保留）
5.6. 从 `@/lib/tauri` 新增导入 `openFilePicker`
5.7. 移除 `import { useRef, useCallback } from 'react'` 中的 `useRef`（不再需要 inputRef）

### Task 6: 编写/更新前端测试

**文件:** `src/components/upload/FileDropZone.test.tsx`
**依赖:** Task 5

**Subtasks:**

6.1. Mock `@/lib/tauri` 模块中的 `openFilePicker` 和 `resolveDroppedPaths` 函数
6.2. 测试点击 FileDropZone（idle 状态）触发 `openFilePicker` 调用
6.3. 测试点击 FileDropZone（collapsed 状态）触发 `openFilePicker` 调用
6.4. 测试 `openFilePicker` 返回路径后调用 `resolveDroppedPaths` 并 `addFiles`
6.5. 测试 `openFilePicker` 返回 `null`（用户取消）时不调用 `addFiles`
6.6. 测试键盘 Enter 键触发 `openFilePicker`
6.7. 测试 `openFilePicker` 抛出异常时不崩溃（错误被 catch 处理）
6.8. 确认已移除原 `<input type="file">` 相关测试用例（如有）

---

## Task 依赖顺序

```
Task 1 (安装依赖) ──┬──> Task 2 (注册插件) ──> Task 3 (capabilities 权限)
                    │
                    └──> Task 4 (IPC 封装) ──> Task 5 (重构 FileDropZone)
                                                      │
                                                      v
                                                Task 6 (前端测试)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src-tauri/Cargo.toml` | 添加 `tauri-plugin-dialog` 依赖 |
| `src-tauri/src/lib.rs` | 注册 `tauri_plugin_dialog::init()` 插件 |
| `src-tauri/capabilities/default.json` | 添加 `dialog:default` 权限 |
| `package.json` | 添加 `@tauri-apps/plugin-dialog` 依赖 |
| `src/lib/tauri.ts` | 添加 `openFilePicker()` 封装函数 |
| `src/components/upload/FileDropZone.tsx` | 替换 HTML file input 为 `tauri-plugin-dialog` 原生对话框 |
| `src/components/upload/FileDropZone.test.tsx` | 更新/新增文件选择器相关测试 |

### 禁止修改

- `src/stores/uploadStore.ts` — uploadStore 的 `addFiles` action 已在 Story 2-1 完成，无需修改
- `src/hooks/useDragDrop.ts` — 拖拽逻辑不受文件选择器变更影响
- `src/types/upload.ts` — 不需要新增类型
- `src-tauri/src/commands/files.rs` — `resolve_dropped_paths` command 复用，无需修改
- `src-tauri/src/api/` — 不涉及 gigafile.nu API
- `src-tauri/src/services/` — 不涉及业务逻辑层
- `src-tauri/src/storage/` — 不涉及持久化
- `src/stores/appStore.ts` — 不属于本 Story 范围
- `src/stores/historyStore.ts` — 不属于本 Story 范围

---

## Technical Notes

### tauri-plugin-dialog `open()` API 要点

1. **返回类型：**
   - `multiple: false`（默认）：返回 `string`（单路径）或 `null`（取消）
   - `multiple: true`：返回 `string[]`（路径数组）或 `null`（取消）
   - 封装函数需处理 `string | string[] | null` 三种情况

2. **路径格式：** 返回的路径是原生文件系统绝对路径，格式与 Tauri `onDragDropEvent` 中的 `paths` 完全一致，因此可以直接复用 `resolveDroppedPaths` Rust command

3. **权限作用域：** `open()` 选中的文件路径会被临时添加到 Tauri 的文件系统作用域中（仅当前会话有效），无需额外配置文件系统权限

4. **不设置 `filters`：** gigafile.nu 接受所有文件类型，文件选择器不限制文件类型

5. **不设置 `directory: true`：** 文件夹输入通过拖拽方式支持（Story 2-1），文件选择器仅用于选择文件

### 与 Story 2-1 的关系

- Story 2-1 在 `FileDropZone` 中使用了 HTML `<input type="file" multiple>` 作为文件选择器的"基础骨架"
- Story 2-2 将这个骨架替换为 `tauri-plugin-dialog` 原生文件选择器
- `resolveDroppedPaths` Rust command 和 `uploadStore.addFiles` action 完全复用，不做任何修改
- `useDragDrop` hook 不受影响，拖拽逻辑独立于文件选择器逻辑

### 错误处理

- `openFilePicker()` 可能因 dialog 插件未注册、权限不足等原因抛出异常
- `FileDropZone` 的 `handleClick` 中使用 try/catch 包裹整个选择器流程
- 错误日志使用英文：`console.error('Failed to open file picker:', error)`
- 不向用户显示错误提示（文件选择器失败是极端边缘情况）

---

## Definition of Done

- [ ] `tauri-plugin-dialog` Rust 和 JS 依赖已安装
- [ ] dialog 插件已在 `lib.rs` 中注册
- [ ] `dialog:default` 权限已添加到 capabilities
- [ ] `openFilePicker()` 封装函数已添加到 `src/lib/tauri.ts`
- [ ] `FileDropZone` 点击/键盘触发打开系统原生文件选择器（非 HTML input）
- [ ] 选择文件后通过 `resolveDroppedPaths` 解析并添加到 uploadStore
- [ ] 多选文件正确处理
- [ ] 取消文件选择器时无操作、无报错
- [ ] collapsed 状态下点击同样打开文件选择器
- [ ] 已移除 HTML `<input type="file">` 元素和相关代码
- [ ] `FileDropZone.test.tsx` 测试覆盖点击触发、取消处理、错误处理
- [ ] pnpm lint 无错误
- [ ] `pnpm tauri dev` 可正常编译运行
