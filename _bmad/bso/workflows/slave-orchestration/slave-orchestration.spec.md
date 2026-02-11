---
name: slave-orchestration
id: SO
description: "SO: Batch-level Story orchestration -- execute Stories sequentially through complete lifecycle with Two-Phase Agent Creation, Review-Fix loops, and token budget management"
module: bso
agent: bso-sprint-slave
type: core
version: 1.0.0
status: draft
created: 2026-02-11
updated: 2026-02-11
---

# Workflow Specification: slave-orchestration

**Module:** bso
**Status:** Draft
**Version:** 1.0.0
**Created:** 2026-02-11
**Last Validated:** 2026-02-11

---

## Workflow Overview

**Goal:** Batch-level Story orchestration -- execute 3 Stories sequentially through complete lifecycle within a single Slave Agent context.

**Description:** Dispatches temporary Agents (via Master proxy) for each Story phase. Manages Review-Fix loops, progressive degradation, token budget, and per-Story post-processing. Uses Two-Phase Agent Creation (P51) -- requests Master to create empty Agent, then injects business context via TASK_ASSIGNMENT.

**Workflow Type:** Core (NEW)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Batch Initialization | Receive and validate batch params (batch_id, story_keys, session_id) |
| 2 | State Validation | Read sprint-status.yaml, verify batch Story states via U4 |
| 3 | Story Dispatch Loop | For each Story: Two-Phase create -> TASK_ASSIGNMENT -> await AGENT_COMPLETE |
| 4 | Review-Fix Management | Handle C4<->C5 fix loop with progressive degradation (P22) |
| 5 | Per-Story Post-Processing | Git Squash (P28), Track Cleanup, state write |
| 6 | Token Budget Check | Check budget after each Story (P26) |
| 7 | Batch Report | Generate batch completion report |
| 8 | Batch Complete | Send SLAVE_BATCH_COMPLETE to Master, await shutdown |

---

## Workflow Inputs

### Required Inputs

- `batch_id`: Batch identifier (format: `batch-{n}`, e.g. "batch-1")
- `story_keys[]`: Array of Story identifiers (format: `{epic}-{story}`, e.g. ["3-1", "3-2", "3-3"])
- `session_id`: Sprint session tracking ID (e.g. "sprint-2026-02-11-001")
- `resident_contacts{}`: Map of resident Agent contact info (e.g. { knowledge_researcher: "agent-id-xxx" })

### Optional Inputs

- `config_overrides.max_review_rounds`: Override default max review rounds per Story
- `config_overrides.review_strictness`: Override default review strictness level ("high" | "medium" | "low")
- `config_overrides.e2e_enabled`: Enable/disable E2E inspection phase (boolean)
- `config_overrides.git_squash_enabled`: Enable/disable per-Story git squash (boolean)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `batch_id` | Match format `batch-\d+` | abort, status: "failure" |
| `story_keys` | Non-empty array, each element matches `\d+-\d+` | abort, status: "failure", error: "Invalid story_keys" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `resident_contacts` | Non-empty map with required keys | abort, status: "failure", error: "Missing resident contacts" |
| `config_overrides.max_review_rounds` | Integer >= 1 | Use `defaults.max_review_rounds` |
| `config_overrides.review_strictness` | Value is "high", "medium", or "low" | Use `defaults.review_strictness` |

---

## State Preconditions

Stories in batch must be in valid starting states:

| Valid Starting State | Description |
|---------------------|-------------|
| `backlog` | Story not yet started |
| `story-doc-improved` | Story doc already refined |
| `ready-for-dev` | Story ready for development |
| `review` | Story in review (re-entry for fix loop) |
| `e2e-verify` | Story awaiting E2E inspection |

> **Note:** Stories in `done`, `needs-intervention`, or `skipped` states are not valid for batch dispatch and will be skipped with a warning.

## State Transitions

Per-Story state transitions follow the existing State Machine (see State-to-Agent Dispatch Table in sprint-slave.md):

| Starting State | Agent Dispatched | Success Transition | Failure Transition |
|----------------|-----------------|-------------------|-------------------|
| `backlog` | Story Creator (C2) | `story-doc-improved` | `needs-intervention` |
| `story-doc-improved` | Story Reviewer (C3) | `ready-for-dev` | `story-doc-improved` (re-refine) |
| `ready-for-dev` | Dev Runner (C4) | `review` | `ready-for-dev` (unchanged) |
| `review` | Code Reviewer (C5) | `done` or `e2e-verify` | `review` (fix loop via C4) |
| `e2e-verify` | E2E Inspector (C6) | `done` | `review` (regression found) |

> **Note:** State writes are performed atomically per-Story via U4 (status-validation). Slave Orchestrator is the single state-write entry point within the batch (Principle 4).

---

## Workflow Outputs

### Output Format

```yaml
batch_report:
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

### Output Files

- Updated `sprint-status.yaml` (per-Story atomic writes via U4)
- Git commits (per-Story, squashed if `git_squash_enabled` is true)
- Batch completion report (in-memory, sent to Master via SLAVE_BATCH_COMPLETE)

---

## Agent Integration

### Primary Agent

Sprint Slave (`bso-sprint-slave`) -- batch-level orchestrator, manages Story lifecycle within assigned batch.

### Supporting Agents (via Master proxy, Two-Phase Creation P51)

- **Story Creator** (C2) -- dispatched for Stories in `backlog` state
- **Story Reviewer** (C3) -- dispatched for Stories in `story-doc-improved` state
- **Dev Runner** (C4) -- dispatched for Stories in `ready-for-dev` or `review` (fix mode) state
- **Code Reviewer** (C5) -- dispatched for Stories in `review` state
- **E2E Inspector** (C6) -- dispatched for Stories in `e2e-verify` state

### Resident Agents (via resident_contacts)

- **Knowledge Researcher** (F1) -- on-demand for lessons injection and framework/API research
- **Scrum Master** (SM) -- course correction requests

### Workflow References

- **Consumes:** All Core Workflows (C2-C6) via Two-Phase Agent Creation
- **Triggers:** precise-git-commit (U3), status-validation (U4), git-squash (P28)
- **Reports to:** Master via SLAVE_BATCH_COMPLETE message

---

## Error Handling Summary

| Error Scenario | Detection Step | Severity | Action | Status Returned |
|---------------|---------------|----------|--------|----------------|
| Batch parameters invalid | Step 1 | Fatal | Abort batch | `failure` (batch) |
| sprint-status.yaml not found | Step 2 | Fatal | Abort batch | `failure` (batch) |
| Story state mismatch | Step 2 | Fatal (per-story) | Skip story, mark needs-intervention | `needs-intervention` (per-story) |
| Agent creation timeout | Step 3 | Error | Retry once, then mark needs-intervention | `needs-intervention` (per-story) |
| Agent execution timeout | Step 3 | Error | Mark needs-intervention, continue next Story | `needs-intervention` (per-story) |
| Review round 8+ (P22) | Step 4 | Warning | Force needs-intervention | `needs-intervention` (per-story) |
| Token budget exceeded (P26) | Step 6 | Warning | Pause batch, report to Master | `budget-exceeded` (batch) |
| Git squash conflict (P28) | Step 5 | Warning | Keep individual commits, log warning | N/A (continue) |
| TASK_ASSIGNMENT delivery failure | Step 3 | Error | Retry once, then mark needs-intervention | `needs-intervention` (per-story) |
| AGENT_COMPLETE not received | Step 3 | Error | Timeout after `agent_timeout_seconds`, mark needs-intervention | `needs-intervention` (per-story) |
| sprint-status.yaml write failure | Step 5 | Fatal | Retry with backoff, abort batch if persistent | `failure` (batch) |

---

## Implementation Notes

### Two-Phase Agent Creation (P51)

每个 Story 阶段的 Agent 创建分两步进行:

1. **Phase 1 -- Empty Agent Creation:** Slave 向 Master 发送 `AGENT_CREATE_REQUEST`，Master 创建空 Agent 并返回 Agent ID
2. **Phase 2 -- Context Injection:** Slave 向新 Agent 发送 `TASK_ASSIGNMENT`，包含 Story 上下文、配置和 resident_contacts

这种模式避免了 Agent 创建时上下文过大的问题，同时允许 Slave 控制注入时机。

### Story Dispatch Loop 内部流程

```
for each story_key in story_keys:
  1. Read current state from sprint-status.yaml
  2. Determine target Agent based on state (State-to-Agent Dispatch Table)
  3. Two-Phase create Agent via Master
  4. Send TASK_ASSIGNMENT with Story context
  5. Await AGENT_COMPLETE (with timeout)
  6. Process return value:
     - If C4 returns success -> dispatch C5 (review)
     - If C5 returns needs-fix -> dispatch C4 (fix mode) [Review-Fix loop]
     - If C5 returns passed -> proceed to E2E or done
  7. Per-Story post-processing (squash, cleanup, state write)
  8. Token budget check (P26)
     - If exceeded -> break loop, report to Master
```

### Review-Fix Loop Management (P22)

| review_round | Action | Configuration Key |
|-------------|--------|-------------------|
| < 3 | Normal fix + re-review | `defaults.max_review_rounds` |
| = 3 | Lower review_strictness one level | `review_degradation.round_3: "lower_strictness"` |
| = 5 | Fix HIGH severity only | `review_degradation.round_5: "high_only"` |
| >= 8 | Force needs-intervention | `review_degradation.round_8: "force_needs_intervention"` |

### Token Budget Management (P26)

每个 Story 处理完成后检查 token 使用量:
- 如果 `total_tokens > budget_limit * 0.9` --> 记录 warning
- 如果 `total_tokens > budget_limit` --> 暂停 batch，发送 `budget-exceeded` 报告给 Master

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 4 | Single state-write entry | Step 5: Slave 是 batch 内唯一状态写入入口，通过 U4 原子写入 |
| 5 | State is single source of truth | Step 2: 从 sprint-status.yaml 读取状态，不假设 Story 来源 |
| 22 | Review progressive degradation | Step 4: 根据 review_round 渐进降级 review 标准 |
| 26 | Token budget management | Step 6: 每 Story 完成后检查 token 预算 |
| 28 | Git squash per Story | Step 5: 可选的 per-Story commit 压缩 |
| 51 | Two-Phase Agent Creation | Step 3: 先创建空 Agent，再注入业务上下文 |

---

_Spec created on 2026-02-11 via BMAD Module workflow_
_Aligned with: sprint-slave.md, sprint-master.md, config.yaml_
