# Getting Started with BSO: Sprint Orchestrator

Welcome to BSO! This guide will help you get up and running with autonomous sprint execution.

---

## What This Module Does

BSO (Sprint Orchestrator) is an autonomous sprint development engine that orchestrates the complete Story lifecycle — from backlog to done — with zero manual intervention. It coordinates 6 specialized agents through a state machine architecture, featuring intelligent knowledge management, dual-layer quality review, optional E2E browser verification, and natural language intent parsing.

**One command to start, wake up to a completed Epic with full quality assurance.**

---

## Installation

```bash
bmad install bso
```

Follow the prompts to configure:
- Knowledge base storage path
- E2E browser verification (enable/disable)
- First Story checkpoint mode (pause/report/skip)
- Git squash strategy (per_story/per_phase/none)

### Post-Installation Verification

```bash
/bso:auto-dev-sprint --check
```

This runs a comprehensive health check covering:
- BMAD Core and BMM module presence
- Required BMM agents and workflows
- Git availability and working tree status
- Test framework executability
- MCP tools availability (Context7, DeepWiki)
- Concurrency lock status

---

## First Steps

### Scenario 1: First-Time User (Interactive Guide)

Simply run the command with no arguments:

```bash
/bso:auto-dev-sprint
```

The interactive guide will:
1. Display your current sprint status table
2. Walk you through Epic and Story selection
3. Let you choose execution mode and review settings
4. Show a dry-run preview before execution
5. Start the sprint after your confirmation

### Scenario 2: Natural Language (Daily Use)

Just tell BSO what you want in plain language:

```bash
/bso:auto-dev-sprint 把 epic5 没完成的都跑了，严格审查
```

BSO will parse your intent, confirm the parameters, and start execution.

### Scenario 3: Precise Parameters (Power User)

```bash
/bso:auto-dev-sprint epic5 --review-strictness strict --max-review-rounds 5 --e2e
```

Full control over every parameter.

---

## Common Use Cases

### Overnight Sprint Execution

```bash
# Before leaving for the night:
/bso:auto-dev-sprint epic3 --first-story-checkpoint skip
```

Wake up to find your Epic completed with full quality assurance. BSO handles:
- Story creation from backlog
- Story quality review
- TDD development
- Adversarial code review (with fix loop)
- Optional E2E browser verification
- Knowledge research on-demand
- Lessons learned capture

### Quality-Focused Execution

```bash
/bso:auto-dev-sprint epic4 --review-strictness strict --e2e --pre-research
```

Maximum quality: strict code review + E2E verification + pre-research before development.

### Quick Development Mode

```bash
/bso:auto-dev-sprint epic5 --skip-story-review --no-research
```

Minimal overhead: skip Story review and knowledge research for speed.

---

## What's Next?

- Check out the [Agents Reference](agents.md) to understand the 6 specialized agents
- Browse the [Workflows Reference](workflows.md) to see all 15 workflows
- See [Examples](examples.md) for real-world usage scenarios and troubleshooting

---

## Need Help?

If you run into issues:
1. Run `/bso:auto-dev-sprint --check` to verify your environment
2. Check `config.yaml` for configuration options
3. Review `.sprint-session/` for execution logs
4. Check `_bmad-output/knowledge-base/lessons/_lessons-learned.md` for accumulated insights
5. Consult the broader BMAD documentation
