# BSO: Sprint Orchestrator

**Autonomous Sprint Development Engine -- Three-Layer Master-Slave Architecture**

BSO coordinates 10 specialized agents through a three-layer Master-Slave architecture (Master factory + SM/Slave orchestration + Agent execution) and 9-state machine for zero-intervention sprint automation. One command to start, wake up to a completed Epic with full quality assurance. Features intelligent knowledge management, dual-layer quality review, optional E2E browser verification, natural language intent parsing, YOLO full-auto mode, batch-based Slave orchestration, pluggable resident Agent slots, and post-completion User Bug Feedback Protocol.

## Quick Start

```bash
# Environment health check
/bso:auto-dev-sprint --check

# Interactive guide (newcomers)
/bso:auto-dev-sprint

# Natural language
/bso:auto-dev-sprint 把 epic5 没完成的都跑了，严格审查

# Precise parameters
/bso:auto-dev-sprint epic5 --review-strictness strict --e2e

# YOLO full-auto mode (overnight unattended)
/bso:auto-dev-sprint epic5 --yolo
```

## Components

### Agents (10)

| Agent | Role | Default Persona |
|-------|------|----------------|
| Story Creator | Create Story documents from backlog | BMM SM (Bob) |
| Story Reviewer | Review Story quality + technical feasibility | BMM PM (John) |
| Dev Runner | TDD development + fix mode | BMM Dev (Amelia) |
| Review Runner | Adversarial code review + Bug triage mode | BMM Architect (Winston) |
| E2E Inspector | Browser-level verification (optional) | BMM Dev (Amelia) |
| Knowledge Researcher | Technical research + knowledge cache | BMM Architect (Winston) |
| Sprint Slave | Batch-level Story orchestration (V2) | BSO Native |
| Scrum Master | Sprint planning, batch grouping, course correction (V2) | BSO Native |
| Debugger | Bug analysis, logging, fix routing (V2) | BSO Native |
| E2E Live | Real-time browser assistant, stateless service (V2) | BSO Native |

### Commands (1)

**auto-dev-sprint** — 主入口命令，统一调度所有 Agent 和 Workflow

### Workflows (16)

**Core (5):** story-creation, story-review, dev-execution, code-review, slave-orchestration

**Feature (5):** knowledge-research, e2e-inspection, intent-parsing, interactive-guide, course-correction

**Utility (6):** health-check, concurrency-control, precise-git-commit, status-validation, lessons-recording, lessons-injection

### State Machine (9 States)

```
backlog → story-doc-review → ready-for-dev → review ──→ e2e-verify → done
               ↕                              ↕  ↑            │        ↕
        story-doc-improved                [fix loop]      [e2e-fail]  [user-bug]
                                               ↓                        ↓
                                        needs-intervention          needs-fix
```

| State | Description |
|-------|-------------|
| backlog | Story not yet created |
| story-doc-review | Story document under review |
| story-doc-improved | Story revised, awaiting re-review |
| ready-for-dev | Story approved, ready for development |
| review | Code under review |
| e2e-verify | Browser verification (optional) |
| done | Story completed (can revert via user-bug) |
| needs-fix | User reported bug, awaiting fix (User Bug Feedback Protocol) |
| needs-intervention | Requires human intervention (terminal state) |

## Configuration

See `config.yaml` for all configurable options including:

- Role mapping (which BMM persona for each phase)
- Workflow mapping (which BMM workflow for each phase)
- Timeout settings (per-phase, 15-30 min)
- Review degradation (progressive severity lowering)
- Token budget awareness (pause at 70% threshold)
- Knowledge cache management (LRU, version-aware, 200 entry limit)
- Git squash strategy (per_story / per_phase / none)
- E2E inspection settings (optional)
- Dependency detection (file-overlap between Stories)

## Dependencies

- **BMAD Core** — Base platform (required)
- **BMM** >= 1.0.0 — Agents and workflows consumed via Skill calls (required)
- **Context7 MCP** — Framework documentation (recommended, degrades to WebSearch)
- **Chrome MCP / Playwright MCP** — E2E verification (optional)

## Design Principles (36)

This module is built on 36 design principles covering:
- Core architecture (state machine, orchestrator, executor slots)
- Error resilience (degrade over error, mark and continue, progressive degradation)
- Safety (atomic writes, zombie lock prevention, sensitive file safeguard)
- Quality (review independence, technical claim verification, scope guard)
- Efficiency (token budget, knowledge cache, lessons injection budget)
- Orchestration discipline (thin dispatcher, mandatory git exit gate, KR exclusive research, status git commit, agent session ID registry)

See `module-brief-bso.md` for full design principles and 8 Architecture Decision Records.

## Module Structure

```
bso/
├── module.yaml              # Module definition + install config
├── config.yaml              # User-customizable configuration
├── README.md                # This file
├── TODO.md                  # Implementation tracking
├── docs/                    # User documentation
│   ├── getting-started.md   # Quick start guide
│   ├── agents.md            # Agent reference (10 agents)
│   ├── workflows.md         # Workflow reference (16 workflows)
│   └── examples.md          # Examples, tips & troubleshooting
├── agents/                  # 10 Agent definitions + specs
├── commands/                # Main command (auto-dev-sprint) + spec
├── workflows/               # 16 Workflow directories + specs
└── _module-installer/       # Installation logic
```

## Documentation

For detailed user guides and documentation, see the **[docs/](docs/)** folder:
- [Getting Started](docs/getting-started.md) — Installation, first steps, common use cases
- [Agents Reference](docs/agents.md) — Meet the 10 specialized agents
- [Workflows Reference](docs/workflows.md) — All 16 workflows explained
- [Examples & Troubleshooting](docs/examples.md) — Real-world scenarios, tips, and fixes

## Author

Created by Shaoyoko using the BMAD Module workflow.

Module Brief: `_bmad-output/bmb-creations/modules/module-brief-bso.md`
