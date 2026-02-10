---
name: status-validation
id: U4
module: bso
version: 1.1.0
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: status-validation

**Module:** bso
**Status:** Validated
**Created:** 2026-02-07
**Updated:** 2026-02-07
**Workflow ID:** U4
**Agent:** shared

---

## Workflow Overview

**Goal:** Forced state validation before every agent dispatch, Epic-Status consistency check on startup, and atomic state file writes.

**Description:** Pre-dispatch state verification (validates Story status matches target phase before Agent dispatch), Epic-Status consistency check on Sprint startup (Principle 24), and atomic state write via temp file + rename (Principle 11). Called inline by Orchestrator; shared across all Agents.

**Workflow Type:** Utility (U4)

---

## Steps

### Mode 1: Pre-Dispatch Validation

| Step | Name | Goal |
|------|------|------|
| 1.1 | Locate Status File | Find sprint-status.yaml from configured search paths |
| 1.2 | Read and Parse Status | Parse YAML, extract target Story's current status |
| 1.3 | State Match Verification | Verify current status matches expected status(es) for the target phase |
| 1.4 | Orphan State Detection | Scan for Stories stuck in intermediate states, generate warnings |

### Mode 2: Startup Consistency Check (Principle 24)

| Step | Name | Goal |
|------|------|------|
| 2.1 | Load Epic Definitions | Read Epic files, extract Story lists with identifiers and names |
| 2.2 | Load Status File | Read sprint-status.yaml, build Story-status mapping |
| 2.3 | Cross-Reference Comparison | Detect missing, orphaned, and name-mismatched Stories |
| 2.4 | Orphan State Scan | Identify Stories stuck in intermediate states |
| 2.5 | Apply Auto-Corrections and Report | Write missing Stories as `backlog`, generate consistency report |

### Mode 3: Atomic State Write (Principle 11)

| Step | Name | Goal |
|------|------|------|
| 3.1 | CAS Pre-Check | Compare-And-Swap: verify current status equals `previous_status` before write |
| 3.2 | Write to Temp File | Serialize updated YAML to `.sprint-status.yaml.tmp` |
| 3.3 | Atomic Rename | POSIX atomic rename from temp file to sprint-status.yaml (retry once on failure) |
| 3.4 | Post-Write Verification | Re-read file, verify status equals `new_status`, clean up temp file |

---

## Workflow Inputs

### Required Inputs

- `mode`: Operation mode -- `"pre-dispatch"` | `"startup-check"` | `"atomic-write"`
- `session_id`: Sprint session tracking ID (non-empty string)

### Conditional Inputs (by mode)

#### pre-dispatch mode

- `story_key`: Target Story identifier (format: `\d+-\d+`)
- `target_phase`: Current dispatch phase name (valid phase from Phase-Status Matching Table)

#### startup-check mode

- `epic_file_paths`: Non-empty array of Epic definition file paths (each must exist and be readable)

#### atomic-write mode

- `story_key`: Target Story identifier (format: `\d+-\d+`)
- `new_status`: New status value (valid state name)
- `previous_status`: Expected current status for CAS check (valid state name)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `mode` | One of: `pre-dispatch`, `startup-check`, `atomic-write` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `story_key` | Format `\d+-\d+` (pre-dispatch / atomic-write) | abort, status: "failure" |
| `target_phase` | Valid phase name (pre-dispatch) | abort, status: "failure" |
| `epic_file_paths` | Non-empty array, files exist (startup-check) | abort, status: "failure" |
| `new_status` | Valid state name (atomic-write) | abort, status: "failure" |
| `previous_status` | Valid state name (atomic-write) | abort, status: "failure" |

---

## Workflow Outputs

### Return Value (pre-dispatch)

```yaml
return:
  status: "valid" | "state-mismatch" | "failure"
  mode: "pre-dispatch"
  session_id: "sprint-2026-02-07-001"
  results:
    story_key: "3-1"
    target_phase: "story-creation"
    current_status: "backlog"
    expected_statuses: ["backlog"]
    match: true
    orphan_detected: false
    orphan_details: null
  errors: []
```

### Return Value (startup-check)

```yaml
return:
  status: "consistent" | "inconsistencies-found" | "failure"
  mode: "startup-check"
  session_id: "sprint-2026-02-07-001"
  results:
    epics_checked: 2
    total_stories_in_epics: 12
    total_stories_in_status: 10
    missing_in_status: [...]
    orphaned_in_status: [...]
    name_mismatches: [...]
    orphan_states_detected: [...]
    auto_corrections: 2
    warnings: 3
  errors: []
```

### Return Value (atomic-write)

```yaml
return:
  status: "success" | "cas-mismatch" | "write-failure" | "failure"
  mode: "atomic-write"
  session_id: "sprint-2026-02-07-001"
  results:
    story_key: "3-1"
    previous_status: "backlog"
    new_status: "story-doc-review"
    write_method: "atomic-rename"
    temp_file: ".sprint-status.yaml.tmp"
    verified: true
  errors: []
```

---

## State Phase-Status Matching Table

| Target Phase | Expected Story Status(es) | Description |
|-------------|--------------------------|-------------|
| `story-creation` | `backlog`, `story-doc-improved` | New Story or revision after review feedback |
| `story-review` | `story-doc-review` | Story document awaiting review |
| `dev-execution` (dev mode) | `ready-for-dev` | Story approved, ready for development |
| `dev-execution` (fix mode) | `review` (needs-fix) | Code review requires fixes |
| `code-review` | `review` | Code submitted, awaiting review |
| `e2e-inspection` | `e2e-verify` | Code review passed, awaiting E2E verification |

### Valid State Values (8 states)

| State | Description | Valid Next States |
|-------|-------------|------------------|
| `backlog` | Story pending creation | `story-doc-review` |
| `story-doc-review` | Story document under review | `ready-for-dev`, `story-doc-improved` |
| `story-doc-improved` | Story revised, pending re-review | `story-doc-review` |
| `ready-for-dev` | Story approved for development | `review` |
| `review` | Code under review | `done`, `e2e-verify`, `review` (fix loop), `needs-intervention` |
| `e2e-verify` | E2E browser verification | `done`, `review` |
| `needs-intervention` | Requires human intervention (abnormal) | -- |
| `done` | Story completed (terminal) | -- |

---

## Agent Integration

### Primary Agent

Shared utility -- no dedicated Agent. Called inline by Orchestrator before every Agent dispatch, at Sprint startup, and on every state transition write.

### Callers

| Caller | Trigger Scenario | Mode |
|--------|-----------------|------|
| Sprint Orchestrator (C1) | Before every Agent dispatch | `pre-dispatch` |
| Sprint Orchestrator (C1) | Sprint startup initialization | `startup-check` |
| Sprint Orchestrator (C1) | After Agent returns, state transition | `atomic-write` |

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|----------|---------------|
| sprint-status.yaml not found | Step 1.1 / 2.2 | Fatal (pre-dispatch) / Recoverable (startup) | pre-dispatch: abort; startup: create empty skeleton | `failure` / `inconsistencies-found` |
| YAML parse error | Step 1.2 / 2.2 | Fatal | Abort, report parse error details | `failure` |
| Story entry not found (pre-dispatch) | Step 1.2 | Fatal | Abort, Story may not be defined in Epic | `failure` |
| Status mismatch (pre-dispatch) | Step 1.3 | Blocking | Block dispatch, report mismatch details | `state-mismatch` |
| Intermediate state Story detected | Step 1.4 / 2.4 | Warning | Log warning, do not block | N/A (continue) |
| Epic file not found (startup) | Step 2.1 | Warning (single) / Fatal (all) | Skip single or abort | `failure` (all missing) |
| CAS conflict (atomic-write) | Step 3.1 | Error | Abort write, report concurrent modification | `cas-mismatch` |
| Temp file write failure | Step 3.2 | Fatal | Abort, report disk/permission issue | `write-failure` |
| Atomic rename failure (after retry) | Step 3.3 | Fatal | Preserve tmp file, provide manual recovery hint | `write-failure` |
| Post-write verification failure | Step 3.4 | Fatal | Report data inconsistency | `write-failure` |
| Invalid target_phase value | Input Validation | Fatal | Abort immediately | `failure` |
| Invalid new_status value | Input Validation | Fatal | Abort immediately | `failure` |

### Timeout Configuration

- Workflow overall timeout: shared with Orchestrator (inline call)
- Atomic rename retry wait: 100ms (Step 3.3 hardcoded)
- Timeout handling: Orchestrator enforces based on `agent_timeout_action` config (default: `mark_needs_intervention`)

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Step 1.1 / 2.2 |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Orchestrator timeout enforcement |
| `defaults.parallel` | `config.yaml` | 1 | When > 1, atomic-write needs serialization queue (Principle 23) |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 4 | Single entry point for state writes | Mode 3 (Atomic Write): Orchestrator writes all state changes through this workflow |
| 5 | State is the single source of truth | Mode 1 (Pre-Dispatch): only checks sprint-status.yaml, no assumptions about Story origin |
| 11 | Atomic state file writes | Mode 3: temp file + rename for POSIX atomic write; post-write verification |
| 12 | Orphan state detection | Step 1.4 / 2.4: scan for Stories stuck in intermediate states |
| 23 | Parallel state write queue | When parallel > 1, atomic-write operations serialize through Orchestrator queue |
| 24 | Epic-Status consistency check | Mode 2 (Startup Check): compare Epic definitions with sprint-status.yaml on startup |
| 9 | Backward compatibility | State value names are immutable; schema_version field supports future migration |

---

_Spec validated on 2026-02-07 against workflow.md implementation via bmad:bmb:workflows:workflow validate mode (YOLO auto-fix)_
_Source: status-validation.spec.md (original placeholder) + workflow.md (validated implementation)_
