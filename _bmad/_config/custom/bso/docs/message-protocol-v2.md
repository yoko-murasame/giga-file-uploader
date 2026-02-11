# BSO Message Protocol V2

> Complete reference for all message types in the Master-Slave architecture.

All messages are transmitted via `SendMessage(type="message", content="MSG_TYPE: {json}", summary="...")`.

## New Message Types

| Message Type | Direction | Description |
|---|---|---|
| AGENT_DISPATCH_REQUEST | Slave -> Master | One-step temp Agent dispatch (contains full params: agent_type + story_key + mode + report_to + resident_contacts + config_overrides) |
| AGENT_ROSTER_BROADCAST | Master -> All Residents | Full Agent roster (residents only, sent once during init — NOT triggered by temp Agent changes per P54) |
| SLAVE_BATCH_COMPLETE | Slave -> Master | Batch completion report, request self-destruction |
| BATCH_PLAN_READY | SM -> Master | Batch plan completed |
| COURSE_CORRECTION | SM -> Master | CC re-plan completed |
| CC_TRIGGER | Master -> SM | User-triggered course correction |
| DEBUG_REQUEST | Any -> Debugger | Debug analysis request |
| DEBUG_RESULT | Debugger -> Requester | Debug analysis result |
| BROWSER_REQUEST | Any -> E2E Live | Browser operation request |
| BROWSER_RESULT | E2E Live -> Requester | Browser operation result |

## Modified Message Types

| Message Type | Change |
|---|---|
| AGENT_COMPLETE | recipient changed from Master to Slave (determined by report_to field in AGENT_DISPATCH_REQUEST) |
| RESEARCH_REQUEST / RESEARCH_RESULT | Unchanged |

## Message Format Reference

### AGENT_DISPATCH_REQUEST
```json
{
  "msg_type": "AGENT_DISPATCH_REQUEST",
  "agent_type": "story-creator",
  "story_key": "3-1",
  "mode": "create",
  "session_id": "sprint-xxx",
  "report_to": "slave-batch-1",
  "resident_contacts": {
    "knowledge-researcher": "knowledge-researcher",
    "debugger": "debugger"
  },
  "config_overrides": {}
}
```

### SLAVE_BATCH_COMPLETE
```json
{
  "msg_type": "SLAVE_BATCH_COMPLETE",
  "batch_id": 1,
  "session_id": "sprint-xxx",
  "stories_completed": ["3-1", "3-2"],
  "stories_failed": ["3-3"],
  "batch_report": "..."
}
```

### BATCH_PLAN_READY
```json
{
  "msg_type": "BATCH_PLAN_READY",
  "session_id": "sprint-xxx",
  "total_stories": 9,
  "batches": [
    { "batch_id": 1, "stories": ["3-1", "3-2", "3-3"] },
    { "batch_id": 2, "stories": ["4-1", "4-2", "4-3"] }
  ],
  "dependency_graph": { "4-2": { "depends_on": ["3-3"] } }
}
```

### AGENT_ROSTER_BROADCAST
```json
{
  "msg_type": "AGENT_ROSTER_BROADCAST",
  "session_id": "sprint-xxx",
  "roster": {
    "residents": ["scrum-master", "knowledge-researcher", "debugger"],
    "slaves": ["slave-batch-1"],
  }
}
```

### DEBUG_REQUEST
```json
{
  "msg_type": "DEBUG_REQUEST",
  "debug_id": "DBG-001",
  "story_key": "3-1",
  "agent_type": "dev-runner",
  "error_summary": "Test failure in ProjectServiceTest",
  "stack_trace": "...",
  "test_output": "...",
  "severity_hint": "HIGH"
}
```

### DEBUG_RESULT
```json
{
  "msg_type": "DEBUG_RESULT",
  "debug_id": "DBG-001",
  "story_key": "3-1",
  "root_cause": "Missing null check in ProjectService.create()",
  "fix_suggestion": "Add null validation for projectName parameter",
  "severity": "HIGH",
  "confidence": "high",
  "journal_entry_id": "DBG-001-2026-02-11"
}
```

### BROWSER_REQUEST
```json
{
  "msg_type": "BROWSER_REQUEST",
  "request_id": "BR-001",
  "operation": "navigate",
  "url": "http://localhost:3100/project/list",
  "selector": null,
  "input_value": null,
  "screenshot_path": ".sprint-session/screenshots/nav-project-list.png"
}
```

### BROWSER_RESULT
```json
{
  "msg_type": "BROWSER_RESULT",
  "request_id": "BR-001",
  "status": "success",
  "result_data": { "page_title": "Project List", "url": "http://localhost:3100/project/list" },
  "screenshot_path": ".sprint-session/screenshots/nav-project-list.png",
  "error": null
}
```

## Unified Agent Dispatch Sequence

```
1. Slave -> Master:  AGENT_DISPATCH_REQUEST { agent_type, story_key, mode, session_id, report_to, resident_contacts, config_overrides }
2. Master:           Task() create temp Agent with complete prompt (full business context injected)
3. Agent executes... (starts immediately, no second injection needed)
4. Agent -> Slave:   AGENT_COMPLETE { status, results } (via report_to)
5. Agent:            Process exits naturally (no explicit destroy request)
6. Master:           Receives idle notification (system automatic, lightweight)
```

## AGENT_ROSTER_BROADCAST Design Decisions

- Full roster (not incremental) -- fault tolerant, missing one message is recoverable
- Only sent ONCE during resident Agent initialization (Step 2), NOT triggered by temp Agent creation/destruction (P54)
- Only sent to resident Agents (SM, KR, Debugger, E2E Live), not to Slaves or temps
- Temp Agents receive "contact info" via prompt injection (resident_contacts field in AGENT_DISPATCH_REQUEST)
- Slaves know what they created, don't need broadcast
- This eliminates 2N messages per temp Agent lifecycle (N = number of residents)
