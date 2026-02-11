# Story 1.1: 项目初始化与开发环境搭建

## Story Info

- **Story Key:** 1-1
- **Epic:** Epic 1 - 项目基础设施与开发环境搭建
- **Status:** story-doc-review
- **Created:** 2026-02-11
- **FRs Covered:** FR24 (macOS), FR25 (Windows)
- **NFRs Covered:** NFR4 (冷启动 <3s)

## User Story

As a 开发者,
I want 使用官方 Starter Template 初始化 Tauri + React + TypeScript 项目并安装所有依赖,
So that 我有一个可运行的开发环境作为后续所有功能开发的基础。

## Acceptance Criteria

### AC-1: 项目脚手架初始化

**Given** 开发者在本地有 Node.js、pnpm、Rust 工具链已安装
**When** 执行 `pnpm create tauri-app giga-file-uploader --template react-ts`
**Then** 项目根目录包含 `src/`（React 前端源码目录）和 `src-tauri/`（Rust 后端源码目录）
**And** `package.json` 存在且包含 Tauri 相关脚本（`tauri dev`、`tauri build`）
**And** `vite.config.ts` 存在且包含 Vite 构建配置
**And** `tsconfig.json` 存在且 `strict: true` 已启用
**And** `src-tauri/Cargo.toml` 存在且包含 tauri 依赖
**And** `src-tauri/tauri.conf.json` 存在且应用标识为 `giga-file-uploader`

### AC-2: 前端依赖安装与配置

**Given** 项目脚手架已通过 AC-1 初始化
**When** 检查前端依赖
**Then** 以下 npm 包已安装并记录在 `package.json` 的 `dependencies` 中：
  - `radix-ui` (v1.4.3, 统一包)
  - `lucide-react` (latest)
  - `framer-motion` (latest)
  - `zustand` (v5)
**And** 以下 npm 包已安装并记录在 `devDependencies` 中：
  - `tailwindcss` (4.x)
  - `@tailwindcss/vite` (4.x, Vite 插件)
  - `vitest` (4.x)
  - `@testing-library/react` (latest)
  - `@testing-library/jest-dom` (latest)
  - `eslint` (latest)
  - `prettier` (latest)
  - 相关 ESLint 插件：`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
**And** `pnpm-lock.yaml` 存在且与 `package.json` 一致

### AC-3: Tailwind CSS 4.x 配置

**Given** Tailwind CSS 4.x 已安装
**When** 检查 Tailwind 配置
**Then** `vite.config.ts` 中已注册 `@tailwindcss/vite` 插件
**And** `src/App.css`（或 `src/index.css`）中包含 `@import "tailwindcss"` 导入声明
**And** 不存在 `tailwind.config.js` 或 `tailwind.config.ts` 文件（Tailwind CSS 4.x 使用 CSS-first 配置）
**And** 在 HTML 中使用 Tailwind 工具类（如 `class="p-4 text-center"`）可以正常生效

### AC-4: TypeScript 路径别名配置

**Given** 项目使用 TypeScript + Vite
**When** 检查路径别名配置
**Then** `tsconfig.json` 中包含 `"paths": { "@/*": ["./src/*"] }` 配置
**And** `vite.config.ts` 中包含对应的 `resolve.alias` 配置，将 `@/` 映射到 `src/`
**And** 在 TypeScript 文件中使用 `import { xxx } from '@/lib/xxx'` 格式可以正确解析

### AC-5: Rust 依赖配置

**Given** 项目脚手架已通过 AC-1 初始化
**When** 检查 `src-tauri/Cargo.toml` 的 `[dependencies]` 部分
**Then** 以下 Rust crate 已添加：
  - `tokio` (features: ["full"])
  - `reqwest` (features: ["json", "cookies"])
  - `serde` (features: ["derive"])
  - `serde_json`
  - `tauri-plugin-store` (版本 "2")
**And** `cargo check` 在 `src-tauri/` 目录下可以成功执行，无编译错误

### AC-6: ESLint + Prettier 配置

**Given** ESLint 和 Prettier 已安装
**When** 检查代码质量工具配置
**Then** ESLint 配置文件存在（`eslint.config.js` flat config 格式），包含：
  - TypeScript 规则（通过 `typescript-eslint`）
  - React Hooks 规则（通过 `eslint-plugin-react-hooks`）
  - React Refresh 规则（通过 `eslint-plugin-react-refresh`）
**And** Prettier 配置文件存在（`.prettierrc`），包含基础格式化规则：
  - `semi: true`
  - `singleQuote: true`
  - `trailingComma: "es5"`
  - `printWidth: 100`
**And** `pnpm lint` 命令可以成功执行（无错误输出或仅有可接受的警告）
**And** `pnpm format`（或等效 Prettier 命令）可以成功执行

### AC-7: Rust 代码质量工具验证

**Given** Rust 工具链已安装
**When** 在 `src-tauri/` 目录下执行代码质量检查
**Then** `cargo clippy` 执行通过，无 warning
**And** `cargo fmt --check` 执行通过（代码格式符合 rustfmt 标准）

### AC-8: 应用可成功启动

**Given** 所有依赖已安装且配置完成
**When** 执行 `pnpm tauri dev`
**Then** 应用窗口成功打开，显示默认的 React 欢迎页面（脚手架默认内容即可）
**And** Vite HMR 开发服务器正常运行（修改 React 代码后浏览器自动刷新）
**And** Rust 后端编译成功且进程正常运行
**And** 应用冷启动到可操作状态在 3 秒以内（NFR4）
**And** 在 macOS 上可运行（FR24）；Windows 环境如可用也应验证（FR25）

### AC-9: Vitest 测试框架可运行

**Given** Vitest 已安装
**When** 执行 `pnpm test`（或 `pnpm vitest run`）
**Then** Vitest 测试运行器成功启动
**And** 如果存在任何默认测试文件，测试通过
**And** `vitest.config.ts`（或在 `vite.config.ts` 中内联配置）包含 `test` 配置块

## Tasks

### Task 1: 执行 Tauri 脚手架初始化

**对应 AC:** AC-1
**依赖:** 无

**Subtasks:**

1.1. 在项目工作目录下执行 `pnpm create tauri-app giga-file-uploader --template react-ts`，生成项目骨架
1.2. 验证生成的目录结构包含 `src/`、`src-tauri/`、`package.json`、`vite.config.ts`、`tsconfig.json`
1.3. 执行 `pnpm install` 安装脚手架默认依赖
1.4. 确认 `src-tauri/tauri.conf.json` 中的 `identifier` 字段已设置为合理值（如 `com.gigafile.uploader`）

### Task 2: 安装前端运行时依赖

**对应 AC:** AC-2
**依赖:** Task 1

**Subtasks:**

2.1. 执行 `pnpm add radix-ui lucide-react framer-motion zustand` 安装运行时依赖
2.2. 验证 `package.json` 的 `dependencies` 中包含上述四个包及其版本号
2.3. 确认 radix-ui 版本为 v1.4.3 统一包（如版本不匹配则指定版本安装）
2.4. 确认 zustand 版本为 v5.x（如版本不匹配则指定版本安装）

### Task 3: 安装前端开发依赖

**对应 AC:** AC-2, AC-6, AC-9
**依赖:** Task 1

**Subtasks:**

3.1. 执行 `pnpm add -D tailwindcss @tailwindcss/vite` 安装 Tailwind CSS 4.x 及其 Vite 插件
3.2. 执行 `pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom` 安装测试框架
3.3. 执行 `pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh` 安装 ESLint 及插件
3.4. 执行 `pnpm add -D prettier` 安装 Prettier
3.5. 验证所有 devDependencies 已正确记录在 `package.json` 中

### Task 4: 配置 Tailwind CSS 4.x

**对应 AC:** AC-3
**依赖:** Task 3

**Subtasks:**

4.1. 在 `vite.config.ts` 中导入并注册 `@tailwindcss/vite` 插件
4.2. 修改 `src/App.css`（或 `src/index.css`）文件，添加 `@import "tailwindcss"` 声明
4.3. 删除 `tailwind.config.js` 或 `tailwind.config.ts`（如果存在）
4.4. 在 React 组件中添加一个 Tailwind 工具类进行验证（如 `className="p-4"`），确认样式生效

### Task 5: 配置 TypeScript 路径别名

**对应 AC:** AC-4
**依赖:** Task 1

**Subtasks:**

5.1. 在 `tsconfig.json` 中添加 `"baseUrl": "."` 和 `"paths": { "@/*": ["./src/*"] }` 配置
5.2. 在 `vite.config.ts` 中添加 `resolve.alias` 配置，将 `@` 映射到 `path.resolve(__dirname, './src')`（需要 `pnpm add -D @types/node` 以使用 `path` 模块）
5.3. 验证在 `.tsx` 文件中使用 `@/` 路径导入可以正确解析（IDE 无报错，构建无错误）

### Task 6: 添加 Rust 依赖

**对应 AC:** AC-5
**依赖:** Task 1

**Subtasks:**

6.1. 编辑 `src-tauri/Cargo.toml`，在 `[dependencies]` 下添加：
  - `tokio = { version = "1", features = ["full"] }`
  - `reqwest = { version = "0.12", features = ["json", "cookies"] }`
  - `serde = { version = "1", features = ["derive"] }`
  - `serde_json = "1"`
  - `tauri-plugin-store = "2"`
6.2. 在 `src-tauri/src/main.rs` 或 `lib.rs` 的 Tauri builder 中注册 store 插件：`.plugin(tauri_plugin_store::Builder::new().build())`
6.3. 在 `src-tauri/capabilities/default.json` 中添加 `"store:allow-get"`, `"store:allow-set"`, `"store:allow-save"` 等 store 插件权限
6.4. 执行 `cargo check`（在 `src-tauri/` 目录下），确认编译通过无错误

### Task 7: 配置 ESLint + Prettier

**对应 AC:** AC-6
**依赖:** Task 3

**Subtasks:**

7.1. 创建 `eslint.config.js`（flat config 格式），配置 TypeScript + React Hooks + React Refresh 规则
7.2. 创建 `.prettierrc` 文件，写入格式化规则：`{ "semi": true, "singleQuote": true, "trailingComma": "es5", "printWidth": 100 }`
7.3. 在 `package.json` 的 `scripts` 中添加：
  - `"lint": "eslint ."`
  - `"format": "prettier --write \"src/**/*.{ts,tsx}\""`
  - `"format:check": "prettier --check \"src/**/*.{ts,tsx}\""`
7.4. 执行 `pnpm lint` 验证 ESLint 运行正常
7.5. 执行 `pnpm format` 验证 Prettier 运行正常

### Task 8: 配置 Vitest 测试框架

**对应 AC:** AC-9
**依赖:** Task 3, Task 5

**Subtasks:**

8.1. 在 `vite.config.ts` 中添加 `test` 配置块（或创建独立的 `vitest.config.ts`），配置 `environment: 'jsdom'`、`globals: true`、`setupFiles` 等
8.2. 创建 `src/test/setup.ts` 文件，导入 `@testing-library/jest-dom`
8.3. 在 `package.json` 的 `scripts` 中添加 `"test": "vitest run"` 和 `"test:watch": "vitest"`
8.4. 创建一个最小验证测试文件 `src/App.test.tsx`，包含一个简单的渲染测试
8.5. 执行 `pnpm test` 验证测试运行器正常工作

### Task 9: Rust 代码质量验证

**对应 AC:** AC-7
**依赖:** Task 6

**Subtasks:**

9.1. 在 `src-tauri/` 目录下执行 `cargo clippy -- -D warnings`，确认无警告
9.2. 在 `src-tauri/` 目录下执行 `cargo fmt --check`，确认代码格式正确
9.3. 如有 clippy 警告，修复后重新验证

### Task 10: 应用启动验证

**对应 AC:** AC-8
**依赖:** Task 4, Task 5, Task 6, Task 7, Task 8

**Subtasks:**

10.1. 执行 `pnpm tauri dev`，等待编译完成
10.2. 确认应用窗口成功打开，显示 React 内容
10.3. 确认 Vite HMR 正常工作（修改 `App.tsx` 中的文本，确认浏览器自动刷新）
10.4. 确认 Rust 后端进程正常运行（终端无 panic 或 error 输出）
10.5. 测量冷启动时间，确认在 3 秒以内（NFR4）
10.6. 确认无控制台错误（前端 DevTools 和 Rust 终端输出均正常）

### Task 11: 清理脚手架默认内容

**对应 AC:** AC-1
**依赖:** Task 10

**Subtasks:**

11.1. 清理 `src/App.tsx` 中的脚手架默认内容（logo、链接等），保留最小可运行的 React 组件
11.2. 清理 `src/App.css` 中的脚手架默认样式，保留 Tailwind 导入声明
11.3. 删除不需要的脚手架资源文件（如默认的 logo SVG 文件）
11.4. 确认清理后 `pnpm tauri dev` 仍然可以正常启动

## File Scope

以下是本 Story 允许创建或修改的文件列表。Dev Runner 不应修改此范围之外的文件。

### 将被创建的文件

- `package.json` (由脚手架生成)
- `pnpm-lock.yaml` (由 pnpm install 生成)
- `vite.config.ts` (由脚手架生成，后续修改)
- `tsconfig.json` (由脚手架生成，后续修改)
- `tsconfig.node.json` (由脚手架生成)
- `eslint.config.js` (新建)
- `.prettierrc` (新建)
- `.gitignore` (由脚手架生成)
- `index.html` (由脚手架生成)
- `src/main.tsx` (由脚手架生成)
- `src/App.tsx` (由脚手架生成，后续清理)
- `src/App.css` (由脚手架生成，后续修改添加 Tailwind)
- `src/vite-env.d.ts` (由脚手架生成)
- `src/test/setup.ts` (新建)
- `src/App.test.tsx` (新建)
- `src-tauri/Cargo.toml` (由脚手架生成，后续修改)
- `src-tauri/tauri.conf.json` (由脚手架生成，后续修改)
- `src-tauri/build.rs` (由脚手架生成)
- `src-tauri/src/main.rs` (由脚手架生成，后续修改)
- `src-tauri/src/lib.rs` (由脚手架生成，后续修改)
- `src-tauri/capabilities/default.json` (由脚手架生成，后续修改)
- `src-tauri/icons/*` (由脚手架生成)

### 不允许修改的文件

- `_bmad-output/` 目录下的所有规划文档
- 任何 `src/components/`、`src/hooks/`、`src/stores/`、`src/types/`、`src/lib/` 目录下的文件（这些属于 Story 1.2 和 1.3 的范围）

## Technical Notes

### 脚手架命令

```bash
pnpm create tauri-app giga-file-uploader --template react-ts
```

此命令使用 Tauri 官方 CLI 生成项目骨架，包含 Vite + React + TypeScript 的基础配置。选择此 Starter 的原因详见架构文档的 Starter Template Evaluation 部分。

### Tailwind CSS 4.x 注意事项

- Tailwind CSS 4.x 使用 CSS-first 配置方式，通过 `@import "tailwindcss"` 和 `@theme` 指令在 CSS 文件中定义
- **禁止** 创建 `tailwind.config.js` 或 `tailwind.config.ts` 文件
- Vite 集成通过 `@tailwindcss/vite` 插件实现，不使用 PostCSS 方式
- 设计 Token（颜色系统等）的 `@theme` 定义将在 Story 1.2 中完成，本 Story 只需确保 Tailwind 基础工具类可用

### Zustand v5 注意事项

- 本 Story 只安装 zustand 包，不创建 store 文件（store 创建属于 Story 1.2）
- Zustand v5 的 API 与 v4 有差异，创建 store 时需使用 v5 语法

### tauri-plugin-store v2 注意事项

- 版本需与 Tauri 2.x 对齐，使用 `tauri-plugin-store = "2"` 而非 v1
- 需要同时在 Rust 端注册插件和在 capabilities 中声明权限
- 实际的 store 使用（读写 history.json、settings.json）将在后续 Story 中实现

### 路径别名配置

- `@/` 映射到 `src/` 目录
- 需要同时配置 `tsconfig.json`（TypeScript 解析）和 `vite.config.ts`（Vite 构建解析）
- 这是项目级约定：所有导入使用 `@/` 路径，禁止 `../../` 相对路径

### 技术栈版本参考

| 技术 | 版本 | 来源 |
|------|------|------|
| Tauri | 2.10.2 | 架构文档 |
| React | 19.2.1 | 架构文档 |
| Vite | 7.3.1 | 架构文档 |
| TypeScript | 5.x (strict) | 架构文档 |
| Tailwind CSS | 4.0 | 架构文档 |
| Radix UI | 1.4.3 (统一包) | 架构文档 |
| Zustand | v5 | 架构文档 |
| Vitest | 4.x | 架构文档 |
| tauri-plugin-store | 2.4.2 | 架构文档 |
| tokio | 1.x (latest) | 架构文档 |
| reqwest | 0.12.x | 架构文档 |

## Dependencies

- **Depends on:** 无（这是 Epic 1 的第一个 Story）
- **Blocks:** Story 1.2 (前端目录结构与基础 UI 框架), Story 1.3 (Rust 后端模块骨架与错误处理基础)

## Definition of Done

- [ ] AC-1: 项目脚手架初始化完成，目录结构正确
- [ ] AC-2: 所有前端依赖已安装且版本正确
- [ ] AC-3: Tailwind CSS 4.x 配置完成，工具类可用
- [ ] AC-4: TypeScript `@/` 路径别名配置完成且可解析
- [ ] AC-5: Rust 依赖已添加且 `cargo check` 通过
- [ ] AC-6: ESLint + Prettier 配置完成且命令可执行
- [ ] AC-7: `cargo clippy` 和 `cargo fmt --check` 通过
- [ ] AC-8: `pnpm tauri dev` 可成功启动应用窗口，冷启动 <3s
- [ ] AC-9: Vitest 测试框架可运行
