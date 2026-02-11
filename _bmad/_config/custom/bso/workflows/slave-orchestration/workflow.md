---
name: slave-orchestration
id: SO
description: "SO: Batch-level Story orchestration -- execute Stories sequentially through complete lifecycle with Two-Phase Agent Creation, Review-Fix loops, and token budget management"
module: bso
agent: bso-sprint-slave
type: core
version: 1.0.0
created: 2026-02-11
updated: 2026-02-11
status: draft
---

# Slave Orchestration Workflow (SO)

> BSO Core Workflow -- Batch 级别的 Story 编排。在单个 Slave Agent 上下文内，按序执行分配的 Stories（通常 3 个），驱动每个 Story 经历完整生命周期。使用 Two-Phase Agent Creation (P51)，管理 Review-Fix 闭环 (P22)，执行 per-Story 后处理（Git Squash P28、状态写入），并在每个 Story 完成后检查 Token Budget (P26)。

## Purpose

接收 Master 分配的 batch（一组 Story keys），在 Slave Agent 上下文中按序驱动每个 Story 从当前状态推进到 `done`（或标记为 `needs-intervention`）。Slave 是 batch 内唯一的状态写入入口（Principle 4），通过 Master proxy 创建临时 Agent 执行具体阶段工作。

## Primary Agent

**Sprint Slave** (`bso-sprint-slave`) -- batch 级别编排者，管理 Story 生命周期。

## Supporting Agents

- **Story Creator** (C2) -- `backlog` 状态的 Story 文档创建
- **Story Reviewer** (C3) -- `story-doc-improved` 状态的 Story 文档审查
- **Dev Runner** (C4) -- `ready-for-dev` 状态的 TDD 开发 / `review` 状态的定向修复
- **Code Reviewer** (C5) -- `review` 状态的代码审查
- **E2E Inspector** (C6) -- `e2e-verify` 状态的端到端验证
- **Knowledge Researcher** (F1) -- 常驻 Agent，按需提供研究支持

---

## Input Schema

```yaml
inputs:
  required:
    batch_id: "batch-1"                           # Batch 标识符（格式: batch-{n}）
    story_keys:                                    # Story 标识符数组（格式: {epic}-{story}）
      - "3-1"
      - "3-2"
      - "3-3"
    session_id: "sprint-2026-02-11-001"           # Sprint 会话跟踪 ID
    resident_contacts:                             # 常驻 Agent 联系信息
      knowledge_researcher: "agent-id-xxx"
      scrum_master: "agent-id-yyy"
  optional:
    config_overrides:
      max_review_rounds: 8                         # 每 Story 最大 review 轮数
      review_strictness: "medium"                  # Review 严格级别
      e2e_enabled: true                            # 是否启用 E2E 检查
      git_squash_enabled: true                     # 是否启用 per-Story git squash
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `batch_id` | 匹配格式 `batch-\d+` | abort, status: "failure" |
| `story_keys` | 非空数组，每个元素匹配 `\d+-\d+` | abort, status: "failure", error: "Invalid story_keys" |
| `session_id` | 非空字符串 | abort, status: "failure" |
| `resident_contacts` | 非空 map，包含必要 keys | abort, status: "failure", error: "Missing resident contacts" |
| `config_overrides.*` | 各字段类型检查 | 使用 `defaults.*` 对应默认值 |

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - "sprint-status.yaml"      # 每 Story 原子写入更新
    - "Git commit(s)"           # 每 Story 的开发提交
    - "Squashed commit(s)"      # 可选，per-Story 压缩提交
```

### Return Value (Batch Report)

```yaml
return:
  batch_id: "batch-1"
  session_id: "sprint-2026-02-11-001"
  status: "complete" | "partial" | "budget-exceeded"
  stories:
    - story_key: "3-1"
      final_state: "done"
      review_rounds: 2
      commits: ["abc1234", "def5678"]
      squashed_commit: "ghi9012"
    - story_key: "3-2"
      final_state: "done"
      review_rounds: 1
      commits: ["jkl3456"]
      squashed_commit: "mno7890"
    - story_key: "3-3"
      final_state: "needs-intervention"
      review_rounds: 8
      reason: "Review round limit exceeded (P22)"
  token_usage:
    total_tokens: 450000
    budget_limit: 500000
    remaining: 50000
  errors: []
```

---

## State Preconditions

Stories in batch must be in valid starting states:

| Valid Starting State | Next Agent | Description |
|---------------------|-----------|-------------|
| `backlog` | Story Creator (C2) | Story 尚未开始 |
| `story-doc-improved` | Story Reviewer (C3) | Story 文档已精炼 |
| `ready-for-dev` | Dev Runner (C4, dev mode) | Story 可以开发 |
| `review` | Code Reviewer (C5) / Dev Runner (C4, fix mode) | Story 在审查中 |
| `e2e-verify` | E2E Inspector (C6) | Story 等待 E2E 验证 |

> Stories in `done`, `needs-intervention`, or `skipped` states will be skipped with a warning log.

## State Transitions

| Starting State | Agent | Success Transition | Failure Transition |
|----------------|-------|-------------------|-------------------|
| `backlog` | C2 | `story-doc-improved` | `needs-intervention` |
| `story-doc-improved` | C3 | `ready-for-dev` | `story-doc-improved` (re-refine) |
| `ready-for-dev` | C4 (dev) | `review` | `ready-for-dev` (unchanged) |
| `review` | C5 | `done` or `e2e-verify` | `review` (fix loop via C4) |
| `e2e-verify` | C6 | `done` | `review` (regression found) |

---

## Workflow Steps

### Step 1: Batch Initialization

**Goal:** 接收并验证 batch 参数，初始化 batch 执行上下文。

**Actions:**
1. 接收 Master 发送的 batch 分配消息
2. 解析并验证 `batch_id`, `story_keys[]`, `session_id`, `resident_contacts{}`
3. 加载 `config.yaml` 中的默认配置，合并 `config_overrides`
4. 初始化 batch 执行上下文:
   - `stories_completed: 0`
   - `stories_total: story_keys.length`
   - `token_usage: 0`
   - `batch_errors: []`

**On Success:** 继续 Step 2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "batch_init_failure"
      message: "Invalid batch parameters: {detail}"
```

---

### Step 2: State Validation

**Goal:** 读取 sprint-status.yaml，验证 batch 中所有 Story 的状态。

**Actions:**
1. 按 `status_file_search_paths` 配置顺序查找 `sprint-status.yaml`
2. 读取并解析 sprint-status.yaml
3. 对每个 `story_key` 验证当前状态:
   - 状态在有效起始状态集合内 --> 标记为 dispatchable
   - 状态为 `done`, `needs-intervention`, `skipped` --> 标记为 skip，记录 warning
   - 状态不存在 --> 标记为 invalid，记录 error
4. 构建 dispatch plan:
   ```yaml
   dispatch_plan:
     - story_key: "3-1"
       current_state: "ready-for-dev"
       target_agent: "C4"
       dispatchable: true
     - story_key: "3-2"
       current_state: "done"
       target_agent: null
       dispatchable: false
       skip_reason: "Already in terminal state"
   ```

**On Success:** 至少有 1 个 dispatchable Story，继续 Step 3
**On Failure:**
- sprint-status.yaml 不存在 --> abort, status: "failure"
- 全部 Stories 均不可 dispatch --> status: "complete" (nothing to do), 跳转 Step 8

---

### Step 3: Story Dispatch Loop

**Goal:** 按序处理 batch 中每个 dispatchable Story，通过 Two-Phase Agent Creation 创建临时 Agent 执行阶段工作。

**Actions:**
对每个 dispatchable Story:

1. **确定目标 Agent:** 根据 Step 2 的 dispatch_plan，查 State-to-Agent Dispatch Table
2. **Phase 1 -- 空 Agent 创建 (P51):**
   - 向 Master 发送 `AGENT_CREATE_REQUEST`:
     ```yaml
     agent_type: "C4"          # 目标 Agent 类型
     story_key: "3-1"
     batch_id: "batch-1"
     ```
   - Master 创建空 Agent，返回 Agent ID
   - 超时: `agent_creation_timeout_seconds`（默认 60s）
   - 超时处理: 重试一次，仍然超时则标记 `needs-intervention`

3. **Phase 2 -- 上下文注入 (TASK_ASSIGNMENT):**
   - 向新 Agent 发送 `TASK_ASSIGNMENT`:
     ```yaml
     story_key: "3-1"
     mode: "dev"                         # 根据 state 确定
     session_id: "sprint-2026-02-11-001"
     resident_contacts: { ... }
     config_overrides: { ... }
     ```

4. **等待 AGENT_COMPLETE:**
   - 设置超时: `agent_timeout_seconds` (根据 Agent 类型配置)
   - 收到 AGENT_COMPLETE 后解析 return value
   - 超时: 标记 `needs-intervention`，继续下一个 Story

5. **处理 return value:**
   - `status: "success"` --> 进入 Step 4 或 Step 5（取决于是否需要 Review）
   - `status: "failure"` / `"needs-intervention"` --> 记录错误，继续下一个 Story
   - `status: "scope-violation"` / `"test-regression"` --> 标记 `needs-intervention`

6. **循环控制:** 如果 Story 从 C4 成功返回，自动调度 C5；如果 C5 返回 needs-fix，调度 C4 fix mode --> 进入 Step 4 管理闭环

**On Success:** 当前 Story 阶段完成，进入 Step 4 或 Step 5
**On Failure:** 记录 per-story error，继续下一个 Story

---

### Step 4: Review-Fix Management (P22)

**Goal:** 管理 C4<->C5 Review-Fix 闭环，实施渐进降级策略。

**Actions:**
1. 初始化 `review_round = 1`
2. 闭环流程:
   ```
   C4 (dev mode) --> C5 (review)
     if C5 returns "passed" --> exit loop, proceed to E2E or done
     if C5 returns "needs-fix":
       review_round++
       apply degradation rules (see below)
       dispatch C4 (fix mode) --> C5 (re-review)
       repeat
   ```
3. 渐进降级规则:

   | review_round | Action | Configuration Key |
   |-------------|--------|-------------------|
   | < 3 | 正常 fix + re-review | `defaults.max_review_rounds` |
   | = 3 | 降低 review_strictness 一级 | `review_degradation.round_3` |
   | = 5 | 仅修复 HIGH 级别 | `review_degradation.round_5` |
   | >= 8 | 强制 needs-intervention | `review_degradation.round_8` |

4. 每轮 fix 完成后重新调度 C5 re-review
5. 达到 round 8 --> 强制退出闭环，标记 `needs-intervention`

**On Success:** Review 通过，Story 进入 `done` 或 `e2e-verify` 状态
**On Failure:** 达到 review_round 上限，标记 `needs-intervention`

---

### Step 5: Per-Story Post-Processing

**Goal:** 每个 Story 完成（或失败）后执行后处理操作。

**Actions:**
1. **Git Squash (P28, 可选):**
   - 如果 `git_squash_enabled = true` 且 Story 有多个 commit:
     - 执行 git squash，合并为单个 commit
     - Squash commit message: `feat: Story {epic}.{story}: {title} (squashed)`
     - 如果 squash 冲突 --> 保留原始 commits，记录 warning
   - 如果 `git_squash_enabled = false` --> 跳过

2. **Track Cleanup:**
   - 清理 Story 相关的临时文件（如有）
   - 清理 Agent 创建的临时上下文

3. **State Write (via U4):**
   - 原子写入 sprint-status.yaml:
     ```yaml
     story_key: "3-1"
     state: "done"                    # 或 "needs-intervention"
     review_rounds: 2
     last_updated: "2026-02-11T10:30:00Z"
     updated_by: "slave-orchestration"
     ```
   - 写入失败 --> 重试 3 次，间隔递增（1s, 2s, 4s）
   - 持续失败 --> abort batch

**On Success:** 继续 Step 6
**On Failure:** State write 持续失败 --> abort batch, status: "failure"

---

### Step 6: Token Budget Check (P26)

**Goal:** 每个 Story 完成后检查 token 使用量，防止超出预算。

**Actions:**
1. 计算当前累积 token 使用量
2. 与 `token_budget_limit` 对比:

   | Condition | Action |
   |-----------|--------|
   | `usage < budget * 0.9` | 正常，继续下一个 Story |
   | `usage >= budget * 0.9` | 记录 warning: "Token budget approaching limit" |
   | `usage >= budget` | 暂停 batch，跳转 Step 7 生成报告 |

3. 如果预算充足且还有待处理的 Story --> 回到 Step 3 处理下一个 Story
4. 如果所有 Story 已处理完毕 --> 进入 Step 7

**On Budget Exceeded:** 暂停剩余 Story，batch status 设为 "budget-exceeded"

---

### Step 7: Batch Report

**Goal:** 生成 batch 完成报告。

**Actions:**
1. 汇总所有 Story 的处理结果:
   - 每个 Story 的最终状态
   - Review 轮数
   - Commit 信息（包括 squash 后的 commit）
   - 错误和警告
2. 计算 batch 级别统计:
   - `stories_completed`: 成功完成的 Story 数
   - `stories_failed`: 标记为 needs-intervention 的 Story 数
   - `stories_skipped`: 跳过的 Story 数
3. 确定 batch status:
   - 全部成功 --> `complete`
   - 部分成功 --> `partial`
   - 因 token 预算中断 --> `budget-exceeded`
4. 组装 batch_report 结构

**On Success:** 报告生成，继续 Step 8

---

### Step 8: Batch Complete

**Goal:** 向 Master 发送 batch 完成报告，等待 shutdown 指令。

**Actions:**
1. 向 Master 发送 `SLAVE_BATCH_COMPLETE` 消息:
   ```yaml
   type: "SLAVE_BATCH_COMPLETE"
   batch_id: "batch-1"
   session_id: "sprint-2026-02-11-001"
   report: { ... }               # Step 7 生成的 batch_report
   ```
2. 等待 Master 的 shutdown 确认
3. 收到 shutdown 后清理 Slave Agent 上下文
4. Agent 退出

**On Success:** Slave Agent 正常退出
**On Timeout:** 如果 Master 长时间不响应，自动退出（安全超时: 300s）

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Impact |
|---------------|----------------|----------|--------|---------------|
| Batch 参数无效 | Step 1 | Fatal | Abort batch | batch: "failure" |
| sprint-status.yaml 不存在 | Step 2 | Fatal | Abort batch | batch: "failure" |
| Story 状态不在有效集合内 | Step 2 | Warning | Skip story | per-story: skipped |
| Agent 创建超时 | Step 3 | Error | 重试一次，失败则标记 | per-story: "needs-intervention" |
| Agent 执行超时 | Step 3 | Error | 标记，继续下一个 Story | per-story: "needs-intervention" |
| TASK_ASSIGNMENT 发送失败 | Step 3 | Error | 重试一次，失败则标记 | per-story: "needs-intervention" |
| Review round >= 8 (P22) | Step 4 | Warning | 强制退出闭环 | per-story: "needs-intervention" |
| Git squash 冲突 (P28) | Step 5 | Warning | 保留原始 commits | N/A (continue) |
| State write 失败 | Step 5 | Fatal | 重试 3 次，持续失败则 abort batch | batch: "failure" |
| Token 预算超出 (P26) | Step 6 | Warning | 暂停 batch | batch: "budget-exceeded" |

### Timeout Configuration

- Agent 创建超时: `agent_creation_timeout_seconds: 60`
- Agent 执行超时 (按类型): `agent_timeout_seconds.*` (C2: 600, C4: 1800, C5: 900, C6: 600)
- Master shutdown 确认超时: `master_shutdown_timeout_seconds: 300`

---

## Workflow Sequence Diagram

```
Master                    Sprint Slave (SO)            Temp Agent (C4/C5/...)
  |                              |                              |
  |--- BATCH_ASSIGNMENT -------->|                              |
  |   (batch_id, story_keys,    |                              |
  |    session_id, contacts)    |                              |
  |                              |                              |
  |                      Step 1: Batch Init                    |
  |                      Step 2: State Validation              |
  |                              |                              |
  |                      Step 3: Story Dispatch Loop           |
  |                              |                              |
  |<-- AGENT_CREATE_REQUEST -----|                              |
  |--- AGENT_CREATED (id) ----->|                              |
  |                              |--- TASK_ASSIGNMENT --------->|
  |                              |                              |
  |                              |        (Agent executes)      |
  |                              |                              |
  |                              |<-- AGENT_COMPLETE -----------|
  |                              |                              |
  |                      Step 4: Review-Fix (if needed)        |
  |                              |                              |
  |<-- AGENT_CREATE_REQUEST -----|  (create C5 for review)     |
  |--- AGENT_CREATED (id) ----->|                              |
  |                              |--- TASK_ASSIGNMENT --------->| (C5)
  |                              |<-- AGENT_COMPLETE -----------|
  |                              |                              |
  |                      Step 5: Post-Processing               |
  |                        (squash, state write)               |
  |                              |                              |
  |                      Step 6: Token Budget Check            |
  |                        (continue or pause)                 |
  |                              |                              |
  |                      ... repeat for next Story ...         |
  |                              |                              |
  |                      Step 7: Batch Report                  |
  |                              |                              |
  |<-- SLAVE_BATCH_COMPLETE -----|                              |
  |--- SHUTDOWN_CONFIRMED ----->|                              |
  |                              | (exit)                       |
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 4 | 单一状态写入入口 | Step 5: Slave 是 batch 内唯一写入 sprint-status.yaml 的入口，通过 U4 原子写入 |
| 5 | 状态是唯一真实来源 | Step 2: 从 sprint-status.yaml 读取状态，构建 dispatch plan |
| 22 | Review 渐进降级 | Step 4: 根据 review_round 渐进降低 review 标准，round 8 强制退出 |
| 26 | Token 预算管理 | Step 6: 每 Story 完成后检查 token 用量，超出则暂停 batch |
| 28 | Git squash per Story | Step 5: 可选的 per-Story commit 压缩，冲突时降级保留原始 commits |
| 51 | Two-Phase Agent Creation | Step 3: Phase 1 创建空 Agent，Phase 2 注入业务上下文 |

---

_Workflow created on 2026-02-11 via BMAD workflow-builder_
_Source: slave-orchestration.spec.md + sprint-slave.md + sprint-master.md + config.yaml_
