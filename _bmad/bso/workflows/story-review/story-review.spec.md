# Workflow Specification: story-review

**Module:** bso
**Status:** Validated
**Created:** 2026-02-07
**Updated:** 2026-02-07
**Workflow ID:** C3
**Agent:** bso-story-reviewer

---

## Workflow Overview

**Goal:** Review Story quality, verify technical feasibility, and validate API/method name existence.

**Description:** Dispatches Story Reviewer (using PM persona for quality gate perspective) to apply objective checklist review. Auto-triggers Knowledge Researcher for lessons injection and API existence verification (Principle 27). Supports configurable fallback strategies when max review rounds are exhausted (Principle 7). Returns verdict of passed / needs-improve / fallback-activated / failure to Orchestrator.

**Workflow Type:** Core (C3)

---

## Steps

| Step | Name | Goal |
|------|------|------|
| 1 | State Validation | Confirm Story is in `story-doc-review` state before proceeding |
| 2 | Review Round Check | Determine current review round and enforce max review rounds budget (Principle 3, 7) |
| 3 | Lessons Injection | Inject relevant historical lessons via Knowledge Researcher (F1) |
| 4 | Headless Persona Load | Load BMM PM (John) persona in headless mode (Principle 8) |
| 5 | Context Loading | Read Story .md file, project-context.md, lessons context |
| 6 | Checklist Review | Apply objective review checklist RC-1 through RC-7 (Principle 6) |
| 7 | API Verification Sub-flow | Extract API/method names, trigger Knowledge Researcher, verify existence (Principle 27) |
| 8 | Verdict Compilation | Determine passed / needs-improve from checklist + API results |
| 9 | Feedback Generation | If needs-improve: generate specific revision instructions in Story file |
| 10 | Return | Return status + review report to Orchestrator |

---

## Fallback Strategy Paths (Principle 7)

| Strategy | Behavior | State Transition |
|----------|----------|-----------------|
| `ask_user` (default) | Pause Sprint. Present review history summary to user. User decides: approve / reject / manual-fix. | Depends on user decision |
| `force_pass` | Auto-approve Story with warning annotation. Log to `_lessons-learned.md`. | `story-doc-review` to `ready-for-dev` |
| `skip_story` | Mark Story as `needs-intervention`. Skip to next Story. Log to `_lessons-learned.md`. | `story-doc-review` to `needs-intervention` |

---

## Workflow Inputs

### Required Inputs

- `story_key`: Story identifier (format: `\d+-\d+`)
- `session_id`: Sprint session tracking ID (non-empty string)
- `story_file_path`: Absolute path to Story .md file

### Optional Inputs

- `config_overrides.max_story_review_rounds`: Override max review rounds (positive integer, default from config.yaml: 3)
- `config_overrides.story_review_fallback`: Override fallback strategy (one of: "ask_user", "force_pass", "skip_story")
- `review_round`: Current round number (positive integer; auto-determined from review history if omitted)

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Format `\d+-\d+` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `story_file_path` | File exists and readable | abort, status: "failure", error: "Story file not found" |
| `review_round` | Positive integer (if provided) | Default: auto-determined from review history |

---

## Workflow Outputs

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

> **Note:** State transitions are executed by the Orchestrator after receiving the return value. This workflow does NOT directly write to sprint-status.yaml (Principle 4).

---

## Agent Integration

### Primary Agent

Story Reviewer (`bso-story-reviewer`) -- loads BMM PM (John) persona in headless mode. Persona ID: `role_mapping.story_reviewer_persona`.

### Supporting Agents

| Agent | Role in This Workflow |
|-------|----------------------|
| Knowledge Researcher (F1) | Lessons injection (Step 3) + API existence verification (Step 7) |
| Story Creator (C2) | Downstream consumer; receives revision directives when verdict is `needs-improve` |

---

## Review Checklist (Objective, Fixed -- Principle 6)

| # | Checklist Item | Pass Criteria |
|---|----------------|---------------|
| RC-1 | AC clarity | Each AC is specific, measurable, and independently testable |
| RC-2 | Task sequence | Tasks and subtasks have correct execution order with no circular dependencies |
| RC-3 | Technical feasibility | Implementation approach is viable given project architecture and tech stack |
| RC-4 | Requirement consistency | No ambiguous, contradictory, or conflicting requirements within the Story |
| RC-5 | Scope sizing | Story is completable within a single development cycle (not an Epic in disguise) |
| RC-6 | Dependency documentation | Cross-Story dependencies explicitly identified with Story keys |
| RC-7 | File scope declaration | Modified file paths declared and reasonable for the Story's scope |
| RC-8 | API/method existence | All API endpoints, method signatures, and component names referenced in the Story actually exist (verified via Knowledge Researcher F1) |

---

## Error Handling

| Error Condition | Detection Point | Severity | Behavior | Return Status |
|----------------|----------------|----------|----------|--------------|
| Story not in `story-doc-review` state | Step 1 | Fatal | Abort immediately | `failure` |
| `sprint-status.yaml` not found | Step 1 | Fatal | Abort immediately | `failure` |
| Story file not found | Step 5 | Fatal | Abort immediately | `failure` |
| Persona load failure | Step 4 | Fatal | Abort immediately | `failure` |
| Knowledge Researcher timeout (lessons) | Step 3 | Warning | Continue without lessons context | Continue (degraded) |
| Knowledge Researcher timeout (API verify) | Step 7 | Warning | Mark timed-out APIs as `"uncertain"`, continue review | Continue (degraded) |
| All checklist pass + some APIs uncertain | Step 8 | Info | `verdict: "passed"` with warnings in `api_verifications` | `passed` |
| Budget exhausted for API calls | Step 7 | Info | Mark remaining APIs as `"uncertain"`, continue | Continue (degraded) |
| `project-context.md` not found | Step 5 | Warning | Continue with reduced context | Continue (degraded) |
| Feedback write failure | Step 9 | Warning | Log warning, continue (verdict still returned) | Continue (degraded) |
| Max review rounds exceeded | Step 2 | Info | Execute fallback strategy, return immediately | `fallback-activated` |

---

## Configuration Dependencies

| Config Key | Location | Default | Used In |
|-----------|----------|---------|---------|
| `defaults.max_story_review_rounds` | `config.yaml` | 3 | Step 2 |
| `defaults.story_review_fallback` | `config.yaml` | `"ask_user"` | Step 2 |
| `defaults.agent_timeout_seconds.story_review` | `config.yaml` | 900 (15 min) | Orchestrator timeout enforcement |
| `defaults.agent_timeout_seconds.knowledge_research` | `config.yaml` | 600 (10 min) | Steps 3, 7 |
| `defaults.agent_timeout_action` | `config.yaml` | `mark_needs_intervention` | Orchestrator timeout enforcement |
| `knowledge_research.max_calls_per_story` | `config.yaml` | 3 | Step 7 |
| `knowledge_research.cache_ttl_days` | `config.yaml` | 30 | Step 7 (cache freshness) |
| `knowledge_research.cache_fuzzy_match` | `config.yaml` | true | Step 7 (cache lookup) |
| `role_mapping.story_reviewer_persona` | `config.yaml` | `"bmad:bmm:agents:pm"` | Step 4 |
| `status_file_search_paths` | `config.yaml` | (project-dependent) | Step 1 |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Steps 3, 5, 7 (Knowledge Researcher timeout / project-context missing -> continue degraded) |
| 3 | Budget controls everything | Step 2 (max rounds), Step 7 (max API calls) |
| 4 | Single entry point for state writes | Step 10 (Orchestrator writes state, not this workflow) |
| 5 | State is the single source of truth | Step 1 (validate state before acting) |
| 6 | Objective checklist over subjective aesthetics | Step 6 (fixed checklist RC-1..RC-8, no invented criteria) |
| 7 | Always have an escape hatch | Step 2 (three fallback strategies + lessons recording) |
| 8 | Headless Persona Loading | Step 4 (skip interactive behavior) |
| 15 | Per-phase timeout | Orchestrator enforces 900s timeout on entire workflow |
| 25 | Lessons injection budget | Step 3 (max 10 entries) |
| 27 | Story technical claim verification | Step 7 (API verification sub-flow) |

---

_Spec validated on 2026-02-07 against workflow.md implementation via bmad:bmb:workflows:workflow validate mode (YOLO)_
_Source: story-review.spec.md (original placeholder) + workflow.md (validated implementation)_
