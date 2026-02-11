---
name: health-check
id: U1
description: "Comprehensive environment verification before sprint execution — validates all dependencies, tools, configurations, and knowledge cache freshness"
module: bso
agent: bso-orchestrator
type: utility
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Health Check Workflow (U1)

> BSO Utility Workflow -- 全面环境验证，确保 Sprint 执行前所有依赖项、工具、配置和知识缓存处于就绪状态。通过 `--check` 标志触发或 Sprint 启动前自动执行。

## Purpose

在 Sprint 开始前系统性验证执行环境的完整性和可用性。Health Check 是 Sprint 的「安全门」-- 只有通过检查（或明确确认警告）后才能启动 Sprint 执行。支持 10 项检查，每项独立返回 `pass` / `warn` / `fail` / `skip` 状态，最终汇总为整体健康状态。

## Primary Agent

**Orchestrator** -- 内联逻辑，直接在 Sprint Orchestrator 的 `auto-dev-sprint-team` 命令中执行，无需调度独立 Agent。

## Callers

| Caller | 触发场景 | 调用方式 |
|--------|---------|---------|
| auto-dev-sprint-team | 用户传入 `--check` 标志 | 直接调用，执行后终止（仅报告） |
| auto-dev-sprint-team | Sprint 正式启动前 | 自动调用，unhealthy 时阻止 Sprint 启动 |
| 用户手动 | 环境配置变更后验证 | `/bso:auto-dev-sprint-team --check` |

---

## Input Schema

```yaml
inputs:
  required:
    project_root: "/path/to/project"           # 项目根目录绝对路径
  optional:
    config_path: "path/to/config.yaml"          # BSO 配置文件路径（默认自动查找）
    session_id: "sprint-2026-02-07-001"         # 会话跟踪 ID（非 --check 模式下由 C1 传入）
    check_only: true                            # true = 仅报告不阻止；false = unhealthy 时阻止 Sprint
    skip_checks: []                             # 跳过指定检查项（如 ["e2e_environment", "mcp_tools"]）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `project_root` | 目录存在且可读 | abort, status: "failure", error: "Project root not found" |
| `config_path` | 文件存在且为有效 YAML | 回退到默认路径查找；全部找不到 --> abort |
| `skip_checks` | 数组元素为合法检查名 | 忽略未知检查名，记录警告 |

---

## Output Schema

### Return Value

```yaml
return:
  status: "healthy" | "warnings" | "unhealthy"
  session_id: "sprint-2026-02-07-001"
  overall_summary: "9/10 checks passed, 1 warning"
  checks:
    bmad_core:
      status: "pass" | "warn" | "fail" | "skip"
      message: "BMAD Core Skill mechanism available"
      details: {}
    bmm_module:
      status: "pass"
      message: "BMM module installed (v1.0.0), all required agents and workflows present"
      details:
        agents_found: ["sm", "pm", "dev", "architect"]
        workflows_found: ["create-story", "dev-story", "code-review"]
    status_file:
      status: "pass"
      message: "sprint-status.yaml found and valid"
      details:
        path: "path/to/sprint-status.yaml"
        schema_version: 1
    git:
      status: "pass"
      message: "Git available, working tree clean"
      details:
        version: "2.43.0"
        clean: true
        branch: "main"
    test_framework:
      status: "pass"
      message: "Test runner executable, 1 test passed"
      details:
        runner: "vitest"
        sample_test_passed: true
    mcp_tools:
      status: "warn"
      message: "Context7 unavailable, will degrade to WebSearch"
      details:
        context7: false
        deepwiki: true
    e2e_environment:
      status: "skip"
      message: "E2E disabled in config"
      details: {}
    version_scan:
      status: "warn"
      message: "vue-easytable 3.x in project but 2.x in knowledge cache"
      details:
        mismatches:
          - package: "vue-easytable"
            project_version: "3.0.1"
            cache_version: "2.x"
    concurrency_lock:
      status: "pass"
      message: "No active sprint lock"
      details: {}
    report:
      status: "pass"
      message: "Health check report generated"
      details:
        report_path: ".sprint-session/health-check-report.md"
  errors: []
```

### Overall Status Derivation

| Condition | Overall Status |
|-----------|---------------|
| 所有检查项为 `pass` 或 `skip` | `healthy` |
| 至少一项为 `warn`，无 `fail` | `warnings` |
| 至少一项为 `fail` | `unhealthy` |

---

## Workflow Steps

### Step 1: BMAD Core Check

**Goal:** 验证 BMAD Core 平台已安装，Skill 调用机制可用。

**Actions:**
1. 检查 BMAD Core 的 Skill 注册表是否可访问
   - 尝试读取 BMAD 核心配置文件（`.bmad/` 目录结构）
   - 验证 Skill 调用机制的基本可用性
2. 检查 BMAD Core 版本兼容性
   - 读取 BMAD 版本信息
   - 验证版本 >= BSO 要求的最低版本
3. 记录检查结果

**On Success:** `bmad_core: pass`，继续 Step 2
**On Failure:**
- BMAD 目录不存在 --> `bmad_core: fail`, message: "BMAD Core not installed"
- Skill 机制不可用 --> `bmad_core: fail`, message: "BMAD Skill mechanism unavailable"
- 版本不兼容 --> `bmad_core: warn`, message: "BMAD Core version {version} may not be compatible"

---

### Step 2: BMM Module Check

**Goal:** 验证 BMM 模块已安装，且包含 BSO 所需的全部 Agent 和 Workflow。

**Actions:**
1. 根据 `config.yaml` 的 `role_mapping` 检查所需 Agent 文件：
   - `bmad:bmm:agents:sm` (Story Creator persona)
   - `bmad:bmm:agents:pm` (Story Reviewer persona)
   - `bmad:bmm:agents:dev` (Dev Runner / E2E Inspector persona)
   - `bmad:bmm:agents:architect` (Review Runner / Knowledge Researcher persona)
2. 根据 `config.yaml` 的 `workflow_mapping` 检查所需 Workflow 文件：
   - `bmad:bmm:workflows:create-story`
   - `bmad:bmm:workflows:dev-story`
   - `bmad:bmm:workflows:code-review`
3. 验证每个文件存在且非空
4. 记录找到/缺失的项目列表

**On Success:** `bmm_module: pass`，继续 Step 3
**On Failure:**
- BMM 模块目录不存在 --> `bmm_module: fail`, message: "BMM module not installed"
- 部分 Agent 缺失 --> `bmm_module: fail`, message: "Missing BMM agents: {list}"
- 部分 Workflow 缺失 --> `bmm_module: fail`, message: "Missing BMM workflows: {list}"

---

### Step 3: Status File Check

**Goal:** 验证 sprint-status.yaml 存在且为有效 YAML 格式。

**Actions:**
1. 按 `status_file_search_paths` 配置顺序查找 sprint-status.yaml
   - 路径 1: `{output_folder}/implementation-artifacts/sprint-status.yaml`
   - 路径 2: `./sprint-status.yaml`
2. 验证文件为有效 YAML 语法（可解析）
3. 验证 schema_version 字段存在
4. 检查是否有 orphan 状态条目（Principle 12: 孤立状态检测）
   - 扫描所有 Story 条目，检查是否有处于中间状态（`story-doc-review`, `story-doc-improved`, `review`）超过 24 小时的条目
   - 有 orphan --> 记录警告，建议用户检查

**On Success:** `status_file: pass`，继续 Step 4
**On Failure:**
- 文件不存在 --> `status_file: warn`, message: "sprint-status.yaml not found, will be created on first sprint"
- YAML 语法错误 --> `status_file: fail`, message: "sprint-status.yaml has invalid YAML syntax"
- schema_version 缺失 --> `status_file: warn`, message: "sprint-status.yaml missing schema_version field"

---

### Step 4: Git Check

**Goal:** 验证 Git 可用，检查工作区状态。

**Actions:**
1. 执行 `git --version` 验证 Git 已安装
2. 执行 `git status` 检查工作区状态
   - 获取当前分支名
   - 检查是否有未提交的变更
   - 检查是否有未跟踪的文件
3. 验证项目根目录是一个有效的 Git 仓库（`.git/` 存在）
4. 如果 `auto_clear_git_track` 配置为 true 且有残留的 BSO 跟踪文件 --> 记录提示

**On Success:** `git: pass`，继续 Step 5
**On Failure:**
- Git 未安装 --> `git: fail`, message: "Git not installed"
- 非 Git 仓库 --> `git: fail`, message: "Project root is not a git repository"
- 工作区有未提交变更 --> `git: warn`, message: "Working tree has uncommitted changes ({count} files)"

---

### Step 5: Test Framework Check

**Goal:** 验证测试运行器可执行，至少 1 个测试可以通过。

**Actions:**
1. 检测测试框架类型：
   - 前端: 检查 `package.json` 中的 `vitest` / `jest` / `mocha` 依赖
   - 后端: 检查 `pom.xml` 中的 `junit` / `testng` 依赖
2. 执行测试运行器的 dry-run / smoke test：
   - Vitest: `npx vitest run --reporter=verbose --maxConcurrency=1` (限制范围)
   - Jest: `npx jest --passWithNoTests --maxWorkers=1`
   - Maven: `mvn test -pl {module} -Dtest=*SmokeTest -Dsurefire.failIfNoSpecifiedTests=false`
3. 验证测试运行器返回 exit code 0
4. 如果找不到测试框架 --> 记录警告（某些项目可能不需要测试）

**On Success:** `test_framework: pass`，继续 Step 6
**On Failure:**
- 测试运行器未安装 --> `test_framework: warn`, message: "No test framework detected"
- 测试执行失败 --> `test_framework: fail`, message: "Test runner failed with exit code {code}"
- 依赖未安装 --> `test_framework: fail`, message: "Test dependencies not installed, run npm install / mvn install"

---

### Step 6: MCP Tools Check

**Goal:** 检查 MCP 工具（Context7、DeepWiki）的可用性。仅 warn，不 fail（Principle 2: 降级优于报错）。

**Actions:**
1. 检查 Context7 MCP 工具是否已注册且可调用
   - 尝试调用 `mcp__context7__resolve-library-id` 进行一次轻量探测
   - 超时时间: 10 秒
2. 检查 DeepWiki MCP 工具是否已注册且可调用
   - 类似探测调用
3. 如果 E2E 启用，检查浏览器 MCP 工具：
   - Chrome MCP (`chrome_mcp`) 可用性
   - Playwright MCP (`playwright_mcp`) 可用性（作为 fallback）
4. 记录每个工具的可用状态
5. 对不可用的工具，标注降级策略（来自 `config.yaml` 的 `fallback_if_mcp_unavailable`）

**On Success:** `mcp_tools: pass`（全部可用），继续 Step 7
**On Partial:**
- Context7 不可用 --> `mcp_tools: warn`, message: "Context7 unavailable, will degrade to WebSearch"
- DeepWiki 不可用 --> `mcp_tools: warn`, message: "DeepWiki unavailable, will degrade to WebSearch"
- 全部不可用 --> `mcp_tools: warn`, message: "All MCP tools unavailable, Knowledge Researcher will use WebSearch only"

> **Note:** MCP 工具检查永远不会返回 `fail`。即使全部不可用，BSO 仍可通过 WebSearch 降级运行。

---

### Step 7: E2E Environment Check

**Goal:** 如果 E2E 功能已启用，验证测试环境可访问。

**Actions:**
1. 读取 `config.yaml` 的 `e2e_inspection.enabled` 配置
   - 如果 `enabled: false` --> 直接返回 `e2e_environment: skip`，跳过后续检查
2. 验证 `base_url` 可访问：
   - 向 `e2e_inspection.environment.base_url` 发送 HTTP GET 请求
   - 超时时间: `e2e_inspection.environment.wait_after_navigation` (默认 2000ms)
   - 检查返回状态码为 2xx 或 3xx
3. 如果 `login.enabled: true`，验证登录页面可访问：
   - 向 `base_url + login.url` 发送 HTTP GET 请求
   - 验证页面可达
4. 检查浏览器 MCP 工具可用性（与 Step 6 复用结果）：
   - `chrome_mcp` 或 `playwright_mcp` 至少一个可用

**On Success:** `e2e_environment: pass`，继续 Step 8
**On Skip:** `e2e_environment: skip`, message: "E2E disabled in config"
**On Failure:**
- base_url 不可达 --> `e2e_environment: fail`, message: "E2E base_url {url} not accessible"
- 登录页面不可达 --> `e2e_environment: warn`, message: "Login page not accessible at {url}"
- 无浏览器 MCP --> `e2e_environment: fail`, message: "E2E enabled but no browser MCP tool available"

---

### Step 8: Version Scan

**Goal:** 扫描项目依赖版本，与知识缓存 `index.yaml` 中记录的 `framework_version` 比较，检测潜在的缓存过期问题（Principle 16）。

**Actions:**
1. 扫描项目依赖文件：
   - **前端:** 读取 `package.json` 的 `dependencies` 和 `devDependencies`
   - **后端:** 读取 `pom.xml` 的 `<dependencies>` 版本号
   - 提取主要框架及其版本号：
     - 前端关注: `vue`, `ant-design-vue`, `vben`, `vue-easytable`, `axios`, `pinia` 等
     - 后端关注: `jeecg-boot`, `spring-boot`, `mybatis-plus` 等
2. 读取知识缓存 `index.yaml`：
   - 遍历所有缓存条目的 `framework` 和 `framework_version` 字段
3. 版本比较逻辑：
   - 提取 major version（主版本号）
   - **匹配:** 项目版本与缓存版本的 major version 一致 --> pass
   - **不匹配:** major version 不同 --> warn，标记缓存条目为潜在 stale
   - **缓存无记录:** 项目使用的框架在缓存中不存在 --> 忽略（正常情况）
4. 收集所有 mismatch 条目，生成版本比较报告

**On Success:** `version_scan: pass`, message: "All cached framework versions match project"
**On Mismatch:**
- 存在版本不匹配 --> `version_scan: warn`, message: "{count} framework version mismatches detected"
  ```yaml
  details:
    mismatches:
      - package: "vue-easytable"
        project_version: "3.0.1"
        cache_version: "2.x"
        recommendation: "Re-research vue-easytable APIs before next sprint"
  ```
**On Failure:**
- package.json / pom.xml 均不存在 --> `version_scan: warn`, message: "No dependency files found for version scanning"
- index.yaml 不存在 --> `version_scan: pass`, message: "No knowledge cache to compare (empty cache)"

---

### Step 9: Concurrency Lock Check

**Goal:** 检查 `.sprint-running` 锁文件，检测 zombie lock（Principle 13）。

**Actions:**
1. 检查 `.sprint-running` 文件是否存在于项目根目录
2. 如果不存在 --> `concurrency_lock: pass`
3. 如果存在，读取锁文件内容并解析：
   ```yaml
   pid: 12345
   session_id: "sprint-2026-02-07-001"
   started_at: "2026-02-07T22:30:00Z"
   epic_spec: "epic5"
   ```
4. Zombie 检测逻辑：
   a. **PID 检查:** 使用 `kill -0 {pid}` 检查进程是否存活
      - PID 不存在 --> zombie lock（进程已崩溃）
   b. **时间戳检查:** 计算 `started_at` 距现在的时长
      - 超过 24 小时 --> zombie lock（超时锁）
5. 判定结果：
   - PID 存活 且 时间 < 24h --> 活跃锁，sprint 正在运行
   - PID 不存在 或 时间 > 24h --> zombie lock

**On Success:** `concurrency_lock: pass`, message: "No active sprint lock"
**On Active Lock:** `concurrency_lock: fail`, message: "Sprint already running (PID: {pid}, session: {session_id}, started: {started_at})"
**On Zombie Lock:** `concurrency_lock: warn`, message: "Zombie lock detected (PID {pid} not alive / started {hours}h ago), recommend override"
  ```yaml
  details:
    lock_type: "zombie"
    pid: 12345
    pid_alive: false
    started_at: "2026-02-06T10:00:00Z"
    age_hours: 36.5
    recommendation: "Run with --force to override zombie lock"
  ```

---

### Step 10: Report Generation

**Goal:** 汇总所有检查结果，生成可读的 Health Check 报告。

**Actions:**
1. 遍历 Step 1-9 的所有检查结果
2. 计算整体状态：
   - 全部 `pass` 或 `skip` --> `healthy`
   - 至少一项 `warn`，无 `fail` --> `warnings`
   - 至少一项 `fail` --> `unhealthy`
3. 生成格式化报告：
   ```markdown
   # BSO Health Check Report
   **Date:** 2026-02-07T22:30:00Z
   **Status:** healthy / warnings / unhealthy

   | # | Check | Status | Message |
   |---|-------|--------|---------|
   | 1 | BMAD Core | PASS | ... |
   | 2 | BMM Module | PASS | ... |
   | ... | ... | ... | ... |

   ## Warnings (if any)
   ...

   ## Failures (if any)
   ...

   ## Recommendations
   ...
   ```
4. 将报告写入 `.sprint-session/health-check-report.md`
5. 在控制台输出报告摘要
6. 组装 return value 返回给调用者

**On Success:** 报告生成完毕，返回结果
**On Failure:** 报告写入失败 --> 仅在控制台输出结果（降级处理）

**Return Value Mapping:**

| Overall Status | Orchestrator Action |
|---------------|-------------------|
| `healthy` | 允许 Sprint 启动 |
| `warnings` | 显示警告，询问用户是否继续（`check_only` 模式下仅报告） |
| `unhealthy` | 阻止 Sprint 启动，要求修复 fail 项后重试 |

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| 项目根目录不存在 | Input Validation | Fatal | 立即终止 | `unhealthy` |
| config.yaml 不存在或无效 | Input Validation | Fatal | 尝试默认路径，全部失败则终止 | `unhealthy` |
| BMAD Core 未安装 | Step 1 | Fatal | 标记 fail，继续后续检查 | 影响 overall |
| BMM Agent/Workflow 缺失 | Step 2 | Fatal | 标记 fail，列出缺失项 | 影响 overall |
| sprint-status.yaml 语法错误 | Step 3 | Fatal | 标记 fail，建议修复或删除重建 | 影响 overall |
| Git 未安装 | Step 4 | Fatal | 标记 fail | 影响 overall |
| 测试框架执行超时 | Step 5 | Warning | 标记 warn，建议手动验证 | 影响 overall |
| MCP 工具全部不可用 | Step 6 | Warning | 标记 warn，注明降级策略 | 影响 overall |
| E2E 环境不可达 | Step 7 | Conditional | E2E 启用时 fail，禁用时 skip | 影响 overall |
| 版本扫描发现 mismatch | Step 8 | Warning | 标记 warn，列出 mismatch 详情 | 影响 overall |
| Zombie lock 检测到 | Step 9 | Warning | 标记 warn，建议 override | 影响 overall |
| 活跃 sprint lock | Step 9 | Fatal | 标记 fail，阻止新 Sprint | 影响 overall |
| 报告文件写入失败 | Step 10 | Warning | 降级到控制台输出 | N/A |

### Timeout Configuration

- Health Check 整体超时: 120 秒（单独执行时）
- 测试框架 smoke test 超时: 60 秒
- MCP 工具探测超时: 10 秒/工具
- E2E base_url 访问超时: `e2e_inspection.environment.wait_after_navigation` (默认 2000ms)

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping (Step 2: 验证 Agent 存在性)
role_mapping.story_creator_persona
role_mapping.story_reviewer_persona
role_mapping.dev_runner_persona
role_mapping.review_runner_persona
role_mapping.e2e_inspector_persona
role_mapping.knowledge_researcher_persona

# Workflow mapping (Step 2: 验证 Workflow 存在性)
workflow_mapping.create_story
workflow_mapping.dev_story
workflow_mapping.code_review

# Defaults (Step 4: Git 配置)
defaults.auto_clear_git_track

# Knowledge research (Step 6, 8: MCP 和版本扫描)
knowledge_research.enabled
knowledge_research.knowledge_base_path
knowledge_research.sources
knowledge_research.fallback_if_mcp_unavailable

# E2E inspection (Step 7: E2E 环境检查)
e2e_inspection.enabled
e2e_inspection.environment.base_url
e2e_inspection.environment.login
e2e_inspection.environment.wait_after_navigation
e2e_inspection.browser_tool.preferred
e2e_inspection.browser_tool.fallback

# Status file (Step 3: 状态文件查找)
status_file_search_paths
```

---

## Workflow Sequence Diagram

```
User / Orchestrator                        Health Check (U1)
    |                                           |
    |--- --check / auto-start ----------------->|
    |                                           |
    |                                   Step 1: BMAD Core Check
    |                                     (Skill mechanism)
    |                                           |
    |                                   Step 2: BMM Module Check
    |                                     (Agents + Workflows)
    |                                           |
    |                                   Step 3: Status File Check
    |                                     (sprint-status.yaml)
    |                                           |
    |                                   Step 4: Git Check
    |                                     (version + working tree)
    |                                           |
    |                                   Step 5: Test Framework Check
    |                                     (runner + smoke test)
    |                                           |
    |                                   Step 6: MCP Tools Check
    |                                     (Context7 / DeepWiki)
    |                                           |
    |                                   Step 7: E2E Environment Check
    |                                     (base_url + login)
    |                                           |
    |                                   Step 8: Version Scan
    |                                     (package.json vs index.yaml)
    |                                           |
    |                                   Step 9: Concurrency Lock Check
    |                                     (.sprint-running zombie)
    |                                           |
    |                                   Step 10: Report Generation
    |                                     (summary + file write)
    |                                           |
    |<-- return(status, checks, report) --------|
    |                                           |
    | healthy --> proceed with Sprint           |
    | warnings --> ask user confirmation        |
    | unhealthy --> block Sprint, show fixes    |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 6: MCP 工具不可用时仅 warn，标注降级策略；Step 10: 报告写入失败时降级到控制台输出 |
| 7 | 总有逃生通道 | `skip_checks` 参数允许跳过特定检查项；`check_only` 模式仅报告不阻止 |
| 12 | 孤立状态检测 | Step 3: 扫描中间状态超过 24 小时的 Story 条目 |
| 13 | Zombie Lock 预防 | Step 9: PID + 时间戳双重验证，检测僵尸锁 |
| 14 | BMM 集成契约 | Step 2: 仅检查文件存在性，不依赖 BMM 内部实现 |
| 16 | 知识容量管理 | Step 8: Version Scan 检测缓存版本与项目版本的偏差 |
| 17 | 执行可见性 | Step 10: 生成人类可读的健康检查报告 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: health-check.spec.md + config.yaml + module-brief-bso.md + C2 template_
