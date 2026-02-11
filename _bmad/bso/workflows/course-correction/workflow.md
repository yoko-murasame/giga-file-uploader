---
name: course-correction
id: CC
description: "CC: Navigate significant changes during Sprint execution -- analyze impact, re-plan batches, validate dependencies, and deliver correction plan to Master"
module: bso
agent: bso-scrum-master
version: 1.0.0
created: 2026-02-11
updated: 2026-02-11
status: Completed
---

# Course Correction Workflow (CC)

> BSO Feature Workflow -- Sprint 执行期间的航向修正。由 Master 通过 CC_TRIGGER 触发，Scrum Master Agent 执行。封装 BMM 的通用 correct-course 逻辑，增加 BSO 特有的 batch 重组方案。SM 不直接修改 sprint-status.yaml，所有状态变更由 Master 在收到 COURSE_CORRECTION 消息后执行。

## Purpose

在 Sprint 执行过程中应对重大变更（用户主动调整、反复失败、新需求引入），分析影响范围，重新规划剩余 Stories 的 batch 分组，并将修正方案发送给 Master 执行。

## Primary Agent

**Scrum Master** (`bso-scrum-master`) -- Sprint 级别管理者，负责规划和协调。

## Supporting Agents

- 无直接调度的 Agent。SM 在 course correction 中独立运作。
- **BMM correct-course Skill** (`bmad:bmm:workflows:correct-course`) -- 提供通用项目管理级别的变更分析逻辑。

---

## Input Schema

```yaml
inputs:
  required:
    reason: "user_request"                          # 触发原因: user_request | repeated_failures | new_requirements
    current_batch_id: "batch-2"                    # 触发时的活跃 batch ID
  optional:
    user_input: "需要先完成报表模块再做权限"          # 用户自由文本（user_request 时使用）
    added_stories:                                  # 新增 Story keys
      - "6-1"
      - "6-2"
    dropped_stories:                                # 移除 Story keys
      - "5-3"
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `reason` | 值为 `user_request`, `repeated_failures`, 或 `new_requirements` | abort, status: "failure" |
| `current_batch_id` | 匹配格式 `batch-\d+` | abort, status: "failure" |
| `user_input` | 字符串，最长 2000 字符 | 截断到 2000 字符，记录 warning |
| `added_stories` | 每个元素匹配 `\d+-\d+`（如提供） | abort, status: "failure" |
| `dropped_stories` | 每个元素匹配 `\d+-\d+`（如提供） | abort, status: "failure" |

---

## Output Schema

### Return Value (COURSE_CORRECTION Message)

```yaml
return:
  type: "COURSE_CORRECTION"
  status: "success" | "no-action-needed" | "partial" | "failure"
  trigger:
    reason: "user_request"
    user_input: "需要先完成报表模块再做权限"
    current_batch_id: "batch-2"
  impact_analysis:
    affected_stories: ["4-1", "4-2", "5-1"]
    unaffected_stories: ["3-3"]
    added_stories: ["6-1"]
    dropped_stories: ["5-3"]
  new_batch_plan:
    - batch_id: "batch-3"
      story_keys: ["3-3", "4-1", "4-2"]
      rationale: "Complete current epic before new work"
    - batch_id: "batch-4"
      story_keys: ["5-1", "6-1"]
      rationale: "New requirements grouped with related story"
  dependency_check:
    valid: true
    warnings: []
  recommendations:
    - "Story 5-3 dropped per user request"
    - "Story 6-1 added to batch-4 due to dependency on 5-1"
  errors: []
```

### Output Files

- 无文件写入（SM 不写 sprint-status.yaml，Principle 4）
- COURSE_CORRECTION 消息发送给 Master（内存中传递）

---

## State Preconditions

| Condition | Check | On Failure |
|-----------|-------|------------|
| Sprint 处于活跃执行状态 | `sprint-status.yaml` 存在且至少一个 Story 不在 `backlog` | abort, status: "failure", error: "Sprint not active" |
| 当前 batch 有效 | `current_batch_id` 存在于 Sprint 上下文中 | abort, status: "failure", error: "Unknown batch_id" |

## State Transitions

Course correction 不直接修改 Story 状态，仅生成新的 batch plan:

| Aspect | Before | After |
|--------|--------|-------|
| Batch 结构 | 原始 batch plan | 新 batch plan（重排/重组） |
| 新增 Stories | 不在 sprint-status.yaml 中 | Master 在 CC 后添加 |
| 移除 Stories | 在 sprint-status.yaml 中（各种状态） | Master 在 CC 后标记 `skipped` |
| 进行中 Stories | 当前状态保持 | 不变（继续当前阶段） |

---

## Workflow Steps

### Step 1: Trigger Analysis

**Goal:** 解析 CC_TRIGGER 消息，理解触发原因和上下文。

**Actions:**
1. 接收 Master 发送的 CC_TRIGGER 消息
2. 解析 `reason` 字段:
   - `user_request` --> 用户主动请求调整，需要解析 `user_input` 理解意图
   - `repeated_failures` --> 自动检测到多个 Story 反复失败，需要分析失败模式
   - `new_requirements` --> 新需求引入，需要解析 `added_stories` 和 `dropped_stories`
3. 提取附加上下文:
   - `user_input`: 用户自由文本（仅 `user_request` 时）
   - `added_stories[]`: 需要新增的 Story keys
   - `dropped_stories[]`: 需要移除的 Story keys
4. 验证输入参数（见 Input Validation Rules）

**On Success:** 触发原因和上下文解析完毕，继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "trigger_parse_failure"
      message: "Invalid CC_TRIGGER: {detail}"
```

---

### Step 2: State Assessment

**Goal:** 读取 sprint-status.yaml，评估当前 Sprint 执行状态。

**Actions:**
1. 按 `status_file_search_paths` 配置顺序查找 `sprint-status.yaml`
2. 读取并解析 sprint-status.yaml
3. 构建当前状态快照:
   ```yaml
   state_snapshot:
     total_stories: 15
     by_state:
       done: 5
       review: 2
       ready-for-dev: 1
       story-doc-improved: 1
       backlog: 4
       needs-intervention: 1
       e2e-verify: 1
     current_batch:
       batch_id: "batch-2"
       story_keys: ["3-3", "4-1", "4-2"]
       progress: "3-3 in review, 4-1 in ready-for-dev, 4-2 in backlog"
     completed_batches: ["batch-1"]
     pending_stories: ["4-2", "5-1", "5-2", "5-3", "6-1", "6-2"]
   ```
4. 验证 Sprint 处于活跃状态（至少一个 Story 不在 `backlog`）

**On Success:** 状态快照生成，继续 Step 3
**On Failure:**
- sprint-status.yaml 不存在 --> abort, status: "failure"
- Sprint 未启动（全部 `backlog`） --> abort, status: "failure", error: "Sprint not active"

---

### Step 3: Impact Analysis

**Goal:** 确定哪些 pending Stories/batches 受到变更影响。

**Actions:**
1. **分类 Stories:**
   - **已完成 Stories** (`done`): 不受影响，保持不变
   - **进行中 Stories** (`review`, `ready-for-dev`, 等非终态非 backlog): 通常不受影响，除非被 `dropped_stories` 明确移除
   - **待处理 Stories** (`backlog`, 尚未分配的): 可以被重新排序、重组
   - **新增 Stories** (`added_stories[]`): 需要插入到 batch plan 中

2. **分析影响范围:**
   - 根据 `reason` 确定影响深度:
     - `user_request` --> 可能大范围调整优先级
     - `repeated_failures` --> 聚焦失败 Stories，可能需要拆分或重组
     - `new_requirements` --> 聚焦新增 Stories 的插入位置
   - 标记 `affected_stories[]` 和 `unaffected_stories[]`

3. **处理 added/dropped Stories:**
   - `added_stories[]` --> 验证不与现有 Story keys 冲突
   - `dropped_stories[]` --> 验证存在于 sprint-status.yaml 中，且不在 `done` 状态

4. **特殊处理 `repeated_failures`:**
   - 如果触发原因是反复失败:
     - 分析失败 Stories 的共性（同一 Epic? 同一技术栈? 同一类错误?）
     - 建议是否需要拆分 Story 或调整开发顺序
     - 可能建议将复杂 Story 延后或标记为需人工干预

**On Success:** 影响分析完成，继续 Step 4
**On Failure:**
- 无待处理 Stories --> status: "no-action-needed", 附带 advisory

---

### Step 4: Re-Planning

**Goal:** 生成新的 batch plan。

**Actions:**
1. **调用 BMM correct-course Skill:**
   - Skill 路径: `bmad:bmm:workflows:correct-course`
   - 传入: 状态快照 + 影响分析 + trigger context
   - 获取: BMM 级别的调整建议（优先级排序、Story 分组建议）

2. **BMM Skill 不可用时降级 (Principle 2):**
   - 使用 BSO 内置的简化逻辑:
     a. 收集所有 pending Stories（排除 `done`, `needs-intervention`, `skipped`）
     b. 加入 `added_stories[]`，移除 `dropped_stories[]`
     c. 按 Epic 编号升序排列
     d. 每 3 个 Stories 一组，生成新 batch

3. **BSO Batch 重组:**
   - 将 BMM 建议转化为具体的 batch 结构:
     ```yaml
     new_batch_plan:
       - batch_id: "batch-3"
         story_keys: ["3-3", "4-1", "4-2"]
       - batch_id: "batch-4"
         story_keys: ["5-1", "6-1"]
     ```
   - Batch ID 从 `current_batch_id + 1` 开始递增
   - 每 batch 最多 3 个 Stories（可配置）

4. **生成 recommendations:**
   - 对每个调整动作生成人类可读的建议说明
   - 对 `dropped_stories` 记录移除原因
   - 对 `added_stories` 记录插入位置和理由

**On Success:** 新 batch plan 生成，继续 Step 5
**On Failure:** 如果 BMM Skill 和 BSO fallback 均失败 --> status: "failure"

---

### Step 5: Dependency Re-Check (P29)

**Goal:** 验证重组后的 batch plan 不违反 Story 间的依赖关系。

**Actions:**
1. 读取 Story 间的依赖声明（来自 Story .md 文件或 sprint-status.yaml 的 `dependencies` 字段）
2. 构建依赖图:
   ```
   Story 4-2 depends on 4-1
   Story 5-1 depends on 4-2
   Story 6-1 depends on 5-1
   ```
3. 验证新 batch plan:
   - 对每个有前置依赖的 Story:
     - 前置 Story 必须在同一 batch 或更早的 batch 中
     - 如果在同一 batch 中，前置 Story 必须排在前面
   - 检测循环依赖:
     - 发现循环 --> 自动打断最弱环节（最少下游依赖的 Story）
     - 记录 warning

4. 依赖检查结果:
   ```yaml
   dependency_check:
     valid: true                    # 或 false
     warnings:
       - "Story 6-1 moved to batch-4 to satisfy dependency on 5-1"
     violations: []                 # 如果有无法自动解决的违规
   ```

**On Success:** 依赖关系校验通过，继续 Step 6
**On Partial (有 warnings):** 记录 warnings，继续 Step 6
**On Failure (不可解决的违规):**
```yaml
return:
  status: "partial"
  errors:
    - type: "dependency_violation"
      message: "Cannot resolve dependency: {detail}"
  dependency_check:
    valid: false
    violations: [...]
```

---

### Step 6: Plan Delivery

**Goal:** 向 Master 发送 COURSE_CORRECTION 消息，包含完整的修正方案。

**Actions:**
1. 组装 COURSE_CORRECTION 消息:
   - `trigger`: 原始触发信息
   - `impact_analysis`: Step 3 的影响分析结果
   - `new_batch_plan`: Step 4 的新 batch 计划
   - `dependency_check`: Step 5 的依赖检查结果
   - `recommendations`: 人类可读的建议列表
2. 发送给 Master
3. Master 收到后将:
   - 暂停当前 batch 的后续 Story 调度
   - 应用新 batch plan
   - 对 `dropped_stories` 标记为 `skipped`
   - 对 `added_stories` 初始化到 `backlog`
   - 恢复 Sprint 执行

**On Success:** COURSE_CORRECTION 消息发送成功
**On Failure:** Master 不可达 --> 重试 3 次，持续失败则记录 error（Slave 可能已断开）

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| 无效触发原因 | Step 1 | Fatal | 立即终止 | `failure` |
| sprint-status.yaml 不存在 | Step 2 | Fatal | 立即终止 | `failure` |
| Sprint 未启动 | Step 2 | Fatal | 立即终止 | `failure` |
| 无待处理 Stories | Step 3 | Warning | 返回空 plan + advisory | `no-action-needed` |
| added_story key 冲突 | Step 3 | Warning | 跳过重复，记录 warning | N/A (continue) |
| dropped_story 已完成 | Step 3 | Warning | 跳过（不可撤回 done），记录 warning | N/A (continue) |
| BMM Skill 不可用 | Step 4 | Warning | 降级到 BSO 内置逻辑 (Principle 2) | N/A (degrade) |
| 依赖循环检测 | Step 5 | Error | 自动打断最弱环节，记录 warning | `partial` |
| 不可解决的依赖违规 | Step 5 | Error | 报告违规，建议人工审查 | `partial` |
| Master 不可达 | Step 6 | Error | 重试 3 次 | `failure` (if persistent) |

---

## Workflow Sequence Diagram

```
Master                    Scrum Master (CC)              BMM correct-course
  |                              |                              |
  |--- CC_TRIGGER -------------->|                              |
  |   (reason, batch_id,        |                              |
  |    user_input, added/       |                              |
  |    dropped stories)         |                              |
  |                              |                              |
  |                      Step 1: Trigger Analysis              |
  |                              |                              |
  |                      Step 2: State Assessment              |
  |                        (read sprint-status.yaml)           |
  |                              |                              |
  |                      Step 3: Impact Analysis               |
  |                        (classify affected stories)         |
  |                              |                              |
  |                      Step 4: Re-Planning                   |
  |                              |--- Skill call -------------->|
  |                              |<-- adjustment suggestions ---|
  |                              |                              |
  |                        (BSO batch re-grouping)             |
  |                              |                              |
  |                      Step 5: Dependency Re-Check (P29)     |
  |                        (validate dependency graph)         |
  |                              |                              |
  |                      Step 6: Plan Delivery                 |
  |<-- COURSE_CORRECTION --------|                              |
  |   (new_batch_plan,          |                              |
  |    impact_analysis,         |                              |
  |    recommendations)         |                              |
  |                              |                              |
  | apply new plan              |                              |
  | continue Sprint              |                              |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 4: BMM correct-course Skill 不可用时降级到 BSO 内置简化逻辑 |
| 4 | 单一状态写入入口 | 全流程: SM 不写 sprint-status.yaml，由 Master 在收到 CC 后执行状态变更 |
| 29 | Dependency validation | Step 5: 重组后的 batch plan 必须通过依赖关系图校验 |

---

_Workflow created on 2026-02-11 via BMAD workflow-builder_
_Source: course-correction.spec.md + scrum-master.md + sprint-master.md + bmad:bmm:workflows:correct-course_
