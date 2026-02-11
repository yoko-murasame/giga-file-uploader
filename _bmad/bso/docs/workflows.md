# Workflows Reference

BSO includes 16 workflows organized in 3 categories: Core (5), Feature (5), and Utility (6). The main orchestrator command (auto-dev-sprint) dispatches these workflows.

---

## Command

### 🎯 auto-dev-sprint (Orchestrator)

**ID:** `bso:commands:auto-dev-sprint`

**Purpose:** Master orchestration — intent parsing, state machine, agent dispatch, error recording, execution reporting.

**Key Steps:** Startup & Lock → Intent Parsing → Environment Check → State Loading → Queue Building → Dependency Scan → Dry-Run Preview → Execution Loop → First-Story Checkpoint → Error Handling → Git Squash → Execution Summary → Cleanup & Unlock

**Usage:**
```bash
/bso:auto-dev-sprint <epic-spec> [options]
```

---

## Core Workflows

### C2: story-creation

**Purpose:** Create Story document from Epic definition with complete AC, tasks, and subtasks.

**Agent:** Story Creator (BMM SM Bob)

**Key Steps:** Load Context → Headless Persona Load → Story Generation → Knowledge Check → Completeness Validation → File Write → Return

---

### C3: story-review

**Purpose:** Review Story quality, verify technical feasibility, and validate API/method name existence.

**Agent:** Story Reviewer (BMM PM John)

**Key Steps:** Load Context → Headless Persona Load → Checklist Review → API Verification → Decision → Feedback Generation → Return

---

### C4: dev-execution

**Purpose:** TDD development (dev mode) and targeted code fixes (fix mode) with scope guard and test snapshot protection.

**Agent:** Dev Runner (BMM Dev Amelia)

**Key Steps:** Load Context → Headless Persona Load → Scope Guard Setup → Test Snapshot (fix mode) → BMM Dev-Story Execution → Scope Verification → Test Regression Check → Git Commit → Return

---

### C5: code-review

**Purpose:** Adversarial code review with progressive degradation and strictness-based decision.

**Agent:** Review Runner (BMM Architect Winston)

**Key Steps:** Load Context → Headless Persona Load → Degradation Check → BMM Code-Review Execution → Decision → Fix Instructions → Return

---

### C5: slave-orchestration

**Purpose:** Batch-level Story lifecycle management within a Slave context. Manages Story creation, review, dev, and code-review dispatch for a batch of Stories.

**Agent:** Sprint Slave (BSO Native)

**Key Steps:** Receive Batch Assignment → Story Loop (Create → Review → Dev → Code Review → E2E) → Batch Report → SLAVE_BATCH_COMPLETE

---

## Feature Workflows

### F1: knowledge-research

**Purpose:** Multi-source technical research with intelligent caching, version-aware invalidation, and LRU capacity management.

**Agent:** Knowledge Researcher (BMM Architect Winston)

**Key Steps:** Parse Request → Cache Check → Version Check → Cache Hit Path → Research Execution → Report Generation → Cache Write → Return

---

### F2: e2e-inspection (Optional)

**Purpose:** Browser-level AC verification with screenshot evidence.

**Agent:** E2E Inspector (BMM Dev Amelia)

**Key Steps:** Availability Check → Login → AC Extraction → Page Navigation → AC Verification → Screenshot Capture → Report Generation → Return

---

### F3: intent-parsing

**Purpose:** Parse natural language user input into structured execution parameters.

**Agent:** Orchestrator (inline logic)

**Key Steps:** Input Classification → NL Parsing → Parameter Mapping → Story List Resolution → Confirmation Display → User Confirmation → Return

---

### F4: interactive-guide

**Purpose:** Guide newcomers through sprint setup when no arguments provided.

**Agent:** Orchestrator (inline logic, interactive)

**Key Steps:** Status Display → Epic Selection → Mode Selection → Review Settings → Feature Toggle → Dry-Run Preview → Confirmation

---

### F5: course-correction

**Purpose:** Navigate significant changes during Sprint execution -- analyze impact, re-plan batches, validate dependencies, and deliver correction plan to Master.

**Agent:** Scrum Master (BSO Native)

**Key Steps:** Trigger Analysis → State Assessment → Impact Analysis → Re-Planning → Dependency Re-Check (P29) → Plan Delivery (COURSE_CORRECTION)

---

## Utility Workflows

### U1: health-check

**Purpose:** Comprehensive environment verification (`--check`).

**Key Checks:** Core → BMM → Status File → Git → Test Framework → MCP Tools → E2E Environment → Version Scan → Lock Check

---

### U2: concurrency-control

**Purpose:** .sprint-running mutex management with zombie lock detection.

**Key Steps:** Lock Check → Zombie Detection → Acquire/Block → Lock Write → Release

---

### U3: precise-git-commit

**Purpose:** Safe, precise git commits with per-file staging, sensitive file protection, and squash support.

**Key Steps:** Diff Snapshot → Sensitive Scan → Per-File Stage → Commit → Post-Commit Verification → Squash Decision → Squash Execute

---

### U4: status-validation

**Purpose:** Forced state validation + Epic ↔ Status consistency check + atomic writes.

**Key Steps:** Pre-Dispatch Verify → Consistency Check → Orphan Detection → State Write → Write Failure Recovery

---

### U5: lessons-recording

**Purpose:** Capture error patterns and distill into actionable lessons.

**Key Steps:** Event Detection → Context Extraction → Distillation → Duplicate Detection → Append Write → Return

---

### U6: lessons-injection

**Purpose:** Read accumulated lessons, filter by phase, inject into agent context.

**Key Steps:** Read Lessons → Phase Filter → Sort & Budget (max 10) → Format → Return
