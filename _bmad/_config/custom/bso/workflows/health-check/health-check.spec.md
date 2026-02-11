---
name: health-check
id: U1
description: "Comprehensive environment verification before sprint execution — validates all dependencies, tools, configurations, and knowledge cache freshness"
module: bso
agent: bso-orchestrator
type: utility
version: 1.1.0
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: health-check

**Module:** bso
**Status:** Validated — Implementation created and validated
**Created:** 2026-02-07

---

## Workflow Overview

**Goal:** Comprehensive environment verification before sprint execution.

**Description:** Validates all dependencies, tools, configurations, and knowledge cache freshness needed for BSO execution. Runs 10 independent checks, each returning `pass` / `warn` / `fail` / `skip` status, aggregated into an overall health status (`healthy` / `warnings` / `unhealthy`). Acts as the Sprint "safety gate" — only passes (or explicit user override of warnings) allow Sprint to start.

**Workflow Type:** Utility (U1)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | BMAD Core Check | Verify BMAD Core installed and Skill mechanism available |
| 2 | BMM Module Check | Verify BMM module + required agents + required workflows |
| 3 | Status File Check | Verify sprint-status.yaml exists and is valid YAML; detect orphan states |
| 4 | Git Check | Verify git available, check working tree status |
| 5 | Test Framework Check | Verify test runner executable + at least 1 test runs |
| 6 | MCP Tools Check | Check Context7, DeepWiki availability (warn if missing, never fail) |
| 7 | E2E Environment Check | If E2E enabled: verify base_url accessible + browser MCP available |
| 8 | Version Scan | Scan package.json/pom.xml versions vs knowledge cache index.yaml |
| 9 | Concurrency Lock Check | Check .sprint-running for zombie locks (PID + timestamp) |
| 10 | Report Generation | Aggregate all results, generate health check report file |

---

## Callers

| Caller | Trigger | Mode |
|--------|---------|------|
| auto-dev-sprint-team | `--check` flag | Direct call, report only then exit |
| auto-dev-sprint-team | Sprint startup (pre-execution) | Auto call, unhealthy blocks Sprint |
| User manual | Post-config change verification | `/bso:auto-dev-sprint-team --check` |

---

## Input / Output Contract

### Input

```yaml
required:
  project_root: "/path/to/project"           # Absolute path to project root
optional:
  config_path: "path/to/config.yaml"          # BSO config file (auto-discovered by default)
  session_id: "sprint-2026-02-07-001"         # Session tracking ID (passed by C1 in non-check mode)
  check_only: true                            # true = report only; false = block Sprint on unhealthy
  skip_checks: []                             # Skip specific checks (e.g. ["e2e_environment", "mcp_tools"])
```

### Output

```yaml
return:
  status: "healthy" | "warnings" | "unhealthy"
  session_id: "sprint-2026-02-07-001"
  overall_summary: "9/10 checks passed, 1 warning"
  checks:
    bmad_core: { status, message, details }
    bmm_module: { status, message, details }
    status_file: { status, message, details }
    git: { status, message, details }
    test_framework: { status, message, details }
    mcp_tools: { status, message, details }
    e2e_environment: { status, message, details }
    version_scan: { status, message, details }
    concurrency_lock: { status, message, details }
    report: { status, message, details }
  errors: []
```

---

## Error Handling Overview

| Scenario | Severity | Strategy |
|----------|----------|----------|
| Project root not found | Fatal | Abort with `unhealthy` |
| config.yaml missing or invalid | Fatal | Fallback to default paths; all fail then abort |
| BMAD Core not installed | Fatal | Mark `fail`, continue remaining checks |
| BMM agents/workflows missing | Fatal | Mark `fail`, list missing items |
| sprint-status.yaml syntax error | Fatal | Mark `fail`, suggest repair or recreate |
| Git not installed | Fatal | Mark `fail` |
| Test framework timeout | Warning | Mark `warn`, suggest manual verify |
| MCP tools all unavailable | Warning | Mark `warn`, note degradation strategy (never `fail`) |
| E2E base_url unreachable | Conditional | `fail` if E2E enabled; `skip` if disabled |
| Version mismatch detected | Warning | Mark `warn`, list mismatch details |
| Zombie lock detected | Warning | Mark `warn`, recommend `--force` override |
| Active sprint lock | Fatal | Mark `fail`, block new Sprint |
| Report file write fails | Warning | Degrade to console output |

---

## Agent Integration

### Primary Agent

Orchestrator (inline logic) — executes directly within `auto-dev-sprint-team` command, no independent Agent dispatch needed.

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
