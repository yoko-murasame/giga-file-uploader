---
name: interactive-guide
id: F4
description: "No-argument interactive onboarding — guide users through sprint setup via step-by-step prompts, producing structured execution parameters identical to F3 output"
module: bso
agent: orchestrator
version: 1.0.0
type: feature
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: interactive-guide

**Module:** bso
**Status:** Validated -- Aligned with workflow.md
**Created:** 2026-02-07
**Updated:** 2026-02-07

---

## Workflow Overview

**Goal:** Guide newcomers through sprint setup when no arguments provided.

**Description:** Displays sprint status table, walks user through Epic selection, execution mode, review settings, and E2E options. Produces a dry-run preview before confirmation. Returns structured execution parameters identical to F3 intent-parsing output.

**Workflow Type:** Feature (F4)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Status Display | Read sprint-status.yaml → display formatted status table |
| 2 | Epic Selection | Show available Epics with Story counts → user selects |
| 3 | Mode Selection | Choose execution mode (full lifecycle / dev only / review only) |
| 4 | Review Settings | Set review strictness, Story review enable/disable |
| 5 | Feature Toggle | Enable/disable E2E, Knowledge Research, first_story_checkpoint, parallel |
| 6 | Dry-Run Preview | Show execution queue, estimated phase count, config diff, and warnings |
| 7 | Confirmation | User confirms → return structured params |

---

## Workflow Inputs

### Required Inputs

- `sprint_status_file`: Sprint status file path (`sprint-status.yaml`, resolved via `status_file_search_paths` config)

### Optional Inputs

- `epic_files`: Epic definition file path list (auto-inferred from sprint-status.yaml)
- `config_file`: BSO configuration file path (default search paths apply)

---

## Workflow Outputs

### Return Value

```yaml
return:
  status: "confirmed" | "aborted" | "failure"
  epic_spec: "epic3,epic5"
  stories: ["3-1", "3-2", "5-1", "5-3"]
  filter: "incomplete"
  execution_mode: "full_lifecycle"
  options:
    review_strictness: "medium"
    skip_story_review: false
    e2e: false
    max_review_rounds: 10
    max_story_review_rounds: 3
    no_research: false
    dry_run: false
    pre_research: false
    first_story_checkpoint: "pause"
    parallel: 1
    auto_clear_git_track: true
  story_details:
    - key: "3-1"
      name: "Story Name"
      current_state: "backlog"
  confirmed: true
  parse_source: "interactive"
  errors: []
```

### Return Status Definitions

| Status | Meaning | Orchestrator Action |
|--------|---------|---------------------|
| `confirmed` | User confirmed execution | Enter Story queue scheduling main loop |
| `aborted` | User cancelled execution | Terminate Sprint, output cancellation info |
| `failure` | Precondition not met (status file missing, no available Epics, etc.) | Terminate Sprint, output error details |

---

## Agent Integration

### Primary Agent

Orchestrator (inline logic, interactive user-facing)

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
