---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/project-context.md'
---

# giga-file-uploader - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for giga-file-uploader, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

#### 文件输入与管理
- FR1: 用户可以通过拖拽将单个或多个文件添加到上传队列
- FR2: 用户可以通过拖拽将文件夹添加到上传队列，系统递归处理目录中所有文件
- FR3: 用户可以通过系统文件选择器选择文件添加到上传队列
- FR4: 用户可以在上传前查看待上传文件列表（文件名、大小）
- FR5: 用户可以从待上传列表中移除不需要的文件

#### 上传引擎
- FR6: 系统可以将大文件自动切分为逻辑分片进行上传
- FR7: 系统可以对每个分片进一步切分为上传块，通过多线程并发上传
- FR8: 系统可以在上传失败时自动静默重试，用户无感知
- FR9: 系统可以在重试超过阈值时向用户展示失败信息并提供操作选择
- FR10: 系统可以在上传前动态发现 gigafile.nu 当前可用的上传服务器
- FR11: 系统可以遵循 gigafile.nu 协议（首块串行建立会话 + 后续块并行上传）

#### 上传进度与状态
- FR12: 用户可以查看每个文件的整体上传进度
- FR13: 用户可以查看每个分片的独立上传进度
- FR14: 用户可以在界面上看到上传完成的状态

#### 链接产出与分享
- FR15: 系统可以在每个文件上传成功后立即产出该文件的独立下载链接
- FR16: 用户可以一键复制任意文件的下载链接
- FR17: 系统产出的链接为标准 gigafile.nu 格式，与平台原生上传完全兼容

#### 历史记录
- FR18: 系统可以在本地持久化存储所有已上传文件的记录（文件名、链接、上传时间、过期日期）
- FR19: 用户可以查看上传历史记录列表
- FR20: 用户可以从历史记录中复制链接
- FR21: 用户可以删除历史记录条目
- FR22: 系统可以可视化展示链接的过期状态（未过期 / 已过期）

#### 上传配置
- FR23: 用户可以选择文件在 gigafile.nu 上的保留期限（3/5/7/14/30/60/100 天）

#### 平台与应用
- FR24: 应用可以在 macOS 上运行
- FR25: 应用可以在 Windows 上运行
- FR26: 应用可以在无网络状态下正常启动并访问本地数据（历史记录、设置）

### NonFunctional Requirements

#### Performance
- NFR1: 文件添加到待上传列表（拖拽/选择）后，列表应在 1 秒内完成渲染和展示
- NFR2: 上传进度更新粒度不低于每 128KB，确保进度条视觉上平滑推进
- NFR3: 单文件链接复制操作应在 200ms 内完成
- NFR4: 应用启动到可操作状态应在 3 秒以内（冷启动）
- NFR5: 历史记录列表加载应在 1 秒以内（1000 条记录以内）

#### Integration
- NFR6: gigafile.nu API 交互逻辑必须集中在独立可替换的模块中，API 变更时只需修改该模块
- NFR7: 上传完整性应通过 Content-Length 校验验证，确保文件完整到达服务器
- NFR8: 服务器发现机制必须动态获取当前可用上传服务器，不硬编码服务器地址

#### Reliability
- NFR9: 正常网络条件下，用户感知的上传失败率为 0（所有瞬时故障由静默重试覆盖）
- NFR10: 单次上传会话中，自动重试 50 次以下用户完全无感知
- NFR11: 历史记录数据采用本地持久化存储，应用崩溃或异常退出不丢失已保存的记录
- NFR12: 多文件上传中，单个文件失败不影响其他文件的上传流程

### Additional Requirements

#### 来自架构文档

- **Starter Template:** 使用 `pnpm create tauri-app giga-file-uploader --template react-ts` 初始化项目，作为 Epic 1 Story 1 的基础
- 项目初始化后需安装：Tailwind CSS 4.x、radix-ui（统一包 v1.4.3）、lucide-react、framer-motion、zustand v5、vitest 4.x、eslint、prettier
- 建立前端目录结构（components/upload、components/history、components/shared、hooks、stores、types、lib）和 Rust 模块骨架（commands、services、api、storage、models）
- Rust 后端分层架构：commands（IPC 入口）-> services（业务逻辑）-> api（gigafile.nu 交互）-> storage（本地持久化）
- `GigafileApi` trait 接口抽象，所有 gigafile.nu HTTP 交互限制在 `src-tauri/src/api/` 内
- 前端状态管理：Zustand v5，三个 store（uploadStore、historyStore、appStore）
- Tauri IPC 通信：Command（前端->Rust）+ Event（Rust->前端）双向模式
- 本地持久化：tauri-plugin-store v2.4.2（JSON Key-Value Store）
- 上传引擎：两级分片（1GB 逻辑分片 + 100MB 上传块）+ 首块串行 + 后续并行（默认 8 并发）
- 重试策略：指数退避（初始 200ms，最大 30s），50 次以下静默，超过 50 次用户决策
- 进度事件流：每 128KB 更新 -> 50ms debounce 聚合 -> Tauri event -> Zustand -> React 重渲染
- 错误处理四层分级：L0（HTTP 请求自动重试）-> L1（上传块静默重试）-> L2（超阈值事件通知）-> L3（UI 展示用户决策）
- 统一 `AppError` 类型，IPC 数据 camelCase JSON 字段 + Rust 侧 `#[serde(rename_all = "camelCase")]`
- 测试策略：Vitest + React Testing Library（前端），Cargo 内置测试框架（Rust），MVP 阶段不做 E2E

#### 来自 UX 设计文档

- 拖拽交互：全窗口作为拖拽目标，悬停时蓝色边框 + 半透明覆盖层，文件落入后拖拽区收缩为顶部小条
- 窗口默认尺寸 720x560px，最小 600x480px，支持窗口尺寸自适应（compact/default/wide 三档）
- 按钮层级体系：Primary（品牌蓝）/ Secondary（白底灰边）/ Ghost（无背景）/ Icon Button（32x32px）
- 颜色系统：品牌蓝 #3B82F6、背景 #FAFAFA、Surface #FFFFFF、Success #10B981、Warning #F59E0B、Error #EF4444
- 字体系统：系统字体栈，Body 14px/1.5、Caption 12px/1.4、H2 18px/1.4/600
- 自适应进度密度：小文件（<1GB）只展示整体进度条，大文件（>=1GB 多分片）自动展开分片级进度
- 复制按钮反馈：点击后图标变为勾号 1.5 秒后恢复
- 删除历史记录使用内联确认（按钮变为"确认删除？"），不弹对话框
- 空状态设计：历史记录空时显示灰色图标 + "还没有上传记录" + [去上传] 按钮
- 无障碍要求：WCAG 2.1 AA 合规、键盘导航全覆盖、`aria-live` 状态通知、`prefers-reduced-motion` 支持
- 使用容器查询（Container Queries）而非媒体查询处理窗口尺寸适应

#### 来自 Project Context

- 所有导入使用 `@/` 路径别名，禁止 `../../` 相对路径
- 禁止 barrel exports（index.ts），组件直接路径导入
- 用户面向的错误消息使用中文温和措辞，日志级别使用英文技术详情
- 包管理器：pnpm
- 组件样式仅使用 Tailwind class，禁止独立 CSS 文件
- Tailwind CSS 4.0 使用 `@theme` 指令，禁止 `tailwind.config.js`

### FR Coverage Map

| FR | Epic | 描述 |
|----|------|------|
| FR1 | Epic 2 | 拖拽添加单个/多个文件 |
| FR2 | Epic 2 | 拖拽添加文件夹（递归） |
| FR3 | Epic 2 | 文件选择器添加文件 |
| FR4 | Epic 2 | 待上传列表预览 |
| FR5 | Epic 2 | 从列表移除文件 |
| FR6 | Epic 3 | 大文件自动分片 |
| FR7 | Epic 3 | 分片分块并发上传 |
| FR8 | Epic 3 | 静默自动重试 |
| FR9 | Epic 3 | 超阈值失败提示 |
| FR10 | Epic 3 | 动态服务器发现 |
| FR11 | Epic 3 | 首块串行协议 |
| FR12 | Epic 3 | 文件整体进度 |
| FR13 | Epic 3 | 分片独立进度 |
| FR14 | Epic 3 | 上传完成状态 |
| FR15 | Epic 3 | 文件链接产出 |
| FR16 | Epic 3 | 一键复制链接 |
| FR17 | Epic 3 | 标准 gigafile.nu 链接 |
| FR18 | Epic 4 | 历史记录持久化 |
| FR19 | Epic 4 | 查看历史列表 |
| FR20 | Epic 4 | 复制历史链接 |
| FR21 | Epic 4 | 删除历史记录 |
| FR22 | Epic 4 | 过期状态可视化 |
| FR23 | Epic 5 | 保留期选择 |
| FR24 | Epic 1 | macOS 运行 |
| FR25 | Epic 1 | Windows 运行 |
| FR26 | Epic 5 | 离线可用 |

**覆盖率：26/26 FR 全部映射，无遗漏。**

## Epic List

### Epic 1: 项目基础设施与开发环境搭建
开发者可以在本地运行 GigaFile 应用，看到基础窗口界面和 Tab 导航框架。
**FRs covered:** FR24, FR25

### Epic 2: 文件输入与上传队列管理
用户可以通过拖拽或文件选择器将文件添加到上传队列，预览文件列表，并移除不需要的文件。
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 3: 核心上传引擎与链接产出
用户可以上传文件到 gigafile.nu 并获得可分享的下载链接，支持大文件自动分片、并发上传、静默重试，整个过程有清晰的进度展示。
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17

### Epic 4: 历史记录与链接管理
用户可以查看过去上传的文件记录，复制历史链接，了解链接过期状态，并管理（删除）记录。
**FRs covered:** FR18, FR19, FR20, FR21, FR22

### Epic 5: 上传配置与离线体验
用户可以自定义文件保留期限，应用在无网络时仍可正常启动和查看历史数据。
**FRs covered:** FR23, FR26

### Epic 依赖关系

```
Epic 1（基础设施）
  -> Epic 2（文件输入）
       -> Epic 3（上传引擎 + 链接）
            -> Epic 4（历史记录）
                 -> Epic 5（配置 + 离线）
```

## Epic 1: 项目基础设施与开发环境搭建

开发者可以在本地运行 GigaFile 应用，看到基础窗口界面和 Tab 导航框架。

### Story 1.1: 项目初始化与开发环境搭建

As a 开发者,
I want 使用官方 Starter Template 初始化 Tauri + React + TypeScript 项目并安装所有依赖,
So that 我有一个可运行的开发环境作为后续所有功能开发的基础。

**Acceptance Criteria:**

**Given** 开发者在本地有 Node.js、pnpm、Rust 工具链已安装
**When** 执行 `pnpm create tauri-app giga-file-uploader --template react-ts` 并安装所有依赖
**Then** 项目结构包含 `src/`（React 前端）和 `src-tauri/`（Rust 后端）
**And** 以下依赖已安装并配置：Tailwind CSS 4.x（使用 `@theme` 指令在 `src/App.css`）、radix-ui v1.4.3（统一包）、lucide-react、framer-motion、zustand v5、vitest 4.x、react-testing-library、eslint、prettier
**And** `tsconfig.json` 和 `vite.config.ts` 中配置了 `@/` 路径别名映射到 `src/`
**And** Rust 依赖已添加：tokio、reqwest、serde（with derive）、tauri-plugin-store v2.4.2
**And** ESLint + Prettier 配置完成（React + TypeScript 规则）
**And** Clippy + rustfmt 可用
**And** `pnpm tauri dev` 可以成功启动应用窗口（macOS 或 Windows）
**And** 应用冷启动到可操作状态在 3 秒以内（NFR4）

### Story 1.2: 前端目录结构与基础 UI 框架

As a 用户,
I want 打开 GigaFile 应用后看到一个干净的窗口界面，带有"上传"和"历史记录"两个 Tab 导航,
So that 我能直觉地理解应用的功能布局。

**Acceptance Criteria:**

**Given** 应用已通过 Story 1.1 初始化
**When** 用户启动 GigaFile 应用
**Then** 显示默认尺寸 720x560px 的窗口，最小尺寸限制为 600x480px
**And** 窗口顶部展示 Tab 导航（使用 Radix UI Tabs），包含"上传"和"历史记录"两个 Tab
**And** 默认选中"上传" Tab，激活状态为品牌蓝底条 + 加粗文字
**And** 前端目录结构已建立：`components/upload/`、`components/history/`、`components/shared/`、`hooks/`、`stores/`、`types/`、`lib/`
**And** 三个 Zustand store 骨架已创建：`uploadStore.ts`、`historyStore.ts`、`appStore.ts`（含 `currentTab` 状态）
**And** Tab 切换通过 `appStore.currentTab` 状态驱动，无路由库
**And** `src/lib/tauri.ts` IPC 封装文件已创建（空骨架）
**And** `src/App.css` 中已定义 Tailwind `@theme` 设计 Token（颜色系统：品牌蓝 #3B82F6、背景 #FAFAFA、Surface #FFFFFF、Success #10B981、Warning #F59E0B、Error #EF4444）
**And** 字体使用系统字体栈 `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
**And** 应用在 macOS 和 Windows 上均可运行（FR24, FR25）

### Story 1.3: Rust 后端模块骨架与错误处理基础

As a 开发者,
I want Rust 后端具有清晰的分层模块结构和统一的错误处理类型,
So that 后续功能开发有一致的架构基础可以依赖。

**Acceptance Criteria:**

**Given** 项目已通过 Story 1.1 初始化
**When** 查看 `src-tauri/src/` 目录结构
**Then** 包含以下模块目录和文件：
- `commands/mod.rs`（Tauri IPC command handlers 入口）
- `services/mod.rs`（业务逻辑层入口）
- `api/mod.rs`（定义 `GigafileApi` trait 接口）
- `storage/mod.rs`（本地持久化入口）
- `models/mod.rs`（数据模型入口）
- `error.rs`（统一 `AppError` 类型）
**And** `GigafileApi` trait 已定义，包含方法签名：`discover_server()`、`upload_chunk()`、`verify_upload()`
**And** `AppError` 类型实现了 `std::error::Error`，支持 `?` 运算符传播
**And** `AppError` 可序列化为 String 用于 IPC 错误返回
**And** `lib.rs` 正确声明和导出所有模块
**And** `main.rs` 注册了 Tauri 应用入口，插件（tauri-plugin-store）已注册
**And** 所有 Rust 代码通过 `cargo clippy` 无警告
**And** 所有模块的 `mod.rs` 包含基础的 `#[cfg(test)] mod tests` 测试骨架

## Epic 2: 文件输入与上传队列管理

用户可以通过拖拽或文件选择器将文件添加到上传队列，预览文件列表，并移除不需要的文件。

### Story 2.1: 文件拖拽输入与拖拽区交互

As a 用户,
I want 将文件或文件夹拖拽到 GigaFile 窗口中添加到上传队列,
So that 我可以快速便捷地选择要上传的文件。

**Acceptance Criteria:**

**Given** 用户已打开 GigaFile 应用，处于"上传" Tab
**When** 待上传列表为空时
**Then** 主内容区显示大面积拖拽区域（占主内容区 80% 以上），虚线边框 #D1D5DB + 浅灰背景，提示文案"将文件拖到这里，或点击选择文件"

**Given** 用户将文件拖拽悬停在窗口上方
**When** 文件进入窗口区域时
**Then** 窗口整体显示蓝色实线边框（#3B82F6）+ 半透明蓝色覆盖层（20% 透明度），文案变为"松手即可添加"

**Given** 用户松手释放拖拽的文件
**When** 拖拽的是单个或多个散文件时
**Then** 所有文件被添加到 uploadStore 的待上传队列（FR1）
**And** 文件列表在 1 秒内完成渲染（NFR1）

**Given** 用户松手释放拖拽的文件夹
**When** 拖拽的是文件夹时
**Then** 系统通过 Tauri 后端递归遍历文件夹中所有文件并添加到队列（FR2）
**And** 混合拖入（散文件 + 文件夹）自动正确处理

**Given** 待上传列表已有文件
**When** 用户再次拖拽新文件进入窗口
**Then** 新文件追加到现有队列末尾
**And** 拖拽区收缩为顶部小条，可继续拖拽或点击添加

**And** FileDropZone 组件具有 `role="button"` + `aria-label="添加文件"` 无障碍属性
**And** 键盘 Enter/Space 可触发文件选择器
**And** 尊重 `prefers-reduced-motion` 系统设置（开启时禁用拖拽动画）

### Story 2.2: 文件选择器输入

As a 用户,
I want 通过点击按钮打开系统文件选择器来选择要上传的文件,
So that 我有除拖拽以外的备选文件添加方式。

**Acceptance Criteria:**

**Given** 用户在"上传" Tab，拖拽区域显示中
**When** 用户点击拖拽区域或"选择文件"提示文案
**Then** 打开系统原生文件选择器对话框（通过 Tauri 文件系统 API）（FR3）
**And** 文件选择器支持多选

**Given** 用户在文件选择器中选择了一个或多个文件
**When** 用户确认选择
**Then** 选中的文件被添加到 uploadStore 的待上传队列
**And** 文件列表在 1 秒内完成渲染（NFR1）

**Given** 用户在文件选择器中未选择任何文件
**When** 用户取消文件选择器
**Then** 不执行任何操作，界面保持不变

### Story 2.3: 待上传文件列表预览与管理

As a 用户,
I want 在上传前查看待上传文件列表并删除不需要的文件,
So that 我可以确认要上传的内容是正确的。

**Acceptance Criteria:**

**Given** 用户已通过拖拽或文件选择器添加了文件到队列
**When** 待上传列表展示时
**Then** 每个文件显示：文件名（过长时截断，悬停 Tooltip 显示完整名称）、文件大小（自动格式化为 KB/MB/GB）（FR4）
**And** 列表项高度 48px，垂直间距均匀
**And** 列表使用语义化 `<ul>/<li>` 结构

**Given** 用户查看待上传列表中的某个文件
**When** 用户点击该文件的删除按钮（Ghost Icon Button，32x32px）
**Then** 该文件从待上传队列中移除，列表项淡出消失（200ms transition）（FR5）
**And** 如果删除后队列为空，拖拽区域恢复为大面积展示状态

**And** UploadFileItem 组件使用 `React.memo` 包裹以优化重渲染
**And** 文件大小格式化使用 `src/lib/format.ts` 中的 `formatFileSize` 函数
**And** 删除操作不弹确认对话框，直接执行

## Epic 3: 核心上传引擎与链接产出

用户可以上传文件到 gigafile.nu 并获得可分享的下载链接，支持大文件自动分片、并发上传、静默重试，整个过程有清晰的进度展示。

### Story 3.1: gigafile.nu API 抽象层与服务器发现

As a 开发者,
I want 实现 gigafile.nu API 的抽象接口和服务器动态发现功能,
So that 上传引擎可以通过统一接口与 gigafile.nu 通信，且 API 变更时只需修改实现层。

**Acceptance Criteria:**

**Given** Rust 后端模块骨架已建立（Story 1.3）
**When** 实现 `api/v1.rs`（`GigafileApiV1` 结构体，实现 `GigafileApi` trait）
**Then** `discover_server()` 方法通过 HTTP 请求 gigafile.nu 首页 HTML，提取当前活跃上传服务器 URL（FR10）
**And** 服务器 URL 不硬编码，每次上传会话前动态获取（NFR8）
**And** 所有 HTTP 交互代码限制在 `src-tauri/src/api/` 目录内（NFR6）
**And** `upload_chunk()` 方法签名已定义，接受 `ChunkUploadParams`（含文件数据、分片索引、块索引、Cookie jar、服务器 URL 等）
**And** `verify_upload()` 方法签名已定义，用于验证上传完成后获取下载链接
**And** 使用 reqwest 客户端，所有通信使用 HTTPS
**And** 请求包含 Content-Length 头用于完整性校验（NFR7）
**And** 错误通过 `AppError` 类型传播
**And** 包含单元测试验证 trait 定义和基本的 mock 测试

### Story 3.2: 文件分块管理器

As a 开发者,
I want 实现文件自动分片和分块切割功能,
So that 大文件可以按照 gigafile.nu 协议被切分为可上传的块。

**Acceptance Criteria:**

**Given** 一个待上传的文件
**When** 文件大小 <= 1GB 时
**Then** 文件作为单个逻辑分片处理，按 100MB 切分为上传块（FR6, FR7）

**Given** 一个待上传的文件
**When** 文件大小 > 1GB 时
**Then** 文件按 1GB 切分为多个逻辑分片，每个分片再按 100MB 切分为上传块（FR6, FR7）
**And** 最后一个分片/块可以小于标准大小

**And** `chunk_manager.rs` 实现 `split()` 函数，返回分片和块的元数据（索引、偏移量、大小）
**And** 分块操作不一次性读取整个文件到内存——使用流式/按需读取
**And** 数据模型 `models/upload.rs` 定义 `UploadTask`、`Shard`、`Chunk`、`UploadConfig` 结构体
**And** 所有结构体标注 `#[serde(rename_all = "camelCase")]` 用于 IPC 序列化
**And** 包含单元测试覆盖：小文件（单分片单块）、中文件（单分片多块）、大文件（多分片多块）、边界值（恰好 1GB、恰好 100MB）

### Story 3.3: 上传引擎核心 - 首块串行与并发上传

As a 用户,
I want 点击上传后文件能可靠地上传到 gigafile.nu,
So that 我的文件可以被发送到服务器并最终获得下载链接。

**Acceptance Criteria:**

**Given** 用户点击上传按钮，uploadStore 触发 `startUpload` action，调用 Tauri command `start_upload`
**When** 上传引擎收到上传请求
**Then** 对每个文件创建独立的 `UploadTask`，每个文件有独立的错误隔离（NFR12）

**Given** 一个文件的逻辑分片准备上传
**When** 开始上传该分片
**Then** 第一个上传块串行发送，建立服务端 Cookie 会话（FR11）
**And** 首块响应中的 Cookie 被保存并用于该分片所有后续块
**And** 首块成功后，剩余块通过 tokio 任务并行上传，默认 8 并发（FR7, FR11）
**And** 使用计数器确保分块按顺序"完成"（保序机制）

**Given** 多个文件同时上传
**When** 上传过程中
**Then** 每个文件独立进行上传调度，单文件失败不影响其他文件（NFR12）

**And** `upload_engine.rs` 实现 `start()` 函数作为上传调度入口
**And** 通过 `GigafileApi` trait 调用上传方法，不直接构造 HTTP 请求
**And** 上传前先调用 `discover_server()` 获取服务器 URL
**And** Tauri command `start_upload` 定义在 `commands/upload.rs`，接受 `Vec<FileInput>` 和 `UploadConfig`
**And** Tauri command `cancel_upload` 定义在 `commands/upload.rs`，支持取消正在进行的上传

### Story 3.4: 重试引擎与错误处理

As a 用户,
I want 上传过程中的网络瞬时故障被自动静默处理,
So that 我不会因为偶发的网络问题而看到错误提示。

**Acceptance Criteria:**

**Given** 单个上传块请求失败（网络错误、超时、5xx 响应）
**When** 重试次数 < 50 次
**Then** 自动静默重试，指数退避（初始 200ms，最大 30s），用户完全无感知（FR8, NFR9, NFR10）

**Given** 单个上传块连续重试
**When** 重试次数 >= 50 次
**Then** 通过 Tauri event 发送 `upload:retry-warning` 事件到前端（FR9）
**And** 事件 payload 包含 `taskId`、`fileName`、`retryCount`、`errorMessage`

**Given** 前端收到 `upload:retry-warning` 事件
**When** UI 展示错误提示
**Then** 使用琥珀色温和提示，中文措辞（如"网络连接不稳定，已重试 XX 次..."），提供操作选项

**Given** 上传块最终不可恢复
**When** 该文件上传彻底失败
**Then** 通过 `upload:error` 事件通知前端，该文件状态变为 `error`
**And** 其他文件的上传不受影响（NFR12）

**And** `retry_engine.rs` 实现重试状态机，包含重试计数器、退避计算、阈值判断
**And** 错误处理遵循四层分级：L0（HTTP 自动重试）-> L1（块级静默）-> L2（超阈值事件）-> L3（UI 展示）
**And** 日志级别错误信息使用英文技术详情：`error!("HTTP request failed: status={}, url={}", status, url)`

### Story 3.5: 上传进度聚合与实时展示

As a 用户,
I want 在上传过程中看到每个文件的进度和大文件的分片级进度,
So that 我能直觉地了解上传状态，安心等待完成。

**Acceptance Criteria:**

**Given** 文件正在上传
**When** 上传引擎处理每个块
**Then** 每 128KB 更新线程内部进度计数器（NFR2）
**And** 进度聚合器以 50ms debounce 汇总所有线程进度
**And** 通过 Tauri event `upload:progress` 推送到前端

**Given** 前端收到 `upload:progress` 事件
**When** 事件 payload 包含 `taskId`、`fileProgress`（0-100）、`shards` 数组（每个分片的 `shardIndex`、`progress`、`status`）
**Then** `useUploadEvents` hook 订阅事件并更新 `uploadStore`
**And** `UploadFileItem` 组件展示文件级进度条 + 百分比数字（FR12）

**Given** 上传的文件大小 < 1GB（单分片）
**When** 展示进度
**Then** 只展示一根整体进度条（自适应进度密度）

**Given** 上传的文件大小 >= 1GB（多分片）
**When** 展示进度
**Then** 自动展开分片级进度视图，每个分片一根子进度条（FR13），可折叠
**And** 每个分片显示 `shardIndex`、进度百分比、状态（pending/uploading/completed/error）

**And** 进度条使用 Radix UI Progress 组件，品牌蓝色填充
**And** 进度条动画平滑过渡（`transition: width 300ms ease`），不使用条纹或跑马灯
**And** 上传中的文件状态标识为"上传中"，等待中的标识为"等待中"（FR14）
**And** UploadFileItem 使用 `React.memo` + Zustand 精确选择器，仅变化的文件/分片触发重渲染

### Story 3.6: 上传完成、链接产出与一键复制

As a 用户,
I want 文件上传完成后立即看到下载链接并一键复制,
So that 我可以快速将链接分享给他人。

**Acceptance Criteria:**

**Given** 单个文件的所有分片上传完成
**When** 服务端返回下载链接
**Then** 通过 Tauri event `upload:file-complete` 推送到前端（FR15）
**And** 事件 payload 包含 `taskId`、`fileName`、`downloadUrl`（标准 gigafile.nu 格式）、`fileSize`（字节）
**And** 产出的链接为标准 gigafile.nu 格式，与平台原生上传完全兼容（FR17）

**Given** 前端收到 `upload:file-complete` 事件
**When** 更新 UI
**Then** 该文件的进度条变为绿色（Success #10B981）+ 勾号图标（Lucide React）
**And** 显示下载链接文本 + [复制] 按钮（CopyButton 组件）（FR14）

**Given** 用户点击 [复制] 按钮
**When** 执行复制操作
**Then** 链接在 200ms 内复制到系统剪贴板（NFR3）（FR16）
**And** 按钮图标变为勾号，1.5 秒后恢复为复制图标
**And** CopyButton 具有 `aria-label="复制链接"` -> 复制后变为 `aria-label="已复制"`

**Given** 所有文件上传完成
**When** 最后一个文件完成
**Then** 通过 Tauri event `upload:all-complete` 推送到前端
**And** 前端界面状态更新为"全部上传完成"

> **[Phase 2]** 系统通知（Tauri notification API）和系统提示音将在 Phase 2 中作为独立 Story 实现

### Story 3.7: 底部操作栏与上传触发按钮

As a 用户,
I want 在待上传列表下方看到一个上传按钮来启动上传,
So that 我可以在确认文件列表后一键触发上传流程。

**Acceptance Criteria:**

**Given** 用户已通过拖拽或文件选择器添加了文件到待上传队列
**When** 查看上传页面底部
**Then** 底部固定区域左侧显示文件统计信息："N 个文件，X.X GB"（文件数 + 总大小，使用 `formatFileSize` 格式化）
**And** 右侧显示 [开始上传] 按钮（Primary 样式，品牌蓝 #3B82F6）
**And** 保留期暂用默认值 7 天（硬编码，Story 5.1 替换为下拉选择器）

**Given** 待上传队列为空
**When** 查看底部区域
**Then** [上传] 按钮置灰禁用，不可点击

**Given** 用户点击 [上传] 按钮
**When** 触发上传
**Then** 调用 `uploadStore.startUpload(7)` 启动上传流程
**And** 待上传文件转为活跃上传任务，进度开始显示

**Given** 上传已在进行中
**When** 查看底部区域
**Then** 按钮不可再次点击（防止重复触发）

**Given** 所有文件上传完成（`allUploadsComplete` 为 true）
**When** 查看底部区域
**Then** 左侧统计信息变为"N 个文件上传完成"
**And** [开始上传] 按钮替换为 [清空列表] 按钮（Secondary 样式，白底灰边）
**And** 点击 [清空列表] 后清除所有已完成的上传任务（`activeTasks` 清空、`allUploadsComplete` 重置）
**And** 页面回到初始拖拽区状态，用户可以拖入新文件开始下一轮上传
**And** 清空操作不弹确认对话框，直接执行（已完成的记录可在历史记录中查看）

**And** 组件命名为 `UploadActionBar.tsx`，放在 `src/components/upload/` 下
**And** 底部区域使用 `sticky bottom-0` 固定定位
**And** UploadActionBar 具有适当的无障碍属性

## Epic 4: 历史记录与链接管理

用户可以查看过去上传的文件记录，复制历史链接，了解链接过期状态，并管理（删除）记录。

### Story 4.1: 上传历史持久化存储

As a 用户,
I want 每次上传成功的文件记录自动保存到本地,
So that 我以后可以找到之前上传的文件链接。

**Acceptance Criteria:**

**Given** 单个文件上传成功（`upload:file-complete` 事件触发）
**When** 系统处理上传完成事件
**Then** 自动将记录保存到本地存储（FR18），包含：文件名、下载链接、上传时间（ISO 8601）、过期日期（ISO 8601，根据保留期计算）、文件大小
**And** 使用 `tauri-plugin-store` 写入 `history.json`
**And** 写入操作即时持久化到磁盘，应用崩溃或异常退出不丢失已保存的记录（NFR11）

**And** `storage/history.rs` 实现 CRUD 函数：`add_record()`、`get_all()`、`delete_record()`
**And** `models/history.rs` 定义 `HistoryRecord` 结构体（`#[serde(rename_all = "camelCase")]`）
**And** `commands/history.rs` 定义 IPC commands：`get_history`、`delete_history`
**And** 包含单元测试覆盖添加、读取、删除操作

### Story 4.2: 历史记录列表展示与链接管理

As a 用户,
I want 在"历史记录" Tab 中查看所有上传过的文件记录并复制链接,
So that 我可以随时找到之前分享的链接。

**Acceptance Criteria:**

**Given** 用户切换到"历史记录" Tab
**When** 有历史记录存在
**Then** 展示历史记录列表，加载时间 < 1 秒（1000 条以内）（NFR5）
**And** 不显示 Loading 指示器（加载足够快不需要）
**And** 每条记录展示：文件名、上传日期（本地化格式 `Intl.DateTimeFormat`）、过期日期、链接、过期状态标签（FR19）

**Given** 用户查看历史记录列表
**When** 链接尚未过期
**Then** 显示绿色"有效"标签（Success #10B981）

**Given** 用户查看历史记录列表
**When** 链接已过期（当前日期 > 过期日期）
**Then** 显示灰色"已过期"标签，复制按钮仍可用但视觉灰化（FR22）

**Given** 用户点击某条记录的 [复制] 按钮
**When** 执行复制操作
**Then** 链接复制到剪贴板，按钮图标变勾号 1.5 秒后恢复（FR20）

**Given** 用户点击某条记录的 [删除] 按钮
**When** 执行删除操作
**Then** 按钮变为"确认删除？"（内联确认，不弹对话框），再次点击后记录从列表和本地存储中移除（FR21）
**And** 列表项淡出消失（200ms transition）

**Given** 用户切换到"历史记录" Tab
**When** 没有任何历史记录
**Then** 展示空状态：灰色图标 + "还没有上传记录" + [去上传] 按钮（点击切换到"上传" Tab）

**And** HistoryItem 组件使用 `React.memo` 包裹
**And** `historyStore` 通过 Tauri command 加载数据，不在组件内直接调用 `invoke()`
**And** 过期状态通过颜色 + 文字 + 图标三重编码（无障碍要求）
**And** 列表使用语义化 `<ul>/<li>` 结构，状态变化使用 `aria-live="polite"`

## Epic 5: 上传配置与离线体验

用户可以自定义文件保留期限，应用在无网络时仍可正常启动和查看历史数据。

### Story 5.1: 文件保留期选择

As a 用户,
I want 在上传前选择文件在 gigafile.nu 上的保留期限,
So that 我可以根据需要控制链接的有效时间。

**Acceptance Criteria:**

**Given** 用户在"上传" Tab，待上传列表已有文件
**When** 查看底部固定区域（UploadActionBar，已由 Story 3.7 实现）
**Then** 上传按钮左侧新增保留期选择控件（使用 Radix UI DropdownMenu），替换原有的硬编码默认值（FR23）
**And** 可选天数：3 / 5 / 7 / 14 / 30 / 60 / 100 天
**And** 默认值为 7 天

**Given** 用户选择了不同的保留期
**When** 选择完成
**Then** `uploadStore` 更新保留期配置
**And** 选择立即生效，无需额外确认

**Given** 用户点击 [上传] 按钮
**When** 上传请求发送到 Rust 后端
**Then** 上传配置中的 `lifetime` 字段传递给 gigafile.nu API
**And** 保留期用于计算历史记录的过期日期

**And** 用户的保留期偏好保存到 `settings.json`（`storage/settings.rs`），下次启动应用时恢复上次选择
**And** `commands/settings.rs` 定义 IPC commands：`get_settings`、`save_settings`

### Story 5.2: 离线模式与网络状态感知

As a 用户,
I want 在无网络状态下仍能正常打开应用并查看历史记录,
So that 我在离线时也能找到之前上传的链接信息。

**Acceptance Criteria:**

**Given** 用户在无网络状态下启动 GigaFile
**When** 应用加载
**Then** 应用正常打开，显示主界面（FR26）
**And** 历史记录正常加载和展示（本地数据不依赖网络）
**And** 设置正常读取（本地存储）

**Given** 用户在无网络状态下尝试上传文件
**When** 点击上传按钮
**Then** 界面温和提示当前无网络连接（中文措辞），不允许发起上传
**And** 待上传文件队列保持不变，用户可以在网络恢复后直接上传

**Given** 用户在上传过程中网络断开
**When** 网络中断时间较短（静默重试可覆盖）
**Then** 用户无感知，上传自动恢复

**And** 网络状态检测逻辑在 Rust 后端实现
**And** `appStore` 包含网络状态字段，用于 UI 条件展示

## Epic 6: Bug 修复与体验优化

修复实施阶段发现的交互缺陷和性能问题，补全遗漏的构建配置，提升上传体验的完整度和专业感。

**变更来源:** Sprint 变更提案 2026-02-12

### Epic 依赖关系（更新）

```
Epic 1 → Epic 2 → Epic 3 → Epic 4 → Epic 5
                                        ↓
                                    Epic 6（Bug 修复与优化）
```

### Story 6.1: 操作栏固定底部布局修复

As a 用户,
I want 上传操作栏始终固定在窗口底部,
So that 无论文件列表多长，我都能看到上传按钮和统计信息。

**Acceptance Criteria:**

**Given** 用户添加了大量文件到待上传列表
**When** 文件列表超出可视区域高度
**Then** 文件列表区域出现独立滚动条
**And** UploadActionBar 始终固定在窗口底部，不随列表滚动

**Given** 用户切换到"历史记录" Tab
**When** 历史记录列表较长
**Then** 历史记录页面布局正常，不受布局修复影响

**技术方案:**
- `App.tsx` 根容器 `min-h-screen` → `h-screen overflow-hidden`
- 确保 TabNav 内容区正确传递高度
- `UploadFileList` 作为唯一滚动区域（`flex-1 overflow-y-auto`）
- `UploadActionBar` 移除 `sticky bottom-0`，依赖 flex 布局自然固定

**影响文件:**
- `src/App.tsx`
- `src/components/shared/TabNav.tsx`（可能）
- `src/components/upload/UploadPage.tsx`（可能）
- `src/components/upload/UploadActionBar.tsx`

### Story 6.2: 上传中文件添加区禁用

As a 用户,
I want 上传进行中时无法通过拖拽或点击添加新文件,
So that 不会误操作导致上传状态混乱。

**Acceptance Criteria:**

**Given** 用户已点击"开始上传"，上传正在进行中
**When** 用户尝试拖拽文件到窗口
**Then** 拖拽操作被阻止，文件不会被添加到队列
**And** 拖拽区视觉降低透明度 + `cursor-not-allowed`

**Given** 上传正在进行中
**When** 用户尝试点击拖拽区打开文件选择器
**Then** 点击无响应，文件选择器不会打开
**And** 组件添加 `aria-disabled="true"` 无障碍属性

**Given** 所有文件上传完成或清空列表后
**When** 回到初始状态
**Then** 拖拽区恢复正常交互

**影响文件:**
- `src/components/upload/FileDropZone.tsx`
- `src/hooks/useDragDrop.ts`（可能需要 disabled 参数）

### Story 6.3: 应用图标替换

As a 用户,
I want 应用使用自定义品牌图标而非 Tauri 默认图标,
So that 应用在桌面、任务栏和 Dock 中具有专业的视觉识别度。

**Acceptance Criteria:**

**Given** 根目录下存在 `icon_candidate.png`（实际为 JPEG 格式，640x640）和 `icon_candidate.svg`
**When** 执行图标生成流程
**Then** 先将 JPEG 转换为真正的 PNG 格式（`sips -s format png` 或同等工具）
**And** 使用 `pnpm tauri icon` 生成所有所需尺寸（32x32, 128x128, 128x128@2x, icon.ico, icon.icns）
**And** `src-tauri/icons/` 下所有图标文件被替换

**Given** 图标已替换
**When** 在 macOS 上运行 `pnpm tauri dev`
**Then** Dock 和窗口标题栏显示自定义图标

**影响文件:**
- `src-tauri/icons/`（全部替换）

### Story 6.4: 上传进度流式更新（128KB 粒度）

As a 用户,
I want 上传大文件时进度条平滑推进而非长时间静止后跳跃,
So that 我能直觉感受到上传在持续进行，不会误以为上传卡住。

**Acceptance Criteria:**

**Given** 用户上传一个 2.9GB 文件（3 个逻辑分片，33 个 100MB chunks）
**When** 上传进行中
**Then** 进度条平滑更新，无超过 2 秒的静止期
**And** 进度更新粒度为每 128KB（NFR2），而非每 100MB chunk 完成后

**Given** 上传引擎通过 reqwest 发送 HTTP 请求
**When** 发送 100MB chunk 数据
**Then** 使用流式 Body（`reqwest::Body::wrap_stream`），每发送 128KB 调用 `counter.fetch_add(131_072)`
**And** 现有 50ms debounce 聚合机制保持不变

**Given** 多个 chunk 并发上传（默认 8 并发）
**When** 多线程同时更新 `AtomicU64` 计数器
**Then** 原子操作保证线程安全，进度汇总准确无丢失

**技术方案:**
- `api/v1.rs`: `upload_chunk()` 接收 `Arc<AtomicU64>` 进度计数器，流式 Body 每 128KB 回调
- `services/upload_engine.rs`: 将计数器传递给 API 调用，移除原有的 chunk 完成后 `fetch_add`
- `services/progress.rs`: 聚合器无需改动

**影响文件:**
- `src-tauri/src/api/v1.rs`
- `src-tauri/src/services/upload_engine.rs`

### Story 6.5: 每个任务的实时上传速度显示

As a 用户,
I want 上传过程中看到每个文件的实时传输速度,
So that 我能了解当前网络状况和预估剩余时间。

**Acceptance Criteria:**

**Given** 文件正在上传
**When** 进度事件推送到前端
**Then** 每个文件任务旁显示实时速度（格式如 `12.5 MB/s`）
**And** 速度基于滑动窗口或最近 N 个采样点平均计算，避免瞬时波动

**Given** 上传完成或暂停
**When** 速度为 0
**Then** 速度显示消失或显示 `--`

**Given** 多线程并发上传（默认 8 并发）
**When** 计算速度
**Then** 速度自然包含所有并发线程贡献的聚合值

**技术方案:**
- `services/progress.rs`: 在 50ms 定时器中记录 `(timestamp, bytes_uploaded)` 采样，计算速度
- `models/upload.rs`: 进度结构体新增 `speed: u64` 字段（bytes/sec）
- `upload:progress` 事件 payload 新增 `speed` 字段
- `UploadFileItem.tsx`: 显示格式化速度

**依赖:** Story 6.4 必须先完成

**影响文件:**
- `src-tauri/src/services/progress.rs`
- `src-tauri/src/models/upload.rs`
- `src/components/upload/UploadFileItem.tsx`
- `src/stores/uploadStore.ts`

### Story 6.6: Windows 双版本打包（NSIS + Portable）

As a 用户,
I want 在 Windows 上既有安装包也有免安装便携版,
So that 我可以根据使用场景选择合适的版本。

**Acceptance Criteria:**

**Given** 执行 `pnpm tauri build` 在 Windows 环境
**When** 构建完成
**Then** 产出 NSIS 安装包（setup.exe）
**And** 产出 Portable 免安装版（可直接运行的 exe）

**Given** 用户使用 Portable 版本
**When** 在 Win10 1803+ 或 Win11 上运行
**Then** 应用正常启动运行（依赖系统预装的 WebView2 运行时）

**Given** 用户使用 NSIS 安装包
**When** 安装完成
**Then** WebView2 运行时自动捆绑安装（如目标机器缺失）

**依赖:** Story 6.3（图标替换）建议先完成

**影响文件:**
- `src-tauri/tauri.conf.json`（bundle 配置）
