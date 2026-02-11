---
name: interactive-guide
id: F4
description: "No-argument interactive onboarding — guide users through sprint setup via step-by-step prompts, producing structured execution parameters identical to F3 output"
module: bso
agent: orchestrator
version: 1.0.0
type: feature
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Interactive Guide Workflow (F4)

> BSO Feature Workflow -- 当用户执行 `auto-dev-sprint-team` 命令时不带任何参数（或带 `--interactive` 标志），启动交互式引导流程，通过 7 步问答引导用户完成 Sprint 配置，最终输出与 F3 intent-parsing 完全一致的结构化执行参数。

## Purpose

为 BMAD 新手和偏好可视化确认的用户提供零门槛的 Sprint 启动体验。用户无需记忆任何参数名称或语法，系统通过格式化的状态表格、可选列表、预览面板逐步引导，确保每个配置项都经过用户确认。最终产出与 F3 intent-parsing 相同的结构化参数，使 Orchestrator 的下游逻辑无需区分参数来源。

## Primary Agent

**Orchestrator** (内联逻辑) -- 本 workflow 是 Orchestrator 的交互式用户界面，不委派给任何子 Agent。所有步骤均在 Orchestrator 上下文中执行，直接与用户进行问答交互。

## Supporting Agents

无 -- 本 workflow 为纯交互式界面逻辑，不依赖任何子 Agent。

---

## Trigger Conditions

本 workflow 在以下任一条件满足时触发：

1. 用户执行 `/bso:auto-dev-sprint-team` 命令且**不带任何参数**（F3 Step 1 分类为空输入，返回 `status: "redirected"`）
2. 用户执行 `/bso:auto-dev-sprint-team --interactive` 显式请求交互模式（F3 Step 1 检测 `--interactive` 标志，返回 `status: "redirected"`）

---

## Input Schema

```yaml
inputs:
  required:
    sprint_status_file: "path/to/sprint-status.yaml"    # Sprint 状态文件路径
  optional:
    epic_files: []                                       # Epic 定义文件路径列表（自动从状态文件推断）
    config_file: "path/to/config.yaml"                   # BSO 配置文件（默认搜索路径）
```

### Input Resolution

| Source | Resolution Method | On Failure |
|--------|-------------------|------------|
| `sprint_status_file` | 按 `status_file_search_paths` 配置顺序查找 | abort, error: "sprint-status.yaml not found" |
| `epic_files` | 从 sprint-status.yaml 中提取 Epic 列表，按约定路径定位 | 跳过不可读的 Epic，警告用户 |
| `config_file` | 按 BSO 标准路径查找 | 使用内置默认值 |

---

## Output Schema

### Return Value (与 F3 输出格式一致)

```yaml
return:
  status: "confirmed" | "aborted" | "failure"   # confirmed: 用户确认执行; aborted: 用户取消; failure: 前置条件不满足
  epic_spec: "epic3,epic5"                     # 选中的 Epic 标识符
  stories: ["3-1", "3-2", "5-1", "5-3"]       # 解析后的具体 Story 列表
  filter: "incomplete"                          # incomplete | all | backlog (与 F3 一致)
  execution_mode: "full_lifecycle"              # full_lifecycle | dev_only | review_only (F4 扩展)
  options:
    review_strictness: "medium"                           # high | medium | low
    skip_story_review: false                    # 由 story_review_enabled 取反映射
    e2e: false                                  # 由 e2e_inspection 重命名映射
    max_review_rounds: 10                       # 正整数 (1-20)
    max_story_review_rounds: 3                  # 正整数 (1-10)
    no_research: false                          # 由 knowledge_research 取反映射
    dry_run: false                              # 预览模式 (与 F3 一致，F4 固定为 false)
    pre_research: false                         # 预研模式 (与 F3 一致，F4 固定为 false)
    first_story_checkpoint: "pause"             # pause | report | skip (F4 扩展)
    parallel: 1                                 # 1-3
    auto_clear_git_track: true                  # true | false (F4 扩展)
  story_details:                                # Story 列表详情 (与 F3 一致)
    - key: "3-1"
      name: "项目基础CRUD"
      current_state: "backlog"
    - key: "3-2"
      name: "项目列表高级筛选"
      current_state: "backlog"
  confirmed: true                               # 用户最终确认标志 (F4 扩展)
  parse_source: "interactive"                   # 解析来源标识 (固定为 "interactive")
  errors: []                                    # 错误列表 (与 F3 一致)
```

### Return Status Definitions

| Status | 含义 | Orchestrator 后续动作 |
|--------|------|---------------------|
| `confirmed` | 用户确认执行 | 进入 Story 队列调度主循环 |
| `aborted` | 用户取消执行 | 终止 Sprint，输出取消信息 |
| `failure` | 前置条件不满足（如 status 文件不存在、无可用 Epic） | 终止 Sprint，输出错误详情 |

---

## State Preconditions

| Condition | Required State | On Wrong State |
|-----------|---------------|----------------|
| sprint-status.yaml 存在且可读 | 文件存在于 `status_file_search_paths` 任一路径 | abort, status: "failure", error: "sprint-status.yaml not found" |
| 至少一个 Epic 包含非 `done` 状态的 Story | `development_status` 中存在 pending Story | abort, status: "failure", error: "All Stories are done" |

> **Note:** F4 interactive-guide 为 Orchestrator 内联 UI 逻辑，不操作单个 Story 状态。前置条件仅验证 Sprint 级别的可用性。

## State Transitions

N/A -- F4 interactive-guide 不触发任何 sprint-status.yaml 状态转换。F4 完成后返回结构化参数给 Orchestrator，由 Orchestrator 主循环根据 `status` 决定后续流程。

> **Note:** 状态转换由 Orchestrator 在收到 F4 return value 后、进入 Story 队列调度主循环时才开始发生（Principle 4: 单一状态写入入口）。

---

## Workflow Steps

### Step 1: Sprint Status Display

**Goal:** 读取 sprint-status.yaml，格式化为状态总览表格展示给用户，提供 Sprint 全局视野。

**Actions:**

1. 按 `status_file_search_paths` 配置顺序查找 sprint-status.yaml
2. 解析状态文件，提取所有 Epic 和 Story 条目
3. 按 Epic 分组，统计每个 Epic 的 Story 状态分布
4. 格式化为 ASCII 表格展示给用户
5. 高亮标注 `needs-intervention` 状态的 Story（使用 `[!]` 标记）
6. 显示 Sprint 基本信息（名称、开始日期、总体进度）

**User Interaction:**

```
=== BSO Interactive Guide ===
Sprint: Sprint 3 | Start: 2026-02-05

Sprint Status Overview:
+--------+-------+----------+-------------+---------+--------+------+-----+
| Epic   | Total | backlog  | story-doc-* | dev/fix | review | e2e  | done|
+--------+-------+----------+-------------+---------+--------+------+-----+
| epic-3 |   6   |    2     |      1      |    1    |   1    |  0   |  1  |
| epic-5 |   4   |    4     |      0      |    0    |   0    |  0   |  0  |
| epic-7 |   3   |    0     |      0      |    1[!] |   1    |  0   |  1  |
+--------+-------+----------+-------------+---------+--------+------+-----+
| Total  |  13   |    6     |      1      |    2    |   2    |  0   |  2  |
+--------+-------+----------+-------------+---------+--------+------+-----+

[!] = needs-intervention (需要人工干预)

Press Enter to continue to Epic selection...
```

**On Success:** 继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "status_file_not_found"
      message: "sprint-status.yaml not found in any search path"
```

---

### Step 2: Epic Selection

**Goal:** 展示可用 Epic 列表及其 Story 状态详情，用户选择执行目标。

**Actions:**

1. 列出所有含有非 `done` 状态 Story 的 Epic
2. 对每个 Epic 显示 Story 级别的状态详情
3. 提供选择方式：单个 Epic、多个 Epic（逗号分隔）、或 "all"
4. 验证用户选择的合法性
5. 根据选择解析出具体的 Story 列表

**User Interaction:**

```
=== Step 2: Epic Selection ===

Available Epics with pending Stories:

[1] epic-3 (4 pending)
    3-1 项目基础CRUD .............. backlog
    3-2 项目列表高级筛选 .......... backlog
    3-3 项目经理分配 .............. story-doc-review
    3-4 项目状态流转 .............. ready-for-dev

[2] epic-5 (4 pending)
    5-1 合同管理CRUD .............. backlog
    5-2 合同审批流程 .............. backlog
    5-3 合同模板管理 .............. backlog
    5-4 合同到期提醒 .............. backlog

[3] epic-7 (2 pending)
    7-2 权限配置界面 .............. ready-for-dev [!]
    7-3 角色继承管理 .............. review

Select Epic(s): [1/2/3/all/1,3] (default: all) > _
```

**Selection Validation:**

| Input | Interpretation | Validation |
|-------|---------------|------------|
| `1` | 选择 epic-3 | 编号在范围内 |
| `1,3` | 选择 epic-3 和 epic-7 | 所有编号在范围内 |
| `all` | 选择全部 | 始终合法 |
| `epic3` | 选择 epic-3 | 名称匹配（模糊匹配 epic 前缀 + 数字） |
| `5` (超出范围) | 无效 | 提示重新选择 |

**On Success:** `epic_spec` 和 `stories` 列表确定，继续 Step 3
**On Failure (无可用 Epic):**
```yaml
return:
  status: "failure"
  errors:
    - type: "no_available_epics"
      message: "All Stories are in 'done' state. Nothing to execute."
```

---

### Step 3: Execution Mode Selection

**Goal:** 选择执行范围，决定 Story 生命周期中哪些阶段被执行。

**Actions:**

1. 展示三种执行模式及其说明
2. 用户选择执行模式
3. 根据模式过滤 Story 列表（仅保留在对应模式可处理状态的 Story）

**User Interaction:**

```
=== Step 3: Execution Mode ===

Select execution mode:

[1] full lifecycle (default)
    Complete backlog -> done pipeline
    Includes: story creation -> story review -> dev -> code review -> e2e -> done
    Applicable Stories: All non-done Stories

[2] dev only
    Development phase only (skip story review, code review, e2e)
    Includes: story creation (if backlog) -> dev
    Applicable Stories: backlog + ready-for-dev Stories

[3] review only
    Review and fix existing code
    Includes: code review -> fix loop -> e2e
    Applicable Stories: review + e2e-verify Stories only

Select mode: [1/2/3] (default: 1) > _
```

**Mode Behavior Matrix:**

| Mode | Story States Processed | Phases Executed |
|------|----------------------|-----------------|
| `full_lifecycle` | backlog, story-doc-review, story-doc-improved, ready-for-dev, review, e2e-verify | All |
| `dev_only` | backlog, ready-for-dev | story-creation, dev-execution |
| `review_only` | review, e2e-verify | code-review, e2e-inspection |

**On Success:** `execution_mode` 确定，继续 Step 4
**On Invalid Input:** 提示 "Invalid selection, please enter 1, 2, or 3"，重新等待输入

---

### Step 4: Review Settings

**Goal:** 配置代码审查和 Story 审查的参数。

**Actions:**

1. 展示审查相关参数及其默认值
2. 用户可逐项修改或直接回车接受默认值
3. 验证输入值在合法范围内

**User Interaction:**

```
=== Step 4: Review Settings ===

Configure review parameters (press Enter to accept default):

  review_strictness [high/medium/low] (default: medium) > _
  story_review_enabled [true/false] (default: true) > _
  max_review_rounds [1-20] (default: 10) > _
  max_story_review_rounds [1-10] (default: 3) > _
```

**Validation Rules:**

| Parameter | Type | Valid Range | Default | On Invalid |
|-----------|------|-------------|---------|------------|
| `review_strictness` | enum | high, medium, low | medium | 提示合法值，重新输入 |
| `story_review_enabled` | boolean | true, false | true | 提示合法值，重新输入 |
| `max_review_rounds` | integer | 1-20 | 10 | 提示范围，重新输入 |
| `max_story_review_rounds` | integer | 1-10 | 3 | 提示范围，重新输入 |

**Mode-Specific Behavior:**
- 如果 Step 3 选择了 `dev_only`：跳过 `max_review_rounds` 和 `review_strictness`（不适用于该模式）
- 如果 Step 3 选择了 `review_only`：跳过 `story_review_enabled` 和 `max_story_review_rounds`（不适用于该模式）

**On Success:** 审查参数确定，继续 Step 5

---

### Step 5: Feature Toggle

**Goal:** 配置可选功能开关。

**Actions:**

1. 展示可选功能列表及其默认值和说明
2. 用户可逐项修改或直接回车接受默认值
3. 对 `parallel` 参数进行额外的安全提醒

**User Interaction:**

```
=== Step 5: Feature Toggle ===

Configure optional features (press Enter to accept default):

  e2e_inspection [enabled/disabled] (default: disabled)
    Browser-level AC verification after code review
    > _

  knowledge_research [enabled/disabled] (default: enabled)
    Technical research + knowledge cache for framework APIs
    > _

  first_story_checkpoint [pause/report/skip] (default: pause)
    pause  = Pause after first Story, wait for user review
    report = Generate quality report, continue automatically
    skip   = No checkpoint, full autonomous mode
    > _

  parallel [1-3] (default: 1)
    Number of Stories to process concurrently
    NOTE: parallel > 1 is experimental, recommended for independent Epics only
    > _
```

**Validation Rules:**

| Parameter | Type | Valid Values | Default (from config.yaml) | Description |
|-----------|------|-------------|---------|-------------|
| `e2e_inspection` | toggle | enabled, disabled | disabled | E2E 浏览器验证 |
| `knowledge_research` | toggle | enabled, disabled | enabled | 知识研究引擎 |
| `first_story_checkpoint` | enum | pause, report, skip | pause | 首个 Story 完成后的行为 |
| `parallel` | integer | 1-3 | 1 | 并发处理数量 |

**Conditional Display:**
- 如果 Step 3 选择了 `dev_only`：隐藏 `e2e_inspection`（dev_only 模式不包含 E2E 阶段）
- 如果 Step 3 选择了 `review_only`：隐藏 `knowledge_research`（review_only 不触发新的知识研究）

**On Success:** 功能开关确定，继续 Step 6

---

### Step 6: Dry-Run Preview

**Goal:** 在用户最终确认前，展示完整的执行预览，包括执行队列、所有配置参数汇总、与默认配置的差异标注。

**Actions:**

1. 根据 Step 2-5 的选择，计算执行队列（Story 列表 + 每个 Story 的预估步骤数）
2. 汇总所有配置参数
3. 与 config.yaml 默认值对比，标注差异项（使用 `[*]` 标记）
4. 检查潜在警告（needs-intervention、文件重叠、E2E 环境等）
5. 格式化为预览面板展示给用户

**User Interaction:**

```
=== Step 6: Dry-Run Preview ===

--- Execution Queue ---
+-----+------+---------------------------+-----------------+----------------+
| #   | Key  | Story Title               | Current State   | Steps to Run   |
+-----+------+---------------------------+-----------------+----------------+
| 1   | 3-1  | 项目基础CRUD               | backlog         | create->s-rev  |
|     |      |                           |                 | ->dev->cr->done|
| 2   | 3-2  | 项目列表高级筛选            | backlog         | create->s-rev  |
|     |      |                           |                 | ->dev->cr->done|
| 3   | 3-3  | 项目经理分配               | story-doc-review| s-rev->dev->   |
|     |      |                           |                 | cr->done       |
| 4   | 3-4  | 项目状态流转               | ready-for-dev   | dev->cr->done  |
+-----+------+---------------------------+-----------------+----------------+
Total: 4 Stories | Estimated phases: 16

--- Configuration Summary ---
+----------------------------+-----------+-----------+--------+
| Parameter                  | Value     | Default   | Delta  |
+----------------------------+-----------+-----------+--------+
| epic_spec                  | epic-3    | -         | -      |
| execution_mode             | full      | full      |        |
| review_strictness                    | low       | medium    | [*]    |
| story_review_enabled       | true      | true      |        |
| max_review_rounds          | 10        | 10        |        |
| max_story_review_rounds    | 3         | 3         |        |
| e2e_inspection             | disabled  | disabled  |        |
| knowledge_research         | enabled   | enabled   |        |
| first_story_checkpoint     | pause     | pause     |        |
| parallel                   | 1         | 1         |        |
+----------------------------+-----------+-----------+--------+
[*] = differs from default

--- Warnings ---
- Story 7-2 is in needs-intervention state and will be skipped
- first_story_checkpoint = pause: execution will pause after Story 3-1 completes
```

**Steps-to-Run Calculation:**

| Current State | full_lifecycle Steps | dev_only Steps | review_only Steps |
|---------------|---------------------|----------------|-------------------|
| backlog | create, s-review, dev, c-review, (e2e), done | create, dev | N/A (skip) |
| story-doc-review | s-review, dev, c-review, (e2e), done | dev | N/A (skip) |
| story-doc-improved | s-review, dev, c-review, (e2e), done | dev | N/A (skip) |
| ready-for-dev | dev, c-review, (e2e), done | dev | N/A (skip) |
| review | c-review, (e2e), done | N/A (skip) | c-review, (e2e), done |
| e2e-verify | (e2e), done | N/A (skip) | (e2e), done |
| needs-intervention | SKIP (warning) | SKIP | SKIP |
| done | SKIP | SKIP | SKIP |

> **Note:** `(e2e)` 仅在 `e2e_inspection: enabled` 时计入步骤数。

**On Success:** 预览展示完毕，继续 Step 7

---

### Step 7: Final Confirmation

**Goal:** 用户最终确认执行计划，或选择返回修改、中止执行。

**Actions:**

1. 展示确认选项
2. 根据用户选择执行对应操作
3. 如果确认，组装 F3 兼容的结构化参数并返回

**User Interaction:**

```
=== Step 7: Confirm ===

Ready to start sprint execution with the above configuration.

  [Y] Confirm and start execution
  [B] Back - return to step selection to modify settings
  [A] Abort - cancel and exit

Confirm? [Y/B/A] (default: Y) > _
```

**Back Flow (选择 B):**

```
Which step to return to?
  [2] Epic Selection
  [3] Execution Mode
  [4] Review Settings
  [5] Feature Toggle

Go to step: [2/3/4/5] > _
```

用户返回指定步骤后，从该步骤重新执行到 Step 7。已确认的前序步骤结果保留不变（除非用户修改了影响后续步骤的参数，如 execution_mode 变更会导致 Step 4/5 的可用参数变化）。

**Confirmation Actions:**

| Choice | Action | Return |
|--------|--------|--------|
| `Y` (Confirm) | 组装结构化参数 | 返回 Output Schema 给 Orchestrator |
| `B` (Back) | 跳转到用户指定步骤 | 不返回，重新进入步骤循环 |
| `A` (Abort) | 终止交互引导 | 返回 `{ status: "aborted", confirmed: false }` |

**On Confirm -- Return Value:**

```yaml
return:
  status: "confirmed"
  epic_spec: "epic3"
  stories: ["3-1", "3-2", "3-3", "3-4"]
  filter: "incomplete"
  execution_mode: "full_lifecycle"
  options:
    review_strictness: "low"
    skip_story_review: false                   # story_review_enabled 取反
    e2e: false                                 # e2e_inspection 重命名
    max_review_rounds: 10
    max_story_review_rounds: 3
    no_research: false                         # knowledge_research 取反
    dry_run: false                             # F4 固定为 false
    pre_research: false                        # F4 固定为 false
    first_story_checkpoint: "pause"
    parallel: 1
    auto_clear_git_track: true
  story_details:
    - key: "3-1"
      name: "项目基础CRUD"
      current_state: "backlog"
    - key: "3-2"
      name: "项目列表高级筛选"
      current_state: "backlog"
    - key: "3-3"
      name: "项目经理分配"
      current_state: "story-doc-review"
    - key: "3-4"
      name: "项目状态流转"
      current_state: "ready-for-dev"
  confirmed: true
  parse_source: "interactive"
  errors: []
```

**On Abort -- Return Value:**

```yaml
return:
  status: "aborted"
  confirmed: false
  parse_source: "interactive"
  errors: []
```

---

## Status Table Format

Sprint Status 表格使用固定宽度 ASCII 表格，列定义如下：

```
+--------+-------+----------+-------------+---------+--------+------+-----+
| Epic   | Total | backlog  | story-doc-* | dev/fix | review | e2e  | done|
+--------+-------+----------+-------------+---------+--------+------+-----+
```

**列说明：**

| Column | Width | Content |
|--------|-------|---------|
| Epic | 8 | Epic 标识符（如 epic-3） |
| Total | 5 | 该 Epic 下 Story 总数 |
| backlog | 8 | 处于 `backlog` 状态的 Story 数 |
| story-doc-* | 11 | `story-doc-review` + `story-doc-improved` 合并计数 |
| dev/fix | 7 | `ready-for-dev` + 正在开发/修复中的 Story 数 |
| review | 6 | 处于 `review` 状态的 Story 数 |
| e2e | 4 | 处于 `e2e-verify` 状态的 Story 数 |
| done | 4 | 处于 `done` 状态的 Story 数 |

**特殊标记：**
- `[!]` 后缀：表示该行（或该单元格）包含 `needs-intervention` 状态的 Story
- 最后一行为 Total 汇总行
- 表格宽度根据最长 Epic 名称自适应

---

## Execution Queue Preview Format

执行队列预览表格格式：

```
+-----+------+---------------------------+-----------------+----------------+
| #   | Key  | Story Title               | Current State   | Steps to Run   |
+-----+------+---------------------------+-----------------+----------------+
```

**列说明：**

| Column | Width | Content |
|--------|-------|---------|
| # | 3 | 执行顺序编号 |
| Key | 4 | Story 标识符（如 3-1） |
| Story Title | 25 | Story 标题（超过 25 字符截断，末尾加 `...`） |
| Current State | 15 | 当前状态 |
| Steps to Run | 14 | 从当前状态到完成需要经过的阶段缩写 |

**阶段缩写：**
- `create` = story-creation (C2)
- `s-rev` = story-review (C3)
- `dev` = dev-execution (C4)
- `cr` = code-review (C5)
- `e2e` = e2e-inspection (F2)
- `done` = terminal state

**排序规则：**
执行队列中的 Story 按以下优先级排序（先处理离完成更近的 Story）：
1. `e2e-verify` -- 最接近完成
2. `review` -- 需要 code review
3. `ready-for-dev` -- 准备开发
4. `story-doc-review` / `story-doc-improved` -- 文档审查阶段
5. `backlog` -- 尚未开始

同优先级内按 story_key 数字升序排列。

---

## Parameter Defaults Reference

所有可配置参数及其默认值对照表（与 config.yaml 对齐）：

| Parameter | Config Path | Default Value | Type | Valid Range | Step |
|-----------|-------------|---------------|------|-------------|------|
| `execution_mode` | N/A (F4 only) | `"full_lifecycle"` | enum | full_lifecycle, dev_only, review_only | Step 3 |
| `review_strictness` | `defaults.review_strictness` | `"medium"` | enum | high, medium, low | Step 4 |
| `story_review_enabled` | `defaults.story_review_enabled` | `true` | boolean | true, false | Step 4 |
| `max_review_rounds` | `defaults.max_review_rounds` | `10` | integer | 1-20 | Step 4 |
| `max_story_review_rounds` | `defaults.max_story_review_rounds` | `3` | integer | 1-10 | Step 4 |
| `e2e_inspection` | `e2e_inspection.enabled` | `false` | boolean | true, false | Step 5 |
| `knowledge_research` | `knowledge_research.enabled` | `true` | boolean | true, false | Step 5 |
| `first_story_checkpoint` | `defaults.first_story_checkpoint` | `"pause"` | enum | pause, report, skip | Step 5 |
| `parallel` | `defaults.parallel` | `1` | integer | 1-3 | Step 5 |
| `auto_clear_git_track` | `defaults.auto_clear_git_track` | `true` | boolean | true, false | auto |

> **Note:** `execution_mode` 是 F4 interactive-guide 独有的参数，不存在于 config.yaml 中。在 F3 intent-parsing 中通过自然语言推断（如 "只做开发" --> `dev_only`）。`auto_clear_git_track` 不在交互引导中显示，直接使用 config.yaml 默认值。

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | User Message |
|---|---------------|----------------|----------|--------|-------------|
| 1 | sprint-status.yaml 文件不存在 | Step 1 | Fatal | 终止交互，返回 failure | "sprint-status.yaml not found. Run `--check` to verify environment." |
| 2 | sprint-status.yaml 格式解析失败 | Step 1 | Fatal | 终止交互，返回 failure | "sprint-status.yaml parse error: {detail}. Please verify file format." |
| 3 | 所有 Story 均为 done 状态 | Step 2 | Info | 终止交互，返回 failure | "All Stories are done. Nothing to execute." |
| 4 | Epic 定义文件不可读 | Step 2 | Warning | 该 Epic 标记为不可用，继续 | "Epic file for {epic} not readable, skipping this Epic." |
| 5 | 用户输入无效选择（Epic 编号越界） | Step 2 | Recoverable | 提示合法范围，重新等待输入 | "Invalid selection. Please enter a number between 1 and {max}, or 'all'." |
| 6 | 选中模式下无可处理的 Story | Step 3 | Warning | 提示用户切换模式或选择其他 Epic | "No Stories in applicable state for '{mode}' mode. Try another mode or select different Epics." |
| 7 | 参数值超出合法范围 | Step 4/5 | Recoverable | 提示合法范围，重新等待输入 | "{param} must be between {min} and {max}." |
| 8 | E2E 启用但环境未配置 | Step 5 | Warning | 允许选择但在 Step 6 预览中警告 | "E2E enabled but environment not configured. Run `--check` first." |
| 9 | parallel > 1 且 Story 有文件作用域重叠 | Step 6 | Warning | 在预览中显示警告，不阻塞 | "WARNING: Stories {keys} may have file scope overlap. Parallel execution may cause conflicts." |
| 10 | 用户选择 Abort | Step 7 | Info | 正常终止，返回 aborted | "Sprint execution cancelled by user." |
| 11 | config.yaml 不存在或不可读 | Pre-Step 1 | Warning | 使用内置默认值，继续 | "config.yaml not found, using built-in defaults." |
| 12 | 交互会话超时（用户长时间无输入） | Any Step | Info | 保留当前进度，提示用户 | "Session idle. Your progress has been preserved. Re-run to continue." |

### Timeout Configuration

- Workflow 整体超时: 无独立超时（作为 Orchestrator 内联 UI 逻辑，受 Orchestrator 会话级超时控制）
- 用户交互等待: 无超时（等待用户输入，不消耗 Agent token 预算）
- sprint-status.yaml 读取: 同步操作，由文件系统 I/O 超时控制
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）

---

## Output Format Alignment with F3

F4 interactive-guide 的输出格式**必须与 F3 intent-parsing 完全一致**，使 Orchestrator 的下游调度逻辑无需区分参数来源。

### Schema Alignment Declaration

```yaml
# F3 intent-parsing output schema (完整字段，来源: intent-parsing/workflow.md)
f3_output:
  status: string             # confirmed | rejected | redirected | failure
  epic_spec: string          # Epic 标识
  stories: string[]          # Story key 列表
  filter: string             # incomplete | all | backlog
  options:
    review_strictness: string
    skip_story_review: boolean
    e2e: boolean
    parallel: integer
    dry_run: boolean
    no_research: boolean
    pre_research: boolean
    max_review_rounds: integer
    max_story_review_rounds: integer
  story_details: array       # Story 列表详情
  parse_source: string       # nl | precise | interactive
  errors: array

# F4 interactive-guide output schema (MUST match F3 core fields)
f4_output:
  status: string             # confirmed | aborted | failure -- maps to F3 confirmed/rejected/failure
  epic_spec: string          # Epic 标识 -- same as F3
  stories: string[]          # Story key 列表 -- same as F3
  filter: string             # incomplete | all | backlog -- same as F3
  execution_mode: string     # full_lifecycle | dev_only | review_only -- F4 extension
  options:
    review_strictness: string          # same as F3
    skip_story_review: boolean  # derived from story_review_enabled (inverted)
    e2e: boolean             # derived from e2e_inspection
    no_research: boolean     # derived from knowledge_research (inverted) -- same as F3
    dry_run: boolean         # same as F3 (F4 固定为 false)
    pre_research: boolean    # same as F3 (F4 固定为 false)
    max_review_rounds: integer   # same as F3
    max_story_review_rounds: integer  # same as F3
    first_story_checkpoint: string   # F4 extension
    parallel: integer        # same as F3
    auto_clear_git_track: boolean    # F4 extension
  story_details: array       # Story 列表详情 -- same as F3
  confirmed: boolean         # F4 extension: user confirmed flag
  parse_source: string       # 固定为 "interactive" -- same field as F3
  errors: array              # same as F3
```

### Field Mapping Rules

| F4 Internal Field | F3 Compatible Field | Transformation |
|-------------------|---------------------|---------------|
| `story_review_enabled: true` | `skip_story_review: false` | Boolean inversion |
| `e2e_inspection: true` | `e2e: true` | Rename only |
| `knowledge_research: false` | `no_research: true` | Boolean inversion + rename |
| `execution_mode` | (preserved as-is) | F3 does not produce this field; Orchestrator handles both |
| `confirmed` | (preserved as-is) | F3 does not produce this field; Orchestrator checks if present |

### Compatibility Contract

1. Orchestrator 的 `execute_sprint()` 方法接受 F3 或 F4 的输出，不做来源区分
2. F4 输出的**必需字段集**是 F3 输出必需字段集的超集
3. 任何 F3 能产出的字段，F4 也必须能产出，且语义一致
4. F4 独有的扩展字段（`execution_mode`, `confirmed`）在缺失时由 Orchestrator 使用默认值

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项：

```yaml
# Status file search paths (Step 1)
status_file_search_paths:
  - "{output_folder}/implementation-artifacts/sprint-status.yaml"
  - "./sprint-status.yaml"

# Default parameter values (Step 4, 5)
defaults:
  parallel: 1                         # Step 5: parallel default
  max_review_rounds: 10               # Step 4: max code review rounds
  max_story_review_rounds: 3          # Step 4: max story review rounds
  review_strictness: "medium"                     # Step 4: fix level
  auto_clear_git_track: true          # auto included in output
  story_review_enabled: true          # Step 4: story review toggle
  first_story_checkpoint: "pause"     # Step 5: checkpoint behavior

# E2E configuration (Step 5)
e2e_inspection:
  enabled: false                      # Step 5: e2e toggle default

# Knowledge research (Step 5)
knowledge_research:
  enabled: true                       # Step 5: knowledge research toggle default

# Dependency detection (Step 6 warnings)
defaults.dependency_detection:
  mode: "file_overlap"                # Step 6: parallel overlap warning
```

---

## Agent Interface Alignment

本 workflow 为 Orchestrator 内联 UI 逻辑，不涉及独立 Agent 调度。

### Skill Call Parameters Mapping

N/A -- F4 不通过 Skill call 调度外部 Agent，所有步骤在 Orchestrator 进程内完成，直接与用户进行问答交互。

### Return Value Alignment

F4 的 return value 直接由 Orchestrator 内部消费，与 F3 intent-parsing 的 return value 共享同一消费接口：

| Return Field | Consumer | Usage |
|-------------|----------|-------|
| `status` | Orchestrator 主循环 | 决定是否进入 Story 调度（confirmed）或终止（aborted/failure） |
| `stories` | Orchestrator 主循环 | 构建 Story 执行队列 |
| `execution_mode` | Orchestrator 主循环 | 决定 Story 生命周期中执行哪些阶段（F4 扩展字段） |
| `options` | Orchestrator 主循环 | 传递给后续 C2/C4/C5/F1/F2 workflow 的运行时参数 |
| `story_details` | Orchestrator 主循环 | 用于执行报告中的 Story 信息展示 |
| `confirmed` | Orchestrator 主循环 | 用户最终确认标志（F4 扩展字段） |
| `parse_source` | Orchestrator 日志 | 固定为 "interactive"，标识参数来源 |

### State Transition Alignment

N/A -- F4 不触发任何 sprint-status.yaml 状态转换。F4 完成后 Orchestrator 根据 `status` 决定后续流程，而非更新 Story 状态。

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `sprint_status_file`, `epic_files`, `config_file` | Orchestrator 内联（无独立 Agent） | N/A |
| Output status values | `confirmed`, `aborted`, `failure` | Orchestrator 内联 | N/A |
| Output format | F3 兼容 + F4 扩展字段 | Orchestrator `execute_sprint()` 统一消费 | Yes |
| Persona | 无（纯 UI 交互逻辑） | N/A | N/A |

---

## Workflow Sequence Diagram

```
                    +----------------------------------+
                    |  Trigger: no args / --interactive |
                    +----------------+-----------------+
                                     |
                                     v
                    +----------------------------------+
                    |  Step 1: Sprint Status Display    |
                    |  (Read + Format + Show Table)     |
                    +----------------+-----------------+
                                     |
                                     v
                    +----------------------------------+
                    |  Step 2: Epic Selection           |
               +--->|  (List + Detail + Select)         |
               |    +----------------+-----------------+
               |                     |
               |                     v
               |    +----------------------------------+
               |    |  Step 3: Execution Mode           |
               +--->|  (full / dev_only / review_only)  |
               |    +----------------+-----------------+
               |                     |
               |                     v
               |    +----------------------------------+
               |    |  Step 4: Review Settings          |
               +--->|  (review_strictness, story_review, etc.)          |
               |    +----------------+-----------------+
               |                     |
               |                     v
               |    +----------------------------------+
               |    |  Step 5: Feature Toggle           |
               +--->|  (e2e, research, checkpoint, etc.)|
               |    +----------------+-----------------+
               |                     |
               |                     v
               |    +----------------------------------+
               |    |  Step 6: Dry-Run Preview          |
               |    |  (Queue + Params + Diff + Warn)   |
               |    +----------------+-----------------+
               |                     |
               |                     v
               |    +----------------------------------+
               |    |  Step 7: Final Confirmation       |
               |    |  [Y] Confirm  [B] Back  [A] Abort |
               |    +---+----------+----------+--------+
               |        |          |          |
               |     Confirm     Back      Abort
               |        |          |          |
               |        v          |          v
               |   Return to      |     Return
               |   Orchestrator   |     { status: "aborted" }
               |                  |
               +------------------+
```

---

## Edge Cases

### 1. Single Epic Scenario
当只有一个 Epic 有 pending Stories 时，Step 2 自动选择该 Epic 并提示 "Only one Epic available, auto-selected: epic-X. Press Enter to continue."，用户按 Enter 确认即可。

### 2. All needs-intervention Scenario
如果所有非 done 的 Story 都处于 `needs-intervention` 状态，Step 2 显示警告 "All pending Stories require manual intervention. Interactive guide cannot proceed." 并终止。

### 3. Mixed State Epic Selection
用户选择多个 Epic 时，不同 Epic 中的 Story 可能处于不同状态。Step 6 的执行队列按 Story 状态优先级排序（见 Execution Queue Preview Format 的排序规则），先处理离完成更近的 Story。

### 4. Mode-State Mismatch
用户选择 `review_only` 但选中的 Epic 全部 Story 处于 `backlog` 状态时，Step 3 立即提示 "No Stories in review/e2e-verify state for selected Epics. Switch to full lifecycle or dev only mode?" 并引导用户切换模式或返回 Step 2 重新选择 Epic。

### 5. Back Navigation with Mode Change
用户在 Step 7 选择 Back 返回 Step 3 并修改了 execution_mode（例如从 `full_lifecycle` 改为 `dev_only`），Step 4 和 Step 5 需要根据新模式重新计算可用参数。已设置的不适用参数将被丢弃，使用默认值。

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | config.yaml 不可读时使用内置默认值；Epic 文件不可读时跳过该 Epic 而非终止 |
| 3 | 预算控制一切 | parallel 限制 1-3；max_review_rounds 限制 1-20；所有参数有合法范围约束 |
| 5 | 状态是唯一真实来源 | Step 1 从 sprint-status.yaml 读取实际状态，不假设或推断 Story 位置 |
| 7 | 始终有逃生舱 | Step 7 提供 Back 和 Abort 选项；每个步骤都可回退修改 |
| 9 | 向后兼容性 | 输出格式与 F3 一致，Orchestrator 下游逻辑无需修改 |
| 10 | Claude Code 优先 | 交互式引导使用纯文本 + ASCII 表格，兼容 CLI 环境 |
| 17 | 执行可见性 | Step 6 Dry-Run Preview 提供完整执行预览，所有配置差异一目了然 |
| 18 | 首个 Story 检查点 | Step 5 中 first_story_checkpoint 参数，用户可选 pause/report/skip |
| 24 | Epic 与 Status 一致性 | Step 2 展示 Epic 列表时验证 Epic 文件与 sprint-status.yaml 的 Story 列表一致 |
| 29 | 文件重叠依赖检测 | Step 6 在 parallel > 1 时检查 Story 文件作用域重叠并在预览中警告 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (Round 2)_
_Source: interactive-guide.spec.md + intent-parsing.spec.md + config.yaml + module-brief-bso.md_
_Reference template: C2 story-creation workflow.md_
