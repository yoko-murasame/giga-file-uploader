# Workflow Specification: e2e-inspection

**Module:** bso
**Workflow ID:** F2
**Status:** Validated
**Version:** 1.1.0
**Created:** 2026-02-07
**Updated:** 2026-02-07

---

## Workflow Overview

**Goal:** Browser-level AC verification with screenshot evidence (optional).

**Description:** Uses Chrome MCP or Playwright MCP to navigate application pages, verify Story AC against rendered UI, and capture screenshots. Only triggered for frontend-related Stories when E2E is enabled. Optional workflow -- three trigger conditions must all be satisfied for execution; if any one is not met, E2E is skipped non-blocking.

**Workflow Type:** Feature (F2), Optional

---

## Steps

| Step | Name | Goal |
|------|------|------|
| 1 | State Validation & Trigger Condition Guard | Verify Story state is `e2e-verify`, then evaluate 3 trigger conditions (config enabled, story tags match, browser MCP available); skip if any condition fails |
| 2 | Browser MCP Tool Detection | Determine active browser MCP tool with degradation chain (Chrome MCP --> Playwright MCP) |
| 3 | Headless Persona Load | Load BMM Dev (Amelia) persona knowledge in headless/YOLO mode; fallback to lean persona on failure |
| 4 | Story AC Extraction | Parse Story .md for AC list, build AC verification plan with URLs and expected results; inject `[e2e]` lessons |
| 5 | Login Verification Flow | Execute login flow when `login.enabled: true`; verify redirect; capture login screenshot |
| 6 | AC Verification Loop | For each AC: navigate --> smart wait --> verify --> screenshot; record pass/fail per AC |
| 7 | E2E Report Generation | Generate structured E2E report with AC results, screenshots, and summary |
| 8 | Return | Return status + results to Orchestrator for state transition |

---

## Workflow Inputs

### Required Inputs

- `story_key`: Story identifier (format: `{epic}-{story}`, e.g. `3-1`)
- `mode`: Fixed value `"e2e"`
- `session_id`: Sprint session tracking ID

### Optional Inputs

- `config_overrides`: Runtime configuration overrides (e.g. `e2e_inspection.enabled`)

---

## Workflow Outputs

### Output Files

- `.sprint-session/{story_key}-e2e-report.md` (E2E verification report)
- `.sprint-session/screenshots/{story_key}-{ac_id}.png` (screenshot evidence per AC)
- `.sprint-session/screenshots/{story_key}-login-success.png` (login success screenshot, if login.enabled)
- `.sprint-session/screenshots/{story_key}-login-failure.png` (login failure screenshot, if login failed)

### Return Value

```yaml
status: "success" | "e2e-failure" | "skipped" | "timeout" | "login-failure" | "failure"
story_key: "3-1"
mode: "e2e"
session_id: "sprint-2026-02-07-001"
results:
  browser_tool_used: "chrome_mcp" | "playwright_mcp" | "none"
  skip_reason: ""  # When status is "skipped": e2e_inspection_disabled | no_matching_story_tags | no_browser_tool
  login_verified: true
  ac_total: 5
  ac_passed: 4
  ac_failed: 1
  ac_results:
    - ac_id: "AC1"
      status: "pass"
      screenshot: ".sprint-session/screenshots/3-1-AC1.png"
      error: ""
  report_path: ".sprint-session/3-1-e2e-report.md"
  screenshots:
    - ".sprint-session/screenshots/3-1-AC1.png"
errors: []
```

---

## State Preconditions

| Scenario | Required State | On Wrong State |
|----------|---------------|----------------|
| E2E verification (normal execution) | `e2e-verify` | abort, status: "failure" |
| E2E skip (conditions not met) | `e2e-verify` | abort, status: "failure" |

## State Transitions

| Scenario | Before | After | Condition |
|----------|--------|-------|-----------|
| All AC passed | `e2e-verify` | `done` | status: "success" |
| Any AC failed | `e2e-verify` | `review` | status: "e2e-failure" |
| Conditions not met (skip) | `e2e-verify` | `done` | status: "skipped", non-blocking |
| Login failed | `e2e-verify` | `review` | status: "login-failure" |
| Timeout | `e2e-verify` | `needs-intervention` | status: "timeout" |
| Unrecoverable error | `e2e-verify` | unchanged | status: "failure" |

---

## Agent Integration

### Primary Agent

E2E Inspector (`bso-e2e-inspector`) -- BMM Dev (Amelia) persona, headless mode, optional agent.

### Supporting Agents

- **Knowledge Researcher** (F1) -- E2E Inspector reads `_lessons-learned.md` entries tagged `[e2e]` at startup.

---

## Error Handling Summary

| # | Error Scenario | Step | Action | Status Returned |
|---|---------------|------|--------|-----------------|
| 1 | Config disabled | Step 1 | Skip, non-blocking | `skipped` |
| 2 | No frontend story tags | Step 1 | Skip, non-blocking | `skipped` |
| 3 | No browser MCP tool | Step 1 | Skip, non-blocking | `skipped` |
| 4 | Chrome MCP unavailable | Step 2 | Degrade to Playwright | N/A (continue) |
| 5 | Persona load failed | Step 3 | Fallback to lean persona | N/A (continue) |
| 6 | Story file not found | Step 4 | Abort | `failure` |
| 7 | AC list empty | Step 4 | Abort | `failure` |
| 8 | Login failed | Step 5 | Screenshot + abort verification | `login-failure` |
| 9 | Browser crashed | Step 6 | Record partial results | `e2e-failure` |
| 10 | Overall timeout (900s) | Any | Mark needs-intervention | `timeout` |
| 11 | State mismatch | Step 1 | Abort | `failure` |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Browser tool degradation chain; persona fallback; skip over abort |
| 4 | Single state write entry | State transitions by Orchestrator only |
| 5 | State is single source of truth | Pre-check Story state is `e2e-verify` |
| 7 | Escape hatch | 3-condition trigger guard as complete escape mechanism |
| 8 | Headless Persona Loading | Load BMM Dev persona without interactive behavior |
| 15 | Independent timeout | 900s timeout, mark needs-intervention, non-blocking |
| 17 | Execution visibility | E2E report + screenshot evidence per AC |
| 25 | Lessons injection budget | Read `[e2e]` tagged lessons entries |

---

_Spec validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Aligned with workflow.md v1.1.0_
