---
name: status-validation
id: U4
description: "Forced state validation before every agent dispatch, Epic-Status consistency check on startup, and atomic state file writes"
module: bso
agent: shared
type: utility
version: 1.1.0
created: 2026-02-07
updated: 2026-02-07
status: validated
---

# Status Validation Workflow (U4)

> BSO Utility Workflow -- 在每次 Agent 调度前验证 Story 状态是否匹配目标阶段，Sprint 启动时执行 Epic 定义与 sprint-status.yaml 一致性检查，并提供原子化状态文件写入能力。由 Orchestrator 调用，所有 Agent 共享。

## Purpose

确保 Sprint 执行过程中状态的绝对一致性。本 workflow 承担三项核心职责：

1. **Pre-Dispatch Validation（每次 Agent 调度前）:** 读取 sprint-status.yaml，验证目标 Story 处于当前阶段所期望的状态，阻止状态不匹配的 Agent 调度。
2. **Startup Consistency Check（Sprint 启动时，Principle 24）:** 比对 Epic 定义文件中的 Story 列表与 sprint-status.yaml 中的条目，检测遗漏、孤儿条目和名称不匹配。
3. **Atomic State Write（所有状态变更，Principle 11）:** 通过临时文件写入 + rename 的原子操作更新 sprint-status.yaml，防止文件损坏。

## Primary Agent

**Shared** -- 本 workflow 不绑定特定 Agent，由 Orchestrator 在以下场景内联调用：
- 每次 Agent dispatch 前（Pre-Dispatch Validation）
- Sprint 启动初始化阶段（Startup Consistency Check）
- 每次状态转换写入时（Atomic State Write）

## Callers

| Caller | 触发场景 | 使用模式 |
|--------|---------|---------|
| Sprint Orchestrator | 每次 Agent dispatch 前 | `pre-dispatch` |
| Sprint Orchestrator | Sprint 启动初始化 | `startup-check` |
| Sprint Orchestrator | Agent 返回后状态转换 | `atomic-write` |

---

## Input Schema

```yaml
inputs:
  required:
    mode: "pre-dispatch"                      # pre-dispatch | startup-check | atomic-write
    session_id: "sprint-2026-02-07-001"       # Sprint 会话跟踪 ID
  conditional:
    # pre-dispatch / atomic-write 模式必填（共用）
    story_key: "3-1"                          # 目标 Story 标识符
    # pre-dispatch 模式必填
    target_phase: "story-creation"            # 当前调度的阶段名称
    # startup-check 模式必填
    epic_file_paths:                          # Epic 定义文件路径列表
      - "path/to/epic-3.md"
      - "path/to/epic-4.md"
    # atomic-write 模式额外必填
    new_status: "story-doc-review"            # 新状态值
    previous_status: "backlog"                # 期望的前置状态（用于 CAS 校验）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `mode` | 值为 `pre-dispatch` / `startup-check` / `atomic-write` 之一 | abort, status: "failure" |
| `session_id` | 非空字符串 | abort, status: "failure" |
| `story_key` | 匹配格式 `\d+-\d+`（pre-dispatch / atomic-write 模式） | abort, status: "failure" |
| `target_phase` | 值为有效阶段名称（pre-dispatch 模式） | abort, status: "failure" |
| `epic_file_paths` | 非空数组，每个路径文件存在且可读（startup-check 模式） | abort, status: "failure" |
| `new_status` | 值为有效状态名称（atomic-write 模式） | abort, status: "failure" |
| `previous_status` | 值为有效状态名称（atomic-write 模式） | abort, status: "failure" |

---

## Output Schema

### Return Value

```yaml
# pre-dispatch 模式返回
return:
  status: "valid" | "state-mismatch" | "failure"
  mode: "pre-dispatch"
  session_id: "sprint-2026-02-07-001"
  results:
    story_key: "3-1"
    target_phase: "story-creation"
    current_status: "backlog"
    expected_statuses: ["backlog", "story-doc-improved"]
    match: true
    orphan_detected: false
    orphan_details: null
  errors: []

---

# startup-check 模式返回
return:
  status: "consistent" | "inconsistencies-found" | "failure"
  mode: "startup-check"
  session_id: "sprint-2026-02-07-001"
  results:
    epics_checked: 2
    total_stories_in_epics: 12
    total_stories_in_status: 10
    missing_in_status:                        # Epic 中有但 status 中无
      - story_key: "3-5"
        epic: "epic-3"
        action: "added_as_backlog"
      - story_key: "4-2"
        epic: "epic-4"
        action: "added_as_backlog"
    orphaned_in_status:                       # status 中有但 Epic 中无
      - story_key: "2-3"
        current_status: "done"
        action: "warned"
    name_mismatches:                          # Story 名称不一致
      - story_key: "3-2"
        epic_name: "项目列表分页查询"
        status_name: "项目列表查询"
        action: "warned"
    orphan_states_detected:                   # 处于中间状态的 Story
      - story_key: "3-3"
        current_status: "story-doc-improved"
        message: "Story stuck in intermediate state"
    auto_corrections: 2
    warnings: 3
  errors: []

---

# atomic-write 模式返回
return:
  status: "success" | "cas-mismatch" | "write-failure" | "failure"
  mode: "atomic-write"
  session_id: "sprint-2026-02-07-001"
  results:
    story_key: "3-1"
    previous_status: "backlog"
    new_status: "story-doc-review"
    write_method: "atomic-rename"
    temp_file: ".sprint-status.yaml.tmp"
    verified: true
  errors: []
```

---

## State Phase-Status Matching Table

本表定义每个调度阶段所期望的 Story 状态。Pre-Dispatch Validation 依据此表判断状态是否匹配。

| Target Phase | Expected Story Status(es) | Description |
|-------------|--------------------------|-------------|
| `story-creation` | `backlog`, `story-doc-improved` | 新建 Story（backlog）或根据审查反馈修订（story-doc-improved） |
| `story-review` | `story-doc-review` | Story 文档等待审查 |
| `dev-execution` (dev mode) | `ready-for-dev` | Story 已通过审查，准备开发 |
| `dev-execution` (fix mode) | `review` | 代码审查结果为需要修复（注：此处指 `review` 状态，非 `needs-fix` 状态） |
| `code-review` | `review` | 代码提交后等待审查 |
| `e2e-inspection` | `e2e-verify` | 代码审查通过，等待 E2E 验证 |

### Valid State Values (9 states)

```
backlog → story-doc-review → ready-for-dev → review → e2e-verify → done
               ↕                                ↕  \                 ↕
        story-doc-improved                  [fix loop] → needs-intervention
                                                                done ↔ needs-fix
```

| State | Description | Valid Next States |
|-------|-------------|------------------|
| `backlog` | Story 未创建，待处理 | `story-doc-review` |
| `story-doc-review` | Story 文档审查中 | `ready-for-dev`, `story-doc-improved` |
| `story-doc-improved` | Story 已修订，待重新审查 | `story-doc-review` |
| `ready-for-dev` | Story 已批准，可以开发 | `review` |
| `review` | 代码审查中 | `done`, `e2e-verify`, `review` (fix loop), `needs-intervention` |
| `e2e-verify` | E2E 浏览器验证中 | `done`, `review` |
| `needs-intervention` | 需要人工干预（异常态） | -- |
| `done` | Story 完成（终态，可被 user-bug 回退） | `needs-fix` |
| `needs-fix` | 用户报告 Bug，等待修复（User Bug Feedback Protocol） | `done` |

---

## Workflow Steps

### Mode 1: Pre-Dispatch Validation

#### Step 1.1: Locate Status File

**Goal:** 按配置路径查找 sprint-status.yaml。

**Actions:**
1. 读取 `status_file_search_paths` 配置
2. 按优先级顺序依次检查文件是否存在：
   - `{output_folder}/implementation-artifacts/sprint-status.yaml`（优先）
   - `./sprint-status.yaml`（备选）
3. 使用第一个找到的文件

**On Success:** 文件路径确定，继续 Step 1.2
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "status_file_not_found"
      message: "sprint-status.yaml not found in any configured search path"
      search_paths: ["{output_folder}/implementation-artifacts/sprint-status.yaml", "./sprint-status.yaml"]
```

---

#### Step 1.2: Read and Parse Status

**Goal:** 读取并解析 sprint-status.yaml，提取目标 Story 的当前状态。

**Actions:**
1. 读取 sprint-status.yaml 文件内容
2. 解析 YAML 结构，定位 `development_status` 区块
3. 查找 `story_key` 对应的条目
4. 提取当前状态值

**On Success:** 当前状态提取成功，继续 Step 1.3
**On Failure:**
- YAML 解析错误 --> abort, status: "failure", error: "Malformed sprint-status.yaml"
- Story 条目不存在 --> abort, status: "failure", error: "Story {story_key} not found in sprint-status.yaml"

---

#### Step 1.3: State Match Verification

**Goal:** 验证 Story 当前状态是否匹配目标阶段的期望状态。

**Actions:**
1. 根据 `target_phase` 查询 State Phase-Status Matching Table
2. 获取该阶段的期望状态列表（一个阶段可能有多个合法状态）
3. 检查 Story 当前状态是否在期望列表中
4. 如果匹配 --> 验证通过
5. 如果不匹配 --> 验证失败，报告详细信息

**On Match:**
```yaml
return:
  status: "valid"
  results:
    story_key: "3-1"
    target_phase: "story-creation"
    current_status: "backlog"
    expected_statuses: ["backlog", "story-doc-improved"]
    match: true
```

**On Mismatch:**
```yaml
return:
  status: "state-mismatch"
  results:
    story_key: "3-1"
    target_phase: "dev-execution"
    current_status: "backlog"
    expected_statuses: ["ready-for-dev"]
    match: false
  errors:
    - type: "state_mismatch"
      message: "Story 3-1 is in 'backlog' state, expected 'ready-for-dev' for dev-execution phase"
      recommendation: "Check if previous phase completed successfully"
```

---

#### Step 1.4: Orphan State Detection

**Goal:** 检测处于中间状态（非终态且非期望状态）的 Story，发出警告。

**Actions:**
1. 在 Step 1.2 读取的状态数据中扫描所有 Story 条目
2. 识别处于以下中间状态的 Story：
   - `story-doc-improved` -- Story 被修订但未重新提交审查
   - `story-doc-review` -- Story 文档审查中但长时间未完成
   - `review` (needs-fix) -- 代码需要修复但未启动 fix
3. 对每个中间状态 Story 生成警告
4. 不阻断 dispatch，仅记录警告

**Output:** 在 return value 的 `orphan_detected` 和 `orphan_details` 字段中报告

**On Detection:**
```yaml
results:
  orphan_detected: true
  orphan_details:
    - story_key: "3-3"
      current_status: "story-doc-improved"
      message: "Story 3-3 stuck in intermediate state 'story-doc-improved' — may need re-review dispatch"
```

---

### Mode 2: Startup Consistency Check (Principle 24)

#### Step 2.1: Load Epic Definitions

**Goal:** 读取所有指定的 Epic 定义文件，提取 Story 列表。

**Actions:**
1. 遍历 `epic_file_paths` 列表
2. 对每个 Epic 文件：
   a. 读取文件内容
   b. 解析 Story 条目（标识符 + 名称）
   c. 构建 `{epic_id: [{story_key, story_name}]}` 映射
3. 汇总所有 Epic 中的 Story 完整列表

**On Success:** Epic Story 列表就绪，继续 Step 2.2
**On Failure:**
- 单个 Epic 文件不存在 --> 警告并跳过该 Epic，继续其余
- 所有 Epic 文件都不存在 --> abort, status: "failure"

---

#### Step 2.2: Load Status File

**Goal:** 读取 sprint-status.yaml，提取已记录的 Story 列表。

**Actions:**
1. 按 `status_file_search_paths` 查找并读取 sprint-status.yaml
2. 解析 `development_status` 区块
3. 构建 `{story_key: {name, status}}` 映射

**On Success:** Status Story 列表就绪，继续 Step 2.3
**On Failure:**
- 文件不存在 --> 创建空的 sprint-status.yaml 骨架，所有 Epic Stories 标记为 `backlog`
- YAML 解析错误 --> abort, status: "failure"

---

#### Step 2.3: Cross-Reference Comparison

**Goal:** 比对 Epic 定义与 sprint-status.yaml 的 Story 列表，检测不一致。

**Actions:**
1. **Missing in Status（Epic 有，Status 无）:**
   - 遍历 Epic Story 列表
   - 对每个不存在于 Status 中的 Story：
     a. 自动添加到 sprint-status.yaml，状态设为 `backlog`
     b. 记录为 auto_correction
2. **Orphaned in Status（Status 有，Epic 无）:**
   - 遍历 Status Story 列表
   - 对每个不存在于任何 Epic 中的 Story：
     a. 生成警告（不自动删除，避免误删）
     b. 记录到 `orphaned_in_status` 列表
3. **Name Mismatches（名称不一致）:**
   - 对 story_key 相同但名称不同的条目：
     a. 生成警告
     b. 记录到 `name_mismatches` 列表

**On Success:** 比对完成，继续 Step 2.4

---

#### Step 2.4: Orphan State Scan

**Goal:** 扫描所有 Story，识别处于中间状态且可能卡住的 Story。

**Actions:**
1. 遍历 sprint-status.yaml 中的所有 Story
2. 识别处于中间状态的 Story（参见 Step 1.4 的中间状态定义）
3. 对每个中间状态 Story 生成警告信息
4. 汇总到 `orphan_states_detected` 列表

**On Success:** 扫描完成，继续 Step 2.5

---

#### Step 2.5: Apply Auto-Corrections and Report

**Goal:** 将 Step 2.3 中的自动修正写入 sprint-status.yaml，并生成完整报告。

**Actions:**
1. 如果存在 auto_corrections（Missing in Status 的 Story）：
   a. 通过 Atomic State Write（Mode 3）写入 sprint-status.yaml
   b. 为每个新增 Story 添加 `backlog` 状态
2. 组装完整的 consistency check 报告
3. 返回给 Orchestrator

**Return:**
```yaml
return:
  status: "consistent" | "inconsistencies-found"
  results:
    epics_checked: 2
    total_stories_in_epics: 12
    total_stories_in_status: 10
    missing_in_status: [...]
    orphaned_in_status: [...]
    name_mismatches: [...]
    orphan_states_detected: [...]
    auto_corrections: 2
    warnings: 3
```

---

### Mode 3: Atomic State Write (Principle 11)

#### Step 3.1: CAS Pre-Check (Compare-And-Swap)

**Goal:** 在写入前验证目标 Story 当前状态与期望的 `previous_status` 一致，防止并发写入冲突。

**Actions:**
1. 读取 sprint-status.yaml
2. 定位 `story_key` 条目
3. 比对当前状态与 `previous_status`
4. 如果不一致 --> CAS 失败，中止写入

**On Match:** 继续 Step 3.2
**On Mismatch:**
```yaml
return:
  status: "cas-mismatch"
  errors:
    - type: "cas_violation"
      story_key: "3-1"
      expected_previous: "backlog"
      actual_current: "story-doc-review"
      message: "Concurrent state modification detected — another process may have updated this Story"
```

---

#### Step 3.2: Write to Temp File

**Goal:** 将更新后的状态写入临时文件，准备原子 rename。

**Actions:**
1. 深拷贝当前 sprint-status.yaml 内容
2. 更新 `story_key` 的状态为 `new_status`
3. 更新修改时间戳
4. 序列化为 YAML 格式
5. 写入临时文件 `.sprint-status.yaml.tmp`
6. 验证临时文件写入成功（文件存在且内容非空）

**On Success:** 临时文件就绪，继续 Step 3.3
**On Failure:**
```yaml
return:
  status: "write-failure"
  errors:
    - type: "temp_file_write_failed"
      temp_path: ".sprint-status.yaml.tmp"
      message: "Failed to write temporary status file"
```

---

#### Step 3.3: Atomic Rename

**Goal:** 通过 rename 操作原子化地替换 sprint-status.yaml。

**Actions:**
1. 执行 `rename(".sprint-status.yaml.tmp", "sprint-status.yaml")`
2. rename 在 POSIX 系统上是原子操作
3. 验证 rename 成功（目标文件内容正确）

**On Success:** 状态写入完成，继续 Step 3.4
**On Failure (First Attempt):**
- 等待 100ms
- 重试一次 rename 操作
- 如果仍然失败 --> 报告错误

**On Failure (After Retry):**
```yaml
return:
  status: "write-failure"
  errors:
    - type: "atomic_rename_failed"
      message: "Failed to atomically rename .sprint-status.yaml.tmp to sprint-status.yaml after 2 attempts"
      temp_file_preserved: true
      recovery_hint: "Manually rename .sprint-status.yaml.tmp to sprint-status.yaml"
```

---

#### Step 3.4: Post-Write Verification

**Goal:** 验证写入后的状态文件内容正确。

**Actions:**
1. 重新读取 sprint-status.yaml
2. 解析并定位 `story_key` 条目
3. 验证状态值等于 `new_status`
4. 清理临时文件（如果仍存在）

**On Success:**
```yaml
return:
  status: "success"
  results:
    story_key: "3-1"
    previous_status: "backlog"
    new_status: "story-doc-review"
    write_method: "atomic-rename"
    temp_file: ".sprint-status.yaml.tmp"
    verified: true
```

**On Verification Failure:**
```yaml
return:
  status: "write-failure"
  errors:
    - type: "post_write_verification_failed"
      expected_status: "story-doc-review"
      actual_status: "backlog"
      message: "State file content does not match expected value after atomic write"
```

---

## Error Handling Matrix

| Error Scenario | Detection Point | Severity | Action | Status Returned |
|---------------|----------------|----------|--------|----------------|
| sprint-status.yaml 文件不存在 | Step 1.1 / 2.2 | Fatal (pre-dispatch) / Recoverable (startup) | pre-dispatch: 终止; startup: 创建空骨架 | `failure` / `inconsistencies-found` |
| YAML 解析错误 | Step 1.2 / 2.2 | Fatal | 终止，报告解析错误详情 | `failure` |
| Story 条目不存在（pre-dispatch） | Step 1.2 | Fatal | 终止，Story 可能未被 Epic 定义 | `failure` |
| 状态不匹配（pre-dispatch） | Step 1.3 | Blocking | 阻断 dispatch，报告不匹配详情 | `state-mismatch` |
| 中间状态 Story 检测 | Step 1.4 / 2.4 | Warning | 记录警告，不阻断 | N/A (继续) |
| Epic 文件不存在（startup） | Step 2.1 | Warning (单个) / Fatal (全部) | 跳过单个或终止 | `failure` (全部不存在) |
| CAS 冲突（atomic-write） | Step 3.1 | Error | 中止写入，报告并发冲突 | `cas-mismatch` |
| 临时文件写入失败 | Step 3.2 | Fatal | 终止，报告磁盘/权限问题 | `write-failure` |
| Atomic rename 失败（重试后） | Step 3.3 | Fatal | 保留 tmp 文件，提供手动恢复提示 | `write-failure` |
| 写后验证失败 | Step 3.4 | Fatal | 报告数据不一致 | `write-failure` |
| 无效的 target_phase 值 | Input Validation | Fatal | 立即终止 | `failure` |
| 无效的 new_status 值 | Input Validation | Fatal | 立即终止 | `failure` |

### Timeout Configuration

- Workflow 整体超时: 由 Orchestrator 根据 `agent_timeout_action` 配置决定（本 workflow 为内联调用，共享 Orchestrator 超时）
- Atomic rename 重试等待: 100ms（Step 3.3 硬编码）
- 超时处理: Orchestrator 根据 `agent_timeout_action` 配置执行（默认 `mark_needs_intervention`）

---

## Configuration Dependencies

本 workflow 依赖 `config.yaml` 中的以下配置项：

```yaml
# Status file search paths
status_file_search_paths                     # Step 1.1 / 2.2: 状态文件查找路径列表
  - "{output_folder}/implementation-artifacts/sprint-status.yaml"
  - "./sprint-status.yaml"

# Defaults
defaults.agent_timeout_action                # 状态不匹配时 Orchestrator 的处理策略

# State machine definition (implicit)
# 状态值和转换规则编码在 State Phase-Status Matching Table 中
# 有效状态值: backlog, story-doc-review, story-doc-improved, ready-for-dev, review, e2e-verify, needs-intervention, done, needs-fix

# Parallel state write queue (when parallel > 1)
defaults.parallel                            # 当 > 1 时，atomic-write 需要排队执行 (Principle 23)
```

---

## Workflow Sequence Diagram

### Pre-Dispatch Validation Flow

```
Orchestrator                     Status Validation (U4)
    |                                    |
    |--- pre-dispatch(story_key, ------->|
    |    target_phase, session_id)       |
    |                                    |
    |                        Step 1.1: Locate Status File
    |                                    |
    |                        Step 1.2: Read & Parse Status
    |                                    |
    |                        Step 1.3: State Match Verification
    |                                    |
    |                        Step 1.4: Orphan State Detection
    |                                    |
    |<--- return(status: valid/mismatch) |
    |                                    |
    | [valid] dispatch Agent             |
    | [mismatch] skip/rollback Story     |
```

### Startup Consistency Check Flow

```
Orchestrator                     Status Validation (U4)
    |                                    |
    |--- startup-check(epic_paths, ----->|
    |    session_id)                     |
    |                                    |
    |                        Step 2.1: Load Epic Definitions
    |                                    |
    |                        Step 2.2: Load Status File
    |                                    |
    |                        Step 2.3: Cross-Reference Comparison
    |                        (Missing → add backlog / Orphan → warn)
    |                                    |
    |                        Step 2.4: Orphan State Scan
    |                                    |
    |                        Step 2.5: Apply & Report
    |                          (atomic-write for corrections)
    |                                    |
    |<--- return(status, results) -------|
    |                                    |
    | Log warnings + continue Sprint     |
```

### Atomic State Write Flow

```
Orchestrator                     Status Validation (U4)
    |                                    |
    |--- atomic-write(story_key, ------->|
    |    new_status, previous_status)    |
    |                                    |
    |                        Step 3.1: CAS Pre-Check
    |                                    |
    |                        Step 3.2: Write Temp File
    |                        (.sprint-status.yaml.tmp)
    |                                    |
    |                        Step 3.3: Atomic Rename
    |                        (tmp → sprint-status.yaml)
    |                                    |
    |                        Step 3.4: Post-Write Verification
    |                                    |
    |<--- return(status: success/fail) --|
```

---

## Design Principles Applied

| # | Principle | Application in This Workflow |
|---|-----------|------------------------------|
| 4 | 单一状态写入入口 | Mode 3 (Atomic Write): Orchestrator 通过本 workflow 作为唯一的状态写入路径，所有 Agent 不直接修改 sprint-status.yaml |
| 5 | 状态是唯一真实来源 | Mode 1 (Pre-Dispatch): 只检查 sprint-status.yaml 中的状态值，不假设 Story 来源或历史 |
| 11 | 原子化状态文件写入 | Mode 3: 通过 temp file + rename 实现 POSIX 原子写入，防止文件损坏；写后验证确保一致性 |
| 24 | Epic-Status 一致性检查 | Mode 2 (Startup Check): Sprint 启动时比对 Epic 定义与 sprint-status.yaml，自动修正缺失条目，警告孤儿条目 |
| 9 | 向后兼容性 | 状态值名称不可变，schema_version 字段支持未来迁移 |
| 12 | 孤儿状态检测 | Step 1.4 / 2.4: 扫描处于中间状态的 Story，提示可能卡住的任务 |
| 23 | 并行状态写入队列 | 当 parallel > 1 时，atomic-write 操作需要通过 Orchestrator 的序列化队列执行 |

---

_Workflow created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Validated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode_
_Source: status-validation.spec.md + config.yaml + module-brief-bso.md (Principle 4/5/11/24)_
