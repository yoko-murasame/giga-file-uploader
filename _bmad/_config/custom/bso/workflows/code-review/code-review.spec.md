# Workflow Specification: code-review

**Module:** bso
**Status:** Validated
**Created:** 2026-02-07
**Updated:** 2026-02-07
**Workflow ID:** C5
**Agent:** bso-review-runner

---

## Workflow Overview

**Goal:** Adversarial code review with progressive degradation and strictness-based decision.

**Description:** Dispatches Review Runner (using Architect persona for independence from Dev) to perform objective code review. Implements progressive degradation as review rounds increase (Principle 22). Uses a fixed, objective review checklist (Principle 6) to prevent subjective oscillation. Returns verdict of passed / needs-fix / needs-intervention to Orchestrator.

**Workflow Type:** Core (C5)

---

## Steps

| Step | Name | Goal |
|------|------|------|
| 1 | State Validation | Confirm Story is in `review` state before proceeding |
| 2 | Progressive Degradation Check | Apply degradation rules based on current review round (Principle 22) |
| 3 | Lessons Injection | Inject relevant historical lessons via Knowledge Researcher (F1) |
| 4 | Headless Persona Load | Load BMM Architect (Winston) persona in headless mode (Principle 30) |
| 5 | Context Loading | Read Story AC, code changes (git diff), project-context.md, lessons context |
| 6 | Objective Review | Execute objective review checklist CR-1 through CR-6 (Principle 6) |
| 7 | Finding Classification | Classify findings by severity and apply review_strictness_threshold filter |
| 8 | Verdict Decision | Determine passed / needs-fix based on filtered findings |
| 9 | Review Report Generation | If needs-fix: generate structured fix instructions with file paths |
| 10 | Return | Return status + review report + review_strictness_threshold to Orchestrator |

---

## Progressive Degradation Schedule

| Round | Degradation Rule | review_strictness_threshold Behavior | Scope | Action |
|-------|-----------------|-------------------|-------|--------|
| 1-2 | None | As configured (e.g., `medium`) | All issues at or above review_strictness_threshold | Normal review |
| 3-4 | `lower_strictness` | Auto-lower by one tier: high->medium, medium->low, low->low (floor) | All issues at or above new review_strictness_threshold | Relaxed review |
| 5-7 | `high_only` | Override to HIGH only | Skip MEDIUM and LOW entirely | Focus on critical |
| >= 8 or >= max_review_rounds | `force_needs_intervention` | N/A -- stop reviewing | N/A | Return needs-intervention immediately |

---

## Workflow Inputs

### Required Inputs

- `story_key`: Story identifier (format: `\d+-\d+`)
- `session_id`: Sprint session tracking ID (non-empty string)
- `review_round`: Current round number (positive integer >= 1, from Orchestrator)

### Optional Inputs

- `config_overrides.review_strictness_threshold`: Override fix severity threshold (one of: "high", "medium", "low")
- `config_overrides.max_review_rounds`: Override max review rounds (positive integer, default from config.yaml: 10)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Format `\d+-\d+` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `review_round` | Positive integer >= 1 | abort, status: "failure" |
| `config_overrides.review_strictness_threshold` | One of: "high", "medium", "low" (if provided) | Ignore override, use config.yaml default |
| `config_overrides.max_review_rounds` | Positive integer (if provided) | Ignore override, use config.yaml default |

---

## Workflow Outputs

### Return Value

```yaml
return:
  status: "passed" | "needs-fix" | "needs-intervention"
  story_key: "3-1"
  mode: "review"
  session_id: "sprint-2026-02-07-001"
  review_round: 1
  results:
      verdict: "passed" | "needs-fix" | "needs-intervention"
      effective_review_strictness_threshold: "medium"
      degradation_applied: "none"       # none | lower_strictness | high_only | force_needs_intervention
      findings_total: 3
      findings_by_severity:
        HIGH: 1
        MEDIUM: 1
        LOW: 1
      findings_after_filter: 2
      findings:
        - id: "RR-001"
          severity: "HIGH"
          category: "security"
          description: "Hardcoded database password in ConnectionConfig.java"
          affected_files:
            - "src/config/ConnectionConfig.java"
          fix_instruction: "Move password to environment variable, reference via @Value annotation"
      review_report_path: "path/to/review-report-3-1-round-1.md"
      knowledge_queries: []
  errors: []
```

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|----------------|
| `review` | `review` | abort, status: "failure", error: "Story not in review state" |

## State Transitions

| Mode | Before | After (passed) | After (needs-fix) | After (needs-intervention) | After (failure) |
|------|--------|---------------|-------------------|---------------------------|----------------|
| `review` | `review` | `done` (or `e2e-verify`) | (stays `review`, dispatches C4 fix) | `needs-intervention` | `needs-intervention` |

> **Note:** State transitions are executed by the Orchestrator after receiving the return value. This workflow does NOT directly write to sprint-status.yaml (Principle 4).

---

## Agent Integration

### Primary Agent

Review Runner (`bso-review-runner`) -- loads BMM Architect (Winston) persona in headless mode. Persona ID: `role_mapping.review_runner_persona`. Different from Dev Runner (Amelia) for cognitive independence (Principle 30).

### Supporting Agents

| Agent | Role in This Workflow |
|-------|----------------------|
| Knowledge Researcher (F1) | Lessons injection (Step 3) |
| Dev Runner (C4) | Downstream consumer -- receives fix instructions when verdict is `needs-fix` |

---

## Review Checklist (Objective, Fixed -- Principle 6)

| # | Checklist Item | Pass Criteria |
|---|----------------|---------------|
| CR-1 | AC Satisfaction | Every AC in the Story has corresponding implementation |
| CR-2 | Test Coverage | Every AC has at least one test that would fail if the AC were unmet |
| CR-3 | Error Handling | External calls have try/catch, user inputs validated, meaningful error messages |
| CR-4 | Security Baseline | No hardcoded credentials, no raw SQL concatenation, no unescaped user input |
| CR-5 | Performance Baseline | No unbounded iterations, no N+1 queries, no sync blocking in async contexts |
| CR-6 | Scope Compliance | No modifications to files outside Story-declared scope (Principle 19) |

### Explicitly Out of Scope

- Variable naming style preferences (beyond clarity)
- Comment density or documentation style
- Design pattern choices (unless causing measurable defect)
- Code formatting (delegated to linters)

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|----------|---------------|
| Story not in `review` state | Step 1 | Fatal | Abort immediately | `failure` |
| `sprint-status.yaml` not found | Step 1 | Fatal | Abort immediately | `failure` |
| Story file not found | Step 5 | Fatal | Abort immediately | `failure` |
| No code changes found | Step 5 | Fatal | Abort immediately | `failure` |
| Persona load failure | Step 4 | Fatal | Abort immediately | `failure` |
| Git diff command failure | Step 5 | Fatal | Abort immediately | `failure` |
| BMM code-review Skill call failure | Step 6 | Fatal | Abort immediately | `failure` |
| Knowledge Researcher timeout | Step 3 | Warning | Continue without lessons context | Continue (degraded) |
| `project-context.md` not found | Step 5 | Warning | Continue with reduced context | Continue (degraded) |
| Round 8+ degradation | Step 2 | Info | Return `needs-intervention` immediately | `needs-intervention` |

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `defaults.review_strictness` | `config.yaml` | `"normal"` | Step 2 |
| `defaults.max_review_rounds` | `config.yaml` | 10 | Step 2 |
| `defaults.review_degradation.round_3` | `config.yaml` | `"lower_strictness"` | Step 2 |
| `defaults.review_degradation.round_5` | `config.yaml` | `"high_only"` | Step 2 |
| `defaults.review_degradation.round_8` | `config.yaml` | `"force_needs_intervention"` | Step 2 |
| `defaults.agent_timeout_seconds.code_review` | `config.yaml` | 900 (15 min) | Orchestrator |
| `defaults.agent_timeout_seconds.knowledge_research` | `config.yaml` | 600 (10 min) | Step 3 |
| `role_mapping.review_runner_persona` | `config.yaml` | `"bmad:bmm:agents:architect"` | Step 4 |
| `workflow_mapping.code_review` | `config.yaml` | `"bmad:bmm:workflows:code-review"` | Step 6 |
| `e2e_inspection.enabled` | `config.yaml` | `false` | Step 8 |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Orchestrator timeout enforcement |
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Step 1 |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Steps 3, 5 (lessons timeout / project-context missing -> continue degraded) |
| 3 | Budget controls everything | Step 2 (max review rounds, degradation) |
| 4 | Single entry point for state writes | Step 10 (Orchestrator writes state, not this workflow) |
| 5 | State is the single source of truth | Step 1 (validate state before acting) |
| 6 | Objective checklist over subjective aesthetics | Step 6 (fixed checklist CR-1..CR-6, no invented criteria) |
| 8 | Headless Persona Loading | Step 4 (skip interactive behavior) |
| 15 | Per-phase timeout | Orchestrator enforces 900s timeout |
| 19 | Dev Scope Guard | Step 6 CR-6 (scope compliance check) |
| 22 | Review progressive degradation | Step 2 (round-based degradation schedule) |
| 25 | Lessons injection budget | Step 3 (max 10 entries) |
| 30 | Review persona independence | Step 4 (Architect Winston, not Dev Amelia) |

---

_Spec validated on 2026-02-07 against workflow.md implementation via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Source: code-review.spec.md (original placeholder) + workflow.md (validated implementation)_
