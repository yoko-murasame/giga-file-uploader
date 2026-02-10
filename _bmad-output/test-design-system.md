# System-Level Test Design

**Date:** 2026-02-11
**Author:** Shaoyoko (via TEA Agent - Murat)
**Project:** giga-file-uploader
**Phase:** 3 - Solutioning (Testability Review)
**Status:** Draft

---

## Testability Assessment

### Controllability: PASS

**Can we control system state for testing?**

- **Rust 后端状态可控：** 所有状态通过函数参数和 Tauri managed state 传递，没有全局可变状态。`Arc<Mutex<T>>` / `Arc<RwLock<T>>` 模式支持测试中的状态注入和重置。
- **API 抽象层可 Mock：** `GigafileApi` trait 定义清晰，测试中可以创建 `MockGigafileApi` 实现，完全隔离外部 HTTP 依赖。这是架构中最关键的可测试性决策。
- **本地存储可控：** `tauri-plugin-store` 使用 JSON 文件，测试中可使用临时目录隔离存储状态，每次测试前清空。
- **前端状态可控：** Zustand v5 store 可直接通过 `setState` 注入测试状态，无需 Provider 包装。
- **IPC 层可模拟：** 前端通过 `src/lib/tauri.ts` 统一封装 `invoke()` 和 `listen()`，测试中只需 mock 该模块。

**证据来源：** architecture.md - GigafileApi trait 设计、Zustand store 设计、tauri.ts 封装

### Observability: PASS (with minor CONCERNS)

**Can we inspect system state?**

- **进度事件流可观测：** Rust -> Tauri event -> Zustand 的全链路有明确的数据结构定义（`upload:progress` payload），每个节点都可以独立验证。
- **错误信息可观测：** 四层错误处理（L0-L3）有清晰的错误传播路径，日志使用英文技术详情（`error!("HTTP request failed: status={}, url={}", status, url)`）。
- **Zustand DevTools：** 支持 Redux DevTools，开发期间可检查状态变更历史。
- **CONCERNS：** 架构中未提及结构化日志或遥测系统。对于 MVP 自用工具，这不是 blocker，但建议在 `retry_engine.rs` 中记录重试统计信息（重试次数、失败原因分布），便于后续调试。

**证据来源：** architecture.md - 进度事件流设计、错误处理四层分级

### Isolation: PASS

**Are tests isolated?**

- **每文件独立 UploadTask：** NFR12 要求单文件失败不影响其他文件，架构中每个文件有独立的错误隔离。这天然支持并行测试。
- **Store 不交叉引用：** 三个 Zustand store（upload、history、app）之间不直接引用内部状态，通过事件或显式调用通信。测试中可独立测试每个 store。
- **API 层边界清晰：** 所有 gigafile.nu HTTP 交互限制在 `src-tauri/src/api/` 内，上层通过 trait 调用。集成测试可以在 API 层边界进行切割。
- **本地存储隔离：** `tauri-plugin-store` 可配置不同的存储路径，测试间互不影响。
- **无全局可变状态：** Rust 侧通过函数参数传递依赖，不使用 `lazy_static` 或全局 Mutex。

**证据来源：** architecture.md - 架构边界定义、project-context.md - 反模式列表

---

## Architecturally Significant Requirements (ASRs)

基于 PRD 的 NFR 和架构决策，以下质量需求驱动了测试策略：

| ASR ID | 需求来源 | 描述 | 可测试性挑战 | 概率 | 影响 | 风险分数 |
|--------|---------|------|-------------|------|------|---------|
| ASR-01 | NFR6 | API 交互模块独立可替换 | 需要验证 trait 抽象在 API 变更时的适应性 | 2 | 3 | **6** |
| ASR-02 | NFR9/NFR10 | 用户感知失败率为 0，50 次静默重试 | 需要模拟各种网络故障场景验证重试状态机 | 2 | 3 | **6** |
| ASR-03 | NFR12 | 单文件失败不影响其他文件 | 需要并发上传场景下的错误隔离验证 | 2 | 2 | 4 |
| ASR-04 | NFR2 | 进度更新粒度 <=128KB | 需要验证高频事件流的节流和渲染性能 | 1 | 2 | 2 |
| ASR-05 | NFR11 | 崩溃不丢失历史记录 | 需要模拟异常退出场景验证持久化即时写入 | 2 | 2 | 4 |
| ASR-06 | NFR1/NFR4/NFR5 | 性能 SLO（列表渲染 <1s、冷启动 <3s、历史加载 <1s） | 桌面应用性能测试需要特殊的测量手段 | 1 | 1 | 1 |
| ASR-07 | FR11 | 首块串行协议遵循 | 需要验证并发控制逻辑的正确性（首块串行 -> 后续并行） | 3 | 3 | **9** |

**高优先级 ASR (分数 >= 6)：**
- **ASR-07 (分数 9)：** 首块串行协议是 gigafile.nu 上传成功的前提。如果首块和后续块的顺序控制出错，所有上传都会失败。这是最高风险项。
- **ASR-01 (分数 6)：** API 可替换性是对抗逆向 API 变更风险的核心防护。
- **ASR-02 (分数 6)：** 重试机制的正确性直接影响用户对"零失败"的感知。

---

## Test Levels Strategy

基于 Tauri 桌面应用的双语言架构（Rust + React），推荐以下测试层级分配：

### Unit: 55% — Rust 后端 + TypeScript 纯逻辑

**Rationale：** 本项目的核心复杂度集中在 Rust 后端（上传引擎、分块管理、重试状态机、进度聚合）。这些都是可独立测试的纯逻辑模块，unit test 提供最快的反馈循环。

**覆盖范围：**
- Rust: `chunk_manager.rs`（分片/分块切割算法）、`retry_engine.rs`（重试状态机、指数退避计算）、`progress.rs`（进度聚合逻辑）、`error.rs`（错误类型转换）、`models/`（数据模型序列化/反序列化）
- TypeScript: `formatFileSize()`、`formatDate()` 等工具函数、Zustand store actions（纯状态变更逻辑）

**工具：** `cargo test`（Rust）、Vitest（TypeScript）

### Integration: 35% — Rust 模块间交互 + IPC 层

**Rationale：** Tauri 架构中最容易出错的地方是模块间交互和 IPC 边界。特别是 `upload_engine -> chunk_manager -> api` 的调用链，以及 `Rust -> Tauri event -> React` 的数据流。

**覆盖范围：**
- Rust 集成测试: `upload_engine` 与 `chunk_manager` + `retry_engine` 的协作（使用 `MockGigafileApi`）
- Rust 集成测试: `api/v1.rs` 的 HTTP 请求构造和响应解析（使用 HTTP mock server，如 `mockito` 或 `wiremock`）
- Rust 集成测试: `storage/` 模块的文件读写（使用临时目录）
- TypeScript 组件测试: React 组件 + Zustand store 交互（使用 React Testing Library）
- IPC 测试: 验证 Tauri command 的参数序列化和返回值反序列化（`camelCase` JSON）

**工具：** `cargo test`（Rust 集成测试目录 `src-tauri/tests/`）、Vitest + React Testing Library（组件测试）

### E2E: 10% — 关键用户旅程（MVP 阶段推迟）

**Rationale：** 架构文档明确指出"MVP 阶段不做 E2E 测试（桌面应用 E2E 测试成本高，手动验收即可）"。桌面应用的 E2E 需要 WebDriver 或 Tauri 专用测试工具（如 `tauri-driver`），setup 成本高。

**建议：** Phase 4 实施阶段，对以下 2 条核心用户旅程编写手动验收检查清单：
1. 旅程一：拖入文件 -> 点上传 -> 拿链接 -> 复制
2. 旅程二：大文件分片上传 -> 网络闪断静默恢复 -> 完成

**工具：** 手动验收（MVP），后续可考虑 `tauri-driver` + WebDriver

---

## NFR Testing Approach

### Security: 不适用（低风险）

- 本项目无用户系统、无登录、无授权、无敏感数据存储
- gigafile.nu 交互使用 HTTPS，无认证凭据
- 本地存储的是下载链接，非敏感数据
- **Status：** PASS（无安全 NFR 需验证）

### Performance: 工具有限，以度量为主

- **NFR1（列表渲染 <1s）：** React Testing Library 无法直接度量渲染时间。建议在组件测试中使用 `performance.now()` 计时，或在开发期间使用 React DevTools Profiler 手动验证。
- **NFR2（进度粒度 <=128KB）：** 通过 Rust 单元测试验证 progress aggregator 的更新频率。
- **NFR3（复制 <200ms）：** 通过组件测试 mock 剪贴板 API 验证调用时间。
- **NFR4（冷启动 <3s）：** 需要手动测量。建议在 CI 中添加 `time pnpm tauri dev` 的基准测试。
- **NFR5（历史加载 <1s）：** 通过 Rust 集成测试验证 1000 条记录的加载时间。
- **Status：** CONCERNS（桌面应用性能测试工具链有限，部分 NFR 需手动验证）

### Reliability: 核心关注区域

- **NFR9（零感知失败率）：** 通过 `retry_engine.rs` 的单元测试 + `upload_engine` 的集成测试覆盖。使用 `MockGigafileApi` 模拟各种失败场景（网络超时、5xx、连接中断）。
- **NFR10（50 次静默重试）：** `retry_engine.rs` 单元测试验证计数器阈值行为。
- **NFR11（崩溃安全）：** `storage/` 集成测试验证 `tauri-plugin-store` 的即时写入行为。
- **NFR12（错误隔离）：** `upload_engine` 集成测试验证多文件并发上传时单文件失败不影响其他文件。
- **Status：** PASS（架构设计充分支持可靠性测试）

### Maintainability: 标准实践

- **测试覆盖率：** 建议 Rust 后端关键模块（`upload_engine`、`chunk_manager`、`retry_engine`、`api/`）覆盖率 >= 80%。前端 store 和工具函数覆盖率 >= 70%。
- **代码质量门：** ESLint + Prettier（TypeScript）、Clippy + rustfmt（Rust）已在架构中规划。
- **依赖审计：** `pnpm audit`（前端）、`cargo audit`（Rust）建议加入 CI。
- **Status：** PASS（标准工具链已规划）

---

## Test Environment Requirements

### 本地开发环境

- **Rust 测试：** `cargo test`，无需额外基础设施
- **TypeScript 测试：** `pnpm vitest`，无需浏览器（JSDOM 环境）
- **HTTP Mock：** Rust 侧使用 `mockito` 或 `wiremock` crate 模拟 gigafile.nu 服务端
- **文件系统：** Rust 测试使用 `tempdir` crate 创建临时目录隔离存储

### CI 环境（GitHub Actions）

- **Runner：** ubuntu-latest（Rust + Node.js）
- **矩阵测试：** 建议对 macOS 和 Windows runner 各跑一次构建验证（不需要完整测试套件）
- **Artifact：** 测试覆盖率报告（tarpaulin for Rust、vitest coverage for TypeScript）

### Mock 服务器需求

- **gigafile.nu API Mock：** 实现 `MockGigafileApi` struct，模拟以下行为：
  - `discover_server()` 返回固定 URL
  - `upload_chunk()` 模拟成功/失败/超时/部分成功
  - `verify_upload()` 返回测试用下载链接
  - Cookie 会话管理模拟
- **HTTP 级 Mock（集成测试）：** 使用 `wiremock` crate 模拟真实 HTTP 响应，验证 `api/v1.rs` 的请求构造

---

## Testability Concerns

### CONCERN-01: 桌面应用 E2E 测试 Gap（中等风险）

- **描述：** MVP 阶段不做 E2E 测试，拖拽交互（FR1-FR2）和系统通知（完成提示音）等功能只能手动验收。
- **影响：** 无法自动验证完整的用户旅程，回归风险依赖手动验收。
- **缓解：** (1) 尽可能将 UI 逻辑下沉到 Zustand store action 中测试，(2) React Testing Library 覆盖组件交互逻辑，(3) 手动验收检查清单覆盖核心旅程。
- **评估：** 对于 MVP 自用工具项目，可接受。后续 Phase 2+ 可引入 `tauri-driver`。

### CONCERN-02: gigafile.nu 协议变更（高风险 - ASR-01）

- **描述：** 逆向工程的 API 随时可能变更，`api/v1.rs` 的测试基于当前已知的协议行为。
- **影响：** 协议变更后 Mock 测试仍然通过，但实际上传失败。
- **缓解：** (1) `GigafileApi` trait 隔离确保变更只影响 `api/` 目录，(2) 建议维护一个"协议烟雾测试"脚本（手动或半自动），定期对真实 gigafile.nu 执行一次小文件上传验证协议未变。(3) 参考 gfile 开源项目跟踪平台变化。
- **评估：** 不阻塞 solutioning gate，但必须在 Sprint 0 中建立协议监控机制。

### CONCERN-03: 进度事件流端到端验证（低风险）

- **描述：** 从 Rust 线程内部 128KB 计数器到 React UI 渲染的完整事件流无法在单元/集成测试中完整覆盖。
- **影响：** 事件格式不匹配或 debounce 参数不当可能导致进度条卡顿或跳跃。
- **缓解：** (1) TypeScript 类型定义（`types/api.ts`）与 Rust `#[serde(rename_all = "camelCase")]` 保持同步，(2) IPC payload 格式通过集成测试在 Rust 侧验证，(3) 前端 store 的 `updateProgress` action 通过 Vitest 验证状态更新正确性。
- **评估：** 不阻塞。类型系统 + 分层测试可以充分覆盖。

**总体可测试性评估：** 无 FAIL 项。2 个 CONCERNS 均有缓解方案，不阻塞 solutioning gate。

---

## Recommendations for Sprint 0

### 1. Rust 测试基础设施

- [ ] 添加测试依赖到 `Cargo.toml`：`mockito` 或 `wiremock`（HTTP mock）、`tempdir`（临时文件系统）、`tokio-test`（异步测试工具）
- [ ] 创建 `src-tauri/tests/` 目录并建立集成测试骨架
- [ ] 实现 `MockGigafileApi` struct（实现 `GigafileApi` trait）

### 2. TypeScript 测试基础设施

- [ ] 配置 `vitest.config.ts`（JSDOM 环境、`@/` 路径别名、coverage reporter）
- [ ] 创建 Tauri IPC mock 工具（mock `invoke` 和 `listen`）
- [ ] 配置 React Testing Library（自定义 render with Zustand store provider）

### 3. CI Pipeline（`*ci` 工作流）

- [ ] GitHub Actions `ci.yml`：`cargo clippy` -> `cargo test` -> `pnpm lint` -> `pnpm vitest` -> `pnpm tauri build`
- [ ] 配置 Rust 覆盖率（`cargo-tarpaulin` 或 `cargo-llvm-cov`）
- [ ] 配置 TypeScript 覆盖率（Vitest c8/istanbul）
- [ ] 添加 `pnpm audit` 和 `cargo audit` 步骤

### 4. 协议监控（应对 CONCERN-02）

- [ ] 创建 `scripts/protocol-smoke.sh`：对 gigafile.nu 执行一次小文件上传，验证协议端点和响应格式未变
- [ ] 在 CI 中作为 scheduled job（每周一次）执行

---

## Quality Gate Criteria (Solutioning Gate)

基于以上评审，对 solutioning gate 的建议：

| 维度 | 评估 | 备注 |
|------|------|------|
| 可控性 (Controllability) | PASS | trait 抽象 + 无全局状态 + store 可注入 |
| 可观测性 (Observability) | PASS | 事件流可观测、错误分层清晰 |
| 隔离性 (Isolation) | PASS | 文件独立、store 独立、API 边界清晰 |
| ASR 覆盖 | PASS | 7 项 ASR 已识别并评分 |
| NFR 可验证性 | CONCERNS | 部分性能 NFR 需手动验证 |
| E2E 策略 | CONCERNS | MVP 推迟 E2E，手动验收兜底 |

**Overall Gate Recommendation: PASS (with CONCERNS)**

架构设计对可测试性的支持是充分的。2 项 CONCERNS 均不阻塞实现，且有明确的缓解方案。建议在 Sprint 0 的 `*framework` 工作流中落实上述测试基础设施建议。

---

## Follow-on Workflows

- **`*framework` (TF)：** 基于本文档的 Test Levels Strategy 初始化测试框架配置
- **`*ci` (CI)：** 基于本文档的 CI Pipeline 建议搭建质量流水线
- **`*test-design` Epic-Level (TD)：** 实现阶段对每个 Epic 做详细的测试场景设计
- **`*atdd` (AT)：** 实现阶段对 P0 场景生成先行测试

---

**Generated by**: BMad TEA Agent - Murat (Master Test Architect)
**Workflow**: `_bmad/bmm/testarch/test-design` (System-Level Mode)
**Version**: 4.0 (BMad v6)
