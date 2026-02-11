# BSO V2 Architecture: Master-Slave Layered Design

> Three-layer separation architecture for autonomous Sprint orchestration with pluggable resident Agent slots.

## Architecture Overview

BSO V2 evolves from a monolithic orchestrator into a three-layer architecture:

```
Layer 0: Master (Team Lead)     - Pure infrastructure: Agent factory + user interaction + message routing
Layer 1: SM + Slave             - Orchestration layer: SM plans batches, Slave executes batches
Layer 2: Temporary Agent + Resident Services  - Execution layer: Story-level work
```

## Architecture Diagram

```
+--------------------------------------------------------------+
|                       User (Shaoyoko)                         |
+----------------------------+---------------------------------+
                             |
                             v
+--------------------------------------------------------------+
|                    MASTER (Pure Factory)                       |
|  Responsibilities (only 4):                                   |
|  1. Startup parameter guidance (Epic, options, status path)   |
|  2. Create/destroy resident Agents per config.yaml slots      |
|  3. Respond to Slave AGENT_CREATE/DESTROY requests            |
|  4. AGENT_ROSTER_BROADCAST (full roster to resident Agents)   |
+--+----------+----------+----------+-------------------------+
   |          |          |          |
   v          v          v          v
+--------+ +--------+ +----------+ +----------+
|   SM   | |   KR   | | Debugger | | E2E Live |  <-- Resident Slots
+---+----+ +--------+ +----------+ +----------+
    | BATCH_PLAN_READY
    v
+--------------------------------------------------------------+
|  Slave-1 (Story 1-3)  |  Slave-2 (Story 4-6)  | ...         |
+----+-------------------+------------------------+------------+
     v
  Temporary Agents (story-creator / dev-runner / ...)
```

## Design Principles (P45-P52)

| # | Principle | Description |
|---|-----------|-------------|
| P45 | Master Zero Business Context | Master does not read sprint-status.yaml, Story files, or Epic files. Only understands Agent type names and message protocol |
| P46 | Slave Batch Isolation | Each Slave owns one batch (default 3 Stories). Serial mode grants exclusive sprint-status.yaml write access |
| P47 | Resident Slot Pluggability | Resident Agents declared via config.yaml resident_slots. Supports bso_agent / bmad_skill / custom source types |
| P48 | SM Epic Authority | SM is the sole authority on Story grouping and priority ordering |
| P49 | Debugger Log Persistence | Every debug analysis appended to debug-journal.md. Rebuild from journal on context full |
| P50 | E2E Live Stateless Service | Stateless request-response service. No cross-request browser session |
| P51 | Two-Phase Agent Creation | Temp Agent creation: Master creates empty shell + Slave injects business context |
| P52 | Sequential Slave Default | Slaves run serially by default. Parallel Slaves require STATUS_WRITE_REQUEST serialization |

## Master Step Structure (6 Steps)

| Step | Responsibility | Source |
|------|---------------|--------|
| Step 0 | Principle Recitation (Master-related only: P45/P47/P51/P52) | Simplified existing Step 0 |
| Step 1 | Startup + Lock + sprint-status path confirmation | Existing Step 1 + new interaction |
| Step 2 | Resident Slot Initialization (iterate config.yaml resident_slots) | Extended from existing Step 1.5 |
| Step 3 | SM Planning (send Epic to SM, await BATCH_PLAN_READY, show preview) | New |
| Step 4 | Slave Dispatch Loop (per-batch Slave creation + message routing loop) | New (core loop) |
| Step 5 | Cleanup + Unlock (collect reports + shutdown residents + TeamDelete) | Merged existing Step 9/10 |

## Message Flow

### Two-Phase Agent Creation (P51)

```
Slave -> Master:  AGENT_CREATE_REQUEST { agent_type: "story-creator", role_hint: "Story creator", requested_by: "slave-batch-1" }
Master:           Task() creates temp Agent, prompt = pure role activation (no Story details)
Master -> Slave:  AGENT_CREATED { agent_name: "story-creator-3-1" }
Master -> Residents: AGENT_ROSTER_BROADCAST { full roster }
Slave -> Agent:   TASK_ASSIGNMENT { story_key, story_path, resident_contacts, report_to: "slave-batch-1" }
```

## Resident Agent Slots

Configured via `config.yaml` `resident_slots` section:

| Slot | Agent | Default | Source Type | Description |
|------|-------|---------|-------------|-------------|
| sm | bso-scrum-master | enabled | bmad_skill | Sprint planning, batch grouping, course correction |
| kr | bso-knowledge-researcher | enabled | bso_agent | Technical research and knowledge cache |
| debugger | bso-debugger | enabled | bso_agent | Bug analysis, logging, fix routing |
| e2e_live | bso-e2e-live | disabled | bso_agent | Real-time browser assistant |

## Sprint-Status Write Strategy

### Serial Mode (default, recommended)
`max_concurrent_slaves: 1` -- only one Slave runs at a time, exclusive sprint-status.yaml write access. Uses existing U4 atomic-write mechanism.

### Parallel Mode (optional, Phase 5)
`max_concurrent_slaves > 1` -- multiple Slaves require STATUS_WRITE_REQUEST serialization through Master.

## Migration from V1

| V1 (Monolithic) | V2 (Layered) |
|-----------------|--------------|
| Master handles all 11 Steps | Master handles 6 Steps (factory only) |
| Master reads sprint-status.yaml | Slave reads sprint-status.yaml |
| Master dispatches temp Agents directly | Slave dispatches via Master proxy |
| No batch concept | Batches of 3 Stories each |
| KR is only resident Agent | 4 resident Agent slots (pluggable) |
| Context limit ~3 Stories | Context limit ~3 Stories per Slave (unlimited total) |
