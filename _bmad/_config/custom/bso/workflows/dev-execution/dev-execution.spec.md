---
name: dev-execution
id: C4
description: "C4: TDD development (dev mode) and targeted fix (fix mode) with Scope Guard, Test Snapshot, and Git Safeguard"
module: bso
agent: bso-dev-runner
type: core
version: 1.1.0
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: dev-execution

**Module:** bso
**Status:** Validated
**Version:** 1.1.0
**Created:** 2026-02-07
**Last Validated:** 2026-02-07

---

## Workflow Overview

**Goal:** TDD development (dev mode) and targeted code fixes (fix mode) with scope guard and test snapshot protection.

**Description:** Dispatches Dev Runner for full TDD implementation or targeted fixes. Enforces Dev Scope Guard (Principle 19), Fix-before-snapshot (Principle 20), and Git Commit Safeguard (Principle 21). Includes Lessons Injection (Principle 25) for experience-based warning context.

**Workflow Type:** Core (C4)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | State Validation | Verify Story is in correct state for the requested mode |
| 2 | Lessons Injection | Inject dev-execution phase lessons from experience library (Principle 25) |
| 3 | Context Loading | Read Story doc, project-context.md, knowledge cache index.yaml |
| 4 | Headless Persona Load | Load BMM Dev (Amelia) persona in headless mode (Principle 8) |
| 5 | Dev Scope Guard Setup | Parse Story for allowed file modification scope, build whitelist (Principle 19) |
| 6 | Test Snapshot (fix mode) | Record current test pass count before fix (Principle 20) |
| 7 | TDD / Fix Execution | Execute BMM dev-story TDD workflow or targeted fix per findings |
| 8 | Scope Verification | Verify no out-of-scope file modifications, rollback violations (Principle 19) |
| 9 | Test Regression Check (fix mode) | Compare test count vs snapshot, rollback if decreased (Principle 20) |
| 10 | Git Commit | Precise per-file commit with sensitive file safeguard via U3 (Principle 21) |
| 11 | Return | Return status + structured results to Orchestrator |

---

## Workflow Inputs

### Required Inputs

- `story_key`: Story identifier (format: `{epic}-{story}`, e.g. "3-1")
- `mode`: "dev" | "fix"
- `session_id`: Sprint session tracking ID

### Optional Inputs

- `config_overrides.review_strictness_threshold`: Severity threshold for fix mode ("high" | "medium" | "low")
- Review feedback (in fix mode, embedded in Story .md)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Match format `\d+-\d+` | abort, status: "failure" |
| `mode` | Value is "dev" or "fix" | abort, status: "failure", error: "Invalid mode" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `config_overrides.review_strictness_threshold` | Value is "high", "medium", or "low" (fix mode only) | Use `defaults.review_strictness` |

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|---------------|
| `dev` | `ready-for-dev` | abort, status: "failure", error: "Story not in ready-for-dev state" |
| `fix` | `review` | abort, status: "failure", error: "Story not in review state" |

## State Transitions

| Mode | Before | After (success) | After (failure) |
|------|--------|-----------------|-----------------|
| `dev` | `ready-for-dev` | `review` | `ready-for-dev` (unchanged) |
| `fix` | `review` | `review` (fix complete, await re-review) | `review` (unchanged) |

> **Note:** State transitions are executed by Orchestrator upon receiving the return value. This workflow does not write to sprint-status.yaml directly (Principle 4: single state-write entry point).

---

## Workflow Outputs

### Output Files

- Source code files (project-specific)
- Test files (project-specific)
- Git commit(s)

### Return Value

```yaml
return:
  status: "success" | "failure" | "scope-violation" | "test-regression" | "needs-intervention"
  story_key: "3-1"
  mode: "dev" | "fix"
  session_id: "sprint-2026-02-07-001"
  results:
    tasks_completed: 5
    tasks_total: 5
    tests_written: 8
    tests_total: 42
    tests_passed: 42
    tests_failed: 0
    test_pass_rate: "100%"
    files_modified:
      - "src/modules/project/ProjectService.java"
      - "src/test/modules/project/ProjectServiceTest.java"
    commits:
      - hash: "abc1234"
        message: "feat: Story 3.1: 项目管理CRUD"
    scope_violations: []
    fix_snapshot:                        # fix mode only
      snapshot_count: 42
      post_fix_count: 44
      regression: false
    knowledge_queries:
      - query: "JeecgBoot @Dict annotation usage"
        result: "cache-hit"
    lessons_injected: 3
  errors: []
```

---

## Agent Integration

### Primary Agent

Dev Runner (`bso-dev-runner`) -- BMM Dev (Amelia) persona, headless mode.

### Supporting Agents

- Knowledge Researcher (F1) -- on-demand for lessons injection and framework/API research

### Workflow References

- **Consumes:** BMM dev-story via Skill call (`bmad:bmm:workflows:dev-story`)
- **Triggers:** Knowledge Researcher (F1), precise-git-commit (U3)

---

## Error Handling Summary

| Error Scenario | Detection Step | Severity | Action | Status Returned |
|---------------|---------------|----------|--------|----------------|
| Story state mismatch | Step 1 | Fatal | Abort | `failure` |
| Story .md not found | Step 3 | Fatal | Abort | `failure` |
| project-context.md missing | Step 3 | Warning | Log, continue | N/A |
| Knowledge Researcher unavailable | Step 2 | Warning | Degrade (Principle 2) | N/A |
| BMM Dev Persona load failed | Step 4 | Warning | Fallback lean persona | N/A |
| File scope declaration missing | Step 5 | Warning | Infer from tasks | N/A |
| Test suite run failure | Step 6, 7, 9 | Fatal | Abort | `failure` |
| TDD tests not passing (dev) | Step 7 | Error | Retry 2 rounds | `failure` |
| Knowledge Researcher timeout | Step 7 | Warning | Skip, continue with existing context | N/A |
| Knowledge Research budget exhausted | Step 7 | Info | Stop new queries, continue | N/A |
| Scope violation (non-critical) | Step 8 | Warning | Rollback file, continue | N/A |
| Scope violation (critical) | Step 8 | Critical | Abort | `scope-violation` |
| Test regression (fix mode) | Step 9 | Critical | Rollback all changes | `test-regression` |
| Sensitive file detected | Step 10 | Critical | Abort commit | `needs-intervention` |
| Git commit failure | Step 10 | Error | Report error | `failure` |
| Agent timeout | Any | Fatal | Detected by Orchestrator | `needs-intervention` |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Steps 2, 4, 7: continue with degraded capability |
| 4 | Single state-write entry | Step 11: Orchestrator manages state transitions |
| 5 | State is single source of truth | Step 1: validate state only |
| 8 | Headless Persona Loading | Step 4: load persona knowledge without interaction |
| 19 | Dev Scope Guard | Step 5: whitelist setup; Step 8: verification |
| 20 | Fix-before-snapshot | Step 6: record snapshot; Step 9: regression check |
| 21 | Git Commit Safeguard | Step 10: per-file staging + sensitive file check |
| 22 | Review progressive degradation | C4<->C5 fix loop (Orchestrator-managed) |
| 25 | Lessons injection budget | Step 2: max 10 entries |

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Aligned with: workflow.md v1.1.0, dev-runner.md, dev-runner.spec.md_
