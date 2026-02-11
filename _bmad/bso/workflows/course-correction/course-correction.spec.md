---
name: course-correction
module: bso
status: Completed
version: 1.0.0
created: 2026-02-11
last_validated: 2026-02-11
agent: bso-scrum-master
type: feature
---

# Workflow Specification: course-correction

**Module:** bso
**Status:** Draft
**Version:** 1.0.0
**Created:** 2026-02-11
**Last Validated:** 2026-02-11

---

## Workflow Overview

**Goal:** Navigate significant changes during Sprint execution by analyzing impact, proposing solutions, and re-planning batch structure.

**Description:** Adapter workflow for SM Agent. Wraps the existing `bmad:bmm:workflows:correct-course` with BSO-specific batch re-planning logic. Triggered by CC_TRIGGER from Master (user-initiated or automated). Analyzes the current Sprint state, determines impact on pending Stories/batches, and generates a new batch plan for the remaining work.

**Workflow Type:** Feature (NEW)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Trigger Analysis | Parse CC_TRIGGER reason and context |
| 2 | State Assessment | Read sprint-status.yaml, assess current Sprint state |
| 3 | Impact Analysis | Determine which pending Stories/batches are affected |
| 4 | Re-Planning | Generate new batch plan for remaining Stories |
| 5 | Dependency Re-Check | Validate dependency graph for new plan (P29) |
| 6 | Plan Delivery | Send COURSE_CORRECTION to Master |

---

## Workflow Inputs

### Required Inputs

- `reason`: Trigger reason (enum: `user_request` | `repeated_failures` | `new_requirements`)
- `current_batch_id`: The batch that was active when course correction was triggered

### Optional Inputs

- `user_input`: Free text from user describing the desired change (used when `reason: user_request`)
- `added_stories[]`: Array of new Story keys to add to the Sprint
- `dropped_stories[]`: Array of Story keys to remove from the Sprint

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `reason` | Value is `user_request`, `repeated_failures`, or `new_requirements` | abort, status: "failure", error: "Invalid CC trigger reason" |
| `current_batch_id` | Match format `batch-\d+` | abort, status: "failure", error: "Invalid batch_id" |
| `user_input` | String, max 2000 chars | Truncate to 2000 chars with warning |
| `added_stories` | Each element matches `\d+-\d+` (if provided) | abort, status: "failure", error: "Invalid added_stories format" |
| `dropped_stories` | Each element matches `\d+-\d+` (if provided) | abort, status: "failure", error: "Invalid dropped_stories format" |

---

## State Preconditions

Sprint must be in active execution (at least one batch started):

| Condition | Check | On Failure |
|-----------|-------|------------|
| Sprint active | `sprint-status.yaml` exists and has at least one Story not in `backlog` | abort, status: "failure", error: "Sprint not active" |
| Current batch valid | `current_batch_id` exists in sprint context | abort, status: "failure", error: "Unknown batch_id" |

> **Note:** Course correction can be triggered at any point during Sprint execution, regardless of individual Story states.

## State Transitions

Course correction does not directly modify Story states. It generates a new batch plan that the Master will apply:

| Aspect | Before | After |
|--------|--------|-------|
| Batch structure | Original batch plan | New batch plan (re-ordered/re-grouped) |
| Added Stories | Not in sprint-status.yaml | Master adds them post-CC |
| Dropped Stories | In sprint-status.yaml (various states) | Master marks as `skipped` post-CC |
| In-progress Stories | Current state preserved | No change (continue current phase) |

> **Note:** SM (Scrum Master) does not write to sprint-status.yaml. All state modifications are performed by Master after receiving the COURSE_CORRECTION message.

---

## Workflow Outputs

### Output Format

```yaml
course_correction:
  type: "COURSE_CORRECTION"
  status: "success" | "no-action-needed" | "partial" | "failure"
  trigger:
    reason: "user_request"
    user_input: "..."
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

- No file writes (SM does not write sprint-status.yaml)
- COURSE_CORRECTION message sent to Master (in-memory)

---

## Agent Integration

### Primary Agent

Scrum Master (`bso-scrum-master`) -- Sprint 级别管理者，负责规划和协调调整。

### Supporting Agents

- None directly dispatched. SM operates independently for course correction.

### Workflow References

- **Consumes:** `bmad:bmm:workflows:correct-course` via Skill call (BMM base course correction logic)
- **Triggered by:** Master via CC_TRIGGER message
- **Reports to:** Master via COURSE_CORRECTION message

---

## Error Handling Summary

| Error Scenario | Detection Step | Severity | Action | Status Returned |
|---------------|---------------|----------|--------|----------------|
| Invalid trigger reason | Step 1 | Fatal | Abort | `failure` |
| sprint-status.yaml not found | Step 2 | Fatal | Abort | `failure` |
| Sprint not active | Step 2 | Fatal | Abort, cannot course-correct before Sprint starts | `failure` |
| No pending Stories to re-plan | Step 3 | Warning | Return empty plan with advisory | `no-action-needed` |
| Dependency cycle detected (P29) | Step 5 | Error | Remove cyclic dependency, log warning, suggest manual review | `partial` |
| BMM correct-course Skill unavailable | Step 4 | Warning | Use BSO-native re-planning fallback | N/A (degrade) |
| Added Story key conflicts with existing | Step 3 | Warning | Skip duplicate, log warning | N/A (continue) |

---

## Implementation Notes

### Trigger Reasons

| Reason | Source | Typical Scenario |
|--------|--------|-----------------|
| `user_request` | User via Master interactive mode | User wants to reprioritize, add/drop Stories |
| `repeated_failures` | Master automated detection | Multiple Stories in same batch marked `needs-intervention` |
| `new_requirements` | User via Master | New requirements discovered mid-Sprint |

### BMM Correct-Course Integration

本 workflow 封装 BMM 的通用 correct-course 逻辑，增加 BSO 特有的 batch re-planning:

1. **BMM 层:** 分析变更影响、提出调整建议（通用项目管理逻辑）
2. **BSO 层:** 将 BMM 建议转化为具体的 batch 重组方案（batch_id, story_keys 分配）

如果 BMM correct-course Skill 不可用，BSO 层使用内置的简化逻辑:
- 按 Epic 顺序重组剩余 Stories
- 每 batch 3 个 Stories
- 尊重依赖关系排序

### Dependency Re-Check (P29)

重组后的 batch plan 必须经过依赖关系验证:
- Story 间的前置依赖必须在同一 batch 或更早的 batch 中完成
- 检测到循环依赖时自动打断最弱环节（最少下游依赖的 Story）
- 跨 Epic 依赖特别标注，提醒 Master 注意

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | 降级优于报错 | Step 4: BMM Skill 不可用时使用 BSO 内置逻辑 |
| 4 | 单一状态写入入口 | SM 不写 sprint-status.yaml，由 Master 执行状态变更 |
| 29 | Dependency validation | Step 5: 重组后的 batch plan 必须通过依赖关系校验 |

---

_Spec created on 2026-02-11 via BMAD Module workflow_
_Aligned with: scrum-master.md, sprint-master.md, bmad:bmm:workflows:correct-course_
