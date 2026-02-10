---
name: auto-dev-sprint-team
id: C1-TEAM
description: "BSO Sprint Orchestrator (Agent Team Mode) — Team-based sprint execution with persistent Knowledge Researcher, P2P agent communication, and dual-mode result delivery. Fork of C1 with TeamCreate/SendMessage architecture."
module: bso
agent: orchestrator
installed_path: '{project-root}/.claude/commands/bso/auto-dev-sprint-team.md'
version: 1.1.0
created: 2026-02-11
updated: 2026-02-11
status: draft
base: auto-dev-sprint.md (C1 v1.0.0)
---

# BSO Auto Dev Sprint Command — Agent Team Mode (C1-TEAM)

> BSO 主控编排命令 (Team 模式) -- 基于 Claude Code Agent Team 架构的自主 Sprint 执行中枢。与 C1 (Fire-and-Forget) 的核心区别：KR 全程常驻、Agent 间 P2P SendMessage 直接通信、双模结果传递 (SendMessage/TaskList)。本命令从 C1 fork 改造，原版 C1 完全不动（向后兼容红线）。

## Purpose

将用户的高层 Sprint 执行指令转化为完全自主的开发流水线。从 Epic 定义出发，自动创建 Story 文档、审查质量、TDD 开发、代码审查、修复循环、E2E 验证，直至所有 Story 达到 `done` 状态。支持无人值守的过夜执行模式。

**与 C1 的关系：**
- C1 (Fire-and-Forget): Orchestrator 通过 Skill Call 调度 Agent，KR 按需创建销毁，研究通过 Orchestrator 中继
- C1-TEAM (Agent Team): Orchestrator 通过 TeamCreate 创建团队，KR 常驻，Agent 间 SendMessage P2P 通信
- 两者共享相同的状态机、配置文件、Workflow 层；差异仅在调度和通信机制

## Primary Agent

**Orchestrator (Team Lead)** -- 本命令自身即为编排器兼 Team Lead。通过 TeamCreate 创建团队，通过 Task tool (team_name) 创建队友，通过 SendMessage 接收结果。

## Dispatched Agents (Team Members)

| Order | Agent | Team Member Name | Lifecycle | Communication |
|-------|-------|-----------------|-----------|---------------|
| * | Knowledge Researcher | `knowledge-researcher` | **常驻** (Sprint 全程) | 接收其他 Agent 的 RESEARCH_REQUEST，返回 RESEARCH_RESULT |
| 1 | Story Creator | `story-creator-{story_key}` | 临时 (task 完成后 shutdown) | 完成后 SendMessage/TaskUpdate 回报主控 |
| 2 | Story Reviewer | `story-reviewer-{story_key}` | 临时 | 同上 |
| 3 | Dev Runner | `dev-runner-{story_key}` | 临时 | 同上；可直接 SendMessage KR 请求研究 |
| 4 | Review Runner | `review-runner-{story_key}` | 临时 | 同上 |
| 5 | Dev Runner (fix) | `dev-runner-{story_key}-fix` | 临时 | 同上 |
| 6 | E2E Inspector | `e2e-inspector-{story_key}` | 临时 | 同上 |

---

## Command Format

```
/bso:auto-dev-sprint-team <epic-spec> [options]
```

### Three Startup Modes

1. Natural Language -- `"把 epic5 没完成的都跑了，严格审查"`
2. Interactive Guide -- 无参数 → 步进式引导
3. Precise Parameters -- `epic5 --review-strictness strict --parallel 2`

---

## State Machine (8 States)

```
backlog → story-doc-review → ready-for-dev → review ──→ e2e-verify → done
               ↕                              ↕  ↑            │        ↕
        story-doc-improved                [fix loop]      [e2e-fail]  [user-bug]
                                                                       ↓
                                                                   needs-fix
```

| State | Description | Valid Next States |
|-------|-------------|-------------------|
| `backlog` | Story 未创建，待处理 | `story-doc-review` |
| `story-doc-review` | Story 文档审查中 | `ready-for-dev`, `story-doc-improved` |
| `story-doc-improved` | Story 已修订，待重新审查 | `story-doc-review` |
| `ready-for-dev` | Story 已批准，可以开发 | `review` |
| `review` | 代码审查中 | `done`, `e2e-verify`, `review` (fix loop) |
| `e2e-verify` | E2E 浏览器验证中 | `done`, `review` |
| `done` | Story 完成（终态，可被 user-bug 回退） | `needs-fix` |
| `needs-fix` | 用户报告 Bug，等待修复（User Bug Feedback Protocol） | `done` |

### State-to-Agent Dispatch Table (Team Mode)

| Current State | Agent Dispatched | Team Member Name | Params | On Success | On Failure |
|--------------|-----------------|-----------------|--------|-----------|------------|
| `backlog` | Story Creator (C2) | `story-creator-{story_key}` | `mode:"create"` | → `story-doc-review` | mark `needs-intervention` |
| `story-doc-improved` | Story Creator (C2) | `story-creator-{story_key}-r` | `mode:"revise"` | → `story-doc-review` | mark `needs-intervention` |
| `story-doc-review` | Story Reviewer (C3) | `story-reviewer-{story_key}` | `review_round:N` | passed → `ready-for-dev` / needs-improve → `story-doc-improved` | mark `needs-intervention` |
| `ready-for-dev` | Dev Runner (C4) | `dev-runner-{story_key}` | `mode:"dev"` | → `review` | mark `needs-intervention` |
| `review` | Review Runner (C5) | `review-runner-{story_key}` | `review_round:N` | passed → `done`/`e2e-verify` / needs-fix → dispatch C4 fix | mark `needs-intervention` |
| `review` (fix) | Dev Runner (C4) | `dev-runner-{story_key}-fix` | `mode:"fix"` | → `review` (re-review) | mark `needs-intervention` |
| `e2e-verify` | E2E Inspector (F2) | `e2e-inspector-{story_key}` | `mode:"e2e"` | success/skipped → `done` / e2e-failure → `review` | mark `needs-intervention` |

---

## Input Schema

```yaml
inputs:
  required:
    epic_spec: "epic5"                            # Epic 标识符（epicN / all / epicN-epicM / NL）
  optional:
    --parallel <N>: 1                             # 最大并行 Story 数（默认: 1）
    --review-strictness: "normal"                  # strict / normal / lenient（默认: normal）
    --max-review-rounds: 10                       # Code Review 最大轮数（默认: 10）
    --max-story-review-rounds: 3                  # Story Review 最大轮数（默认: 3）
    --skip-story-review: false                    # 跳过 Story Review 阶段
    --e2e: false                                  # 启用 E2E 验证
    --no-research: false                          # 禁用 Knowledge Researcher
    --pre-research: false                         # 批量预研模式
    --dry-run: false                              # 预览模式
    --check: false                                # 环境健康检查
    --status-file <path>: ""                      # 自定义状态文件路径
    --auto-clear-git-track: true                   # Story 完成后自动清理 git track 文件
    --force: false                                # 强制覆盖已有锁
    --yolo: false                                 # YOLO 全自动模式
    # === C1-TEAM 新增参数 ===
    --team-name: ""                               # 自定义 Team 名称（默认: bso-sprint-{session_id}）
    --result-mode: "sendmessage"                  # 结果传递模式: sendmessage | tasklist
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `epic_spec` | 非空字符串，匹配 `epicN` / `all` / `epicN-epicM` / 自然语言文本 | abort |
| `--parallel` | 正整数 >= 1 | 默认使用 `defaults.parallel` |
| `--review-strictness` | 值为 "strict", "normal", 或 "lenient" | 默认使用 `defaults.review_strictness` |
| `--max-review-rounds` | 正整数 >= 1 | 默认使用 `defaults.max_review_rounds` |
| `--max-story-review-rounds` | 正整数 >= 1 | 默认使用 `defaults.max_story_review_rounds` |
| `--status-file` | 文件路径存在且可读（如提供） | 回退到 `status_file_search_paths` 配置 |
| `--force` | 布尔值 | 默认 false |
| `--yolo` | 布尔值 | 默认 false |
| `--team-name` | 非空字符串（如提供） | 默认 `{team_mode.team_name_prefix}-{session_id}` |
| `--result-mode` | 值为 "sendmessage" 或 "tasklist" | 默认使用 `team_mode.result_delivery_mode` |

---

### YOLO Mode (--yolo)

**当 `--yolo: true` 时，以下所有用户交互点被静默跳过：**

| 交互点 | 正常行为 | YOLO 行为 |
|--------|---------|-----------|
| Step 2 参数确认 | 展示表格 + 等待 [Y/M/N] | 强制展示表格 + 3秒后自动确认 |
| Step 8.1 首 Story 检查点 | `pause` 模式等待用户确认 | 强制降级为 `report` |
| Step 8.2 连续失败暂停 | 展示失败列表，等待 [C/S] | 静默选 C（Continue） |
| Step 7.6 Token 预算暂停 | `pause_and_report` 暂停 | 降级为 `warn_and_continue` |
| Step 1 僵尸锁确认 | 提示用户确认是否覆盖 | 自动覆盖僵尸锁 |
| Step 3 健康检查警告 | 询问是否继续 | 静默继续 |

**安全网保留（即使 YOLO 模式也不跳过）：**
- Review 渐进降级 Round 8 强制 `needs-intervention`
- 敏感文件 git commit 拦截
- Agent 超时标记 `needs-intervention`
- Story Review 流程不受 YOLO 影响

---

## Output Schema

### Output Files

```yaml
outputs:
  files:
    - "sprint-status.yaml"                        # 更新后的状态文件
    - ".sprint-session/execution-summary-{date}.md" # Sprint 执行报告
    - ".sprint-session/pending-writes.yaml"        # 并行写入队列（runtime only）
```

---

## Workflow Steps

### Step 0: Principle Recitation Checkpoint (P37)

**Goal:** 主控在执行任何操作前，必须复述核心约束原则，确保 LLM 不会在长上下文中遗忘关键规则。

**Recitation:**

```
[PRINCIPLE RECITATION — C1-TEAM Mode]
P31: Thin Dispatcher — 我是纯调度器，严禁分析业务内容
P32: Mandatory Git Exit Gate — 所有 Agent 返回前必须执行 precise-git-commit
P33: KR Exclusive Research — Agent 禁止直接调用 Context7/DeepWiki/WebSearch MCP
P40: KR Persistent Residence — KR Sprint 全程常驻，维护跨 Story 缓存上下文
P41: P2P Research Communication — Agent 间 SendMessage 直接通信，主控不中继研究
P42: Team Member Lifecycle — 除 KR 外均为临时队友，task 完成后 shutdown
P43: File Conflict Avoidance — 同 Team 内不可同时修改同一文件
P44: Team Session Non-Recoverable — Team 会话不可恢复，中断后从 sprint-status.yaml 重建
[RECITATION COMPLETE]
```

---

### Step 1: Startup & Lock

**Goal:** 获取 `.sprint-running` 互斥锁，检测僵尸锁，初始化 Sprint 会话（Principle 13: Zombie Lock Prevention）。

**Actions:**

1. **生成 Session ID:**
   - 格式: `sprint-{date}-{sequence}`
   - 示例: `sprint-2026-02-07-001`

2. **加载 BSO 配置:**
   - 读取 `config.yaml`，解析所有配置项（含 `team_mode` 配置段）
   - 解析 `status_file_search_paths`，定位 sprint-status.yaml
   - 如果 `--status-file` 指定了路径，优先使用
   - 解析 `--team-name` 参数，默认为 `{team_mode.team_name_prefix}-{session_id}`
   - 解析 `--result-mode` 参数，默认为 `{team_mode.result_delivery_mode}`

3. **获取互斥锁（U2 concurrency-control, acquire 模式）:**
   - 调用 concurrency-control workflow:
     ```yaml
     mode: "acquire"
     session_id: "{session_id}"
     epic_spec: "{epic_spec}"
     project_root: "{project_root}"
     force: "{--force}"
     ```
   - 处理返回值:
     - `acquired` → 继续 Step 1.5
     - `blocked` → 报告锁信息，终止
     - `zombie-detected` + `force` → 覆盖锁，继续 Step 1.5
     - `zombie-detected` + `!force` → 提示用户确认
     - `failure` → 终止

4. **初始化会话目录:**
   - 创建 `.sprint-session/` 目录（如不存在）
   - 创建 `.sprint-session/screenshots/` 子目录（如 E2E 启用）
   - 记录 Sprint 启动时间戳

**On Success:** 锁已获取，会话已初始化，继续 Step 1.5
**On Failure:**
```yaml
# 锁被拒绝
message: "Sprint already running (PID: {pid}, session: {session_id}, started: {started_at})"
action: "Use --force to override, or wait for the running sprint to complete"
```

---

### Step 1.5: Team Creation (C1-TEAM 新增)

**Goal:** 创建 Agent Team，启动 KR 常驻队友（Principle 40, 42）。

**Actions:**

1. **创建 Team:**
   ```yaml
   TeamCreate:
     team_name: "{team_name}"   # bso-sprint-{session_id} 或 --team-name 覆盖
     description: "BSO Sprint {session_id} — {epic_spec}"
   ```

2. **创建 KR 常驻队友:**
   ```yaml
   Task:
     team_name: "{team_name}"
     name: "knowledge-researcher"
     subagent_type: "bso-knowledge-researcher"
     mode: "bypassPermissions"
     run_in_background: true
     prompt: |
       你是 BSO Knowledge Researcher，以 Team 常驻模式运行。

       ## Team 常驻协议 (P40)
       - 启动后不退出，进入 idle 等待
       - 监听 SendMessage，收到 RESEARCH_REQUEST 时执行研究
       - 研究完成后通过 SendMessage 将 RESEARCH_RESULT 发回请求者
       - 跨 Story 维护知识缓存上下文

       ## 消息协议
       接收: RESEARCH_REQUEST: {"story_key":"X-Y","requesting_agent":"dev-runner-X-Y","queries":[...]}
       返回: RESEARCH_RESULT: {"story_key":"X-Y","results":[{"query":"...","status":"success","report_path":"...","confidence":"high","summary":"..."}]}

       ## Shutdown 协议
       收到 shutdown_request 时：完成当前研究 → 确保 index.yaml 写入 → approve shutdown

       ## Sprint 配置
       session_id: "{session_id}"
       knowledge_base_path: "{knowledge_base_path}"
       cache_ttl_days: {cache_ttl_days}
       max_calls_per_story: {max_calls_per_story}
   ```

3. **等待 KR 就绪:**
   - 等待 KR 进入 idle 状态（表示初始化完成）
   - 超时: `{team_mode.kr_startup_timeout}` 秒（默认 30s）
   - 超时处理: 记录警告，继续执行（KR 可能稍后就绪）

4. **日志:**
   ```
   [TEAM] Team "{team_name}" created
   [TEAM] Knowledge Researcher created (idle = ready)
   ```

**On Success:** Team 已创建，KR 已常驻，继续 Step 2
**On Failure:**
```yaml
# TeamCreate 失败
message: "Failed to create Agent Team: {error}"
action: "Check Claude Code Team support availability"

# KR 创建失败
message: "Knowledge Researcher failed to start: {error}"
action: "Sprint will continue without persistent KR (degraded mode)"
```

---

### Step 2: Intent Parsing

**Goal:** 解析用户输入为结构化执行参数，支持三种输入路径。

**Actions:**

1. **分类用户输入（F3 intent-parsing workflow）:**

   | 输入特征 | 分类 | 处理路径 |
   |---------|------|---------|
   | 空字符串 / `--interactive` | Interactive Trigger | → 转发 F4 interactive-guide |
   | 包含 `--` CLI 标志 / YAML / JSON | Precise Parameters | → 直接解析 |
   | 纯 `epicN` 格式 | Precise Parameters | → 直接解析 |
   | 其他自由文本 | Natural Language | → F3 NL 解析 |

2. **NL 解析路径（路径 C）:**
   - 调用 F3 intent-parsing workflow 进行 LLM 推理
   - 提取: epic_spec, filter, review_strictness, 各种 options
   - 支持中文、英文、中英混合输入
   - **NL 解析保护规则：**
     - "快速"、"全自动" → 映射到 `--yolo`，**不映射到 `--skip-story-review`**
     - "跳过审查"、"skip review" → 映射到 `--skip-story-review`
     - 两者独立正交

3. **Story 列表解析:**
   - 根据 epic_spec + filter 从 sprint-status.yaml 解析具体 Story 列表

4. **参数展示（强制执行，含 YOLO）:**
   ```
   ==========================================
   BSO Sprint 执行参数核对 (TEAM MODE)
   ==========================================
   Epic:           epic5
   Filter:         incomplete
   Strictness:     strict
   Story Queue:    4 stories
   Story Review:   enabled
   E2E:            disabled
   Parallel:       1
   YOLO Mode:      ON / OFF
   Team Name:      bso-sprint-sprint-2026-02-07-001
   Result Mode:    sendmessage
   ==========================================
   ```

5. **参数确认（区分 YOLO 模式）:**
   - `--yolo: true` → 3 秒后自动确认
   - `--yolo: false` → [Y] 确认 [M] 修改 [N] 取消

6. **默认值填充**

**On Success:** 结构化参数 + Story 列表就绪，继续 Step 3

---

### Step 3: Environment & State

与 C1 完全一致。运行健康检查，加载 sprint-status.yaml，执行 Epic ↔ Status 一致性检查。

**Actions:**

1. **环境健康检查（如 `--check` 标志启用）:**
   - 调用 U1 health-check workflow
   - `--check` 模式直接报告后终止

2. **加载 sprint-status.yaml（U4 status-validation, startup-check 模式）:**
   - 调用 U4 status-validation workflow

3. **验证 Story 队列有效性**

**On Success:** 环境就绪，继续 Step 4

---

### Step 4: Queue Building

与 C1 完全一致。构建 Story 执行队列，排序，检测文件重叠依赖。

---

### Step 5: Dry-Run Preview

与 C1 完全一致。如果 `--dry-run` 启用，展示计划后退出。

**额外展示项（Team 模式）:**
```
Team Mode:      Agent Team (C1-TEAM)
Result Mode:    sendmessage
KR Status:      persistent (idle)
```

---

### Step 6: Pre-Research (Conditional)

与 C1 基本一致，但 KR 已常驻，无需每次新建。

**C1-TEAM 差异：** Pre-Research 直接通过 SendMessage 请求常驻 KR，无需 Skill Call 新建 KR 实例。

---

### Step 7: Execution Loop

**Goal:** 核心循环 -- 遍历 Story 队列，按当前状态调度对应 Agent，等待返回，更新状态，检查预算。

**CRITICAL: Thin Dispatcher Constraint (Principle 31)**

Orchestrator 是**纯调度器**，严禁参与业务分析。每次 Agent dispatch 时，Orchestrator 仅执行以下机械动作：

1. **读状态** → 从 sprint-status.yaml 获取 Story 当前状态
2. **查映射表** → 状态 → Agent 映射（State-to-Agent Dispatch Table）
3. **构造参数** → story_key, mode, session_id, config_overrides, team 通信协议
4. **dispatch** → Task tool (team_name + name) 创建 team member
5. **等待结果** → 等待 SendMessage (AGENT_COMPLETE) 或 TaskList (completed)
6. **更新状态** → 通过 U4 atomic-write 写入新状态
7. **shutdown 临时队友** → SendMessage(shutdown_request)
8. **输出进度** → 一行进度日志

**严禁行为（与 C1 相同）：**
- 读取 Story .md 文件内容
- 分析 Epic 定义的业务需求
- 评估代码变更的技术细节
- 解读 review findings 的具体内容

**Actions:**

对队列中的**每个 Story** 执行以下循环:

#### 7.1 Pre-Dispatch Validation

与 C1 完全一致。调用 U4 status-validation (pre-dispatch 模式)。

#### 7.2 Dependency Check (Parallel Mode)

与 C1 完全一致。

#### 7.3 Agent Dispatch (Team Mode — 重写)

**C1-TEAM 核心差异：** 不再使用 Skill Call，改为 Task tool 创建 Team Member。

##### 派发模板

```yaml
Task:
  team_name: "{team_name}"
  name: "{agent_name}"
  subagent_type: "bso-{agent_type}"
  mode: "bypassPermissions"   # YOLO 模式下
  prompt: |
    [Agent 定义内容]

    ## Team 通信协议 (P41)

    ### 研究请求（替代 needs-research 中继）
    当需要技术研究时，直接通过 SendMessage 与 KR 通信：
    SendMessage(type="message", recipient="knowledge-researcher",
      content="RESEARCH_REQUEST: {json}", summary="Research: {topic}")
    等待 KR 回复 RESEARCH_RESULT 消息后继续执行。
    禁止直接调用 Context7/DeepWiki/WebSearch MCP 工具（P33）。

    ### 完成报告
    {根据 result_delivery_mode 选择}

    #### SendMessage 模式 (result_delivery_mode=sendmessage):
    SendMessage(type="message", recipient="{lead_name}",
      content="AGENT_COMPLETE: {return_value_json}",
      summary="{agent_type} {story_key} {status}")

    #### TaskList 模式 (result_delivery_mode=tasklist):
    TaskUpdate(taskId="{assigned_task_id}", status="completed",
      metadata={"return_value": {return_value_json}})

    ## 任务参数
    story_key: "{story_key}"
    mode: "{mode}"
    session_id: "{session_id}"
    config_overrides: {config_overrides}
```

##### 状态 → Agent 映射

**backlog / story-doc-improved → Story Creator (C2):**
```yaml
Task:
  team_name: "{team_name}"
  name: "story-creator-{story_key}"       # backlog: story-creator-3-1
  # OR: "story-creator-{story_key}-r"     # story-doc-improved: story-creator-3-1-r
  subagent_type: "bso-story-creator"
  mode: "bypassPermissions"
  prompt: |
    [Story Creator Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    mode: "create" | "revise"
    session_id: "{session_id}"
    epic_file_path: "{epic_file_path}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"
```

**P36 Team 适配（revise 模式）：** Team 模式不支持 Task resume（Team member 无法恢复）。改为在 prompt 的 description 中注入上次会话的关键上下文：
- 上次创建的 Story 文件路径
- 上次 Reviewer 的改进建议摘要
- 关键设计决策

**story-doc-review → Story Reviewer (C3):**
```yaml
Task:
  team_name: "{team_name}"
  name: "story-reviewer-{story_key}"
  subagent_type: "bso-story-reviewer"
  mode: "bypassPermissions"
  prompt: |
    [Story Reviewer Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    session_id: "{session_id}"
    story_file_path: "{story_file_path}"
    review_round: "{story_review_round}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"
```

- Story Review 跳过判定与 C1 完全一致（与 --yolo 正交）

**ready-for-dev → Dev Runner (C4, dev mode):**
```yaml
Task:
  team_name: "{team_name}"
  name: "dev-runner-{story_key}"
  subagent_type: "bso-dev-runner"
  mode: "bypassPermissions"
  prompt: |
    [Dev Runner Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    mode: "dev"
    session_id: "{session_id}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"
```

**review → Review Runner (C5):**
```yaml
Task:
  team_name: "{team_name}"
  name: "review-runner-{story_key}"
  subagent_type: "bso-review-runner"
  mode: "bypassPermissions"
  prompt: |
    [Review Runner Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    session_id: "{session_id}"
    review_round: "{code_review_round}"
    config_overrides:
      review_strictness_threshold: "{effective_review_strictness_threshold}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"
```

**review (needs-fix) → Dev Runner (C4, fix mode):**
```yaml
Task:
  team_name: "{team_name}"
  name: "dev-runner-{story_key}-fix"
  subagent_type: "bso-dev-runner"
  mode: "bypassPermissions"
  prompt: |
    [Dev Runner Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    mode: "fix"
    session_id: "{session_id}"
    config_overrides:
      review_strictness_threshold: "{effective_review_strictness_threshold}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"

    ## P36 上下文注入（替代 resume）
    上次开发的文件列表: {previous_dev_files}
    上次测试结果摘要: {previous_test_summary}
    Review 发现的问题: {review_findings_summary}
```

**e2e-verify → E2E Inspector (F2):**
```yaml
Task:
  team_name: "{team_name}"
  name: "e2e-inspector-{story_key}"
  subagent_type: "bso-e2e-inspector"
  mode: "bypassPermissions"
  prompt: |
    [E2E Inspector Agent 定义 + Team P2P 协议]
    story_key: "{story_key}"
    mode: "e2e"
    session_id: "{session_id}"
    result_delivery_mode: "{result_mode}"
    lead_name: "{lead_name}"
```

#### 7.4 Await Return (Team Mode — 重写, 双模)

**C1-TEAM 核心差异：** 不再等待 Skill Call 返回值，改为等待 SendMessage 或 TaskList 状态变化。**没有 needs-research 状态**（Agent 自行通过 P2P 解决研究需求）。

##### SendMessage 模式 (result_delivery_mode=sendmessage):

1. 等待收到 Agent 的 `AGENT_COMPLETE` 消息（自动递送到 Team Lead）
2. 解析消息内容中的 `return_value_json` → 提取 `status` 字段
3. 处理状态转换（Agent Return 表，见下方）
4. 发送 `shutdown_request` 给临时 Agent → 等待 `shutdown_response(approve)` | 超时继续

##### TaskList 模式 (result_delivery_mode=tasklist):

1. 派发前通过 `TaskCreate` 创建该 Agent 的任务（包含 story_key + agent_type）
2. 定期检查 `TaskList`，等待对应任务状态变为 `completed`
3. `TaskGet(taskId)` → 从 `metadata.return_value` 提取结果
4. 处理状态转换（Agent Return 表，见下方）
5. 发送 `shutdown_request` 给临时 Agent → 等待 approve

##### Agent Return 处理表（双模共用）

| Agent Return | Orchestrator Action |
|-------------|-------------------|
| C2 `success` | 状态 → `story-doc-review` |
| C2 `completeness-violation` | 记录违规，由 Orchestrator 决定是否继续 |
| C2 `failure` | Mark `needs-intervention`，继续下一 Story |
| C3 `passed` | 状态 → `ready-for-dev` |
| C3 `needs-improve` | 状态 → `story-doc-improved`，重新排入队列 |
| C3 `fallback-activated` | 按 fallback 策略处理 |
| C4 `success` (dev) | 状态 → `review` |
| C4 `success` (fix) | 状态保持 `review`（等待 re-review） |
| C4 `scope-violation` | Mark `needs-intervention` |
| C4 `test-regression` | Mark `needs-intervention` |
| C4 `failure` | 状态不变，Mark and Continue |
| C5 `passed` | 状态 → `done`（或 `e2e-verify` if E2E enabled） |
| C5 `needs-fix` | 保持 `review`，dispatch C4 fix mode |
| C5 `needs-intervention` | Mark `needs-intervention`（review round 8+ degradation） |
| F2 `success` | 状态 → `done` |
| F2 `e2e-failure` | 状态 → `review` |
| F2 `skipped` | 状态 → `done` |
| F2 `login-failure` | 状态 → `review` |
| F2 `timeout` | Mark `needs-intervention` |
| Any `needs-intervention` | 标记 Story，记录到执行报告，继续下一 Story |

**关键区别（C1 vs C1-TEAM）：**
- **C1**: 有 `needs-research` 状态 → 触发 Research Relay Sub-flow (§7.4.R)
- **C1-TEAM**: **没有 `needs-research` 状态** — Agent 通过 P2P SendMessage 直接与常驻 KR 通信，研究在 Agent 内部完成，主控无需中继

##### Agent 会话 ID 记录

每次 Team member dispatch 后，记录 team member name 到 `agent-sessions.yaml`：
```yaml
sessions:
  "3-1":
    story_creator:
      team_member_name: "story-creator-3-1"
      timestamp: "2026-02-07T22:10:00Z"
    dev_runner:
      team_member_name: "dev-runner-3-1"
      timestamp: "2026-02-07T22:30:00Z"
```

##### 原子状态写入

与 C1 完全一致。通过 U4 atomic-write 执行状态转换。

##### sprint-status.yaml Git 提交协议 (P34)

与 C1 完全一致。

#### 7.5 Review-Fix Loop Management (C4 ↔ C5)

与 C1 完全一致。Progressive Degradation 规则不变。

#### 7.6 Token Budget Check (P26)

与 C1 完全一致。

#### 7.7 Progress Reporting (P17)

与 C1 完全一致，额外标注 Team 模式：
```
[TEAM][3/8] Story 5-2: backlog → story-doc-review (Story Creator via team member)
```

**On Loop Complete:** 所有 Story 处理完毕，继续 Step 8

---

### Step 8: Per-Story Post-Processing

与 C1 完全一致。包括：
- 8.1 First-Story Checkpoint (P18)
- 8.2 Error Handling (Mark and Continue, ADR-006)
- 8.3 Git Squash (P28)
- 8.4 Git Track Cleanup

---

### Step 9: Execution Summary

与 C1 完全一致。额外在报告中包含 Team 模式统计：

```markdown
## Team Mode Statistics

- Team Name: bso-sprint-sprint-2026-02-07-001
- Result Mode: sendmessage
- KR Dispatches: 0 (persistent, served 12 research requests)
- Team Members Created: 24
- Team Members Shutdown: 24
- KR Cache Hit Rate: 67% (8/12)
```

---

### Step 9.5: Final Git Commit

与 C1 完全一致。

---

### Step 10: Cleanup & Unlock

**Goal:** Shutdown KR → 清理 Team → 释放锁 → 清理临时文件。

#### 10.0 Team Shutdown (C1-TEAM 新增, before lock release)

1. **Shutdown KR:**
   ```yaml
   SendMessage:
     type: "shutdown_request"
     recipient: "knowledge-researcher"
     content: "Sprint complete, shutting down KR"
   ```
   等待 `shutdown_response(approve)` | 超时 `{team_mode.agent_shutdown_timeout}` 秒后强制继续

2. **清理残留 idle members:**
   - 遍历当前 Team 中所有 idle 状态的 member
   - 逐个发送 `shutdown_request`
   - 等待 approve 或超时

3. **删除 Team:**
   ```yaml
   TeamDelete()
   ```
   清理 team 和 task 目录

4. **日志:**
   ```
   [TEAM] Knowledge Researcher shutdown: approved
   [TEAM] Residual members shutdown: 0 remaining
   [TEAM] Team "{team_name}" deleted
   ```

#### 10.1 Release Lock (与 C1 Step 10 相同)

1. **释放互斥锁（U2 concurrency-control, release 模式）**

2. **清理临时文件:**
   - 删除 `.sprint-session/pending-writes.yaml`
   - 保留 execution-summary、screenshots、review-reports

3. **最终状态确认**

**On Success:** Sprint 执行完毕，Team 已清理，所有资源已释放

---

### User Bug Feedback Protocol (Post-Story Completion)

与 C1 完全一致。Bug Feedback Protocol 不走 Team 模式（debug-mode 路径不走 Team）。

**注意：** `--debug-mode` 快捷入口绕过 Team 架构，直接使用 Fire-and-Forget 模式调度 Agent。这是因为 Bug Feedback 是交互式协议，不适合 Team 的 P2P 异步通信模式。

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | Principle |
|---|---------------|----------------|----------|--------|-----------|
| E1 | .sprint-running exists (zombie) | Step 1 | Warning | Check PID+timestamp | P13 |
| E2 | NL parsing ambiguous | Step 2 | Warning | Show parsed params | P7, P9 |
| E3 | --check fails | Step 3 | Fatal | Report failures, abort | P2 |
| E4 | sprint-status.yaml not found | Step 3 | Fatal | Search paths, abort | P5 |
| E5 | Orphan state detected | Step 3 | Warning | Report orphans | P12 |
| E6 | Epic ↔ Status mismatch | Step 3 | Warning | Auto-sync | P24 |
| E7 | No Stories in queue | Step 4 | Info | Report empty queue | P17 |
| E8 | File-overlap dependency | Step 4 | Info | Mark blocked-by | P29 |
| E9 | Agent timeout | Step 7 | Fatal | Mark needs-intervention | P15 |
| E10 | Agent returns failure | Step 7/8 | Error | Mark and Continue | ADR-006 |
| E11 | scope-violation | Step 7 | Warning | Mark needs-intervention | P19 |
| E12 | test-regression | Step 7 | Critical | Rollback, mark | P20 |
| E13 | Sensitive file in commit | Step 7 | Critical | Block commit | P21 |
| E14 | Review round exceeds | Step 7.5 | Warning | Progressive degradation | P22 |
| E15 | Token budget 70% | Step 7.6 | Warning | Pause/warn per config | P26 |
| E16 | 3 consecutive failures | Step 8.2 | Critical | Sprint-level pause | P29 |
| E17 | Story review max rounds | Step 7 | Warning | Apply fallback | P3, P7 |
| E18 | Research budget exhausted | Step 6/7 | Info | Log, continue | P3 |
| E19 | E2E browser MCP unavailable | Step 7 | Info | Degrade to skip | P2 |
| E20 | Git squash conflict | Step 8.3 | Warning | Keep individual commits | P28 |
| E21 | Parallel write queue crash | Step 7 | Error | Recover from pending-writes | P23 |
| E22 | First-Story checkpoint | Step 8.1 | Info | Wait/report/skip | P18 |
| **E25** | **TeamCreate 失败** | **Step 1.5** | **Fatal** | **终止 Sprint，提示检查 Team 支持** | **P44** |
| **E26** | **KR 常驻启动失败** | **Step 1.5** | **Warning** | **降级：Agent 不请求研究（P2），Sprint 继续** | **P40** |
| **E27** | **Agent SendMessage 超时** | **Step 7.4** | **Warning** | **超时后标记 needs-intervention** | **P41** |
| **E28** | **KR shutdown 超时** | **Step 10.0** | **Warning** | **强制继续 TeamDelete** | **P42** |
| **E29** | **TeamDelete 失败** | **Step 10.0** | **Warning** | **记录警告，手动清理** | **P44** |

---

## Parallel Execution (when parallel > 1)

与 C1 完全一致。Team 模式下并行 dispatch 通过多个 Task tool 调用（team_name 相同）实现。

### Parallel Dispatch Rules (Team Mode 额外约束)

- P43: 同 Team 内不可同时修改同一文件
- 并行 dispatch 的多个 Agent 作为同一 Team 的 member，通过 TaskList 协调
- KR 常驻，可同时服务多个并行 Agent 的研究请求

---

## Configuration Dependencies

本 command 依赖 `config.yaml` 中的以下配置项（C1 全部配置 + Team 模式新增）:

```yaml
# === C1 全部配置（继承） ===
role_mapping.*                                    # Agent Persona
workflow_mapping.*                                # Skill call targets
defaults.*                                        # 所有默认参数
knowledge_research.*                              # 知识研究配置
e2e_inspection.*                                  # E2E 配置
git_squash_strategy                               # Git Squash
git_commit_patterns.*                             # Commit 模板
status_file_search_paths                          # 状态文件路径
research_relay.*                                  # Research Relay（Team 模式下不使用，但保留配置兼容）

# === C1-TEAM 新增配置 ===
team_mode.team_name_prefix                        # Step 1.5: Team 名称前缀
team_mode.kr_startup_timeout                      # Step 1.5: KR 启动超时
team_mode.agent_shutdown_timeout                  # Step 10.0: Agent shutdown 超时
team_mode.research_message_timeout                # Step 7: Agent 等待 KR 回复超时
team_mode.result_delivery_mode                    # Step 7.4: 结果传递模式
team_mode.message_protocol.agent_complete         # 消息协议前缀
team_mode.message_protocol.research_request       # 消息协议前缀
team_mode.message_protocol.research_result        # 消息协议前缀
```

---

## Design Principles Applied

### C1 继承原则 (P1-P39)

| # | Principle | Application in This Command |
|---|-----------|---------------------------|
| 1 | Agent dispatch 用 Team Member | Step 7: 通过 Task(team_name) 创建队友 |
| 2 | 降级优于报错 | KR 启动失败时降级继续; TeamDelete 失败时记录警告 |
| 3 | 预算控制一切 | Review 渐进降级; Token budget; Research budget |
| 4 | 单一状态写入入口 | 所有状态转换通过 U4 atomic-write |
| 5 | 状态是唯一真实来源 | 每次 dispatch 前通过 U4 验证状态 |
| 7 | 总有逃生通道 | 用户可取消; dry-run; 首 Story 暂停 |
| 8 | Headless Persona Loading | Agent 以 headless 模式加载 BMM persona |
| 11 | 原子状态文件写入 | temp file + rename via U4 |
| 13 | Zombie Lock 预防 | PID + 时间戳双重验证 via U2 |
| 15 | 独立超时 | 每个 Agent 有独立超时配置 |
| 17 | 执行可见性 | 每次状态转换输出进度; 完整执行报告 |
| 22 | Review 渐进降级 | Round 3/5/8 自动调整 |
| 26 | Token 预算监控 | 70% 阈值 |
| 28 | Git Squash 策略 | per_story / per_phase / none |
| 29 | 文件重叠依赖检测 | 构建依赖图; 连续失败阈值 |
| 31 | Thin Dispatcher | 主控仅调度，不分析业务 |
| 32 | Mandatory Git Exit Gate | 所有 Agent 返回前必须 U3 |
| 33 | KR Exclusive Research | Agent 禁止直接调用 MCP 工具（Team 模式下通过 P2P SendMessage） |
| 34 | sprint-status.yaml Git 提交 | 每次状态写入后提交 |
| 36 | Resume → Description 注入 | Team 不支持 resume，改为 prompt 注入上下文 |
| 37 | Principle Recitation | Step 0 复述核心约束（含 P40-P44） |

### C1-TEAM 新增原则 (P40-P44)

| # | Principle | Description | Application |
|---|-----------|-------------|-------------|
| P40 | KR Persistent Residence | KR Sprint 全程常驻，维护跨 Story 缓存上下文 | Step 1.5: 创建常驻 KR; Step 10.0: Sprint 结束时 shutdown |
| P41 | P2P Research Communication | Agent 间 SendMessage 直接通信，主控不中继研究 | Step 7.3: Agent prompt 中注入 P2P 协议; 替代 C1 的 §7.4.R Research Relay |
| P42 | Team Member Lifecycle | 除 KR 外均为临时队友，task 完成后 shutdown | Step 7.4: 收到结果后 shutdown_request; Step 10.0: 清理残留 |
| P43 | File Conflict Avoidance | 同 Team 内不可同时修改同一文件 | Step 7.2: 并行 dispatch 时检查文件重叠 |
| P44 | Team Session Non-Recoverable | Team 会话不可恢复，中断后从 sprint-status.yaml 重建 | Step 1.5: 每次新建 Team; 不支持 resume 已有 Team |

---

## Workflow Sequence Diagram (Team Mode)

```
User                 Orchestrator (C1-TEAM Lead)        Team Members           KR (Persistent)
 |                              |                           |                      |
 |--- epic-spec + options ----→|                           |                      |
 |                              |                           |                      |
 |                      Step 0: Principle Recitation        |                      |
 |                              |                           |                      |
 |                      Step 1: Startup & Lock              |                      |
 |                        (U2 acquire)                      |                      |
 |                              |                           |                      |
 |                      Step 1.5: Team Creation             |                      |
 |                        TeamCreate ──────────────────────────────→ created ──────→|
 |                        Task(KR, persistent) ─────────────────────────────────→ idle
 |                              |                           |                      |
 |                      Step 2-6: (same as C1)              |                      |
 |                              |                           |                      |
 |                      Step 7: Execution Loop              |                      |
 |                        For each Story:                   |                      |
 |                        ├─ Task(team, agent) ──────────→ agent started          |
 |                        |                                 |───── RESEARCH_REQ ──→|
 |                        |                                 |←──── RESEARCH_RES ──|
 |                        |                                 |                      |
 |                        ├─ ← AGENT_COMPLETE ────────────|                      |
 |                        ├─ shutdown_request ──────────→ agent stopped           |
 |                        ├─ U4 atomic-write ────────────────────→ status write   |
 |                        └─ Step 8: Post-Processing        |                      |
 |                              |                           |                      |
 |                      Step 9: Execution Summary           |                      |
 |←-- Sprint Report ----------|                           |                      |
 |                              |                           |                      |
 |                      Step 10.0: Team Shutdown            |                      |
 |                        shutdown_request ──────────────────────────────────────→|
 |                        ← shutdown_response ──────────────────────────────────←|
 |                        TeamDelete                        |                      |
 |                      Step 10.1: Cleanup & Unlock         |                      |
 |                        (U2 release)                      |                      |
```

---

_Command created on 2026-02-11 via fork from auto-dev-sprint.md (C1 v1.0.0)_
_This is the Agent Team variant of the BSO Orchestrator — uses TeamCreate/SendMessage instead of Fire-and-Forget Skill Calls_
_Key innovations: P40 KR Persistent Residence, P41 P2P Research Communication, P42 Team Member Lifecycle, P43 File Conflict Avoidance, P44 Team Session Non-Recoverable_
_Base file: auto-dev-sprint.md (C1) — 74K, not modified (backward compatibility red line)_
