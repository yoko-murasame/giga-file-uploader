---
name: auto-dev-sprint-team
id: C1-TEAM
description: "BSO Sprint Master Orchestrator -- Master-Slave architecture. Master manages Agent lifecycle and message routing only; all business logic delegated to SM and Slave agents."
module: bso
agent: orchestrator
installed_path: '{project-root}/.claude/commands/bso/auto-dev-sprint-team.md'
type: command
version: 2.0.0
created: 2026-02-11
updated: 2026-02-11
status: Completed
architecture: "master-slave"
---

# BSO Auto Dev Sprint Command -- Master Orchestrator (C1-TEAM v2)

> Master 主控编排命令 -- 纯 Agent 生命周期管理器和消息路由器。不分析任何业务文件（Epic/Story/sprint-status 的依赖关系和执行排序），所有 Sprint 规划委托 SM，所有 Story 执行委托 Slave。支持无参数启动：读取 sprint-status.yaml 展示 Epic 选择菜单供用户交互选择。

## Purpose

接收用户的 Sprint 执行指令，创建常驻 Agent 团队（SM, KR, Debugger 等），将规划工作委托给 SM，将批次执行委托给 Slave，自身仅负责 Agent 创建/销毁和消息转发。

**架构特点：**
- Master 零业务上下文 (P45) -- 不分析 sprint-status.yaml 的依赖关系/执行排序；可读取用于 UI 展示（Epic 选择菜单）
- 常驻插槽声明式配置 (P47) -- resident_slots 驱动，不硬编码
- 统一 Agent 调度 (P51) -- Slave 发 AGENT_DISPATCH_REQUEST，Master 一次性创建含完整上下文的 Agent
- 串行 Slave 默认 (P52) -- max_concurrent_slaves: 1

## Command Format

```
/bso:auto-dev-sprint-team [epic-spec] [options]
```

### Options

```yaml
inputs:
  optional:
    epic_spec: ""                         # Epic identifiers (epicN / all / epicN-epicM / NL). Leave empty for interactive selection.
    --yolo: false                       # Full-auto mode, 3s auto-confirm all prompts
    --force: false                      # Override zombie lock
    --status-file <path>: ""            # Custom sprint-status.yaml path
    --team-name: ""                     # Custom Team name (default: bso-sprint-{session_id})
```

> All Story-level options (--review-strictness, --e2e, --parallel, etc.) are passed through to SM/Slave unchanged. Master does not interpret them.

---

## Workflow Steps (6 Steps)

### Step 0: Principle Recitation

```
[PRINCIPLE RECITATION -- C1-TEAM Master v2]
P45: Master Zero Business Context -- I do NOT analyze sprint-status.yaml
     for Story dependencies, file scopes, or execution ordering.
     I MAY read it for UI display (Epic listing for user selection) only.
     All business analysis is delegated to SM.
P47: Resident Slot Pluggability -- Resident Agents are declared in config.yaml resident_slots.
     I iterate config to create/destroy, never hardcode any resident Agent logic.
P51: Unified Agent Dispatch -- Slave sends AGENT_DISPATCH_REQUEST with full params.
     Master creates Agent with complete context in one step. Agent sends AGENT_DESTROY_REQUEST
     to Master after completion. Master confirms destruction via shutdown protocol.
P54: No Temp Agent Roster Broadcast -- Temp Agent creation/destruction does NOT trigger
     AGENT_ROSTER_BROADCAST. Residents get contact info via TASK_ASSIGNMENT resident_contacts.
P52: Sequential Slave Default -- max_concurrent_slaves: 1.
     Next Slave batch starts only after the previous Slave completes.
P48: SM Epic Authority -- SM is the sole authority on Story grouping
     and priority ordering. Master/Slave do NOT override SM decisions.
[RECITATION COMPLETE]
```

---

### Step 1: Startup + Lock + Sprint-Status Path + Epic Selection

**Goal:** Acquire lock, confirm sprint-status path, resolve epic_spec (interactive if not provided), display enabled resident slots.

**Actions:**

1. **Generate Session ID:**
   - Format: `sprint-{date}-{sequence}` (e.g. `sprint-2026-02-11-001`)

2. **Load BSO config.yaml:**
   - Parse `resident_slots`, `slave_config`, `startup_interaction`
   - Parse `--team-name` (default: `{team_mode.team_name_prefix}-{session_id}`)

3. **Acquire mutex lock (U2 concurrency-control, acquire mode):**
   ```yaml
   mode: "acquire"
   session_id: "{session_id}"
   epic_spec: "{epic_spec}"
   project_root: "{project_root}"
   force: "{--force}"
   ```
   - `acquired` -> continue
   - `blocked` -> report lock info, terminate
   - `zombie-detected` + `force` -> override, continue
   - `zombie-detected` + `!force` -> prompt user (YOLO: auto-override)
   - `failure` -> terminate

4. **Sprint-Status path confirmation (startup_interaction):**
   ```
   Sprint Status file path:
     -> {startup_interaction.default_status_path}
     [Y] Confirm  [P] Change path  [N] Cancel
   ```
   - YOLO mode: 3s auto-confirm with default path
   - Result: `confirmed_status_path`

5. **Epic Selection (interactive when epic_spec not provided):**

   **IF epic_spec is empty/not provided:**

   a. Read `confirmed_status_path` (sprint-status.yaml) -- lightweight read, extract `development_status` section only
   b. Parse by Epic grouping:
      - Group entries by `epic-N` prefix
      - Count Story status distribution per Epic (done / in-progress / backlog / merged-into-*)
      - Determine Epic overall status from its `epic-N:` entry value
   c. Display Epic selection menu:
      ```
      ============================================
      Sprint Status: {confirmed_status_path}
      ============================================
          Epic                            Status      Stories (done/total)
          ────────────────────────────────────────────────────────────
          [ ] Epic 0                      done        5/5
          [ ] Epic 1                      done        3/3
          [ ] Epic 2                      done        2/2
          [ ] Epic 3                      done        5/5
          [ ] Epic 4                      done        4/4
          [*] Epic 5                      in-progress 4/4  (has non-done stories)
          [*] Epic 6                      in-progress 4/4  (has non-done stories)
          [ ] Epic 7                      backlog     3/3
          [ ] Epic 8                      backlog     2/2
          ...
      ============================================
      [*] = recommended (in-progress or backlog with pending stories)

      Select Epics to develop (comma-separated numbers, 'all', or range):
      > _
      ```
   d. User selects -> construct `epic_spec` from selection (e.g., `"epic-5,epic-6"`)
   e. YOLO mode: auto-select all `[*]` recommended Epics (in-progress + backlog with pending stories), 3s auto-confirm

   **ELSE (epic_spec provided via CLI):**
   -> Use as-is, skip interactive selection

   > **P45 Boundary Note:** Master reads sprint-status.yaml here ONLY for UI display purposes
   > (listing Epic names and status counts for user selection).
   > This is "parameter guidance" (Master duty 1: initialization parameter guidance), NOT "business analysis".
   > Master does NOT interpret Story dependencies, file scopes, or execution ordering.
   > All business analysis remains delegated to SM in Step 3.

6. **Display enabled Resident Slots:**
   ```
   Enabled Resident Agent Slots:
     [x] SM (scrum-master) -- Sprint planning & course correction
     [x] KR (knowledge-researcher) -- Technical research & knowledge cache
     [x] Debugger (debugger) -- Bug analysis & log persistence
     [ ] E2E Live (e2e-live) -- Real-time browser assistant (disabled)
     [Y] Confirm  [M] Modify slots  [N] Cancel
   ```
   - Iterate `resident_slots` from config, display `enabled` status
   - YOLO mode: 3s auto-confirm

7. **Initialize session directory:**
   - Create `.sprint-session/` if not exists
   - Record startup timestamp

8. **Collect all user arguments** (epic_spec now guaranteed non-empty + all --options) as opaque pass-through params.

**On Success:** Lock acquired, paths confirmed, epic_spec resolved, continue Step 2
**On Failure:** Lock blocked -> terminate with lock info message

---

### Step 2: Resident Slot Initialization

**Goal:** Create all enabled resident Agents from config.yaml resident_slots (P47).

**Actions:**

1. **Create Team:**
   ```yaml
   TeamCreate:
     team_name: "{team_name}"
     description: "BSO Sprint {session_id}"
   ```

2. **Iterate resident_slots (config-driven, not hardcoded):**
   ```
   For each slot in config.resident_slots where enabled == true:
     Task():
       team_name: "{team_name}"
       name: "{slot.team_member_name}"
       subagent_type: "{slot.subagent_type}"
       mode: "bypassPermissions"
       run_in_background: true
       prompt: |
         You are BSO {slot.description}.
         session_id: "{session_id}"
         team_name: "{team_name}"
         slot_config: {slot.config}  # slot-specific config if present
     Wait for idle (timeout: slot.startup_timeout seconds)
   ```

3. **Send AGENT_ROSTER_BROADCAST to all created residents (one-time only):**
   ```yaml
   # After ALL residents are created, broadcast full roster ONCE.
   # This is the ONLY roster broadcast in the entire Sprint lifecycle.
   # Temp Agent creation/destruction does NOT trigger roster broadcast (P54).
   For each created_resident:
     SendMessage:
       type: "message"
       recipient: "{created_resident.team_member_name}"
       content: |
         AGENT_ROSTER_BROADCAST:
           residents: [{name, role, status} for each created resident]
           session_id: "{session_id}"
   ```

4. **Wait for SM initialization acknowledgment:**
   ```
   Wait for SM_READY_ACK from "scrum-master" (timeout: resident_slots.sm.startup_timeout seconds)
   - SM_READY_ACK received: Log: [MASTER] SM initialization confirmed, ready for planning
   - Timeout: Log: [MASTER] WARNING: SM_READY_ACK timeout, proceeding with degraded confidence (P2)
   ```

5. **Failure handling:**
   - SM creation failed -> FATAL, terminate Sprint (SM is required for planning)
   - Other resident failed -> WARNING, degrade and continue (P2)
   - Log: `[MASTER] Resident {name} created (idle)` or `[MASTER] Resident {name} FAILED, degraded`

**On Success:** All enabled residents created, roster broadcast sent, continue Step 3
**On Failure (SM):** Terminate Sprint with error message

---

### Step 3: SM Planning

**Goal:** Delegate Sprint planning to SM, receive batch plan, preview to user.

**Actions:**

1. **Send planning request to SM:**
   ```yaml
   SendMessage:
     type: "message"
     recipient: "scrum-master"
     content: |
       SM_PLANNING_REQUEST:
         epic_spec: "{epic_spec}"
         status_file_path: "{confirmed_status_path}"
         user_options: {all --options as opaque pass-through}
         session_id: "{session_id}"
   ```
   - Master forwards epic_spec (resolved from CLI or interactive selection) and status path, does NOT analyze these files for business logic (P45)

   ```
   # IMPORTANT: SM planning may take significant time (reading Epic files, analyzing dependencies,
   # building batch plan). Do NOT resend SM_PLANNING_REQUEST if no immediate response.
   # Wait patiently for BATCH_PLAN_READY. Timeout is slave_config.slave_timeout_seconds.
   ```

2. **Wait for SM response: BATCH_PLAN_READY**
   ```yaml
   # SM reads sprint-status.yaml, resolves Stories, groups batches, returns plan
   Expected response format:
     BATCH_PLAN_READY:
       batches:
         - batch_id: "batch-1"
           story_keys: ["3-1", "3-2", "3-3"]
         - batch_id: "batch-2"
           story_keys: ["4-1", "4-2", "4-3"]
       dependencies: [{from: "4-2", to: "3-3"}]
       total_stories: 9
       effective_options: {resolved options after SM interpretation}
   ```

3. **Display batch preview to user:**
   ```
   SM Batch Plan:
     Batch 1: Story 3-1, 3-2, 3-3
     Batch 2: Story 4-1, 4-2, 4-3
     Batch 3: Story 5-1, 5-2, 5-3
     Dependencies: 4-2 depends on 3-3
     Total: 9 stories in 3 batches

     [Y] Confirm  [M] Modify  [N] Cancel
   ```
   - YOLO mode: 3s auto-confirm
   - [M] Modify -> forward modification to SM, wait for revised plan

4. **On SM timeout or failure:**
   - Timeout: `slave_config.slave_timeout_seconds` -> terminate Sprint
   - SM returns error -> display error, terminate Sprint

**On Success:** Batch plan confirmed, continue Step 4

---

### Step 4: Slave Dispatch Loop (Master's Core Logic)

**Goal:** For each batch, create a Slave, route messages, handle Agent lifecycle requests.

**This is the mechanical core of Master -- pure message routing, zero business interpretation.**

```
  0. INITIALIZE TEMP AGENT REGISTRY
     active_temp_agents = []   # Track all temp Agents created in this batch

For each batch in sm_plan.batches:

  1. CREATE SLAVE
     Task():
       team_name: "{team_name}"
       name: "slave-{batch.batch_id}"
       subagent_type: "{slave_config.subagent_type}"
       mode: "bypassPermissions"
       prompt: |
         ## Slave Task Assignment (Phase 1 -- shell only)
         batch_id: "{batch.batch_id}"
         story_keys: {batch.story_keys}       # keys only, NOT Story content
         session_id: "{session_id}"
         status_file_path: "{confirmed_status_path}"
         resident_contacts:
           sm: "scrum-master"
           kr: "knowledge-researcher"
           debugger: "debugger"
           # ... all created residents
         user_options: {pass-through options}

  2. ENTER MESSAGE WAIT LOOP
     Loop until SLAVE_BATCH_COMPLETE or timeout:

     [AGENT_DISPATCH_REQUEST from Slave]
       -> Parse: { agent_type, story_key, mode, session_id, report_to, resident_contacts, config_overrides }
       -> Task() create temp Agent with complete prompt:
          - Include full business context (story_key, mode, session_id, resident_contacts, report_to, config_overrides)
          - Agent starts working immediately upon creation, no second injection needed
       -> Register agent in active_temp_agents: { name, story_key, created_at }
       -> No AGENT_ROSTER_BROADCAST (P54: temp Agent changes do not trigger roster broadcast)

     [SLAVE_BATCH_COMPLETE from Slave]
       -> Record batch result {batch_id, status, summary}
       -> Zombie cleanup: check active_temp_agents registry for any remaining temp Agents
          For each remaining agent:
            -> Send shutdown_request (timeout: agent_shutdown_timeout)
            -> Log: [MASTER] Zombie cleanup: {agent_name} destroyed
       -> shutdown_request to Slave
       -> Break loop, proceed to next batch

     [CC_TRIGGER from user]
       -> Forward to SM as CC_REQUEST
       -> Wait SM response: COURSE_CORRECTION or CC_REJECTED
       -> If COURSE_CORRECTION: pause Slave dispatch, update batch plan
       -> If CC_REJECTED: log and continue

     [COURSE_CORRECTION from SM (unsolicited)]
       -> Pause current Slave dispatch
       -> Update remaining batch plan per SM instructions
       -> Continue with updated plan

     [AGENT_DESTROY_REQUEST from Temp Agent]
       -> Parse: { agent_name, story_key, session_id }
       -> SendMessage:
            type: "shutdown_request"
            recipient: "{agent_name}"
            content: "Task complete, shutting down"
       -> Wait shutdown_response (timeout: team_mode.agent_shutdown_timeout seconds)
       -> If approved: Log: [MASTER] Temp Agent {agent_name} destroyed (confirmed)
       -> If timeout: Log: [MASTER] Temp Agent {agent_name} destroy timeout (force)
       -> Update active_temp_agents registry (remove agent)

     [Temp Agent idle notification (system automatic)]
       -> Check if Agent already destroyed via AGENT_DESTROY_REQUEST
       -> If NOT destroyed (fallback):
          Send shutdown_request, wait response (timeout: agent_shutdown_timeout)
          Log: [MASTER] Temp Agent {name} fallback-destroyed (idle notification)
       -> If already destroyed: Log: [MASTER] Temp Agent {name} idle after destroy (expected)

  3. TIMEOUT HANDLING
     If slave_config.slave_timeout_seconds exceeded:
       -> Mark batch as abnormal
       -> shutdown_request to Slave (force)
       -> Log: [MASTER] Batch {batch_id} timed out
       -> Continue to next batch
```

**Sequential constraint (P52):** With `max_concurrent_slaves: 1`, the next batch Slave is created only after the current Slave's SLAVE_BATCH_COMPLETE is received and the Slave is shutdown.

---

### Step 5: Cleanup + Unlock

**Goal:** Collect reports, shutdown all residents, delete Team, release lock.

**Actions:**

1. **Collect batch reports:**
   ```yaml
   batch_results:
     - batch_id: "batch-1"
       status: "complete"         # complete | partial | abnormal
       stories_done: 3
       stories_failed: 0
     - batch_id: "batch-2"
       status: "partial"
       stories_done: 2
       stories_failed: 1
   ```

2. **Request Sprint summary from SM:**
   ```yaml
   SendMessage:
     recipient: "scrum-master"
     content: |
       SM_SUMMARY_REQUEST:
         batch_results: {batch_results}
         session_id: "{session_id}"
   ```
   - Wait for SM response with final Sprint report
   - Timeout -> generate minimal summary from batch_results

3. **Shutdown all resident Agents (reverse order of resident_slots):**
   ```
   For each resident in reverse(created_residents):
     SendMessage:
       type: "shutdown_request"
       recipient: "{resident.team_member_name}"
       content: "Sprint complete, shutting down"
     Wait shutdown_response(approve) | timeout (slot.shutdown_timeout seconds)
     Log: [MASTER] Resident {name} shutdown: {approved|timeout}
   ```

4. **Delete Team:**
   ```yaml
   TeamDelete()
   ```

5. **Release mutex lock (U2 concurrency-control, release mode)**

6. **Cleanup temp files:**
   - Delete `.sprint-session/pending-writes.yaml`
   - Preserve: execution-summary, screenshots, debug-journal

7. **Output Sprint summary to user:**
   ```
   ==========================================
   BSO Sprint Complete
   ==========================================
   Session:    {session_id}
   Batches:    {total} ({complete} complete, {partial} partial, {abnormal} abnormal)
   Stories:    {done}/{total} done
   Duration:   {elapsed}
   Report:     .sprint-session/execution-summary-{date}.md
   ==========================================
   ```

**On Success:** Sprint complete, all resources released

---

## Message Protocol Reference

| Message | Direction | Trigger |
|---------|-----------|---------|
| `SM_PLANNING_REQUEST` | Master -> SM | Step 3: request batch plan |
| `BATCH_PLAN_READY` | SM -> Master | Step 3: plan ready for preview |
| `AGENT_ROSTER_BROADCAST` | Master -> all residents | Step 2: one-time roster after resident init (P54: NOT triggered by temp Agent changes) |
| `AGENT_DISPATCH_REQUEST` | Slave -> Master | Step 4: Slave needs temp Agent (contains full dispatch params) |
| `AGENT_DESTROY_REQUEST` | Temp Agent -> Master | Step 4: temp Agent requests self-destruction after task completion |
| `SLAVE_BATCH_COMPLETE` | Slave -> Master | Step 4: batch finished |
| `CC_TRIGGER` | User -> Master | Step 4: user requests course correction |
| `CC_REQUEST` | Master -> SM | Step 4: forward CC to SM |
| `COURSE_CORRECTION` | SM -> Master | Step 4: SM issues plan update |
| `SM_READY_ACK` | SM -> Master | Step 2: SM confirms initialization complete, ready for planning requests |
| `SM_SUMMARY_REQUEST` | Master -> SM | Step 5: request final report |
| `RESEARCH_REQUEST` | Any Agent -> KR | P2P: research needed |
| `RESEARCH_RESULT` | KR -> requester | P2P: research complete |

---

## Error Handling Matrix

| # | Error | Step | Severity | Action |
|---|-------|------|----------|--------|
| E1 | Zombie lock detected | 1 | Warning | Check PID+timestamp, --force to override |
| E2 | TeamCreate failed | 2 | Fatal | Terminate Sprint |
| E3 | SM resident creation failed | 2 | Fatal | Terminate Sprint (SM required) |
| E4 | Other resident creation failed | 2 | Warning | Degrade, continue without (P2) |
| E5 | SM planning timeout | 3 | Fatal | Terminate Sprint |
| E6 | SM returns planning error | 3 | Fatal | Display error, terminate |
| E7 | Slave timeout | 4 | Error | Mark batch abnormal, force shutdown, next batch |
| E8 | AGENT_DISPATCH_REQUEST invalid | 4 | Warning | Reply error to Slave, continue |
| E9 | Resident shutdown timeout | 5 | Warning | Force continue TeamDelete |
| E10 | TeamDelete failed | 5 | Warning | Log warning, manual cleanup needed |
| E11 | Lock release failed | 5 | Warning | Log warning, manual cleanup needed |
| E12 | sprint-status.yaml read failed (interactive mode) | 1 | Error | Display error, prompt user to provide epic_spec manually or fix path |
| E13 | Temp Agent destroy timeout | 4 | Warning | Force continue, agent may be orphaned. Zombie cleanup at batch end will catch it. |

---

## YOLO Mode (--yolo)

All user interaction points are auto-confirmed after 3 seconds:

| Interaction | Normal | YOLO |
|-------------|--------|------|
| Step 1: Zombie lock confirm | Prompt user | Auto-override |
| Step 1: Status path confirm | [Y/P/N] prompt | 3s auto-confirm default |
| Step 1: Epic selection (no epic_spec) | Interactive menu | Auto-select recommended [*] Epics, 3s confirm |
| Step 1: Resident slots confirm | [Y/M/N] prompt | 3s auto-confirm |
| Step 3: Batch plan preview | [Y/M/N] prompt | 3s auto-confirm |
| Step 4: CC_TRIGGER | User-initiated | N/A (user action) |

**Safety nets preserved (even in YOLO):**
- SM creation failure still terminates Sprint
- Slave timeout still marks batch abnormal
- Lock mechanism still enforced

---

## Design Principles

| # | Principle | Application |
|---|-----------|-------------|
| P45 | Master Zero Business Context | Master does not analyze sprint-status.yaml for Story dependencies, file scopes, or execution ordering. MAY read it for UI display (Epic listing for user selection in Step 1.5). All business analysis delegated to SM. |
| P47 | Resident Slot Pluggability | Resident Agents declared in config.yaml resident_slots. Master iterates config to create/destroy. Adding a new resident = add config entry, no Master code change. |
| P51 | Unified Agent Dispatch | Slave sends AGENT_DISPATCH_REQUEST with full params (agent_type, story_key, mode, resident_contacts, etc). Master creates Agent with complete context in one step. After task completion, Agent sends AGENT_DESTROY_REQUEST to Master for confirmed destruction. No two-phase creation round-trip; destruction is explicit and confirmed. |
| P52 | Sequential Slave Default | max_concurrent_slaves: 1. One Slave completes before next starts. Future: increase for parallel batch execution. |
| P48 | SM Epic Authority | SM is the sole authority on Story grouping and priority ordering. Master/Slave do NOT override SM decisions. |
| P2 | Degrade over abort | Non-SM resident failures degrade gracefully. Slave timeout marks abnormal, continues. |
| P13 | Zombie Lock Prevention | PID + timestamp dual verification via U2. |
| P54 | No Temp Agent Roster Broadcast | Temp Agent creation/destruction does NOT trigger AGENT_ROSTER_BROADCAST. Roster broadcast only happens once during resident initialization (Step 2). |

---

## Sequence Diagram

```
User              Master (C1-TEAM)          SM (resident)        Slave           KR/Others (resident)
 |                     |                       |                   |                  |
 |-- [epic] + opts --> |                       |                   |                  |
 |                 Step 0: Recite P45/47/51/52/54 |                |                  |
 |                 Step 1: Lock + Status Path  |                   |                  |
 |                 Step 1.5: Epic Selection    |                   |                  |
 |                   (read status, show menu)  |                   |                  |
 |<-- Epic menu ---  |                       |                   |                  |
 |-- Select Epics -> |                       |                   |                  |
 |                 Step 1.6: Resident Slots   |                   |                  |
 |                 Step 2: Create Residents     |                   |                  |
 |                     |-- Task(SM) ---------->|                   |                  |
 |                     |-- Task(KR) ------------------------------------------>       |
 |                     |-- ROSTER_BROADCAST -->|                   |        --------> |
 |                     |  (one-time only, P54) |                   |                  |
 |                     |<-- SM_READY_ACK ------|                   |                  |
 |                 Step 3: SM Planning         |                   |                  |
 |                     |-- SM_PLANNING_REQ --->|                   |                  |
 |                     |<-- BATCH_PLAN_READY --|                   |                  |
 |<-- Preview ------   |                       |                   |                  |
 |-- Confirm -->       |                       |                   |                  |
 |                 Step 4: Slave Loop          |                   |                  |
 |                     |-- Task(Slave-b1) -----------------------> |                  |
 |                     |<-- AGENT_DISPATCH_REQ |                   |                  |
 |                     |-- Task(temp,full ctx) |------------------> |  (Agent works)   |
 |                     |                       |                   |--RESEARCH_REQ--> |
 |                     |                       |                   |<-RESEARCH_RES--  |
 |                     |                       |  temp->Slave: AGENT_COMPLETE         |
 |                     |                       |  temp->Master: AGENT_DESTROY_REQUEST |
 |                     |-- shutdown temp ------>|  temp: shutdown_response approve     |
 |                     |  (temp destroyed)      |                                     |
 |                     |<-- SLAVE_BATCH_COMPLETE ------------------|                  |
 |                     |-- shutdown Slave ------|-----------------> |                  |
 |                     |   (repeat for next batch)                 |                  |
 |                 Step 5: Cleanup             |                   |                  |
 |                     |-- SM_SUMMARY_REQ ---->|                   |                  |
 |                     |<-- Summary -----------|                   |                  |
 |                     |-- shutdown residents->|                   |  <-------------- |
 |                     |-- TeamDelete          |                   |                  |
 |                     |-- Release Lock        |                   |                  |
 |<-- Sprint Report -- |                       |                   |                  |
```

---

## Configuration Dependencies

```yaml
# From config.yaml — Master uses these sections:
resident_slots.*                    # Step 2: which residents to create
slave_config.*                      # Step 4: Slave subagent_type, timeout, batch_size
startup_interaction.*               # Step 1: status path confirm, slot display
team_mode.team_name_prefix          # Step 1: Team naming
team_mode.agent_shutdown_timeout    # Step 5: shutdown timeout fallback
```

> All other config sections (defaults.*, knowledge_research.*, e2e_inspection.*, etc.) are consumed by SM and Slave, not by Master.

---

_BSO Master Orchestrator v2 -- Pure lifecycle manager and message router_
_Delegates: SM (planning + CC), Slave (Story execution), Residents (persistent services)_
