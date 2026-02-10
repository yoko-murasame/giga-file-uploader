---
name: auto-dev-sprint
id: C1
description: "BSO Sprint Orchestrator — Master command for autonomous sprint execution. Parses user intent, drives 8-state lifecycle, dispatches 6 agents, manages sprint-status.yaml, and produces execution summaries."
module: bso
agent: orchestrator
installed_path: '{project-root}/.claude/commands/bso/auto-dev-sprint.md'
version: 1.0.0
created: 2026-02-07
updated: 2026-02-10
status: validated
---

# BSO Auto Dev Sprint Command (C1)

> BSO 主控编排命令 -- 自主 Sprint 执行的中枢大脑。解析用户意图（自然语言 / 交互式 / 精确参数），驱动 8 态生命周期状态机，调度 6 个专业 Agent，管理 sprint-status.yaml（原子写入），生成执行报告。本命令不绑定独立 Agent，是纯编排逻辑。

## Purpose

将用户的高层 Sprint 执行指令转化为完全自主的开发流水线。从 Epic 定义出发，自动创建 Story 文档、审查质量、TDD 开发、代码审查、修复循环、E2E 验证，直至所有 Story 达到 `done` 状态。支持无人值守的过夜执行模式。

## Primary Agent

**Orchestrator** -- 本命令自身即为编排器，无独立 Agent。所有步骤均在 Orchestrator 进程内执行，Agent 调度通过 Skill Call 实现。

## Dispatched Agents

| Order | Agent | Skill ID | Trigger Condition | Workflow Called |
|-------|-------|----------|-------------------|----------------|
| 1 | Story Creator | `bso-story-creator` | Story in `backlog` or `story-doc-improved` | story-creation (C2) |
| 2 | Story Reviewer | `bso-story-reviewer` | Story in `story-doc-review` + review enabled | story-review (C3) |
| 3 | Dev Runner | `bso-dev-runner` | Story in `ready-for-dev` | dev-execution (C4, dev mode) |
| 4 | Review Runner | `bso-review-runner` | Story in `review` | code-review (C5) |
| 5 | Dev Runner (fix) | `bso-dev-runner` | Review returns `needs-fix` | dev-execution (C4, fix mode) |
| 6 | E2E Inspector | `bso-e2e-inspector` | Story in `e2e-verify` + E2E enabled | e2e-inspection (F2) |
| * | Knowledge Researcher | `bso-knowledge-researcher` | On-demand from any agent | knowledge-research (F1) |

---

## Command Format

```
/bso:auto-dev-sprint <epic-spec> [options]
```

### Three Startup Modes

1. 🗣️ **Natural Language** — `"把 epic5 没完成的都跑了，严格审查"`
2. 🎯 **Interactive Guide** — 无参数 → 步进式引导
3. ⌨️ **Precise Parameters** — `epic5 --review-strictness strict --parallel 2`

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

### State-to-Agent Dispatch Table

| Current State | Agent Dispatched | Skill Call Parameters | On Success | On Failure |
|--------------|-----------------|----------------------|-----------|------------|
| `backlog` | Story Creator (C2) | `{story_key, mode:"create", session_id, epic_file_path}` | → `story-doc-review` | 状态不变，mark `needs-intervention` |
| `story-doc-improved` | Story Creator (C2) | `{story_key, mode:"revise", session_id, epic_file_path}` | → `story-doc-review` | 状态不变，mark `needs-intervention` |
| `story-doc-review` | Story Reviewer (C3) | `{story_key, session_id, story_file_path, review_round}` | passed → `ready-for-dev` / needs-improve → `story-doc-improved` | mark `needs-intervention` |
| `ready-for-dev` | Dev Runner (C4) | `{story_key, mode:"dev", session_id}` | → `review` | 状态不变，mark `needs-intervention` |
| `review` | Review Runner (C5) | `{story_key, session_id, review_round}` | passed → `done`/`e2e-verify` / needs-fix → dispatch C4 fix | mark `needs-intervention` |
| `review` (fix) | Dev Runner (C4) | `{story_key, mode:"fix", session_id, config_overrides:{review_strictness_threshold}}` | → `review` (re-review) | mark `needs-intervention` |
| `e2e-verify` | E2E Inspector (F2) | `{story_key, mode:"e2e", session_id}` | success/skipped → `done` / e2e-failure → `review` | mark `needs-intervention` |

---

## Input Schema

```yaml
inputs:
  required:
    epic_spec: "epic5"                            # Epic 标识符（epicN / all / epicN-epicM / NL）
  optional:
    --parallel <N>: 1                             # 最大并行 Story 数（默认: 1）
    --review-strictness: "normal"                  # strict / normal / lenient（默认: normal）
    # 语义映射: strict=修复所有>=LOW, normal=修复>=MEDIUM, lenient=仅修HIGH
    # 内部转换: strict→review_strictness_threshold:low, normal→medium, lenient→high
    --max-review-rounds: 10                       # Code Review 最大轮数（默认: 10）
    --max-story-review-rounds: 3                  # Story Review 最大轮数（默认: 3）
    --skip-story-review: false                    # 跳过 Story Review 阶段
    --e2e: false                                  # 启用 E2E 验证
    --no-research: false                          # 禁用 Knowledge Researcher
    --pre-research: false                         # 批量预研模式
    --dry-run: false                              # 预览模式
    --check: false                                # 环境健康检查
    --status-file <path>: ""                      # 自定义状态文件路径
    --auto-clear-git-track: true                   # Story 完成后自动清理 git track 文件（默认跟随 config.yaml）
    --force: false                                # 强制覆盖已有锁
    --yolo: false                                 # YOLO 全自动模式：关闭所有用户交互确认点（见 YOLO Mode 章节）
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `epic_spec` | 非空字符串，匹配 `epicN` / `all` / `epicN-epicM` / 自然语言文本 | abort, status: "failure", error: "Invalid epic spec" |
| `--parallel` | 正整数 >= 1 | 默认使用 `defaults.parallel` |
| `--review-strictness` | 值为 "strict", "normal", 或 "lenient" | 默认使用 `defaults.review_strictness` |
| `--max-review-rounds` | 正整数 >= 1 | 默认使用 `defaults.max_review_rounds` |
| `--max-story-review-rounds` | 正整数 >= 1 | 默认使用 `defaults.max_story_review_rounds` |
| `--status-file` | 文件路径存在且可读（如提供） | 回退到 `status_file_search_paths` 配置 |
| `--force` | 布尔值 | 默认 false |
| `--yolo` | 布尔值 | 默认 false |

---

### YOLO Mode (--yolo)

**当 `--yolo: true` 时，以下所有用户交互点被静默跳过：**

| 交互点 | 正常行为 | YOLO 行为 |
|--------|---------|-----------|
| Step 2 参数确认 | 展示表格 + 等待 [Y/M/N] | 强制展示表格 + 3秒后自动确认（可 Ctrl+C 中断） |
| Step 8.1 首 Story 检查点 | `pause` 模式等待用户确认 | 强制降级为 `report`（生成报告但不暂停） |
| Step 8.2 连续失败暂停 | 展示失败列表，等待 [C/S] | 静默选 C（Continue），继续执行剩余 Story |
| Step 7.6 Token 预算暂停 | `pause_and_report` 暂停 | 降级为 `warn_and_continue`（记录警告，继续执行） |
| Step 1 僵尸锁确认 | 提示用户确认是否覆盖 | 自动覆盖僵尸锁（等价于 `--force`） |
| Step 3 健康检查警告 | 询问是否继续 | 静默继续（仅记录警告） |

**安全网保留（即使 YOLO 模式也不跳过）：**
- Review 渐进降级 Round 8 强制 `needs-intervention`（防止无限循环）
- 敏感文件 git commit 拦截（安全红线）
- Agent 超时标记 `needs-intervention`（防止卡死）
- **Story Review 流程（story_review_enabled 配置）— YOLO 不影响 Story Review 开关，只有 `--skip-story-review` 才能跳过**

**推荐用法：**
```bash
/bso:auto-dev-sprint epic5 --yolo                    # 全自动执行
/bso:auto-dev-sprint "跑完 epic3" --yolo --parallel 2  # 全自动 + 并行
```

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

### Step 1: Startup & Lock

**Goal:** 获取 `.sprint-running` 互斥锁，检测僵尸锁，初始化 Sprint 会话（Principle 13: Zombie Lock Prevention）。

**Actions:**

1. **生成 Session ID:**
   - 格式: `sprint-{date}-{sequence}`
   - 示例: `sprint-2026-02-07-001`

2. **加载 BSO 配置:**
   - 读取 `config.yaml`，解析所有配置项
   - 解析 `status_file_search_paths`，定位 sprint-status.yaml
   - 如果 `--status-file` 指定了路径，优先使用

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
     - `acquired` → 继续 Step 2
     - `blocked` → 报告锁信息，终止
     - `zombie-detected` + `force` → 覆盖锁，继续 Step 2
     - `zombie-detected` + `!force` → 提示用户确认
     - `failure` → 终止

4. **初始化会话目录:**
   - 创建 `.sprint-session/` 目录（如不存在）
   - 创建 `.sprint-session/screenshots/` 子目录（如 E2E 启用）
   - 记录 Sprint 启动时间戳

**On Success:** 锁已获取，会话已初始化，继续 Step 2
**On Failure:**
```yaml
# 锁被拒绝
message: "Sprint already running (PID: {pid}, session: {session_id}, started: {started_at})"
action: "Use --force to override, or wait for the running sprint to complete"

# 锁获取失败
message: "Failed to acquire sprint lock: {error}"
action: "Check file permissions on project root"
```

---

### Step 2: Intent Parsing

**Goal:** 解析用户输入为结构化执行参数，支持三种输入路径（Principle 9: NL 解析能力，Principle 10: 确认机制）。

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
   - 示例: `"把 epic5 没完成的都跑了，严格审查"` → `{epic_spec: "epic5", filter: "incomplete", review_strictness: "strict"}`
   - **NL 解析保护规则（防止误映射）：**
     - "快速"、"跳过确认"、"全自动"、"无人值守" 等表述 → 映射到 `--yolo`，**绝不映射到 `--skip-story-review`**
     - "跳过审查"、"不审查 Story"、"skip review" 等表述 → 映射到 `--skip-story-review`
     - `--yolo` 和 `--skip-story-review` 是两个独立正交的开关，禁止互相推导
     - 如果 NL 输入不包含明确的"跳过审查"语义，`skip_story_review` 必须保持 `false`

3. **Story 列表解析:**
   - 根据 epic_spec + filter 从 sprint-status.yaml 解析具体 Story 列表
   - filter 映射:
     - `incomplete` → 排除 `done` 状态
     - `all` → 包含所有状态
     - `backlog` → 仅 `backlog` 状态

4. **参数展示（所有模式强制执行，含 YOLO — 硬性义务，不可省略）:**
   - 无论 `--yolo` 与否，都**强制输出**参数核对表格：
     ```
     ==========================================
     BSO Sprint 执行参数核对
     ==========================================
     Epic:           epic5
     Filter:         incomplete
     Strictness:     strict
     Story Queue:    4 stories
     Story Review:   enabled
     E2E:            disabled
     Parallel:       1
     YOLO Mode:      ON / OFF
     ==========================================

     #  | Key  | Name      | State
     ---|------|-----------|--------
     1  | 5-1  | 用户认证   | backlog
     2  | 5-3  | 数据同步   | backlog
     ...
     ==========================================
     ```

5. **参数确认（区分 YOLO 模式）:**
   - **如果 `--yolo: true`：**
     - 输出日志: `[YOLO] 参数已展示，3 秒后自动确认执行...`
     - 等待 3 秒（给用户一个 Ctrl+C 中断的窗口）
     - 3 秒后自动继续执行（等价于自动选 Y）
   - **如果 `--yolo: false`（默认）：**
     - 展示操作选项: `[Y] 确认执行  [M] 修改参数  [N] 取消`
     - 等待用户确认: Y → 继续 / M → 修改循环(上限5次) / N → 终止

6. **默认值填充（按 config.yaml）:**
   ```yaml
   filter: "incomplete"
   review_strictness: "{defaults.review_strictness}" # "normal"
   # 内部转换为 review_strictness_threshold: strict→low, normal→medium, lenient→high
   skip_story_review: false
   e2e: "{e2e_inspection.enabled}"                 # false
   parallel: "{defaults.parallel}"                 # 1
   max_review_rounds: "{defaults.max_review_rounds}" # 10
   max_story_review_rounds: "{defaults.max_story_review_rounds}" # 3
   ```

**On Success:** 结构化参数 + Story 列表就绪，继续 Step 3
**On Failure:**
```yaml
return:
  status: "failure"
  errors:
    - type: "intent_parse_failed"
      message: "无法从输入中提取有效的执行参数"
      suggestion: "请使用更明确的表述，例如: '跑 epic3 没完成的 story'"
```

---

### Step 3: Environment & State

**Goal:** 运行环境健康检查（可选），加载并验证 sprint-status.yaml，执行 Epic ↔ Status 一致性检查（Principle 12: 孤儿状态检测，Principle 24: Epic-Status 一致性检查）。

**Actions:**

1. **环境健康检查（如 `--check` 标志启用）:**
   - 调用 U1 health-check workflow:
     ```yaml
     project_root: "{project_root}"
     check_only: true    # --check 模式仅报告
     session_id: "{session_id}"
     ```
   - 处理返回值:
     - `healthy` → 继续
     - `warnings` → 显示警告，询问是否继续（`--check` 模式直接报告后终止）
     - `unhealthy` → 报告失败项，终止
   - **如果 `--check` 标志启用:** 显示报告后立即终止（不启动 Sprint）

2. **加载 sprint-status.yaml（U4 status-validation, startup-check 模式）:**
   - 调用 U4 status-validation workflow:
     ```yaml
     mode: "startup-check"
     session_id: "{session_id}"
     epic_file_paths: ["{epic_file_paths}"]
     ```
   - 处理返回值:
     - `consistent` → 继续
     - `inconsistencies-found` → 显示不一致报告:
       - Missing in Status → 自动添加为 `backlog`（已由 U4 完成）
       - Orphaned in Status → 警告用户
       - Name Mismatches → 警告用户
       - Orphan States → 警告处于中间状态的 Story
     - `failure` → 终止

3. **验证 Story 队列有效性:**
   - 重新读取 sprint-status.yaml（可能被 U4 修改过）
   - 确认 Step 2 解析的 Story 列表中的所有 Story 都存在于 sprint-status.yaml 中
   - 过滤已处于 `needs-intervention` 状态的 Story（跳过，不重试）
   - 如果队列为空 → 报告原因，终止

**On Success:** 环境就绪，状态文件一致，继续 Step 4
**On Failure:**
```yaml
# 健康检查失败
message: "Environment check failed: {unhealthy_items}"
action: "Fix the reported issues and retry"

# 状态文件不可用
message: "sprint-status.yaml not found or corrupted"
action: "Ensure sprint-status.yaml exists at configured paths"
```

---

### Step 4: Queue Building

**Goal:** 构建 Story 执行队列，排序，检测文件重叠依赖（Principle 29: 文件重叠依赖检测）。

**Actions:**

1. **构建初始队列:**
   - 从 Step 2 确认的 Story 列表出发
   - 排除已处于 `done` 或 `needs-intervention` 状态的 Story
   - 按 epic-story 编号自然排序: `3-1, 3-2, 3-3, 4-1, 4-2, ...`

2. **文件重叠依赖检测（Principle 29）:**
   - 对队列中的每对 Story:
     a. 读取 Story 文件中的文件作用域声明（file scope declarations）
     b. 检测是否存在文件路径重叠（两个 Story 修改同一文件）
     c. 如果检测到重叠:
        - 标记后续 Story 为 `blocked-by: {earlier_story_key}`
        - 在并行模式下，确保有依赖的 Story 不会同时执行
        - 记录依赖关系到执行报告
   - 依赖检测仅在 `dependency_detection.mode: "file_overlap"` 时启用

3. **生成执行计划:**
   ```yaml
   execution_queue:
     - story_key: "3-1"
       current_state: "backlog"
       next_agent: "Story Creator (C2)"
       blocked_by: []
     - story_key: "3-2"
       current_state: "ready-for-dev"
       next_agent: "Dev Runner (C4)"
       blocked_by: []
     - story_key: "3-3"
       current_state: "backlog"
       next_agent: "Story Creator (C2)"
       blocked_by: ["3-2"]  # file overlap detected
   ```

4. **并行度调整:**
   - 如果 `parallel` 值超过队列中无依赖的 Story 数量 → 自动降低 parallel 值
   - 记录调整日志

**On Success:** 执行队列就绪，继续 Step 5
**On Failure:**
```yaml
# 队列为空
message: "No stories in queue after filtering. All stories may be done or need intervention."
action: "Check sprint-status.yaml or adjust filter/epic-spec"
```

---

### Step 5: Dry-Run Preview

**Goal:** 如果 `--dry-run` 启用，展示完整执行计划后退出；否则直接继续（Principle 17: 执行可见性）。

**Actions:**

1. **检查 dry-run 标志:**
   - 如果 `--dry-run: false` → 跳过此步骤，直接进入 Step 6

2. **展示执行计划:**
   ```
   ==========================================
   BSO Sprint Dry-Run Preview
   ==========================================

   Session: sprint-2026-02-07-001
   Epic: epic5
   Parallel: 1
   Fix Level: medium
   Story Review: enabled
   E2E: disabled

   ------------------------------------------
   Execution Queue (4 stories):
   ------------------------------------------
   #  | Key  | State        | Next Agent        | Blocked By
   ---|------|-------------|-------------------|----------
   1  | 5-1  | backlog      | Story Creator(C2) | -
   2  | 5-2  | backlog      | Story Creator(C2) | -
   3  | 5-3  | ready-for-dev| Dev Runner(C4)    | -
   4  | 5-4  | review       | Review Runner(C5) | 5-3

   Dependencies detected: 1 (5-4 blocked by 5-3 file overlap)

   ------------------------------------------
   Estimated Agent Dispatches:
   ------------------------------------------
   Story Creator (C2):  2 dispatches
   Story Reviewer (C3): 2 dispatches (if review enabled)
   Dev Runner (C4):     4+ dispatches (dev + potential fixes)
   Review Runner (C5):  4+ dispatches (initial + re-reviews)
   E2E Inspector (F2):  0 dispatches (E2E disabled)

   ==========================================
   DRY RUN COMPLETE — No changes made.
   ==========================================
   ```

3. **释放锁并退出:**
   - 调用 U2 concurrency-control (release 模式)
   - 终止 Sprint

**On Dry-Run:** 展示计划 → 释放锁 → 退出
**On Continue:** 直接进入 Step 6

---

### Step 6: Pre-Research (Conditional)

**Goal:** 如果 `--pre-research` 启用，批量执行技术研究，预缓存知识供后续 Story 使用（Principle 16: 知识容量管理）。

**Condition:** 仅当 `--pre-research: true` 时执行此步骤。否则跳过，直接进入 Step 7。

**Actions:**

1. **扫描队列中所有 Story 的技术依赖:**
   - 读取每个 Story 的 Epic 定义
   - 提取技术关键词（框架、API、库名称）
   - 去重合并

2. **批量触发 Knowledge Researcher (F1):**
   - 对每个技术关键词:
     ```yaml
     mode: "research"
     query: "{技术关键词}"
     context: "Pre-sprint batch research"
     session_id: "{session_id}"
     ```
   - 预算控制: 总调用上限 = `knowledge_research.max_calls_per_story` × 队列 Story 数量
   - 结果缓存到 `index.yaml`

3. **报告预研结果:**
   ```
   Pre-Research Complete:
   - Total queries: 8
   - Cached: 5 (cache-hit)
   - Researched: 3 (new entries)
   - Failed: 0
   ```

**On Success:** 知识缓存已预热，继续 Step 7
**On Failure (Knowledge Researcher 不可用):** 记录警告，继续 Step 7（Principle 2: 降级优于报错）

---

### Step 7: Execution Loop

**Goal:** 核心循环 -- 遍历 Story 队列，按当前状态调度对应 Agent，等待返回，更新状态，检查预算（Principle 1, 4, 8, 14, 15, 23, 26）。

**⚠️ CRITICAL: Thin Dispatcher Constraint (Principle 31 — 新增)**

Orchestrator 是**纯调度器**，严禁参与业务分析。每次 Agent dispatch 时，Orchestrator 仅执行以下机械动作：

1. **读状态** → 从 sprint-status.yaml 获取 Story 当前状态
2. **查映射表** → 状态 → Agent 映射（State-to-Agent Dispatch Table）
3. **构造最小参数** → 仅传递 `story_key`, `mode`, `session_id`, `config_overrides`（如有）
4. **dispatch** → Skill Call 调度 Agent
5. **读返回值** → 仅读取 `status` 字段
6. **更新状态** → 通过 U4 atomic-write 写入新状态
7. **输出进度** → 一行进度日志

**严禁行为（违反即为 Bug）：**
- ❌ 读取 Story .md 文件内容（那是 Agent 的事）
- ❌ 分析 Epic 定义的业务需求（那是 Agent 的事）
- ❌ 评估代码变更的技术细节（那是 Agent 的事）
- ❌ 解读 review findings 的具体内容（那是 Agent 的事）
- ❌ 在进度日志中包含业务描述（仅输出状态转换和 Agent 名称）
- ❌ 对 Agent 返回的 `results` 字段做深度分析（仅读 `status` 字段做分支判断）

**理由：** Orchestrator 的上下文窗口是整个 Sprint 的生命线。每多分析一行业务内容，就少处理一个 Story。Orchestrator 应该像一个交通信号灯——只管红绿灯切换，不关心每辆车去哪里。

**Actions:**

对队列中的**每个 Story** 执行以下循环:

#### 7.1 Pre-Dispatch Validation

- 调用 U4 status-validation (pre-dispatch 模式):
  ```yaml
  mode: "pre-dispatch"
  story_key: "{story_key}"
  target_phase: "{current_phase}"
  session_id: "{session_id}"
  ```
- 如果 `state-mismatch` → 跳过此 Story，记录警告，继续下一个

#### 7.2 Dependency Check (Parallel Mode)

- 如果 `parallel > 1`:
  - 检查 `blocked_by` 列表
  - 如果有未完成的阻塞 Story → 暂缓此 Story，先处理其他
- 如果 `parallel == 1`:
  - 串行执行，跳过依赖检查

#### 7.3 Agent Dispatch

根据 Story 当前状态，调度对应 Agent:

**backlog / story-doc-improved → Story Creator (C2):**
```yaml
skill_call:
  target: "bso-story-creator"
  params:
    story_key: "{story_key}"
    mode: "create" | "revise"    # backlog=create, story-doc-improved=revise
    session_id: "{session_id}"
    epic_file_path: "{epic_file_path}"
  # P36 Resume 策略: revise 模式优先 resume 上一次 Story Creator 会话
  resume: >
    IF mode == "revise":
      lookup agent_sessions["{story_key}"].story_creator.agent_id
      IF found → resume: "{agent_id}"  (保留创建时的完整上下文)
      IF not found OR resume fails → 新建对话 (fallback)
    IF mode == "create":
      始终新建对话 (首次创建无历史会话)
```

**story-doc-review → Story Reviewer (C3):**
```yaml
skill_call:
  target: "bso-story-reviewer"
  params:
    story_key: "{story_key}"
    session_id: "{session_id}"
    story_file_path: "{story_file_path}"
    review_round: "{story_review_round}"
  # P36 Resume 策略: Story Reviewer 始终新建对话（独立视角，防止确认偏误）
```
- **Story Review 跳过判定（严格条件，与 --yolo 完全正交）：**
  ```
  skip_story_review = (--skip-story-review == true) OR (config.defaults.story_review_enabled == false)
  # YOLO 模式不影响此判定。--yolo 只控制用户交互确认点，不控制 Agent 质量门控。
  # 只有用户显式传入 --skip-story-review 或 config 中禁用 story_review_enabled 才会跳过。
  ```
  如果 `skip_story_review == true` → 跳过 C3，直接将状态设为 `ready-for-dev`，输出日志: `[INFO] Story Review skipped (--skip-story-review or config disabled)`

**ready-for-dev → Dev Runner (C4, dev mode):**
```yaml
skill_call:
  target: "bso-dev-runner"
  params:
    story_key: "{story_key}"
    mode: "dev"
    session_id: "{session_id}"
```

**review → Review Runner (C5):**
```yaml
skill_call:
  target: "bso-review-runner"
  params:
    story_key: "{story_key}"
    session_id: "{session_id}"
    review_round: "{code_review_round}"
    config_overrides:
      review_strictness_threshold: "{effective_review_strictness_threshold}"
  # P36 Resume 策略: Review Runner 始终新建对话（独立视角，防止确认偏误）
```

**review (needs-fix) → Dev Runner (C4, fix mode):**
```yaml
skill_call:
  target: "bso-dev-runner"
  params:
    story_key: "{story_key}"
    mode: "fix"
    session_id: "{session_id}"
    config_overrides:
      review_strictness_threshold: "{effective_review_strictness_threshold}"
  # P36 Resume 策略: fix 模式优先 resume 上一次 Dev Runner 会话
  resume: >
    lookup agent_sessions["{story_key}"].dev_runner.agent_id
    IF found → resume: "{agent_id}"  (保留开发时的完整上下文)
    IF not found OR resume fails → 新建对话 (fallback)
```

**e2e-verify → E2E Inspector (F2):**
```yaml
skill_call:
  target: "bso-e2e-inspector"
  params:
    story_key: "{story_key}"
    mode: "e2e"
    session_id: "{session_id}"
```

#### 7.3.F Resume Fallback 处理（Principle 36）

当 dispatch 需要 resume 时（C2 revise、C4 fix），执行以下流程：

```
1. 读取 .sprint-session/agent-sessions.yaml
2. 查找 agent_sessions["{story_key}"].{agent_type}.agent_id
3. IF agent_id 存在:
   a. 尝试 resume: Task tool 的 resume 参数传入 agent_id
   b. IF resume 成功 → Agent 继续执行，保留完整上下文
   c. IF resume 失败（会话过期/不存在/超限）→ 记录警告，fallback 为新建对话
4. IF agent_id 不存在:
   a. 新建对话（首次 dispatch 或 agent-sessions.yaml 未记录）
5. 无论 resume 或新建，返回后都更新 agent-sessions.yaml 中的 agent_id
```

**Resume 策略总结（Principle 36: Creator/Executor Resume, Reviewer Fresh）：**

| Agent | 被打回场景 | Resume 策略 | 理由 |
|-------|-----------|------------|------|
| Story Creator (C2) | `story-doc-improved` → revise | Resume 上次会话 | 保留创建时的 Epic 理解和设计思路 |
| Dev Runner (C4) | `review` needs-fix → fix | Resume 上次会话 | 保留开发时的代码理解和测试上下文 |
| Story Reviewer (C3) | 多轮 review | 始终新建对话 | 独立视角，防止确认偏误 |
| Review Runner (C5) | 多轮 review | 始终新建对话 | 独立视角，防止确认偏误 |
| E2E Inspector (F2) | - | 始终新建对话 | 每次全新浏览器验证 |
| Knowledge Researcher (F1) | - | 始终新建对话 | 无状态查询服务 |

#### 7.4 Await Return & Process Result

1. **等待 Agent 返回结果**
   - 超时控制: 每个 Agent 有独立超时（来自 `config.yaml` 的 `agent_timeout_seconds`）
   - 超时处理: 按 `agent_timeout_action` 配置（默认 `mark_needs_intervention`）

1.5 **记录 Agent 会话 ID（Principle 35 + Principle 36）:**
   - 每次 Agent dispatch 返回后，从 Task tool 返回值中提取 `agentId`（Claude Code Agent 会话 ID）
   - 写入 `.sprint-session/agent-sessions.yaml`，按 story_key + agent_type 索引
   - 该 ID 供以下场景使用:
     - **P36 Resume 策略**: C2 revise 和 C4 fix 模式 resume 上一次会话
     - **Bug Feedback Protocol**: 修复用户报告 Bug 时 resume 原 Dev Runner 会话
   - 格式参见 User Bug Feedback Protocol 中的 Agent 会话 ID 注册表章节

2. **处理返回状态:**

   | Agent Return | Orchestrator Action |
   |-------------|-------------------|
   | C2 `success` | 状态 → `story-doc-review` |
   | C2 `completeness-violation` | 记录违规，由 Orchestrator 决定是否继续 |
   | C2 `failure` | Mark `needs-intervention`，继续下一 Story |
   | C3 `passed` | 状态 → `ready-for-dev` |
   | C3 `needs-improve` | 状态 → `story-doc-improved`，重新排入队列 |
   | C3 `fallback-activated` | 按 fallback 策略处理（ask_user/force_pass/skip_story） |
   | C4 `success` (dev) | 状态 → `review` |
   | C4 `success` (fix) | 状态保持 `review`（等待 re-review） |
   | C4 `scope-violation` | Mark `needs-intervention` |
   | C4 `test-regression` | Mark `needs-intervention` |
   | C4 `failure` | 状态不变，Mark and Continue |
   | C5 `passed` | 状态 → `done`（或 `e2e-verify` if E2E enabled） |
   | C5 `needs-fix` | 保持 `review`，dispatch C4 fix mode |
   | C5 `needs-intervention` | Mark `needs-intervention`（review round 8+ degradation） |
   | F2 `success` | 状态 → `done` |
   | F2 `e2e-failure` | 状态 → `review`（回到 fix 循环） |
   | F2 `skipped` | 状态 → `done`（非阻塞跳过） |
   | F2 `login-failure` | 状态 → `review` |
   | F2 `timeout` | Mark `needs-intervention` |
   | Any `needs-intervention` | 标记 Story，记录到执行报告，继续下一 Story |
   | Any `needs-research` | 进入 Research Relay Sub-flow (§7.4.R)：调度 KR → 注入结果 → resume 原 Agent |

3. **原子状态写入（U4 atomic-write 模式）:**
   - 每次状态转换都通过 U4 执行原子写入:
     ```yaml
     mode: "atomic-write"
     story_key: "{story_key}"
     new_status: "{new_status}"
     previous_status: "{current_status}"
     session_id: "{session_id}"
     ```
   - CAS 校验防止并发冲突
   - 写入失败 → 重试一次，仍失败 → mark `needs-intervention`

4. **sprint-status.yaml Git 提交协议（Principle 34 — 新增）:**
   - **谁负责：** Orchestrator (C1) 在每次 U4 atomic-write 成功后执行
   - **提交时机：** 每个 Story 完成一个完整阶段转换后（不是每次中间状态变更都提交，而是一个 Agent dispatch 完成并状态写入成功后）
   - **提交方式：** 调用 precise-git-commit (U3)，仅 stage `sprint-status.yaml` 文件
   - **Commit message 模板：** `chore: sprint-status Story {story_key} → {new_status}`
   - **降级处理：** 如果提交失败 → 记录警告，不阻断 Sprint（sprint-status.yaml 的 git 历史是便利性功能，不是核心流程）
   - **Git Squash 兼容：** 这些 chore commits 在 Step 8.3 的 per_story squash 中会被合并到 Story 的主 commit 中

#### 7.4.R Research Relay Sub-flow（Orchestrator-Mediated Research Relay）

当任何 Agent 返回 `status: "needs-research"` 时，Orchestrator 执行以下中继流程：

**背景：** Agent 作为 Task tool 子进程，无法再派生子 Agent（技术限制）。P33 要求的"通过 Skill Call 调用 KR"不可行。Research Relay 通过 Orchestrator 中继解决此问题：Agent 暂停 → 主控调度 KR → KR 返回结果 → 主控 resume 原 Agent 并注入研究结果。

```
Agent 返回:
  status: "needs-research"
  research_requests:
    - query: "How to configure virtual scrolling with dynamic row heights?"
      framework: "vue-easytable"
      framework_version: "2.x"
      topic: "virtual scrolling configuration"
      tags: ["virtual-scroll", "row-height", "performance"]
      priority: "high"      # high | normal — high 表示阻塞当前任务
    - query: "JeecgBoot @Dict annotation usage for select options"
      framework: "jeecg-boot"
      topic: "dict annotation"
      tags: ["dict", "annotation", "select"]
      priority: "normal"
```

**中继流程：**

```
1. 收到 Agent 返回 status: "needs-research"
2. 提取 research_requests 列表
3. 检查预算: 当前 Story 剩余研究调用次数（config: max_calls_per_story）
   - 如果预算耗尽 → 跳过研究，resume 原 Agent 并注入空结果 + 预算耗尽警告
4. 对每个 research_request（最多 research_relay.max_requests_per_dispatch 个）:
   a. 调度 Knowledge Researcher (F1):
      skill_call:
        target: "bso-knowledge-researcher"
        params:
          story_key: "{story_key}"
          mode: "research"
          session_id: "{session_id}"
          research_query:
            framework: "{request.framework}"
            framework_version: "{request.framework_version}"
            topic: "{request.topic}"
            tags: "{request.tags}"
            question: "{request.query}"
   b. 等待 KR 返回（超时: research_relay.timeout_seconds）
   c. 收集结果: report_path + confidence + cache_hit
5. 汇总所有研究结果:
   research_results:
     - query: "{original_query}"
       status: "success" | "partial" | "cache-hit" | "timeout" | "budget-exhausted"
       report_path: "frameworks/vue-easytable/virtual-scroll.md"
       confidence: "high"
       summary: "简要摘要（由 KR 返回）"
6. Resume 原 Agent（P36 机制）:
   - 从 agent-sessions.yaml 获取原 Agent 的 agent_id
   - Resume 对话，注入研究结果:
     "Knowledge Researcher 已完成研究，结果如下:
      [research_results 格式化输出]
      请基于这些研究结果继续执行。"
7. 原 Agent 继续执行，最终返回正常状态（success/failure/passed/needs-fix 等）
8. 更新 agent-sessions.yaml 中的 agent_id（resume 后 ID 不变）
```

**降级处理：**

| 场景 | 处理 |
|------|------|
| KR 调度超时 | 跳过该研究请求，继续处理剩余请求；resume Agent 时标注超时请求 |
| KR 返回 failure | 记录警告，resume Agent 时标注失败请求 |
| 研究预算耗尽 | 跳过剩余请求，resume Agent 时注入预算耗尽警告 |
| Resume 原 Agent 失败 | 新建对话（P36 fallback），注入研究结果 + 之前的完整上下文 |
| Agent 二次返回 needs-research | 允许（递归中继），但累计研究调用不超过 max_calls_per_story |

**注意：** Research Relay 不触发状态转换。Story 状态保持不变，直到原 Agent 返回最终状态后才由 Orchestrator 执行状态转换。

#### 7.5 Review-Fix Loop Management (C4 ↔ C5)

当 C5 返回 `needs-fix` 时，进入 Review-Fix 循环:

```
C4 (dev complete) → C5 (review round 1) → needs-fix → C4 (fix) → C5 (review round 2) → ...
```

**Progressive Degradation（Principle 22）:**

| Round | Degradation Rule | Config Key | Effective review_strictness_threshold |
|-------|-----------------|------------|-------------------|
| 1-2 | None | -- | 用户配置值（review_strictness 转换后的阈值） |
| 3-4 | `lower_strictness` | `review_degradation.round_3` | 自动降低一级 |
| 5-7 | `high_only` | `review_degradation.round_5` | 仅 HIGH |
| >= 8 | `force_needs_intervention` | `review_degradation.round_8` | N/A — 终止 |

**循环控制由 Orchestrator 管理:**
- 递增 `review_round` 计数
- 根据 `review_degradation` 配置调整 `review_strictness_threshold`
- Round 8+ → 强制 mark `needs-intervention`

#### 7.6 Token Budget Check (Principle 26)

每次 Agent dispatch 返回后:
1. 估算已消耗 token 占比
2. 如果超过 `token_budget.warning_threshold`（默认 70%）:
   - **如果 `--yolo: true`：** 强制降级为 `warn_and_continue`（记录警告，继续执行），绝不暂停
   - `pause_and_report` → 暂停 Sprint，生成中间报告，等待用户决定
   - `warn_and_continue` → 记录警告，继续执行
   - `ignore` → 忽略

#### 7.7 Progress Reporting (Principle 17)

每次状态转换后，输出进度:
```
[3/8] Story 5-2: backlog → story-doc-review ✅ (Story Creator)
[3/8] Story 5-2: story-doc-review → ready-for-dev ✅ (Story Reviewer)
[3/8] Story 5-2: ready-for-dev → review ✅ (Dev Runner)
[3/8] Story 5-2: review → done ✅ (Review Runner — passed round 1)
```

**On Loop Complete:** 所有 Story 处理完毕，继续 Step 8

---

### Step 8: Per-Story Post-Processing

**Goal:** 在每个 Story 完成一个阶段后执行后处理逻辑 -- 首 Story 检查点、错误处理、经验记录、Git Squash（Principle 18, 25, 28, ADR-006）。

**Note:** 此步骤的逻辑嵌入在 Step 7 循环内部，每个 Story 完成一个 Agent dispatch 后执行。

#### 8.1 First-Story Checkpoint (Principle 18)

**在第一个 Story 完成所有阶段（达到 `done`）后触发:**

**YOLO 覆盖：** 当 `--yolo: true` 时，无论 `first_story_checkpoint` 配置为何值，均强制降级为 `report`（生成报告但不暂停），输出日志：`[YOLO] 首 Story 检查点降级为 report 模式，跳过用户确认`

| Checkpoint Mode | Behavior | Config Key |
|----------------|----------|-----------|
| `pause` (default) | 暂停 Sprint，展示第一个 Story 的完整质量报告，等待用户确认后继续 | `first_story_checkpoint: "pause"` |
| `report` | 生成质量报告，不暂停，继续执行 | `first_story_checkpoint: "report"` |
| `skip` | 不检查，全自动模式（高级用户） | `first_story_checkpoint: "skip"` |

**Pause 模式展示内容（仅当 `--yolo: false` 且 `pause` 模式时生效）:**
```
==========================================
First Story Checkpoint Report
==========================================
Story: 5-1 (用户认证)
Status: done ✅

Story Review:   Round 1 — passed
Dev:            TDD complete, 12 tests all passing
Code Review:    Round 1 — passed (0 findings)
E2E:            skipped (disabled)
Git Commits:    2 (docs + feat)

Quality Indicators:
- AC coverage:  5/5 ✅
- Test count:   12
- Scope violations: 0
- Knowledge queries: 1 (cache-hit)

Continue with remaining 7 stories? [Y/N]
==========================================
```

#### 8.2 Error Handling (Mark and Continue, ADR-006)

**当 Agent 返回失败状态时:**

1. **Mark and Continue 策略:**
   - 将 Story 标记为 `needs-intervention`
   - 记录错误详情到执行报告
   - **不终止 Sprint** — 继续处理队列中的下一个 Story
   - 理由: 一个 Story 的失败不应阻塞其他独立 Story 的进度

2. **Consecutive Failure Detection（Principle 29）:**
   - 维护连续失败计数器
   - 如果连续 `{dependency_detection.consecutive_failure_threshold}` 个 Story 失败（默认 3）:
     - **如果 `--yolo: true`：** 静默选择 Continue，重置计数器继续执行，输出日志：`[YOLO] 连续 {N} 个 Story 失败，自动继续执行剩余 Story`
     - **如果 `--yolo: false`（默认）：** 暂停 Sprint，展示失败列表，等待用户选择：
     ```
     ⚠️ Sprint Paused: 3 consecutive failures detected!

     Failed Stories:
     - 5-2: Dev Runner returned scope-violation
     - 5-3: Story Creator returned failure (Epic file not found)
     - 5-4: Dev Runner returned test-regression

     This may indicate a systemic issue. Review the errors before continuing.

     [C] Continue remaining stories
     [S] Stop sprint and generate report
     ```
   - 用户选择 C → 重置计数器，继续 / S → 执行 Step 9 → Step 9.5 (Final Git Commit) → Step 10

3. **Lessons Recording（U5 lessons-recording 内联执行, Principle 25 — 硬性义务，不可省略）:**
   - 对每个 Agent dispatch 返回值，执行以下文件操作步骤：
     a. **事件检测:** 按 U5 的 7 种 Trigger Conditions 检查 `agent_return`（包括兜底的 `general_agent_failure`）
     b. **如果检测到事件**，立即执行以下显式文件操作：
        ```
        i.   确定文件路径: _bmad-output/knowledge-base/lessons/_lessons-learned.md（相对于项目根目录）
        ii.  使用 Read tool 读取文件完整内容（如果文件不存在，使用 Write tool 创建并写入标题头）
        iii. 蒸馏错误上下文为 <= 2 行摘要，格式: - [YYYY-MM-DD] [phase-tag] 摘要. Ref: file/path:line
        iv.  去重检测: 与已有条目进行关键词匹配（phase tag + 关键词重叠 > 70% 视为重复）
        v.   将现有内容 + 新条目拼接，使用 Write tool 写回文件（Append-Only，绝不修改已有条目）
        vi.  写入验证: 使用 Read tool 重新读取文件，确认新条目出现在文件末尾
        vii. 输出确认日志: [LESSONS] {N} entries appended to _lessons-learned.md (total: {M} entries)
        ```
     c. **如果写入失败:** 输出 `[ERROR] Lessons recording failed: {reason}`，但不阻断 Sprint（Principle 2: 降级优于报错）
     d. **如果无匹配事件:** 跳过录制（正常情况，无需日志）

#### 8.3 Git Squash (Principle 28)

**当一个 Story 达到 `done` 状态时:**

| Strategy | Behavior | Config Key |
|----------|----------|-----------|
| `per_story` (default) | 将 Story 的所有 git commits 压缩为一个 clean commit | `git_squash_strategy: "per_story"` |
| `per_phase` | 每个阶段保留一个 commit | `git_squash_strategy: "per_phase"` |
| `none` | 保留所有 intermediate commits | `git_squash_strategy: "none"` |

**Per-Story Squash 流程:**
1. 识别该 Story 的所有 commit（通过 commit message 前缀匹配）
2. 执行 `git rebase` 将所有 commit 压缩为一个
3. Squash commit message:
   ```
   feat: Story {epic}.{story}: {title}

   - Story created and reviewed
   - TDD development complete ({test_count} tests)
   - Code review passed (round {review_round})
   ```
4. 如果 squash 失败（如 rebase 冲突）→ 记录错误，保留原始 commits（Principle 2: 降级优于报错）

#### 8.4 Git Track Cleanup (--auto-clear-git-track)

**当一个 Story 达到 `done` 状态且 `--auto-clear-git-track: true` 时:**

1. **扫描 Story 关联的 git track 文件:**
   - 根据 Story 文档中的 `file_scope` 声明定位 git track 文件
   - 匹配模式: `.sprint-session/git-track-{story_key}.*`

2. **清理操作:**
   - 删除已完成 Story 的 git track 临时文件
   - 保留 `.sprint-session/` 下其他 Story 的 track 文件
   - 记录清理结果到执行报告

3. **降级处理:**
   - 如果清理失败 → 记录警告，不影响 Sprint 继续（Principle 2: 降级优于报错）
   - 如果 `--auto-clear-git-track: false` → 跳过此步骤（注: config.yaml 默认值为 `true`）

---

### Step 9: Execution Summary

**Goal:** 生成 Sprint 执行报告，检查 Easter Eggs（Principle 17: 执行可见性）。

**Actions:**

1. **汇总执行结果:**
   ```yaml
   summary:
     session_id: "sprint-2026-02-07-001"
     epic_spec: "epic5"
     duration: "2h 15m"
     stories_total: 8
     stories_completed: 6
     stories_failed: 1
     stories_skipped: 1
     agent_dispatches: 24
     total_tests: 86
     total_commits: 12
     lessons_recorded: 2
   ```

2. **生成报告文件:**
   - 输出路径: `.sprint-session/execution-summary-{date}.md`
   - 报告结构:
     ```markdown
     # BSO Sprint Execution Summary

     **Session:** sprint-2026-02-07-001
     **Date:** 2026-02-07
     **Duration:** 2h 15m
     **Epic:** epic5

     ## Results Overview

     | Metric | Value |
     |--------|-------|
     | Stories Total | 8 |
     | Completed (done) | 6 |
     | Failed (needs-intervention) | 1 |
     | Skipped | 1 |

     ## Story Details

     | # | Key | Title | Final State | Agent Dispatches | Review Rounds | Tests |
     |---|-----|-------|------------|-----------------|---------------|-------|
     | 1 | 5-1 | 用户认证 | done ✅ | 4 | 1 | 12 |
     | 2 | 5-2 | 数据同步 | done ✅ | 6 | 2 | 15 |
     | ... |

     ## Failures

     ### Story 5-7: 报表导出
     - **State:** needs-intervention
     - **Failed At:** Dev Runner (C4, dev mode)
     - **Error:** Test suite compilation failure
     - **Lesson Recorded:** Yes

     ## Agent Performance

     | Agent | Dispatches | Success | Failure | Avg Duration |
     |-------|-----------|---------|---------|-------------|
     | Story Creator (C2) | 4 | 4 | 0 | 3m |
     | Story Reviewer (C3) | 4 | 3 | 1 | 2m |
     | Dev Runner (C4) | 8 | 7 | 1 | 12m |
     | Review Runner (C5) | 6 | 6 | 0 | 4m |
     | E2E Inspector (F2) | 0 | - | - | - |

     ## Configuration Used

     - Fix Level: medium
     - Max Review Rounds: 10
     - Story Review: enabled
     - E2E: disabled
     - Parallel: 1
     - Git Squash: per_story
     ```

3. **Easter Eggs Check 🎉:**
   - 全部 Story 一次通过（0 failures, 0 fix rounds）→ `🏆 PERFECT SPRINT! 全部 Story 一次通过，你是传说中的 10x 工程师吗？`
   - 超过 10 个 Story 完成 → `🎊 MEGA SPRINT! 一次性完成 {N} 个 Story，牛逼！`
   - 连续 3 个 Story 首轮 review 通过 → `🎯 HAT TRICK! 连续 3 个 Story 首轮 review 通过！`
   - Sprint 持续超过 4 小时 → `☕ MARATHON SPRINT! 超过 4 小时了，记得喝水休息！`

4. **控制台输出摘要:**
   ```
   ==========================================
   BSO Sprint Complete! 🚀
   ==========================================
   Session: sprint-2026-02-07-001
   Duration: 2h 15m
   Result: 6/8 stories completed ✅, 1 failed ❌, 1 skipped ⏭️

   Report: .sprint-session/execution-summary-2026-02-07.md
   ==========================================
   ```

**On Success:** 报告生成完毕，继续 Step 9.5
**On Failure:** 报告写入失败 → 仅在控制台输出摘要（降级处理）

---

### Step 9.5: Final Git Commit

**Goal:** Sprint 完成或中断退出前，将所有 Sprint 产出的文档文件提交到 Git（Principle 32: Mandatory Git Exit Gate + Principle 34: sprint-status.yaml Git 提交）。

**Actions:**

1. **收集待提交文件列表:**
   - `sprint-status.yaml`（最终状态）
   - `.sprint-session/execution-summary-{date}.md`（执行报告）
   - `.sprint-session/agent-sessions.yaml`（会话注册表，如存在）
   - `_bmad-output/knowledge-base/lessons/_lessons-learned.md`（如本次 Sprint 有更新）
   - 其他 `.sprint-session/*.md` 文件（review 报告等）

2. **过滤不存在的文件:**
   - 逐个检查文件是否存在，跳过不存在的文件
   - 如果所有文件都不存在 --> 跳过提交，输出日志 `[GIT] No files to commit, skipping Final Git Commit`

3. **执行 precise-git-commit (U3):**
   ```yaml
   workflow_call:
     target: "precise-git-commit"
     params:
       files: [上述已过滤的存在文件列表]
       message: "chore: BSO Sprint {session_id} complete — {stories_completed}/{stories_total} stories done"
       session_id: "{session_id}"
       commit_type: "sprint_final"
   ```

4. **降级处理（Principle 2）:**
   - 提交失败（如无变更、权限问题、git 冲突）--> 记录警告 `[WARN] Final Git Commit failed: {reason}`，不阻断退出流程
   - 部分文件 stage 失败 --> 提交剩余可 stage 的文件

**On Success:** Git 提交完成，继续 Step 10
**On Failure:** 记录警告日志，继续 Step 10（降级处理）

> **Note:** 本步骤同样适用于异常退出场景（用户在 Step 8.2 选择 [S] Stop sprint）。Stop 分支在跳到 Step 9 之前应先执行 Step 9.5，commit message 使用: `chore: BSO Sprint {session_id} stopped — partial results ({stories_completed}/{stories_total})`

---

### Step 10: Cleanup & Unlock

**Goal:** 释放 `.sprint-running` 互斥锁，清理会话临时文件（Principle 13）。

**Actions:**

1. **释放互斥锁（U2 concurrency-control, release 模式）:**
   - 调用 concurrency-control workflow:
     ```yaml
     mode: "release"
     project_root: "{project_root}"
     session_id: "{session_id}"
     ```
   - 处理返回值:
     - `released` → 锁释放成功
     - `failure` → 记录警告，锁可能残留（下次启动时会被 zombie detection 处理）

2. **清理临时文件:**
   - 删除 `.sprint-session/pending-writes.yaml`（如存在，运行时临时文件）
   - **保留:** `.sprint-session/execution-summary-{date}.md`（用户需要查阅）
   - **保留:** `.sprint-session/screenshots/`（E2E 证据）
   - **保留:** `.sprint-session/review-report-*.md`（review 报告）

3. **最终状态确认:**
   - 读取 sprint-status.yaml 最终状态
   - 确认所有状态写入正确
   - 输出最终状态摘要

**On Success:** Sprint 执行完毕，所有资源已释放
**On Failure:** 记录清理失败的警告，Sprint 仍视为完成

---

### User Bug Feedback Protocol (Post-Story Completion)

**Goal:** 当用户在 Story 完成后自行测试发现 Bug 时，提供结构化的"分诊 → 评估 → 修复 → 用户确认"路径。**调度器全程不参与业务分析**，仅负责消息传达和 Agent 调度。

**触发方式：** 用户在 Sprint 完成后（或中途暂停时）直接告知 AI 发现了 Bug（可以是单个 Bug、单 Story 多 Bug、或跨 Story 批量 Bug）。主控识别到 Bug 反馈意图后，进入此协议。

---

#### Agent 会话 ID 注册表（Principle 35 — 新增）

主控在 Step 7 执行循环中，每次通过 Task tool 调度 Agent 时，**必须记录返回的 Claude Code Agent 会话 ID**（即 Task tool 返回的 `agentId`），存储到 `.sprint-session/agent-sessions.yaml`：

```yaml
# .sprint-session/agent-sessions.yaml
sessions:
  "3-1":
    story_creator:
      agent_id: "a1b2c3d"
      timestamp: "2026-02-07T22:10:00Z"
    story_reviewer:
      agent_id: "e4f5g6h"
      timestamp: "2026-02-07T22:15:00Z"
    dev_runner:
      agent_id: "i7j8k9l"          # Bug 修复时优先 resume 此会话
      timestamp: "2026-02-07T22:30:00Z"
    review_runner:
      agent_id: "m0n1o2p"          # Bug 分诊/评估时优先 resume 此会话
      timestamp: "2026-02-07T22:45:00Z"
  "3-2":
    dev_runner:
      agent_id: "q3r4s5t"
      ...
```

**用途：** Bug 修复时优先 `resume` 恢复先前会话（保留完整上下文），仅当会话不可恢复时 fallback 为新起 Agent。

---

#### 执行流程

```
Phase 1: Bug 收集（调度器执行，纯机械操作）
===========================================

1.1 接收用户 Bug 报告：
    a. 调度器原样记录用户的 Bug 描述文本（不分析、不归类、不匹配 Story）
    b. 为每个 Bug 分配临时编号：BUG-{sequence}
    c. 将所有 Bug 描述写入临时文件：.sprint-session/pending-bugs.md
    d. 格式：
       ```markdown
       # Pending Bug Reports
       Session: {session_id}
       Reported: {timestamp}

       ## BUG-1
       用户原始描述：{user_raw_text_1}

       ## BUG-2
       用户原始描述：{user_raw_text_2}
       ...
       ```

Phase 2: Bug 分诊 + 评估（Review Agent 执行，调度器不参与）
==========================================================

2.1 调度 Review Runner 进行 Bug Triage（分诊）：
    a. 从 agent-sessions.yaml 查找最近的 Review Runner 会话 ID
    b. 优先 resume 恢复会话（保留先前代码审查的完整上下文）：
       ```yaml
       task_call:
         target: "bso-review-runner"
         resume: "{previous_review_agent_id}"    # Claude Code Agent ID
         params:
           mode: "bug-triage"                    # 新增模式：Bug 分诊
           session_id: "{session_id}"
           pending_bugs_path: ".sprint-session/pending-bugs.md"
           # Review Agent 需要的上下文由自己获取：
           # - 读取所有已完成 Story 的文件作用域声明
           # - 读取 sprint-status.yaml 中 done 状态的 Story 列表
           # - 读取代码变更历史（git log）
       ```
    c. 如果 resume 失败 → fallback 新起 Review Runner

2.2 Review Agent 内部执行（调度器不可见）：
    a. 读取 pending-bugs.md 中的所有 Bug 描述
    b. 读取所有 done 状态 Story 的文件作用域声明
    c. 对每个 Bug 执行分诊：
       - 根据 Bug 描述中的页面/功能/报错信息
       - 匹配对应 Story 的文件作用域和 AC
       - 分配 story_key
       - 如果无法确定归属 → 标记为 "unassigned"
    d. 对每个已分配的 Bug 执行评估：
       - 分析 Bug 的严重程度（critical / major / minor）
       - 评估可能的根因和影响范围
       - 记录 Bug 到对应 Story .md 文件的 `## Post-Completion Bug Reports` 章节
       - 生成修复建议（供 Dev Runner 参考）
    e. 执行 precise-git-commit (U3) 提交 Bug 记录
    f. 输出分诊报告：
       ```yaml
       triage_report:
         total_bugs: 5
         assigned:
           - bug_id: "BUG-1"
             story_key: "3-1"
             severity: "major"
             summary: "项目列表分页查询返回空数据"
             fix_suggestion: "ProjectService.queryPage 缺少默认分页参数"
           - bug_id: "BUG-2"
             story_key: "3-1"
             severity: "minor"
             summary: "项目名称列溢出截断"
             fix_suggestion: "CSS text-overflow 处理"
           - bug_id: "BUG-3"
             story_key: "3-3"
             severity: "critical"
             summary: "删除项目时未校验关联数据"
             fix_suggestion: "添加关联检查逻辑"
         unassigned:
           - bug_id: "BUG-4"
             reason: "无法确定归属 Story，可能是基础设施问题"
             user_action_required: "请补充更多信息或手动指定 Story"
         fix_queue:                          # 按 Story 分组 + 严重度排序的修复队列
           - story_key: "3-1"
             bugs: ["BUG-1", "BUG-2"]        # 同 Story 的 Bug 合并修复
           - story_key: "3-3"
             bugs: ["BUG-3"]
       ```

2.3 调度器接收分诊报告（纯机械处理）：
    a. 读取 triage_report（仅读 story_key 和 bug_id 的映射，不分析内容）
    b. 如果存在 unassigned Bug → 将 unassigned 列表展示给用户：
       ```
       以下 Bug 无法自动归属到 Story，请补充信息或手动指定：
       - BUG-4: {用户原始描述的前50字}
         [输入 Story key 手动分配] [跳过此 Bug]
       ```
    c. 用户手动分配后 → 追加到 fix_queue
    d. 为 fix_queue 中涉及的每个 Story：
       通过 U4 atomic-write 将状态从 `done` 变更为 `needs-fix`


Phase 3: 逐 Story 修复循环（调度器按队列调度）
==============================================

对 fix_queue 中的每个 Story 条目，按顺序执行：

3.1 调度 Dev Runner 修复（优先 resume）：
    a. 从 agent-sessions.yaml 查找该 Story 的 Dev Runner 会话 ID
    b. 优先 resume 恢复会话：
       ```yaml
       task_call:
         target: "bso-dev-runner"
         resume: "{previous_dev_agent_id}"    # Claude Code Agent ID
         params:
           story_key: "{story_key}"
           mode: "fix"
           session_id: "{session_id}"
           config_overrides:
             fix_source: "user-bug-report"
       ```
    c. 如果 resume 失败 → fallback 新起 Dev Runner
    d. Dev Runner 读取 Story .md 文件末尾的 Bug Reports 章节作为修复指令
       （Bug 详情和修复建议已由 Review Agent 在 Phase 2 写入）
    e. Dev Runner 完成修复后返回结果给调度器

3.2 调度器向用户报告修复结果（纯消息传达）：
    a. 将 Dev Runner 返回的修改摘要（files_modified, lines_changed, tests_added）
       原样展示给用户（调度器不解读内容，只转发）：
       ```
       ==========================================
       Story {story_key} Bug 修复完成，等待验证
       ==========================================
       修复的 Bug: {bug_ids}
       Dev Runner 报告:
       {dev_runner_results_summary}    ← 原样转发，不加工
       ==========================================
       请手动测试验证 Bug 是否已修复。

       [F] 全部修复确认通过
       [P] 部分修复，仍有问题（请描述）
       [N] 全部未修复（请描述）
       [V] 需要先进入 Code Review
       ```

3.3 用户反馈处理：
    - [F] 确认修复 → 进入 Phase 4 收尾（该 Story）
    - [P] 部分修复 → 用户描述剩余问题 → 新 Bug 追加到 Story Bug Reports →
          回到 3.1 重新派发 Dev Runner 修复
    - [N] 全部未修复 → 同 [P]，回到 3.1
    - [V] 需要 Review → 调度 Review Runner (C5) 代码审查：
          - 优先 resume 先前 Review 会话
          - Review passed → 返回 3.2 用户验证
          - Review needs-fix → 调度 Dev Runner fix → Review-Fix 循环（含渐进降级）
          - 循环结束后仍回到 3.2 用户验证
    - 主控建议触发 Review 的参考条件（仅展示提示，用户自行决定）：
          修改文件数 > 3 / 修改行数 > 50 / 有新增文件 / 涉及安全逻辑


Phase 4: Story 收尾（逐个 Story 完成后执行）
============================================

4.1 更新 Story 文件中的 Bug 记录：修复状态 → fixed
4.2 通过 U4 atomic-write 将 Story 状态恢复为 `done`
4.3 执行 precise-git-commit (U3)
4.4 更新 agent-sessions.yaml（记录本次修复的 Agent 会话 ID）
4.5 继续 fix_queue 中的下一个 Story → 回到 3.1

所有 Story 修复完成后，输出修复总结报告。
```

---

#### 多 Bug 修复队列规则

1. **同 Story 多 Bug：** 合并为一次 Dev Runner dispatch（Dev Runner 一次性修复该 Story 的所有 pending Bug）
2. **跨 Story 多 Bug：** 按 fix_queue 顺序串行处理（Story A 全部 Bug 修完 → Story B 全部 Bug 修完 → ...）
3. **修复顺序：** fix_queue 由 Review Agent 在分诊时按 Bug 严重度排序（critical → major → minor）
4. **新增 Bug：** 如果用户在验证某个 Story 时又发现了新 Bug（同 Story 或其他 Story），追加到队列末尾，不打断当前 Story 的修复流程

---

#### 调度器行为约束（强化 Principle 31）

在整个 Bug Feedback Protocol 中，调度器严格遵守以下约束：

| 允许 | 禁止 |
|------|------|
| ✅ 原样记录用户的 Bug 描述文本 | ❌ 分析 Bug 描述的技术含义 |
| ✅ 读取分诊报告的 story_key + bug_id 映射 | ❌ 解读 Bug 的严重度或修复建议 |
| ✅ 按 fix_queue 顺序调度 Agent | ❌ 自己判断 Bug 应该归属哪个 Story |
| ✅ 原样转发 Agent 返回的修复摘要给用户 | ❌ 对修复内容做评价或补充说明 |
| ✅ 展示用户选项（F/P/N/V）并路由 | ❌ 自己分析 Story 文件内容 |
| ✅ 调用 U4 变更状态（机械操作） | ❌ 自己写 Bug 记录到 Story 文件 |

**核心原则：** 调度器是邮递员，不是医生。它送信但不看信，它叫救护车但不做手术。

---

#### 安全约束

- Bug 修复仍然遵守 Dev Scope Guard（Principle 19）— 仅修改 Story 声明的文件
- Bug 修复仍然遵守 Fix Snapshot Protocol（Principle 20）— 快照测试数，防止回归
- 如果 Bug 涉及 Story 文件作用域之外的文件 → 记录警告，标记 `needs-intervention`
- **用户验证环节不可被 --yolo 跳过** — 这是用户参与的 Bug 修复流程，用户确认是流程完整性的一部分

---

## Error Handling Matrix

| # | Error Scenario | Detection Point | Severity | Action | Principle |
|---|---------------|----------------|----------|--------|-----------|
| E1 | .sprint-running exists (zombie) | Step 1 | Warning | Check PID+timestamp, stale → remove, active → abort | P13 |
| E2 | NL parsing ambiguous | Step 2 | Warning | Show parsed params, ask confirmation | P7, P9 |
| E3 | --check fails (missing deps) | Step 3 | Fatal | Report failures, abort sprint | P2 |
| E4 | sprint-status.yaml not found | Step 3 | Fatal | Search paths, not found → abort with guidance | P5 |
| E5 | Orphan state detected | Step 3 | Warning | Report orphans, offer recovery options | P12 |
| E6 | Epic ↔ Status mismatch | Step 3 | Warning | Report differences, auto-sync missing entries | P24 |
| E7 | No Stories in queue | Step 4 | Info | Report empty queue, suggest different epic-spec | P17 |
| E8 | File-overlap dependency detected | Step 4 | Info | Mark dependent Stories as blocked-by | P29 |
| E9 | Agent timeout | Step 7 | Fatal | Mark needs-intervention per agent_timeout_action config | P15 |
| E10 | Agent returns failure | Step 7/8 | Error | Mark and Continue, record lessons | ADR-006 |
| E11 | Agent returns scope-violation | Step 7 | Warning | Log warning, mark needs-intervention | P19 |
| E12 | Agent returns test-regression | Step 7 | Critical | Rollback fix, mark needs-intervention | P20 |
| E13 | Sensitive file in git commit | Step 7 | Critical | Block commit, log warning | P21 |
| E14 | Review round exceeds threshold | Step 7.5 | Warning | Progressive degradation (P22) | P22 |
| E15 | Token budget 70% exceeded | Step 7.6 | Warning | Pause and report per config | P26 |
| E16 | 3 consecutive failures | Step 8.2 | Critical | Sprint-level pause, ask user | P29 |
| E17 | Story review fails max rounds | Step 7 | Warning | Apply story_review_fallback config | P3, P7 |
| E18 | Knowledge research budget exhausted | Step 6/7 | Info | Log warning, continue without research | P3 |
| E19 | E2E browser MCP unavailable | Step 7 | Info | Degrade: Chrome → Playwright → skip E2E | P2 |
| E20 | Git squash conflict | Step 8.3 | Warning | Log error, keep individual commits | P28 |
| E21 | Parallel write queue crash | Step 7 | Error | Recover from pending-writes.yaml | P23 |
| E22 | First-Story checkpoint pause | Step 8.1 | Info | Wait for user, display quality report | P18 |
| E23 | Research Relay timeout | Step 7.4.R | Warning | 跳过超时的研究请求，resume Agent 时标注超时；不阻断 Sprint | P2, P33 |
| E24 | Research Relay resume 失败 | Step 7.4.R | Warning | Fallback 新建对话（P36），注入研究结果 + 上下文 | P36 |

### Timeout Configuration

| Agent | Timeout | Config Key |
|-------|---------|-----------|
| Story Creator (C2) | 900s (15 min) | `agent_timeout_seconds.story_creation` |
| Story Reviewer (C3) | 900s (15 min) | `agent_timeout_seconds.story_review` |
| Dev Runner (C4) | 1800s (30 min) | `agent_timeout_seconds.dev_execution` |
| Review Runner (C5) | 900s (15 min) | `agent_timeout_seconds.code_review` |
| E2E Inspector (F2) | 900s (15 min) | `agent_timeout_seconds.e2e_inspection` |
| Knowledge Researcher (F1) | 600s (10 min) | `agent_timeout_seconds.knowledge_research` |

---

## Parallel Execution (when parallel > 1)

### Parallel State Write Queue (Principle 23)

当 `parallel > 1` 时，多个 Agent 可能同时返回结果需要写入 sprint-status.yaml:

1. **Write Queue File:** `.sprint-session/pending-writes.yaml`
2. **序列化策略:** 所有 Agent 返回的状态更新请求排入队列，由 Orchestrator 串行执行 atomic-write
3. **队列格式:**
   ```yaml
   pending_writes:
     - story_key: "5-1"
       new_status: "story-doc-review"
       previous_status: "backlog"
       timestamp: "2026-02-07T22:31:00Z"
       agent: "Story Creator (C2)"
     - story_key: "5-2"
       new_status: "review"
       previous_status: "ready-for-dev"
       timestamp: "2026-02-07T22:31:05Z"
       agent: "Dev Runner (C4)"
   ```
4. **Crash Recovery:** 如果 Orchestrator 崩溃，下次启动时读取 pending-writes.yaml，重放未完成的写入

### Parallel Dispatch Rules

- 有依赖的 Story（`blocked_by` 非空）不能并行执行
- 同一 Story 的不同阶段不能并行执行
- 不同 Story 的相同阶段可以并行执行（如同时运行两个 C2）
- Agent dispatch 通过 Task tool 的并行子 Agent 实现

---

## Configuration Dependencies

本 command 依赖 `config.yaml` 中的以下配置项:

```yaml
# Role mapping (Agent dispatch)
role_mapping.story_creator_persona         # C2 Persona ID
role_mapping.story_reviewer_persona        # C3 Persona ID
role_mapping.dev_runner_persona            # C4 Persona ID
role_mapping.review_runner_persona         # C5 Persona ID
role_mapping.e2e_inspector_persona         # F2 Persona ID
role_mapping.knowledge_researcher_persona  # F1 Persona ID

# Workflow mapping (Skill call targets)
workflow_mapping.create_story              # C2 BMM workflow
workflow_mapping.dev_story                 # C4 BMM workflow
workflow_mapping.code_review               # C5 BMM workflow

# Defaults
defaults.parallel                          # Step 4/7: 并行度
defaults.review_strictness                     # Step 2/7: 审查严格度（strict/normal/lenient，内部转换为 review_strictness_threshold）
defaults.max_review_rounds                 # Step 7.5: Code Review 上限
defaults.max_story_review_rounds           # Step 7: Story Review 上限
defaults.story_review_enabled              # Step 7: Story Review 开关
defaults.story_review_fallback             # Step 7: Story Review 超限策略
defaults.first_story_checkpoint            # Step 8.1: 首 Story 检查点模式
defaults.auto_clear_git_track              # Step 8.4: Git track 清理
defaults.agent_timeout_seconds.*           # Step 7: 各 Agent 超时
defaults.agent_timeout_action              # Step 7: 超时处理策略
defaults.review_degradation.*              # Step 7.5: Review 渐进降级
defaults.token_budget.*                    # Step 7.6: Token 预算
defaults.dependency_detection.*            # Step 4/8.2: 依赖检测

# Knowledge research
knowledge_research.enabled                 # Step 6/7: 研究开关
knowledge_research.max_calls_per_story     # Step 6/7: 调用上限
knowledge_research.timeout_seconds         # Step 7: 超时

# E2E inspection
e2e_inspection.enabled                     # Step 7: E2E 开关

# Git
git_squash_strategy                        # Step 8.3: Squash 策略
git_commit_patterns.*                      # Step 7: Commit message 模板

# Status file
status_file_search_paths                   # Step 1/3: 状态文件路径
```

---

## Workflow Sequence Diagram

```
User                    Orchestrator (C1)                Agents            sprint-status.yaml
 |                              |                           |                      |
 |--- epic-spec + options ----→|                           |                      |
 |                              |                           |                      |
 |                      Step 1: Startup & Lock              |                      |
 |                        (U2 acquire)                      |                      |
 |                              |                           |                      |
 |                      Step 2: Intent Parsing              |                      |
 |                        (F3 NL / precise / interactive)   |                      |
 |←-- confirm params? ---------|                           |                      |
 |--- Y/M/N ----------------→|                           |                      |
 |                              |                           |                      |
 |                      Step 3: Environment & State         |                      |
 |                        (U1 health-check if --check)      |                      |
 |                        (U4 startup-check)                |------→ read --------→|
 |                              |                           |←------ status ------←|
 |                              |                           |                      |
 |                      Step 4: Queue Building              |                      |
 |                        (dependency scan P29)             |                      |
 |                              |                           |                      |
 |                      Step 5: Dry-Run Preview             |                      |
 |                        (if --dry-run → EXIT)             |                      |
 |                              |                           |                      |
 |                      Step 6: Pre-Research (optional)     |                      |
 |                              |--- F1 research batch ---→|                      |
 |                              |←-- cache results --------|                       |
 |                              |                           |                      |
 |                      Step 7: Execution Loop ◄──────────────────────────────┐    |
 |                        For each Story:                   |                  |    |
 |                        ├─ U4 pre-dispatch validation     |                  |    |
 |                        ├─ Dispatch Agent ──────────────→|                  |    |
 |                        |   (C2/C3/C4/C5/F2)             |                  |    |
 |                        ├─ Await return ←────────────────|                  |    |
 |                        ├─ U4 atomic-write ──────────────────────────→ write |    |
 |                        ├─ Token budget check (P26)      |                  |    |
 |                        └─ Step 8: Post-Processing ──────────────────────────┘    |
 |                             ├─ First-Story checkpoint (P18)                      |
 |                             ├─ Error handling (ADR-006)                          |
 |                             ├─ Lessons recording (U5)                            |
 |                             └─ Git squash (P28)                                  |
 |                              |                           |                      |
 |                      Step 9: Execution Summary           |                      |
 |                        (.sprint-session/summary.md)      |                      |
 |←-- Sprint Report ----------|                           |                      |
 |                              |                           |                      |
 |                      Step 10: Cleanup & Unlock           |                      |
 |                        (U2 release)                      |                      |
 |                              |                           |                      |
```

---

## Design Principles Applied

| # | Principle | Application in This Command |
|---|-----------|----------------------------|
| 1 | Agent dispatch 用 Skill Call | Step 7: 所有 Agent 通过 Skill Call 调度，参数最小化 |
| 2 | 降级优于报错 | Step 6: Pre-Research 失败时继续; Step 8.3: Squash 失败时保留原始 commits; E2E: Chrome → Playwright → skip |
| 3 | 预算控制一切 | Step 7.5: Review 渐进降级; Step 7.6: Token budget; Step 6: Research budget |
| 4 | 单一状态写入入口 | Step 7.4: 所有状态转换通过 U4 atomic-write，Agent 不直接写 sprint-status.yaml |
| 5 | 状态是唯一真实来源 | Step 7.1: 每次 dispatch 前通过 U4 验证状态 |
| 7 | 总有逃生通道 | Step 2: 用户可取消; Step 5: dry-run 退出; Step 8.1: 首 Story 暂停; Step 8.2: 连续失败暂停 |
| 8 | Headless Persona Loading | Step 7.3: 所有 Agent 以 headless 模式加载 BMM persona |
| 9 | NL 解析能力 | Step 2: 支持中英文自然语言输入 |
| 10 | 确认机制 | Step 2: NL 解析结果需用户确认 |
| 11 | 原子状态文件写入 | Step 7.4: temp file + rename via U4 |
| 12 | 孤儿状态检测 | Step 3: startup-check 扫描中间状态 Story |
| 13 | Zombie Lock 预防 | Step 1: PID + 时间戳双重验证 via U2 |
| 14 | BMM 集成契约 | Step 7.3: Agent 通过 Skill Call 的标准化接口调度 |
| 15 | 独立超时 | Step 7.4: 每个 Agent 有独立超时配置 |
| 16 | 知识容量管理 | Step 6: Pre-Research 批量预缓存; Step 7: 按 max_calls_per_story 控制调用上限 |
| 17 | 执行可见性 | Step 7.7: 每次状态转换输出进度; Step 9: 完整执行报告 |
| 18 | 首 Story 检查点 | Step 8.1: 可配置的 pause/report/skip |
| 19 | Dev Scope Guard | Step 7: C4 返回 scope-violation 时标记 needs-intervention |
| 20 | Fix-before-snapshot | Step 7: C4 fix 模式返回 test-regression 时标记 needs-intervention |
| 21 | Git Commit Safeguard | Step 7: 敏感文件检测由 C4/C2 内部的 U3 处理 |
| 22 | Review 渐进降级 | Step 7.5: Round 3/5/8 自动调整 review_strictness_threshold |
| 23 | 并行状态写入队列 | Step 7: parallel > 1 时通过 pending-writes.yaml 序列化 |
| 24 | Epic-Status 一致性检查 | Step 3: U4 startup-check 比对 Epic ↔ Status |
| 25 | Lessons 注入/记录 | Step 8.2: 失败时记录经验; 各 Agent 内部注入经验 |
| 26 | Token 预算监控 | Step 7.6: 70% 阈值暂停/警告/忽略 |
| 27 | 技术声明验证 | Step 7: C2/C3 内部验证 API 存在性 |
| 28 | Git Squash 策略 | Step 8.3: per_story / per_phase / none |
| 29 | 文件重叠依赖检测 | Step 4: 构建依赖图; Step 8.2: 连续失败阈值 |
| 30 | Review Persona 独立 | Step 7: C5 使用 Architect (Winston), C4 使用 Dev (Amelia) |
| 31 | Thin Dispatcher（薄调度器） | Step 7: Orchestrator 仅做状态→Agent映射→dispatch→读返回值→更新状态，严禁分析业务内容 |
| 32 | Mandatory Git Exit Gate | 所有 Agent 返回前必须执行 precise-git-commit (U3)，包括 Review Runner |
| 33 | Knowledge Researcher 独占研究权 | Agent 禁止直接调用 Context7/DeepWiki MCP，必须通过 Knowledge Researcher (F1) |
| 34 | sprint-status.yaml Git 提交 | Step 7.4: Orchestrator 在每次状态写入成功后提交 sprint-status.yaml 到 git |
| 35 | Agent 会话 ID 注册表 | Step 7: 每次 Agent dispatch 后记录 Claude Code Agent ID 到 agent-sessions.yaml，供 Resume 和 Bug 修复时使用 |
| 36 | Creator/Executor Resume, Reviewer Fresh | Step 7.3.F: 执行角色（C2 revise、C4 fix）被打回后 resume 上次会话保留上下文；审查角色（C3、C5）始终新建对话保持独立视角 |

---

_Command created on 2026-02-07 via BMAD workflow-builder (YOLO mode)_
_Updated on 2026-02-08: Added --yolo flag, Thin Dispatcher constraint (P31), Mandatory Git Exit Gate (P32), KR exclusive research (P33), User Bug Feedback Protocol_
_Source: auto-dev-sprint.spec.md + workflow-plan-auto-dev-sprint.md + config.yaml + all 16 BSO workflow files_
_This is the most complex file in BSO — the orchestrator's brain_
