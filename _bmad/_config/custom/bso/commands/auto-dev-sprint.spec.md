# Workflow Specification: auto-dev-sprint

**Module:** bso
**Status:** Validated
**Version:** 1.0.0
**Workflow ID:** C1
**Agent:** orchestrator (pure command logic, no separate agent)
**Created:** 2026-02-07
**Last Validated:** 2026-02-07

---

## Workflow Overview

**Goal:** Master orchestration — intent parsing, state machine driving, agent dispatch, error recording, execution reporting.

**Description:** The central command and orchestration workflow for BSO. Parses user intent (NL / interactive / precise params), drives the 7-state lifecycle, dispatches 6 agents, manages sprint-status.yaml, and produces execution summaries.

**Workflow Type:** Command (not a standard workflow — lives in commands/, not workflows/)

---

## Workflow Structure

### Entry Point

```yaml
---
name: auto-dev-sprint
id: C1
description: "BSO Sprint Orchestrator — Master command for autonomous sprint execution"
module: bso
agent: orchestrator
installed_path: '{project-root}/.claude/commands/bso/auto-dev-sprint.md'
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---
```

### Mode

- [x] Create-only (single execution flow with internal branching)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Startup & Lock | Acquire .sprint-running mutex, detect zombie locks (Principle 13) |
| 2 | Intent Parsing | Parse user input → structured params (NL / interactive / precise) |
| 3 | Environment & State | Run health-check if --check, load sprint-status.yaml, detect orphan states (Principle 12), Epic ↔ Status consistency (Principle 24) |
| 4 | Queue Building | Build Story execution queue from epic-spec, filter by status, file-overlap dependency detection (Principle 29) |
| 5 | Dry-Run Preview | If --dry-run, display queue and exit |
| 6 | Pre-Research (Conditional) | If --pre-research, batch knowledge research before sprint starts (Principle 16) |
| 7 | Execution Loop | For each Story: dispatch agent → await return → update state → check token budget |
| 8 | Per-Story Post-Processing | First-Story checkpoint (P18), error handling / Mark and Continue (ADR-006), lessons recording (P25), Git squash (P28), Git track cleanup |
| 9 | Execution Summary | Generate sprint execution report, Easter eggs check |
| 10 | Cleanup & Unlock | Release .sprint-running, clean up session files |

---

## Workflow Inputs

### Required Inputs

- `epic-spec`: Epic identifier (epicN / N-M,N-M / epicN-epicM / natural language)
- `sprint-status.yaml`: Current sprint state

### Optional Inputs

- `--parallel <N>`: Max parallel tasks (default: 1)
- `--review-strictness`: strict / normal / lenient (default: normal)
- `--max-review-rounds`: Code review max rounds (default: 10)
- `--max-story-review-rounds`: Story review max rounds (default: 3)
- `--skip-story-review`: Skip Story review phase
- `--e2e`: Enable E2E verification
- `--no-research`: Disable Knowledge Researcher
- `--pre-research`: Batch research before sprint starts
- `--dry-run`: Preview mode
- `--check`: Environment health check
- `--status-file <path>`: Custom status file path
- `--auto-clear-git-track`: Auto-clean git track files after Story completion (default: true, follows config.yaml)
- `--force`: Force override existing sprint lock

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `epic_spec` | Non-empty string, matches `epicN` / `all` / `epicN-epicM` / natural language text | abort, status: "failure", error: "Invalid epic spec" |
| `--parallel` | Positive integer >= 1 | Use `defaults.parallel` |
| `--review-strictness` | One of: "strict", "normal", "lenient" | Use `defaults.review_strictness` |
| `--max-review-rounds` | Positive integer >= 1 | Use `defaults.max_review_rounds` |
| `--max-story-review-rounds` | Positive integer >= 1 | Use `defaults.max_story_review_rounds` |
| `--status-file` | File path exists and readable (if provided) | Fallback to `status_file_search_paths` config |
| `--force` | Boolean | Default false |

---

## State Preconditions

| Context | Required State | On Wrong State |
|---------|---------------|----------------|
| Sprint startup | No `.sprint-running` lock (or zombie lock) | abort unless `--force` (Step 1 zombie detection) |
| Story dispatch | Story exists in `sprint-status.yaml` with valid state | skip Story, log warning |

> **Note:** As the orchestrator, C1 does not have a single "required state" like leaf workflows. Instead, it validates preconditions at each step: lock availability (Step 1), status file existence (Step 3), and per-Story state validity before each dispatch (Step 7.1).

---

## State Transitions

| Story State | Agent Dispatched | On Success | On Failure |
|-------------|-----------------|------------|------------|
| `backlog` | Story Creator (C2, create) | → `story-doc-review` | mark `needs-intervention` |
| `story-doc-improved` | Story Creator (C2, revise) | → `story-doc-review` | mark `needs-intervention` |
| `story-doc-review` | Story Reviewer (C3) | passed → `ready-for-dev` / needs-improve → `story-doc-improved` | mark `needs-intervention` |
| `ready-for-dev` | Dev Runner (C4, dev) | → `review` | mark `needs-intervention` |
| `review` | Review Runner (C5) | passed → `done`/`e2e-verify` / needs-fix → dispatch C4 fix | mark `needs-intervention` |
| `review` (fix) | Dev Runner (C4, fix) | → `review` (re-review) | mark `needs-intervention` |
| `e2e-verify` | E2E Inspector (F2) | success/skipped → `done` / e2e-failure → `review` | mark `needs-intervention` |

> **Note:** State transitions are executed by the Orchestrator itself via U4 atomic-write. Individual agents do NOT write to sprint-status.yaml (Principle 4).

---

## Workflow Outputs

### Output Format

- [x] Non-document (state management + execution control)
- [x] Document-producing (execution summary report)

### Output Files

- `sprint-status.yaml` (updated states)
- `.sprint-session/execution-summary-{date}.md` (sprint report)
- `.sprint-session/pending-writes.yaml` (parallel queue, runtime only)

---

## Agent Integration

### Primary Agent

Sprint Orchestrator (this IS the orchestrator — no separate agent, pure command logic)

### Dispatched Agents

| Order | Agent | Condition | Workflow Called |
|-------|-------|-----------|----------------|
| 1 | Story Creator | Story in `backlog` or `story-doc-improved` | story-creation (C2) |
| 2 | Story Reviewer | Story in `story-doc-review` + review enabled | story-review (C3) |
| 3 | Dev Runner | Story in `ready-for-dev` | dev-execution (C4) |
| 4 | Review Runner | Story in `review` | code-review (C5) |
| 5 | Dev Runner (fix) | Review returns needs-fix | dev-execution (C4, fix mode) |
| 6 | E2E Inspector | Story in `e2e-verify` + E2E enabled | e2e-inspection (F2) |
| * | Knowledge Researcher | On-demand from any agent | knowledge-research (F1) |

---

## Error Handling Summary

| Error Scenario | Detection Step | Severity | Action | Outcome |
|---------------|---------------|----------|--------|---------|
| `.sprint-running` zombie lock | Step 1 | Warning | Check PID+timestamp, stale → remove, active → abort | P13 |
| NL parsing ambiguous | Step 2 | Warning | Show parsed params, ask confirmation | P7, P9 |
| `--check` fails (missing deps) | Step 3 | Fatal | Report failures, abort sprint | P2 |
| `sprint-status.yaml` not found | Step 3 | Fatal | Search paths, not found → abort | P5 |
| Orphan state detected | Step 3 | Warning | Report orphans, offer recovery | P12 |
| Epic ↔ Status mismatch | Step 3 | Warning | Auto-sync missing entries | P24 |
| No Stories in queue | Step 4 | Info | Report empty queue, suggest different epic-spec | P17 |
| File-overlap dependency detected | Step 4 | Info | Mark dependent Stories as blocked-by | P29 |
| Agent timeout | Step 7 | Fatal | Mark needs-intervention per config | P15 |
| Agent returns failure | Step 7/8 | Error | Mark and Continue, record lessons | ADR-006 |
| Agent returns scope-violation | Step 7 | Warning | Mark needs-intervention | P19 |
| Agent returns test-regression | Step 7 | Critical | Rollback fix, mark needs-intervention | P20 |
| Sensitive file in git commit | Step 7 | Critical | Block commit, log warning | P21 |
| Review round exceeds threshold | Step 7.5 | Warning | Progressive degradation | P22 |
| Token budget 70% exceeded | Step 7.6 | Warning | Pause and report per config | P26 |
| 3 consecutive failures | Step 8.2 | Critical | Sprint-level pause, ask user | P29 |
| Story review fails max rounds | Step 7 | Warning | Apply story_review_fallback config | P3, P7 |
| Knowledge research budget exhausted | Step 6/7 | Info | Log warning, continue without research | P3 |
| E2E browser MCP unavailable | Step 7 | Info | Degrade: Chrome → Playwright → skip E2E | P2 |
| Git squash conflict | Step 8.3 | Warning | Keep individual commits | P28 |
| Parallel write queue crash | Step 7 | Error | Recover from pending-writes.yaml | P23 |
| First-Story checkpoint pause | Step 8.1 | Info | Wait for user, display quality report | P18 |

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `defaults.parallel` | `config.yaml` | 1 | Steps 4, 7 |
| `defaults.review_strictness` | `config.yaml` | `"normal"` | Steps 2, 7 |
| `defaults.max_review_rounds` | `config.yaml` | 10 | Step 7.5 |
| `defaults.max_story_review_rounds` | `config.yaml` | 3 | Step 7 |
| `defaults.story_review_enabled` | `config.yaml` | `true` | Step 7 |
| `defaults.story_review_fallback` | `config.yaml` | `"ask_user"` | Step 7 |
| `defaults.first_story_checkpoint` | `config.yaml` | `"pause"` | Step 8.1 |
| `defaults.auto_clear_git_track` | `config.yaml` | `true` | Step 8.4 |
| `defaults.agent_timeout_seconds.*` | `config.yaml` | (per-agent) | Step 7 |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Step 7 |
| `defaults.review_degradation.*` | `config.yaml` | (round-based) | Step 7.5 |
| `defaults.token_budget.*` | `config.yaml` | (70% threshold) | Step 7.6 |
| `defaults.dependency_detection.*` | `config.yaml` | (file_overlap) | Steps 4, 8.2 |
| `knowledge_research.enabled` | `config.yaml` | `true` | Steps 6, 7 |
| `knowledge_research.max_calls_per_story` | `config.yaml` | (per-story) | Steps 6, 7 |
| `e2e_inspection.enabled` | `config.yaml` | `false` | Step 7 |
| `git_squash_strategy` | `config.yaml` | `"per_story"` | Step 8.3 |
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Steps 1, 3 |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 1 | Agent dispatch via Skill Call | Step 7: All agents dispatched via Skill Call with minimal params |
| 2 | Degrade over error | Steps 6, 8.3: Pre-Research failure → continue; Squash failure → keep commits; E2E unavailable → skip |
| 3 | Budget controls everything | Steps 7.5, 7.6, 6: Review degradation, token budget, research budget |
| 4 | Single state-write entry | Step 7.4: All state transitions via U4 atomic-write |
| 5 | State is single source of truth | Step 7.1: Pre-dispatch validation via U4 |
| 7 | Always an escape hatch | Steps 2, 5, 8.1, 8.2: Cancel, dry-run, first-Story pause, consecutive failure pause |
| 8 | Headless Persona Loading | Step 7.3: All agents loaded headless |
| 9 | NL parsing capability | Step 2: Chinese/English natural language input |
| 10 | Confirmation mechanism | Step 2: NL parse results require user confirmation |
| 11 | Atomic state file writes | Step 7.4: temp file + rename via U4 |
| 12 | Orphan state detection | Step 3: startup-check scans intermediate-state Stories |
| 13 | Zombie Lock Prevention | Step 1: PID + timestamp dual verification via U2 |
| 14 | BMM Integration Contract | Step 7.3: Agent dispatch via Skill Call standardized interface |
| 15 | Per-phase timeout | Step 7.4: Independent timeout per agent |
| 16 | Knowledge Capacity Management | Step 6: Pre-Research batch pre-cache; Step 7: max_calls_per_story budget |
| 17 | Execution visibility | Steps 7.7, 9: Progress output + execution report |
| 18 | First-Story checkpoint | Step 8.1: Configurable pause/report/skip |
| 19 | Dev Scope Guard | Step 7: C4 returns scope-violation → mark needs-intervention |
| 20 | Fix-before-snapshot | Step 7: C4 fix mode returns test-regression → mark needs-intervention |
| 21 | Git Commit Safeguard | Step 7: Sensitive file detection delegated to C4/C2 internal U3 |
| 22 | Review progressive degradation | Step 7.5: Round 3-4/5-7/>=8 auto-adjust |
| 23 | Parallel state write queue | Step 7: pending-writes.yaml serialization |
| 24 | Epic-Status consistency check | Step 3: U4 startup-check |
| 25 | Lessons injection/recording | Step 8.2: Failure lessons recording |
| 26 | Token budget monitoring | Step 7.6: 70% threshold |
| 27 | Technical Claim Verification | Step 7: C2/C3 internal API existence verification |
| 28 | Git Squash strategy | Step 8.3: per_story / per_phase / none |
| 29 | File-overlap dependency detection | Step 4: Dependency graph; Step 8.2: Consecutive failure threshold |
| 30 | Review Persona Independence | Step 7: C5 uses Architect (Winston), C4 uses Dev (Amelia) |

---

## Implementation Notes

**Use the create-workflow workflow to build this workflow.**

Key implementation considerations:
- This is the most complex workflow in BSO — it IS the orchestrator
- State machine must enforce valid transitions only
- Atomic writes to sprint-status.yaml (temp file + rename)
- Parallel mode: serialize agent returns through write queue
- Token budget monitoring after each agent dispatch
- Consecutive failure detection (3 in a row → Sprint pause)
- Easter egg detection at sprint completion

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Aligned with: auto-dev-sprint.md v1.0.0, code-review.spec.md (format baseline), dev-execution.spec.md (format baseline)_
