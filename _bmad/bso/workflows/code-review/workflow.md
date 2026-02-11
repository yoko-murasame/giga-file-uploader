---
name: code-review
id: C5
description: "C5: Adversarial code review with progressive degradation and strictness-based decision"
module: bso
agent: bso-review-runner
type: core
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Code Review Workflow (C5)

> Adversarial code review with progressive degradation (Principle 22), objective checklist evaluation (Principle 6), review persona independence (Principle 30), and strictness-based decision. Supports the Review-Fix loop with Dev Runner (C4) via Orchestrator dispatch.

## Purpose

Act as the quality gate between development completion and Story done/e2e-verify. Load BMM Architect (Winston) persona -- a DIFFERENT persona from Dev Runner (Amelia) -- to guarantee cognitive independence. Apply an objective, fixed review checklist against code changes and Story AC. Implement progressive degradation as review rounds increase to prevent infinite fix loops while preserving quality standards. Return a verdict of passed / needs-fix / needs-intervention to the Orchestrator.

## Primary Agent

**Review Runner** (`bso-review-runner`) -- loads BMM Architect (Winston) persona in headless mode. Persona ID: `role_mapping.review_runner_persona`.

## Supporting Agents

| Agent | Role in This Workflow |
|-------|----------------------|
| Knowledge Researcher (F1) | Lessons injection (Step 3) |
| Dev Runner (C4) | Downstream consumer -- receives fix instructions when verdict is `needs-fix` |

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Story identifier (epic-story)
    session_id: "sprint-2026-02-07-001"       # Sprint session tracking ID
    review_round: 1                           # Current review round number (from Orchestrator)
  optional:
    config_overrides:
      review_strictness_threshold: "medium"                     # Override fix severity threshold (default from config.yaml)
      max_review_rounds: 10                   # Override max review rounds (default from config.yaml)
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Format `\d+-\d+` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `review_round` | Positive integer >= 1 | abort, status: "failure" |
| `config_overrides.review_strictness_threshold` | One of: "high", "medium", "low" (if provided) | Ignore override, use config.yaml default |
| `config_overrides.max_review_rounds` | Positive integer (if provided) | Ignore override, use config.yaml default |

---

## Output Schema

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
      effective_review_strictness_threshold: "medium"            # review_strictness_threshold actually applied (may differ from configured due to degradation)
      degradation_applied: "none"              # none | lower_strictness | high_only | force_needs_intervention
      findings_total: 3                        # total findings before filtering
      findings_by_severity:
        HIGH: 1
        MEDIUM: 1
        LOW: 1
      findings_after_filter: 2                 # findings remaining after review_strictness_threshold filter
      findings:
        - id: "RR-001"
          severity: "HIGH"
          category: "security"
          description: "Hardcoded database password in ConnectionConfig.java"
          affected_files:
            - "src/config/ConnectionConfig.java"
          fix_instruction: "Move password to environment variable, reference via @Value annotation"
        - id: "RR-002"
          severity: "MEDIUM"
          category: "test-coverage"
          description: "AC-3 (error handling) has no corresponding test case"
          affected_files:
            - "src/test/modules/project/ProjectServiceTest.java"
          fix_instruction: "Add test case verifying exception thrown when project ID is null"
      review_report_path: "path/to/review-report-3-1-round-1.md"
      knowledge_queries: []
  errors: []
```

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|---------------|
| `review` | `review` | abort, status: "failure", error: "Story not in review state" |

## State Transitions

| Mode | Before | After (passed) | After (needs-fix) | After (needs-intervention) | After (failure) |
|------|--------|---------------|-------------------|---------------------------|----------------|
| `review` | `review` | `done` (or `e2e-verify`) | (stays `review`, dispatches C4 fix) | `needs-intervention` | `needs-intervention` |

> **Note:** State transitions are executed by the Orchestrator after receiving the return value. This workflow does NOT directly write to sprint-status.yaml (Principle 4: single entry point for state writes).

---

## Workflow Steps

### Step 1: State Validation

**Goal:** Confirm the Story is in a reviewable state before proceeding.

**Actions:**

1. Read `sprint-status.yaml` from configured status file search paths.
2. Locate the entry for `story_key`.
3. Verify the Story state is `review`.
4. If the state is NOT `review`:
   - Return immediately with `status: "failure"`.
   - Error message: `"Story {story_key} is in state '{current_state}', expected 'review'."`

**Principle references:** Principle 5 (state is the single source of truth), Principle 4 (single entry point for state writes).

```yaml
step_1:
  name: "State Validation"
  reads:
    - sprint-status.yaml
  validates:
    - story_key exists in status file
    - story state == "review"
  on_failure:
    return:
      status: "failure"
      errors: ["State mismatch: expected 'review', found '{actual}'"]
```

---

### Step 2: Progressive Degradation Check (Principle 22)

**Goal:** Apply degradation rules based on the current review round to prevent infinite review-fix loops.

**Actions:**

1. Read `review_round` from input parameters.
2. Read `review_strictness_threshold` from `config_overrides` or fall back to `config.yaml` default (`medium`).
3. Read `max_review_rounds` from `config_overrides` or fall back to `config.yaml` default (10).
4. Apply degradation schedule based on `review_round`:

| Round | Degradation Rule | Config Key | review_strictness_threshold Behavior | Scope |
|-------|-----------------|------------|-------------------|-------|
| 1-2 | None | -- | As configured (e.g., `medium`) | All issues at or above review_strictness_threshold |
| 3-4 | `lower_strictness` | `review_degradation.round_3` | Auto-lower by one tier: `high` -> `medium`, `medium` -> `low`, `low` -> `low` (floor) | All issues at or above new review_strictness_threshold |
| 5-7 | `high_only` | `review_degradation.round_5` | Override to HIGH only | Skip MEDIUM and LOW entirely |
| >= 8 or >= max_review_rounds | `force_needs_intervention` | `review_degradation.round_8` | N/A -- stop reviewing | Return `needs-intervention` immediately |

5. If `review_round >= 8` or `review_round >= max_review_rounds` (whichever is lower triggers `force_needs_intervention`):
   - Return immediately with `status: "needs-intervention"`.
   - Set `degradation_applied: "force_needs_intervention"`.
   - Include degradation reason in return summary.
   - **Skip all subsequent steps.**

**Rationale:** Infinite review-fix loops are the primary budget drain in automated development. Progressive degradation ensures the system converges -- either the code is good enough (relaxed standards pass it) or human intervention is genuinely needed (round 8 escalation). This is a safety valve, not a quality compromise.

**Principle references:** Principle 22 (review progressive degradation), Principle 3 (budget controls everything).

```yaml
step_2:
  name: "Progressive Degradation Check"
  reads:
    - config.yaml (defaults.review_strictness)
    - config.yaml (defaults.max_review_rounds)
    - config.yaml (defaults.review_degradation)
  inputs:
    - review_round (from Skill call params)
    - config_overrides.review_strictness_threshold (optional)
    - config_overrides.max_review_rounds (optional)
  degradation_schedule:
    round_1_2:
      review_strictness_threshold: "{configured}"
      scope: "all severities >= review_strictness_threshold"
      degradation_applied: "none"
    round_3:
      action: "lower_strictness"
      review_strictness_threshold: "auto-lower by one tier (high->medium, medium->low, low->low)"
      scope: "all severities >= new review_strictness_threshold"
      degradation_applied: "lower_strictness"
    round_5:
      action: "high_only"
      review_strictness_threshold: "HIGH"
      scope: "HIGH only, skip MEDIUM and LOW"
      degradation_applied: "high_only"
    round_8:
      action: "force_needs_intervention"
      scope: "none -- abort review"
      degradation_applied: "force_needs_intervention"
  on_force_needs_intervention:
    return:
      status: "needs-intervention"
      results:
        verdict: "needs-intervention"
        degradation_applied: "force_needs_intervention"
        findings_total: 0
        findings_after_filter: 0
        findings: []
      errors: []
```

---

### Step 3: Lessons Injection

**Goal:** Inject relevant historical lessons into the review context to avoid repeating known issues.

**Actions:**

1. Trigger Knowledge Researcher (F1) in `lessons-inject` mode.
2. Parameters:
   ```yaml
   mode: "lessons-inject"
   phase: "code-review"
   story_key: "{story_key}"
   session_id: "{session_id}"
   ```
3. Knowledge Researcher reads `_lessons-learned.md`, filters entries tagged `[code-review]`, returns at most 10 entries sorted by recency + relevance (Principle 25).
4. Injected lessons become part of the review context for subsequent steps.

**Principle references:** Principle 25 (lessons injection budget -- max 10 entries).

```yaml
step_3:
  name: "Lessons Injection"
  triggers:
    agent: knowledge-researcher (F1)
    mode: "lessons-inject"
    params:
      phase: "code-review"
      max_entries: 10
  output: lessons_context[]
```

---

### Step 4: Headless Persona Load

**Goal:** Load BMM Architect (Winston) persona knowledge without triggering interactive behavior. MUST use Architect persona, not Dev persona -- Principle 30 review persona independence.

**Actions:**

1. Execute Skill call to load BMM Architect (Winston) persona:
   ```yaml
   skill: "bmad:bmm:agents:architect"
   mode: "headless"
   ```
2. Immediately declare YOLO/automation mode -- skip menu display and user interaction prompts.
3. Do NOT validate specific activation signals (e.g., "I'm Winston").
4. Validate load success via Skill call return value.
5. If load fails:
   - Return immediately with `status: "failure"`.
   - Error message: `"Failed to load BMM Architect (Winston) persona in headless mode."`

**Why Architect, not Dev:** Dev Runner loads BMM Dev (Amelia) -- energetic, test-obsessed, implementation-focused. Review Runner loads BMM Architect (Winston) -- calm, pragmatic, architecture-focused. This separation ensures the reviewer evaluates code through a fundamentally different cognitive lens. If both agents used the same persona, the reviewer would tend to approve the same patterns the developer chose -- confirmation bias.

**Principle references:** Principle 8 (headless persona loading), Principle 30 (review persona independence).

```yaml
step_4:
  name: "Headless Persona Load"
  skill_call:
    target: "bmad:bmm:agents:architect"   # Winston, NOT Dev (Amelia)
    mode: "headless"
    config_ref: "role_mapping.review_runner_persona"
  validates:
    - skill return value indicates success
  on_failure:
    return:
      status: "failure"
      errors: ["Persona load failure: BMM Architect (Winston)"]
```

---

### Step 5: Context Loading

**Goal:** Load all necessary context for the code review -- Story AC, code changes, and project architecture.

**Actions:**

1. Read Story `.md` file for the given `story_key`.
   - Extract: Acceptance Criteria (AC) list, file scope declarations, dependency declarations, tasks, and subtasks.
   - If file not found: return immediately with `status: "failure"`, error: `"Story file not found for {story_key}"`.
2. Collect code changes via `git diff` for Story scope.
   - Scope is determined by the Story's file scope declarations.
   - If no changes found: return immediately with `status: "failure"`, error: `"No code changes found for Story {story_key}"`.
3. Read `project-context.md` for architecture context (tech stack, module boundaries, conventions).
4. Merge lessons context from Step 3 into review context.

```yaml
step_5:
  name: "Context Loading"
  reads:
    - Story .md file (for story_key)
    - git diff (Story-scoped code changes)
    - project-context.md (architecture context)
    - lessons_context[] (from Step 3)
  extracts:
    - acceptance_criteria[]
    - file_scope_declarations[]
    - dependency_declarations[]
    - tasks[]
    - subtasks[]
    - code_changes (git diff output)
  on_file_not_found:
    return:
      status: "failure"
      errors: ["Story file not found for {story_key}"]
  on_no_changes:
    return:
      status: "failure"
      errors: ["No code changes found for Story {story_key}"]
```

---

### Step 6: Objective Review (Principle 6)

**Goal:** Evaluate code changes against the fixed, objective review checklist. The checklist is the SOLE basis for findings -- the reviewer MUST NOT introduce subjective preferences or coding style opinions.

**Actions:**

1. Invoke BMM code-review workflow via Skill call (`workflow_mapping.code_review`).
2. Apply the following checklist items:

| # | Checklist Item | Pass Criteria | Evaluation Method |
|---|----------------|---------------|-------------------|
| CR-1 | AC Satisfaction | Every AC in the Story has corresponding implementation | Cross-reference each AC with code changes; verify all AC conditions are met |
| CR-2 | Test Coverage | Every AC has at least one test that would fail if the AC were unmet | Verify test files exist and test cases map to AC items |
| CR-3 | Error Handling | External calls have try/catch, user inputs are validated, failure paths return meaningful errors | Inspect code changes for unhandled external calls, missing input validation |
| CR-4 | Security Baseline | No hardcoded credentials, no raw SQL concatenation, no unescaped user input in HTML | Scan for hardcoded passwords/tokens, string-concatenated SQL, unsanitized output |
| CR-5 | Performance Baseline | No unbounded collection iterations, no N+1 query patterns, no synchronous blocking in async contexts | Check for unbounded loops, repeated DB queries in loops, blocking calls |
| CR-6 | Scope Compliance | No modifications to files outside Story-declared scope | Cross-reference changed files with Story's file scope declarations (Principle 19) |

**Items NOT on the checklist are explicitly OUT OF SCOPE for automated review:**

- Variable naming style preferences (beyond clarity)
- Comment density or documentation style
- Design pattern choices (unless causing measurable defect)
- Code formatting (delegated to linters)

**Rules:**

- Each finding is tagged with severity (HIGH/MEDIUM/LOW) and category.
- The reviewer MUST NOT invent additional criteria beyond CR-1 through CR-6 -- preventing review oscillation across rounds (Principle 6).
- Each finding MUST include actionable fix instructions with affected file paths.

**Principle references:** Principle 6 (objective checklist over subjective aesthetics), Principle 19 (dev scope guard).

```yaml
step_6:
  name: "Objective Review"
  skill_call:
    target: "bmad:bmm:workflows:code-review"
    config_ref: "workflow_mapping.code_review"
  applies:
    checklist_items: [CR-1, CR-2, CR-3, CR-4, CR-5, CR-6]
  each_finding:
    id: "RR-{sequence}"
    severity: "HIGH" | "MEDIUM" | "LOW"
    category: "ac-satisfaction" | "test-coverage" | "error-handling" | "security" | "performance" | "scope-compliance"
    description: "string"
    affected_files: ["string"]
    fix_instruction: "string"
  excluded_from_review:
    - variable naming style preferences
    - comment density
    - design pattern choices (unless measurable defect)
    - code formatting (linter responsibility)
  rules:
    - no criteria invention beyond CR-1 to CR-6
    - each finding must include fix_instruction
    - each finding must include affected_files
```

---

### Step 7: Finding Classification

**Goal:** Classify each finding by severity and apply the current review_strictness_threshold filter to exclude findings below threshold.

**Actions:**

1. Collect all findings from Step 6.
2. Verify each finding has a severity tag:

| Severity | Criteria | Examples |
|----------|----------|---------|
| HIGH | Functional defect, security vulnerability, data loss risk | Missing AC implementation, hardcoded password, SQL injection vector |
| MEDIUM | Missing edge case handling, incomplete test coverage | No test for error path, unvalidated nullable input |
| LOW | Naming convention, minor refactoring opportunity | Inconsistent variable name, extractable helper method |

3. Record `findings_total` and `findings_by_severity` counts.
4. Apply current `effective_review_strictness_threshold` filter (determined in Step 2):
   - `review_strictness_threshold: "high"` -- keep HIGH only, discard MEDIUM and LOW.
   - `review_strictness_threshold: "medium"` -- keep HIGH and MEDIUM, discard LOW.
   - `review_strictness_threshold: "low"` -- keep all (HIGH, MEDIUM, LOW).
5. Record `findings_after_filter` count.

```yaml
step_7:
  name: "Finding Classification"
  inputs:
    - findings[] from Step 6
    - effective_review_strictness_threshold from Step 2
  severity_levels:
    HIGH: "Functional defect, security vulnerability, data loss risk"
    MEDIUM: "Missing edge case handling, incomplete test coverage"
    LOW: "Naming convention, minor refactoring opportunity"
  filter_rules:
    review_strictness_threshold_high: "keep HIGH only"
    review_strictness_threshold_medium: "keep HIGH + MEDIUM"
    review_strictness_threshold_low: "keep all"
  outputs:
    findings_total: "{count before filter}"
    findings_by_severity:
      HIGH: "{count}"
      MEDIUM: "{count}"
      LOW: "{count}"
    findings_after_filter: "{count after filter}"
    filtered_findings: "findings[] remaining after review_strictness_threshold filter"
```

---

### Step 8: Verdict Decision

**Goal:** Determine the review verdict based on filtered findings.

**Actions:**

1. If `findings_after_filter == 0` (no findings remain after review_strictness_threshold filtering):
   - Set `verdict: "passed"`.
   - State transition (by Orchestrator): `review` -> `done` (or `e2e-verify` if E2E enabled in config).
2. If `findings_after_filter > 0` (findings remain):
   - Set `verdict: "needs-fix"`.
   - Proceed to Step 9 (Review Report Generation).
   - State transition (by Orchestrator): Orchestrator dispatches Dev Runner (C4) in fix mode.

```yaml
step_8:
  name: "Verdict Decision"
  inputs:
    - findings_after_filter from Step 7
  logic:
    no_findings_remaining:
      verdict: "passed"
      status: "passed"
      next: "Step 10 (Return)"
    findings_remaining:
      verdict: "needs-fix"
      status: "needs-fix"
      next: "Step 9 (Review Report Generation)"
```

---

### Step 9: Review Report Generation (needs-fix only)

**Goal:** Write a structured review report with actionable fix instructions for each finding, consumed by Dev Runner (C4) in fix mode.

**Condition:** Execute ONLY when `verdict == "needs-fix"`.

**Actions:**

1. Generate review report file at `.sprint-session/review-report-{story_key}-round-{review_round}.md`.
2. Report structure:

```markdown
# Code Review Report

**Story:** {story_key}
**Round:** {review_round}
**Reviewer:** BMM Architect (Winston) -- Headless
**Verdict:** needs-fix
**Effective review_strictness_threshold:** {effective_review_strictness_threshold}
**Degradation applied:** {degradation_applied}
**Date:** {timestamp}

## Summary

- Total findings: {findings_total}
- Findings by severity: HIGH={n}, MEDIUM={n}, LOW={n}
- Findings after review_strictness_threshold filter: {findings_after_filter}

## Findings

### RR-001 [HIGH] security
**Description:** {description}
**Affected files:** {file_list}
**Fix instruction:** {fix_instruction}

### RR-002 [MEDIUM] test-coverage
**Description:** {description}
**Affected files:** {file_list}
**Fix instruction:** {fix_instruction}
```

3. Each finding includes: `id`, `severity`, `category`, `description`, `affected_files`, `fix_instruction`.
4. Record the report file path in `review_report_path` for the return value.

```yaml
step_9:
  name: "Review Report Generation"
  condition: verdict == "needs-fix"
  writes_to: ".sprint-session/review-report-{story_key}-round-{review_round}.md"
  content:
    - report_header (story_key, round, reviewer, verdict, review_strictness_threshold, degradation)
    - summary (counts)
    - findings[] (id, severity, category, description, affected_files, fix_instruction)
  output:
    review_report_path: ".sprint-session/review-report-{story_key}-round-{review_round}.md"
```

---

### Step 10: Return

**Goal:** Return the complete review result to the Orchestrator for state transition processing.

**Actions:**

1. Assemble the complete return value per the Output Schema.
2. Return to Orchestrator.
3. **Orchestrator** (not this workflow) performs the state transition and dispatches next action:
   - `verdict: "passed"` -> `review` to `done` (or `e2e-verify` if E2E enabled).
   - `verdict: "needs-fix"` -> Orchestrator dispatches Dev Runner (C4) in fix mode, passing `review_strictness_threshold` and `review_report_path`.
   - `verdict: "needs-intervention"` -> mark Story as `needs-intervention` (from Step 2 degradation round 8).

```yaml
step_10:
  name: "Return"
  returns:
    schema: outputs.return (see Output Schema above)
    fields:
      - status
      - story_key
      - mode: "review"
      - session_id
      - review_round
      - results:
          - verdict
          - effective_review_strictness_threshold
          - degradation_applied
          - findings_total
          - findings_by_severity
          - findings_after_filter
          - findings[]
          - review_report_path
          - knowledge_queries[]
      - errors[]
  orchestrator_actions:
    passed:
      transition: "review -> done (or e2e-verify if E2E enabled)"
    needs-fix:
      transition: "Orchestrator dispatches Dev Runner (C4) fix mode"
      passes:
        - review_strictness_threshold: "{effective_review_strictness_threshold}"
        - review_report_path: "{path}"
        - review_round: "{review_round}"
    needs-intervention:
      transition: "review -> needs-intervention"
      reason: "Progressive degradation round 8+ (Principle 22)"
```

---

## Workflow Sequence Diagram

```
Orchestrator                Review Runner (C5)              Knowledge Researcher (F1)
    |                              |                                |
    |--- dispatch(story_key, ---->|                                |
    |    session_id,              |                                |
    |    review_round,            |                                |
    |    config_overrides)        |                                |
    |                              |                                |
    |                      Step 1: State Validation                 |
    |                              |                                |
    |                      Step 2: Progressive Degradation Check    |
    |                        (if round >= 8 -> needs-intervention)  |
    |                              |                                |
    |                      Step 3: Lessons Injection                |
    |                              |-------- lessons-inject ------->|
    |                              |<------- lessons (max 10) ------|
    |                              |                                |
    |                      Step 4: Headless Persona Load            |
    |                        (BMM Architect Winston via Skill)      |
    |                              |                                |
    |                      Step 5: Context Loading                  |
    |                        (Story + git diff + project-context)   |
    |                              |                                |
    |                      Step 6: Objective Review (CR-1..CR-6)    |
    |                              |                                |
    |                      Step 7: Finding Classification           |
    |                        (severity + review_strictness_threshold filter)          |
    |                              |                                |
    |                      Step 8: Verdict Decision                 |
    |                              |                                |
    |                      Step 9: Review Report Generation         |
    |                        (needs-fix only)                       |
    |                              |                                |
    |                      Step 10: Return                          |
    |<--- return(status, results) -|                                |
    |                              |                                |
    | update sprint-status.yaml    |                                |
    | passed: -> done/e2e-verify   |                                |
    | needs-fix: -> dispatch C4    |                                |
    |   (Dev Runner fix mode)      |                                |
    | needs-intervention: ->       |                                |
    |   mark needs-intervention    |                                |
```

---

## Review-Fix Loop (C5 <-> C4 Closed Loop)

This workflow participates in a closed loop with Dev Runner (C4). The Orchestrator manages the loop:

```
C5 code-review (round N)
  |
  | verdict: needs-fix
  v
Orchestrator dispatches C4 dev-execution (fix mode, review_strictness_threshold from C5)
  |
  | fix complete
  v
Orchestrator dispatches C5 code-review (round N+1, apply degradation)
  |
  | verdict: passed / needs-intervention
  v
Orchestrator -> done/e2e-verify / needs-intervention
```

**Key integration points:**

- C5 produces `review_report_path` -- C4 (fix mode) reads this file for fix instructions.
- C5 returns `effective_review_strictness_threshold` -- Orchestrator passes this to C4 so Dev Runner knows severity scope.
- Orchestrator increments `review_round` on each cycle -- C5 uses this for degradation scheduling.
- C5 never directly calls C4 -- all dispatch flows through Orchestrator (Principle 4).

---

## State Flow Diagram

```
                    Step 1: Validate
                         |
               state == review?
                    /           \
                  NO            YES
                  |              |
          return failure    Step 2: Degradation Check
                              /          \
                    round >= 8?      round < 8
                        |                  |
                  return             Steps 3-7: Review
                needs-intervention         |
                                    Step 8: Verdict?
                                     /          \
                                 passed      needs-fix
                                   |              |
                              (Step 10)     Step 9: Report
                                   |              |
                              return         (Step 10)
                              passed              |
                                            return
                                          needs-fix
```

### State Machine Integration

| Verdict | Current State | Next State | Triggered By |
|---------|--------------|------------|-------------|
| `passed` | `review` | `done` (or `e2e-verify`) | Orchestrator |
| `needs-fix` | `review` | (stays `review`, dispatches C4 fix) | Orchestrator -> Dev Runner (C4) fix mode |
| `needs-intervention` | `review` | `needs-intervention` | Orchestrator (degradation round 8+) |
| `failure` | `review` | `needs-intervention` | Orchestrator |

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|----------|--------------|
| Story not in `review` state | Step 1 | Fatal | Abort immediately | `failure` |
| `sprint-status.yaml` not found | Step 1 | Fatal | Abort immediately | `failure` |
| Story file not found | Step 5 | Fatal | Abort immediately | `failure` |
| No code changes found | Step 5 | Fatal | Abort immediately | `failure` |
| Persona load failure | Step 4 | Fatal | Abort immediately | `failure` |
| Git diff command failure | Step 5 | Fatal | Abort immediately | `failure` |
| BMM code-review Skill call failure | Step 6 | Fatal | Abort immediately | `failure` |
| Knowledge Researcher timeout (lessons) | Step 3 | Warning | Continue without lessons context | Continue (degraded) |
| `project-context.md` not found | Step 5 | Warning | Continue with reduced context (warning logged) | Continue (degraded) |
| Round 8+ degradation | Step 2 | Info | Return `needs-intervention` immediately, skip review | `needs-intervention` |

**Degradation principle:** Non-critical failures (lessons timeout, missing project-context) degrade gracefully. Only critical failures (wrong state, missing Story file, persona failure, no code changes) produce `status: "failure"`.

### Timeout Configuration

- Workflow overall timeout: `agent_timeout_seconds.code_review: 900` (15 min)
- Knowledge Researcher per-call timeout: `defaults.agent_timeout_seconds.knowledge_research: 600` (10 min)
- Timeout handling: Orchestrator enforces based on `agent_timeout_action` config (default: `mark_needs_intervention`)

---

## Agent Interface Alignment

This section confirms alignment between the Workflow and the Review Runner Agent definition.

### Skill Call Parameters Mapping

```yaml
# Workflow inputs                       --> Agent Skill Call Parameters
story_key: "3-1"                         --> story_key: "3-1"
session_id: "sprint-..."                 --> session_id: "sprint-..."
config_overrides: {}                     --> config_overrides: {}
review_round: 1                          --> config_overrides.review_round: 1
# Agent has mode: "review"              --> (Workflow is always "review" mode, implicit)
```

> **Note:** `review_round` is a top-level required input in this Workflow but is nested inside `config_overrides` in the Agent definition. The Orchestrator is responsible for mapping the value correctly when dispatching. The Agent's `mode` parameter is always `"review"` for this workflow and therefore implicit.

### Return Value Alignment

| Workflow Return Field | Agent Return Field | Type | Match |
|----------------------|-------------------|------|-------|
| `status` | `status` | enum: passed/needs-fix/needs-intervention | Yes |
| `story_key` | `story_key` | string | Yes |
| `mode` | `mode` | string ("review") | Yes |
| `session_id` | `session_id` | string | Yes |
| `review_round` | `review_round` | integer | Yes |
| `results.verdict` | `results.verdict` | enum: passed/needs-fix/needs-intervention | Yes |
| `results.effective_review_strictness_threshold` | `results.effective_review_strictness_threshold` | string | Yes |
| `results.degradation_applied` | `results.degradation_applied` | string | Yes |
| `results.findings_total` | `results.findings_total` | integer | Yes |
| `results.findings_by_severity` | `results.findings_by_severity` | object {HIGH, MEDIUM, LOW} | Yes |
| `results.findings_after_filter` | `results.findings_after_filter` | integer | Yes |
| `results.findings` | `results.findings` | array of {id, severity, category, description, affected_files, fix_instruction} | Yes |
| `results.review_report_path` | `results.review_report_path` | string | Yes |
| `results.knowledge_queries` | `results.knowledge_queries` | array | Yes |
| `errors` | `errors` | array | Yes |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| `review` --> `done` (or `e2e-verify`) (passed) | Step 10: passed | Yes |
| `review` --> Dev Runner fix mode (needs-fix) | Step 10: needs-fix | Yes |
| `review` --> `needs-intervention` (round 8+) | Step 10: needs-intervention | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Input params | `story_key`, `session_id`, `review_round`, `config_overrides` | `story_key`, `mode`, `session_id`, `config_overrides` (includes `review_round`) | Yes (mapping note above) |
| Output status values | `passed`, `needs-fix`, `needs-intervention` | `passed`, `needs-fix`, `needs-intervention` | Yes |
| Checklist items | CR-1 through CR-6 | AC Satisfaction, Test Coverage, Error Handling, Security, Performance, Scope Compliance | Yes |
| Exclusion list | naming style, comments, design patterns, formatting | naming style, comments, design patterns, formatting | Yes |
| Severity levels | HIGH, MEDIUM, LOW | HIGH, MEDIUM, LOW | Yes |
| Degradation schedule | Round 3/5/8 from config.yaml | Round 3/5/8 from config.yaml | Yes |
| Return value schema | Full findings + report path + degradation info | Full findings + report path + degradation info | Yes |
| State transitions | `review` -> `done`/`e2e-verify` / C4 fix / `needs-intervention` | `review` -> `done`/`e2e-verify` / Dev Runner fix / `needs-intervention` | Yes |
| Persona | BMM Architect (Winston) headless | BMM Architect (Winston) headless | Yes |
| review_strictness_threshold source | `config.yaml` defaults + `config_overrides` + degradation | `config.yaml` defaults + `config_overrides` + degradation | Yes |

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `defaults.review_strictness` | `config.yaml` | `"normal"` | Step 2 |
| `defaults.max_review_rounds` | `config.yaml` | 10 | Step 2 |
| `defaults.review_degradation.round_3` | `config.yaml` | `"lower_strictness"` | Step 2 |
| `defaults.review_degradation.round_5` | `config.yaml` | `"high_only"` | Step 2 |
| `defaults.review_degradation.round_8` | `config.yaml` | `"force_needs_intervention"` | Step 2 |
| `defaults.agent_timeout_seconds.code_review` | `config.yaml` | 900 (15 min) | Orchestrator timeout enforcement |
| `defaults.agent_timeout_seconds.knowledge_research` | `config.yaml` | 600 (10 min) | Step 3 |
| `role_mapping.review_runner_persona` | `config.yaml` | `"bmad:bmm:agents:architect"` | Step 4 |
| `workflow_mapping.code_review` | `config.yaml` | `"bmad:bmm:workflows:code-review"` | Step 6 |
| `e2e_inspection.enabled` | `config.yaml` | `false` | Step 8 (determines done vs e2e-verify) |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Orchestrator timeout enforcement |
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Step 1 |

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | Degrade over error | Steps 3, 5 (Knowledge Researcher timeout -> continue without lessons; project-context.md missing -> continue with reduced context) |
| 3 | Budget controls everything | Step 2 (max review rounds, degradation) |
| 4 | Single entry point for state writes | Step 10 (Orchestrator writes state, not this workflow) |
| 5 | State is the single source of truth | Step 1 (validate state before acting) |
| 6 | Objective checklist over subjective aesthetics | Step 6 (fixed checklist, no invented criteria, explicit exclusions) |
| 8 | Headless Persona Loading | Step 4 (skip interactive behavior) |
| 15 | Per-phase timeout | Orchestrator enforces 900s timeout on entire workflow |
| 19 | Dev Scope Guard | Step 6 CR-6 (scope compliance check) |
| 22 | Review progressive degradation | Step 2 (round-based degradation schedule) |
| 25 | Lessons injection budget | Step 3 (max 10 entries) |
| 30 | Review persona independence | Step 4 (Architect Winston, not Dev Amelia) |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (create mode, YOLO)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: code-review.spec.md + review-runner.md agent definition + config.yaml + module-brief-bso.md_
_Reference structure: story-review/workflow.md (C3)_
