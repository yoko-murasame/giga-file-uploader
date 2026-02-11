# BSO Message Protocol V2

> Complete reference for all message types in the Master-Slave architecture.

All messages are transmitted via `SendMessage(type="message", content="MSG_TYPE: {json}", summary="...")`.

## New Message Types

| Message Type | Direction | Description |
|---|---|---|
| AGENT_CREATE_REQUEST | Slave -> Master | Request temp Agent creation (no business context, only agent_type + role_hint) |
| AGENT_CREATED | Master -> Slave | Temp Agent created (contains agent_name) |
| AGENT_DESTROY_REQUEST | Slave -> Master | Request temp Agent destruction |
| AGENT_DESTROYED | Master -> Slave | Temp Agent destroyed |
| AGENT_ROSTER_BROADCAST | Master -> All Residents | Full Agent roster (residents + slaves + temps) |
| TASK_ASSIGNMENT | Slave -> Temp Agent | Inject full business context (story_path + resident_contacts + report_to) |
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
| AGENT_COMPLETE | recipient changed from Master to Slave (determined by report_to field in TASK_ASSIGNMENT) |
| RESEARCH_REQUEST / RESEARCH_RESULT | Unchanged |

## Message Format Reference

### AGENT_CREATE_REQUEST
```json
{
  "msg_type": "AGENT_CREATE_REQUEST",
  "agent_type": "story-creator",
  "role_hint": "Story creator",
  "requested_by": "slave-batch-1"
}
```

### AGENT_CREATED
```json
{
  "msg_type": "AGENT_CREATED",
  "agent_name": "story-creator-3-1",
  "agent_type": "story-creator"
}
```

### TASK_ASSIGNMENT
```json
{
  "msg_type": "TASK_ASSIGNMENT",
  "story_key": "3-1",
  "story_path": "path/to/story-3-1.md",
  "mode": "create",
  "session_id": "sprint-xxx",
  "report_to": "slave-batch-1",
  "resident_contacts": {
    "knowledge-researcher": "knowledge-researcher",
    "debugger": "debugger",
    "e2e-live": "e2e-live"
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
    "temps": ["story-creator-3-1"]
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

## Two-Phase Agent Creation Sequence

```
1. Slave -> Master:  AGENT_CREATE_REQUEST { agent_type, role_hint, requested_by }
2. Master:           Task() create temp Agent (pure role activation prompt, no Story details)
3. Master -> Slave:  AGENT_CREATED { agent_name }
4. Master -> Residents: AGENT_ROSTER_BROADCAST { full roster }
5. Slave -> Agent:   TASK_ASSIGNMENT { story_key, story_path, resident_contacts, report_to }
6. Agent executes...
7. Agent -> Slave:   AGENT_COMPLETE { status, results }
8. Slave -> Master:  AGENT_DESTROY_REQUEST { agent_name }
9. Master:           shutdown_request to Agent
10. Master -> Slave: AGENT_DESTROYED { agent_name }
11. Master -> Residents: AGENT_ROSTER_BROADCAST { updated roster }
```

## AGENT_ROSTER_BROADCAST Design Decisions

- Full roster (not incremental) -- fault tolerant, missing one message is recoverable
- Only sent to resident Agents (SM, KR, Debugger, E2E Live), not to Slaves or temps
- Temp Agents receive "contact info" via TASK_ASSIGNMENT resident_contacts field
- Slaves know what they created, don't need broadcast
