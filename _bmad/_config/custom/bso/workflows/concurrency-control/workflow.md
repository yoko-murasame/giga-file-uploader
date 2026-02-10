---
name: concurrency-control
id: U2
description: "Manage .sprint-running mutex to prevent parallel sprint execution conflicts — acquire, release, and zombie lock detection"
module: bso
agent: shared
version: 1.0.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Concurrency Control Workflow (U2)

> BSO Utility Workflow -- 管理 `.sprint-running` 互斥锁文件，防止多个 Sprint 并行执行导致状态文件冲突。支持锁获取、释放和僵尸锁检测三种操作模式。

## Purpose

确保同一时刻只有一个 Sprint 实例在运行。通过 `.sprint-running` 锁文件实现互斥控制，锁文件包含 PID、session_id、时间戳和 epic_spec 信息，用于活跃性验证和僵尸锁检测。本 workflow 是所有 Sprint 执行的前置和后置守卫。

## Primary Agent

**Shared** -- 共享 utility，无独立 Agent。作为内联函数被 Orchestrator 在 Sprint 生命周期的关键节点调用。

## Callers

| Caller | 触发场景 | 操作模式 |
|--------|---------|---------|
| auto-dev-sprint (C1) | Sprint 启动时 | `acquire` -- 获取锁 |
| auto-dev-sprint (C1) | Sprint 正常完成时 | `release` -- 释放锁 |
| auto-dev-sprint (C1) | Sprint 异常终止时 | `release` -- 释放锁（错误恢复路径） |
| health-check (U1) | 环境检查 Step 9 | `check` -- 仅检查锁状态，不获取/释放 |

---

## Input Schema

```yaml
inputs:
  required:
    mode: "acquire" | "release" | "check"    # 操作模式
    project_root: "/path/to/project"          # 项目根目录（锁文件存放位置）
  optional:
    session_id: "sprint-2026-02-07-001"       # acquire 模式必须提供
    epic_spec: "epic5"                        # acquire 模式必须提供
    force: false                              # true = 强制覆盖已有锁（包括活跃锁）
    lock_file_name: ".sprint-running"         # 锁文件名（默认 .sprint-running）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `mode` | 值为 "acquire" / "release" / "check" | abort, error: "Invalid mode" |
| `project_root` | 目录存在且可写 | abort, error: "Project root not accessible" |
| `session_id` | acquire 模式下非空 | abort, error: "session_id required for acquire mode" |
| `epic_spec` | acquire 模式下非空 | abort, error: "epic_spec required for acquire mode" |

---

## Output Schema

### Return Value

```yaml
return:
  status: "acquired" | "released" | "blocked" | "zombie-detected" | "clean" | "failure"
  mode: "acquire" | "release" | "check"
  lock_info:
    exists: true | false
    pid: 12345
    session_id: "sprint-2026-02-07-001"
    started_at: "2026-02-07T22:30:00Z"
    epic_spec: "epic5"
    age_hours: 2.5
    pid_alive: true
    is_zombie: false
  message: "Lock acquired successfully"
  errors: []
```

### Status Value Mapping

| Status | 含义 | 触发条件 |
|--------|-----|---------|
| `acquired` | 锁获取成功 | acquire 模式，锁不存在或 zombie 被覆盖 |
| `released` | 锁释放成功 | release 模式，锁文件删除成功 |
| `blocked` | 锁被占用，操作被拒绝 | acquire 模式，活跃锁存在且非 force；check 模式，活跃锁存在 |
| `zombie-detected` | 检测到僵尸锁 | check 模式，发现 zombie 锁（acquire 模式发现 zombie 时进入 Step 3 Acquire Decision，最终返回 acquired 或 blocked） |
| `clean` | 无锁文件 | check 模式，锁不存在 |
| `failure` | 操作失败 | 文件系统错误等异常 |

---

## Lock File Format

锁文件 `.sprint-running` 使用 YAML 格式，包含以下字段：

```yaml
# .sprint-running
pid: 12345                                    # 当前进程 PID
session_id: "sprint-2026-02-07-001"           # Sprint 会话唯一标识
started_at: "2026-02-07T22:30:00Z"            # 锁创建时间（ISO 8601 UTC）
epic_spec: "epic5"                            # 正在执行的 Epic 标识
lock_version: 1                               # 锁文件格式版本（向后兼容）
```

### Lock File Location

- 路径: `{project_root}/.sprint-running`
- 该文件应被 `.gitignore` 忽略（运行时临时文件）

---

## Workflow Steps

### Step 1: Lock File Detection

**Goal:** 检测 `.sprint-running` 锁文件是否存在，读取其内容。

**Actions:**
1. 构建锁文件完整路径: `{project_root}/{lock_file_name}`
2. 检查文件是否存在：
   - **不存在:** 记录 `lock_exists: false`
     - `acquire` 模式 --> 跳至 Step 4 (Lock Write)
     - `release` 模式 --> 返回 `released`（幂等释放，锁已不存在）
     - `check` 模式 --> 返回 `clean`
   - **存在:** 读取文件内容
3. 解析 YAML 内容，提取 `pid`, `session_id`, `started_at`, `epic_spec`
4. 如果 YAML 解析失败（格式损坏）：
   - 将锁文件视为 zombie（无法验证内容的锁 = 不可信锁）
   - 记录警告: "Lock file exists but has invalid format"

**On Success:** 锁状态已知，继续 Step 2
**On Failure:**
- 文件读取权限不足 --> abort, status: "failure", error: "Cannot read lock file"

---

### Step 2: Zombie Detection

**Goal:** 如果锁文件存在，判断是否为僵尸锁（Principle 13: Zombie Lock Prevention）。

**Actions:**
1. **PID 存活检查:**
   - 使用 `kill -0 {pid}` 检查进程是否存活（不发送信号，仅检测）
   - macOS/Linux: `kill -0` 返回 0 表示进程存在
   - 错误处理: 如果 `kill -0` 返回非 0（ESRCH）--> PID 不存在
   - 记录 `pid_alive: true | false`

2. **时间戳超时检查:**
   - 解析 `started_at` 为 UTC 时间
   - 计算距离当前时间的差值（小时）
   - 阈值: 24 小时
   - `age_hours > 24` --> 标记为超时
   - 记录 `age_hours: {hours}`

3. **Zombie 判定逻辑:**
   ```
   is_zombie = (pid_alive == false) OR (age_hours > 24)
   ```
   - **Case A: PID 不存在** --> 确定 zombie（进程已崩溃/被杀）
   - **Case B: PID 存在但超过 24h** --> 疑似 zombie（可能是挂起的进程）
   - **Case C: PID 存在且未超时** --> 活跃锁，非 zombie
   - **Case D: YAML 格式损坏** --> 视为 zombie（Step 1 已标记）

4. 记录 zombie 检测结果到 `lock_info`

**On Zombie Detected:**
- `acquire` 模式 --> 继续 Step 3 (Acquire Decision)
- `check` 模式 --> 返回 `zombie-detected`，包含完整 `lock_info`
- `release` 模式 --> 继续 Step 5 (Release)

**On Active Lock:**
- `acquire` 模式 --> 继续 Step 3 (Acquire Decision)
- `check` 模式 --> 返回 `blocked`，包含完整 `lock_info`
- `release` 模式 --> 继续 Step 5 (Lock Release)

---

### Step 3: Acquire Decision

**Goal:** 根据锁状态和 `force` 参数，决定是否获取锁。

**Actions:**

> **Note:** 当锁不存在时，Step 1 已直接路由至 Step 4（Lock Write），不经过本步骤。以下仅处理锁文件存在的两种场景。

1. **Zombie 锁:**
   - 如果 `force: true` --> 记录覆盖日志，进入 Step 4 覆盖写入
   - 如果 `force: false`:
     a. 生成用户确认提示消息：
        ```
        检测到僵尸锁：
        - PID: {pid} (进程状态: {alive/dead})
        - Session: {session_id}
        - 启动时间: {started_at} ({age_hours}h ago)
        - Epic: {epic_spec}

        是否覆盖此锁并启动新 Sprint? [y/N]
        ```
     b. 等待用户输入
     c. 用户确认 `y` --> 进入 Step 4 覆盖写入
     d. 用户拒绝 `n` / 超时 --> 返回 `blocked`

2. **活跃锁 (非 zombie):**
   - 如果 `force: true`:
     a. 生成强制覆盖警告：
        ```
        警告: 检测到活跃的 Sprint 进程！
        - PID: {pid} (进程状态: alive)
        - Session: {session_id}
        - 启动时间: {started_at} ({age_hours}h ago)
        强制覆盖可能导致状态文件损坏。确认覆盖? [y/N]
        ```
     b. 等待用户二次确认
     c. 确认 --> 进入 Step 4 覆盖写入
     d. 拒绝 --> 返回 `blocked`
   - 如果 `force: false`:
     - 立即返回 `blocked`
     - message: "Sprint already running (PID: {pid}, session: {session_id}, started: {started_at})"

**On Proceed:** 继续 Step 4
**On Block:** 返回 `blocked`，包含完整 `lock_info`

---

### Step 4: Lock Write

**Goal:** 写入锁文件，完成锁获取。

**Actions:**
1. 获取当前进程 PID
   - macOS/Linux: 使用 `$$` 或环境变量获取 PID
   - 对于 Claude Code 环境: 使用 shell `echo $$` 获取当前 shell PID
2. 生成锁文件内容：
   ```yaml
   pid: {current_pid}
   session_id: "{session_id}"
   started_at: "{iso8601_utc_now}"
   epic_spec: "{epic_spec}"
   lock_version: 1
   ```
3. **原子写入（Principle 11: Atomic State File Writes）:**
   a. 先写入临时文件: `{project_root}/.sprint-running.tmp`
   b. 验证临时文件内容正确（读回并解析）
   c. 原子重命名: `mv .sprint-running.tmp .sprint-running`
   d. 删除临时文件（如果 mv 失败）
4. 验证锁文件写入成功：
   - 读回 `.sprint-running` 内容
   - 确认 `pid` 和 `session_id` 与写入值匹配

**On Success:** 返回 `acquired`
```yaml
return:
  status: "acquired"
  mode: "acquire"
  lock_info:
    exists: true
    pid: {current_pid}
    session_id: "{session_id}"
    started_at: "{now}"
    epic_spec: "{epic_spec}"
    age_hours: 0
    pid_alive: true
    is_zombie: false
  message: "Lock acquired successfully for session {session_id}"
```
**On Failure:**
- 文件写入失败 --> status: "failure", error: "Failed to write lock file"
- 原子重命名失败 --> status: "failure", error: "Atomic rename failed"

---

### Step 5: Lock Release

**Goal:** 释放锁文件，清理 Sprint 执行痕迹。

**Actions:**
1. **Session 验证（安全性检查）:**
   - 如果 `session_id` 已提供：
     a. 读取当前锁文件的 `session_id`
     b. 比较是否匹配
     c. 不匹配 --> 警告: "Lock session mismatch (expected: {input}, actual: {file})"
     d. 仍然释放（防止死锁），但记录警告
   - 如果 `session_id` 未提供：
     a. 直接释放（release 模式的 session_id 是 optional 的）
2. **删除锁文件:**
   - 执行 `rm {project_root}/.sprint-running`
   - 同时清理临时文件（如有）: `rm -f {project_root}/.sprint-running.tmp`
3. **验证释放成功:**
   - 确认 `.sprint-running` 文件不再存在
4. **清理关联资源（可选）:**
   - 如果 `.sprint-session/` 目录存在，保留（供用户查阅执行报告）
   - 不删除任何用户可能需要的文件

**On Success:** 返回 `released`
```yaml
return:
  status: "released"
  mode: "release"
  lock_info:
    exists: false
  message: "Lock released successfully"
```
**On Failure:**
- 锁文件不存在（幂等）--> 返回 `released`（无需操作）
- 文件删除失败（权限问题）--> status: "failure", error: "Cannot delete lock file: permission denied"

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| 项目根目录不可写 | Input Validation | Fatal | 立即终止 | `failure` |
| 锁文件 YAML 格式损坏 | Step 1 | Warning | 视为 zombie，进入 zombie 流程 | 取决于 mode |
| PID 检查命令执行失败 | Step 2 | Warning | 假定 PID 不存在（保守策略），视为 zombie | 取决于 mode |
| 活跃锁阻止获取 | Step 3 | Expected | 返回 blocked，提供锁详情 | `blocked` |
| 用户拒绝覆盖 zombie 锁 | Step 3 | Expected | 返回 blocked | `blocked` |
| 原子写入临时文件失败 | Step 4 | Fatal | 终止，不留下不完整的锁 | `failure` |
| 原子重命名失败 | Step 4 | Fatal | 清理临时文件，终止 | `failure` |
| 锁文件写入后验证失败 | Step 4 | Fatal | 删除锁文件，终止 | `failure` |
| 锁文件删除权限不足 | Step 5 | Fatal | 报告错误，锁保留 | `failure` |
| session_id 不匹配释放 | Step 5 | Warning | 记录警告，仍然释放 | `released` (with warning) |

### Timeout Configuration

- Zombie 检测: 无超时（纯本地操作）
- 用户确认等待: 30 秒（超时视为拒绝）
- 文件写入操作: 10 秒

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项:

```yaml
# 无直接配置依赖 — 锁文件行为由 workflow 内部硬编码
# 以下为间接依赖（由调用方传入）:

# Zombie detection threshold (硬编码)
zombie_threshold_hours: 24                    # 锁文件超过此时长视为 zombie

# Lock file location (由调用方通过 project_root 传入)
# 默认: {project_root}/.sprint-running

# 关联配置:
# status_file_search_paths                    # health-check (U1) 使用，与锁文件同级
```

### Hardcoded Constants

| Constant | Value | 理由 |
|----------|-------|------|
| `ZOMBIE_THRESHOLD_HOURS` | 24 | Sprint 运行不应超过 24 小时；超时即疑似 zombie |
| `LOCK_FILE_NAME` | `.sprint-running` | Module Brief 约定的锁文件名 |
| `LOCK_VERSION` | 1 | 锁文件格式版本号，用于未来向后兼容 |
| `USER_CONFIRM_TIMEOUT_SECONDS` | 30 | 用户确认等待超时 |

---

## Workflow Sequence Diagram

### Acquire Flow

```
Orchestrator (C1)                Concurrency Control (U2)
    |                                    |
    |--- acquire(session_id, epic) ----->|
    |                                    |
    |                            Step 1: Lock File Detection
    |                              .sprint-running exists?
    |                                    |
    |                              [not exists]──────────────────┐
    |                              [exists]                      │
    |                                    |                       │
    |                            Step 2: Zombie Detection        │
    |                              PID alive? age < 24h?         │
    |                                    |                       │
    |                              [zombie]    [active]          │
    |                                 |           |              │
    |                            Step 3: Acquire Decision        │
    |                              [zombie+force]──────────────┐ │
    |                              [zombie+!force]──> confirm  │ │
    |                              [active+force]───> confirm2 │ │
    |                              [active+!force]──> blocked  │ │
    |                                                          │ │
    |                            Step 4: Lock Write  <─────────┘─┘
    |                              atomic write .sprint-running
    |                                    |
    |<--- return(acquired) -------------|
```

### Release Flow

```
Orchestrator (C1)                Concurrency Control (U2)
    |                                    |
    |--- release(session_id) ---------->|
    |                                    |
    |                            Step 1: Lock File Detection
    |                              .sprint-running exists?
    |                                    |
    |                              [not exists] --> return(released)
    |                              [exists]
    |                                    |
    |                            Step 2: Zombie Detection
    |                              PID alive? age < 24h?
    |                              (release 模式: 记录锁状态后继续)
    |                                    |
    |                            Step 5: Lock Release
    |                              validate session_id
    |                              rm .sprint-running
    |                              verify deletion
    |                                    |
    |<--- return(released) -------------|
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 4 | 单一状态写入入口 | 锁文件由 Orchestrator 统一通过 U2 管理，Agent 不直接操作锁 |
| 7 | 总有逃生通道 | `force` 参数允许覆盖任何锁（包括活跃锁，需二次确认） |
| 9 | 向后兼容性 | `lock_version` 字段预留格式演进空间 |
| 11 | 原子状态文件写入 | Step 4: 写入临时文件再原子重命名，防止写入中断导致损坏 |
| 13 | Zombie Lock 预防 | Step 2: PID + 时间戳双重验证，自动检测僵尸锁 |
| 17 | 执行可见性 | Zombie 检测结果和锁状态详情完整返回，便于诊断 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: concurrency-control.spec.md + config.yaml + module-brief-bso.md + C2 template_
