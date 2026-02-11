# Examples & Use Cases

This section provides practical examples for using BSO: Sprint Orchestrator.

---

## Example Workflows

### Example 1: First Sprint (Newcomer)

```bash
# Step 1: Verify environment
/bso:auto-dev-sprint --check

# Step 2: Interactive guide (no arguments)
/bso:auto-dev-sprint
# → Displays status table
# → Guides you through Epic selection
# → Shows dry-run preview
# → Starts after your confirmation
```

### Example 2: Overnight Sprint (Power User)

```bash
# Before leaving for the night:
/bso:auto-dev-sprint epic5 --first-story-checkpoint skip

# Next morning: check results
# → .sprint-session/execution-summary-2026-02-07.md
# → sprint-status.yaml shows per-Story status
# → _lessons-learned.md has new entries
```

### Example 3: Quality-First Sprint

```bash
/bso:auto-dev-sprint epic4 \
  --review-strictness strict \
  --max-review-rounds 5 \
  --e2e \
  --pre-research
```

This enables:
- HIGH fix level (strict code review)
- Max 5 review rounds (instead of default 10)
- E2E browser verification for frontend Stories
- Pre-research: batch knowledge research before development starts

### Example 4: Natural Language

```bash
# Chinese
/bso:auto-dev-sprint 把 epic3 的 story 1 到 5 跑了，跳过 story review

# English
/bso:auto-dev-sprint run all incomplete stories in epic5, strict review
```

BSO parses intent → shows parsed parameters → waits for confirmation.

### Example 5: Dry Run (Preview)

```bash
/bso:auto-dev-sprint epic5 --dry-run
```

Shows execution queue without running anything — verify scope before committing.

---

## Common Scenarios

### Scenario: Knowledge Cache Hit

1. Story A needed vue-easytable virtual scrolling docs → Knowledge Researcher researched and cached
2. Two weeks later, Story B needs the same info
3. Knowledge Researcher checks cache → hit! (12 days old, same version)
4. Zero network delay — instant response
5. Lessons learned also warns about known pitfalls

### Scenario: Review Fix Loop

1. Dev Runner completes Story implementation
2. Review Runner (Winston) finds 2 HIGH + 3 MEDIUM issues
3. Dev Runner fixes in fix mode (test snapshot taken first)
4. Review Runner round 2: 1 MEDIUM remaining
5. Round 3: progressive degradation kicks in, strictness lowered
6. Round 3 passes — Story moves to done

---

## Tips & Tricks

### Tip 1: Use --check Before First Run

Always run `--check` before your first sprint to catch configuration issues early.

### Tip 2: Start with `first_story_checkpoint: pause`

For new projects, keep the default `pause` mode. After the first Story is verified, switch to `skip` for overnight runs.

### Tip 3: Monitor Knowledge Base Growth

Check `_bmad-output/knowledge-base/index.yaml` periodically. When entries approach 200, older entries auto-archive. Manual cleanup is optional but can improve cache hit accuracy.

### Tip 4: Review Lessons Learned

`_lessons-learned.md` accumulates real insights from your project. Review it periodically — these are patterns specific to YOUR codebase.

### Tip 5: Git Squash Strategy

- Development phase: use `none` to keep full history for debugging
- After stabilization: switch to `per_story` for clean git log
- CI/CD: `per_story` is recommended for clean merge history

---

## Troubleshooting

### Common Issues

#### "Sprint already running"

```
Error: Sprint already running (PID: 12345, started: 2026-02-07T22:30:00Z)
```

**Cause:** `.sprint-running` lock file exists from a previous session.

**Fix:** BSO detects zombie locks automatically. If the PID is dead or timestamp is > 24h old, it offers to override. Otherwise, check if another sprint is genuinely running.

#### "BMM Module not found"

```
Error: BMM Module not found at _bmad/bmm/
```

**Fix:** Install BMM first: `bmad install bmm`

#### Review Loop Exceeded Max Rounds

**Cause:** Story has structural issues that fixing can't resolve.

**What BSO Does:** Marks Story as `needs-intervention` and continues to next Story. The issue is captured in `_lessons-learned.md`.

**Fix:** Manually review the Story document, refine AC, and re-run.

#### Token Budget Exceeded

**Cause:** Sprint consumed too many tokens (> 70% of session limit).

**What BSO Does:** Pauses sprint, generates progress report, saves state.

**Fix:** Start a new Sprint session with the same command — BSO reads sprint-status.yaml and picks up incomplete Stories from their current state.

#### Knowledge Cache Stale

**Cause:** Framework version in project changed but cache still has old version docs.

**Fix:** Run `--check` to detect version mismatches. BSO marks stale entries automatically on next cache miss.

---

## Getting More Help

- Review `config.yaml` for all configuration options
- Check `module-brief-bso.md` for 30 design principles and 7 ADRs
- Inspect `.sprint-session/` for execution logs and reports
- Consult the broader BMAD documentation
