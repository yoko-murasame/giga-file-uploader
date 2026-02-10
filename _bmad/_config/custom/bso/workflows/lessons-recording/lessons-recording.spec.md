# Workflow Specification: lessons-recording

**Module:** bso
**Status:** Validated
**Created:** 2026-02-07
**Updated:** 2026-02-07
**Workflow ID:** U5
**Agent:** orchestrator

---

## Workflow Overview

**Goal:** Capture error patterns from agent execution and distill into actionable lessons.

**Description:** Detects error events from agent return values (6 trigger condition types), distills each to a <= 2 line actionable summary with phase tag and code path reference, performs duplicate detection against existing entries, and appends to `_lessons-learned.md`. Executed inline by Orchestrator after any agent returns with an error. Recorded entries are consumed by Lessons Injection (U6) in subsequent sprints, enabling "the system gets smarter with use".

**Workflow Type:** Utility (U5)

---

## Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Event Detection | Identify error event type(s) from agent return value against 6 trigger conditions |
| 2 | Context Extraction | Extract relevant code paths, framework names, error details from agent return |
| 3 | Distillation | Compress error context to <= 2 line actionable summary with phase tag |
| 4 | Duplicate Detection | Fuzzy match against existing `_lessons-learned.md` entries to avoid redundancy |
| 5 | Append Write | Append non-duplicate entries to `_lessons-learned.md` (append-only, never modify existing) |
| 6 | Return | Return recording result (events detected, entries recorded/skipped) to Orchestrator |

---

## Trigger Conditions (6 Error Event Types)

| # | Event Type ID | Trigger Condition | Phase Tag |
|---|--------------|-------------------|-----------|
| 1 | `review_max_rounds` | Code review exceeded max rounds (`needs-intervention` + rounds >= max) | `code-review` |
| 2 | `dev_failure_auto_fixed` | Dev failure auto-fixed (`success` + `auto_fix_applied == true`) | `dev-execution` |
| 3 | `high_severity_issues` | Code review found HIGH severity issues | `code-review` |
| 4 | `agent_needs_intervention` | Agent marked `needs-intervention` | current phase |
| 5 | `knowledge_researcher_timeout` | Knowledge Researcher call timed out | current phase |
| 6 | `e2e_verification_failure` | E2E browser verification failed | `e2e-inspection` |

> Single agent return matches at most 3 events (priority order, truncate with warning).

---

## Workflow Inputs

### Required Inputs

- `session_id`: Sprint session tracking ID (non-empty string)
- `story_key`: Story identifier that triggered the error (format: `\d+-\d+`)
- `phase`: Phase where the error occurred (valid phase tag)
- `event_type`: Error event type (one of 6 trigger condition IDs)
- `agent_return`: Agent raw return value (non-empty object with `status` field)

### Optional Inputs

- `code_paths`: Related code path references (array of strings)
- `framework_context`: Related framework name (string)
- `additional_context`: Extra context description (string)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `session_id` | Non-empty string | skip recording, log warning |
| `story_key` | Format `\d+-\d+` | skip recording, log warning |
| `phase` | Valid phase tag | skip recording, log warning |
| `event_type` | One of 6 trigger condition IDs | skip recording, log warning |
| `agent_return` | Non-empty object with `status` field | skip recording, log warning |

> **Note:** Input validation failure uses skip strategy (not abort) -- recording failure must never affect Sprint main flow (Principle 2: degrade over error).

---

## Workflow Outputs

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
        summary: "JeecgBoot defHttp auto-unwraps ApiResponse..."
        ref: "src/views/project/ProjectList.vue:85"
    file_path: "_bmad-output/knowledge-base/lessons/_lessons-learned.md"
    total_entries_in_file: 47
  errors: []
```

### Status Value Mapping

| Status | Meaning | Trigger Condition |
|--------|---------|-------------------|
| `recorded` | Entries successfully written | At least one non-duplicate entry appended |
| `skipped` | No entries written | No matching events, all duplicates, or input validation failure |
| `failure` | Write operation failed | File append failed or permission error |

---

## Entry Format Specification

### Standard Format

```
- [YYYY-MM-DD] [phase-tag] Summary content. Ref: file/path:line
```

### Format Constraints

- Each summary <= 2 lines (single line recommended)
- Each line <= 80 characters (soft limit)
- Use Chinese for technical concepts, preserve English technical terms
- Use affirmative tone ("X is required" not "X is missing")
- Valid phase tags: `story-creation`, `story-review`, `dev-execution`, `code-review`, `e2e-inspection`

---

## Agent Integration

### Primary Agent

Orchestrator (`bso-sprint-orchestrator`) -- this workflow executes as Orchestrator inline logic, no independent agent dispatch. Triggered after any agent returns with an error event.

### Callers / Consumers

| Caller | Invocation Scenario | Frequency |
|--------|-------------------|-----------|
| Sprint Orchestrator (C1) | Inline call after agent error return | Per error event |
| Lessons Injection (U6) | Reads `_lessons-learned.md` produced by this workflow | Per agent startup |

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|----------|---------------|
| Input validation failure | Input Validation | Warning | Skip recording, log warning (no Sprint impact) | `skipped` |
| No matching event types | Step 1 | Info | Normal return (nothing to record) | `skipped` |
| Context extraction partial failure | Step 2 | Warning | Use defaults for missing fields, continue | Continue |
| Distillation failure | Step 3 | Warning | Skip that entry, record remaining | Continue |
| All entries are duplicates | Step 4 | Info | Return skipped, no new writes | `skipped` |
| `_lessons-learned.md` not found | Step 5 | Recoverable | Auto-create file with header, continue | Continue |
| File append write failure | Step 5 | Error | Report write error (no Sprint impact) | `failure` |
| File permission denied | Step 5 | Error | Report permission error | `failure` |
| Single return matches > 3 events | Step 1 | Info | Truncate to first 3 by priority, log warning | Continue |
| File write verification failure | Step 5 | Error | Report verification error | `failure` |

### Failure Isolation

This workflow's failure **never affects Sprint main flow**. Orchestrator uses try-catch pattern:
- Recording success --> continue next Story
- Recording failure --> log warning, continue next Story
- Recording itself never triggers `needs-intervention`

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------| --------|
| `knowledge_research.knowledge_base_path` | `config.yaml` | `"{output_folder}/knowledge-base"` | Step 5 |
| `defaults.max_review_rounds` | `config.yaml` | 10 | Step 1 (review_max_rounds event detection) |
| `defaults.max_story_review_rounds` | `config.yaml` | 3 | Step 1 (story review limit) |
| `defaults.agent_timeout_seconds.knowledge_research` | `config.yaml` | 600 | Step 1 (timeout event detection) |
| `e2e_inspection.enabled` | `config.yaml` | `false` | Step 1 (E2E event detection) |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 25 | Lessons injection budget | Entry format (<= 2 lines, phase tag) serves U6 phase filtering and top-10 truncation |
| 2 | Degrade over error | Recording failure never affects Sprint main flow; input validation uses skip not abort |
| 3 | Budget controls everything | Max 3 entries per agent return, prevents single error from inflating lessons file |
| 17 | Execution visibility | Each entry includes date, phase, summary, code ref for complete error traceability |
| 4 | Single entry point for state writes | Append-only rule ensures existing lessons never modified; only Orchestrator writes via this workflow |

---

_Spec validated on 2026-02-07 against workflow.md implementation via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Source: lessons-recording.spec.md (original placeholder) + workflow.md (validated implementation)_
