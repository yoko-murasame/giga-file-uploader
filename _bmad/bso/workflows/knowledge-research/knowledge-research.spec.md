# Workflow Specification: knowledge-research

**Module:** bso
**Workflow ID:** F1
**Workflow Type:** Feature
**Status:** Validated -- Aligned with workflow.md
**Created:** 2026-02-07
**Last Validated:** 2026-02-07

---

## Workflow Overview

**Goal:** Multi-source technical research with intelligent caching, version-aware invalidation, LRU capacity management, and phase-filtered lessons injection.

**Description:** On-demand research service for all BSO agents. Supports dual-mode operation: `research` mode executes Context7 -> DeepWiki -> WebSearch priority chain with budget control and generates standardized reports; `lessons-inject` mode filters, sorts, and injects historical lessons by phase tag. All external calls are budget-controlled, cache hits incur zero network latency, and graceful degradation is preferred over errors.

**Workflow Type:** Feature (F1)

---

## Planned Steps -- Research Mode

| Step | Name | Goal |
|------|------|------|
| 1 | Request Parsing & Validation | Parse mode, validate required fields, initialize budget counter |
| 2 | Cache Check | Read index.yaml -> fuzzy match tags + framework + topic, version-aware TTL check |
| 3 | Cache Hit Fast Path | If fresh cache hit: update last_accessed, return report immediately (zero network delay) |
| 4 | Headless Persona Load | Load BMM Architect (Winston) persona via Skill call (headless mode) |
| 5 | Research Execution | Context7 -> DeepWiki -> WebSearch priority chain with budget guard |
| 6 | Report Generation | Generate standardized markdown report with confidence level + source URLs |
| 7 | Cache Write & Index Update | Write report to knowledge-base, update index.yaml (through queue if parallel) |
| 8 | LRU Capacity Guard | Enforce 200-entry limit, 60-day auto-archive, LRU eviction |
| 9 | Return | Assemble and return execution result to caller |

## Planned Steps -- Lessons-Inject Mode

| Step | Name | Goal |
|------|------|------|
| LI-0 | Persona Loading (Skipped) | Skipped by design -- deterministic data processing, no research judgment needed |
| LI-1 | Read _lessons-learned.md | Read and parse all lesson entries from experience file |
| LI-2 | Phase Filter | Filter entries by caller-specified phase tag |
| LI-3 | Sort & Budget | Sort by recency + relevance, cap at 10 entries |
| LI-4 | Format & Return | Format as injection block and return to caller |

---

## Workflow Inputs

### Research Mode -- Required Inputs

| Field | Type | Description |
|-------|------|-------------|
| `story_key` | string | Epic-Story identifier, format: `{epic}-{story}` (e.g., "3-1") |
| `mode` | literal | Fixed value `"research"` |
| `session_id` | string | Sprint session tracking ID |
| `research_query.framework` | string | Framework/library name (e.g., "vue-easytable") |
| `research_query.framework_version` | string | Current project version (e.g., "2.x") |
| `research_query.topic` | string | Research topic description |
| `research_query.tags` | string[] | Fuzzy match tags (at least 1) |
| `research_query.question` | string | Specific technical question |

### Research Mode -- Optional Inputs

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `config_overrides.max_calls` | integer | 3 | Override max_calls_per_story |
| `config_overrides.timeout_seconds` | integer | 600 | Override per-call timeout |

### Lessons-Inject Mode -- Required Inputs

| Field | Type | Description |
|-------|------|-------------|
| `story_key` | string | Epic-Story identifier |
| `mode` | literal | Fixed value `"lessons-inject"` |
| `session_id` | string | Sprint session tracking ID |
| `lessons_inject.phase` | string | Phase tag, one of: `story-creation`, `story-review`, `dev-execution`, `code-review`, `e2e-inspection` |

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | Matches `\d+-\d+` | abort, status: "failure" |
| `session_id` | Non-empty string | abort, status: "failure" |
| `mode` | "research" or "lessons-inject" | abort, status: "failure", error: "Invalid mode" |
| `research_query.framework` | Non-empty string (research mode) | abort, status: "failure" |
| `research_query.framework_version` | Non-empty string (research mode) | abort, status: "failure" |
| `research_query.topic` | Non-empty string (research mode) | abort, status: "failure" |
| `research_query.tags` | Non-empty array, >= 1 tag (research mode) | abort, status: "failure" |
| `research_query.question` | Non-empty string (research mode) | abort, status: "failure" |
| `lessons_inject.phase` | In legal phase tags list (lessons-inject mode) | abort, status: "failure" |

---

## Workflow Outputs

### Output Files

- `knowledge-base/frameworks/{framework}/{topic}.md` -- Research report (research mode only)
- `knowledge-base/index.yaml` -- Cache index entry (research mode only)
- `knowledge-base/_archived-index.yaml` -- Archived entries (LRU eviction, research mode only)
- (No file output for lessons-inject mode -- content returned via return value)

### Return Value -- Research Mode

```yaml
status: "success" | "partial" | "cache-hit" | "degraded" | "budget-exhausted" | "timeout" | "failure"
story_key: "3-1"
mode: "research"
session_id: "sprint-2026-02-07-001"
results:
  cache_hit: true | false
  cache_entry_id: "vue-easytable-virtual-scroll"
  report_path: "frameworks/vue-easytable/virtual-scroll.md"
  confidence: "high" | "medium" | "low"
  sources_consulted:
    - source: "context7"
      status: "success" | "unavailable" | "timeout" | "skipped"
      url: "https://context7.com/..."
    - source: "deepwiki"
      status: "skipped"
      url: null
    - source: "web_search"
      status: "skipped"
      url: null
  budget_remaining: 2
  degradation_notes: []
  index_updated: true
  index_count: 145
  lru_evicted: 0
errors: []
```

### Return Value -- Lessons-Inject Mode

```yaml
status: "success" | "empty" | "failure"
story_key: "3-1"
mode: "lessons-inject"
session_id: "sprint-2026-02-07-001"
results:
  phase: "dev-execution"
  total_lessons_found: 25
  phase_filtered_count: 8
  injected_count: 8
  injection_block: |
    [LESSONS] dev-execution phase warnings:
    1. vue-easytable virtual scrolling needs explicit row-height -- src/components/DataGrid.vue
    2. JeecgBoot defHttp auto-unwraps ApiResponse -- do not double-access .result
    ...
errors: []
```

---

## Error Handling Summary

| # | Error Scenario | Severity | Action | Status |
|---|---------------|----------|--------|--------|
| 1 | Input validation failure | Fatal | Abort with error detail | `failure` |
| 2 | Feature disabled in config | Fatal | Abort | `failure` |
| 3 | index.yaml not found | Info | Treat as cache miss | (continue) |
| 4 | index.yaml read/parse error | Warning | Treat as cache miss | (continue) |
| 5 | Cached report file missing | Warning | Remove index entry, fallback to cache miss | (continue) |
| 6 | Persona load failure | Warning | Fallback to lean persona | (continue) |
| 7-9 | Individual source unavailable | Warning | Skip, try next in chain | (continue) |
| 10 | All sources unavailable | Warning | Return degraded result | `degraded` |
| 11 | Single call timeout | Warning | Skip source, try next | `timeout` |
| 12 | Budget exhausted | Info | Stop, return partial | `budget-exhausted` |
| 13-14 | File/index write failure | Error | Report in memory still available | `partial` |
| 15 | LRU eviction failure | Warning | Log, mark incomplete | (continue) |
| 16 | _lessons-learned.md not found | Info | Return empty injection | `empty` |
| 17 | _lessons-learned.md read error | Error | Return failure | `failure` |
| 18 | No matching phase entries | Info | Return empty injection | `empty` |
| 19 | Parallel > 1 index.yaml write conflict | Warning | Retry via Orchestrator serialized write queue (Principle 23) | (continue) |
| 20 | Agent overall timeout (> agent_timeout_seconds) | Fatal | Orchestrator detects and terminates agent | `needs-intervention` |

---

## Agent Integration

### Primary Agent

Knowledge Researcher (`bso-knowledge-researcher`) -- BMM Architect (Winston) persona, headless mode.

### Calling Agents

Any BSO agent can trigger this workflow on-demand. Knowledge Researcher is a passive service agent -- it does not dispatch other agents.

### State Transitions

None -- Knowledge Researcher does not participate in Story lifecycle state transitions.

---

## Configuration Dependencies

| Config Key | Step | Default | Description |
|------------|------|---------|-------------|
| `knowledge_research.enabled` | 1 | true | Feature toggle |
| `knowledge_research.knowledge_base_path` | 2/7 | -- | Knowledge base root path |
| `knowledge_research.cache_ttl_days` | 2 | 30 | Cache TTL days |
| `knowledge_research.max_calls_per_story` | 5 | 3 | Per-story research budget |
| `knowledge_research.timeout_seconds` | 5 | 600 | Per-call timeout |
| `knowledge_research.cache_fuzzy_match` | 2 | true | Enable fuzzy matching |
| `knowledge_research.sources` | 5 | [context7, deepwiki, web_search] | Available research sources |
| `knowledge_research.fallback_if_mcp_unavailable` | 5 | web_search | Fallback source when MCP unavailable |
| `role_mapping.knowledge_researcher_persona` | 4 | bmad:bmm:agents:architect | Persona ID |
| `defaults.parallel` | 7/8 | 1 | Parallel write safety trigger |
| `defaults.agent_timeout_seconds.knowledge_research` | All | 600 | Overall agent timeout |
| `defaults.agent_timeout_action` | All | mark_needs_intervention | Timeout handling strategy |

---

## Design Principles Applied

| # | Principle | Application |
|---|-----------|-------------|
| 2 | Degrade over error | Persona fallback; Context7 -> DeepWiki -> WebSearch degradation chain |
| 3 | Budget controls everything | max_calls_per_story, timeout_seconds, cache hits free |
| 8 | Headless Persona Loading | BMM Architect (Winston) loaded without interactive behavior |
| 14 | BMM Integration Contract | Persona loaded via Skill call interface |
| 15 | Per-phase timeout | Each external call independently timeout-controlled |
| 16 | Knowledge capacity management | 200-entry LRU, 30-day TTL, 60-day auto-archive, version-aware invalidation |
| 23 | Parallel state write queue | index.yaml writes serialized when parallel > 1 |
| 25 | Lessons injection budget | Max 10 entries per phase injection, recency + relevance sort |

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Spec validated on 2026-02-07 -- fully aligned with workflow.md implementation_
_Source: workflow.md (F1) + knowledge-researcher agent + config.yaml + module-brief-bso.md_
