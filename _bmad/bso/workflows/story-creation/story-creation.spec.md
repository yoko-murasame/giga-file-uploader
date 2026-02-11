---
name: story-creation
id: C2
description: "C2: Create Story document from Epic definition with complete AC, tasks, subtasks, file scope, and technical references"
module: bso
agent: bso-story-creator
version: 1.1.1
type: core
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: story-creation

**Module:** bso
**Workflow ID:** C2
**Status:** Validated
**Created:** 2026-02-07
**Updated:** 2026-02-07

---

## Workflow Overview

**Goal:** Create Story document from Epic definition with complete AC, tasks, subtasks, file scope, and technical references.

**Description:** Dispatches Story Creator agent to generate a complete Story document from an Epic backlog entry. Supports two modes: `create` (full generation from Epic) and `revise` (targeted revision from Story Reviewer feedback). Triggers Knowledge Researcher on-demand for lessons injection and technical claim verification. Produces a Story .md file ready for review. Commits via precise-git-commit (U3) with sensitive file check.

**Workflow Type:** Core (C2)

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | State Validation | Verify Story is in correct state (`backlog` for create, `story-doc-improved` for revise) |
| 2 | Lessons Injection | Inject relevant historical lessons filtered by `[story-creation]` phase tag (max 10, Principle 25) |
| 3 | Context Loading | Read Epic definition, project-context.md, knowledge cache index.yaml; revise mode also reads existing Story + reviewer feedback |
| 4 | Headless Persona Load | Load BMM SM (Bob) persona in headless mode (Principle 8) |
| 5 | Story Generation | Generate Story document with AC, tasks, subtasks, file scope via BMM create-story workflow |
| 6 | Technical Claim Verification | Verify API names, method signatures, framework features via Knowledge Researcher (max 3 calls, Principle 27) |
| 7 | Completeness Validation | Run 7-item Story Completeness Guard checklist with auto-fix capability |
| 8 | File Write | Write Story .md to `{implementation_artifacts}/stories/story-{epic}-{story}.md` |
| 9 | Git Commit | Commit via precise-git-commit (U3) with sensitive file check (Principle 21) |
| 10 | Return | Return status + results + artifact path to Orchestrator |

---

## Workflow Inputs

### Required Inputs

- `story_key`: Story identifier (epic-story format, e.g., "3-1"), validated against `\d+-\d+`
- `session_id`: Sprint session tracking ID (non-empty string)
- `epic_file_path`: Epic definition file absolute path (must exist and be readable)

### Optional Inputs

- `config_overrides`: Runtime configuration overrides (e.g., `max_story_review_rounds`)
- `mode`: `create` (default) or `revise`
  - `create`: Generate new Story from Epic definition
  - `revise`: Revise existing Story based on Story Reviewer feedback

---

## Workflow Outputs

### Output Files

- `{implementation_artifacts}/stories/story-{epic}-{story}.md` (Story document)

### Return Value

```yaml
return:
  status: "success" | "failure" | "completeness-violation" | "needs-intervention"
  story_key: "3-1"
  mode: "create" | "revise"
  session_id: "sprint-2026-02-07-001"
  results:
    story_file: "path/to/story-3-1.md"
    ac_count: 5
    task_count: 8
    subtask_count: 12
    file_scope_declared: true
    completeness_checks:
      all_passed: true
      failures: []
    technical_claims:
      total: 3
      verified: 2
      unverified: 1
      contradicted: 0
    knowledge_queries:
      - query: "JeecgBoot @Dict annotation usage"
        result: "cache-hit"
      - query: "vue-easytable virtual scroll row-height"
        result: "researched"
    lessons_injected: 4
    commits:
      - hash: "def5678"
        message: "docs: Story 3.1: 项目管理CRUD 创建开发文档"
  errors: []
```

### Return Status Definitions

| Status | Meaning | Orchestrator Action |
|--------|---------|---------------------|
| `success` | Story document generated and committed | State transition to `story-doc-review` |
| `failure` | Fatal error (state mismatch, Epic file not found, file write failed, git error) | State unchanged, log to execution report |
| `completeness-violation` | Completeness Guard has remaining violations after auto-fix | Orchestrator decides whether to continue |
| `needs-intervention` | Sensitive file detected or unrecoverable error | Mark as needs human intervention |

---

## State Preconditions

| Mode | Required State | On Wrong State |
|------|---------------|----------------|
| `create` | `backlog` | abort, status: "failure", error: "Story not in backlog state" |
| `revise` | `story-doc-improved` | abort, status: "failure", error: "Story not in story-doc-improved state" |

## State Transitions

| Mode | Before | After (success) | After (failure) |
|------|--------|-----------------|-----------------|
| `create` | `backlog` | `story-doc-review` | `backlog` (unchanged) |
| `revise` | `story-doc-improved` | `story-doc-review` | `story-doc-improved` (unchanged) |

> **Note:** State transitions are executed by the Orchestrator after receiving the return value. This workflow does NOT directly write to sprint-status.yaml (Principle 4).

---

## Agent Integration

### Primary Agent

Story Creator (`bso-story-creator`) -- BMM SM (Bob) persona, headless mode.

### Supporting Agents

| Agent | Role in This Workflow |
|-------|----------------------|
| Knowledge Researcher (F1) | Lessons injection (Step 2) + Technical claim verification (Step 6) |

---

## Error Handling Summary

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|----------------|----------------|----------|--------|----------------|
| Story state mismatch | Step 1 | Fatal | Abort immediately | `failure` |
| Epic file not found | Step 3 | Fatal | Abort immediately | `failure` |
| project-context.md not found | Step 3 | Warning | Log warning, continue | N/A (continue) |
| Knowledge Researcher unavailable | Step 2, 6 | Warning | Degrade, continue (Principle 2) | N/A (continue) |
| BMM SM Persona load failure | Step 4 | Warning | Fallback to lean persona | N/A (continue) |
| Knowledge Researcher timeout | Step 6 | Warning | Mark `[unverified]`, continue | N/A (continue) |
| Knowledge Research budget exhausted | Step 6 | Info | Stop new queries, continue | N/A (continue) |
| Completeness Guard failure | Step 7 | Conditional | Auto-fix, report residual | `completeness-violation` |
| File write failure | Step 8 | Fatal | Abort | `failure` |
| Sensitive file detected | Step 9 | Critical | Abort commit | `needs-intervention` |
| Git commit failure | Step 9 | Error | Report error, Story file preserved | `failure` |
| Agent timeout | Any | Fatal | Orchestrator detects | `needs-intervention` |

### Timeout Configuration

- Workflow overall timeout: `agent_timeout_seconds.story_creation: 900` (15 min)
- Knowledge Researcher per-call timeout: `knowledge_research.timeout_seconds: 600` (10 min)

---

## Configuration Dependencies

```yaml
role_mapping.story_creator_persona          # Step 4: Persona ID
workflow_mapping.create_story               # Step 5: BMM workflow Skill path
defaults.max_story_review_rounds            # Revise mode context
defaults.agent_timeout_seconds.story_creation  # Overall timeout
defaults.agent_timeout_action               # Timeout handling strategy
knowledge_research.enabled                  # Step 2, 6: Feature toggle
knowledge_research.max_calls_per_story      # Step 6: Per-story call limit (3)
knowledge_research.timeout_seconds          # Step 6: Per-call timeout
knowledge_research.cache_ttl_days           # Step 6: Cache validity period
git_commit_patterns.story_created           # Step 9: Create mode commit template
git_commit_patterns.story_revised           # Step 9: Revise mode commit template
status_file_search_paths                    # Step 1: Status file search paths
```

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Steps 2/6: Knowledge Researcher unavailable -> continue; Step 4: Persona fallback |
| 4 | Single entry point for state writes | Step 10: Orchestrator writes state, not this workflow |
| 5 | State is the single source of truth | Step 1: Only check state, don't assume Story origin |
| 8 | Headless Persona Loading | Step 4: Load persona knowledge, skip interactive behavior |
| 21 | Git Commit Safeguard | Step 9: Sensitive file check before commit |
| 25 | Lessons injection budget | Step 2: Max 10 entries |
| 27 | Technical claim verification | Step 6: Verify API/method names via Knowledge Researcher |

---

_Spec updated on 2026-02-07 to align with validated workflow.md_
_Source: story-creation/workflow.md (C2) + story-creator.md agent definition_
