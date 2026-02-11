---
name: story-review
id: C3
description: "C3: Review Story quality + verify technical feasibility + API existence verification"
module: bso
agent: bso-story-reviewer
type: core
version: 1.1.1
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Story Review Workflow (C3)

> Review Story document quality, verify technical feasibility, and validate API/method name existence via Knowledge Researcher (F1). Supports configurable fallback strategies when max review rounds are exhausted.

## Purpose

Act as the quality gate between Story creation and development. Apply an objective, fixed checklist (Principle 6) to each Story document, auto-verify technical claims via Knowledge Researcher (Principle 27), and produce a binary passed/needs-improve verdict. When review rounds exceed the configured maximum, activate one of three fallback strategies (Principle 7) to prevent pipeline blockage.

## Primary Agent

**Story Reviewer** (`bso-story-reviewer`) -- loads BMM PM (John) persona in headless mode.

## Supporting Agents

- **Knowledge Researcher** (F1) -- Lessons injection (Step 3) + API existence verification (Step 7)
- **Story Creator** (C2) -- Downstream consumer; receives revision directives when verdict is `needs-improve`

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Story identifier (epic-story)
    session_id: "sprint-2026-02-07-001"       # Sprint session tracking ID
    story_file_path: "path/to/story-3-1.md"  # Absolute path to Story .md file
  optional:
    config_overrides:
      max_story_review_rounds: 3              # Default: 3 (from config.yaml)
      story_review_fallback: "ask_user"       # Default: "ask_user" (from config.yaml)
    review_round: 1                           # Current round; auto-determined from history if omitted
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Format `\d+-\d+` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `story_file_path` | File exists and readable | abort, status: "failure", error: "Story file not found" |
| `review_round` | Positive integer (if provided) | Default: auto-determined from review history |

---

## Output Schema

### Return Value

```yaml
return:
  status: "passed" | "needs-improve" | "fallback-activated" | "failure"
  story_key: "3-1"
  mode: "review"
  session_id: "sprint-2026-02-07-001"
  results:
    review_round: 1
    verdict: "passed" | "needs-improve"
    checklist:
      - id: "RC-1"
        item: "AC clarity"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-2"
        item: "Task sequence"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-3"
        item: "Technical feasibility"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-4"
        item: "Requirement consistency"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-5"
        item: "Scope sizing"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-6"
        item: "Dependency documentation"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-7"
        item: "File scope declaration"
        result: "pass" | "fail"
        feedback: ""
      - id: "RC-8"
        item: "API/method existence"
        result: "pass" | "fail"
        feedback: ""
    api_verifications:
      - name: "defHttp.post"
        framework: "jeecgboot-vue3"
        result: "confirmed" | "not-found" | "uncertain"
    fallback:
      activated: false
      strategy: ""
      reason: ""
    knowledge_queries:
      - query: "Verify existence of defHttp.post in jeecgboot-vue3"
        cache_hit: true
  errors: []
```

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|---------------|
| `review` | `story-doc-review` | abort, status: "failure", error: "Story not in story-doc-review state" |

## State Transitions

| Mode | Before | After (passed) | After (needs-improve) | After (fallback) | After (failure) |
|------|--------|---------------|----------------------|-----------------|----------------|
| `review` | `story-doc-review` | `ready-for-dev` | `story-doc-improved` | depends on strategy | `story-doc-review` (no change) |

> **Note:** State transitions are executed by the Orchestrator after receiving the return value. This workflow does NOT directly write to sprint-status.yaml (Principle 4: single entry point for state writes).

---

## Workflow Steps

### Step 1: State Validation

**Goal:** Confirm the Story is in a reviewable state before proceeding.

**Actions:**

1. Read `sprint-status.yaml` from configured status file search paths.
2. Locate the entry for `story_key`.
3. Verify the Story state is `story-doc-review`.
4. If the state is NOT `story-doc-review`:
   - Return immediately with `status: "failure"`.
   - Error message: `"Story {story_key} is in state '{current_state}', expected 'story-doc-review'."`

**On Success:** Continue to Step 2.
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "state_mismatch"
      expected: "story-doc-review"
      actual: "{current_state}"
      message: "Story {story_key} is in '{current_state}' state, expected 'story-doc-review'"
```

**Principle references:** Principle 5 (state is the single source of truth), Principle 4 (single entry point for state writes).

```yaml
step_1:
  name: "State Validation"
  reads:
    - sprint-status.yaml
  validates:
    - story_key exists in status file
    - story state == "story-doc-review"
  on_failure:
    return:
      status: "failure"
      errors: ["State mismatch: expected 'story-doc-review', found '{actual}'"]
```

---

### Step 2: Review Round Check

**Goal:** Determine the current review round and enforce the max review rounds budget.

**Actions:**

1. Determine `review_round`:
   - If `review_round` is provided in inputs, use it directly.
   - Otherwise, count the number of previous `story-doc-review` to `story-doc-improved` transitions for this Story in the review history. Current round = count + 1.
2. Read `max_story_review_rounds` from `config_overrides` or fall back to `config.yaml` default (3).
3. If `review_round > max_story_review_rounds`:
   - Read `story_review_fallback` strategy from `config_overrides` or `config.yaml` default (`ask_user`).
   - Execute the matching fallback path (see **Fallback Strategy Paths** below).
   - Record fallback activation to `_lessons-learned.md`:
     ```markdown
     - [story-review] Story {story_key}: review fallback activated after {review_round} rounds.
       Strategy: {strategy}. Reason: max review rounds ({max}) exceeded.
     ```
   - Skip Steps 3-9, return with `status: "fallback-activated"`.

**On Success (within budget):** Continue to Step 3.
**On Exceeded:** Execute fallback strategy, return immediately.

**Principle references:** Principle 3 (budget controls everything), Principle 7 (always have an escape hatch).

```yaml
step_2:
  name: "Review Round Check"
  reads:
    - config.yaml (defaults.max_story_review_rounds)
    - config.yaml (defaults.story_review_fallback)
    - Story review history (from sprint-status.yaml or Story file)
  condition: review_round > max_story_review_rounds
  on_exceeded:
    execute: fallback_strategy
    return:
      status: "fallback-activated"
      fallback:
        activated: true
        strategy: "{strategy_name}"
        reason: "Review round {n} exceeds max {max}"
```

#### Fallback Strategy Paths

| Strategy | Behavior | State Transition | Lessons Recording |
|----------|----------|-----------------|-------------------|
| `ask_user` (default) | Pause Sprint. Present review history summary (all rounds, all failing checklist items) to user. User decides: approve / reject / manual-fix. | Depends on user decision | Yes -- record round count + strategy |
| `force_pass` | Auto-approve Story with warning annotation written directly into Story file header. Log to `_lessons-learned.md`. | `story-doc-review` to `ready-for-dev` | Yes -- record round count + strategy + "force_pass warning" |
| `skip_story` | Mark Story as `needs-intervention`. Skip to next Story in queue. Log to `_lessons-learned.md`. | `story-doc-review` to `needs-intervention` | Yes -- record round count + strategy + "skipped" |

---

### Step 3: Lessons Injection

**Goal:** Inject relevant historical lessons into the review context to avoid repeating known issues.

**Actions:**

1. Trigger Knowledge Researcher (F1) in `lessons-inject` mode.
2. Parameters:
   ```yaml
   mode: "lessons-inject"
   phase: "story-review"
   story_key: "{story_key}"
   session_id: "{session_id}"
   ```
3. Knowledge Researcher reads `_lessons-learned.md`, filters entries tagged `[story-review]`, returns at most 10 entries sorted by recency + relevance (Principle 25).
4. Injected lessons become part of the review context for subsequent steps.

**On Success:** `lessons_injected: N` (actual count), continue to Step 4.
**On Failure (Knowledge Researcher unavailable):** Log warning, continue with empty context (Principle 2: degrade over error).

**Principle references:** Principle 25 (lessons injection budget -- max 10 entries).

```yaml
step_3:
  name: "Lessons Injection"
  triggers:
    agent: knowledge-researcher (F1)
    mode: "lessons-inject"
    params:
      phase: "story-review"
      max_entries: 10
  output: lessons_context[]
```

---

### Step 4: Headless Persona Load

**Goal:** Load BMM PM (John) persona knowledge without triggering interactive behavior.

**Actions:**

1. Execute Skill call to load BMM PM (John) persona:
   ```yaml
   skill: "bmad:bmm:agents:pm"
   mode: "headless"
   ```
2. Immediately declare YOLO/automation mode -- skip menu display and user interaction prompts.
3. Do NOT validate specific activation signals (e.g., "I'm John").
4. Validate load success via Skill call return value.
5. If load fails:
   - Return immediately with `status: "failure"`.
   - Error message: `"Failed to load BMM PM (John) persona in headless mode."`

**On Success:** Persona knowledge loaded, continue to Step 5.
**On Failure:**
```yaml
return:
  status: "failure"
  errors: ["Persona load failure: BMM PM (John)"]
```

**Principle references:** Principle 8 (headless persona loading).

```yaml
step_4:
  name: "Headless Persona Load"
  skill_call:
    target: "bmad:bmm:agents:pm"
    mode: "headless"
    config_ref: "role_mapping.story_reviewer_persona"
  validates:
    - skill return value indicates success
  on_failure:
    return:
      status: "failure"
      errors: ["Persona load failure: BMM PM (John)"]
```

---

### Step 5: Context Loading

**Goal:** Load all necessary context for the review.

**Actions:**

1. Read Story `.md` file at `story_file_path`.
   - Extract: Acceptance Criteria (AC), tasks, subtasks, technical references, file scope declarations, dependency declarations.
   - If file not found: return immediately with `status: "failure"`, error: `"Story file not found: {story_file_path}"`.
2. Read `project-context.md` for architecture context (tech stack, module boundaries, conventions).
3. Merge lessons context from Step 3 into review context.

**On Success:** Context loaded, continue to Step 6.
**On Failure:**
- Story file not found --> abort, status: "failure", error: "Story file not found at {story_file_path}"
- project-context.md not found --> log warning, continue (non-fatal)

```yaml
step_5:
  name: "Context Loading"
  reads:
    - "{story_file_path}" (Story .md file)
    - project-context.md (architecture context)
    - lessons_context[] (from Step 3)
  extracts:
    - acceptance_criteria[]
    - tasks[]
    - subtasks[]
    - technical_references[]
    - file_scope_declarations[]
    - dependency_declarations[]
  on_file_not_found:
    return:
      status: "failure"
      errors: ["Story file not found: {story_file_path}"]
```

---

### Step 6: Checklist Review

**Goal:** Apply the fixed, objective review checklist against the Story document. Each item is binary pass/fail with no subjective scoring.

**Actions:**

Apply checklist items RC-1 through RC-7 (RC-8 is deferred to Step 7):

| # | Checklist Item | Pass Criteria | Evaluation Method |
|---|----------------|---------------|-------------------|
| RC-1 | AC clarity | Each AC is specific, measurable, and independently testable | Review each AC for concrete conditions, measurable outcomes, and independent testability |
| RC-2 | Task sequence | Tasks and subtasks have correct execution order with no circular dependencies | Validate task dependency graph is a DAG (directed acyclic graph) |
| RC-3 | Technical feasibility | Implementation approach is viable given project architecture and tech stack | Cross-reference with `project-context.md` architecture constraints |
| RC-4 | Requirement consistency | No ambiguous, contradictory, or conflicting requirements within the Story | Scan for logical contradictions between AC items and between AC and task descriptions |
| RC-5 | Scope sizing | Story is completable within a single development cycle (not an Epic in disguise) | Check task count, subtask depth, and file scope breadth |
| RC-6 | Dependency documentation | Cross-Story dependencies explicitly identified with Story keys | Verify all referenced Story keys exist and dependency direction is documented |
| RC-7 | File scope declaration | Modified file paths declared and reasonable for the Story's scope | Check file paths are present, not overly broad, and consistent with task descriptions |

**Rules:**

- Each item produces exactly one result: `"pass"` or `"fail"`.
- Failed items MUST include a `feedback` string explaining what is wrong and what to fix.
- The reviewer MUST NOT invent additional criteria beyond RC-1 through RC-8 -- preventing review oscillation across rounds (Principle 6).
- RC-8 is evaluated in Step 7 (API Verification Sub-flow).

**On Success:** All RC-1 to RC-7 evaluated, continue to Step 7.

**Principle references:** Principle 6 (objective checklist over subjective aesthetics).

```yaml
step_6:
  name: "Checklist Review"
  applies:
    checklist_items: [RC-1, RC-2, RC-3, RC-4, RC-5, RC-6, RC-7]
  each_item:
    result: "pass" | "fail"
    feedback: "string (required if fail)"
  rules:
    - binary pass/fail only
    - no subjective scoring
    - no criteria invention beyond RC-1 to RC-8
    - RC-8 deferred to Step 7
```

---

### Step 7: API Verification Sub-flow (Principle 27)

**Goal:** Verify that all API endpoints, method signatures, framework utility names, and component names referenced in the Story actually exist.

**Actions:**

1. **Extract:** Scan Story document for all API/method names, endpoint paths, component names, and technical claims.
2. **Deduplicate:** Group identical references to avoid redundant Knowledge Researcher calls.
3. **Verify:** For each unique reference:
   - Trigger Knowledge Researcher (F1) in `research` mode:
     ```yaml
     mode: "research"
     query: "Verify existence of {api_or_method_name} in {framework/library}"
     context: "Story review API verification"
     story_key: "{story_key}"
     session_id: "{session_id}"
     ```
   - Record result: `confirmed` | `not-found` | `uncertain`.
4. **Budget enforcement:**
   - API verification calls count toward `max_calls_per_story` (default: 3 from `config.yaml`).
   - When budget exhausted: log warning, mark all remaining unverified APIs as `"uncertain"` (NOT auto-fail).
   - Continue review with available results.
5. **RC-8 evaluation:**
   - Any `"not-found"` result --> RC-8 `"fail"` for that reference, with feedback identifying the specific API/method.
   - All `"confirmed"` --> RC-8 `"pass"`.
   - Mix of `"confirmed"` and `"uncertain"` (no `"not-found"`) --> RC-8 `"pass"` with warning annotation.

**On Success:** RC-8 evaluated, continue to Step 8.
**On Failure (Knowledge Researcher timeout):** Mark timed-out APIs as `"uncertain"`, continue review (Principle 2: degrade over error).

**Principle references:** Principle 27 (story technical claim verification), Principle 3 (budget controls everything).

```yaml
step_7:
  name: "API Verification Sub-flow"
  sub_steps:
    extract:
      scan: Story .md file
      targets: [api_endpoints, method_signatures, framework_utilities, component_names]
    deduplicate:
      group_by: unique_reference_name
    verify:
      for_each: unique_reference
      triggers:
        agent: knowledge-researcher (F1)
        mode: "research"
        query_template: "Verify existence of {name} in {framework}"
      result_values: ["confirmed", "not-found", "uncertain"]
    budget:
      source: config.yaml (knowledge_research.max_calls_per_story)
      default: 3
      on_exhausted:
        action: mark_remaining_as_uncertain
        log: warning
    rc8_evaluation:
      any_not_found: RC-8 fail
      all_confirmed: RC-8 pass
      confirmed_plus_uncertain: RC-8 pass with warning
```

---

### Step 8: Verdict Compilation

**Goal:** Produce a binary verdict from checklist and API verification results.

**Actions:**

1. Collect results from Step 6 (RC-1 through RC-7) and Step 7 (RC-8).
2. Apply verdict logic:
   - **ALL** 8 checklist items `"pass"` AND **ALL** API verifications `"confirmed"` or `"uncertain"` (no `"not-found"`) --> `verdict: "passed"`.
   - **ANY** checklist item `"fail"` OR **ANY** API verification `"not-found"` --> `verdict: "needs-improve"`.

**On Success (passed):** Continue to Step 10 (Return).
**On Needs-Improve:** Continue to Step 9 (Feedback Generation).

```yaml
step_8:
  name: "Verdict Compilation"
  inputs:
    - checklist_results[RC-1..RC-8] from Steps 6 + 7
    - api_verification_results[] from Step 7
  logic:
    all_pass_and_no_not_found:
      verdict: "passed"
      status: "passed"
    any_fail_or_any_not_found:
      verdict: "needs-improve"
      status: "needs-improve"
```

---

### Step 9: Feedback Generation (needs-improve only)

**Goal:** Write specific, actionable improvement directives to the Story file so Story Creator knows exactly what to fix.

**Condition:** Execute ONLY when `verdict == "needs-improve"`.

**Actions:**

1. For each failing checklist item:
   - Write a feedback entry to the Story file's review section.
   - Each directive references the failing checklist item ID (e.g., `[RC-3]`).
   - Directive must be specific and actionable -- not vague ("improve quality") but concrete ("RC-3: The Story references `useVxeGrid` composable but project-context.md shows the project uses `BasicTable` from vben. Replace with the correct component.").
2. For each API verification with `"not-found"` result:
   - Include the API name, framework, and verification result in the feedback.
   - Suggest: verify the correct API name, check framework documentation, or remove the reference.
3. Append review metadata to Story file:
   ```markdown
   ## Review Feedback (Round {review_round})
   **Reviewer:** BMM PM (John) -- Headless
   **Verdict:** needs-improve
   **Date:** {timestamp}

   ### Failing Items
   - [RC-X] {specific directive}
   - [RC-8] API "{name}" not found in {framework}. {suggestion}
   ```

**On Success:** Feedback written to Story file, continue to Step 10 (Return).
**On Failure:** Log warning, continue to Step 10 (feedback write failure is non-fatal -- verdict is still returned).

```yaml
step_9:
  name: "Feedback Generation"
  condition: verdict == "needs-improve"
  actions:
    - write_to: "{story_file_path}"
      section: "Review Feedback (Round {review_round})"
      content:
        - checklist_item_id
        - specific_actionable_directive
        - api_verification_details (if RC-8 failed)
  format:
    each_directive:
      prefix: "[RC-{id}]"
      style: "specific, actionable, references concrete code/config"
```

---

### Step 10: Return

**Goal:** Return the full review result to the Orchestrator for state transition processing.

**Actions:**

1. Assemble the complete return value per the Output Schema.
2. Return to Orchestrator.
3. **Orchestrator** (not this workflow) performs the state transition:
   - `verdict: "passed"` --> `story-doc-review` to `ready-for-dev`.
   - `verdict: "needs-improve"` --> `story-doc-review` to `story-doc-improved` (triggers Story Creator C2 revision).
   - `status: "fallback-activated"` --> depends on strategy (see Step 2).
   - `status: "failure"` --> mark `needs-intervention`.

**On Success:** Return value delivered to Orchestrator.

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
      - results:
          - review_round
          - verdict
          - checklist[]
          - api_verifications[]
          - fallback{}
          - knowledge_queries[]
      - errors[]
  orchestrator_actions:
    passed:
      transition: "story-doc-review -> ready-for-dev"
    needs-improve:
      transition: "story-doc-review -> story-doc-improved"
      triggers: "Story Creator (C2) revision"
    fallback-activated:
      transition: "depends on fallback strategy"
    failure:
      transition: "mark needs-intervention"
```

---

## State Flow Diagram

```
                    Step 1: Validate
                         |
              state == story-doc-review?
                    /           \
                  NO            YES
                  |              |
          return failure    Step 2: Round Check
                              /          \
                    round > max?      round <= max
                        |                  |
                  Execute Fallback    Steps 3-8: Review
                  + Log Lessons           |
                        |           Step 8: Verdict?
                  return fallback    /          \
                  -activated     passed      needs-improve
                                   |              |
                              (Step 10)     Step 9: Feedback
                                   |              |
                              return         (Step 10)
                              passed              |
                                            return
                                          needs-improve
```

### State Machine Integration

| Verdict | Current State | Next State | Triggered By |
|---------|--------------|------------|-------------|
| `passed` | `story-doc-review` | `ready-for-dev` | Orchestrator |
| `needs-improve` | `story-doc-review` | `story-doc-improved` | Orchestrator --> triggers Story Creator (C2) |
| `fallback: ask_user` | `story-doc-review` | (paused, user decides) | Orchestrator |
| `fallback: force_pass` | `story-doc-review` | `ready-for-dev` | Orchestrator (with warning) |
| `fallback: skip_story` | `story-doc-review` | `needs-intervention` | Orchestrator |
| `failure` | `story-doc-review` | `needs-intervention` | Orchestrator |

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|-------------|--------------|
| Story not in `story-doc-review` state | Step 1 | Fatal | Abort immediately | `failure` |
| `sprint-status.yaml` not found | Step 1 | Fatal | Abort immediately | `failure` |
| Story file not found | Step 5 | Fatal | Abort immediately | `failure` |
| Persona load failure | Step 4 | Fatal | Abort immediately | `failure` |
| Knowledge Researcher timeout (lessons) | Step 3 | Warning | Continue without lessons context | Continue (degraded) |
| Knowledge Researcher timeout (API verify) | Step 7 | Warning | Mark timed-out APIs as `"uncertain"`, continue review | Continue (degraded) |
| All checklist pass + some APIs uncertain | Step 8 | Info | `verdict: "passed"` with warnings in `api_verifications` | `passed` |
| Budget exhausted for API calls | Step 7 | Info | Mark remaining APIs as `"uncertain"`, continue | Continue (degraded) |
| `project-context.md` not found | Step 5 | Warning | Continue with reduced context (warning logged) | Continue (degraded) |
| Feedback write failure | Step 9 | Warning | Log warning, continue to Step 10 (verdict still returned) | Continue (degraded) |
| Max review rounds exceeded | Step 2 | Info | Execute fallback strategy, return immediately | `fallback-activated` |

**Degradation principle:** Non-critical failures (lessons timeout, API verification timeout, missing project-context) degrade gracefully. Only critical failures (wrong state, missing Story file, persona failure) produce `status: "failure"`.

### Timeout Configuration

- Workflow overall timeout: `agent_timeout_seconds.story_review: 900` (15 min)
- Knowledge Researcher per-call timeout: `defaults.agent_timeout_seconds.knowledge_research: 600` (10 min)
- Timeout handling: Orchestrator enforces based on `agent_timeout_action` config (default: `mark_needs_intervention`)

---

## Workflow Sequence Diagram

```
Orchestrator                Story Reviewer (C3)             Knowledge Researcher (F1)
    |                              |                                |
    |--- dispatch(story_key, ---->|                                |
    |    session_id,              |                                |
    |    story_file_path)         |                                |
    |                              |                                |
    |                      Step 1: State Validation                 |
    |                              |                                |
    |                      Step 2: Review Round Check               |
    |                        (if exceeded -> fallback -> return)    |
    |                              |                                |
    |                      Step 3: Lessons Injection                |
    |                              |-------- lessons-inject ------->|
    |                              |<------- lessons (max 10) ------|
    |                              |                                |
    |                      Step 4: Headless Persona Load            |
    |                        (BMM PM John via Skill)                |
    |                              |                                |
    |                      Step 5: Context Loading                  |
    |                        (Story + project-context + lessons)    |
    |                              |                                |
    |                      Step 6: Checklist Review (RC-1..RC-7)    |
    |                              |                                |
    |                      Step 7: API Verification (RC-8)          |
    |                              |-------- research (x<=3) ------>|
    |                              |<------- verified/uncertain ----|
    |                              |                                |
    |                      Step 8: Verdict Compilation              |
    |                              |                                |
    |                      Step 9: Feedback Generation              |
    |                        (needs-improve only)                   |
    |                              |                                |
    |                      Step 10: Return                          |
    |<--- return(status, results) -|                                |
    |                              |                                |
    | update sprint-status.yaml    |                                |
    | passed: -> ready-for-dev     |                                |
    | needs-improve: ->            |                                |
    |   story-doc-improved         |                                |
```

---

## Agent Interface Alignment

This section confirms alignment between the Workflow and the Story Reviewer Agent definition.

### Skill Call Parameters Mapping

```yaml
# Workflow inputs                       --> Agent Skill Call Parameters
story_key: "3-1"                         --> story_key: "3-1"
session_id: "sprint-..."                 --> session_id: "sprint-..."
config_overrides: {}                     --> config_overrides: {}
story_file_path: "path/..."             --> (Agent resolves via story_key + convention)
review_round: 1                          --> (Agent auto-determines from review history)
# Agent has mode: "review"              --> (Workflow is always "review" mode, implicit)
```

> **Note:** `story_file_path` and `review_round` are workflow-level inputs that the Agent resolves internally. The Agent's `mode` parameter is always `"review"` for this workflow and therefore implicit.

### Return Value Alignment

| Workflow Return Field | Agent Return Field | Type | Match |
|----------------------|-------------------|------|-------|
| `status` | `status` | enum: passed/needs-improve/fallback-activated/failure | Yes |
| `story_key` | `story_key` | string | Yes |
| `mode` | `mode` | string ("review") | Yes |
| `session_id` | `session_id` | string | Yes |
| `results.review_round` | `results.review_round` | integer | Yes |
| `results.verdict` | `results.verdict` | enum: passed/needs-improve | Yes |
| `results.checklist` | `results.checklist` | array of {id, item, result, feedback} | Yes |
| `results.api_verifications` | `results.api_verifications` | array of {name, framework, result} | Yes |
| `results.fallback` | `results.fallback` | object {activated, strategy, reason} | Yes |
| `results.knowledge_queries` | `results.knowledge_queries` | array of {query, cache_hit} | Yes |
| `errors` | `errors` | array | Yes |

### State Transition Alignment

| Agent Declared Transition | Workflow Transition | Match |
|--------------------------|-------------------|-------|
| `story-doc-review` --> `ready-for-dev` (passed) | Step 10: passed | Yes |
| `story-doc-review` --> `story-doc-improved` (needs-improve) | Step 10: needs-improve | Yes |

### Cross-Reference Summary

| Aspect | Workflow | Agent | Aligned |
|--------|----------|-------|---------|
| Checklist items | RC-1 through RC-8 | RC-1 through RC-8 | Yes |
| API verification flow | Extract, deduplicate, verify via F1, budget cap | Extract, deduplicate, verify via F1, budget cap | Yes |
| Fallback strategies | `ask_user`, `force_pass`, `skip_story` | `ask_user`, `force_pass`, `skip_story` | Yes |
| Persona | BMM PM (John) headless | BMM PM (John) headless | Yes |
| Max review rounds source | `config.yaml` defaults + `config_overrides` | `config.yaml` defaults + `config_overrides` | Yes |

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `defaults.max_story_review_rounds` | `config.yaml` | 3 | Step 2 |
| `defaults.story_review_fallback` | `config.yaml` | `"ask_user"` | Step 2 |
| `defaults.agent_timeout_seconds.story_review` | `config.yaml` | 900 (15 min) | Orchestrator timeout enforcement |
| `defaults.agent_timeout_seconds.knowledge_research` | `config.yaml` | 600 (10 min) | Steps 3, 7 |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Orchestrator |
| `knowledge_research.max_calls_per_story` | `config.yaml` | 3 | Step 7 |
| `knowledge_research.cache_ttl_days` | `config.yaml` | 30 | Step 7 (cache freshness) |
| `knowledge_research.cache_fuzzy_match` | `config.yaml` | true | Step 7 (cache lookup) |
| `role_mapping.story_reviewer_persona` | `config.yaml` | `"bmad:bmm:agents:pm"` | Step 4 |
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Step 1 |

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 2 | Degrade over error | Steps 3, 5, 7 (Knowledge Researcher timeout/unavailable -> continue degraded; project-context.md missing -> continue) |
| 3 | Budget controls everything | Step 2 (max rounds), Step 7 (max API calls) |
| 4 | Single entry point for state writes | Step 10 (Orchestrator writes state, not this workflow) |
| 5 | State is the single source of truth | Step 1 (validate state before acting) |
| 6 | Objective checklist over subjective aesthetics | Step 6 (fixed checklist, no invented criteria) |
| 7 | Always have an escape hatch | Step 2 (three fallback strategies + lessons recording) |
| 8 | Headless Persona Loading | Step 4 (skip interactive behavior) |
| 15 | Per-phase timeout | Orchestrator enforces 900s timeout on entire workflow |
| 25 | Lessons injection budget | Step 3 (max 10 entries) |
| 27 | Story technical claim verification | Step 7 (API verification sub-flow) |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (create mode, YOLO)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: story-review.spec.md + story-reviewer.md agent definition + config.yaml + module-brief-bso.md_
