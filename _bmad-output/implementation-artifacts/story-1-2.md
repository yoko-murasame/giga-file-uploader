# Story 1.2: 前端目录结构与基础 UI 框架

## Story Info

- **Story Key:** 1-2
- **Epic:** Epic 1 - 项目基础设施与开发环境搭建
- **Status:** story-doc-review
- **Created:** 2026-02-11
- **FRs Covered:** FR24 (macOS), FR25 (Windows)
- **NFRs Covered:** NFR4 (冷启动 <3s)
- **Depends on:** Story 1-1 (项目初始化与开发环境搭建) - done
- **Blocks:** Story 2.1 (文件拖拽输入), Story 2.2 (文件选择器输入), Story 4.2 (历史记录列表)

## User Story

As a 用户,
I want 打开 GigaFile 应用后看到一个干净的窗口界面，带有"上传"和"历史记录"两个 Tab 导航,
So that 我能直觉地理解应用的功能布局。

## Acceptance Criteria

### AC-1: 窗口尺寸配置

**Given** 应用已通过 Story 1.1 初始化
**When** 用户启动 GigaFile 应用
**Then** 窗口默认尺寸为 720x560px
**And** 窗口最小尺寸限制为 600x480px
**And** 窗口支持用户手动调整大小（resizable）
**And** 窗口标题为 "GigaFile"
**And** 在 macOS 和 Windows 上均可正常显示（FR24, FR25）

### AC-2: Tab 导航 UI

**Given** 应用窗口已打开
**When** 用户查看窗口顶部区域
**Then** 窗口顶部展示 Tab 导航（使用 Radix UI Tabs 组件）
**And** Tab 导航包含两个 Tab：文案分别为"上传"和"历史记录"
**And** 默认选中"上传" Tab
**And** 激活状态的 Tab 显示品牌蓝底条（#3B82F6）+ 加粗文字（font-weight: 600）
**And** 未激活状态的 Tab 显示灰色文字（#6B7280），悬停时文字变深
**And** Tab 支持键盘导航（Tab/Arrow 键切换焦点，Enter/Space 激活）
**And** Tab 导航使用语义化 HTML（Radix Tabs 自带 `role="tablist"` / `role="tab"` / `role="tabpanel"`）

### AC-3: Tab 切换通过 appStore 状态驱动

**Given** 用户在主界面查看 Tab 导航
**When** 用户点击"历史记录" Tab
**Then** `appStore.currentTab` 状态更新为 `'history'`
**And** 主内容区切换显示历史记录页面占位内容
**And** "历史记录" Tab 变为激活状态（品牌蓝底条 + 加粗）

**Given** 用户当前在"历史记录" Tab
**When** 用户点击"上传" Tab
**Then** `appStore.currentTab` 状态更新为 `'upload'`
**And** 主内容区切换显示上传页面占位内容
**And** Tab 切换无页面刷新，无路由库参与，纯状态驱动

### AC-4: 前端目录结构

**Given** 项目已通过 Story 1.1 初始化
**When** 检查 `src/` 目录结构
**Then** 以下目录已创建（可包含占位文件或空骨架文件）：
  - `src/components/upload/` — 上传功能组件目录
  - `src/components/history/` — 历史记录组件目录
  - `src/components/shared/` — 共享组件目录
  - `src/hooks/` — 自定义 hooks 目录
  - `src/stores/` — Zustand stores 目录
  - `src/types/` — TypeScript 类型定义目录
  - `src/lib/` — 工具函数目录
**And** 不使用 barrel exports（`index.ts`），每个目录不包含 `index.ts` 文件

### AC-5: Zustand Store 骨架

**Given** 前端目录结构已建立
**When** 检查 `src/stores/` 目录
**Then** 包含以下三个 store 文件：

**appStore.ts:**
  - 导出 `useAppStore` hook
  - 包含 `currentTab` 状态，类型为 `'upload' | 'history'`，默认值 `'upload'`
  - 包含 `setCurrentTab` action，接受 `tab` 参数更新 `currentTab`

**uploadStore.ts:**
  - 导出 `useUploadStore` hook
  - 包含最小骨架结构：空的 state 和基础的 action 类型注释占位（标注 "TODO: Story 2.x 实现"）
  - store 文件可以编译通过（无 TypeScript 错误）

**historyStore.ts:**
  - 导出 `useHistoryStore` hook
  - 包含最小骨架结构：空的 state 和基础的 action 类型注释占位（标注 "TODO: Story 4.x 实现"）
  - store 文件可以编译通过（无 TypeScript 错误）

**And** 三个 store 都使用 Zustand v5 语法创建（`create` 函数）
**And** store 之间不互相引用内部状态

### AC-6: IPC 封装文件

**Given** 前端目录结构已建立
**When** 检查 `src/lib/tauri.ts`
**Then** 该文件已创建，包含：
  - 从 `@tauri-apps/api/core` 导入 `invoke` 的 re-export 或封装
  - 从 `@tauri-apps/api/event` 导入 `listen` 的 re-export 或封装
  - 注释说明此文件为 Tauri IPC 统一入口，所有组件通过此文件调用 IPC
  - 文件为骨架状态，具体 command 封装将在后续 Story 中添加
**And** 文件可以编译通过（无 TypeScript 错误）

### AC-7: Tailwind @theme 设计 Token

**Given** `src/App.css` 已包含 `@import "tailwindcss"` 声明
**When** 检查 `src/App.css` 中的 `@theme` 定义
**Then** 包含以下颜色 Token：
  - `--color-brand`: `#3B82F6`（品牌蓝）
  - `--color-bg`: `#FAFAFA`（主背景）
  - `--color-surface`: `#FFFFFF`（卡片/面板背景）
  - `--color-text-primary`: `#1A1A1A`（主文字）
  - `--color-text-secondary`: `#6B7280`（辅助文字）
  - `--color-border`: `#E5E7EB`（边框/分割线）
  - `--color-success`: `#10B981`（成功/上传完成）
  - `--color-warning`: `#F59E0B`（温和告警）
  - `--color-error`: `#EF4444`（错误）
  - `--color-info`: `#6366F1`（提示信息）
**And** 包含字体 Token：
  - `--font-sans`: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  - `--font-mono`: `'SF Mono', 'Cascadia Code', 'Consolas', monospace`
**And** 包含圆角 Token：
  - `--radius-sm`: `4px`
  - `--radius-md`: `6px`
  - `--radius-lg`: `8px`
**And** Token 可在 Tailwind 工具类中使用（如 `bg-brand`、`text-text-primary`）

### AC-8: 页面占位组件

**Given** Tab 导航和目录结构已建立
**When** 用户切换 Tab
**Then** "上传" Tab 页面显示占位内容（如灰色文案"上传页面 - 待实现"），组件位于 `src/components/upload/UploadPage.tsx`
**And** "历史记录" Tab 页面显示占位内容（如灰色文案"历史记录页面 - 待实现"），组件位于 `src/components/history/HistoryPage.tsx`
**And** 页面占位组件使用 Tailwind 工具类设置基础样式
**And** 主内容区域背景为 `--color-bg`（#FAFAFA），内边距 24px（左右）、16px（上下）

### AC-9: 应用整体布局与样式

**Given** 所有 UI 组件已就位
**When** 用户启动应用并查看界面
**Then** 应用整体背景为 `--color-bg`（#FAFAFA）
**And** Tab 导航区域背景为 `--color-surface`（#FFFFFF），底部有 1px 边框（`--color-border`）
**And** 主内容区填充剩余空间（flex 布局）
**And** 字体使用系统字体栈（`--font-sans`）
**And** 基础字号为 14px（Body），行高 1.5
**And** 应用冷启动到可操作状态在 3 秒以内（NFR4）

### AC-10: 代码质量

**Given** 所有代码文件已创建
**When** 执行代码质量检查
**Then** `pnpm lint` 通过（无 ESLint 错误）
**And** `pnpm format:check` 通过（代码格式正确）
**And** `pnpm test` 通过（已有测试不被破坏）
**And** `pnpm build` 前端构建通过（TypeScript 编译无错误）
**And** 所有导入使用 `@/` 路径别名，无 `../../` 相对路径

## Tasks

### Task 1: 配置窗口尺寸

**对应 AC:** AC-1
**依赖:** 无

**Subtasks:**

1.1. 修改 `src-tauri/tauri.conf.json` 中的 `app.windows[0]` 配置：
  - `width`: 720
  - `height`: 560
  - `minWidth`: 600
  - `minHeight`: 480
  - `title`: "GigaFile"
  - `resizable`: true
1.2. 验证配置项的 JSON 格式正确

### Task 2: 定义 Tailwind @theme 设计 Token

**对应 AC:** AC-7
**依赖:** 无

**Subtasks:**

2.1. 修改 `src/App.css`，在 `@import "tailwindcss"` 之后添加 `@theme` 块
2.2. 定义颜色 Token：`--color-brand`, `--color-bg`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, `--color-success`, `--color-warning`, `--color-error`, `--color-info`
2.3. 定义字体 Token：`--font-sans`, `--font-mono`
2.4. 定义圆角 Token：`--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px)
2.5. 添加全局基础样式：body 背景色 `--color-bg`，字体 `--font-sans`，字号 14px

### Task 3: 创建前端目录结构

**对应 AC:** AC-4
**依赖:** 无

**Subtasks:**

3.1. 创建 `src/components/upload/` 目录
3.2. 创建 `src/components/history/` 目录
3.3. 创建 `src/components/shared/` 目录
3.4. 创建 `src/hooks/` 目录
3.5. 创建 `src/stores/` 目录
3.6. 创建 `src/types/` 目录
3.7. 创建 `src/lib/` 目录
3.8. 确认所有目录中不包含 `index.ts` 文件

### Task 4: 创建 TypeScript 类型定义骨架

**对应 AC:** AC-4, AC-5
**依赖:** Task 3

**Subtasks:**

4.1. 创建 `src/types/app.ts`，定义 `TabId` 类型别名：`'upload' | 'history'`
4.2. 确认类型文件使用 `export type` 导出

### Task 5: 创建 Zustand Store 骨架

**对应 AC:** AC-5
**依赖:** Task 3, Task 4

**Subtasks:**

5.1. 创建 `src/stores/appStore.ts`：
  - 使用 Zustand v5 `create` 函数
  - state: `currentTab: TabId`，默认值 `'upload'`
  - actions: `setCurrentTab(tab: TabId)`
  - 导出 `useAppStore` hook
5.2. 创建 `src/stores/uploadStore.ts`：
  - 使用 Zustand v5 `create` 函数
  - 最小骨架 state（空对象或基础字段占位）
  - 注释标注 "TODO: Story 2.x 实现完整 upload state"
  - 导出 `useUploadStore` hook
5.3. 创建 `src/stores/historyStore.ts`：
  - 使用 Zustand v5 `create` 函数
  - 最小骨架 state（空对象或基础字段占位）
  - 注释标注 "TODO: Story 4.x 实现完整 history state"
  - 导出 `useHistoryStore` hook
5.4. 验证三个 store 文件 TypeScript 编译通过

### Task 6: 创建 IPC 封装文件

**对应 AC:** AC-6
**依赖:** Task 3

**Subtasks:**

6.1. 创建 `src/lib/tauri.ts`：
  - 从 `@tauri-apps/api/core` 导入并 re-export `invoke`
  - 从 `@tauri-apps/api/event` 导入并 re-export `listen`
  - 添加模块级 JSDoc 注释说明此文件用途
  - 注释标注 "TODO: 后续 Story 添加具体 command 封装函数"
6.2. 验证文件 TypeScript 编译通过

### Task 7: 创建页面占位组件

**对应 AC:** AC-8
**依赖:** Task 3, Task 2

**Subtasks:**

7.1. 创建 `src/components/upload/UploadPage.tsx`：
  - 函数组件，显示占位文案"上传页面 - 待实现"
  - 使用 Tailwind 工具类设置灰色居中文案
  - 使用 `@/` 路径导入（如有需要）
7.2. 创建 `src/components/history/HistoryPage.tsx`：
  - 函数组件，显示占位文案"历史记录页面 - 待实现"
  - 使用 Tailwind 工具类设置灰色居中文案
7.3. 确认组件 props 类型正确定义（即使为空 props）

### Task 8: 创建 TabNav 共享组件

**对应 AC:** AC-2, AC-3
**依赖:** Task 5, Task 7

**Subtasks:**

8.1. 创建 `src/components/shared/TabNav.tsx`：
  - 使用 Radix UI Tabs 组件（从 `radix-ui` 包导入）
  - `Tabs.Root` 的 `value` 绑定 `appStore.currentTab`
  - `Tabs.Root` 的 `onValueChange` 调用 `appStore.setCurrentTab`
  - `Tabs.List` 包含两个 `Tabs.Trigger`：文案"上传"（value: `'upload'`）和"历史记录"（value: `'history'`）
  - 激活状态样式：品牌蓝底条（`border-b-2 border-brand`）+ 加粗文字（`font-semibold`）+ 品牌蓝文字
  - 未激活状态样式：灰色文字（`text-text-secondary`），悬停时文字变深
  - `Tabs.Content` 分别渲染 `UploadPage` 和 `HistoryPage` 组件
8.2. 使用 Tailwind 工具类实现 Tab 导航栏样式：
  - 导航栏背景 `bg-surface`，底部 1px 边框 `border-b border-border`
  - Tab 触发器内边距合理（如 `px-4 py-3`）
8.3. 使用 Zustand 精确选择器订阅 `currentTab` 状态：`useAppStore(state => state.currentTab)`
8.4. 确认键盘导航正常（Radix Tabs 自带无障碍支持）

### Task 9: 重构 App.tsx 集成所有组件

**对应 AC:** AC-9, AC-2, AC-3
**依赖:** Task 2, Task 8

**Subtasks:**

9.1. 修改 `src/App.tsx`：
  - 导入 `TabNav` 组件（使用 `@/components/shared/TabNav` 路径）
  - 根组件渲染 `TabNav` 作为主内容
  - 设置应用容器样式：`min-h-screen bg-bg font-sans text-sm text-text-primary`
9.2. 删除 `src/App.tsx` 中的旧占位内容（Story 1.1 的 "Welcome to Giga File Uploader"）
9.3. 确认应用启动后显示 Tab 导航和"上传"页面占位内容

### Task 10: 代码质量验证

**对应 AC:** AC-10
**依赖:** Task 9

**Subtasks:**

10.1. 执行 `pnpm lint`，确认无 ESLint 错误
10.2. 执行 `pnpm format`，格式化所有新增文件
10.3. 执行 `pnpm format:check`，确认格式检查通过
10.4. 执行 `pnpm test`，确认已有测试不被破坏（Story 1.1 的 App.test.tsx 可能需要更新以适配新的 App.tsx 内容）
10.5. 执行 `pnpm build`，确认 TypeScript 编译和 Vite 构建通过
10.6. 检查所有新文件的导入是否使用 `@/` 路径别名

### Task 11: 应用启动验证

**对应 AC:** AC-1, AC-9
**依赖:** Task 10

**Subtasks:**

11.1. 执行 `pnpm tauri dev`，确认应用窗口正常打开
11.2. 确认窗口默认尺寸为 720x560px
11.3. 确认窗口可以调整大小但不能小于 600x480px
11.4. 确认 Tab 导航显示正常，默认选中"上传" Tab
11.5. 确认点击"历史记录" Tab 切换正常，主内容区内容切换
11.6. 确认应用冷启动到可操作状态在 3 秒以内（NFR4）
11.7. 确认无控制台错误

## File Scope

以下是本 Story 允许创建或修改的文件列表。Dev Runner 不应修改此范围之外的文件。

### 将被创建的文件

- `src/components/upload/UploadPage.tsx` — 上传页面占位组件
- `src/components/history/HistoryPage.tsx` — 历史记录页面占位组件
- `src/components/shared/TabNav.tsx` — Tab 导航组件
- `src/stores/appStore.ts` — 应用级状态 store
- `src/stores/uploadStore.ts` — 上传状态 store 骨架
- `src/stores/historyStore.ts` — 历史记录状态 store 骨架
- `src/types/app.ts` — 应用级 TypeScript 类型定义
- `src/lib/tauri.ts` — Tauri IPC 封装入口

### 将被修改的文件

- `src/App.tsx` — 集成 TabNav 组件，替换旧占位内容
- `src/App.css` — 添加 `@theme` 设计 Token 定义
- `src-tauri/tauri.conf.json` — 修改窗口尺寸配置
- `src/App.test.tsx` — 可能需要更新以适配新的 App.tsx 内容

### 不允许修改的文件

- `package.json` — 不添加新依赖（所有依赖已在 Story 1.1 安装）
- `vite.config.ts` — 不修改构建配置
- `tsconfig.json` — 不修改 TypeScript 配置
- `eslint.config.js` — 不修改 ESLint 配置
- `src/main.tsx` — 不修改 React 入口
- `src-tauri/src/` — 不修改 Rust 代码（属于 Story 1.3 范围）
- `_bmad-output/` — 不修改规划文档

## Technical Notes

### Radix UI Tabs 使用方式

从 `radix-ui` 统一包导入 Tabs 组件：

```typescript
import { Tabs } from 'radix-ui';

// 使用方式
<Tabs.Root value={currentTab} onValueChange={setCurrentTab}>
  <Tabs.List>
    <Tabs.Trigger value="upload">上传</Tabs.Trigger>
    <Tabs.Trigger value="history">历史记录</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="upload">
    <UploadPage />
  </Tabs.Content>
  <Tabs.Content value="history">
    <HistoryPage />
  </Tabs.Content>
</Tabs.Root>
```

Radix UI Tabs 自带完整的无障碍支持：`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, 键盘箭头键切换等。

### Zustand v5 Store 创建语法

```typescript
import { create } from 'zustand';

interface AppState {
  currentTab: 'upload' | 'history';
  setCurrentTab: (tab: 'upload' | 'history') => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentTab: 'upload',
  setCurrentTab: (tab) => set({ currentTab: tab }),
}));
```

注意事项：
- Zustand v5 的 `create` 函数签名与 v4 相同，但内部实现有差异
- Store actions 定义在 store 内部，不在外部
- 组件使用精确选择器订阅状态片段

### Tailwind CSS 4.x @theme 语法

```css
@import "tailwindcss";

@theme {
  --color-brand: #3B82F6;
  --color-bg: #FAFAFA;
  /* ... */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --radius-lg: 8px;
}
```

`@theme` 中定义的变量可直接在 Tailwind 工具类中使用：
- `--color-brand` -> `bg-brand`, `text-brand`, `border-brand`
- `--font-sans` -> `font-sans`
- `--radius-lg` -> `rounded-lg`

### 窗口尺寸配置

`tauri.conf.json` 中的窗口配置字段：

```json
{
  "app": {
    "windows": [{
      "title": "GigaFile",
      "width": 720,
      "height": 560,
      "minWidth": 600,
      "minHeight": 480,
      "resizable": true,
      "fullscreen": false
    }]
  }
}
```

### IPC 封装文件结构

`src/lib/tauri.ts` 是前端调用 Tauri backend 的唯一入口点。项目约定：
- 组件不直接调用 `invoke()`，通过 store actions 调用
- store actions 通过 `src/lib/tauri.ts` 中的封装函数调用 Tauri commands
- 事件监听通过自定义 hooks（如 `useUploadEvents`）使用 `listen` 函数

### 技术栈版本参考

| 技术 | 版本 | 来源 |
|------|------|------|
| Radix UI | 1.4.3 (统一包) | package.json |
| Zustand | 5.0.11 | package.json |
| Tailwind CSS | 4.1.18 | package.json |
| React | 19.2.4 | package.json |
| TypeScript | 5.9.3 | package.json |

### 项目约定提醒

- 所有导入使用 `@/` 路径别名，禁止 `../../` 相对路径
- 禁止 barrel exports（`index.ts`），组件直接路径导入
- 组件样式仅使用 Tailwind class，禁止独立 CSS 文件
- Props 类型使用 `interface`，命名为 `{ComponentName}Props`
- 事件处理函数命名：`handle{Event}`
- 不使用布尔 loading 标志，使用 status 枚举

## Definition of Done

- [ ] AC-1: 窗口默认 720x560px，最小 600x480px
- [ ] AC-2: Radix UI Tabs 导航显示"上传"和"历史记录"，激活状态品牌蓝底条 + 加粗
- [ ] AC-3: Tab 切换通过 appStore.currentTab 驱动，无路由库
- [ ] AC-4: 前端 7 个目录已创建，无 index.ts barrel exports
- [ ] AC-5: 三个 Zustand store 骨架已创建（appStore 含 currentTab，uploadStore/historyStore 为占位骨架）
- [ ] AC-6: src/lib/tauri.ts IPC 封装文件已创建（骨架状态）
- [ ] AC-7: App.css @theme 设计 Token 定义完成（10 色 + 2 字体 + 3 圆角）
- [ ] AC-8: UploadPage 和 HistoryPage 占位组件已创建
- [ ] AC-9: 应用整体布局样式正确（背景色、字体、内边距）
- [ ] AC-10: pnpm lint/format:check/test/build 全部通过，所有导入使用 @/ 路径
