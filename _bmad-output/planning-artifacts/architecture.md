---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/prd-validation-report.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/research/technical-gigafile-nu-upload-api-research-2026-02-10.md'
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-10T15:37:35Z'
project_name: 'giga-file-uploader'
user_name: 'Shaoyoko'
date: '2026-02-10'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
26 个 FR 分布于 7 个能力领域：
- **文件输入与管理（FR1-FR5）：** 拖拽/选择器输入、文件夹递归、待上传列表预览与删除。架构含义：前端组件层，Tauri 文件系统 API 调用。
- **上传引擎（FR6-FR11）：** 大文件自动分片（1GB 逻辑分片 + 100MB 上传块）、多线程并发、首块串行协议、静默重试、动态服务器发现。架构含义：Rust 后端核心模块，最高复杂度区域。
- **进度与状态（FR12-FR14）：** 文件级/分片级进度显示。架构含义：Rust->React 实时事件流设计。
- **链接产出与分享（FR15-FR17）：** 逐文件链接、一键复制、标准 gigafile.nu 格式兼容。架构含义：上传结果回传 + 剪贴板 API。
- **历史记录（FR18-FR22）：** 本地持久化存储、过期状态可视化。架构含义：本地数据存储方案选型。
- **上传配置（FR23）：** 保留期选择。架构含义：配置管理。
- **平台与应用（FR24-FR26）：** macOS + Windows、离线可用。架构含义：Tauri 跨平台构建配置。

**Non-Functional Requirements:**
- **性能（NFR1-NFR5）：** 文件列表渲染 <1s、进度更新粒度 <=128KB、链接复制 <200ms、冷启动 <3s、历史加载 <1s。架构含义：前端渲染性能、事件节流策略。
- **集成（NFR6-NFR8）：** API 交互模块独立可替换、Content-Length 完整性校验、动态服务器发现不硬编码。架构含义：直接驱动接口抽象层设计。
- **可靠性（NFR9-NFR12）：** 用户感知失败率为 0、50 次静默重试、崩溃不丢失历史、单文件失败不影响其他文件。架构含义：错误隔离、持久化策略、重试状态机。

**Scale & Complexity:**
- Primary domain: 桌面应用（Tauri 2.x = Rust + React）
- Complexity level: 低-中等
- Estimated architectural components: 约 8-10 个核心模块（API 抽象层、上传调度器、分块管理器、重试引擎、进度聚合器、IPC 通信层、前端状态管理、本地存储、UI 组件层）

### Technical Constraints & Dependencies

- **Tauri 2.x 框架约束：** 前端运行在 WebView 中，后端是 Rust 进程，通过 IPC（command + event）通信
- **gigafile.nu 非官方 API：** 基于逆向工程，无 SLA 保证，接口随时可能变更
- **上传协议约束：** 首块必须串行发送以建立服务端会话，后续块可并行
- **服务器动态分配：** 每次上传前需从首页 HTML 提取当前活跃上传服务器
- **文件保留期：** 通过 `lifetime` 字段控制，支持 3/5/7/14/30/60/100 天
- **依赖 Cookie 会话：** 上传分块通过共享 Cookie 关联同一会话

### Cross-Cutting Concerns Identified

- **错误处理与重试策略：** 贯穿上传引擎、进度显示、用户提示全链路
- **进度事件流：** 从 Rust 上传线程 -> 进度聚合 -> IPC event -> React 状态更新 -> UI 渲染
- **API 抽象层：** NFR6 强制要求，影响上传引擎、服务器发现、链接获取等所有与 gigafile.nu 交互的模块
- **本地持久化：** 历史记录、用户设置共享同一存储基础设施
- **跨平台一致性：** macOS / Windows 行为一致，通过 Tauri 抽象层封装平台差异

## Starter Template Evaluation

### Primary Technology Domain

桌面应用（Tauri 2.x = Rust + React），基于 PRD 和 UX 规范已锁定的技术栈。

### Technical Preferences (From PRD & UX Spec)

- **框架：** Tauri 2.x（Rust 后端 + React 前端）
- **语言：** TypeScript（前端）+ Rust（后端）
- **样式：** Tailwind CSS 4.x，使用 `@theme` 定义设计 Token
- **交互组件：** Radix UI Primitives（Dialog、DropdownMenu、Toast、Progress、Tooltip、Tabs）
- **图标：** Lucide React
- **动画：** Tailwind 内置过渡 + Framer Motion（拖拽动画）
- **构建工具：** Vite

### Starter Options Considered

| 选项 | 包含技术栈 | 优势 | 劣势 | 评估 |
|------|-----------|------|------|------|
| `create-tauri-app` 官方 CLI | Tauri 2.x + Vite + React + TS | 官方维护、最小化、干净起点、保证兼容性 | 不含 Tailwind/Radix，需手动添加 | 推荐 |
| @tauri-apps Production-Ready Template | Tauri 2.x + React 19 + shadcn/ui v4 + Tailwind v4 + Zustand + TanStack Query + i18n + tauri-specta | 功能丰富、最佳实践集成 | 过度设计，包含大量 MVP 不需要的功能（i18n、多窗口、tauri-specta）| 不推荐 |
| TanStack Start React Template | Vite + React 19 + Tailwind CSS 4 + TanStack Router + Biome | 现代工具链 | 引入 TanStack Router，对本项目无必要（只有两个页面，Tab 切换） | 不推荐 |
| MrLightful/create-tauri-react | Vite + React + Tailwind + Shadcn UI | bulletproof-react 架构 | 社区模板，更新频率不确定，Shadcn UI 而非 Radix Primitives | 不推荐 |

### Selected Starter: `create-tauri-app` 官方 CLI

**Rationale for Selection:**

1. **最小化原则：** 本项目需求明确且简单（两个页面、无路由复杂度），不需要重量级模板引入不必要的抽象
2. **官方兼容性保证：** 官方 CLI 确保与 Tauri v2.10.2 的完全兼容
3. **精确控制依赖：** 手动添加 Tailwind CSS 4 + Radix UI Primitives 只需几步配置，且能精确匹配 UX 规范的选型（Radix Primitives 而非 shadcn/ui）
4. **避免过度抽象：** 不引入 TanStack Router（只有两个 Tab 页面）、不引入 tauri-specta（IPC 调用量小）、不引入 i18n（MVP 不需要多语言）
5. **学习价值：** 用户正在从 Vue 转学 React，从干净起点手动搭建有助于理解每个依赖的作用

**Initialization Command:**

```bash
pnpm create tauri-app giga-file-uploader --template react-ts
```

### Architectural Decisions Provided by Starter

**Language & Runtime:**
- TypeScript 5.x（前端，strict mode）
- Rust（后端，Tauri core）

**Build Tooling:**
- Vite 7.x（前端构建 + HMR 开发服务器）
- Cargo（Rust 编译）
- Tauri CLI（应用打包 + 跨平台构建）

**Project Structure (Starter Default):**
```
giga-file-uploader/
  src/              # React 前端源码
  src-tauri/        # Rust 后端源码
    src/
    Cargo.toml
    tauri.conf.json
  package.json
  vite.config.ts
  tsconfig.json
```

**Post-Initialization Setup (First Implementation Story):**
1. 安装 Tailwind CSS 4.x 并配置 `@theme` Token
2. 安装 Radix UI Primitives：`radix-ui`（统一包 v1.4.3）
3. 安装 Lucide React（图标）
4. 安装 Framer Motion（拖拽动画）
5. 配置 ESLint + Prettier
6. 建立前端目录结构（components/、hooks/、stores/、types/）

### Current Verified Versions (2026-02-10)

| 技术 | 当前最新稳定版 |
|------|--------------|
| Tauri | v2.10.2 |
| React | v19.2.1 |
| Vite | v7.3.1 |
| Tailwind CSS | v4.0 |
| Radix UI | v1.4.3（统一包） |
| TypeScript | v5.x |

**Note:** 项目初始化（使用上述命令）应作为第一个实施 Story。

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Rust 后端模块分层架构（API 抽象层、上传引擎、IPC 通信）
2. 前端状态管理方案
3. 本地持久化存储方案
4. Tauri IPC 通信模式设计
5. 上传引擎并发与重试策略

**Important Decisions (Shape Architecture):**
6. 前端组件架构与目录结构
7. 错误处理分层策略
8. 进度事件流节流策略
9. 测试策略

**Deferred Decisions (Post-MVP):**
- 深色/浅色主题切换机制（Phase 3）
- 多语言 i18n 方案（Phase 3）
- 自动更新机制（Phase 3）
- 插件式工具箱框架（Phase 3）

### Data Architecture (Local Persistence)

**Decision: `tauri-plugin-store` (JSON Key-Value Store)**

- **技术:** `@tauri-apps/plugin-store` v2.4.2
- **存储格式:** JSON 文件，存储在应用数据目录
- **Rationale:**
  1. 本项目数据模型极简——历史记录是扁平列表（文件名、链接、时间、过期日期），用户设置是少量键值对
  2. 无需 SQLite 的关系型查询能力——不存在复杂查询、JOIN、索引需求
  3. 官方维护插件，与 Tauri 2.x 完全兼容
  4. JSON 格式人类可读，便于调试和数据迁移
  5. NFR11 要求崩溃不丢失历史——plugin-store 支持即时写入磁盘
- **Affects:** FR18-FR22（历史记录）、FR23（配置）、NFR11（崩溃安全）
- **数据结构规划:**
  - `history.json`: 上传历史记录列表
  - `settings.json`: 用户设置（保留期默认值等）

**不选 SQLite 的原因：** 数据量小（PRD 定义 1000 条以内）、结构简单、无并发写入场景，JSON store 足够且更轻量。

### Authentication & Security

**Decision: 不适用**

本项目是纯本地工具，无用户系统、无登录、无授权。与 gigafile.nu 的交互不需要认证（平台本身免注册使用）。

唯一的安全考量：
- **API 密钥/凭据：** 无（gigafile.nu 无需认证）
- **本地数据保护：** 依赖操作系统文件权限，不做额外加密（存储的是下载链接，非敏感数据）
- **网络安全：** 所有与 gigafile.nu 的通信使用 HTTPS

### API & Communication Patterns

#### Tauri IPC 通信设计

**Decision: Command + Event 双向通信模式**

- **Command（前端 → Rust）：** 用于发起操作请求
  - `start_upload(files, config)` — 启动上传任务
  - `cancel_upload(task_id)` — 取消上传
  - `get_history()` — 获取历史记录
  - `delete_history(id)` — 删除历史记录
  - `save_settings(settings)` — 保存设置
  - `discover_server()` — 发现上传服务器

- **Event（Rust → 前端）：** 用于实时状态推送
  - `upload:progress` — 上传进度更新（文件级 + 分片级）
  - `upload:file-complete` — 单文件上传完成（含链接）
  - `upload:all-complete` — 全部上传完成
  - `upload:error` — 错误事件（超阈值后）
  - `upload:retry-warning` — 重试次数预警

- **Rationale:** Tauri 原生支持 command/event 模式，command 用于请求-响应（同步语义），event 用于持续推送（异步流语义），完美匹配上传场景的通信需求。

#### gigafile.nu API 抽象层

**Decision: Rust Trait 接口抽象**

- **设计模式:** 定义 `GigafileApi` trait，当前唯一实现为 `GigafileApiV1`
- **Rationale:** NFR6 强制要求 API 交互逻辑集中在独立可替换模块中。Rust trait 提供编译期类型安全的接口抽象，API 变更时只需新增/修改实现，不影响上层调用方。
- **Affects:** FR6-FR11（上传引擎）、FR10（服务器发现）、FR15（链接获取）、NFR6（可替换性）

```rust
// 伪代码示意
trait GigafileApi {
    async fn discover_server(&self) -> Result<String>;
    async fn upload_chunk(&self, params: ChunkUploadParams) -> Result<ChunkUploadResponse>;
    async fn verify_upload(&self, url: &str) -> Result<VerifyResult>;
}
```

### Frontend Architecture

#### State Management

**Decision: Zustand v5**

- **Rationale:**
  1. 极简 API，hook-based，学习成本低——适合从 Vue 转学 React 的开发者
  2. 无 Provider 包装，不会出现 Context 的 provider hell
  3. 精确的选择器机制避免不必要的重渲染——对高频进度更新场景关键
  4. 支持 Redux DevTools 调试
  5. Bundle 极小（~1KB gzipped），符合桌面工具轻量化要求
  6. 2026 年 React 生态中最广泛推荐的状态管理方案

- **Store 设计规划:**
  - `useUploadStore` — 上传队列、进度状态、上传配置
  - `useHistoryStore` — 历史记录列表、过滤/排序状态
  - `useAppStore` — 应用级状态（当前 Tab、网络状态）

- **不选 Jotai 的原因：** 本项目状态结构简单明确（几个 store），不存在复杂的原子依赖关系，Zustand 的 store 模式更直觉
- **不选 React Context 的原因：** 上传进度高频更新会导致大量不必要的重渲染

#### Component Architecture

**Decision: 按功能分组的扁平组件结构**

```
src/
  components/
    upload/          # 上传相关组件
      FileDropZone.tsx
      UploadFileItem.tsx
      UploadProgress.tsx
    history/         # 历史记录相关组件
      HistoryItem.tsx
      HistoryList.tsx
    shared/          # 共享组件
      CopyButton.tsx
      TabNav.tsx
  hooks/             # 自定义 hooks
    useUpload.ts
    useDragDrop.ts
    useClipboard.ts
  stores/            # Zustand stores
    uploadStore.ts
    historyStore.ts
    appStore.ts
  types/             # TypeScript 类型定义
    upload.ts
    history.ts
    api.ts
  lib/               # 工具函数
    tauri.ts          # Tauri IPC 封装
    format.ts         # 格式化工具
  App.tsx
  main.tsx
```

- **Rationale:** 项目规模小（两个页面），不需要 feature-based 或 domain-driven 的复杂目录结构。按功能分组的扁平结构足够清晰。

#### Routing Strategy

**Decision: 无路由库，使用 React 状态驱动 Tab 切换**

- **Rationale:** 只有两个页面（上传 / 历史记录），通过 Zustand 的 `currentTab` 状态 + 条件渲染实现 Tab 切换，无需引入 React Router 或 TanStack Router。
- **实现:** Radix UI Tabs 组件 + Zustand `useAppStore.currentTab`

### Infrastructure & Deployment

#### Desktop Application Packaging

**Decision: Tauri 内置打包工具**

- macOS: `.dmg` 安装包
- Windows: `.msi` 或 `.exe` 安装包（NSIS）
- 配置在 `tauri.conf.json` 的 `bundle` 字段
- MVP 阶段手动构建发布，不做自动更新

#### Testing Strategy

**Decision: Vitest 4.x + React Testing Library**

- **单元测试:** Vitest（Vite 原生集成，Jest 兼容 API）
- **组件测试:** Vitest + React Testing Library
- **Rust 后端测试:** Cargo 内置测试框架（`#[cfg(test)]`）
- **E2E 测试:** MVP 阶段不做（桌面应用 E2E 测试成本高，手动验收即可）

#### Code Quality

**Decision: ESLint + Prettier + Clippy**

- 前端: ESLint（React + TypeScript 规则）+ Prettier（代码格式化）
- Rust: Clippy（lint）+ rustfmt（格式化）

### Rust Backend Module Architecture

**Decision: 分层模块架构**

```
src-tauri/
  src/
    main.rs                # Tauri 应用入口
    lib.rs                 # 模块导出
    commands/              # Tauri IPC command handlers
      upload.rs            # 上传相关 commands
      history.rs           # 历史记录 commands
      settings.rs          # 设置 commands
    services/              # 业务逻辑层
      upload_engine.rs     # 上传调度器（分片管理、并发控制）
      chunk_manager.rs     # 分块切割与管理
      retry_engine.rs      # 重试状态机
      progress.rs          # 进度聚合与事件发射
    api/                   # gigafile.nu API 抽象层（NFR6）
      mod.rs               # GigafileApi trait 定义
      v1.rs                # 当前 API 实现（逆向工程版本）
    storage/               # 本地持久化
      history.rs           # 历史记录存储
      settings.rs          # 设置存储
    models/                # 数据模型
      upload.rs            # 上传任务、分片、分块模型
      history.rs           # 历史记录模型
    error.rs               # 统一错误类型
```

- **Rationale:**
  1. `api/` 模块独立——直接满足 NFR6 的可替换要求
  2. `services/` 与 `commands/` 分离——commands 只做参数解析和调用转发，业务逻辑集中在 services
  3. `models/` 统一数据模型——前后端共享的数据结构定义清晰
  4. `error.rs` 统一错误处理——所有模块使用统一的 Result 类型

### Upload Engine Architecture

**Decision: 两级分片 + 首块串行 + 后续并行**

基于技术研究报告确认的 gigafile.nu 协议：

1. **逻辑分片（1GB）：** 将大文件切分为 1GB 的逻辑上传单元，每个分片对应服务端一个独立上传会话
2. **上传块（100MB）：** 将每个逻辑分片进一步切分为 100MB 的 HTTP 请求 payload
3. **首块串行：** 每个分片的第一个上传块串行发送，建立服务端 Cookie 会话
4. **后续并行：** 首块完成后，剩余块通过 tokio 任务并行上传（默认 8 并发）
5. **保序完成：** 使用计数器确保分块按顺序"完成"（借鉴 fireattack/gfile 的保序机制）

**重试策略：**
- 单块失败自动重试，指数退避（初始 200ms，最大 30s）
- 50 次以下用户无感知（NFR10）
- 超过 50 次向前端发送 `upload:retry-warning` 事件，由用户决策
- 单文件失败不影响其他文件上传（NFR12）——每个文件独立的错误隔离

**进度事件流：**
```
Rust 上传线程
  → 每 128KB 更新线程内部计数器
  → 进度聚合器（debounce 50ms）汇总所有线程进度
  → 通过 Tauri event 推送到前端
  → Zustand store 更新
  → React 组件重渲染（仅变化的文件/分片）
```

### Decision Impact Analysis

**Implementation Sequence:**
1. 项目初始化（Starter + 依赖安装）
2. Rust 后端：API 抽象层（`api/` trait + v1 实现）
3. Rust 后端：上传引擎核心（分块、并发、重试）
4. Rust 后端：进度聚合与 IPC 事件发射
5. 前端：Zustand stores + Tauri IPC 封装
6. 前端：核心 UI 组件（FileDropZone、UploadFileItem）
7. 前端：上传流程完整集成
8. 本地持久化：历史记录存储
9. 前端：历史记录页面
10. 打包与跨平台测试

**Cross-Component Dependencies:**
- API 抽象层 → 上传引擎依赖其接口定义
- 上传引擎 → 进度聚合器依赖其分块/线程状态
- 进度聚合器 → 前端 Zustand store 依赖其 IPC 事件格式
- Zustand store → UI 组件依赖其状态结构
- 本地持久化 → 历史记录 UI 依赖其数据模型

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

针对 Tauri (Rust + React) 双语言架构，以下 12 个领域 AI agent 可能做出不同选择，需要统一规范。

### Naming Patterns

**Rust 代码命名：**
- 模块名：`snake_case`（如 `upload_engine`、`chunk_manager`）
- 结构体/枚举：`PascalCase`（如 `UploadTask`、`ChunkStatus`）
- 函数/方法：`snake_case`（如 `start_upload`、`get_progress`）
- 常量：`SCREAMING_SNAKE_CASE`（如 `MAX_RETRY_COUNT`、`DEFAULT_CHUNK_SIZE`）
- Trait：`PascalCase`（如 `GigafileApi`）

**TypeScript/React 代码命名：**
- 组件文件名：`PascalCase.tsx`（如 `FileDropZone.tsx`、`UploadFileItem.tsx`）
- 非组件文件名：`camelCase.ts`（如 `uploadStore.ts`、`useUpload.ts`）
- 组件名：`PascalCase`（如 `FileDropZone`、`CopyButton`）
- 函数/变量：`camelCase`（如 `startUpload`、`fileList`）
- 类型/接口：`PascalCase`（如 `UploadTask`、`HistoryRecord`）
- 常量：`SCREAMING_SNAKE_CASE`（如 `MAX_FILE_SIZE`）
- Hook：`use` 前缀 + `PascalCase`（如 `useUpload`、`useDragDrop`）
- Zustand store：`use` 前缀 + `PascalCase` + `Store` 后缀（如 `useUploadStore`）

**Tauri IPC 命名：**
- Command 名称：`snake_case`（如 `start_upload`、`get_history`）——遵循 Rust 惯例，Tauri 自动映射
- Event 名称：`namespace:action` 格式，全小写，冒号分隔（如 `upload:progress`、`upload:file-complete`、`upload:error`）

**JSON 数据字段命名：**
- IPC 传输的 JSON 数据统一使用 `camelCase`（如 `fileName`、`uploadProgress`、`retryCount`）
- Rust 侧使用 `#[serde(rename_all = "camelCase")]` 宏自动转换

### Structure Patterns

**测试文件位置：**
- 前端测试：与源码同级，文件名后缀 `.test.ts` / `.test.tsx`（如 `uploadStore.test.ts`、`FileDropZone.test.tsx`）
- Rust 测试：模块内 `#[cfg(test)] mod tests { ... }` 内联测试，集成测试放在 `src-tauri/tests/`

**组件组织：**
- 按功能域分组（`upload/`、`history/`、`shared/`）
- 每个组件一个文件，不使用 `index.ts` 桶文件（barrel exports）——避免循环依赖和 tree-shaking 问题
- 组件内部样式使用 Tailwind class，不创建单独的 CSS/SCSS 文件

**导入顺序：**
```typescript
// 1. React/外部库
import { useState } from 'react';
import { useUploadStore } from '@/stores/uploadStore';

// 2. 内部模块（使用 @ 别名）
import { CopyButton } from '@/components/shared/CopyButton';
import { formatFileSize } from '@/lib/format';

// 3. 类型导入
import type { UploadTask } from '@/types/upload';
```

**路径别名：**
- `@/` 映射到 `src/`（在 `tsconfig.json` 和 `vite.config.ts` 中配置）

### Format Patterns

**IPC 数据交换格式：**

Command 返回值统一使用 Rust `Result<T, E>` 类型，Tauri 自动序列化为 JSON：
- 成功：直接返回数据对象
- 失败：返回错误字符串（前端通过 catch 捕获）

**进度事件 Payload 格式：**
```typescript
// upload:progress 事件
{
  taskId: string;        // 文件上传任务 ID
  fileProgress: number;  // 文件整体进度 0-100
  shards: [{             // 分片级进度（大文件）
    shardIndex: number;
    progress: number;    // 0-100
    status: 'pending' | 'uploading' | 'completed' | 'error';
  }];
}

// upload:file-complete 事件
{
  taskId: string;
  fileName: string;
  downloadUrl: string;   // gigafile.nu 下载链接
  fileSize: number;      // 字节
}
```

**日期格式：**
- 存储和传输：ISO 8601 字符串（如 `"2026-02-10T15:30:00Z"`）
- UI 显示：本地化格式化（使用 `Intl.DateTimeFormat`）

**文件大小格式：**
- 存储：字节数（number）
- 显示：自动转换为 KB/MB/GB（使用 `formatFileSize` 工具函数）

### Communication Patterns

**Tauri Event 订阅模式：**
```typescript
// 前端统一通过自定义 hook 订阅事件
function useUploadEvents() {
  useEffect(() => {
    const unlisten = listen<ProgressPayload>('upload:progress', (event) => {
      useUploadStore.getState().updateProgress(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
}
```

**Zustand Store 更新模式：**
- 使用 Zustand 的 `set` 函数进行不可变更新
- 所有 store action 定义在 store 内部，组件不直接调用 `set`
- 使用选择器（selector）订阅精确的状态片段，避免整 store 重渲染

```typescript
// Good: 精确选择器
const progress = useUploadStore(state => state.tasks[taskId]?.progress);

// Bad: 选择整个 store
const store = useUploadStore();
```

**Rust 模块间通信：**
- 模块间通过函数调用和参数传递通信，不使用全局可变状态
- 跨线程通信使用 `tokio::sync::mpsc` channel
- 共享状态使用 `Arc<Mutex<T>>` 或 `Arc<RwLock<T>>`

### Process Patterns

**错误处理分层：**

| 层级 | 位置 | 策略 | 用户感知 |
|------|------|------|---------|
| L0 | Rust HTTP 请求层 | 自动重试（指数退避） | 无感知 |
| L1 | Rust 上传块层 | 重试计数器，50 次以下静默 | 无感知 |
| L2 | Rust 上传任务层 | 超阈值发送 event | 温和提示 |
| L3 | React UI 层 | 展示错误信息 + 操作选项 | 用户决策 |

**错误消息规范：**
- 用户可见的错误消息使用中文，措辞温和（"网络连接中断，等待恢复中..." 而非 "HTTP 连接超时"）
- 日志级别的错误信息使用英文，包含技术细节（`error!("HTTP request failed: status={}, url={}", status, url)`）

**加载状态模式：**
- Zustand store 中使用 `status` 枚举字段而非布尔值
- 文件上传状态：`'pending' | 'uploading' | 'completed' | 'error'`
- 历史记录加载：不显示 loading 指示器（NFR5 要求 <1s 加载）

**React 组件模式：**
- 使用函数组件 + hooks，不使用 class 组件
- Props 类型使用 `interface`（不用 `type`），命名为 `{ComponentName}Props`
- 事件处理函数命名：`handle{Event}`（如 `handleFilesDrop`、`handleCopyClick`）
- 使用 `React.memo` 包裹列表项组件（`UploadFileItem`、`HistoryItem`）以优化重渲染

### Enforcement Guidelines

**All AI Agents MUST:**

1. 遵循上述命名规范，不使用替代命名风格（如不将 event 命名为 `UPLOAD_PROGRESS` 或 `uploadProgress`，统一使用 `upload:progress` 格式）
2. 将所有 gigafile.nu API 交互代码限制在 `src-tauri/src/api/` 目录内，其他模块通过 `GigafileApi` trait 调用
3. 前端状态变更仅通过 Zustand store action 执行，不在组件内直接操作状态
4. Rust 错误使用统一的 `AppError` 类型（定义在 `error.rs`），通过 `?` 运算符传播
5. 所有 IPC event payload 使用 `camelCase` JSON 字段，Rust 侧使用 `#[serde(rename_all = "camelCase")]`
6. 组件导入使用 `@/` 路径别名，不使用相对路径 `../../`

### Pattern Examples

**Good:**
```rust
// Rust: 正确的 command 定义
#[tauri::command]
async fn start_upload(
    files: Vec<FileInput>,
    config: UploadConfig,
    app: AppHandle,
) -> Result<Vec<String>, String> {
    // 调用 service 层
    upload_service::start(files, config, app).await
        .map_err(|e| e.to_string())
}
```

```typescript
// TypeScript: 正确的 store 使用
const fileName = useUploadStore(state => state.tasks[id]?.fileName);
const handleCopy = useUploadStore(state => state.copyLink);
```

**Anti-Patterns:**
```typescript
// BAD: 不要在组件内直接调用 Tauri invoke
const result = await invoke('start_upload', { files }); // 应通过 store action

// BAD: 不要使用整个 store
const { tasks, progress, config } = useUploadStore(); // 应使用精确选择器

// BAD: 不要在 api/ 之外的 Rust 模块中直接调用 HTTP
reqwest::get("https://gigafile.nu/").await; // 应通过 GigafileApi trait
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
giga-file-uploader/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts            # Tailwind CSS 4.x @theme 配置
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions: lint + test + build
│
├── src/                          # React 前端源码
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 根组件（Tab 导航 + 页面容器）
│   ├── App.css                   # Tailwind @import + @theme 定义
│   │
│   ├── components/
│   │   ├── upload/               # 上传功能组件
│   │   │   ├── FileDropZone.tsx           # 文件拖拽区（FR1-FR3）
│   │   │   ├── FileDropZone.test.tsx
│   │   │   ├── UploadFileItem.tsx         # 单文件上传列表项（FR4-FR5, FR12-FR14）
│   │   │   ├── UploadFileItem.test.tsx
│   │   │   ├── UploadProgress.tsx         # 分片级进度展示（FR13）
│   │   │   ├── UploadActions.tsx          # 上传按钮 + 保留期选择（FR23）
│   │   │   └── UploadPage.tsx             # 上传页面容器
│   │   │
│   │   ├── history/              # 历史记录组件
│   │   │   ├── HistoryItem.tsx            # 单条历史记录（FR19-FR22）
│   │   │   ├── HistoryItem.test.tsx
│   │   │   ├── HistoryList.tsx            # 历史记录列表（FR19）
│   │   │   └── HistoryPage.tsx            # 历史记录页面容器
│   │   │
│   │   └── shared/               # 共享组件
│   │       ├── CopyButton.tsx             # 一键复制按钮（FR16, FR20）
│   │       ├── CopyButton.test.tsx
│   │       └── TabNav.tsx                 # 顶部 Tab 导航
│   │
│   ├── hooks/                    # 自定义 React hooks
│   │   ├── useUploadEvents.ts            # Tauri 上传事件订阅
│   │   ├── useDragDrop.ts                # 拖拽逻辑封装
│   │   └── useClipboard.ts               # 剪贴板操作封装
│   │
│   ├── stores/                   # Zustand 状态管理
│   │   ├── uploadStore.ts                # 上传队列 + 进度状态
│   │   ├── uploadStore.test.ts
│   │   ├── historyStore.ts               # 历史记录状态
│   │   ├── historyStore.test.ts
│   │   └── appStore.ts                   # 应用级状态（Tab、网络）
│   │
│   ├── types/                    # TypeScript 类型定义
│   │   ├── upload.ts                     # UploadTask, ShardProgress, ChunkStatus
│   │   ├── history.ts                    # HistoryRecord, ExpiryStatus
│   │   └── api.ts                        # IPC command/event payload 类型
│   │
│   └── lib/                      # 工具函数
│       ├── tauri.ts                      # Tauri IPC invoke/listen 封装
│       └── format.ts                     # formatFileSize, formatDate 等
│
├── src-tauri/                    # Rust 后端源码
│   ├── Cargo.toml
│   ├── tauri.conf.json                   # Tauri 应用配置（窗口、权限、打包）
│   ├── capabilities/                     # Tauri 2.x 权限配置
│   │   └── default.json
│   ├── icons/                            # 应用图标（各平台尺寸）
│   │
│   ├── src/
│   │   ├── main.rs                       # Tauri 应用入口
│   │   ├── lib.rs                        # 模块声明与导出
│   │   ├── error.rs                      # 统一 AppError 类型
│   │   │
│   │   ├── commands/                     # Tauri IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── upload.rs                 # start_upload, cancel_upload
│   │   │   ├── history.rs                # get_history, delete_history
│   │   │   └── settings.rs              # get_settings, save_settings
│   │   │
│   │   ├── services/                     # 业务逻辑层
│   │   │   ├── mod.rs
│   │   │   ├── upload_engine.rs          # 上传调度器（FR6-FR11）
│   │   │   ├── chunk_manager.rs          # 文件分块切割（FR6-FR7）
│   │   │   ├── retry_engine.rs           # 重试状态机（FR8-FR9, NFR9-NFR10）
│   │   │   └── progress.rs              # 进度聚合与 event 发射（FR12-FR14）
│   │   │
│   │   ├── api/                          # gigafile.nu API 抽象层（NFR6）
│   │   │   ├── mod.rs                    # GigafileApi trait 定义
│   │   │   └── v1.rs                     # 当前逆向 API 实现
│   │   │
│   │   ├── storage/                      # 本地持久化（tauri-plugin-store）
│   │   │   ├── mod.rs
│   │   │   ├── history.rs                # 历史记录 CRUD（FR18-FR22）
│   │   │   └── settings.rs              # 用户设置读写（FR23）
│   │   │
│   │   └── models/                       # 数据模型（Serde 序列化）
│   │       ├── mod.rs
│   │       ├── upload.rs                 # UploadTask, Shard, Chunk, UploadConfig
│   │       └── history.rs               # HistoryRecord, ExpiryStatus
│   │
│   └── tests/                            # Rust 集成测试
│       ├── upload_engine_test.rs
│       └── api_v1_test.rs
│
└── public/                       # 静态资源
    └── (空，Tauri 桌面应用不需要 public 资源)
```

### Architectural Boundaries

**IPC Boundary (前端 ↔ Rust):**
- 前端通过 `src/lib/tauri.ts` 封装的 `invoke()` 和 `listen()` 与 Rust 通信
- Rust 通过 `src-tauri/src/commands/` 暴露 command，通过 `AppHandle::emit()` 发送 event
- 数据格式：JSON，字段命名 `camelCase`
- 前端不直接访问文件系统或网络——所有 I/O 操作委托给 Rust

**API Boundary (Rust ↔ gigafile.nu):**
- 所有 gigafile.nu HTTP 交互限制在 `src-tauri/src/api/` 内
- 上层模块（services/、commands/）通过 `GigafileApi` trait 调用，不直接构造 HTTP 请求
- API 变更时只需修改/新增 `api/` 目录下的实现文件

**Storage Boundary (Rust ↔ 本地文件系统):**
- 所有持久化操作限制在 `src-tauri/src/storage/` 内
- 使用 `tauri-plugin-store` 读写 JSON 文件
- 上层模块通过 storage 模块的函数接口访问数据

**State Boundary (Zustand stores):**
- `uploadStore` — 管理上传生命周期，不直接访问历史记录
- `historyStore` — 管理历史记录，不直接控制上传流程
- `appStore` — 管理应用级状态（Tab 切换、全局状态）
- Store 之间通过事件或显式调用通信，不直接引用彼此的内部状态

### Requirements to Structure Mapping

**文件输入与管理（FR1-FR5）:**
- `src/components/upload/FileDropZone.tsx` — 拖拽/选择器输入
- `src/hooks/useDragDrop.ts` — 拖拽逻辑
- `src/components/upload/UploadFileItem.tsx` — 列表预览与删除
- `src/stores/uploadStore.ts` — 待上传文件队列状态

**上传引擎（FR6-FR11）:**
- `src-tauri/src/services/upload_engine.rs` — 上传调度与并发控制
- `src-tauri/src/services/chunk_manager.rs` — 分片/分块切割
- `src-tauri/src/services/retry_engine.rs` — 重试状态机
- `src-tauri/src/api/v1.rs` — gigafile.nu 协议实现
- `src-tauri/src/commands/upload.rs` — IPC command 入口

**进度与状态（FR12-FR14）:**
- `src-tauri/src/services/progress.rs` — 进度聚合与 event 发射
- `src/hooks/useUploadEvents.ts` — 前端事件订阅
- `src/stores/uploadStore.ts` — 进度状态管理
- `src/components/upload/UploadProgress.tsx` — 分片级进度 UI

**链接产出与分享（FR15-FR17）:**
- `src-tauri/src/api/v1.rs` — 从上传响应中提取链接
- `src/components/shared/CopyButton.tsx` — 一键复制
- `src/hooks/useClipboard.ts` — 剪贴板操作

**历史记录（FR18-FR22）:**
- `src-tauri/src/storage/history.rs` — 持久化存储
- `src-tauri/src/commands/history.rs` — IPC command
- `src/stores/historyStore.ts` — 历史记录状态
- `src/components/history/HistoryItem.tsx` — 单条记录 UI
- `src/components/history/HistoryList.tsx` — 记录列表

**上传配置（FR23）:**
- `src-tauri/src/storage/settings.rs` — 设置持久化
- `src/components/upload/UploadActions.tsx` — 保留期选择 UI

**平台与应用（FR24-FR26）:**
- `src-tauri/tauri.conf.json` — 跨平台构建配置
- `src-tauri/capabilities/default.json` — 权限配置

### Data Flow

```
用户拖拽文件
  → FileDropZone (React)
  → uploadStore.addFiles() (Zustand)
  → 用户点击上传
  → uploadStore.startUpload() → invoke('start_upload') (Tauri IPC)
  → commands::upload::start_upload (Rust)
  → services::upload_engine::start() (Rust)
    → services::chunk_manager::split() — 文件分块
    → api::v1::discover_server() — 服务器发现
    → api::v1::upload_chunk() x N — 分块上传（首块串行 + 后续并行）
      → services::retry_engine — 失败重试
      → services::progress — 进度聚合
        → AppHandle::emit('upload:progress') — IPC event
          → useUploadEvents (React hook)
          → uploadStore.updateProgress() (Zustand)
          → UploadFileItem 重渲染 (React)
    → 最后一块返回下载链接
    → AppHandle::emit('upload:file-complete')
      → uploadStore.completeFile()
      → 自动保存到 storage::history
  → 全部完成
    → AppHandle::emit('upload:all-complete')
    → 系统通知 + 提示音
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** PASS
- Tauri 2.10.2 + React 19.2.1 + Vite 7.3.1：官方模板支持，完全兼容
- Tailwind CSS 4.0 + Radix UI 1.4.3：独立工作，互不冲突
- Zustand v5 + React 19：Zustand 完整支持 React 19
- Vitest 4.x + Vite 7.x：Vitest 原生集成 Vite，零配置
- Rust tokio + reqwest + serde：标准 Rust 异步 HTTP 栈，无兼容问题
- tauri-plugin-store 2.4.2：官方维护，与 Tauri 2.10.x 版本对齐

**Pattern Consistency:** PASS
- Rust 命名（snake_case）与 TypeScript 命名（camelCase/PascalCase）各遵循语言惯例
- IPC 边界通过 `#[serde(rename_all = "camelCase")]` 自动转换，无手动映射错误风险
- Event 命名统一 `namespace:action` 格式，覆盖所有 5 种事件类型
- Store 更新模式统一使用 Zustand `set` + 精确选择器

**Structure Alignment:** PASS
- `api/` 独立目录直接支持 NFR6 可替换要求
- `services/` 与 `commands/` 分离支持业务逻辑复用
- 前端按功能分组（upload/、history/、shared/）与两页面 Tab 结构对齐
- 测试文件同级放置，遵循既定的 Structure Patterns

**矛盾检查：** 未发现矛盾决策。

### Requirements Coverage Validation

**Functional Requirements Coverage:** 26/26 PASS

| FR 范围 | 架构支持 | 文件映射 | 状态 |
|---------|---------|---------|------|
| FR1-FR5（文件输入与管理） | FileDropZone + useDragDrop + uploadStore | 5 个文件 | COVERED |
| FR6-FR11（上传引擎） | upload_engine + chunk_manager + retry_engine + api/v1 | 5 个文件 | COVERED |
| FR12-FR14（进度与状态） | progress.rs + useUploadEvents + UploadProgress | 4 个文件 | COVERED |
| FR15-FR17（链接产出） | api/v1 + CopyButton + useClipboard | 3 个文件 | COVERED |
| FR18-FR22（历史记录） | storage/history + historyStore + HistoryItem/List | 5 个文件 | COVERED |
| FR23（上传配置） | storage/settings + UploadActions | 2 个文件 | COVERED |
| FR24-FR26（平台与应用） | tauri.conf.json + capabilities | 2 个文件 | COVERED |

**Non-Functional Requirements Coverage:** 12/12 PASS

| NFR 范围 | 架构支持 | 状态 |
|---------|---------|------|
| NFR1（列表渲染 <1s） | React.memo + Zustand 精确选择器 | COVERED |
| NFR2（进度粒度 <=128KB） | progress.rs 每 128KB 更新 + 50ms debounce | COVERED |
| NFR3（复制 <200ms） | useClipboard 直接调用 Clipboard API | COVERED |
| NFR4（冷启动 <3s） | Tauri 原生启动 + Vite 优化构建 | COVERED |
| NFR5（历史加载 <1s） | tauri-plugin-store JSON 直接读取 | COVERED |
| NFR6（API 可替换） | GigafileApi trait + api/ 独立目录 | COVERED |
| NFR7（Content-Length 校验） | api/v1 上传验证步骤 | COVERED |
| NFR8（动态服务器发现） | api/v1::discover_server() | COVERED |
| NFR9（失败率为 0） | 四层错误处理（L0-L3） | COVERED |
| NFR10（50 次静默重试） | retry_engine 计数器 + 阈值 event | COVERED |
| NFR11（崩溃不丢失） | tauri-plugin-store 即时写入磁盘 | COVERED |
| NFR12（单文件隔离） | 每文件独立 UploadTask + 独立错误状态 | COVERED |

**覆盖缺口：** 0

### Implementation Readiness Validation

**Decision Completeness:** PASS
- 所有关键技术决策均附带具体版本号（6 项技术 + 版本）
- 所有模式附带代码示例（Rust + TypeScript 双语言）
- 一致性规则覆盖 12 个冲突领域，含 Good/Anti-Pattern 对比

**Structure Completeness:** PASS
- 项目目录结构精确到文件级别（约 45 个文件/目录）
- 每个文件标注对应的 FR 编号
- 完整的数据流图（从用户拖拽到系统通知）

**Pattern Completeness:** PASS
- 命名模式覆盖 Rust + TypeScript + IPC + JSON 四个领域
- 通信模式覆盖 Command + Event + Store 三个通道
- 错误处理覆盖 L0-L3 四个层级
- 强制规则 6 条，均有正反示例

### Gap Analysis Results

**Critical Gaps:** 0

**Important Gaps:** 0

**Nice-to-Have (Future Enhancement):**
- Rust Cargo workspace 结构（当项目扩展到多 crate 时考虑）
- 性能 profiling 工具链配置（如需优化大文件上传性能）
- 深色主题 Token 集预定义（Phase 3 需求，当前 Token 结构已支持切换）

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] 项目上下文深入分析（PRD + UX + 技术研究）
- [x] 规模与复杂度评估（低-中等，桌面应用）
- [x] 技术约束识别（Tauri IPC、逆向 API、首块串行协议）
- [x] 横切关注点映射（错误处理、进度事件流、API 抽象层、本地持久化、跨平台一致性）

**Architectural Decisions**
- [x] 关键决策全部文档化并附版本号
- [x] 技术栈完整指定（Tauri + React + Rust + Tailwind + Radix + Zustand）
- [x] 集成模式定义（IPC command/event、GigafileApi trait、tauri-plugin-store）
- [x] 性能考量覆盖（debounce、React.memo、精确选择器、进度粒度）

**Implementation Patterns**
- [x] 命名规范建立（4 领域覆盖）
- [x] 结构模式定义（目录结构、导入顺序、路径别名）
- [x] 通信模式指定（IPC event 订阅、Zustand 更新模式、Rust 模块通信）
- [x] 流程模式文档化（错误分层、加载状态、组件模式）

**Project Structure**
- [x] 完整目录结构定义（精确到文件级）
- [x] 组件边界建立（IPC / API / Storage / State 四层边界）
- [x] 集成点映射（前后端通信、外部 API、本地存储）
- [x] 需求到结构的映射完成（26 FR + 12 NFR 全覆盖）

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
1. **API 抽象层设计清晰：** trait-based 接口隔离，直接满足 NFR6 可替换要求，是整个架构的核心防护
2. **四层错误处理策略：** 从 HTTP 重试到用户提示的渐进式错误处理，精确匹配"零感知失败"的产品目标
3. **进度事件流设计完整：** 从 Rust 线程到 React UI 的全链路数据流清晰，debounce 策略保证性能
4. **前后端职责划分明确：** Rust 处理所有重计算和 I/O，React 纯 UI 渲染，IPC 边界干净
5. **最小化原则贯彻到底：** 无路由库、无重量级状态管理、无不必要的抽象层，每个依赖都有明确理由

**Areas for Future Enhancement:**
- Phase 2: 通知系统增强（Tauri notification plugin 集成）
- Phase 3: 深色主题 Token 集、i18n 框架、侧边栏导航
- Phase 3: 自动更新机制（Tauri updater plugin）

### Implementation Handoff

**AI Agent Guidelines:**
- 严格遵循本文档所有架构决策、命名规范和结构模式
- 所有 gigafile.nu API 代码限制在 `src-tauri/src/api/` 目录
- 前端状态变更仅通过 Zustand store action
- Rust 错误统一使用 `AppError` 类型
- IPC 数据统一 `camelCase` JSON 字段

**First Implementation Priority:**

```bash
pnpm create tauri-app giga-file-uploader --template react-ts
```

随后安装：Tailwind CSS 4.x、radix-ui、lucide-react、framer-motion、zustand、vitest、eslint、prettier，并建立前端目录结构和 Rust 模块骨架。

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED
**Total Steps Completed:** 8
**Date Completed:** 2026-02-10T15:37:35Z
**Document Location:** `_bmad-output/planning-artifacts/architecture.md`

### Final Architecture Deliverables

**Complete Architecture Document**

- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**Implementation Ready Foundation**

- 9 architectural decisions made (local persistence, IPC design, API abstraction, state management, component architecture, routing, testing, Rust module architecture, upload engine architecture)
- 5 implementation pattern categories defined (naming, structure, format, communication, process)
- 8-10 architectural components specified
- 38 requirements fully supported (26 FR + 12 NFR)

**AI Agent Implementation Guide**

- Technology stack with verified versions (Tauri 2.10.2, React 19.2.1, Vite 7.3.1, Tailwind CSS 4.0, Radix UI 1.4.3, Zustand v5, Vitest 4.x, tauri-plugin-store 2.4.2)
- Consistency rules that prevent implementation conflicts (6 enforcement rules with Good/Anti-Pattern examples)
- Project structure with clear boundaries (IPC / API / Storage / State)
- Integration patterns and communication standards

### Implementation Handoff

**For AI Agents:**
This architecture document is your complete guide for implementing giga-file-uploader. Follow all decisions, patterns, and structures exactly as documented.

**First Implementation Priority:**

```bash
pnpm create tauri-app giga-file-uploader --template react-ts
```

**Development Sequence:**

1. Initialize project using documented starter template
2. Set up development environment per architecture (install all dependencies, configure paths and aliases)
3. Implement core architectural foundations (Rust module skeleton, API trait, error types)
4. Build features following established patterns (upload engine -> progress -> UI -> history)
5. Maintain consistency with documented rules

### Quality Assurance Checklist

**Architecture Coherence**

- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**Requirements Coverage**

- [x] All 26 functional requirements are supported
- [x] All 12 non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**Implementation Readiness**

- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

### Project Success Factors

**Clear Decision Framework**
Every technology choice was made collaboratively with clear rationale, ensuring all stakeholders understand the architectural direction.

**Consistency Guarantee**
Implementation patterns and rules ensure that multiple AI agents will produce compatible, consistent code that works together seamlessly.

**Complete Coverage**
All 38 project requirements (26 FR + 12 NFR) are architecturally supported, with clear mapping from business needs to technical implementation.

**Solid Foundation**
The chosen starter template (`create-tauri-app` with `react-ts` template) and architectural patterns provide a production-ready foundation following current best practices.

---

**Architecture Status:** READY FOR IMPLEMENTATION

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

