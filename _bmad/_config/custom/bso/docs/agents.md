# Agents Reference

BSO includes 10 specialized agents + 1 orchestrator command. The first 6 agents handle Story-level execution, while 4 additional V2 agents (Sprint Slave, Scrum Master, Debugger, E2E Live) form the Master-Slave orchestration layer. All agents operate in **headless mode** — they are dispatched by the Sprint Orchestrator and do not expose interactive menus.

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

---

## Sprint Slave (V2)

**ID:** `bso:agents:sprint-slave`
**Persona:** BSO Native

**Role:**
Batch-level Story orchestration. Each Slave owns one batch (default 3 Stories), manages the Story lifecycle within that batch, and dispatches temporary Agents via Master proxy.

**When BSO Uses This Agent:**
When Master dispatches a batch for execution. One Slave per batch.

**Key Capabilities:**
- Serial Story execution within a batch
- Unified Agent Dispatch via Master (AGENT_DISPATCH_REQUEST — one-step creation with full context)
- sprint-status.yaml read/write (exclusive in serial mode)
- Batch completion reporting (SLAVE_BATCH_COMPLETE)

**State Transition:** Manages Story transitions within its batch scope

---

## Scrum Master (V2)

**ID:** `bso:agents:scrum-master`
**Persona:** BSO Native

**Role:**
Sprint-level planning and coordination. Groups Stories into batches, handles course correction, and serves as the sole authority on Story priority ordering.

**When BSO Uses This Agent:**
At Sprint startup for batch planning (BATCH_PLAN_READY), and during Sprint execution for course correction (COURSE_CORRECTION).

**Key Capabilities:**
- Epic-to-batch grouping (default 3 Stories per batch)
- Dependency-aware ordering (P29)
- Course correction re-planning
- Does NOT write sprint-status.yaml (Principle 4)

**State Transition:** None — planning agent, does not modify Story states directly

---

## Debugger (V2)

**ID:** `bso:agents:debugger`
**Persona:** BSO Native

**Role:**
Bug analysis, logging, and fix routing. Receives DEBUG_REQUEST from any agent, analyzes root cause, and returns DEBUG_RESULT with fix suggestions.

**When BSO Uses This Agent:**
On-demand when any agent encounters errors that need deeper analysis.

**Key Capabilities:**
- Stack trace and test output analysis
- Root cause identification with confidence scoring
- Fix suggestion generation
- Persistent debug journal (debug-journal.md, Principle P49)
- Journal rebuild on context full

**State Transition:** None — service agent, not a lifecycle agent

---

## E2E Live (V2)

**ID:** `bso:agents:e2e-live`
**Persona:** BSO Native

**Role:**
Real-time browser assistant providing stateless browser operation services. Handles BROWSER_REQUEST / BROWSER_RESULT message pairs.

**When BSO Uses This Agent:**
On-demand when any agent needs real-time browser interaction (navigation, screenshots, element checks).

**Key Capabilities:**
- Stateless request-response service (Principle P50)
- No cross-request browser session persistence
- Navigation, screenshot capture, element interaction
- Graceful degradation when browser MCP unavailable

**State Transition:** None — stateless service agent
