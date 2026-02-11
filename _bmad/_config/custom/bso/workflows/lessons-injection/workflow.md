---
name: lessons-injection
id: U6
type: utility
description: "Read accumulated lessons from _lessons-learned.md, filter by phase, sort by recency and relevance, inject top 10 entries into agent context"
module: bso
version: 1.0.0
agent: knowledge-researcher
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Lessons Injection Workflow (U6)

> BSO Utility Workflow -- 读取 _lessons-learned.md 中积累的经验教训，按当前阶段标签过滤，按时间新旧和相关性排序，截取前 10 条（Principle 25），格式化为警告块注入 Agent 上下文。由 Knowledge Researcher Agent 执行，所有 BSO Agent 在启动时调用。

## Purpose

将历史经验教训注入 Agent 执行上下文，使系统"越用越聪明"。本 workflow 是 BSO 知识管理系统的"读取端" -- 与 Lessons Recording (U5) 的"写入端"配对工作。每个 BSO Agent 在启动时通过 Knowledge Researcher 调用本 workflow，获取与当前执行阶段相关的历史经验警告，在执行过程中主动规避已知陷阱。

## Primary Agent

**Knowledge Researcher** (`bso-knowledge-researcher`) -- 本 workflow 对应 Knowledge Researcher Agent 的 `lessons-inject` 模式。Knowledge Researcher 在收到 `mode: "lessons-inject"` 的 Skill Call 时执行本 workflow。

## Callers / Consumers

| Caller | 调用场景 | Phase Tag |
|--------|---------|-----------|
| Story Creator (C2) | Story 创建前注入经验 | `story-creation` |
| Story Reviewer (C3) | Story 审查前注入经验 | `story-review` |
| Dev Runner (C4) | 开发执行前注入经验 | `dev-execution` |
| Review Runner (C5) | 代码审查前注入经验 | `code-review` |
| E2E Inspector (F2) | E2E 验证前注入经验 | `e2e-inspection` |

> **Note:** 所有 BSO Agent 在启动的第 3 步（file-read protocol step 3）调用本 workflow。

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # 当前 Story 标识符
    mode: "lessons-inject"                    # 固定值，与 Knowledge Researcher 模式对齐
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
    lessons_inject:
      phase: "dev-execution"                  # 当前阶段标签（用于过滤）
  optional:
    config_overrides:
      injection_budget: 10                    # 覆盖默认注入预算（默认 10）
    context_hints:                            # 可选的上下文提示，用于相关性排序
      framework: "vue-easytable"
      topic: "virtual scrolling"
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配格式 `\d+-\d+` | 返回空注入（降级，非错误） |
| `mode` | 值为 `"lessons-inject"` | abort, status: "failure" |
| `session_id` | 非空字符串 | 返回空注入（降级，非错误） |
| `lessons_inject.phase` | 值为 5 种有效 phase tag 之一 | 返回空注入（降级，非错误） |

> **Note:** 输入验证尽量宽松 -- 注入失败时返回空结果，不阻断 Agent 启动（Principle 2）。

---

## Output Schema (Return Value)

### 与 Knowledge Researcher Agent 完全对齐

本 workflow 的 Return Value 与 Knowledge Researcher Agent 的 `lessons-inject` 模式 Return Value Schema **完全一致**：

```yaml
# Lessons-inject mode return (aligned with Knowledge Researcher Agent)
return:
  status: "success" | "empty" | "failure"
  story_key: "3-1"
  mode: "lessons-inject"
  session_id: "sprint-2026-02-07-001"
  results:
    phase: "dev-execution"
    total_lessons_found: 25                   # 文件中的总条目数
    phase_filtered_count: 8                   # phase 过滤后的条目数
    injected_count: 8                         # 实际注入的条目数（≤ injection_budget）
    injection_block: |                        # 格式化的注入内容块
      [LESSONS] dev-execution phase warnings:
      1. vue-easytable virtual scrolling 必须显式设置 row-height prop，否则渲染空白行. Ref: src/components/YokoEasyTable.vue:142
      2. JeecgBoot defHttp 已自动拆包 ApiResponse，不要重复访问 .result 字段. Ref: src/views/project/ProjectList.vue:85
      3. MyBatis-Plus JSONB 字段需要 @TableField(typeHandler = JacksonTypeHandler.class) 注解. Ref: src/main/java/org/jeecg/modules/project/entity/Project.java:58
      ...
  errors: []
```

### Return Value Alignment Verification

| Workflow Return Field | Knowledge Researcher Agent Field | Type | Match |
|----------------------|--------------------------------|------|-------|
| `status` | `status` | enum: success/empty/failure | Yes |
| `story_key` | `story_key` | string | Yes |
| `mode` | `mode` | literal: "lessons-inject" | Yes |
| `session_id` | `session_id` | string | Yes |
| `results.phase` | `results.phase` | string | Yes |
| `results.total_lessons_found` | `results.total_lessons_found` | integer | Yes |
| `results.phase_filtered_count` | `results.phase_filtered_count` | integer | Yes |
| `results.injected_count` | `results.injected_count` | integer | Yes |
| `results.injection_block` | `results.injection_block` | multiline string | Yes |
| `errors` | `errors` | array | Yes |

---

## Valid Phase Tags

| Tag | Agent Consumer | 描述 |
|-----|---------------|------|
| `story-creation` | Story Creator | Story 创建阶段的经验（AC 编写、任务拆分陷阱） |
| `story-review` | Story Reviewer | Story 审查阶段的经验（审查标准、常见质量问题） |
| `dev-execution` | Dev Runner | 开发执行阶段的经验（API 陷阱、框架用法、TDD 模式） |
| `code-review` | Review Runner | 代码审查阶段的经验（常见 Bug 模式、安全问题） |
| `e2e-inspection` | E2E Inspector | E2E 验证阶段的经验（浏览器兼容性、等待策略） |

---

## Workflow Steps

### Step 1: Locate Lessons File

**Goal:** 定位 `_lessons-learned.md` 文件。

**Actions:**
1. 构建文件路径: `{knowledge_base_path}/lessons/_lessons-learned.md`
   - `knowledge_base_path` 来自 `config.yaml` 的 `knowledge_research.knowledge_base_path`
2. 检查文件是否存在
3. 如果不存在 --> 返回空注入（正常情况，首次运行或零经验）

**On Success:** 文件路径确定，继续 Step 2
**On File Not Found:**
```yaml
return:
  status: "empty"
  results:
    phase: "dev-execution"
    total_lessons_found: 0
    phase_filtered_count: 0
    injected_count: 0
    injection_block: ""
  errors: []
```

---

### Step 2: Read and Parse Entries

**Goal:** 读取 `_lessons-learned.md`，解析所有经验条目。

**Actions:**
1. 读取文件全部内容
2. 按行解析，识别以 `- [` 开头的行为经验条目
3. 对每个条目解析结构化字段：
   - `date`: 提取 `[YYYY-MM-DD]` 日期
   - `phase`: 提取 `[phase-tag]` 阶段标签
   - `summary`: 提取摘要文本（date 和 phase tag 之后的内容）
   - `ref`: 提取 `Ref: file/path:line` 引用（如有）
4. 跳过非条目行（标题、空行、注释等）
5. 构建解析后的条目列表

**Parse Format:**
```
Input:  - [2026-02-07] [dev-execution] vue-easytable 必须设置 row-height. Ref: src/components/X.vue:142
Output: { date: "2026-02-07", phase: "dev-execution", summary: "vue-easytable 必须设置 row-height", ref: "src/components/X.vue:142" }
```

**On Success:** 条目列表就绪（可能为空），继续 Step 3
**On Parse Error:**
- 单条解析失败 --> 跳过该条目，log 警告，继续解析
- 文件完全无法解析 --> 返回空注入

---

### Step 3: Phase Filter

**Goal:** 按当前阶段标签过滤条目。

**Actions:**
1. 从输入中获取 `lessons_inject.phase` 值
2. 遍历所有解析后的条目
3. 筛选 `phase` 字段与输入 phase 完全匹配的条目
4. 记录过滤前后的数量

**Filter Logic:**
```
Input phase: "dev-execution"
Entry phase: "[dev-execution]" --> MATCH
Entry phase: "[code-review]"   --> SKIP
Entry phase: "[story-creation]"--> SKIP
```

**On Success:** 过滤后的条目列表就绪，继续 Step 4
**On Zero Matches:**
```yaml
return:
  status: "empty"
  results:
    phase: "dev-execution"
    total_lessons_found: 25
    phase_filtered_count: 0
    injected_count: 0
    injection_block: ""
  errors: []
```

---

### Step 4: Sort by Recency and Relevance

**Goal:** 按时间新旧和相关性对过滤后的条目排序。

**Actions:**
1. **Primary sort -- Recency（最新优先）:**
   - 按 `date` 字段降序排列
   - 相同日期的条目保持原始顺序
2. **Secondary sort -- Relevance（相关性优先）:**
   - 如果提供了 `context_hints`（framework/topic）：
     a. 计算每条摘要与 context_hints 的关键词匹配度
     b. 匹配度高的条目在相同日期内优先排列
   - 如果未提供 `context_hints`：
     a. 仅按 recency 排序

**Relevance Scoring (Optional):**
```
context_hints: { framework: "vue-easytable", topic: "virtual scrolling" }
Entry: "vue-easytable virtual scrolling 必须设置 row-height" --> relevance: HIGH (2 keywords match)
Entry: "MyBatis-Plus JSONB 字段需要注解"                     --> relevance: LOW (0 keywords match)
```

**On Success:** 排序后的条目列表就绪，继续 Step 5

---

### Step 5: Apply Injection Budget (Principle 25)

**Goal:** 截取排序后的前 N 条条目，N = injection_budget（默认 10）。

**Actions:**
1. 确定注入预算：
   - 默认值: 10（Principle 25 隐含默认值，`config.yaml` 中未显式声明）
   - 可通过 `config_overrides.injection_budget` 覆盖
2. 从排序后的列表中截取前 N 条
3. 如果条目数 < N --> 使用全部条目（不足 10 条也正常）
4. 记录截取前后的数量

**Budget Application:**
```
Sorted entries: 15 entries
Injection budget: 10
Result: top 10 entries selected, 5 entries dropped
```

**On Success:** 预算截取后的最终条目列表就绪，继续 Step 6

---

### Step 6: Format Injection Block

**Goal:** 将最终条目列表格式化为可注入 Agent 上下文的警告块。

**Actions:**
1. 构建注入块头部：
   ```
   [LESSONS] {phase} phase warnings:
   ```
2. 逐条编号格式化：
   ```
   {N}. {summary}. Ref: {ref}
   ```
   - 如果无 `ref` --> 省略 `Ref:` 部分
   - 每条 ≤ 2 行
3. 组装完整的 injection_block 字符串

**Format Example:**
```
[LESSONS] dev-execution phase warnings:
1. vue-easytable virtual scrolling 必须显式设置 row-height prop，否则渲染空白行. Ref: src/components/YokoEasyTable.vue:142
2. JeecgBoot defHttp 已自动拆包 ApiResponse，不要重复访问 .result 字段. Ref: src/views/project/ProjectList.vue:85
3. MyBatis-Plus 分页查询必须使用 Page 对象，直接 List 查询不支持分页参数. Ref: src/main/java/org/jeecg/modules/project/mapper/ProjectMapper.java:23
```

**Format Constraints:**
- 每条 ≤ 2 行（通常单行）
- 编号从 1 开始连续递增
- 使用中文描述 + 英文技术术语
- 头部固定格式: `[LESSONS] {phase} phase warnings:`

**On Success:** injection_block 就绪，继续 Step 7

---

### Step 7: Return

**Goal:** 向调用方返回注入结果，格式与 Knowledge Researcher Agent 的 lessons-inject 模式完全对齐。

**Actions:**
1. 组装 return value：
   - `status`: "success"（有条目注入）或 "empty"（零条目匹配）
   - `results.phase`: 输入的 phase 值
   - `results.total_lessons_found`: 文件中的总条目数
   - `results.phase_filtered_count`: phase 过滤后的条目数
   - `results.injected_count`: 实际注入数（≤ injection_budget）
   - `results.injection_block`: 格式化的注入内容块
2. 返回给调用方（通常是另一个 BSO Agent 的启动流程）

**Status Mapping:**
| Scenario | Status |
|----------|--------|
| 有条目注入（injected_count > 0） | `success` |
| 零条目匹配（phase_filtered_count == 0） | `empty` |
| 文件不存在（total_lessons_found == 0） | `empty` |
| 处理过程中出错 | `failure` |

**Return:**
```yaml
return:
  status: "success"
  story_key: "3-1"
  mode: "lessons-inject"
  session_id: "sprint-2026-02-07-001"
  results:
    phase: "dev-execution"
    total_lessons_found: 25
    phase_filtered_count: 8
    injected_count: 8
    injection_block: |
      [LESSONS] dev-execution phase warnings:
      1. vue-easytable virtual scrolling 必须显式设置 row-height prop...
      ...
  errors: []
```

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| `_lessons-learned.md` 不存在 | Step 1 | Info | 返回空注入（首次运行正常情况） | `empty` |
| 文件读取权限不足 | Step 2 | Warning | 返回空注入，log 权限警告 | `empty` |
| 单条条目解析失败 | Step 2 | Warning | 跳过该条目，继续解析其余 | N/A (继续) |
| 文件完全无法解析 | Step 2 | Warning | 返回空注入 | `empty` |
| 零条目匹配 phase 过滤 | Step 3 | Info | 返回空注入（正常情况，非错误） | `empty` |
| 无效的 phase tag | Input Validation | Warning | 返回空注入（降级，非错误） | `empty` |
| context_hints 格式错误 | Step 4 | Warning | 忽略 context_hints，仅按 recency 排序 | N/A (继续) |
| injection_budget ≤ 0 | Step 5 | Warning | 使用默认值 10 | N/A (继续) |
| injection_block 格式化失败 | Step 6 | Error | 返回空注入 | `failure` |
| 文件被外部进程修改（并发读取） | Step 2 | Warning | 使用已读取的快照，不重试 | N/A (继续) |

### Timeout Configuration

- 本 workflow 为轻量级文件读取 + 解析操作，无外部网络调用，通常在数秒内完成
- 无独立超时配置 -- 由调用方 Agent 的整体超时覆盖（如 `agent_timeout_seconds.story_creation: 900`）
- 超时处理: 由调用方 Agent 的 Orchestrator 超时机制统一管理

### Failure Isolation

本 workflow 的失败**绝不阻断 Agent 启动**。所有 BSO Agent 在调用 lessons injection 时使用降级模式：
- 注入成功 --> Agent 获得历史经验警告
- 注入返回空 --> Agent 以零经验启动（正常运行，只是没有历史提示）
- 注入失败 --> Agent 以零经验启动，log 警告

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项：

```yaml
# Knowledge base path
knowledge_research.knowledge_base_path       # Step 1: _lessons-learned.md 所在目录
  # 默认: "{output_folder}/knowledge-base"
  # 完整文件路径: "{knowledge_base_path}/lessons/_lessons-learned.md"

# Knowledge research enabled
knowledge_research.enabled                    # 总开关 — false 时跳过注入
  # 默认: true

# Lessons injection budget (implicit in module brief)
# lessons_injection_budget: 10               # Step 5: 每次注入的最大条目数
  # 默认: 10 (Principle 25)
  # 可通过 config_overrides.injection_budget 覆盖

# Valid phase tags (implicit, defined by state machine)
# story-creation, story-review, dev-execution, code-review, e2e-inspection
```

---

## Integration with Knowledge Researcher Agent

本 workflow 是 Knowledge Researcher Agent 的 `lessons-inject` 模式的具体执行逻辑。对齐关系如下：

### Mode Alignment

| Aspect | Knowledge Researcher Agent | This Workflow (U6) |
|--------|---------------------------|---------------------|
| Mode | `lessons-inject` | `lessons-inject` |
| Trigger | Skill Call with `mode: "lessons-inject"` | Agent 内部执行本 workflow |
| Input | `lessons_inject.phase` | `lessons_inject.phase` |
| Output | Return Value Schema (见 Agent 定义) | Return Value Schema (完全对齐) |
| Budget | Max 10 entries | Max 10 entries (Principle 25) |
| Phase Tags | 5 种 | 5 种（完全一致） |

### Execution Context

```
Agent Startup Protocol (all BSO agents):
  Step 1: Read sprint-status.yaml
  Step 2: Read Story .md file
  Step 3: Lessons Injection ← Knowledge Researcher executes U6 here
  Step 4: Read knowledge cache index.yaml
  Step 5: Begin execution
```

Knowledge Researcher 在收到 `mode: "lessons-inject"` 时：
1. 跳过 Persona Loading（见 knowledge-research workflow LI-Step 0 设计决策：Lessons-Inject 模式的操作均为确定性数据处理，不涉及需要 Architect 领域专长的研究判断，因此跳过以降低执行开销）
2. 执行本 workflow 的 Step 1-7
3. 返回 injection_block 给调用方
4. 调用方将 injection_block 注入自己的执行上下文

---

## Workflow Sequence Diagram

```
Requesting Agent          Knowledge Researcher          _lessons-learned.md
    |                            |                             |
    |--- lessons-inject -------->|                             |
    |    (phase: dev-execution)  |                             |
    |                            |                             |
    |                    Step 1: Locate File                   |
    |                            |--- read ------------------>|
    |                            |<--- file content ----------|
    |                            |                             |
    |                    Step 2: Parse Entries                  |
    |                    (extract date, phase, summary, ref)   |
    |                            |                             |
    |                    Step 3: Phase Filter                   |
    |                    (keep only [dev-execution])           |
    |                            |                             |
    |                    Step 4: Sort (recency + relevance)    |
    |                            |                             |
    |                    Step 5: Apply Budget (top 10)         |
    |                            |                             |
    |                    Step 6: Format Injection Block        |
    |                    ([LESSONS] dev-execution phase...)    |
    |                            |                             |
    |                    Step 7: Return                        |
    |                            |                             |
    |<--- return(status, --------|                             |
    |     injection_block)       |                             |
    |                            |                             |
    | [inject into own context]  |                             |
    | [begin execution with      |                             |
    |  lessons awareness]        |                             |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 25 | Lessons 注入预算 | Step 5: 严格限制每次注入最多 10 条，防止 prompt token 膨胀 |
| 2 | 降级优于报错 | 文件不存在、零匹配、解析失败均返回空注入而非错误，不阻断 Agent 启动 |
| 3 | 预算控制一切 | injection_budget 可配置，默认 10，所有截取在 Step 5 统一执行 |
| 16 | 知识容量管理 | 与 U5 配合：U5 控制写入质量（≤ 2 行），U6 控制读取数量（≤ 10 条） |
| 8 | Headless Persona Loading | Knowledge Researcher 在 lessons-inject 模式下跳过 Persona Loading（确定性数据处理，无需 Architect 领域专长），直接执行 Step 1-7 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Source: lessons-injection.spec.md + knowledge-researcher agent + config.yaml + module-brief-bso.md (Principle 25)_
