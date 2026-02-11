---
name: knowledge-research
id: F1
description: "Multi-source technical research with intelligent caching, version-aware invalidation, LRU capacity management, and phase-filtered lessons injection"
module: bso
agent: bso-knowledge-researcher
type: feature
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Knowledge Research Workflow (F1)

> BSO Feature Workflow -- 多源技术研究引擎与知识缓存管理器。支持双模式运行：`research` 模式执行 Context7 -> DeepWiki -> WebSearch 优先级链研究并生成标准化报告；`lessons-inject` 模式从经验库中按阶段过滤、排序并注入历史经验。所有外部调用受预算控制，缓存命中零网络延迟，降级优于报错。

## Purpose

为 BSO 全部 Agent 提供按需技术研究服务和经验注入能力。Knowledge Researcher 是一个无状态的共享服务 Agent，不参与 Story 生命周期状态转换，仅响应其他 Agent 的按需调用请求。核心职责：

1. **技术研究 (research):** 接收技术问题，先查缓存，缓存未命中时按 Context7 -> DeepWiki -> WebSearch 优先级链执行研究，生成标准化 markdown 报告并写入知识库
2. **经验注入 (lessons-inject):** 从 `_lessons-learned.md` 中按阶段标签过滤经验条目，按 recency + relevance 排序后截取 top 10 注入调用方上下文
3. **缓存生命周期管理:** 200 条上限 LRU 淘汰、30 天 TTL 标记 stale、60 天无访问自动归档、主版本变更感知失效

## Primary Agent

**Knowledge Researcher** (`bso-knowledge-researcher`) -- 使用 BMM Architect (Winston) persona 知识，headless 模式运行。具备分布式系统、云架构模式、框架评估方法论等领域专长。

## Supporting Agents

无。Knowledge Researcher 是被动服务型 Agent，不调度其他 Agent。所有 BSO Agent 均可按需触发本 workflow。

---

## Input Schema

### Research 模式

```yaml
inputs:
  required:
    story_key: "3-1"                          # Epic-Story 标识符（格式: {epic}-{story}）
    mode: "research"                          # 固定值 "research"
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
    research_query:
      framework: "vue-easytable"              # 框架/库名称
      framework_version: "2.x"               # 当前项目使用的版本
      topic: "virtual scrolling configuration" # 研究主题描述
      tags: ["virtual-scroll", "row-height", "performance"]  # 模糊匹配标签
      question: "How to configure virtual scrolling with dynamic row heights?"  # 具体技术问题
  optional:
    config_overrides:
      max_calls: 3                            # 覆盖 max_calls_per_story
      timeout_seconds: 600                    # 覆盖单次调用超时
```

### Lessons-Inject 模式

```yaml
inputs:
  required:
    story_key: "3-1"                          # Epic-Story 标识符
    mode: "lessons-inject"                    # 固定值 "lessons-inject"
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
    lessons_inject:
      phase: "dev-execution"                  # 阶段标签，可选值见下方
  optional:
    config_overrides: {}                      # 运行时配置覆盖
```

**合法阶段标签:** `story-creation`, `story-review`, `dev-execution`, `code-review`, `e2e-inspection`

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配格式 `\d+-\d+` | abort, status: "failure" |
| `session_id` | 非空字符串 | abort, status: "failure" |
| `mode` | 值为 "research" 或 "lessons-inject" | abort, status: "failure", error: "Invalid mode" |
| `research_query.framework` | 非空字符串（research 模式必填） | abort, status: "failure" |
| `research_query.framework_version` | 非空字符串，格式如 "2.x"（research 模式必填） | abort, status: "failure" |
| `research_query.topic` | 非空字符串（research 模式必填） | abort, status: "failure" |
| `research_query.tags` | 非空数组，至少 1 个标签（research 模式必填） | abort, status: "failure" |
| `research_query.question` | 非空字符串（research 模式必填） | abort, status: "failure" |
| `lessons_inject.phase` | 值在合法阶段标签列表中（lessons-inject 模式必填） | abort, status: "failure", error: "Invalid phase tag" |
| `config_overrides.max_calls` | 正整数，默认 3 | 使用默认值 |
| `config_overrides.timeout_seconds` | 正整数，默认 600 | 使用默认值 |

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    # Research 模式
    - "knowledge-base/frameworks/{framework}/{topic}.md"   # 研究报告（新建或覆盖）
    - "knowledge-base/index.yaml"                          # 索引更新（新增或更新条目）
    - "knowledge-base/_archived-index.yaml"                # 归档索引（LRU 淘汰时更新）
    # Lessons-Inject 模式
    - (无文件输出 — 经验内容通过 return value 返回)
```

### Return Value -- Research 模式

```yaml
return:
  status: "success" | "partial" | "cache-hit" | "degraded" | "budget-exhausted" | "timeout" | "failure"
  story_key: "3-1"
  mode: "research"
  session_id: "sprint-2026-02-07-001"
  results:
    cache_hit: true | false
    cache_entry_id: "vue-easytable-virtual-scroll"
    report_path: "frameworks/vue-easytable/virtual-scroll.md"
    confidence: "high" | "medium" | "low"
    sources_consulted:
      - source: "context7"
        status: "success" | "unavailable" | "timeout" | "skipped"
        url: "https://context7.com/..."
      - source: "deepwiki"
        status: "skipped"
        url: null
      - source: "web_search"
        status: "skipped"
        url: null
    budget_remaining: 2
    degradation_notes: []
    index_updated: true
    index_count: 145
    lru_evicted: 0
  errors: []
```

### Return Value -- Lessons-Inject 模式

```yaml
return:
  status: "success" | "empty" | "failure"
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
      1. vue-easytable virtual scrolling needs explicit row-height -- src/components/DataGrid.vue
      2. JeecgBoot defHttp auto-unwraps ApiResponse -- do not double-access .result
      ...
  errors: []
```

---

## State Preconditions

Knowledge Researcher 是**无状态服务型 Agent**，不要求调用方 Story 处于特定状态。任何 Agent 在任何 Story 生命周期阶段均可触发本 workflow。

唯一前置条件：`knowledge_research.enabled: true`（来自 config.yaml）。若 `enabled: false`，立即返回 `status: "failure"`, `error: "Knowledge research disabled in config"`。

## State Transitions

**None** -- Knowledge Researcher 不参与 Story 生命周期状态转换。本 workflow 不读取也不写入 `sprint-status.yaml`。所有产出物（研究报告、缓存索引）均为知识库资产，不影响 Story 状态机。

---

## Workflow Steps (Research 模式)

### Step 1: Request Parsing & Validation

**Goal:** 解析并验证输入参数，确定运行模式，初始化预算计数器。

**Actions:**
1. 解析 `mode` 字段，确定执行路径：
   - `mode: "research"` --> 执行 Research 模式 Steps 1-9
   - `mode: "lessons-inject"` --> 跳转至 Lessons-Inject 模式 Steps LI-1 至 LI-4
2. 验证所有 required 字段（见 Input Validation Rules 表）
3. 初始化预算计数器：
   - `budget_remaining = config_overrides.max_calls || knowledge_research.max_calls_per_story`（默认 3）
   - `timeout_per_call = config_overrides.timeout_seconds || knowledge_research.timeout_seconds`（默认 600）
4. 验证 `knowledge_research.enabled == true`
5. 初始化 `degradation_notes: []` 和 `errors: []` 收集器

**On Success:** 继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "validation_error"
      field: "{failed_field}"
      message: "Validation failed: {detail}"
```

---

### Step 2: Cache Check

**Goal:** 在 `index.yaml` 中通过模糊匹配查找是否存在可用的缓存条目，避免不必要的网络调用（Principle 16）。

**Actions:**
1. 读取 `{knowledge_base_path}/index.yaml`
   - 文件不存在 --> 视为 cache miss，记录 info 日志，继续 Step 4
2. 对所有条目执行模糊匹配（`cache_fuzzy_match: true`）：
   a. **framework 精确匹配:** `entry.framework == research_query.framework`
   b. **topic 相似度匹配:** `entry.topic` 与 `research_query.topic` 的关键词重叠度 >= 70%
   c. **tags 交集匹配:** `entry.tags` 与 `research_query.tags` 交集 >= 1 个标签
   d. 匹配优先级: framework + topic + tags 全匹配 > framework + topic > framework + tags
3. 匹配到候选条目后，执行**版本感知检查**：
   a. 提取 `entry.framework_version` 的主版本号（如 "2.x" --> 2）
   b. 提取 `research_query.framework_version` 的主版本号
   c. 主版本号不一致 --> 标记条目 `status: "stale"`
4. 检查 TTL：
   a. `entry.last_accessed` 距今 > 30 天 --> 标记 `status: "stale"`
   b. `entry.last_accessed` 距今 > 60 天 --> 标记 `status: "archived"`（将在 Step 8 处理）
5. 判定最终匹配结果：
   - **FRESH HIT:** `status == "fresh"` 且主版本一致 --> Step 3 (Cache Hit Fast Path)
   - **STALE HIT:** `status == "stale"` --> 继续 Step 4，但保留 stale 报告作为 baseline context
   - **MISS:** 无匹配条目 --> 继续 Step 4

**On Success (any path):** 继续 Step 3 或 Step 4
**On Failure (index.yaml 读取失败):** 记录警告，视为 cache miss，继续 Step 4（Principle 2: 降级优于报错）

---

### Step 3: Cache Hit Fast Path

**Goal:** 缓存命中时立即返回，实现零网络延迟。缓存命中不消耗研究预算。

**Precondition:** Step 2 判定为 FRESH HIT

**Actions:**
1. 更新匹配条目的 `last_accessed` 为当前日期
   - 若 `parallel > 1`，`index.yaml` 写入通过 Orchestrator 序列化写入队列（Principle 23）
2. 读取 `entry.path` 指向的缓存报告文件
3. 验证报告文件存在且非空
   - 文件不存在 --> 从 index 中移除该条目，视为 cache miss，回退到 Step 4
4. 组装 return value 并立即返回

**Return Value:**
```yaml
return:
  status: "cache-hit"
  results:
    cache_hit: true
    cache_entry_id: "{entry.id}"
    report_path: "{entry.path}"
    confidence: "high"            # 缓存报告继承原始置信度
    sources_consulted: []         # 无新的外部调用
    budget_remaining: {unchanged} # 缓存命中不消耗预算
    degradation_notes: []
    index_updated: true           # last_accessed 已更新
    index_count: {current_count}
    lru_evicted: 0
```

**On Cache File Missing:** 回退到 Step 4（视为 cache miss）

---

### Step 4: Headless Persona Load

**Goal:** 加载 BMM Architect (Winston) persona 知识，获取框架评估方法论和技术研究纪律，同时避免触发交互式行为（Principle 8）。

**Precondition:** Step 2 判定为 STALE HIT 或 MISS

**Actions:**
1. 通过 Skill call 加载 BMM Architect persona
   - Persona ID: `bmad:bmm:agents:architect`（来自 `config.yaml` 的 `role_mapping.knowledge_researcher_persona`）
2. 立即声明 YOLO/automation 模式
   - 跳过菜单显示和用户交互
   - 不验证特定激活信号
3. 通过 Skill call 返回值验证加载成功
4. Persona 知识和原则注入到上下文中：
   - 框架评估纪律（技术选型对比方法论）
   - 置信度分级标准（official docs vs community examples vs partial coverage）
   - 源码引用规范（source URL 必须附带）

**On Success:** Persona 知识就绪，继续 Step 5
**On Failure:**
- Persona 加载失败 --> 回退到 BSO 内置精简 persona（lean persona fallback）
- 记录警告: "BMM Architect persona load failed, using lean persona"
- `degradation_notes.push("persona_load_failed: using lean persona")`
- 继续执行（Principle 2: 降级优于报错）

---

### Step 5: Research Execution

**Goal:** 按 Context7 -> DeepWiki -> WebSearch 优先级链执行技术研究，受预算和超时控制。

**Precondition:** `budget_remaining > 0`。若 `budget_remaining == 0`，跳过本步骤，使用 stale cache（若有）或返回 `status: "budget-exhausted"`。

**Actions:**
1. **初始化 stale baseline:** 若 Step 2 有 STALE HIT，读取 stale 报告作为 baseline context
2. **Research Priority Chain（降级链）:**

   **a. Context7 MCP（预算消耗: 1 call）**
   - 调用 `resolve-library-id`（参数: `research_query.framework`）
   - 若成功 --> 调用 `query-docs`（参数: `research_query.question`）
   - 超时上限: `timeout_per_call` 秒
   - 成功 --> 收集结果，`budget_remaining -= 1`，跳到 Step 6
   - 失败/超时/不可用 --> `degradation_notes.push("context7: {reason}")`，继续下一级

   **b. DeepWiki MCP（预算消耗: 1 call）**
   - 调用 DeepWiki 查询接口（参数: `research_query.framework` + `research_query.question`）
   - 超时上限: `timeout_per_call` 秒
   - 成功 --> 收集结果，`budget_remaining -= 1`，跳到 Step 6
   - 失败/超时/不可用 --> `degradation_notes.push("deepwiki: {reason}")`，继续下一级

   **c. WebSearch + WebFetch（预算消耗: 1 call）**
   - 构造搜索查询: `"{framework} {framework_version} {question}"`
   - 调用 WebSearch 获取搜索结果
   - 对 top 3 结果调用 WebFetch 提取内容
   - 超时上限: `timeout_per_call` 秒
   - 成功 --> 收集结果，`budget_remaining -= 1`，跳到 Step 6
   - 失败/超时/不可用 --> `degradation_notes.push("web_search: {reason}")`

   **d. 全部不可用**
   - 若有 stale baseline --> 使用 stale 内容，`degradation_notes.push("all_sources_unavailable: using stale cache")`
   - 若无任何内容 --> `degradation_notes.push("all_sources_unavailable: no cached content available")`
   - 继续 Step 6（生成降级报告）

3. **Budget Guard（每次外部调用前检查）:**
   - `budget_remaining == 0` --> 停止新的外部调用
   - 记录: "Research budget exhausted for story {story_key}, continuing with available context"
   - 返回已收集的部分结果（Principle 3: 预算控制一切）
   - **Cache hits 不消耗预算** -- 仅外部网络调用计数

**On Success:** 研究结果收集完毕，继续 Step 6
**On Budget Exhausted:** `status: "budget-exhausted"`，使用已有结果继续 Step 6
**On All Sources Unavailable:** `status: "degraded"`，使用 stale cache 或空内容继续 Step 6

---

### Step 6: Report Generation

**Goal:** 将研究结果生成标准化 markdown 报告，包含置信度分级和源引用。

**Actions:**
1. 生成标准化报告结构:
   ```markdown
   # {framework} - {topic}

   **Framework:** {framework}
   **Version:** {framework_version}
   **Research Date:** {today}
   **Confidence:** {high|medium|low}
   **Sources:** {source URLs}

   ## Summary
   {研究结果摘要}

   ## Details
   {详细技术说明}

   ## Code Examples
   {代码示例（如有）}

   ## Caveats & Version-Specific Notes
   {注意事项和版本特定说明}

   ## Source Attribution
   - Source 1: {url} (via {context7|deepwiki|web_search})
   - Source 2: ...
   ```

2. **置信度分级标准:**
   - `high`: 来自 Context7 官方文档 + 有代码示例
   - `medium`: 来自 DeepWiki 或多个 WebSearch 结果交叉验证
   - `low`: 仅来自单一 WebSearch 结果，或使用 stale cache，或降级内容

3. **降级场景下的报告生成:**
   - 使用 stale cache 作为基础 --> 标注 "[Based on stale cache, re-research recommended]"
   - 全部不可用 --> 生成空报告骨架，标注 "[No research results available, manual research required]"
   - 部分结果 --> 正常生成，置信度降级为 `low`

4. 确定输出文件路径: `{knowledge_base_path}/frameworks/{framework}/{topic-kebab-case}.md`

**On Success:** 报告内容就绪（内存中），继续 Step 7
**On Failure:** 不可能失败 -- 即使内容为空也生成骨架报告

---

### Step 7: Cache Write & Index Update

**Goal:** 将研究报告写入知识库文件系统，并更新 `index.yaml` 索引。

**Actions:**
1. 确保目标目录存在: `{knowledge_base_path}/frameworks/{framework}/`
   - 不存在则创建
2. 写入报告文件到确定的路径
3. 验证文件写入成功（文件存在且内容非空）
4. 更新 `index.yaml`:
   a. 若已有同 ID 条目 --> 更新 `last_accessed`、`status: "fresh"`、`framework_version`
   b. 若为新条目 --> 追加:
   ```yaml
   - id: "{framework}-{topic-kebab-case}"
     framework: "{framework}"
     framework_version: "{framework_version}"
     topic: "{topic}"
     tags: [{tags}]
     path: "frameworks/{framework}/{topic-kebab-case}.md"
     created: "{today}"
     last_accessed: "{today}"
     status: "fresh"
   ```
5. **Parallel Write Safety（Principle 23）:**
   - 若 `parallel > 1`，`index.yaml` 写入通过 Orchestrator 的序列化写入队列
   - 写入操作封装为待处理写入请求，由 Orchestrator 按 FIFO 顺序执行
   - 若 `parallel == 1`，直接写入

**On Success:** `index_updated: true`，记录 `index_count`，继续 Step 8
**On Failure (文件写入失败):**
- 记录错误到 `errors[]`
- `index_updated: false`
- 继续 Step 9（报告内容仍在内存中可返回）-- Principle 2: 降级优于报错

---

### Step 8: LRU Capacity Guard

**Goal:** 维护知识缓存的 200 条上限，执行 LRU 淘汰和自动归档（Principle 16）。

**Actions:**
1. 读取 `index.yaml`，计算当前条目总数
2. **60 天自动归档扫描:**
   - 遍历所有条目，识别 `last_accessed` 距今 > 60 天的条目
   - 将这些条目的 `status` 设为 `archived`
   - 移动到 `_archived-index.yaml`（追加，保留历史记录）
   - 从 `index.yaml` 中删除
3. **LRU 淘汰（若仍超出上限）:**
   - 若条目总数 > 200:
     a. 按 `last_accessed` 升序排序（最久未访问在前）
     b. 计算需要淘汰的条数: `evict_count = total - 200`
     c. 将最久未访问的 `evict_count` 条目:
        - `status` 设为 `archived`
        - 追加到 `_archived-index.yaml`
        - 从 `index.yaml` 中删除
     d. 记录 `lru_evicted: evict_count`
4. **Parallel Write Safety:** 同 Step 7，`parallel > 1` 时通过写入队列
5. 更新 `index_count` 为淘汰后的实际条目数

**On Success:** `lru_evicted: N`，继续 Step 9
**On Failure (index 操作失败):** 记录警告，`lru_evicted: -1`（标记未完成），继续 Step 9

---

### Step 9: Return

**Goal:** 向调用方 Agent 返回执行结果。

**Actions:**
1. 确定最终 `status`:

   | Scenario | Status |
   |----------|--------|
   | 缓存命中直接返回 | `cache-hit` |
   | 研究成功，所有源正常 | `success` |
   | 研究成功但部分源不可用 | `partial` |
   | 所有源不可用，使用 stale 或空内容 | `degraded` |
   | 预算用尽，返回部分结果 | `budget-exhausted` |
   | 单次调用超时后降级完成 | `timeout` |
   | 输入验证失败 | `failure` |

2. 组装完整 return value（见 Output Schema -- Research 模式）
3. 返回给调用方 Agent

---

## Lessons-Inject Mode Steps

### LI-Step 0: Persona Loading (Skipped by Design)

> **Design Decision:** Agent 定义中 Lessons-Inject Mode Execution Flow 第 1 步声明 "Load BMM Architect (Winston) persona via Skill call (headless)"。本 workflow 设计中，Lessons-Inject 模式的操作（文件读取、标签过滤、排序截取）均为确定性数据处理，不涉及需要 Architect 领域专长的研究判断，因此**跳过 Persona Loading 以降低执行开销**。若未来 Lessons-Inject 模式需要语义相关性排序或经验质量评估，应重新引入 Persona Loading。

---

### LI-Step 1: Read _lessons-learned.md

**Goal:** 读取经验库文件，解析所有经验条目。

**Actions:**
1. 确定经验库路径: `{knowledge_base_path}/lessons/_lessons-learned.md`
2. 读取文件内容
   - 文件不存在 --> 返回 `status: "empty"`, `injected_count: 0`
   - 文件内容为空 --> 返回 `status: "empty"`, `injected_count: 0`
3. 解析所有经验条目（每条格式: 标签 + 摘要 + 可选代码路径引用）
4. 记录 `total_lessons_found: N`

**On Success:** 继续 LI-Step 2
**On Failure (文件读取失败):**
```yaml
return:
  status: "failure"
  errors:
    - type: "file_read_error"
      message: "Failed to read _lessons-learned.md: {detail}"
```

---

### LI-Step 2: Phase Filter

**Goal:** 按调用方指定的阶段标签过滤经验条目。

**Actions:**
1. 从输入参数获取 `lessons_inject.phase`（如 `"dev-execution"`）
2. 遍历所有经验条目，筛选标签包含目标阶段的条目
   - 精确匹配: 条目标签列表中包含 `[{phase}]`
   - 例: 条目标签 `[dev-execution, vue]` 匹配 phase `"dev-execution"`
3. 记录 `phase_filtered_count: N`
4. 若 `phase_filtered_count == 0`:
   - 返回 `status: "empty"`, `injected_count: 0`, `injection_block: ""`
   - 记录 info 日志: "No lessons found for phase '{phase}'"

**On Success:** 继续 LI-Step 3
**On Empty:** 直接返回（非错误状态）

---

### LI-Step 3: Sort & Budget

**Goal:** 对过滤后的经验条目排序并截取前 10 条（Principle 25: 经验注入预算）。

**Actions:**
1. 排序规则（双重排序）:
   a. **Recency（主排序）:** 最新记录优先（按创建日期降序）
   b. **Relevance（次排序）:** 精确阶段匹配 > 部分匹配
2. 截取前 **10 条**（`lessons_injection_budget: 10`，来自 config 或 Principle 25 默认值）
   - 若不足 10 条: 全部保留
   - 若超过 10 条: 严格截取 top 10，丢弃剩余
3. 记录 `injected_count: min(phase_filtered_count, 10)`

**On Success:** 继续 LI-Step 4

---

### LI-Step 4: Format & Return

**Goal:** 将经验条目格式化为可注入上下文的警告块，返回给调用方。

**Actions:**
1. 格式化每条经验为 <= 2 行的超简洁格式:
   ```
   [LESSONS] {phase} phase warnings:
   1. {concise summary} -- {code_path_reference}
   2. {concise summary} -- {code_path_reference}
   ...
   ```
2. 添加阶段上下文标识符前缀
3. 组装 return value:

```yaml
return:
  status: "success"
  story_key: "{story_key}"
  mode: "lessons-inject"
  session_id: "{session_id}"
  results:
    phase: "{phase}"
    total_lessons_found: {total}
    phase_filtered_count: {filtered}
    injected_count: {injected}
    injection_block: "{formatted_block}"
  errors: []
```

4. 返回给调用方 Agent，由调用方自行注入到工作上下文

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | Status Returned |
|---|---------------|----------------|----------|--------|----------------|
| 1 | 输入参数验证失败（缺失必填字段） | Step 1 | Fatal | 立即终止，返回验证错误详情 | `failure` |
| 2 | `knowledge_research.enabled: false` | Step 1 | Fatal | 立即终止 | `failure` |
| 3 | `index.yaml` 文件不存在 | Step 2 | Info | 视为 cache miss，继续 | N/A (继续) |
| 4 | `index.yaml` 读取/解析失败 | Step 2 | Warning | 记录警告，视为 cache miss，继续 | N/A (继续) |
| 5 | 缓存报告文件不存在（index 条目悬空） | Step 3 | Warning | 从 index 移除该条目，回退 cache miss | N/A (继续) |
| 6 | BMM Architect Persona 加载失败 | Step 4 | Warning | 回退到精简 persona，继续 | N/A (继续) |
| 7 | Context7 MCP 不可用 | Step 5a | Warning | 跳过，尝试 DeepWiki（Principle 2） | N/A (继续) |
| 8 | DeepWiki MCP 不可用 | Step 5b | Warning | 跳过，尝试 WebSearch（Principle 2） | N/A (继续) |
| 9 | WebSearch 不可用 | Step 5c | Warning | 使用 stale cache 或空内容（Principle 2） | `degraded` |
| 10 | 所有研究源不可用 | Step 5d | Warning | 返回降级结果，附明确警告 | `degraded` |
| 11 | 单次研究调用超时（> timeout_seconds） | Step 5 | Warning | 跳过该源，尝试下一级 | `timeout` |
| 12 | 研究预算用尽（budget_remaining == 0） | Step 5 | Info | 停止新调用，返回已有结果 | `budget-exhausted` |
| 13 | 报告文件写入失败 | Step 7 | Error | 记录错误，报告内容仍可通过 return value 传递 | `partial` |
| 14 | `index.yaml` 写入失败 | Step 7 | Error | 记录错误，`index_updated: false` | `partial` |
| 15 | LRU 淘汰操作失败 | Step 8 | Warning | 记录警告，`lru_evicted: -1`，继续 | N/A (继续) |
| 16 | `_lessons-learned.md` 文件不存在 | LI-Step 1 | Info | 返回空注入 | `empty` |
| 17 | `_lessons-learned.md` 读取/解析失败 | LI-Step 1 | Error | 返回失败 | `failure` |
| 18 | 经验库中无匹配阶段的条目 | LI-Step 2 | Info | 返回空注入 | `empty` |
| 19 | Parallel > 1 时 index.yaml 写入冲突 | Step 7/8 | Warning | 通过 Orchestrator 写入队列重试（Principle 23） | N/A (继续) |
| 20 | Agent 整体超时（> agent_timeout_seconds.knowledge_research） | Any | Fatal | 由 Orchestrator 检测并终止 | `needs-intervention` |

### Timeout Configuration

- 单次研究调用超时: `knowledge_research.timeout_seconds: 600` (10 分钟)
- Agent 整体超时: `agent_timeout_seconds.knowledge_research: 600` (10 分钟)
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）

---

## Agent Interface Alignment

### Skill Call Parameters Mapping

本 workflow 的 `inputs` 直接映射到 Knowledge Researcher Agent 的 Skill Call Parameters:

```yaml
# Workflow inputs                --> Agent Skill Call Parameters
story_key: "3-1"                 --> story_key: "3-1"
mode: "research"                 --> mode: "research"
session_id: "sprint-..."         --> session_id: "sprint-..."
research_query:                  --> research_query:
  framework: "vue-easytable"     -->   framework: "vue-easytable"
  framework_version: "2.x"      -->   framework_version: "2.x"
  topic: "virtual scrolling..."  -->   topic: "virtual scrolling..."
  tags: [...]                    -->   tags: [...]
  question: "How to..."         -->   question: "How to..."
lessons_inject:                  --> lessons_inject:
  phase: "dev-execution"        -->   phase: "dev-execution"
config_overrides:                --> config_overrides:
  max_calls: 3                   -->   max_calls: 3
  timeout_seconds: 600           -->   timeout_seconds: 600
```

### Return Value Alignment

本 workflow 的 `outputs.return` 与 Knowledge Researcher Agent 的 Return Value Schema 完全一致:

**Research 模式:**

| Workflow Return Field | Agent Return Field | Type |
|----------------------|-------------------|------|
| `status` | `status` | enum: success/partial/cache-hit/degraded/budget-exhausted/timeout/failure |
| `story_key` | `story_key` | string |
| `mode` | `mode` | literal: "research" |
| `session_id` | `session_id` | string |
| `results.cache_hit` | `results.cache_hit` | boolean |
| `results.cache_entry_id` | `results.cache_entry_id` | string |
| `results.report_path` | `results.report_path` | path string |
| `results.confidence` | `results.confidence` | enum: high/medium/low |
| `results.sources_consulted` | `results.sources_consulted` | array of {source, status, url} |
| `results.budget_remaining` | `results.budget_remaining` | integer |
| `results.degradation_notes` | `results.degradation_notes` | array of string |
| `results.index_updated` | `results.index_updated` | boolean |
| `results.index_count` | `results.index_count` | integer |
| `results.lru_evicted` | `results.lru_evicted` | integer |
| `errors` | `errors` | array |

**Lessons-Inject 模式:**

| Workflow Return Field | Agent Return Field | Type |
|----------------------|-------------------|------|
| `status` | `status` | enum: success/empty/failure |
| `story_key` | `story_key` | string |
| `mode` | `mode` | literal: "lessons-inject" |
| `session_id` | `session_id` | string |
| `results.phase` | `results.phase` | string |
| `results.total_lessons_found` | `results.total_lessons_found` | integer |
| `results.phase_filtered_count` | `results.phase_filtered_count` | integer |
| `results.injected_count` | `results.injected_count` | integer |
| `results.injection_block` | `results.injection_block` | string (multiline) |
| `errors` | `errors` | array |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| None (service agent) | None (no state writes) | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `story_key`, `mode`, `session_id`, `research_query`, `lessons_inject`, `config_overrides` | `story_key`, `mode`, `session_id`, `research_query`, `lessons_inject`, `config_overrides` | Yes |
| Output status values (research) | `success`, `partial`, `cache-hit`, `degraded`, `budget-exhausted`, `timeout`, `failure` | `success`, `partial`, `cache-hit`, `degraded`, `budget-exhausted`, `timeout`, `failure` | Yes |
| Output status values (lessons-inject) | `success`, `empty`, `failure` | `success`, `empty`, `failure` | Yes |
| Modes | `research`, `lessons-inject` | `research`, `lessons-inject` | Yes |
| Persona | BMM Architect (Winston) headless | BMM Architect (Winston) headless | Yes |
| Cache management | 200-entry LRU, 30-day TTL, 60-day auto-archive, version-aware invalidation | 200-entry LRU, 30-day TTL, 60-day auto-archive, version-aware invalidation | Yes |
| Budget control | max 3 calls/story, 600s timeout/call, cache hits free | max 3 calls/story, 600s timeout/call, cache hits free | Yes |
| Lessons injection | Phase filter + recency sort, max 10 entries, <= 2 lines each | Phase filter + recency sort, max 10 entries, <= 2 lines each | Yes |
| State transitions | None (service agent) | None (service agent) | Yes |

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping
role_mapping.knowledge_researcher_persona     # Step 4: Persona ID (bmad:bmm:agents:architect)

# Knowledge research -- 核心配置
knowledge_research.enabled                    # Step 1: 功能开关（false 则立即返回）
knowledge_research.knowledge_base_path        # Step 2/7: 知识库根路径
knowledge_research.cache_ttl_days             # Step 2: 缓存 TTL（默认 30 天）
knowledge_research.max_calls_per_story        # Step 5: 单 Story 研究预算（默认 3）
knowledge_research.timeout_seconds            # Step 5: 单次调用超时（默认 600）
knowledge_research.cache_fuzzy_match          # Step 2: 是否启用模糊匹配（默认 true）
knowledge_research.sources                    # Step 5: 可用研究源列表 [context7, deepwiki, web_search]
knowledge_research.fallback_if_mcp_unavailable # Step 5: MCP 不可用时的降级源

# Agent timeout
defaults.agent_timeout_seconds.knowledge_research  # 整体 Agent 超时（默认 600）
defaults.agent_timeout_action                      # 超时处理策略（默认 mark_needs_intervention）

# Parallel write safety
defaults.parallel                             # Step 7/8: 判断是否需要写入队列

# Status file (本 workflow 不写入，但用于环境验证)
status_file_search_paths                      # 环境上下文参考
```

**隐含依赖（非 config.yaml 但 workflow 需要的文件）:**

| 文件 | 用途 | 不存在时行为 |
|------|------|-------------|
| `{knowledge_base_path}/index.yaml` | 缓存索引 | 视为空缓存，继续 |
| `{knowledge_base_path}/_archived-index.yaml` | 归档索引 | 自动创建 |
| `{knowledge_base_path}/lessons/_lessons-learned.md` | 经验库 | lessons-inject 返回 empty |
| `{knowledge_base_path}/frameworks/` | 研究报告存储目录 | 自动创建 |

---

## Workflow Sequence Diagram

### Research 模式 -- Cache Hit 路径

```
Caller Agent                   Knowledge Researcher (F1)            index.yaml
    |                                    |                              |
    |--- dispatch(story_key, ----------->|                              |
    |    mode:"research",                |                              |
    |    research_query)                 |                              |
    |                            Step 1: Request Parsing               |
    |                            & Validation                          |
    |                                    |                              |
    |                            Step 2: Cache Check                   |
    |                                    |--- read index.yaml -------->|
    |                                    |<-- matched entry (fresh) ---|
    |                                    |                              |
    |                            Step 3: Cache Hit Fast Path           |
    |                                    |--- update last_accessed --->|
    |                                    |                              |
    |                                    | read cached report file     |
    |                                    |                              |
    |<-- return(cache-hit, report) ------|                              |
    |    [zero network delay]            |                              |
    |    [budget NOT consumed]           |                              |
```

### Research 模式 -- Cache Miss 路径

```
Caller Agent         Knowledge Researcher (F1)        Context7   DeepWiki   WebSearch   index.yaml
    |                          |                          |          |          |            |
    |--- dispatch ----------->|                          |          |          |            |
    |                  Step 1: Parse & Validate          |          |          |            |
    |                          |                          |          |          |            |
    |                  Step 2: Cache Check                |          |          |            |
    |                          |--- read index ------------------------------------------>|
    |                          |<-- no match (MISS) ----------------------------------------|
    |                          |                          |          |          |            |
    |                  Step 4: Headless Persona Load      |          |          |            |
    |                    (BMM Architect Winston)          |          |          |            |
    |                          |                          |          |          |            |
    |                  Step 5: Research Execution         |          |          |            |
    |                          |                          |          |          |            |
    |                          |--- resolve-library-id -->|          |          |            |
    |                          |<-- library ID -----------|          |          |            |
    |                          |--- query-docs ---------->|          |          |            |
    |                          |<-- docs + examples ------|          |          |            |
    |                          |   [budget -= 1]          |          |          |            |
    |                          |                          |          |          |            |
    |                          | (if Context7 failed:)    |          |          |            |
    |                          |--- query ---------------->--------->|          |            |
    |                          |<-- results ---------------<---------|          |            |
    |                          |   [budget -= 1]          |          |          |            |
    |                          |                          |          |          |            |
    |                          | (if DeepWiki failed:)    |          |          |            |
    |                          |--- search + fetch -------->--------->--------->|            |
    |                          |<-- web results -----------<---------<---------|            |
    |                          |   [budget -= 1]          |          |          |            |
    |                          |                          |          |          |            |
    |                  Step 6: Report Generation          |          |          |            |
    |                    (standardized markdown)          |          |          |            |
    |                          |                          |          |          |            |
    |                  Step 7: Cache Write & Index Update |          |          |            |
    |                          |--- write report file     |          |          |            |
    |                          |--- update index.yaml --------------------------------------------->|
    |                          |                          |          |          |            |
    |                  Step 8: LRU Capacity Guard         |          |          |            |
    |                          |--- check count > 200? ------------------------------------------->|
    |                          |--- evict oldest if needed ---------------------------------------->|
    |                          |                          |          |          |            |
    |                  Step 9: Return                     |          |          |            |
    |<-- return(success) -----|                          |          |          |            |
```

### Lessons-Inject 模式

```
Caller Agent              Knowledge Researcher (F1)          _lessons-learned.md
    |                                |                              |
    |--- dispatch(mode: ------------>|                              |
    |    "lessons-inject",           |                              |
    |    phase: "dev-execution")     |                              |
    |                        Step 1: Parse & Validate              |
    |                                |                              |
    |                        LI-Step 1: Read Lessons               |
    |                                |--- read file --------------->|
    |                                |<-- all entries --------------|
    |                                |                              |
    |                        LI-Step 2: Phase Filter               |
    |                          (keep [dev-execution] only)         |
    |                                |                              |
    |                        LI-Step 3: Sort & Budget              |
    |                          (recency + relevance, max 10)       |
    |                                |                              |
    |                        LI-Step 4: Format & Return            |
    |<-- return(success, ------------|                              |
    |    injection_block)            |                              |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 4: Persona 加载失败时回退精简 persona；Step 5: Context7 -> DeepWiki -> WebSearch 降级链；Step 5d: 全部不可用时继续而非报错 |
| 3 | 预算控制一切 | Step 5: max_calls_per_story 限制外部调用次数；timeout_seconds 限制单次调用时长；预算用尽返回部分结果 |
| 8 | Headless Persona Loading | Step 4: 加载 BMM Architect (Winston) persona 知识但跳过交互行为 |
| 14 | BMM 集成契约 | Step 4: 通过 Skill call 加载 persona，仅依赖接口不依赖内部实现 |
| 15 | 每阶段超时 | Step 5: 每次外部调用独立超时控制；整体 Agent 超时由 Orchestrator 管理 |
| 16 | 知识容量管理 | Step 2: 缓存查找 + 版本感知；Step 7: 索引更新；Step 8: LRU 200 条上限 + 60 天自动归档 |
| 23 | 并行状态写入队列 | Step 3/7/8: parallel > 1 时 index.yaml 写入通过 Orchestrator 序列化队列 |
| 25 | 经验注入预算 | LI-Step 3: 每次阶段注入最多 10 条，按 recency + relevance 排序截取 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: knowledge-research.spec.md + knowledge-researcher agent + config.yaml + module-brief-bso.md_
_Template reference: story-creation workflow (C2) structural alignment_
