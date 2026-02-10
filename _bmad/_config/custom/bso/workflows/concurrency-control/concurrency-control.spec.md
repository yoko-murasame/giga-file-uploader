---
name: concurrency-control
id: U2
module: bso
version: 1.0.0
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: concurrency-control

**Module:** bso
**Status:** Validated — Implementation created and validated
**Created:** 2026-02-07

---

## Workflow Overview

**Goal:** Manage .sprint-running mutex to prevent parallel sprint conflicts.

**Description:** Acquire/release/check lock with PID + timestamp. Detect and handle zombie locks from crashed sessions. Prevent accidental parallel execution. Supports three operation modes: `acquire`, `release`, and `check`.

**Workflow Type:** Utility (U2)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Lock File Detection | Check if .sprint-running exists; if absent and acquire mode, skip to Step 4 |
| 2 | Zombie Detection | If exists: validate PID alive + timestamp < 24h |
| 3 | Acquire Decision | If zombie → offer override (or force); if active + !force → reject; if active + force → confirm override |
| 4 | Lock Write | Atomic write PID + session_id + timestamp + epic_spec + lock_version |
| 5 | Lock Release | Remove .sprint-running (with session_id validation and idempotent handling) |

---

## Callers

| Caller | Trigger | Mode |
|--------|---------|------|
| auto-dev-sprint (C1) | Sprint start | `acquire` |
| auto-dev-sprint (C1) | Sprint normal completion | `release` |
| auto-dev-sprint (C1) | Sprint abnormal termination | `release` (error recovery) |
| health-check (U1) | Environment check Step 9 | `check` |

---

## Input / Output Contract

### Input

```yaml
required:
  mode: "acquire" | "release" | "check"
  project_root: "/path/to/project"
optional:
  session_id: "sprint-2026-02-07-001"    # required in acquire mode
  epic_spec: "epic5"                     # required in acquire mode
  force: false                           # force override existing lock
  lock_file_name: ".sprint-running"      # default lock file name
```

### Output

```yaml
return:
  status: "acquired" | "released" | "blocked" | "zombie-detected" | "clean" | "failure"
  mode: "acquire" | "release" | "check"
  lock_info: { exists, pid, session_id, started_at, epic_spec, age_hours, pid_alive, is_zombie }
  message: "Human-readable status message"
  errors: []
```

---

## Error Handling Overview

| Scenario | Severity | Strategy |
|----------|----------|----------|
| Project root not writable | Fatal | Abort with `failure` |
| Lock file YAML corrupted | Warning | Treat as zombie, enter zombie flow |
| PID check command fails | Warning | Assume PID dead (conservative), treat as zombie |
| Active lock blocks acquire | Expected | Return `blocked` with lock details |
| Atomic write/rename fails | Fatal | Clean up temp file, abort with `failure` |
| Session mismatch on release | Warning | Log warning, still release (prevent deadlock) |

---

## Agent Integration

### Primary Agent

Shared utility — called by Orchestrator at sprint start/end

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
