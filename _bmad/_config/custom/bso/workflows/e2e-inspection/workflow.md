---
name: e2e-inspection
id: F2
description: "Browser-level AC verification with screenshot evidence — optional workflow, only triggered when config enabled + Story tags match frontend + browser MCP tool available"
module: bso
agent: e2e-inspector
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
optional: true
---

# E2E Inspection Workflow (F2)

> BSO Feature Workflow -- 使用浏览器 MCP 工具对 Story 的验收标准进行 UI 级别验证，逐条 AC 导航、验证、截图取证，生成 E2E 报告。Optional workflow -- 三个触发条件全部满足才执行，任一不满足则非阻塞跳过。

## Purpose

在 Code Review 通过后，通过真实浏览器对前端 Story 的每条 AC 执行 UI 级别的功能验证。核心价值：将"代码审查通过"提升为"用户可见行为验证通过"，弥补静态代码审查无法覆盖的渲染、交互、导航类缺陷。作为 Optional workflow，当基础设施条件不具备时（无浏览器工具、非前端 Story、配置关闭），自动跳过且不阻塞 Story 流转。

## Primary Agent

**E2E Inspector** (`bso-e2e-inspector`) -- 使用 BMM Dev (Amelia) persona 知识，headless 模式运行。Optional agent，仅在三个触发条件全部满足时激活。

## Supporting Agents

- **Knowledge Researcher** (F1) -- 不直接参与 E2E 执行，但 E2E Inspector 启动时会读取 `_lessons-learned.md` 中标记 `[e2e]` 的历史经验

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Epic-Story 标识符（格式: {epic}-{story}）
    mode: "e2e"                               # 固定值 "e2e"
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
  optional:
    config_overrides: {}                       # 运行时配置覆盖（如 e2e_inspection.enabled）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配格式 `\d+-\d+` | abort, status: "failure" |
| `mode` | 值必须为 `"e2e"` | abort, status: "failure" |
| `session_id` | 非空字符串 | abort, status: "failure" |

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - ".sprint-session/{story_key}-e2e-report.md"           # E2E 验证报告
    - ".sprint-session/screenshots/{story_key}-{ac_id}.png"  # 每条 AC 的截图证据
    - ".sprint-session/screenshots/{story_key}-login-success.png"  # 登录成功截图（if login.enabled）
    - ".sprint-session/screenshots/{story_key}-login-failure.png"  # 登录失败截图（if login failed）
```

### Return Value

```yaml
return:
  status: "success" | "e2e-failure" | "skipped" | "timeout" | "login-failure" | "failure"
  story_key: "3-1"
  mode: "e2e"
  session_id: "sprint-2026-02-07-001"
  results:
    browser_tool_used: "chrome_mcp" | "playwright_mcp" | "none"
    skip_reason: ""  # 当 status 为 "skipped" 时填充: e2e_inspection_disabled | no_matching_story_tags | no_browser_tool
    login_verified: true
    ac_total: 5
    ac_passed: 4
    ac_failed: 1
    ac_results:
      - ac_id: "AC1"
        status: "pass"
        screenshot: ".sprint-session/screenshots/3-1-AC1.png"
        error: ""
      - ac_id: "AC2"
        status: "fail"
        screenshot: ".sprint-session/screenshots/3-1-AC2.png"
        error: "Expected button 'Submit' to be visible, but element not found"
    report_path: ".sprint-session/3-1-e2e-report.md"
    screenshots:
      - ".sprint-session/screenshots/3-1-login-success.png"
      - ".sprint-session/screenshots/3-1-AC1.png"
      - ".sprint-session/screenshots/3-1-AC2.png"
  errors: []
```

#### Skipped Return Value（触发条件不满足时）

```yaml
return:
  status: "skipped"
  story_key: "3-1"
  mode: "e2e"
  session_id: "sprint-2026-02-07-001"
  results:
    browser_tool_used: "none"
    skip_reason: "e2e_inspection_disabled"  # 或 no_matching_story_tags | no_browser_tool
    login_verified: false
    ac_total: 0
    ac_passed: 0
    ac_failed: 0
    ac_results: []
    report_path: ""
    screenshots: []
  errors: []
```

---

## State Preconditions

| Scenario | Required State | On Wrong State |
|----------|---------------|----------------|
| E2E 验证（正常执行） | `e2e-verify` | abort, status: "failure", error: "Story not in e2e-verify state" |
| E2E 跳过（条件不满足） | `e2e-verify` | abort, status: "failure", error: "Story not in e2e-verify state" |

## State Transitions

| Scenario | Before | After | Condition |
|----------|--------|-------|-----------|
| 全部 AC 通过 | `e2e-verify` | `done` | status: "success" |
| 任一 AC 失败 | `e2e-verify` | `review` | status: "e2e-failure"，回到 review-fix 循环 |
| 条件不满足跳过 | `e2e-verify` | `done` | status: "skipped"，E2E 非阻塞跳过 |
| 登录失败 | `e2e-verify` | `review` | status: "login-failure"，视为 E2E 失败 |
| 超时 | `e2e-verify` | `needs-intervention` | status: "timeout"，不阻塞后续 Story |
| 不可恢复错误 | `e2e-verify` | 状态不变 | status: "failure"，记录到执行报告 |

> **Note:** 状态转换由 Orchestrator 在收到 return value 后执行，本 workflow 不直接写入 sprint-status.yaml（Principle 4: 单一状态写入入口）。

---

## Workflow Steps

### Step 1: State Validation & Trigger Condition Guard

**Goal:** 验证 Story 处于正确的 `e2e-verify` 状态（Principle 5），然后评估三个触发条件，任一不满足则立即跳过 E2E 阶段，返回 skipped 状态。这是 Optional workflow 的核心逃生机制（Principle 7）。

**Actions:**

0. **State Validation（前置检查）:**
   - 按 `status_file_search_paths` 配置顺序查找 `sprint-status.yaml`
   - 读取 sprint-status.yaml，定位 `story_key` 对应条目
   - 验证当前状态必须为 `e2e-verify`
   - 如果状态不匹配 --> 立即终止:
     ```yaml
     return:
       status: "failure"
       errors:
         - type: "state_mismatch"
           expected: "e2e-verify"
           actual: "{current_state}"
           message: "Story {story_key} is in '{current_state}' state, expected 'e2e-verify'"
     ```

1. **Condition 1 -- Config Enablement（主开关）:**
   - 读取 `config.yaml` 中 `e2e_inspection.enabled`
   - 如果 `false` --> 立即返回:
     ```yaml
     return:
       status: "skipped"
       results:
         skip_reason: "e2e_inspection_disabled"
         browser_tool_used: "none"
     ```
   - 此为主开关，优先于其他条件检查

2. **Condition 2 -- Story Tag Match:**
   - 读取 Story `.md` 文件的 tags/labels 字段
   - 检查是否包含至少一个匹配标签: `frontend`, `ui`, `web`, `page`
   - 标签匹配为**大小写不敏感**
   - 如果无匹配标签 --> 立即返回:
     ```yaml
     return:
       status: "skipped"
       results:
         skip_reason: "no_matching_story_tags"
         browser_tool_used: "none"
     ```

3. **Condition 3 -- Browser MCP Tool Availability:**
   - 探测 Chrome MCP 工具是否可用（首选）
   - 如果 Chrome MCP 不可用 --> 探测 Playwright MCP 工具是否可用（降级）
   - 如果两者均不可用 --> 立即返回:
     ```yaml
     return:
       status: "skipped"
       results:
         skip_reason: "no_browser_tool"
         browser_tool_used: "none"
     ```
   - 如果任一可用 --> 记录选中的工具到 `browser_tool_used`，继续执行

**三条件短路规则:** 按 Condition 1 -> 2 -> 3 顺序检查，首个失败条件触发立即返回，后续条件不再评估。

**On Success (三条件全部满足):** 继续 Step 2
**On Skip:** 返回 `status: "skipped"` + 具体 `skip_reason`，Orchestrator 收到后将 Story 状态从 `e2e-verify` 转换为 `done`

---

### Step 2: Browser MCP Tool Detection

**Goal:** 确定实际使用的浏览器 MCP 工具，建立浏览器连接（Principle 2: 降级优于报错）。

**Actions:**

1. **Degradation Chain:**
   a. 探测 Chrome MCP (`chrome_mcp`) 可用性
      - 如果可用 --> 选择为 active tool，记录 `browser_tool_used: "chrome_mcp"`
   b. 如果 Chrome MCP 不可用 --> 探测 Playwright MCP (`playwright_mcp`)
      - 如果可用 --> 选择为 active tool，记录 `browser_tool_used: "playwright_mcp"`
   c. 如果两者均不可用 --> 已在 Step 1 Condition 3 处理，此处不会到达

2. **工具选择固定:** 一旦选定浏览器工具，整个 Story 验证过程中保持不变，不会中途切换

3. **记录降级日志:** 如果从 Chrome MCP 降级到 Playwright MCP，在 E2E 报告中记录降级信息

**On Success:** 浏览器工具就绪，继续 Step 3
**On Failure:** 工具探测异常 --> status: "failure", error: "Browser tool detection failed"

---

### Step 3: Headless Persona Load

**Goal:** 加载 BMM Dev (Amelia) persona 知识，获取前端开发和测试领域专长，同时避免触发交互式行为（Principle 8）。

**Actions:**

1. 通过 Skill call 加载 BMM Dev persona
   - Persona ID: `bmad:bmm:agents:dev`（来自 `config.yaml` 的 `role_mapping.e2e_inspector_persona`）
2. 立即声明 YOLO/automation 模式
   - 跳过菜单显示和用户交互
   - 不验证特定激活信号
3. 通过 Skill call 返回值验证加载成功
4. Persona 知识和原则注入到上下文中:
   - 前端组件交互模式
   - DOM 元素定位策略
   - 页面加载判定最佳实践

**On Success:** Persona 知识就绪，继续 Step 4
**On Failure:**
- Persona 加载失败 --> 回退到 BSO 内置精简 persona（lean persona fallback）
- 记录警告: "BMM Dev persona load failed, using lean persona"
- 继续执行（Principle 2: 降级优于报错）

---

### Step 4: Story AC Extraction

**Goal:** 从 Story 文档中提取完整的 AC 列表，为逐条浏览器验证做准备。

**Actions:**

1. 读取 Story `.md` 文件（路径从 `sprint-status.yaml` 中获取或按约定路径拼接）
2. 解析 Story 文档结构，提取:
   - AC 列表（包含 AC ID、描述、验证条件）
   - 每条 AC 的目标页面/URL 线索
   - AC 中涉及的 UI 元素标识符（按钮文本、输入框标签、表格结构等）
3. 读取 `e2e_inspection` 配置块:
   - `environment.base_url` -- 应用基础 URL
   - `environment.login` -- 登录配置
   - `environment.wait_after_navigation` -- 导航等待上限
4. 读取 `_lessons-learned.md` 中标记 `[e2e]` 的经验条目，注入到验证上下文中
5. 构建 AC 验证计划: 每条 AC 映射到具体的 URL + 验证步骤 + 预期结果

**On Success:** AC 验证计划就绪，继续 Step 5
**On Failure:**
- Story 文件不存在 --> abort, status: "failure", error: "Story file not found"
- AC 列表为空 --> abort, status: "failure", error: "No AC found in Story"

---

### Step 5: Login Verification Flow

**Goal:** 当 `login.enabled: true` 时，执行登录流程并验证登录成功，为后续 AC 验证建立已认证的浏览器会话。

**Precondition:** 仅在 `e2e_inspection.environment.login.enabled: true` 时执行此步骤。如果 `login.enabled: false`，跳过此步骤，直接进入 Step 6。

**Actions:**

1. **导航到登录页:**
   - 拼接 URL: `base_url` + `login.url`（如 `http://localhost:3100/login`）
   - 使用选定的浏览器 MCP 工具导航到登录页

2. **Smart Wait -- 登录表单就绪:**
   - 主信号: 检测登录表单 DOM 元素已渲染（用户名输入框、密码输入框、提交按钮）
   - 辅助信号: Network idle（无待处理的 XHR/fetch 请求）
   - Fallback ceiling: `wait_after_navigation`（默认 2000ms）

3. **输入凭据:**
   - 将 `login.default_username` 输入到用户名字段
   - 将 `login.default_password` 输入到密码字段

4. **提交登录表单:**
   - 点击提交按钮或触发表单提交

5. **Smart Wait -- 登录重定向:**
   - 主信号: 检测 URL 已从登录页跳转到其他页面（dashboard/home）
   - Fallback ceiling: `wait_after_navigation`（默认 2000ms）

6. **验证登录结果:**
   - 成功: URL 已重定向到非登录页面 --> `login_verified: true`
   - 失败: 仍在登录页面或出现错误提示 --> `login_verified: false`

7. **截图记录:**
   - 登录成功: 截图保存为 `{story_key}-login-success.png`
   - 登录失败: 截图保存为 `{story_key}-login-failure.png`

**On Success:** `login_verified: true`，继续 Step 6
**On Failure (登录失败):**
```yaml
return:
  status: "login-failure"
  results:
    login_verified: false
    screenshots:
      - ".sprint-session/screenshots/{story_key}-login-failure.png"
  errors:
    - type: "login_failure"
      message: "Login failed: still on login page after submit"
```

---

### Step 6: AC Verification Loop

**Goal:** 逐条验证 Story AC，每条 AC 执行独立的"导航 -> Smart Wait -> 验证 -> 截图"循环。

**Actions:**

对 Story AC 列表中的**每条 AC** 执行以下循环:

1. **确定目标 URL/页面:**
   - 从 AC 描述中推断目标页面路径
   - 拼接完整 URL: `base_url` + 页面路径

2. **导航到目标页面:**
   - 使用浏览器 MCP 工具导航到目标 URL
   - 如果当前已在目标页面，跳过导航

3. **Smart Wait Strategy（Principle: smart wait over fixed timeout）:**
   a. **Primary signal -- DOM stability:** 无新 DOM 变动持续 500ms
   b. **Secondary signal -- Network idle:** 无待处理的 XHR/fetch 请求持续 500ms
   c. **Page-specific hints:** 如果 AC 描述中提及 "loading"、"spinner"、"skeleton"，等待这些元素消失后再声明页面就绪
   d. **Fallback ceiling:** `wait_after_navigation` 值（默认 2000ms）-- 如果上述信号均未在此窗口内触发，强制继续

4. **执行验证步骤:**
   - 根据 AC 描述推导验证操作（检查元素可见性、文本内容、交互响应等）
   - 记录验证结果: pass 或 fail
   - 如果 fail，记录具体错误信息（期望行为 vs 实际行为）

5. **截图取证:**
   - 捕获当前页面截图
   - 命名规范: `{story_key}-{ac_id}.png`（如 `3-1-AC1.png`）
   - 保存路径: `.sprint-session/screenshots/`
   - 截图在验证操作完成后捕获，反映 pass 或 fail 状态

6. **记录 AC 结果:**
   ```yaml
   ac_results:
     - ac_id: "AC1"
       status: "pass" | "fail"
       screenshot: ".sprint-session/screenshots/3-1-AC1.png"
       error: ""  # fail 时填充具体错误
   ```

**循环终止条件:** 所有 AC 验证完毕，或遇到致命浏览器错误（如浏览器崩溃）。

**On Success (所有 AC 完成):** 继续 Step 7
**On Failure (浏览器崩溃):**
- 记录已完成的 AC 结果
- 未完成的 AC 标记为 fail，error: "Browser crashed before verification"
- 继续 Step 7（生成部分报告）

---

### Step 7: E2E Report Generation

**Goal:** 汇总所有 AC 验证结果，生成结构化的 E2E 报告文件。

**Actions:**

1. **汇总验证结果:**
   - 计算 `ac_total`、`ac_passed`、`ac_failed`
   - 收集所有截图路径到 `screenshots` 列表

2. **生成报告文件:**
   - 输出路径: `.sprint-session/{story_key}-e2e-report.md`
   - 报告结构:
     ```markdown
     # E2E Verification Report: Story {story_key}

     ## Summary
     - Browser Tool: {browser_tool_used}
     - Login: {login_verified}
     - AC Total: {ac_total} | Passed: {ac_passed} | Failed: {ac_failed}
     - Result: {PASS | FAIL}

     ## AC Results
     ### AC1: {description}
     - Status: PASS/FAIL
     - Screenshot: {path}
     - Error: {if any}

     ## Screenshots
     - {list of all screenshot paths}
     ```

3. **确定整体结果:**
   - 全部 AC 通过 --> `status: "success"`
   - 任一 AC 失败 --> `status: "e2e-failure"`

**On Success:** 报告写入完成，继续 Step 8
**On Failure:** 报告写入失败 --> 记录警告，仍然返回验证结果（报告是辅助产出物，不影响核心状态判定）

---

### Step 8: Return

**Goal:** 向 Orchestrator 返回执行结果，触发状态转换。

**Actions:**

1. **组装 return value:**
   - `status`: 根据各步骤结果确定最终状态
   - `results`: 汇总浏览器工具、登录状态、AC 验证结果、截图路径、报告路径
   - `errors`: 收集所有非致命错误和警告

2. **返回给 Orchestrator**

3. **Orchestrator 后续操作（非本 workflow 职责）:**
   - 收到 return value 后更新 sprint-status.yaml
   - `success`: `e2e-verify` --> `done`
   - `e2e-failure`: `e2e-verify` --> `review`（回到 review-fix 循环）
   - `skipped`: `e2e-verify` --> `done`（非阻塞跳过）
   - `login-failure`: `e2e-verify` --> `review`（视为 E2E 失败）
   - `timeout`: `e2e-verify` --> `needs-intervention`（不阻塞后续 Story）

**Return Value Mapping:**

| Scenario | Status | Orchestrator Action |
|----------|--------|---------------------|
| 全部 AC 通过 | `success` | `e2e-verify` --> `done` |
| 任一 AC 失败 | `e2e-failure` | `e2e-verify` --> `review`（进入 fix 循环） |
| 触发条件不满足 | `skipped` | `e2e-verify` --> `done`（非阻塞跳过） |
| 登录失败 | `login-failure` | `e2e-verify` --> `review`（视为验证失败） |
| 整体超时 | `timeout` | `e2e-verify` --> `needs-intervention` |
| 不可恢复错误 | `failure` | 状态不变，记录到执行报告 |

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | Status Returned |
|---|---------------|-----------------|----------|--------|-----------------|
| 1 | E2E 配置关闭（enabled: false） | Step 1 Condition 1 | Info | 立即跳过，非阻塞 | `skipped` |
| 2 | Story 无前端标签 | Step 1 Condition 2 | Info | 立即跳过，非阻塞 | `skipped` |
| 3 | 无可用浏览器 MCP 工具 | Step 1 Condition 3 | Info | 立即跳过，非阻塞 | `skipped` |
| 4 | Chrome MCP 不可用，降级到 Playwright | Step 2 | Warning | 降级继续（Principle 2） | N/A（继续） |
| 5 | BMM Dev Persona 加载失败 | Step 3 | Warning | 回退到精简 persona，继续 | N/A（继续） |
| 6 | Story 文件不存在 | Step 4 | Fatal | 立即终止 | `failure` |
| 7 | Story AC 列表为空 | Step 4 | Fatal | 立即终止 | `failure` |
| 8 | 登录失败（仍在登录页） | Step 5 | Critical | 截图记录，中止验证 | `login-failure` |
| 9 | 登录表单未找到 | Step 5 | Critical | 截图记录，中止验证 | `login-failure` |
| 10 | 页面导航超时（单页） | Step 6 | Warning | 标记当前 AC 为 fail，继续下一条 AC | N/A（继续） |
| 11 | DOM 元素未找到（验证失败） | Step 6 | Warning | 标记当前 AC 为 fail，记录错误详情 | N/A（继续） |
| 12 | 浏览器崩溃 | Step 6 | Critical | 记录已完成结果，未完成 AC 标记 fail | `e2e-failure` |
| 13 | 截图捕获失败 | Step 6 | Warning | 记录警告，AC 结果中 screenshot 为空，继续 | N/A（继续） |
| 14 | E2E 报告写入失败 | Step 7 | Warning | 记录警告，report_path 为空，仍然返回结果 | N/A（继续） |
| 15 | 整体超时（900s） | Any | Fatal | 由 Orchestrator 检测，标记 needs-intervention | `timeout` |
| 16 | Story 状态不匹配（非 e2e-verify） | Step 1 State Validation | Fatal | 立即终止 | `failure` |

### Timeout Configuration

- Workflow 整体超时: `agent_timeout_seconds.e2e_inspection: 900`（15 分钟）
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）
- 超时后 Story 标记为 `needs-intervention`，不阻塞后续 Story 处理（Principle 15）

---

## Agent Interface Alignment

### Skill Call Parameters Mapping

本 workflow 的 `inputs` 直接映射到 E2E Inspector Agent 的 Skill Call Parameters:

```yaml
# Workflow inputs          -->  Agent Skill Call Parameters
story_key: "3-1"           -->  story_key: "3-1"
mode: "e2e"                -->  mode: "e2e"
session_id: "sprint-..."   -->  session_id: "sprint-..."
```

### Return Value Alignment

本 workflow 的 `outputs.return` 与 E2E Inspector Agent 的 Return Value Schema 完全一致:

| Workflow Return Field | Agent Return Field | Type |
|----------------------|-------------------|------|
| `status` | `status` | enum: success/e2e-failure/skipped/timeout/login-failure/failure |
| `story_key` | `story_key` | string |
| `mode` | `mode` | fixed: "e2e" |
| `session_id` | `session_id` | string |
| `results.browser_tool_used` | `results.browser_tool_used` | enum: chrome_mcp/playwright_mcp/none |
| `results.skip_reason` | `results.skip_reason` | enum: e2e_inspection_disabled/no_matching_story_tags/no_browser_tool/"" |
| `results.login_verified` | `results.login_verified` | boolean |
| `results.ac_total` | `results.ac_total` | integer |
| `results.ac_passed` | `results.ac_passed` | integer |
| `results.ac_failed` | `results.ac_failed` | integer |
| `results.ac_results` | `results.ac_results` | array of {ac_id, status, screenshot, error} |
| `results.report_path` | `results.report_path` | path string |
| `results.screenshots` | `results.screenshots` | array of path strings |
| `errors` | `errors` | array |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| `e2e-verify` --> `done` (all AC passed) | Step 8: success | Yes |
| `e2e-verify` --> `review` (any AC failed) | Step 8: e2e-failure | Yes |
| `e2e-verify` --> `done` (skipped, non-blocking) | Step 1: skipped | Yes |
| `e2e-verify` --> `review` (login failure) | Step 5: login-failure | Yes |
| `e2e-verify` --> `needs-intervention` (timeout) | Orchestrator timeout detection | Yes |
| `e2e-verify` --> 状态不变 (unrecoverable error) | Step 1/4: failure | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `story_key`, `mode`, `session_id`, `config_overrides` | `story_key`, `mode`, `session_id` | Yes |
| Output status values | `success`, `e2e-failure`, `skipped`, `timeout`, `login-failure`, `failure` | `success`, `e2e-failure`, `skipped`, `timeout`, `login-failure`, `failure` | Yes |
| Modes | `e2e` | `e2e` | Yes |
| Persona | BMM Dev (Amelia) headless | BMM Dev (Amelia) headless | Yes |
| Trigger conditions | Config enabled + Story tags + Browser MCP (3-condition guard) | Config enabled + Story tags + Browser MCP (3-condition guard) | Yes |
| Browser degradation | Chrome MCP --> Playwright MCP --> skip | Chrome MCP --> Playwright MCP --> skip | Yes |
| Smart wait strategy | DOM stability + Network idle + fallback ceiling | DOM stability + Network idle + fallback ceiling | Yes |
| Screenshot protocol | `{story_key}-{ac_id}.png` in `.sprint-session/screenshots/` | `{story_key}-{ac_id}.png` in `.sprint-session/screenshots/` | Yes |
| State transitions | `e2e-verify` --> `done`/`review`/`needs-intervention` (+ skipped --> `done`) | `e2e-verify` --> `done`/`review` (+ skipped --> `done`) | Yes |

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping
role_mapping.e2e_inspector_persona          # Step 3: Persona ID ("bmad:bmm:agents:dev")

# E2E inspection（核心配置块）
e2e_inspection.enabled                      # Step 1 Condition 1: 主开关（true/false）
e2e_inspection.mode                         # Orchestrator 调度参考，本 workflow 不直接消费（interactive/semi-auto/full-auto）
e2e_inspection.environment.base_url         # Step 5/6: 应用基础 URL
e2e_inspection.environment.login.enabled    # Step 5: 是否需要登录
e2e_inspection.environment.login.url        # Step 5: 登录页面路径
e2e_inspection.environment.login.default_username  # Step 5: 登录用户名
e2e_inspection.environment.login.default_password  # Step 5: 登录密码
e2e_inspection.environment.wait_after_navigation   # Step 5/6: Smart Wait fallback ceiling（ms）
e2e_inspection.browser_tool.preferred       # Step 1/2: 首选浏览器工具（chrome_mcp）
e2e_inspection.browser_tool.fallback        # Step 1/2: 降级浏览器工具（playwright_mcp）
e2e_inspection.trigger_conditions           # Step 1 Condition 2: Story 标签匹配列表

# Defaults -- 超时
defaults.agent_timeout_seconds.e2e_inspection  # 整体超时（900s）
defaults.agent_timeout_action               # 超时处理策略（mark_needs_intervention）

# Status file
status_file_search_paths                    # 状态文件查找路径
```

---

## Workflow Sequence Diagram

```
Orchestrator              E2E Inspector (F2)              Browser MCP
    |                            |                            |
    |--- dispatch(story_key, -->|                            |
    |    mode:"e2e",            |                            |
    |    session_id)            |                            |
    |                           |                            |
    |                   Step 1: State Validation & Trigger Guard |
    |                     Cond 1: config enabled?            |
    |                       [NO] --\                         |
    |                     Cond 2: story tags match?          |
    |                       [NO] --\                         |
    |                     Cond 3: browser MCP available?     |
    |                       [NO] --\                         |
    |                              |                         |
    |          ---- SKIP SHORT-CIRCUIT (任一条件 NO) ----     |
    |<-- return(skipped, reason) --|                          |
    | e2e-verify --> done          |                          |
    |                              |                          |
    |          ---- NORMAL EXECUTION (三条件全 YES) ----      |
    |                           |                            |
    |                   Step 2: Browser MCP Detection        |
    |                     Chrome MCP --> Playwright MCP      |
    |                           |                            |
    |                   Step 3: Headless Persona Load        |
    |                     (BMM Dev Amelia via Skill)         |
    |                           |                            |
    |                   Step 4: Story AC Extraction          |
    |                     (Story .md + config + lessons)     |
    |                           |                            |
    |                   Step 5: Login Flow (if enabled)      |
    |                           |--- navigate(login_url) -->|
    |                           |<-- page rendered ----------|
    |                           |--- input credentials ----->|
    |                           |--- submit form ----------->|
    |                           |<-- redirect confirmation --|
    |                           |--- screenshot ------------>|
    |                           |                            |
    |                   Step 6: AC Verification Loop         |
    |                     For each AC:                       |
    |                           |--- navigate(ac_url) ------>|
    |                           |<-- DOM stable + net idle --|
    |                           |--- verify AC condition --->|
    |                           |<-- pass/fail result -------|
    |                           |--- capture screenshot ---->|
    |                           |<-- screenshot saved -------|
    |                           |                            |
    |                   Step 7: E2E Report Generation        |
    |                     (.sprint-session/e2e-report.md)    |
    |                           |                            |
    |                   Step 8: Return                       |
    |<-- return(status, results)|                            |
    |                           |                            |
    | [success]     e2e-verify --> done                      |
    | [e2e-failure] e2e-verify --> review                    |
    | [login-failure] e2e-verify --> review                  |
    | [timeout]     e2e-verify --> needs-intervention        |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 1/2: Chrome MCP 不可用时降级到 Playwright；两者都不可用时跳过 E2E 而非报错；Step 3: Persona 加载失败时回退到精简 persona |
| 4 | 单一状态写入入口 | Step 8: 状态转换由 Orchestrator 执行，本 workflow 不直接写 sprint-status.yaml |
| 5 | 状态是唯一真实来源 | 前置检查: 只检查 Story 状态是否为 e2e-verify，不假设来源 |
| 7 | 逃生舱 | Step 1: 三个触发条件构成完整的逃生机制 -- config 开关、标签过滤、工具可用性，任一不满足即可安全跳过 |
| 8 | Headless Persona Loading | Step 3: 加载 BMM Dev persona 知识但跳过交互行为 |
| 15 | 独立超时 | 整体 900s 超时，超时标记 needs-intervention，不阻塞后续 Story |
| 17 | 执行可见性 | Step 7: 生成 E2E 报告，每条 AC 有截图证据，结果完全可追溯 |
| 25 | Lessons 注入预算 | Step 4: 读取 `[e2e]` 标签的经验条目，按预算注入 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: e2e-inspection.spec.md + e2e-inspector agent + config.yaml + module-brief-bso.md_
_Template reference: story-creation (C2) workflow structure_
