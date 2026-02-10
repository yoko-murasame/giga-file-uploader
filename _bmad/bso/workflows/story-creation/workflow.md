---
name: story-creation
id: C2
description: "C2: Create Story document from Epic definition with complete AC, tasks, subtasks, file scope, and technical references"
module: bso
agent: story-creator
version: 1.1.1
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Story Creation Workflow (C2)

> BSO Core Workflow -- 从 Epic 定义创建完整的 Story 文档，包含验收标准、任务分解、子任务、文件作用域和技术引用。由 Sprint Orchestrator 调度，Story Creator Agent 执行。

## Purpose

将 Epic backlog 条目转化为完整的 Story 开发文档。Story 文档是所有下游 Agent（Dev Runner、Review Runner、E2E Inspector）的唯一真实来源。支持两种模式：`create`（从 Epic 新建）和 `revise`（根据 Story Reviewer 反馈修订）。

## Primary Agent

**Story Creator** (`bso-story-creator`) -- 使用 BMM SM (Bob) persona 知识，headless 模式运行。

## Supporting Agents

- **Knowledge Researcher** (F1) -- 按需触发，用于经验注入和技术声明验证

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Epic-Story 标识符（格式: {epic}-{story}）
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
    epic_file_path: "path/to/epic-3.md"       # Epic 定义文件绝对路径
  optional:
    config_overrides: {}                       # 运行时配置覆盖（如 max_story_review_rounds）
    mode: "create"                             # create | revise
                                               #   create: 从 Epic 新建 Story（默认）
                                               #   revise: 根据审查反馈修订已有 Story
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配格式 `\d+-\d+` | abort, status: "failure" |
| `session_id` | 非空字符串 | abort, status: "failure" |
| `epic_file_path` | 文件存在且可读 | abort, status: "failure", error: "Epic file not found" |
| `mode` | 值为 "create" 或 "revise" | 默认 "create" |

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - "{implementation_artifacts}/stories/story-{epic}-{story}.md"
```

### Return Value

```yaml
return:
  status: "success" | "failure" | "completeness-violation" | "needs-intervention"
  story_key: "3-1"
  mode: "create" | "revise"
  session_id: "sprint-2026-02-07-001"
  results:
    story_file: "path/to/story-3-1.md"
    ac_count: 5
    task_count: 8
    subtask_count: 12
    file_scope_declared: true
    completeness_checks:
      all_passed: true
      failures: []
    technical_claims:
      total: 3
      verified: 2
      unverified: 1
      contradicted: 0
    knowledge_queries:
      - query: "JeecgBoot @Dict annotation usage"
        result: "cache-hit"
      - query: "vue-easytable virtual scroll row-height"
        result: "researched"
    lessons_injected: 4
    commits:
      - hash: "def5678"
        message: "docs: Story 3.1: 项目管理CRUD 创建开发文档"
  errors: []
```

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|---------------|
| `create` | `backlog` | abort, status: "failure", error: "Story not in backlog state" |
| `revise` | `story-doc-improved` | abort, status: "failure", error: "Story not in story-doc-improved state" |

## State Transitions

| Mode | Before | After (success) | After (failure) |
|------|--------|-----------------|-----------------|
| `create` | `backlog` | `story-doc-review` | `backlog`（状态不变） |
| `revise` | `story-doc-improved` | `story-doc-review` | `story-doc-improved`（状态不变） |

> **Note:** 状态转换由 Orchestrator 在收到 return value 后执行，本 workflow 不直接写入 sprint-status.yaml（Principle 4: 单一状态写入入口）。

---

## Workflow Steps

### Step 1: State Validation

**Goal:** 验证 Story 处于正确的状态，确保 workflow 执行的前置条件满足。

**Actions:**
1. 按 `status_file_search_paths` 配置顺序查找 `sprint-status.yaml`
2. 读取 sprint-status.yaml，定位 `story_key` 对应条目
3. 验证当前状态：
   - `create` 模式: 状态必须为 `backlog`
   - `revise` 模式: 状态必须为 `story-doc-improved`
4. 如果状态不匹配 --> 立即终止

**On Success:** 继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "state_mismatch"
      expected: "backlog"
      actual: "{current_state}"
      message: "Story {story_key} is in '{current_state}' state, expected 'backlog' for create mode"
```

---

### Step 2: Lessons Injection

**Goal:** 从经验库中注入与 story-creation 阶段相关的历史经验，避免重复犯错（Principle 25）。

**Actions:**
1. 触发 Knowledge Researcher (F1)，模式为 `lessons-inject`
2. 阶段过滤标签: `[story-creation]`
3. Knowledge Researcher 执行：
   a. 读取 `_lessons-learned.md`
   b. 按 `[story-creation]` 标签过滤条目
   c. 按 recency（最新优先）+ relevance（与当前 Epic/Story 上下文相关度）排序
   d. 截取前 **10 条**（`lessons_injection_budget: 10`）
4. 注入到当前工作上下文中，作为 Story 生成时的警告参考

**On Success:** `lessons_injected: N`（实际注入条数），继续 Step 3
**On Failure (Knowledge Researcher 不可用):** 记录警告，以空上下文继续（Principle 2: 降级优于报错）

---

### Step 3: Context Loading

**Goal:** 加载 Story 生成所需的全部上下文资料。

**Actions:**
1. 读取 Epic 定义文件（`epic_file_path`）
   - 提取 `story_key` 对应的 Story 需求描述
   - 获取 Epic 级别的业务目标和技术约束
2. 读取 `project-context.md`
   - 获取项目规则、编码模式、技术栈约定
   - 获取文件组织规范和命名约定
3. 读取知识缓存 `index.yaml`
   - 检查是否存在与当前 Story 相关的预加载知识报告
   - 标记可用的 cache-hit 条目供 Step 6 使用
4. **Revise 模式额外操作：**
   - 读取已有 Story .md 文件
   - 读取 Story Reviewer 反馈内容
   - 识别需要修改的具体章节

**On Success:** 上下文就绪，继续 Step 4
**On Failure:**
- Epic 文件不存在 --> abort, status: "failure", error: "Epic file not found at {epic_file_path}"
- project-context.md 不存在 --> 记录警告，继续（非致命）
- index.yaml 不存在 --> 记录警告，继续（知识缓存为空）

---

### Step 4: Headless Persona Load

**Goal:** 加载 BMM SM (Bob) persona 知识，获取 Scrum Master 领域专长，同时避免触发交互式行为（Principle 8）。

**Actions:**
1. 通过 Skill call 加载 BMM SM persona
   - Persona ID: `bmad:bmm:agents:sm`（来自 `config.yaml` 的 `role_mapping.story_creator_persona`）
2. 立即声明 YOLO/automation 模式
   - 跳过菜单显示和用户交互
   - 不验证特定激活信号
3. 通过 Skill call 返回值验证加载成功
4. Persona 知识和原则注入到上下文中：
   - Story 拆分纪律（INVEST 原则）
   - AC 编写最佳实践
   - 任务依赖排序原则

**On Success:** Persona 知识就绪，继续 Step 5
**On Failure:**
- Persona 加载失败 --> 回退到 BSO 内置精简 persona（lean persona fallback）
- 记录警告: "BMM SM persona load failed, using lean persona"
- 继续执行（Principle 2: 降级优于报错）

---

### Step 5: Story Generation

**Goal:** 生成完整的 Story 文档，包含所有必需章节。

**Actions:**
1. 调用 BMM create-story workflow
   - Skill 路径: `bmad:bmm:workflows:create-story`（来自 `config.yaml` 的 `workflow_mapping.create_story`）
2. **Create 模式 -- 生成完整 Story：**
   a. 写入 Story 头部（标题、Epic 引用、story_key）
   b. 定义用户角色和业务价值
   c. 编写验收标准（每条 AC 必须可测试、无歧义）
   d. 分解为任务/子任务，确保正确的序列和依赖顺序
   e. 声明文件作用域（Dev Runner 允许修改的文件列表）
   f. 添加技术引用和备注
3. **Revise 模式 -- 定向修订：**
   a. 根据 Reviewer 反馈更新/添加/删除 AC
   b. 调整任务分解和排序
   c. 澄清模糊术语或引用
   d. 更新文件作用域声明（如需要）
4. 在生成过程中应用 Step 2 注入的经验警告：
   - 如果经验警告特定 API 陷阱 --> 确保 Story AC 中有对应处理
   - 如果经验警告文件作用域缺失 --> 确保显式声明作用域
   - 如果经验警告 AC 模糊 --> 对 AC 措辞施加额外审查

**On Success:** Story 文档生成完毕（内存中），继续 Step 6
**On Failure:** status: "failure", error detail

---

### Step 6: Technical Claim Verification

**Goal:** 验证 Story 中引用的 API 名称、方法签名、框架特性是否真实存在（Principle 27）。

**Actions:**
1. 扫描生成的 Story 文档，提取技术声明：
   - API 端点名称
   - 方法签名和参数
   - 框架特性和配置键
   - 第三方库 API 调用
2. 对每个未验证的技术声明：
   a. 先检查知识缓存 `index.yaml` 是否有匹配条目
   b. **Cache hit（< 30 天）:** 使用缓存结果，标记为 "cache-hit"
   c. **Cache miss:** 触发 Knowledge Researcher (F1)，模式为 `research`
      - 传入具体技术问题
      - 等待研究结果
   d. 根据验证结果更新 Story：
      - 确认正确 --> 保持原文
      - 发现矛盾 --> 用修正信息更新 AC/tasks
      - 无法验证（预算用尽）--> 在 Story 中标记 `[unverified]` 标签
3. **预算控制:** 最多 3 次 Knowledge Researcher 调用（`knowledge_research.max_calls_per_story: 3`）
4. 预算用尽后的未验证声明 --> 标记 `[unverified]` 并继续

**On Success:** 技术声明验证完毕，继续 Step 7
**On Failure (Knowledge Researcher 超时):**
- 单次超时上限: `knowledge_research.timeout_seconds: 600`
- 超时 --> 跳过该声明，标记 `[unverified]`
- 继续执行（Principle 2: 降级优于报错）

**Knowledge Query Log:**
```yaml
knowledge_queries:
  - query: "JeecgBoot @Dict annotation usage"
    result: "cache-hit" | "researched" | "timeout" | "budget-exhausted"
```

---

### Step 7: Completeness Validation

**Goal:** 运行 Story Completeness Guard 检查清单，确保 Story 文档满足所有质量标准。

**Checklist:**
- [ ] Story 有清晰的标题和用户-角色-价值陈述
- [ ] 每条 AC 可测试 -- 包含具体的预期行为，不使用模糊描述
- [ ] 每条 AC 至少有一个对应的 task
- [ ] Tasks 按正确的依赖顺序排列 -- 没有 task 引用后续 task 的输出
- [ ] 文件作用域声明存在 -- 列出 Dev Runner 允许修改的文件
- [ ] 技术引用已验证（或已触发 Knowledge Researcher 验证）
- [ ] 无歧义术语使用（未定义的术语不可出现）

**Actions:**
1. 逐项检查上述清单
2. 对每个失败项：
   a. 记录失败详情（具体哪条规则、哪个章节）
   b. 判断是否为可自动修复的简单问题：
      - 文件作用域缺失 --> 从 tasks 中推断并自动补充
      - AC 缺少对应 task --> 自动生成骨架 task
   c. 执行自动修复（如适用）
   d. 重新验证修复后的结果
3. 汇总验证结果

**On Success (all_passed: true):** 继续 Step 8
**On Partial Failure (auto-fix resolved):** 记录修复日志，继续 Step 8
**On Failure (remaining violations):**
```yaml
return:
  status: "completeness-violation"
  results:
    completeness_checks:
      all_passed: false
      failures:
        - check: "ac_testable"
          detail: "AC-3 uses vague term 'appropriate' without definition"
        - check: "task_dependency_order"
          detail: "Task 5 references output of Task 7"
```

---

### Step 8: File Write

**Goal:** 将 Story 文档写入 BMM 约定路径。

**Actions:**
1. 确定输出路径: `{implementation_artifacts}/stories/story-{epic}-{story}.md`
   - `{epic}` 和 `{story}` 从 `story_key` 解析
   - 示例: story_key "3-1" --> `story-3-1.md`
2. 确保目标目录存在（不存在则创建）
3. **Create 模式:** 写入新文件
4. **Revise 模式:** 覆盖已有文件
5. 验证文件写入成功（文件存在且内容非空）

**On Success:** 文件路径记录到 `results.story_file`，继续 Step 9
**On Failure:** status: "failure", error: "File write failed"

---

### Step 9: Git Commit

**Goal:** 通过 precise-git-commit (U3) 提交 Story 文档，包含敏感文件检查（Principle 21）。

**Actions:**
1. 执行 precise-git-commit (U3) workflow：
   a. 快照当前 diff，识别变更文件
   b. **敏感文件检查:**
      - 扫描变更文件列表，匹配敏感模式: `.env`, `credentials`, `secrets`, `password`, `token`, `key`
      - 如果检测到敏感文件 --> 立即中止提交，报告给 Orchestrator
   c. 逐文件 `git add`（仅添加 Story 相关文件）
   d. 执行 `git commit`
2. Commit message 模式（来自 `config.yaml` 的 `git_commit_patterns.story_created`）:
   ```
   docs: Story {epic}.{story}: {title} 创建开发文档
   ```
   - 示例: `docs: Story 3.1: 项目管理CRUD 创建开发文档`
3. **Revise 模式** commit message（来自 `config.yaml` 的 `git_commit_patterns.story_revised`）:
   ```
   docs: Story {epic}.{story}: {title} 修订开发文档
   ```

**On Success:** commit hash 记录到 `results.commits[]`，继续 Step 10
**On Failure:**
- 敏感文件检测 --> abort commit, status: "needs-intervention", error: "Sensitive file detected: {filename}"
- Git 操作失败 --> status: "failure", error detail
- **Note:** commit 失败不影响 Story 文件（已在 Step 8 写入），Orchestrator 可选择重试 commit

---

### Step 10: Return

**Goal:** 向 Orchestrator 返回执行结果，触发状态转换。

**Actions:**
1. 组装 return value：
   - `status`: 根据各步骤结果确定最终状态
   - `results`: 汇总 AC 数量、task 数量、验证结果等
   - `errors`: 收集所有非致命错误和警告
2. 返回给 Orchestrator
3. **Orchestrator 后续操作（非本 workflow 职责）：**
   - 收到 return value 后更新 sprint-status.yaml
   - `create` 模式成功: `backlog` --> `story-doc-review`
   - `revise` 模式成功: `story-doc-improved` --> `story-doc-review`
   - 失败: 状态不变，记录错误到执行报告

**Return Value Mapping:**

| Scenario | Status | Orchestrator Action |
|----------|--------|-------------------|
| 全部步骤成功 | `success` | 状态转换到 `story-doc-review` |
| Completeness Guard 有残留违规 | `completeness-violation` | 记录违规详情，由 Orchestrator 决定是否继续 |
| Epic 文件不存在 / 状态不匹配 | `failure` | 状态不变，记录到执行报告 |
| 敏感文件检测 / 不可恢复错误 | `needs-intervention` | 标记为需人工干预 |

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| Story 状态不匹配 | Step 1 | Fatal | 立即终止 | `failure` |
| Epic 文件不存在 | Step 3 | Fatal | 立即终止 | `failure` |
| project-context.md 不存在 | Step 3 | Warning | 记录警告，继续 | N/A (继续) |
| Knowledge Researcher 不可用 | Step 2, 6 | Warning | 降级继续（Principle 2） | N/A (继续) |
| BMM SM Persona 加载失败 | Step 4 | Warning | 回退到精简 persona | N/A (继续) |
| Knowledge Researcher 超时 | Step 6 | Warning | 标记 `[unverified]`，继续 | N/A (继续) |
| Knowledge Research 预算用尽 | Step 6 | Info | 停止新查询，继续 | N/A (继续) |
| Completeness Guard 失败 | Step 7 | Conditional | 尝试自动修复，报告残留 | `completeness-violation` |
| 文件写入失败 | Step 8 | Fatal | 终止 | `failure` |
| 敏感文件检测 | Step 9 | Critical | 中止 commit | `needs-intervention` |
| Git commit 失败 | Step 9 | Error | 报告错误，Story 文件保留 | `failure` |
| Agent 超时 | Any | Fatal | 由 Orchestrator 检测 | `needs-intervention` |

### Timeout Configuration

- Workflow 整体超时: `agent_timeout_seconds.story_creation: 900` (15 分钟)
- Knowledge Researcher 单次调用超时: `knowledge_research.timeout_seconds: 600` (10 分钟)
- 超时处理: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（默认 `mark_needs_intervention`）

---

## Agent Interface Alignment

### Skill Call Parameters Mapping

本 workflow 的 `inputs` 直接映射到 Story Creator Agent 的 Skill Call Parameters:

```yaml
# Workflow inputs          -->  Agent Skill Call Parameters
story_key: "3-1"           -->  story_key: "3-1"
session_id: "sprint-..."   -->  session_id: "sprint-..."
mode: "create"             -->  mode: "create"
config_overrides: {}       -->  config_overrides: {}
epic_file_path: "path/..." -->  (Agent 通过 file-read protocol 读取)
```

### Return Value Alignment

本 workflow 的 `outputs.return` 与 Story Creator Agent 的 Return Value Schema 完全一致:

| Workflow Return Field | Agent Return Field | Type |
|----------------------|-------------------|------|
| `status` | `status` | enum: success/failure/completeness-violation/needs-intervention |
| `story_key` | `story_key` | string |
| `mode` | `mode` | enum: create/revise |
| `session_id` | `session_id` | string |
| `results.story_file` | `results.story_file` | path string |
| `results.ac_count` | `results.ac_count` | integer |
| `results.task_count` | `results.task_count` | integer |
| `results.subtask_count` | `results.subtask_count` | integer |
| `results.file_scope_declared` | `results.file_scope_declared` | boolean |
| `results.completeness_checks` | `results.completeness_checks` | object |
| `results.technical_claims` | `results.technical_claims` | object |
| `results.knowledge_queries` | `results.knowledge_queries` | array |
| `results.lessons_injected` | `results.lessons_injected` | integer |
| `results.commits` | `results.commits` | array |
| `errors` | `errors` | array |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| `backlog` --> `story-doc-review` (create) | Step 10: create success | Yes |
| `story-doc-improved` --> `story-doc-review` (revise) | Step 10: revise success | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `story_key`, `session_id`, `epic_file_path`, `mode`, `config_overrides` | `story_key`, `session_id`, `mode`, `config_overrides` (epic resolved via file-read) | Yes |
| Output status values | `success`, `failure`, `completeness-violation`, `needs-intervention` | `success`, `failure`, `completeness-violation`, `needs-intervention` | Yes |
| Modes | `create`, `revise` | `create`, `revise` | Yes |
| Persona | BMM SM (Bob) headless | BMM SM (Bob) headless | Yes |
| Knowledge integration | Lessons injection (Step 2) + Technical claim verification (Step 6) via F1 | Lessons injection + Technical claim verification via F1 | Yes |
| Completeness guard | Step 7 (7-item checklist + auto-fix) | Completeness guard with auto-fix | Yes |
| Git commit | precise-git-commit (U3) with sensitive file check | precise-git-commit (U3) with sensitive file check | Yes |

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping
role_mapping.story_creator_persona    # Step 4: Persona ID

# Workflow mapping
workflow_mapping.create_story         # Step 5: BMM workflow Skill 路径

# Defaults
defaults.max_story_review_rounds      # revise 模式上下文
defaults.agent_timeout_seconds.story_creation  # 整体超时
defaults.agent_timeout_action         # 超时处理策略

# Knowledge research
knowledge_research.enabled            # Step 2, 6: 是否启用
knowledge_research.max_calls_per_story # Step 6: 单 Story 调用上限
knowledge_research.timeout_seconds    # Step 6: 单次调用超时
knowledge_research.cache_ttl_days     # Step 6: 缓存有效期

# Git
git_commit_patterns.story_created     # Step 9: create 模式 commit message 模板
git_commit_patterns.story_revised     # Step 9: revise 模式 commit message 模板

# Status file
status_file_search_paths              # Step 1: 状态文件查找路径
```

---

## Workflow Sequence Diagram

```
Orchestrator                Story Creator (C2)              Knowledge Researcher (F1)
    |                              |                                |
    |--- dispatch(story_key, ----->|                                |
    |    mode, session_id)         |                                |
    |                              |                                |
    |                      Step 1: State Validation                 |
    |                              |                                |
    |                      Step 2: Lessons Injection                |
    |                              |-------- lessons-inject ------->|
    |                              |<------- lessons (max 10) ------|
    |                              |                                |
    |                      Step 3: Context Loading                  |
    |                        (Epic + project-context + index.yaml)  |
    |                              |                                |
    |                      Step 4: Headless Persona Load            |
    |                        (BMM SM Bob via Skill)                 |
    |                              |                                |
    |                      Step 5: Story Generation                 |
    |                        (BMM create-story workflow)            |
    |                              |                                |
    |                      Step 6: Technical Claim Verification     |
    |                              |-------- research (x<=3) ------>|
    |                              |<------- verified/corrected ----|
    |                              |                                |
    |                      Step 7: Completeness Validation          |
    |                        (Guard checklist + auto-fix)           |
    |                              |                                |
    |                      Step 8: File Write                       |
    |                        (story-{epic}-{story}.md)              |
    |                              |                                |
    |                      Step 9: Git Commit                       |
    |                        (precise-git-commit U3)                |
    |                              |                                |
    |                      Step 10: Return                          |
    |<--- return(status, results) -|                                |
    |                              |                                |
    | update sprint-status.yaml    |                                |
    | (backlog -> story-doc-review)|                                |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 2/6: Knowledge Researcher 不可用时继续；Step 4: Persona 加载失败时回退 |
| 4 | 单一状态写入入口 | Step 10: 状态转换由 Orchestrator 执行，本 workflow 不直接写 sprint-status.yaml |
| 5 | 状态是唯一真实来源 | Step 1: 只检查状态，不假设 Story 来源 |
| 8 | Headless Persona Loading | Step 4: 加载 persona 知识但跳过交互行为 |
| 21 | Git Commit Safeguard | Step 9: 提交前检查敏感文件 |
| 25 | Lessons 注入预算 | Step 2: 最多注入 10 条经验 |
| 27 | 技术声明验证 | Step 6: 自动验证 API/方法名存在性 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: story-creation.spec.md + story-creator agent + config.yaml + module-brief-bso.md_
