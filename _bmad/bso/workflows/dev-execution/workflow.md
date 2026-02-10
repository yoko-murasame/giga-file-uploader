---
name: dev-execution
id: C4
description: "C4: TDD development (dev mode) and targeted fix (fix mode) with Scope Guard, Test Snapshot, and Git Safeguard"
module: bso
agent: bso-dev-runner
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Dev Execution Workflow (C4)

> BSO Core Workflow -- TDD 开发（dev 模式）和定向修复（fix 模式）。实施 Dev Scope Guard（Principle 19）、Fix-before-snapshot（Principle 20）和 Git Commit Safeguard（Principle 21）。由 Sprint Orchestrator 调度，Dev Runner Agent 执行。

## Purpose

将已审批的 Story 文档转化为可运行的代码和测试。支持两种模式：`dev`（完整 TDD 开发 -- 按 tasks/subtasks 序列执行 RED-GREEN-REFACTOR 循环）和 `fix`（定向修复 -- 根据 Code Review 反馈应用修复，确保测试计数不减少）。

## Primary Agent

**Dev Runner** (`bso-dev-runner`) -- 使用 BMM Dev (Amelia) persona 知识，headless 模式运行。

## Supporting Agents

- **Knowledge Researcher** (F1) -- 按需触发，用于经验注入和框架/API 技术研究

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Epic-Story 标识符（格式: {epic}-{story}）
    mode: "dev" | "fix"                        # dev: 完整 TDD 开发; fix: 定向修复
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
  optional:
    config_overrides:
      review_strictness_threshold: "high"                        # fix 模式专用: 修复严重级别阈值（high/medium/low，由 review_strictness 转换而来）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配格式 `\d+-\d+` | abort, status: "failure" |
| `mode` | 值为 "dev" 或 "fix" | abort, status: "failure", error: "Invalid mode" |
| `session_id` | 非空字符串 | abort, status: "failure" |
| `config_overrides.review_strictness_threshold` | 值为 "high", "medium", 或 "low"（仅 fix 模式） | 默认使用 `defaults.review_strictness` 转换后的阈值 |

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - "src/**/*.java"          # 源代码文件（项目特定）
    - "src/test/**/*.java"     # 测试文件（项目特定）
    - "Git commit(s)"          # 提交记录
```

### Return Value

```yaml
return:
  status: "success" | "failure" | "scope-violation" | "test-regression" | "needs-intervention"
  story_key: "3-1"
  mode: "dev" | "fix"
  session_id: "sprint-2026-02-07-001"
  results:
    tasks_completed: 5
    tasks_total: 5
    tests_written: 8
    tests_total: 42
    tests_passed: 42
    tests_failed: 0
    test_pass_rate: "100%"
    files_modified:
      - "src/modules/project/ProjectService.java"
      - "src/test/modules/project/ProjectServiceTest.java"
    commits:
      - hash: "abc1234"
        message: "feat: Story 3.1: 项目管理CRUD"
    scope_violations: []
    fix_snapshot:                        # fix 模式专用
      snapshot_count: 42
      post_fix_count: 44
      regression: false
    knowledge_queries:
      - query: "JeecgBoot @Dict annotation usage"
        result: "cache-hit"
    lessons_injected: 3
  errors: []
```

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|---------------|
| `dev` | `ready-for-dev` | abort, status: "failure", error: "Story not in ready-for-dev state" |
| `fix` | `review` | abort, status: "failure", error: "Story not in review state" |

## State Transitions

| Mode | Before | After (success) | After (failure) |
|------|--------|-----------------|--------------------|
| `dev` | `ready-for-dev` | `review` | `ready-for-dev`（状态不变） |
| `fix` | `review` | `review`（fix complete, 等待 re-review） | `review`（状态不变） |

> **Note:** 状态转换由 Orchestrator 在收到 return value 后执行，本 workflow 不直接写入 sprint-status.yaml（Principle 4: 单一状态写入入口）。

---

## Workflow Steps

### Step 1: State Validation

**Goal:** 验证 Story 处于正确的状态，确保 workflow 执行的前置条件满足。

**Actions:**
1. 按 `status_file_search_paths` 配置顺序查找 `sprint-status.yaml`
2. 读取 sprint-status.yaml，定位 `story_key` 对应条目
3. 验证当前状态：
   - `dev` 模式: 状态必须为 `ready-for-dev`
   - `fix` 模式: 状态必须为 `review`
4. 如果状态不匹配 --> 立即终止

**On Success:** 继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "state_mismatch"
      expected: "ready-for-dev"    # 或 "review"（fix 模式）
      actual: "{current_state}"
      message: "Story {story_key} is in '{current_state}' state, expected '{expected}' for {mode} mode"
```

---

### Step 2: Lessons Injection

**Goal:** 从经验库中注入与 dev-execution 阶段相关的历史经验，避免重复犯错（Principle 25）。

**Actions:**
1. 触发 Knowledge Researcher (F1)，模式为 `lessons-inject`
2. 阶段过滤标签: `[dev-execution]`
3. Knowledge Researcher 执行：
   a. 读取 `_lessons-learned.md`
   b. 按 `[dev-execution]` 标签过滤条目
   c. 按 recency（最新优先）+ relevance（与当前 Story 上下文相关度）排序
   d. 截取前 **10 条**（`lessons_injection_budget: 10`）
4. 注入到当前工作上下文中，作为开发/修复时的警告参考
   - 常见注入内容：框架 API 陷阱、TDD 模式偏差、文件作用域遗漏等

**On Success:** `lessons_injected: N`（实际注入条数），继续 Step 3
**On Failure (Knowledge Researcher 不可用):** 记录警告，以空上下文继续（Principle 2: 降级优于报错）

---

### Step 3: Context Loading

**Goal:** 加载开发/修复所需的全部上下文资料。

**Actions:**
1. 读取 Story .md 文件
   - 提取 tasks/subtasks 序列（dev 模式的执行清单）
   - 提取验收标准（AC）列表
   - 提取文件作用域声明（Step 5 使用）
   - **fix 模式额外操作:** 定位 review feedback section，提取修复要求
2. 读取 `project-context.md`
   - 获取项目规则、编码模式、技术栈约定
   - 获取文件组织规范和命名约定
3. 读取知识缓存 `index.yaml`
   - 检查是否存在与当前 Story 技术栈相关的预加载知识报告
   - 标记可用的 cache-hit 条目供开发过程中使用

**On Success:** 上下文就绪，继续 Step 4
**On Failure:**
- Story .md 文件不存在 --> abort, status: "failure", error: "Story file not found for {story_key}"
- project-context.md 不存在 --> 记录警告，继续（非致命）
- index.yaml 不存在 --> 记录警告，继续（知识缓存为空）

---

### Step 4: Headless Persona Load

**Goal:** 加载 BMM Dev (Amelia) persona 知识，获取 TDD 开发领域专长，同时避免触发交互式行为（Principle 8）。

**Actions:**
1. 通过 Skill call 加载 BMM Dev persona
   - Persona ID: `bmad:bmm:agents:dev`（来自 `config.yaml` 的 `role_mapping.dev_runner_persona`）
2. 立即声明 YOLO/automation 模式
   - 跳过菜单显示和用户交互
   - 不验证特定激活信号
3. 通过 Skill call 返回值验证加载成功
4. Persona 知识和原则注入到上下文中：
   - TDD 红绿重构纪律
   - 测试先行设计思维
   - "测试是规格而非事后补充"的理念
   - 代码质量和重构原则

**On Success:** Persona 知识就绪，继续 Step 5
**On Failure:**
- Persona 加载失败 --> 回退到 BSO 内置精简 persona（lean persona fallback）
- 记录警告: "BMM Dev persona load failed, using lean persona"
- 继续执行（Principle 2: 降级优于报错）

---

### Step 5: Dev Scope Guard Setup (Principle 19)

**Goal:** 建立文件修改白名单，确保开发/修复过程不会修改 Story 作用域外的文件。

**Actions:**
1. 解析 Step 3 加载的 Story 文件中的文件作用域声明
   - 提取允许修改的文件路径列表（支持 glob 模式）
   - 示例：`src/modules/project/**`, `src/test/modules/project/**`
2. 建立允许修改文件白名单：
   - Story 中声明的文件路径
   - 测试文件路径（与声明路径对应的 test 目录）
   - 通用配置文件（如 pom.xml 的依赖添加，需在 Story 中显式声明）
3. 初始化文件修改追踪器：
   - 记录后续步骤中所有被修改/创建的文件
   - 用于 Step 8 的 Scope Verification 对比

**On Success:** 白名单建立，追踪器就绪，继续 Step 6
**On Failure:**
- 文件作用域声明缺失 --> 记录 warning，使用 tasks 中推断的文件路径作为 fallback 白名单
- 如果推断也失败 --> abort, status: "scope-violation", error: "No file scope declaration found in Story"

---

### Step 6: Test Snapshot (fix 模式专用, Principle 20)

**Goal:** 在应用修复之前记录当前测试状态快照，为 Step 9 的回归检查提供基准线。

**Condition:** 仅 `fix` 模式执行此步骤。`dev` 模式跳过，直接进入 Step 7。

**Actions (fix 模式):**
1. 运行项目全量测试套件
2. 记录测试快照：
   ```yaml
   test_snapshot:
     total: 42
     passing: 40
     failing: 2
     failing_tests:
       - "ProjectServiceTest.testDeleteNonExistent"
       - "ProjectControllerTest.testUnauthorizedAccess"
     timestamp: "2026-02-07T14:30:00Z"
   ```
3. 快照数据保存在内存中，供 Step 9 对比使用

**On Success (fix 模式):** 快照记录完毕，继续 Step 7
**On Failure (fix 模式):**
- 测试运行失败（编译错误等） --> status: "failure", error: "Cannot run test suite for snapshot"
- 测试框架不可用 --> status: "failure", error: "Test framework unavailable"

**On Skip (dev 模式):** 直接继续 Step 7

---

### Step 7: TDD Execution / Fix Execution

**Goal:** 执行核心开发或修复工作。dev 模式执行完整 TDD 循环，fix 模式执行定向修复。

#### Dev 模式: TDD Execution

**Actions:**
1. 调用 BMM dev-story workflow
   - Skill 路径: `bmad:bmm:workflows:dev-story`（来自 `config.yaml` 的 `workflow_mapping.dev_story`）
2. 按 Story tasks/subtasks 序列逐一执行，**严格遵守排列顺序**：
   - 对每个 task/subtask:
     a. **RED** -- 编写失败的测试，测试描述对应 AC 的预期行为
     b. **GREEN** -- 编写最小实现代码使测试通过
     c. **REFACTOR** -- 在测试全绿的保护下重构代码质量
3. 开发过程中若遇到不确定的框架/API 用法：
   - 触发 Knowledge Researcher (F1)，模式为 `research`
   - 等待研究结果后继续（预算上限: `knowledge_research.max_calls_per_story: 3`）
   - 预算用尽 --> 记录警告，基于已有上下文继续（Principle 2）
4. 全部 tasks 完成后运行全量测试套件
   - 100% 通过 --> 继续 Step 8
   - 存在失败 --> 尝试修复（最多 2 轮），仍然失败 --> status: "failure"

#### Fix 模式: Targeted Fix Execution

**Actions:**
1. 从 Step 3 加载的 Story 文件中读取 review feedback section
2. 根据 `review_strictness_threshold` 过滤要修复的 findings：
   - `review_strictness_threshold: "high"` --> 仅修复 HIGH 严重级别
   - `review_strictness_threshold: "medium"` --> 修复 HIGH + MEDIUM
   - `review_strictness_threshold: "low"` --> 修复 HIGH + MEDIUM + LOW
3. 对过滤后的每个 finding 按优先级顺序应用修复：
   a. 分析 finding 的根因和位置
   b. 应用最小化修复（不引入新功能，不重构无关代码）
   c. 确保修复在 Step 5 的白名单范围内
4. 所有修复应用完毕后进入 Step 8

**On Success:** 开发/修复完成，继续 Step 8
**On Failure:**
- Dev 模式测试未全通过 --> status: "failure", error detail
- Fix 模式无法应用修复 --> status: "failure", error detail
- Knowledge Researcher 超时 --> 记录警告，继续（Principle 2）

---

### Step 8: Scope Verification (Principle 19)

**Goal:** 检查 Step 7 中所有修改的文件是否在 Step 5 建立的白名单内。

**Actions:**
1. 获取文件修改追踪器中记录的所有被修改/创建的文件列表
2. 逐一与 Step 5 白名单对比：
   - 在白名单内 --> 标记为 in-scope (PASS)
   - 不在白名单内 --> 标记为 scope violation
3. 发现 out-of-scope 修改时：
   a. 记录 warning（文件路径 + 修改原因 + 关联的 task）
   b. **回滚该文件的修改**（恢复到 Step 7 之前的状态）
   c. 在 `results.scope_violations[]` 中记录
4. 汇总 scope 检查结果：
   ```yaml
   scope_check:
     total_files_modified: 8
     in_scope: 7
     out_of_scope: 1
     violations:
       - file: "src/modules/user/UserService.java"
         reason: "Not declared in Story file scope"
         action: "reverted"
   ```

**On Success (零违规):** 继续 Step 9
**On Partial Violation (已回滚):** 记录违规，继续 Step 9（代码仍然可用，只是少了越界修改）
**On Critical Violation (核心功能文件被回滚导致测试失败):**
```yaml
return:
  status: "scope-violation"
  errors:
    - type: "scope_violation_critical"
      message: "Scope violation rollback caused test failures. {N} files reverted."
      violations: [...]
```

---

### Step 9: Test Regression Check (fix 模式专用, Principle 20)

**Goal:** 验证 fix 模式的修复没有引入测试回归。

**Condition:** 仅 `fix` 模式执行此步骤。`dev` 模式跳过，直接进入 Step 10。

**Actions (fix 模式):**
1. 运行项目全量测试套件
2. 获取当前测试结果：
   ```yaml
   test_current:
     total: 42
     passing: 41      # 对比 Step 6 snapshot 的 40
     failing: 1
   ```
3. 与 Step 6 快照对比：

| 对比结果 | 判定 | 动作 |
|---------|------|------|
| passing count 增加或不变 | PASS | 继续 Step 10 |
| passing count 减少 | FAIL -- test-regression | **回滚所有 Step 7 的更改**，报告 test-regression |

4. **回归检测到时的回滚流程：**
   a. `git checkout -- .`（回滚所有未提交更改）
   b. 验证回滚后测试恢复到 Step 6 快照状态
   c. 返回 test-regression 状态

**On Success (fix 模式, 无回归):** 继续 Step 10
**On Failure (fix 模式, 回归检测):**
```yaml
return:
  status: "test-regression"
  results:
    tests_total: 42
    tests_passed: 39          # 减少了
    tests_failed: 3
    snapshot_passing: 40      # Step 6 快照值
    regression_tests:
      - "ProjectServiceTest.testCreate"     # 新增失败
    files_modified: []        # 已回滚
    commits: []               # 未提交
  errors:
    - type: "test_regression"
      message: "Fix caused test regression: passing count decreased from 40 to 39. All changes rolled back."
```

**On Skip (dev 模式):** 直接继续 Step 10

---

### Step 10: Git Commit (Principle 21, U3)

**Goal:** 通过 precise-git-commit (U3) 提交代码和测试文件，包含敏感文件检查。

**Actions:**
1. 执行 precise-git-commit (U3) workflow：
   a. 快照当前 diff，识别变更文件
   b. **敏感文件检查:**
      - 扫描变更文件列表，匹配敏感模式:
        - `.env`, `.env.*`
        - `*credentials*`, `*secret*`, `*token*`
        - `*.pem`, `*.key`, `*.cert`
        - `config/production.*`
      - 如果检测到敏感文件 --> 立即中止提交，报告给 Orchestrator
   c. **逐文件 `git add`**（Per-file staging，绝不使用 `git add -A` 或 `git add .`）
      - 仅添加 Step 5 白名单范围内、且通过 Step 8 scope 检查的文件
   d. 执行 `git commit`
2. Commit message 模式（来自 `config.yaml` 的 `git_commit_patterns`）：
   - **dev 模式** (`git_commit_patterns.dev_complete`):
     ```
     feat: Story {epic}.{story}: {title}
     ```
     示例: `feat: Story 3.1: 项目管理CRUD`
   - **fix 模式** (`git_commit_patterns.fix_complete`):
     ```
     fix: Story {epic}.{story}: [review {round}] {description}
     ```
     示例: `fix: Story 3.1: [review 2] 修复空指针检查和参数校验`

**On Success:** commit hash 记录到 `results.commits[]`，继续 Step 11
**On Failure:**
- 敏感文件检测 --> abort commit, status: "needs-intervention", error: "Sensitive file detected: {filename}"
- Git 操作失败 --> status: "failure", error detail
- **Note:** commit 失败不影响已写入的代码文件，Orchestrator 可选择重试 commit

---

### Step 11: Return

**Goal:** 向 Orchestrator 返回执行结果，触发状态转换。

**Actions:**
1. 组装 return value：
   - `status`: 根据各步骤结果确定最终状态
   - `results`: 汇总测试数量、修改文件、commit 信息、scope 违规等
   - `errors`: 收集所有非致命错误和警告
2. 返回给 Orchestrator
3. **Orchestrator 后续操作（非本 workflow 职责）：**
   - 收到 return value 后更新 sprint-status.yaml
   - `dev` 模式成功: `ready-for-dev` --> `review`
   - `fix` 模式成功: `review` --> `review`（fix complete, 等待 re-review）
   - 失败: 状态不变，记录错误到执行报告

**Return Value Mapping:**

| Scenario | Status | Orchestrator Action |
|----------|--------|-------------------|
| 全部步骤成功（dev 模式） | `success` | 状态转换: `ready-for-dev` --> `review` |
| 全部步骤成功（fix 模式） | `success` | 状态保持 `review`（fix complete, 调度 C5 re-review） |
| Scope Guard 检测到关键违规 | `scope-violation` | 标记为需人工干预 |
| Fix 模式测试回归 | `test-regression` | 标记为需人工干预，review_round 不增加 |
| 状态不匹配 / Story 文件不存在 | `failure` | 状态不变，记录到执行报告 |
| 敏感文件检测 / 不可恢复错误 | `needs-intervention` | 标记为需人工干预 |

---

## C4 <-> C5 Fix Loop Protocol

### 闭环流程

```
C4 (dev mode)                C5 (code-review)             C4 (fix mode)
     |                              |                           |
     |-- dev complete ------------->|                           |
     |   status: success            |                           |
     |   ready-for-dev -> review    |                           |
     |                              |-- review_round: 1         |
     |                              |   result: needs-fix       |
     |                              |                           |
     |                              |-- dispatch fix mode ----->|
     |                              |                           |-- fix applied
     |                              |                           |-- test snapshot OK
     |                              |                           |-- commit
     |                              |<-- fix complete ----------|
     |                              |   status: success         |
     |                              |                           |
     |                              |-- review_round: 2         |
     |                              |   result: passed          |
     |                              |   review -> done/e2e      |
```

### 循环控制

| 条件 | 动作 | 配置 |
|------|------|------|
| review_round < 3 | 正常 fix + re-review | `defaults.max_review_rounds` |
| review_round = 3 | 降低 review_strictness_threshold 一级 | `review_degradation.round_3: "lower_strictness"` |
| review_round = 5 | 仅修复 HIGH 级别 | `review_degradation.round_5: "high_only"` |
| review_round = 8 | 强制标记 needs-intervention | `review_degradation.round_8: "force_needs_intervention"` |

> **Note:** 循环控制由 Orchestrator 管理，C4 和 C5 仅执行单次操作。Orchestrator 根据 `review_degradation` 配置决定是否继续调度。

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| Story 状态不匹配 | Step 1 | Fatal | 立即终止 | `failure` |
| Story .md 文件不存在 | Step 3 | Fatal | 立即终止 | `failure` |
| project-context.md 不存在 | Step 3 | Warning | 记录警告，继续 | N/A (继续) |
| Knowledge Researcher 不可用 | Step 2 | Warning | 降级继续（Principle 2） | N/A (继续) |
| BMM Dev Persona 加载失败 | Step 4 | Warning | 回退到精简 persona | N/A (继续) |
| 文件作用域声明缺失 | Step 5 | Warning | 从 tasks 推断 fallback 白名单 | N/A (继续) |
| 测试套件运行失败 | Step 6, 7, 9 | Fatal | 终止 | `failure` |
| TDD 全量测试未通过（dev 模式） | Step 7 | Error | 尝试修复 2 轮，仍失败则终止 | `failure` |
| Knowledge Researcher 超时 | Step 7 | Warning | 跳过，基于已有上下文继续 | N/A (继续) |
| Knowledge Research 预算用尽 | Step 7 | Info | 停止新查询，继续 | N/A (继续) |
| Scope violation（非关键） | Step 8 | Warning | 回滚越界文件，继续 | N/A (继续) |
| Scope violation（关键 -- 回滚导致测试失败） | Step 8 | Critical | 终止 | `scope-violation` |
| Test regression（fix 模式） | Step 9 | Critical | 回滚所有更改 | `test-regression` |
| 敏感文件检测 | Step 10 | Critical | 中止 commit | `needs-intervention` |
| Git commit 失败 | Step 10 | Error | 报告错误，代码文件保留 | `failure` |
| Agent 超时 | Any | Fatal | 由 Orchestrator 检测 | `needs-intervention` |

### Timeout Configuration

- Workflow 整体超时: `agent_timeout_seconds.dev_execution: 1800` (30 分钟)
- Knowledge Researcher 单次调用超时: `knowledge_research.timeout_seconds: 600` (10 分钟)
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）

---

## Agent Interface Alignment

### Skill Call Parameters Mapping

本 workflow 的 `inputs` 直接映射到 Dev Runner Agent 的 Skill Call Parameters:

```yaml
# Workflow inputs                --> Agent Skill Call Parameters
story_key: "3-1"                 --> story_key: "3-1"
mode: "dev"                      --> mode: "dev"
session_id: "sprint-..."         --> session_id: "sprint-..."
config_overrides:                --> config_overrides:
  review_strictness_threshold: "high"              -->   review_strictness_threshold: "high"
```

### Return Value Alignment

本 workflow 的 `outputs.return` 与 Dev Runner Agent 的 Return Value Schema 完全一致:

| Workflow Return Field | Agent Return Field | Type |
|----------------------|-------------------|------|
| `status` | `status` | enum: success/failure/scope-violation/test-regression/needs-intervention |
| `story_key` | `story_key` | string |
| `mode` | `mode` | enum: dev/fix |
| `session_id` | `session_id` | string |
| `results.tests_total` | `results.tests_total` | integer |
| `results.tests_passed` | `results.tests_passed` | integer |
| `results.tests_failed` | `results.tests_failed` | integer |
| `results.files_modified` | `results.files_modified` | array of path strings |
| `results.commits` | `results.commits` | array of {hash, message} |
| `results.scope_violations` | `results.scope_violations` | array |
| `results.knowledge_queries` | `results.knowledge_queries` | array |
| `results.lessons_injected` | `results.lessons_injected` | integer |
| `errors` | `errors` | array |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| `ready-for-dev` --> `review` (dev complete) | Step 11: dev success | Yes |
| `review` --> `review` (fix complete) | Step 11: fix success | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `story_key`, `session_id`, `mode`, `config_overrides` | `story_key`, `session_id`, `mode`, `config_overrides` | Yes |
| Output status values | `success`, `failure`, `scope-violation`, `test-regression`, `needs-intervention` | `success`, `failure`, `scope-violation`, `test-regression`, `needs-intervention` | Yes |
| Modes | `dev`, `fix` | `dev`, `fix` | Yes |
| Persona | BMM Dev (Amelia) headless | BMM Dev (Amelia) headless | Yes |
| Knowledge integration | Lessons injection (Step 2) + on-demand research (Step 7) via F1 | Lessons injection + on-demand research via F1 | Yes |
| Scope guard | Step 5 (whitelist setup) + Step 8 (verification) | Dev Scope Guard (Principle 19) | Yes |
| Test snapshot | Step 6 (snapshot) + Step 9 (regression check), fix mode only | Fix-Before-Snapshot (Principle 20) | Yes |
| Git commit | precise-git-commit (U3) with sensitive file check | precise-git-commit (U3) with sensitive file check | Yes |

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping
role_mapping.dev_runner_persona         # Step 4: Persona ID

# Workflow mapping
workflow_mapping.dev_story              # Step 7: BMM workflow Skill 路径

# Defaults
defaults.review_strictness                     # fix 模式默认严重级别（内部转换为 review_strictness_threshold）
defaults.max_review_rounds              # C4<->C5 闭环上限（Orchestrator 管理）
defaults.agent_timeout_seconds.dev_execution  # 整体超时（30 分钟）
defaults.agent_timeout_action           # 超时处理策略
defaults.review_degradation             # 闭环渐进降级策略

# Knowledge research
knowledge_research.enabled              # Step 2, 7: 是否启用
knowledge_research.max_calls_per_story  # Step 7: 单 Story 调用上限
knowledge_research.timeout_seconds      # Step 7: 单次调用超时

# Git
git_commit_patterns.dev_complete        # Step 10: dev 模式 commit message 模板
git_commit_patterns.fix_complete        # Step 10: fix 模式 commit message 模板

# Status file
status_file_search_paths                # Step 1: 状态文件查找路径
```

---

## Workflow Sequence Diagram

```
Orchestrator                Dev Runner (C4)                Knowledge Researcher (F1)
    |                              |                                |
    |--- dispatch(story_key, ---->|                                |
    |    mode, session_id)        |                                |
    |                             |                                |
    |                     Step 1: State Validation                 |
    |                             |                                |
    |                     Step 2: Lessons Injection                |
    |                             |-------- lessons-inject ------->|
    |                             |<------- lessons (max 10) ------|
    |                             |                                |
    |                     Step 3: Context Loading                  |
    |                       (Story + project-context + index.yaml) |
    |                             |                                |
    |                     Step 4: Headless Persona Load            |
    |                       (BMM Dev Amelia via Skill)             |
    |                             |                                |
    |                     Step 5: Dev Scope Guard Setup            |
    |                       (parse file scope, build whitelist)    |
    |                             |                                |
    |                     Step 6: Test Snapshot                    |
    |                       (fix mode only, skip in dev mode)      |
    |                             |                                |
    |                     Step 7: TDD / Fix Execution              |
    |                       (dev: RED-GREEN-REFACTOR per task)     |
    |                       (fix: targeted fix per finding)        |
    |                             |-------- research (x<=3) ------>|
    |                             |<------- report/cache-hit ------|
    |                             |                                |
    |                     Step 8: Scope Verification               |
    |                       (compare modified vs whitelist)        |
    |                             |                                |
    |                     Step 9: Test Regression Check            |
    |                       (fix mode only, compare vs snapshot)   |
    |                             |                                |
    |                     Step 10: Git Commit                      |
    |                       (precise-git-commit U3)                |
    |                             |                                |
    |                     Step 11: Return                          |
    |<--- return(status, results)-|                                |
    |                             |                                |
    | update sprint-status.yaml   |                                |
    | dev: ready-for-dev -> review|                                |
    | fix: review -> review       |                                |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 2: Knowledge Researcher 不可用时继续; Step 4: Persona 加载失败时回退; Step 7: 研究预算用尽时继续 |
| 4 | 单一状态写入入口 | Step 11: 状态转换由 Orchestrator 执行，本 workflow 不直接写 sprint-status.yaml |
| 5 | 状态是唯一真实来源 | Step 1: 只检查状态，不假设 Story 来源 |
| 8 | Headless Persona Loading | Step 4: 加载 persona 知识但跳过交互行为 |
| 19 | Dev Scope Guard | Step 5: 建立白名单; Step 8: 验证修改范围 |
| 20 | Fix-before-snapshot | Step 6: 记录测试快照; Step 9: 对比回归 |
| 21 | Git Commit Safeguard | Step 10: 逐文件 staging + 敏感文件检查 |
| 22 | Review progressive degradation | C4<->C5 闭环: Orchestrator 根据 review_round 渐进降级（非本 workflow 直接管理） |
| 25 | Lessons 注入预算 | Step 2: 最多注入 10 条经验 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: dev-execution.spec.md + dev-runner agent + config.yaml + module-brief-bso.md_
_Reference: story-creation (C2) workflow structure_
