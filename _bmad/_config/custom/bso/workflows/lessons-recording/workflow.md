---
name: lessons-recording
id: U5
description: "Capture error events from agent execution, distill into actionable lessons, and append to _lessons-learned.md"
module: bso
type: utility
agent: orchestrator
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Lessons Recording Workflow (U5)

> BSO Utility Workflow -- 在 Agent 返回错误后，从返回值中检测错误事件类型，将错误上下文压缩为不超过 2 行的可执行摘要，追加写入 _lessons-learned.md。由 Orchestrator 在 Agent 返回错误后内联调用。

## Purpose

将 Sprint 执行过程中的错误模式转化为持久化的经验教训。本 workflow 是 BSO 知识管理系统的"写入端" -- 每当 Agent 执行出现错误事件时，Orchestrator 立即触发本 workflow，将错误上下文蒸馏为超简洁的可执行经验条目，追加到 `_lessons-learned.md`。这些条目在后续 Sprint 中通过 Lessons Injection (U6) 注入 Agent 上下文，实现"系统越用越聪明"。

## Primary Agent

**Orchestrator** (`bso-sprint-orchestrator`) -- 本 workflow 作为 Orchestrator 的内联逻辑执行，不独立调度 Agent。Orchestrator 在收到 Agent 返回值后检测错误事件，直接执行本 workflow 的录制流程。

## Callers / Consumers

| Caller | 调用场景 | 频率 |
|--------|---------|------|
| Sprint Orchestrator | Agent 返回错误后内联调用 | 每次错误事件触发 |
| Lessons Injection (U6) | 读取本 workflow 产出的 `_lessons-learned.md` | 每次 Agent 启动时 |

---

## Input Schema

```yaml
inputs:
  required:
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
    story_key: "3-1"                          # 触发错误的 Story 标识符
    phase: "dev-execution"                    # 错误发生的阶段
    event_type: "review_max_rounds"           # 错误事件类型（见 Trigger Conditions）
    agent_return:                             # Agent 原始返回值
      status: "needs-fix"
      summary: "..."
      errors: [...]
  optional:
    code_paths: ["src/views/ProjectList.vue:142"]  # 相关代码路径引用
    framework_context: "vue-easytable"             # 相关框架名称
    additional_context: "..."                       # 额外上下文描述
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `session_id` | 非空字符串 | skip recording, log warning |
| `story_key` | 匹配格式 `\d+-\d+` | skip recording, log warning |
| `phase` | 值为有效阶段标签之一 | skip recording, log warning |
| `event_type` | 值为 7 种触发条件之一 | skip recording, log warning |
| `agent_return` | 非空对象，包含 status 字段 | skip recording, log warning |

> **Note:** 输入验证失败时采用 skip 策略而非 abort -- 录制失败不应影响 Sprint 主流程（Principle 2: 降级优于报错）。

---

## Trigger Conditions (7 Error Event Types)

Orchestrator 在 Agent 返回值中检测以下 7 种错误事件，触发本 workflow：

| # | Event Type ID | 触发条件 | 检测逻辑 | Phase Tag |
|---|--------------|---------|----------|-----------|
| 1 | `review_max_rounds` | 代码审查超过最大轮次 | `agent_return.status == "needs-intervention"` 且审查轮次 >= `max_review_rounds` | `code-review` |
| 2 | `dev_failure_auto_fixed` | 开发失败后自动修复成功 | `agent_return.status == "success"` 且 `agent_return.results.auto_fix_applied == true` | `dev-execution` |
| 3 | `high_severity_issues` | 代码审查发现 HIGH 严重度问题 | `agent_return.results.issues` 中存在 `severity == "HIGH"` 的条目 | `code-review` |
| 4 | `agent_needs_intervention` | Agent 标记需要人工介入 | `agent_return.status == "needs-intervention"` | 当前阶段 |
| 5 | `knowledge_researcher_timeout` | Knowledge Researcher 调用超时 | `agent_return.status == "timeout"` 且 `agent == "knowledge-researcher"` | 当前阶段 |
| 6 | `e2e_verification_failure` | E2E 浏览器验证失败 | `agent_return.status == "failure"` 且 `phase == "e2e-inspection"` | `e2e-inspection` |
| 7 | `general_agent_failure` | 任何 Agent 返回 failure 或 needs-intervention（兜底） | `agent_return.status in ["failure", "needs-intervention"]` 且不匹配上述 1-6 条件 | 当前阶段 |

### Event Detection Priority

当一次 Agent 返回同时匹配多种事件类型时：
- 按上表序号优先级排序
- 为每种匹配的事件类型创建独立的经验条目
- 单次 Agent 返回最多录制 3 条经验（防止单次错误导致 lessons 膨胀）

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - "{knowledge_base_path}/lessons/_lessons-learned.md"   # 追加写入
```

### Return Value

```yaml
return:
  status: "recorded" | "skipped" | "failure"
  session_id: "sprint-2026-02-07-001"
  story_key: "3-1"
  results:
    events_detected: 2
    entries_recorded: 2
    entries_skipped: 0
    recorded_entries:
      - date: "2026-02-07"
        phase: "code-review"
        event_type: "high_severity_issues"
        summary: "JeecgBoot defHttp 已自动拆包 ApiResponse，不要重复访问 .result 字段"
        ref: "src/views/project/ProjectList.vue:85"
      - date: "2026-02-07"
        phase: "code-review"
        event_type: "review_max_rounds"
        summary: "MyBatis-Plus 分页查询必须使用 Page 对象，直接 List 查询不支持分页参数"
        ref: "src/main/java/org/jeecg/modules/project/mapper/ProjectMapper.java:23"
    file_path: "_bmad-output/knowledge-base/lessons/_lessons-learned.md"
    total_entries_in_file: 47
  errors: []
```

---

## Workflow Steps

### Step 1: Event Detection

**Goal:** 从 Agent 返回值中识别错误事件类型。

**Actions:**
1. 接收 `agent_return` 原始返回值
2. 按 7 种 Trigger Conditions 逐一检查：
   a. 检查 `status` 字段值
   b. 检查 `results` 中的特定字段（如 `auto_fix_applied`、`issues[].severity`）
   c. 检查 `phase` 和 `agent` 标识
3. 收集所有匹配的事件类型列表
4. 如果无匹配 --> return status: "skipped"（非错误，正常情况）
5. 如果匹配数 > 3 --> 截取前 3 个（按优先级），log 截断警告

**On Detection:** 事件列表就绪，继续 Step 2
**On No Match:**
```yaml
return:
  status: "skipped"
  session_id: "{session_id}"
  story_key: "{story_key}"
  results:
    events_detected: 0
    entries_recorded: 0
    entries_skipped: 0
    recorded_entries: []
    file_path: ""
    total_entries_in_file: 0
    message: "No recordable error events detected in agent return"
  errors: []
```

---

### Step 2: Context Extraction

**Goal:** 从 Agent 返回值和输入参数中提取与错误相关的上下文信息。

**Actions:**
1. 对每个检测到的事件类型：
   a. 提取错误描述（来自 `agent_return.errors[]` 或 `agent_return.summary`）
   b. 提取相关代码路径（来自 `code_paths` 参数或 `agent_return.results.artifacts`）
   c. 提取框架/技术上下文（来自 `framework_context` 或从错误描述中推断）
   d. 提取严重度和影响范围
2. 构建 `{event_type, error_description, code_path, framework, severity}` 上下文结构

**On Success:** 上下文提取完毕，继续 Step 3
**On Partial Failure:** 部分字段缺失时使用默认值（如 code_path 为 "N/A"），继续执行

---

### Step 3: Distillation

**Goal:** 将错误上下文压缩为不超过 2 行的可执行摘要。

**Actions:**
1. 对每个事件的上下文结构：
   a. 生成一句话摘要，格式要求：
      - 直接描述"是什么"和"应该怎么做"
      - 不超过 2 行（每行 ≤ 80 字符）
      - 使用肯定语气（"需要 X" 而非 "缺少 X"）
      - 包含具体的框架/API 名称（如适用）
   b. 生成可选的代码路径引用: `Ref: file/path:line`
2. 组装最终条目格式：
   ```
   - [YYYY-MM-DD] [phase-tag] 摘要内容. Ref: file/path:line
   ```

**Distillation Rules:**
- 如果错误描述超过 2 行 --> 提炼核心要点，删除冗余细节
- 如果涉及多个文件 --> 只引用最相关的 1 个文件路径
- 如果无代码路径 --> 省略 `Ref:` 部分
- 如果框架版本相关 --> 在摘要中包含版本信息

**Output Example:**
```markdown
- [2026-02-07] [dev-execution] vue-easytable virtual scrolling 必须显式设置 row-height prop，否则渲染空白行. Ref: src/components/YokoEasyTable.vue:142
- [2026-02-07] [code-review] MyBatis-Plus JSONB 字段需要 @TableField(typeHandler = JacksonTypeHandler.class) 注解. Ref: src/main/java/org/jeecg/modules/project/entity/Project.java:58
```

**On Success:** 蒸馏条目就绪，继续 Step 4
**On Failure:** 蒸馏失败（极罕见）--> skip 该条目，log 警告

---

### Step 4: Duplicate Detection

**Goal:** 检查即将写入的经验条目是否与已有条目重复，避免冗余。

**Actions:**
1. 读取 `_lessons-learned.md` 现有内容
2. 对每个待写入条目：
   a. 提取关键词（框架名、API 名、phase tag）
   b. 与已有条目进行模糊匹配：
      - 相同 phase tag + 相似摘要内容（关键词重叠 > 70%）--> 视为重复
   c. 重复条目标记为 skipped，不写入
3. 过滤后的非重复条目列表传入 Step 5

**On All Duplicates:**
```yaml
return:
  status: "skipped"
  session_id: "{session_id}"
  story_key: "{story_key}"
  results:
    events_detected: "{N}"
    entries_recorded: 0
    entries_skipped: "{N}"
    recorded_entries: []
    file_path: "{knowledge_base_path}/lessons/_lessons-learned.md"
    total_entries_in_file: "{existing_count}"
    message: "All entries already exist in _lessons-learned.md"
  errors: []
```
**On Success:** 非重复条目就绪，继续 Step 5

---

### Step 5: Append Write

**Goal:** 将蒸馏后的经验条目追加到 `_lessons-learned.md`，严格 Append-Only。

**Actions:**
1. 确定目标文件路径: `{knowledge_base_path}/lessons/_lessons-learned.md`
   - 来自 `config.yaml` 的 `knowledge_research.knowledge_base_path`
   - **路径解析规则:** `{knowledge_base_path}` 解析为项目根目录下的相对路径（默认: `_bmad-output/knowledge-base`）
   - **示例绝对路径:** `{project_root}/_bmad-output/knowledge-base/lessons/_lessons-learned.md`
2. 如果文件不存在 --> 使用 **Write tool** 创建文件并写入标题头：
   ```markdown
   # Lessons Learned

   > Auto-recorded by BSO Sprint Orchestrator. Entries are append-only.
   > Format: - [YYYY-MM-DD] [phase-tag] Summary. Ref: file/path:line

   ```
3. 使用 **Read tool** 读取文件完整内容
4. **Append-Only 规则:**
   - 只在文件末尾追加新条目
   - 绝不修改或删除已有条目
   - 绝不重排已有条目顺序
   - 每个条目占一行，以 `- ` 开头
5. 将现有内容 + 新条目拼接为完整文件内容，使用 **Write tool** 写回文件
6. **写入验证（硬性义务，不可省略）:**
   a. 使用 **Read tool** 重新读取文件
   b. 检查文件末尾是否包含刚追加的新条目（逐条检查关键词匹配）
   c. 如果验证成功 --> 输出确认日志: `[LESSONS] {entries_recorded} entries appended to _lessons-learned.md (total: {total_count} entries)`
   d. 如果验证失败 --> 重试一次（可能是并发写入冲突），仍失败则返回 status: "failure"

**On Success:** 写入验证通过，继续 Step 6
**On Failure:**
```yaml
return:
  status: "failure"
  session_id: "{session_id}"
  story_key: "{story_key}"
  results:
    events_detected: "{N}"
    entries_recorded: 0
    entries_skipped: 0
    recorded_entries: []
    file_path: "{knowledge_base_path}/lessons/_lessons-learned.md"
    total_entries_in_file: 0
  errors:
    - type: "append_write_failed"
      file_path: "{knowledge_base_path}/lessons/_lessons-learned.md"
      message: "Failed to append lesson entries to file"
```

---

### Step 6: Return

**Goal:** 向 Orchestrator 返回录制结果。

**Actions:**
1. 统计录制结果：
   - `events_detected`: 检测到的事件总数
   - `entries_recorded`: 实际写入的条目数
   - `entries_skipped`: 因重复或截断而跳过的条目数
2. 统计文件中的总条目数
3. 组装 return value 并返回

**Return:**
```yaml
return:
  status: "recorded"
  session_id: "{session_id}"
  story_key: "{story_key}"
  results:
    events_detected: 2
    entries_recorded: 2
    entries_skipped: 0
    recorded_entries: [...]
    file_path: "{knowledge_base_path}/lessons/_lessons-learned.md"
    total_entries_in_file: 47
  errors: []
```

---

## Entry Format Specification

### Standard Format

```
- [YYYY-MM-DD] [phase-tag] 摘要内容. Ref: file/path:line
```

### Format Components

| Component | Format | Required | Example |
|-----------|--------|----------|---------|
| Date | `[YYYY-MM-DD]` | Yes | `[2026-02-07]` |
| Phase Tag | `[phase-tag]` | Yes | `[dev-execution]` |
| Summary | 自然语言描述 | Yes | `vue-easytable virtual scrolling 必须显式设置 row-height prop` |
| Reference | `Ref: file/path:line` | No | `Ref: src/components/YokoEasyTable.vue:142` |

### Valid Phase Tags

| Tag | 对应阶段 | 典型触发事件 |
|-----|---------|-------------|
| `story-creation` | Story 创建阶段 | AC 模糊、技术引用无效 |
| `story-review` | Story 审查阶段 | Story 质量不达标 |
| `dev-execution` | 开发执行阶段 | 开发失败、自动修复 |
| `code-review` | 代码审查阶段 | HIGH 问题、超最大轮次 |
| `e2e-inspection` | E2E 验证阶段 | 浏览器验证失败 |

### Format Constraints

- 每条摘要 ≤ 2 行（推荐单行）
- 每行 ≤ 80 字符（软限制，允许适当超出）
- 使用中文描述技术概念，保留英文技术术语
- 使用肯定语气描述"应该怎么做"

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| 输入参数验证失败 | Input Validation | Warning | 跳过录制，log 警告（不影响主流程） | `skipped` |
| 无匹配事件类型 | Step 1 | Info | 正常返回（无事件可录制） | `skipped` |
| 上下文提取部分失败 | Step 2 | Warning | 使用默认值填充缺失字段，继续 | N/A (继续) |
| 蒸馏失败 | Step 3 | Warning | 跳过该条目，录制其余条目 | N/A (继续) |
| 所有条目重复 | Step 4 | Info | 返回 skipped，无新条目写入 | `skipped` |
| `_lessons-learned.md` 不存在 | Step 5 | Recoverable | 自动创建文件并写入标题头 | N/A (继续) |
| 文件追加写入失败 | Step 5 | Error | 报告写入错误（不影响 Sprint 主流程） | `failure` |
| 文件权限不足 | Step 5 | Error | 报告权限错误 | `failure` |
| 单次事件超过 3 条匹配 | Step 1 | Info | 截取前 3 条，log 截断警告 | N/A (继续) |
| 文件写入验证失败 | Step 5 | Error | 报告验证错误（条目可能部分写入） | `failure` |

### Failure Isolation

本 workflow 的失败**绝不影响 Sprint 主流程**。Orchestrator 在调用本 workflow 时使用 try-catch 模式：
- 录制成功 --> 继续下一个 Story
- 录制失败 --> log 警告，继续下一个 Story
- 录制本身不触发 `needs-intervention`

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项：

```yaml
# Knowledge base path
knowledge_research.knowledge_base_path       # Step 5: _lessons-learned.md 所在目录
  # 默认: "{output_folder}/knowledge-base"
  # 完整路径: "{knowledge_base_path}/lessons/_lessons-learned.md"

# Review max rounds (用于事件检测)
defaults.max_review_rounds                   # Step 1: 判断 review_max_rounds 事件
  # 默认: 10

# Max story review rounds
defaults.max_story_review_rounds             # Step 1: 判断 story review 超限
  # 默认: 3

# Agent timeout
defaults.agent_timeout_seconds               # Step 1: 各阶段超时阈值
  knowledge_research: 600                    # Knowledge Researcher 超时判断

# E2E inspection
e2e_inspection.enabled                       # Step 1: 是否检测 E2E 相关事件
```

---

## Workflow Sequence Diagram

```
Orchestrator                     Lessons Recording (U5)
    |                                    |
    | [Agent returns with error]         |
    |                                    |
    |--- record(session_id, ----------->|
    |    story_key, phase,              |
    |    event_type, agent_return)       |
    |                                    |
    |                        Step 1: Event Detection
    |                        (match against 7 trigger conditions)
    |                                    |
    |                        [no match] --> return "skipped"
    |                        [matched]  --> continue
    |                                    |
    |                        Step 2: Context Extraction
    |                        (error desc + code paths + framework)
    |                                    |
    |                        Step 3: Distillation
    |                        (compress to <= 2 line summary)
    |                                    |
    |                        Step 4: Duplicate Detection
    |                        (fuzzy match against existing entries)
    |                                    |
    |                        Step 5: Append Write
    |                        (_lessons-learned.md, append-only)
    |                                    |
    |                        Step 6: Return
    |                                    |
    |<--- return(status: recorded, ------|
    |     entries_recorded: N)           |
    |                                    |
    | [continue Sprint execution]        |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 25 | Lessons 注入预算 | 本 workflow 产出的条目格式（≤ 2 行、含 phase tag）直接服务于 U6 的 phase 过滤和 top-10 截取 |
| 2 | 降级优于报错 | 录制失败不影响 Sprint 主流程；输入验证失败采用 skip 而非 abort |
| 3 | 预算控制一切 | 单次 Agent 返回最多录制 3 条经验，防止单次错误导致 lessons 膨胀 |
| 17 | 执行可见性 | 每条经验记录都包含日期、阶段、摘要和代码引用，提供完整的错误追溯链 |
| 4 | 单一状态写入入口 | Append-Only 规则确保已有经验不被修改或删除，只有 Orchestrator 通过本 workflow 写入 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (Round 3)_
_Source: lessons-recording.spec.md + config.yaml + module-brief-bso.md (Principle 25)_
