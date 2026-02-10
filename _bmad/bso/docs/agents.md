# Agents Reference

BSO includes 6 specialized agents + 1 orchestrator command. All agents operate in **headless mode** — they are dispatched by the Sprint Orchestrator and do not expose interactive menus.

---

## 📝 Story Creator

**ID:** `bso:agents:story-creator`
**Icon:** 📝
**Persona:** BMM SM (Bob) — headless

**Role:**
Creates complete Story documents from Epic backlog entries, including AC, tasks, and subtasks.

**When BSO Uses This Agent:**
When a Story is in `backlog` state and needs to be created.

**Key Capabilities:**
- Loads BMM Scrum Master domain knowledge
- Generates Story documents with clear, testable AC
- Triggers Knowledge Researcher for uncertain technical details
- Follows the 5-step file-read protocol on startup

**State Transition:** `backlog` → `story-doc-review`

---

## 🔍 Story Reviewer

**ID:** `bso:agents:story-reviewer`
**Icon:** 🔍
**Persona:** BMM PM (John) — headless

**Role:**
Reviews Story documents for quality, completeness, and technical feasibility. Auto-verifies API/method name existence via Knowledge Researcher.

**When BSO Uses This Agent:**
When a Story is in `story-doc-review` state.

**Key Capabilities:**
- Objective checklist-based review (not subjective)
- API/method name existence verification via Knowledge Researcher
- Max review rounds enforcement (default: 3)
- Configurable fallback on max rounds (ask_user / force_pass / skip_story)

**State Transition:** `story-doc-review` → `ready-for-dev` (passed) | `story-doc-improved` (needs work)

---

## 💻 Dev Runner

**ID:** `bso:agents:dev-runner`
**Icon:** 💻
**Persona:** BMM Dev (Amelia) — headless

**Role:**
Executes TDD development (dev mode) and targeted code fixes (fix mode) with scope guard and test snapshot protection.

**When BSO Uses This Agent:**
When a Story is in `ready-for-dev` state (dev mode) or returning from code review (fix mode).

**Key Capabilities:**
- Red-green-refactor TDD cycle
- Dev Scope Guard: only modifies files within Story-declared scope
- Fix-before-snapshot: records test pass count before fix, rollbacks if regression
- Git Commit Safeguard: checks for sensitive files before commit
- On-demand Knowledge Researcher for framework/API queries

**State Transition:** `ready-for-dev` → `review`

---

## 🔬 Review Runner

**ID:** `bso:agents:review-runner`
**Icon:** 🔬
**Persona:** BMM Architect (Winston) — headless ⚡ *Different from Dev Runner for review independence!*

**Role:**
Performs adversarial code review with progressive degradation as review rounds increase.

**When BSO Uses This Agent:**
When a Story is in `review` state.

**Key Capabilities:**
- Uses Architect persona (Winston) instead of Dev (Amelia) for cognitive independence
- Objective checklist-based review
- Progressive degradation: round 3 → lower severity, round 5 → HIGH only, round 8 → force stop
- Returns specific fix instructions with file paths

**State Transition:** `review` → `done`/`e2e-verify` (passed) | triggers Dev Runner fix mode (needs-fix)

---

## 🌐 E2E Inspector (Optional)

**ID:** `bso:agents:e2e-inspector`
**Icon:** 🌐
**Persona:** BMM Dev (Amelia) — headless

**Role:**
Performs browser-level AC verification using Chrome MCP or Playwright MCP. Only activated when E2E is enabled and Story has frontend tags.

**When BSO Uses This Agent:**
When a Story is in `e2e-verify` state, E2E is enabled, and browser MCP is available.

**Key Capabilities:**
- Browser navigation with smart wait (DOM stability, not fixed timeout)
- Login flow with success verification
- Screenshot capture per AC verification point
- Graceful degradation: Chrome MCP → Playwright MCP → skip E2E

**State Transition:** `e2e-verify` → `done` (passed) | `review` (failed)

---

## 🧠 Knowledge Researcher

**ID:** `bso:agents:knowledge-researcher`
**Icon:** 🧠
**Persona:** BMM Architect (Winston) — headless

**Role:**
On-demand technical research service for all agents. Manages knowledge cache with LRU eviction and distributes lessons learned.

**When BSO Uses This Agent:**
On-demand from any agent when encountering uncertain framework/API/technology usage. Also at agent startup for lessons injection.

**Key Capabilities:**
- Cache-first research: check index.yaml before network calls
- Multi-source research chain: Context7 → DeepWiki → WebSearch
- Version-aware invalidation (framework major version changes)
- LRU eviction (max 200 entries, 60-day auto-archive)
- Lessons injection: filter by phase, max 10 entries per injection
- Budget: max 3 calls per Story, 600s timeout per call

**State Transition:** None — service agent, not a lifecycle agent
