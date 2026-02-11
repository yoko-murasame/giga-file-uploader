---
name: intent-parsing
id: F3
description: "Parse natural language or structured user input into validated execution parameters with Story list resolution and user confirmation"
module: bso
agent: bso-orchestrator
type: feature
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Intent Parsing Workflow (F3)

> BSO Feature Workflow -- 将用户的自然语言、精确参数或交互式触发输入解析为结构化执行参数，结合 sprint-status.yaml 解析具体 Story 列表，经用户确认后返回给 Orchestrator 主循环。本 workflow 为 Orchestrator 内联逻辑，无独立 Agent。

## Purpose

auto-dev-sprint-team 命令的入口解析层。负责将三种输入形式（自然语言 / 精确参数 / 交互式触发）统一转化为结构化执行参数。核心职责包括：

1. **输入分类** -- 判断用户输入属于哪种路径，决定后续处理策略
2. **NL 解析** -- 对自然语言输入进行 LLM 推理，提取 epic_spec、story 范围、filter、options 等意图
3. **Story 列表解析** -- 根据解析出的 epic_spec + filter 从 sprint-status.yaml 解析出具体的 Story 列表
4. **用户确认** -- 展示解析结果和 Story 列表详情，等待用户确认 / 修改 / 拒绝

本 workflow 是 Orchestrator 主循环的第一个阶段，其输出直接驱动后续的 Story 队列调度。

## Primary Agent

**Orchestrator** (`bso-orchestrator`) -- 内联逻辑，无独立 Agent。

F3 是 Orchestrator 自身的解析逻辑，不涉及外部 Agent 调度。所有步骤均在 Orchestrator 进程内完成，不产生 Agent 间通信开销。

## Supporting Agents

无。本 workflow 完全自包含。

---

## Input Schema

```yaml
inputs:
  required:
    raw_input: ""                              # 用户原始输入（可以是 NL 文本、结构化 YAML/JSON、空字符串、或 "--interactive"）
    sprint_status_path: "path/to/sprint-status.yaml"  # Sprint 状态文件路径（按 status_file_search_paths 配置解析）
  optional:
    session_id: "sprint-2026-02-07-001"        # Sprint 会话 ID（由 Orchestrator 生成）
    config_overrides: {}                       # 运行时配置覆盖
```

### Input Classification Rules

| 输入特征 | 分类 | 处理路径 |
|---------|------|---------|
| 空字符串 / `--interactive` | Interactive Trigger | --> 转发 F4 interactive-guide |
| 包含 YAML/JSON 结构（`epic_spec:` / `{` 开头） | Precise Parameters | --> 跳过 NL 解析，直接 Step 3 |
| 包含 `--` 开头的 CLI 标志（如 `--review-strictness strict`） | Precise Parameters | --> CLI 参数解析，直接 Step 3 |
| 纯 epic-spec 格式（匹配 `epic\d+` 或 `\d+-\d+(,\d+-\d+)*`） | Precise Parameters | --> 直接 Step 3 |
| 其他自由文本（中文/英文/混合） | Natural Language | --> Step 2 NL Parsing |

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `raw_input` | 字符串类型，允许为空 | 空字符串 --> 分类为 Interactive Trigger |
| `sprint_status_path` | 文件存在且可读 | abort, status: "failure", error: "sprint-status.yaml not found" |

---

## Output Schema

### Return Value

```yaml
return:
  status: "confirmed" | "rejected" | "redirected" | "failure"
  epic_spec: "epic5"                           # Epic 标识符（epicN / all / epicN-epicM）
  stories: ["5-1", "5-2", "5-3", "5-4", "5-5"] # 具体 Story 列表（从 sprint-status.yaml 解析）
  filter: "incomplete"                         # 筛选模式: incomplete | all | backlog
  options:
    review_strictness: "strict"                   # strict | normal | lenient（strict = 全面修复）
    skip_story_review: false                   # 是否跳过 Story Review 阶段
    e2e: false                                 # 是否启用 E2E 验证
    parallel: 1                                # 并行度
    dry_run: false                             # 是否为预览模式
    no_research: false                         # 是否禁用 Knowledge Researcher
    pre_research: false                        # 是否预研模式
    max_review_rounds: 10                      # Code Review 最大轮数
    max_story_review_rounds: 3                 # Story Review 最大轮数
  story_details:                               # Story 列表详情（用于确认展示）
    - key: "5-1"
      name: "Story Name"
      current_state: "backlog"
    - key: "5-2"
      name: "Story Name"
      current_state: "backlog"
  parse_source: "nl" | "precise" | "interactive"  # 解析来源标识
  errors: []
```

### Return Status Definitions

| Status | 含义 | Orchestrator 后续动作 |
|--------|------|---------------------|
| `confirmed` | 用户确认执行 | 进入 Story 队列调度主循环 |
| `rejected` | 用户拒绝执行 | 终止 Sprint，输出取消信息 |
| `redirected` | 转发到 F4 interactive-guide | 启动 F4 workflow |
| `failure` | 解析失败（输入无法分类、NL 解析失败、参数验证错误、Epic 不存在等） | 终止 Sprint，输出错误详情 |

---

## Workflow Steps

### Step 1: Input Classification

**Goal:** 判断用户输入属于三种路径中的哪一种，决定后续处理策略。

**Actions:**

1. 读取 `raw_input` 原始输入
2. 执行分类判断（按优先级顺序）：

   **路径 A: Interactive Trigger**
   - 条件: `raw_input` 为空字符串 **或** 包含 `--interactive` 标志
   - 动作: 立即返回 `status: "redirected"`，Orchestrator 转发到 F4 interactive-guide
   - 不进入后续步骤

   **路径 B: Precise Parameters**
   - 条件: `raw_input` 包含以下任一特征：
     - YAML 格式: 包含 `epic_spec:` 关键字
     - JSON 格式: 以 `{` 开头
     - CLI 标志: 包含 `--` 开头的参数（如 `epic5 --review-strictness strict`）
     - 纯 epic-spec 格式: 匹配 `epic\d+` 或 `\d+-\d+(,\d+-\d+)*` 模式
   - 动作: 直接解析为结构化参数 --> 跳转 Step 3 Parameter Mapping
   - 跳过 Step 2 NL Parsing

   **路径 C: Natural Language**
   - 条件: 不匹配路径 A 和 B 的所有其他输入
   - 动作: --> 继续 Step 2 NL Parsing

3. 记录分类结果到 `parse_source` 字段

**On Success:** 根据分类结果跳转到对应步骤
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "input_classification_error"
      message: "Unable to classify input: {raw_input}"
```

---

### Step 2: NL Parsing

**Goal:** 对自然语言输入进行 LLM 推理，提取 epic_spec、story 范围、filter、options 等结构化意图（Principle 9: NL 解析能力）。

**Precondition:** Step 1 分类结果为 Natural Language（路径 C）

**Actions:**

1. 构建 NL 解析 Prompt，包含以下要素：
   - 系统角色: "你是 BSO Sprint 参数解析器"
   - 支持语言: 中文、英文、中英混合
   - 可提取字段定义（见 Parameter Schema 章节）
   - 解析示例（见 NL Parsing Examples 章节）
   - 输出格式: 结构化 YAML

2. 执行 LLM 推理提取意图：
   - 从自由文本中识别 epic 标识（epicN、epic N、第N个epic）
   - 识别 story 范围（story 1 到 5、3-1 和 3-5、所有 story）
   - 识别 filter 关键词（没完成的 --> incomplete、全部 --> all、待办 --> backlog）
   - 识别 options 关键词（严格审查 --> review_strictness: strict、宽松审查 --> review_strictness: lenient、跳过审查 --> skip_story_review: true 等）

3. 验证 LLM 输出的结构完整性：
   - `epic_spec` 必须存在（至少能识别出目标 Epic）
   - 未识别的字段使用 config.yaml 默认值填充
   - 矛盾的参数组合触发警告（如 `skip_story_review: true` + `review_strictness: lenient` 不矛盾但值得提醒）

4. NL 解析置信度评估：
   - **高置信度**: epic_spec 明确、options 清晰 --> 继续 Step 3
   - **中置信度**: epic_spec 可推断但不确定 --> 在 Step 5 确认时高亮标注
   - **低置信度**: 无法识别有效 epic_spec --> 返回解析失败，提示用户重新输入

**On Success:** 提取出结构化意图，继续 Step 3
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "nl_parse_failed"
      message: "无法从输入中提取有效的执行参数: '{raw_input}'"
      suggestion: "请使用更明确的表述，例如: '跑 epic3 没完成的 story'"
```

---

### Step 3: Parameter Mapping

**Goal:** 将 Step 1（精确参数路径）或 Step 2（NL 解析结果）的输出映射到完整的结构化执行参数。

**Actions:**

1. **精确参数路径的解析:**
   - YAML 输入: 直接 parse YAML 结构
   - JSON 输入: 直接 parse JSON 结构
   - CLI 标志输入: 解析 `--key value` 格式对
   - 纯 epic-spec 输入: 仅设置 `epic_spec` 字段

2. **NL 解析路径的映射:**
   - 将 LLM 提取的意图字段映射到 Parameter Schema
   - 未提取的字段使用 config.yaml 默认值

3. **默认值填充（按 config.yaml）:**
   ```yaml
   # 未指定的参数使用以下默认值
   filter: "incomplete"                      # 默认只跑未完成的
   options:
     review_strictness: "{defaults.review_strictness}" # config.yaml: "normal"
     skip_story_review: false
     e2e: "{e2e_inspection.enabled}"         # config.yaml: false
     parallel: "{defaults.parallel}"         # config.yaml: 1
     dry_run: false
     no_research: false
     pre_research: false
     max_review_rounds: "{defaults.max_review_rounds}"           # config.yaml: 10
     max_story_review_rounds: "{defaults.max_story_review_rounds}" # config.yaml: 3
   ```

4. **参数验证:**
   - `epic_spec` 格式合法性检查（epicN / all / epicN-epicM / N-M 列表）
   - `review_strictness` 值域检查（strict / normal / lenient）
   - `parallel` 范围检查（>= 1）
   - `filter` 值域检查（incomplete / all / backlog）

**On Success:** 完整的结构化参数就绪，继续 Step 4
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "parameter_validation_error"
      field: "epic_spec"
      value: "epicX"
      message: "Invalid epic_spec format: 'epicX'. Expected: epicN, all, epicN-epicM, or N-M list"
```

---

### Step 4: Story List Resolution

**Goal:** 根据 epic_spec 和 filter 从 sprint-status.yaml 解析出具体的 Story 列表。

**Actions:**

1. **读取 sprint-status.yaml:**
   - 按 `status_file_search_paths` 配置顺序查找文件
   - 解析 `development_status` 段落

2. **Epic 筛选（根据 epic_spec）:**

   | epic_spec 格式 | 筛选逻辑 |
   |---------------|---------|
   | `epicN` (如 `epic3`) | 筛选 Epic 3 下的所有 Story |
   | `all` | 筛选所有 Epic 下的所有 Story |
   | `epicN-epicM` (如 `epic1-epic3`) | 筛选 Epic 1 到 Epic 3 的范围 |
   | 具体 Story 列表 (如 `["3-1","3-2"]`) | 直接使用指定列表，跳过 filter |

3. **Story 状态筛选（根据 filter）:**

   | filter | 包含的状态 | 排除的状态 |
   |--------|----------|----------|
   | `incomplete` | `backlog`, `story-doc-review`, `story-doc-improved`, `ready-for-dev`, `review`, `e2e-verify` | `done` |
   | `all` | 所有状态 | 无 |
   | `backlog` | 仅 `backlog` | 其他所有状态 |

4. **生成具体 Story 列表:**
   ```yaml
   # 示例: epic_spec: "epic3", filter: "incomplete"
   # sprint-status.yaml 中 epic-3 下有:
   #   3-1(done), 3-2(backlog), 3-3(review), 3-4(backlog), 3-5(backlog)
   # 结果:
   stories: ["3-2", "3-3", "3-4", "3-5"]
   story_details:
     - key: "3-2"
       name: "数据导出功能"
       current_state: "backlog"
     - key: "3-3"
       name: "批量操作"
       current_state: "review"
     - key: "3-4"
       name: "权限控制"
       current_state: "backlog"
     - key: "3-5"
       name: "日志审计"
       current_state: "backlog"
   ```

5. **空列表检测:**
   - 如果筛选后 stories 为空 --> 向用户报告原因（如 "epic3 所有 Story 已完成"）
   - 不自动终止，而是在 Step 5 展示空列表供用户确认或修改 filter

**On Success:** Story 列表和详情就绪，继续 Step 5
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "epic_not_found"
      message: "Epic '{epic_spec}' not found in sprint-status.yaml"
      available_epics: ["epic1", "epic2", "epic3"]
```

---

### Step 5: Confirmation Display

**Goal:** 向用户展示解析结果和 Story 列表详情，为用户确认提供完整信息（Principle 10: 确认机制）。

**Actions:**

1. **构建确认展示内容:**

   ```
   ==========================================
   BSO Sprint 执行参数确认
   ==========================================

   解析来源: 自然语言 (NL)
   原始输入: "把 epic5 没完成的都跑了，严格审查"

   ------------------------------------------
   执行参数:
   ------------------------------------------
   Epic:           epic5
   Filter:         incomplete (仅未完成)
   Fix Level:      low (严格/全面修复)
   Story Review:   启用
   E2E:            禁用
   Parallel:       1 (串行)
   Dry Run:        否

   ------------------------------------------
   Story 队列 (共 4 个):
   ------------------------------------------
   #  | Story Key | Story Name     | 当前状态
   ---|-----------|----------------|----------
   1  | 5-1       | 用户认证       | backlog
   2  | 5-3       | 数据同步       | backlog
   3  | 5-4       | 报表生成       | review
   4  | 5-5       | 通知推送       | backlog

   已跳过 (已完成): 5-2
   ==========================================
   ```

2. **NL 解析置信度标注:**
   - 高置信度字段: 正常展示
   - 中置信度字段: 后缀标注 `[推断]`，提醒用户关注
   - 低置信度字段: 后缀标注 `[不确定 - 请确认]`

3. **空列表特殊展示:**
   ```
   Story 队列: 空 (0 个)
   原因: epic5 所有 Story 已处于 'done' 状态
   建议: 使用 filter: "all" 重新运行，或选择其他 Epic
   ```

**On Success:** 确认信息展示完毕，继续 Step 6

---

### Step 6: User Confirmation

**Goal:** 等待用户对解析结果的响应，支持确认、修改、拒绝三种操作（Principle 10: 确认机制）。

**Actions:**

1. **提示用户选择:**
   ```
   请选择操作:
   [Y] 确认执行 (默认)
   [M] 修改参数
   [N] 取消执行
   ```

2. **三种响应处理:**

   **Confirm (Y / 回车 / "确认" / "好的" / "开始"):**
   - 设置 `status: "confirmed"`
   - --> 继续 Step 7 Return

   **Modify (M / "修改" / "改一下"):**
   - 进入修改子流程：
     a. 提示用户输入修改内容（支持 NL 或精确参数）
     b. 示例: "把 review_strictness 改成 strict" 或 `--review-strictness strict`
     c. 应用修改到当前参数
     d. 如果修改影响 Story 列表（如改变 epic_spec 或 filter） --> 重新执行 Step 4
     e. 重新展示确认信息（Step 5）
     f. 再次等待用户确认
   - 修改循环上限: 5 次（Principle 3: 预算控制，防止无限循环）
   - 超过上限 --> 提示用户使用精确参数重新执行

   **Reject (N / "取消" / "不跑了" / "算了"):**
   - 设置 `status: "rejected"`
   - --> 继续 Step 7 Return

**On Success:** 用户响应已处理，继续 Step 7

---

### Step 7: Return

**Goal:** 向 Orchestrator 主循环返回结构化执行参数。

**Actions:**

1. **组装 Return Value:**
   - `confirmed`: 返回完整参数 + Story 列表，Orchestrator 进入主循环
   - `rejected`: 返回空参数，Orchestrator 输出取消信息后终止
   - `redirected`: 返回重定向标识，Orchestrator 启动 F4 workflow

2. **日志记录:**
   - 记录解析来源（nl / precise / interactive）
   - 记录原始输入和最终参数（用于调试和审计）
   - 如果经过修改，记录修改历史

**Return Value (confirmed):**
```yaml
return:
  status: "confirmed"
  epic_spec: "epic5"
  stories: ["5-1", "5-3", "5-4", "5-5"]
  filter: "incomplete"
  options:
    review_strictness: "strict"
    skip_story_review: false
    e2e: false
    parallel: 1
    dry_run: false
    no_research: false
    pre_research: false
    max_review_rounds: 10
    max_story_review_rounds: 3
  story_details:
    - key: "5-1"
      name: "用户认证"
      current_state: "backlog"
    - key: "5-3"
      name: "数据同步"
      current_state: "backlog"
    - key: "5-4"
      name: "报表生成"
      current_state: "review"
    - key: "5-5"
      name: "通知推送"
      current_state: "backlog"
  parse_source: "nl"
  errors: []
```

**Return Value (rejected):**
```yaml
return:
  status: "rejected"
  parse_source: "nl"
  errors: []
```

**Return Value (redirected):**
```yaml
return:
  status: "redirected"
  parse_source: "interactive"
  errors: []
```

---

## NL Parsing Examples

以下示例覆盖中文、英文、中英混合输入场景。每个示例包含原始输入和期望的解析输出。

### 示例 1: 中文 -- 基础筛选 + 审查级别

**输入:** `"把 epic5 没完成的都跑了，严格审查"`

**解析输出:**
```yaml
epic_spec: "epic5"
filter: "incomplete"
options:
  review_strictness: "strict"
```

**解析逻辑:** "没完成的" --> filter: incomplete; "严格审查" --> review_strictness: strict（strict = 全面修复）

---

### 示例 2: 中文 -- Story 范围指定

**输入:** `"跑 epic3 的 story 1 到 5"`

**解析输出:**
```yaml
epic_spec: "epic3"
stories: ["3-1", "3-2", "3-3", "3-4", "3-5"]
```

**解析逻辑:** "story 1 到 5" --> 展开为具体列表 3-1 至 3-5; 指定具体 stories 时 filter 不生效

---

### 示例 3: 中文 -- 全局执行 + 跳过审查

**输入:** `"全部跑一遍，跳过 story review"`

**解析输出:**
```yaml
epic_spec: "all"
filter: "all"
options:
  skip_story_review: true
```

**解析逻辑:** "全部" --> epic_spec: all + filter: all; "跳过 story review" --> skip_story_review: true

---

### 示例 4: 英文 -- 多选项组合

**输入:** `"run epic 2, high only, no e2e"`

**解析输出:**
```yaml
epic_spec: "epic2"
options:
  review_strictness: "lenient"
  e2e: false
```

**解析逻辑:** "high only" --> review_strictness: lenient; "no e2e" --> e2e: false

---

### 示例 5: 中文 -- Backlog 筛选

**输入:** `"epic4 的 backlog 先跑起来"`

**解析输出:**
```yaml
epic_spec: "epic4"
filter: "backlog"
```

**解析逻辑:** "backlog" 关键词直接映射 filter; "先跑起来" 为语气词，不影响参数

---

### 示例 6: 中英混合 -- 并行 + 指定 Story

**输入:** `"把3-2和3-5单独跑一下，要 e2e 验证，parallel 2"`

**解析输出:**
```yaml
epic_spec: "epic3"
stories: ["3-2", "3-5"]
options:
  e2e: true
  parallel: 2
```

**解析逻辑:** "3-2和3-5" --> 解析 epic 编号为 3，指定具体 stories; "e2e 验证" --> e2e: true; "parallel 2" --> parallel: 2

---

### 示例 7: 中文 -- Epic 范围

**输入:** `"epic1 到 epic3 全部重跑"`

**解析输出:**
```yaml
epic_spec: "epic1-epic3"
filter: "all"
```

**解析逻辑:** "epic1 到 epic3" --> epic_spec: epic1-epic3 范围格式; "全部重跑" --> filter: all（包括已完成的）

---

### 示例 8: 英文 -- 预览模式

**输入:** `"just story 2-3, dry run please"`

**解析输出:**
```yaml
epic_spec: "epic2"
stories: ["2-3"]
options:
  dry_run: true
```

**解析逻辑:** "story 2-3" --> 单个 Story 指定; "dry run" --> dry_run: true

---

### 示例 9: 中英混合 -- 复杂组合

**输入:** `"epic6, medium level, 并行2个，不要 research"`

**解析输出:**
```yaml
epic_spec: "epic6"
options:
  review_strictness: "normal"
  parallel: 2
  no_research: true
```

**解析逻辑:** "medium level" --> review_strictness: normal; "并行2个" --> parallel: 2; "不要 research" --> no_research: true

---

### 示例 10: 中文 -- 预研模式

**输入:** `"先预研一下 epic7 的技术点，不用真跑"`

**解析输出:**
```yaml
epic_spec: "epic7"
options:
  pre_research: true
  dry_run: true
```

**解析逻辑:** "预研" --> pre_research: true; "不用真跑" --> dry_run: true

---

### 示例 11: 英文 -- 全面执行 + E2E

**输入:** `"epic4, all stories, enable e2e, max 5 review rounds"`

**解析输出:**
```yaml
epic_spec: "epic4"
filter: "all"
options:
  e2e: true
  max_review_rounds: 5
```

**解析逻辑:** "all stories" --> filter: all; "enable e2e" --> e2e: true; "max 5 review rounds" --> max_review_rounds: 5

---

### 示例 12: 中文 -- 宽松审查 + 跳过 Story Review

**输入:** `"跑 epic2，只修 high 级别的问题，story 审查跳过"`

**解析输出:**
```yaml
epic_spec: "epic2"
options:
  review_strictness: "lenient"
  skip_story_review: true
```

**解析逻辑:** "只修 high 级别的问题" --> review_strictness: lenient（lenient 阈值仅保留 HIGH 级别问题）; "story 审查跳过" --> skip_story_review: true

---

## Parameter Schema

所有可用参数的完整定义，包括类型、默认值、值域和描述。

```yaml
parameters:
  # ===== 核心参数 =====
  epic_spec:
    type: string
    required: true
    format: "epicN | all | epicN-epicM"
    examples: ["epic3", "all", "epic1-epic5"]
    description: "目标 Epic 标识符。epicN 指定单个 Epic；all 指定所有 Epic；epicN-epicM 指定范围"

  stories:
    type: array[string]
    required: false
    format: "N-M"
    examples: [["3-1", "3-2", "3-5"], ["2-3"]]
    description: "具体 Story 列表。指定时覆盖 filter 筛选，直接使用列表中的 Story"

  filter:
    type: string
    required: false
    default: "incomplete"
    enum: ["incomplete", "all", "backlog"]
    description: |
      Story 状态筛选模式:
      - incomplete: 排除 done 状态的 Story（默认）
      - all: 包含所有状态（含已完成）
      - backlog: 仅包含 backlog 状态

  # ===== 执行选项 =====
  options:
    review_strictness:
      type: string
      default: "normal"                        # 来自 config.yaml defaults.review_strictness
      enum: ["strict", "normal", "lenient"]
      description: |
        Code Review 审查严格度（用户视角语义，主控内部转换为 review_strictness_threshold 传给 C5）:
        - strict: 全面修复，修复所有 >= LOW 级别问题（最严格）
        - normal: 修复 >= MEDIUM 级别问题（默认）
        - lenient: 仅修复 HIGH 级别问题（宽松，仅关注关键缺陷）

    skip_story_review:
      type: boolean
      default: false
      description: "是否跳过 Story Review 阶段（C3 workflow）。跳过后 Story 从 backlog 直接进入 ready-for-dev"

    e2e:
      type: boolean
      default: false                           # 来自 config.yaml e2e_inspection.enabled
      description: "是否启用 E2E 浏览器验证（F2 workflow）。需要 Chrome MCP 或 Playwright MCP 可用"

    parallel:
      type: integer
      default: 1                               # 来自 config.yaml defaults.parallel
      min: 1
      description: "最大并行 Story 执行数。parallel > 1 时启用并行状态写入队列（Principle 23）"

    dry_run:
      type: boolean
      default: false
      description: "预览模式。仅展示 Story 队列和执行计划，不实际执行"

    no_research:
      type: boolean
      default: false
      description: "禁用 Knowledge Researcher（F1 workflow）。所有技术声明标记为 [unverified]"

    pre_research:
      type: boolean
      default: false
      description: "预研模式。Sprint 开始前批量执行技术研究，缓存结果供后续 Story 使用"

    max_review_rounds:
      type: integer
      default: 10                              # 来自 config.yaml defaults.max_review_rounds
      min: 1
      description: "Code Review 最大轮数。超过后根据 review_degradation 配置降级"

    max_story_review_rounds:
      type: integer
      default: 3                               # 来自 config.yaml defaults.max_story_review_rounds
      min: 1
      description: "Story Review 最大轮数。超过后根据 story_review_fallback 配置处理"
```

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | Return Status |
|---|---------------|----------------|----------|--------|--------------|
| 1 | sprint-status.yaml 不存在 | Step 4 | Fatal | 终止，提示用户检查 status_file_search_paths 配置 | `failure` |
| 2 | NL 解析无法识别 epic_spec | Step 2 | Error | 返回解析失败，提供输入建议和示例 | `failure` |
| 3 | epic_spec 对应的 Epic 在 sprint-status.yaml 中不存在 | Step 4 | Error | 终止，列出可用 Epic 供用户选择 | `failure` |
| 4 | 筛选后 Story 列表为空 | Step 4 | Warning | 不终止，在确认展示中说明原因，用户可修改 filter | N/A (继续到 Step 5) |
| 5 | YAML/JSON 精确参数格式错误 | Step 3 | Error | 返回解析错误，提示正确格式 | `failure` |
| 6 | 参数值域不合法（如 review_strictness: "ultra"） | Step 3 | Error | 返回验证错误，列出合法值域 | `failure` |
| 7 | 用户修改循环超过 5 次上限 | Step 6 | Warning | 终止修改循环，提示使用精确参数重新执行 | `rejected` |
| 8 | 指定的 Story Key 格式不合法（如 "abc"） | Step 3/4 | Error | 返回格式错误，提示正确格式 `N-M` | `failure` |
| 9 | 指定的 Story Key 在 sprint-status.yaml 中不存在 | Step 4 | Warning | 过滤掉不存在的 Key，警告用户并继续 | N/A (继续) |
| 10 | NL 解析产生矛盾参数组合 | Step 2 | Info | 在确认展示中高亮提醒，不自动修正，由用户决定 | N/A (继续) |
| 11 | sprint-status.yaml 格式损坏（无法解析 YAML） | Step 4 | Fatal | 终止，提示用户检查文件格式完整性 | `failure` |
| 12 | parallel 值超过筛选后的 Story 数量 | Step 4 | Info | 自动将 parallel 调整为 Story 数量，记录日志 | N/A (继续) |

### Timeout Configuration

- Workflow 整体超时: 无独立超时（作为 Orchestrator 内联逻辑，受 Orchestrator 会话级超时控制）
- NL 解析 LLM 推理超时: 由 LLM provider 默认超时控制（通常 60-120 秒）
- 用户确认等待: 无超时（等待用户交互，不消耗 Agent token 预算）
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）

---

## Agent Interface Alignment

本 workflow 为 Orchestrator 内联逻辑，不涉及独立 Agent 调度。

### Skill Call Parameters Mapping

N/A -- F3 不通过 Skill call 调度外部 Agent，所有步骤在 Orchestrator 进程内完成。

### Return Value Alignment

F3 的 return value 直接由 Orchestrator 内部消费，用于驱动主循环的 Story 队列调度：

| Return Field | Consumer | Usage |
|-------------|----------|-------|
| `status` | Orchestrator 主循环 | 决定是否进入 Story 调度（confirmed）、终止（rejected/failure）、或转发 F4（redirected） |
| `stories` | Orchestrator 主循环 | 构建 Story 执行队列 |
| `options` | Orchestrator 主循环 | 传递给后续 C2/C3/C4/C5/F1/F2 workflow 的运行时参数 |
| `story_details` | Orchestrator 主循环 | 用于执行报告中的 Story 信息展示 |

### State Transition Alignment

N/A -- F3 不触发任何 sprint-status.yaml 状态转换。F3 完成后 Orchestrator 根据 `status` 决定后续流程，而非更新 Story 状态。

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Default parameters (用于未指定参数时的默认值填充)
defaults.parallel                             # Step 3: 默认并行度 (1)
defaults.review_strictness                    # Step 3: 默认审查严格度 ("normal")
defaults.max_review_rounds                    # Step 3: 默认 Code Review 最大轮数 (10)
defaults.max_story_review_rounds              # Step 3: 默认 Story Review 最大轮数 (3)

# E2E inspection (用于 e2e 参数默认值)
e2e_inspection.enabled                        # Step 3: E2E 默认开关 (false)

# Status file (用于定位 sprint-status.yaml)
status_file_search_paths                      # Step 4: 状态文件查找路径列表

# Knowledge research (用于 no_research / pre_research 参数关联)
knowledge_research.enabled                    # Step 3: Knowledge Researcher 默认开关 (true)
```

### Configuration Resolution Priority

当用户输入、NL 解析结果和 config.yaml 默认值存在冲突时，按以下优先级解析:

```
用户显式指定 (NL 或精确参数) > config_overrides > config.yaml defaults
```

---

## Workflow Sequence Diagram

```
User                    Orchestrator (F3 Inline)              sprint-status.yaml
 |                              |                                    |
 |--- raw_input -------------->|                                    |
 |                              |                                    |
 |                      Step 1: Input Classification                |
 |                              |                                    |
 |                      [路径A: Interactive]                         |
 |                              |--- return: redirected --> F4       |
 |                              |                                    |
 |                      [路径B: Precise]                             |
 |                              |--- skip to Step 3 -->              |
 |                              |                                    |
 |                      [路径C: Natural Language]                    |
 |                              |                                    |
 |                      Step 2: NL Parsing                           |
 |                        (LLM 推理提取意图)                          |
 |                              |                                    |
 |                      Step 3: Parameter Mapping                    |
 |                        (映射 + 默认值填充 + 验证)                   |
 |                              |                                    |
 |                      Step 4: Story List Resolution                |
 |                              |---------- read ------------------>|
 |                              |<--------- stories + details ------|
 |                              |                                    |
 |                      Step 5: Confirmation Display                 |
 |<--- 展示解析结果 ------------|                                    |
 |     + Story 列表详情          |                                    |
 |                              |                                    |
 |                      Step 6: User Confirmation                    |
 |--- confirm / modify / reject |                                    |
 |                              |                                    |
 |                      [Modify: 回到 Step 3/4/5]                    |
 |                              |                                    |
 |                      Step 7: Return                               |
 |<--- return(status, params) --|                                    |
 |                              |                                    |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 2: NL 解析置信度不足时不直接报错，而是在确认展示中标注 [推断] 供用户修正；Step 4: 指定的 Story Key 不存在时过滤并警告而非终止 |
| 3 | 预算控制一切 | Step 6: 用户修改循环上限 5 次，防止无限交互消耗 token |
| 4 | 单一状态写入入口 | Step 4: 仅读取 sprint-status.yaml，不做任何写入操作，状态文件修改权限保留给 Orchestrator 主循环 |
| 5 | 状态是唯一真实来源 | Step 4: Story 的当前状态完全依赖 sprint-status.yaml，不做任何假设或缓存 |
| 7 | 始终保留逃生舱 | Step 6: 用户可随时拒绝执行（reject）；修改参数后可重新确认；交互式触发可转发 F4；修改超限后友好退出 |
| 9 | NL 解析能力 | Step 2: 完整的自然语言解析引擎，支持中英文混合输入，提取 epic_spec / story 范围 / filter / options 等多维意图；通过置信度评估确保解析质量；12 个覆盖多场景的解析示例 |
| 10 | 确认机制 | Step 5-6: 解析结果 + Story 列表详情完整展示给用户；支持 confirm / modify / reject 三种响应；修改后自动重新解析并再次确认；确保用户对执行参数有完全控制权 |
| 17 | 执行可见性 | Step 5: 确认展示包含完整的参数列表、Story 队列表格、跳过原因、置信度标注等详细信息，确保用户充分了解即将执行的操作 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: intent-parsing.spec.md + config.yaml + module-brief-bso.md + C2 story-creation workflow (structural template)_
