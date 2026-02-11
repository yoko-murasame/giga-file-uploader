> **Note:** 本文件为完整安装指南（详细版）。安装程序的机器可读入口位于 [`_module-installer/install.md`](./_module-installer/install.md)。

---
name: bso-install
module: bso
version: 1.0.0
description: "BSO Sprint Orchestrator 模块完整安装指南 — 依赖检查、文件部署、配置初始化、环境验证"
status: Implementation Ready
created: 2026-02-07
author: BMAD Architect
---

# BSO Module Installation Guide

> BSO (Sprint Orchestrator) 模块的完整安装流程 — 从依赖验证到环境健康检查，确保自治式 Sprint 引擎正确部署并可运行。

---

## Prerequisites（依赖检查）

BSO 模块依赖以下组件，安装前必须逐项验证。

### 必需依赖

| 依赖 | 最低版本 | 验证方式 | 说明 |
|------|---------|---------|------|
| BMAD Core | -- | `_bmad/core/` 目录存在且 Skill 机制可用 | 基础平台，提供 Agent 激活和 Skill 调用能力 |
| BMM Module | >= 1.0.0 | `_bmad/bmm/` 目录存在且包含所需 Agent + Workflow | BSO 通过 Skill 调用消费 BMM 的 Agent 和 Workflow |

#### BMAD Core 验证清单

- [ ] `_bmad/core/` 目录存在
- [ ] Skill 机制可用（能够执行 Skill 调用）
- [ ] 配置系统正常（core config 已初始化）

#### BMM Module 验证清单

BMM 必须提供以下 Agent Persona（供 BSO 的 `role_mapping` 引用）：

| BMM Agent Persona | BSO 使用方 | 验证路径 |
|-------------------|-----------|---------|
| `bmad:bmm:agents:sm` | Story Creator | BMM SM Agent 已安装 |
| `bmad:bmm:agents:pm` | Story Reviewer | BMM PM Agent 已安装 |
| `bmad:bmm:agents:dev` | Dev Runner / E2E Inspector | BMM Dev Agent 已安装 |
| `bmad:bmm:agents:architect` | Review Runner / Knowledge Researcher | BMM Architect Agent 已安装 |

BMM 必须提供以下 Workflow（供 BSO 的 `workflow_mapping` 引用）：

| BMM Workflow | BSO 使用方 | 验证路径 |
|-------------|-----------|---------|
| `bmad:bmm:workflows:create-story` | Story Creator | BMM create-story workflow 已安装 |
| `bmad:bmm:workflows:dev-story` | Dev Runner | BMM dev-story workflow 已安装 |
| `bmad:bmm:workflows:code-review` | Review Runner | BMM code-review workflow 已安装 |

### 可选依赖

| 依赖 | 用途 | 降级方案 |
|------|------|---------|
| Context7 MCP | Knowledge Researcher 查询框架/库官方文档 | 降级到 WebSearch + WebFetch |
| DeepWiki MCP | Knowledge Researcher 深度技术文档查询 | 降级到 WebSearch + WebFetch |
| Chrome MCP | E2E Inspector 浏览器控制 | 降级到 Playwright MCP |
| Playwright MCP | E2E Inspector 备选浏览器控制 | 若 Chrome MCP 也不可用则 E2E 功能禁用 |

> **降级原则（设计原则 #2）：** 非核心依赖缺失时优雅降级而非报错。MCP 工具不可用不会阻止安装，仅在运行时产生功能降级。

---

## Module Overview（模块简介）

**BSO (Sprint Orchestrator)** 是一个自治式 Sprint 开发引擎，通过状态机架构编排完整的 Story 生命周期 —— 从 backlog 到 done —— 实现零人工干预。

### 组件统计

| 组件类型 | 数量 | 说明 |
|---------|------|------|
| Agents | 10 | Story Creator, Story Reviewer, Dev Runner, Review Runner, E2E Inspector, Knowledge Researcher, Sprint Slave, Scrum Master, Debugger, E2E Live |
| Core Workflows | 5 | story-creation, story-review, dev-execution, code-review, slave-orchestration |
| Feature Workflows | 5 | knowledge-research, e2e-inspection, intent-parsing, interactive-guide, course-correction |
| Utility Workflows | 6 | health-check, concurrency-control, precise-git-commit, status-validation, lessons-recording, lessons-injection |
| Commands | 1 | auto-dev-sprint-team (Agent Team mode) |
| Config | 1 | config.yaml（用户可自定义配置） |
| **总计** | **28** | 10 + 16 + 1 + 1 |

### 状态机架构

```
backlog --> story-doc-review --> ready-for-dev --> review --> e2e-verify --> done
                  ^                                  ^
                  |                                  |
           story-doc-improved                   [fix loop]
```

7 个状态，10 个专用 Agent（含 4 个 V2 新增），通过 Orchestrator 命令统一调度。

---

## Installation Steps

### Step 1: Dependency Verification（依赖验证）

在安装任何文件之前，首先验证所有必需依赖。

```
执行检查流程：

1. 检查 BMAD Core 是否已安装
   → 验证 {project-root}/_bmad/core/ 目录存在
   → 验证 Skill 调用机制可用
   → 若不存在 → 终止安装，提示："BMAD Core 未安装。请先安装 BMAD Core 平台。"

2. 检查 BMM Module 是否已安装
   → 验证 {project-root}/_bmad/bmm/ 目录存在
   → 验证 BMM 版本 >= 1.0.0（读取 _bmad/bmm/module.yaml 中的 version 字段）
   → 验证 BMM Agent Persona 可用（sm, pm, dev, architect）
   → 验证 BMM Workflow 可用（create-story, dev-story, code-review）
   → 若不存在 → 终止安装，提示："BMM Module 未安装或版本不满足要求 (>= 1.0.0)。"

3. 检查可选依赖（仅记录状态，不阻止安装）
   → Context7 MCP: 可用 / 不可用（将降级到 WebSearch）
   → DeepWiki MCP: 可用 / 不可用（将降级到 WebSearch）
   → Chrome MCP: 可用 / 不可用
   → Playwright MCP: 可用 / 不可用
   → 若 Chrome + Playwright 均不可用 → 记录："E2E Inspector 将不可用"

4. 所有必需依赖验证通过 → 继续 Step 2
```

### Step 2: Directory Structure Creation（目录结构创建）

创建 BSO 模块所需的全部目录结构。

```
需要创建的目录：

{project-root}/
├── _bmad/bso/                          # BSO 模块主目录
│   ├── agents/                         # Agent 源文件存储
│   ├── workflows/                      # Workflow 源文件存储
│   │   ├── story-creation/
│   │   ├── story-review/
│   │   ├── dev-execution/
│   │   ├── code-review/
│   │   ├── slave-orchestration/
│   │   ├── knowledge-research/
│   │   ├── e2e-inspection/
│   │   ├── intent-parsing/
│   │   ├── interactive-guide/
│   │   ├── course-correction/
│   │   ├── health-check/
│   │   ├── concurrency-control/
│   │   ├── precise-git-commit/
│   │   ├── status-validation/
│   │   ├── lessons-recording/
│   │   └── lessons-injection/
│   └── commands/                       # Command 源文件存储
│
├── .claude/
│   ├── agents/                         # Agent 激活文件（若目录不存在则创建）
│   └── commands/bso/                   # BSO 命令目录
│
└── {output_folder}/
    └── knowledge-base/                 # Knowledge Base 目录（Step 7 详细处理）
        ├── frameworks/
        └── lessons/
```

> **注意：** `.claude/agents/` 和 `.claude/commands/` 可能已存在（由 BMAD Core 或 BMM 创建），仅在不存在时创建。

### Step 3: Agent Installation（Agent 安装）

将 10 个 Agent 文件从源目录复制到目标位置。每个 Agent 需要安装到两个位置：

1. **模块存储位置**：`_bmad/bso/agents/` — 源文件存档
2. **激活位置**：`.claude/agents/` — Claude Code 可识别的激活路径（文件名添加 `bso-` 前缀）

| # | Agent 文件 | 源路径 | 安装路径（激活） |
|---|-----------|--------|----------------|
| A1 | Story Creator | `src/modules/bso/agents/story-creator.md` | `.claude/agents/bso-story-creator.md` |
| A2 | Story Reviewer | `src/modules/bso/agents/story-reviewer.md` | `.claude/agents/bso-story-reviewer.md` |
| A3 | Dev Runner | `src/modules/bso/agents/dev-runner.md` | `.claude/agents/bso-dev-runner.md` |
| A4 | Review Runner | `src/modules/bso/agents/review-runner.md` | `.claude/agents/bso-review-runner.md` |
| A5 | E2E Inspector | `src/modules/bso/agents/e2e-inspector.md` | `.claude/agents/bso-e2e-inspector.md` |
| A6 | Knowledge Researcher | `src/modules/bso/agents/knowledge-researcher.md` | `.claude/agents/bso-knowledge-researcher.md` |
| A7 | Sprint Slave | `agents/sprint-slave.md` | `.claude/agents/bso-sprint-slave.md` |
| A8 | Scrum Master | `agents/scrum-master.md` | `.claude/agents/bso-scrum-master.md` |
| A9 | Debugger | `agents/debugger.md` | `.claude/agents/bso-debugger.md` |
| A10 | E2E Live | `agents/e2e-live.md` | `.claude/agents/bso-e2e-live.md` |

```
安装流程：

对于每个 Agent 文件（A1-A10）：
  1. 从模块源目录读取 Agent 文件
  2. 复制到 _bmad/bso/agents/{filename}（源文件存档）
  3. 复制到 .claude/agents/bso-{filename}（添加 bso- 前缀）
  4. 验证目标文件存在且内容完整

验证：
  → 确认 _bmad/bso/agents/ 下有 10 个 .md 文件
  → 确认 .claude/agents/ 下有 10 个 bso-*.md 文件
```

### Step 4: Workflow Installation（Workflow 安装）

将 16 个 Workflow 文件从源目录复制到模块目录。Workflow 按照功能分为三类。

#### Core Workflows（核心工作流 - 5 个）

| # | Workflow | 源路径 | 安装路径 |
|---|---------|--------|---------|
| C1 | story-creation | `src/modules/bso/workflows/story-creation/workflow.md` | `_bmad/bso/workflows/story-creation/workflow.md` |
| C2 | story-review | `src/modules/bso/workflows/story-review/workflow.md` | `_bmad/bso/workflows/story-review/workflow.md` |
| C3 | dev-execution | `src/modules/bso/workflows/dev-execution/workflow.md` | `_bmad/bso/workflows/dev-execution/workflow.md` |
| C4 | code-review | `src/modules/bso/workflows/code-review/workflow.md` | `_bmad/bso/workflows/code-review/workflow.md` |
| C5 | slave-orchestration | `src/modules/bso/workflows/slave-orchestration/workflow.md` | `_bmad/bso/workflows/slave-orchestration/workflow.md` |

#### Feature Workflows（功能工作流 - 5 个）

| # | Workflow | 源路径 | 安装路径 |
|---|---------|--------|---------|
| F1 | knowledge-research | `src/modules/bso/workflows/knowledge-research/workflow.md` | `_bmad/bso/workflows/knowledge-research/workflow.md` |
| F2 | e2e-inspection | `src/modules/bso/workflows/e2e-inspection/workflow.md` | `_bmad/bso/workflows/e2e-inspection/workflow.md` |
| F3 | intent-parsing | `src/modules/bso/workflows/intent-parsing/workflow.md` | `_bmad/bso/workflows/intent-parsing/workflow.md` |
| F4 | interactive-guide | `src/modules/bso/workflows/interactive-guide/workflow.md` | `_bmad/bso/workflows/interactive-guide/workflow.md` |
| F5 | course-correction | `src/modules/bso/workflows/course-correction/workflow.md` | `_bmad/bso/workflows/course-correction/workflow.md` |

#### Utility Workflows（工具工作流 - 6 个）

| # | Workflow | 源路径 | 安装路径 |
|---|---------|--------|---------|
| U1 | health-check | `src/modules/bso/workflows/health-check/workflow.md` | `_bmad/bso/workflows/health-check/workflow.md` |
| U2 | concurrency-control | `src/modules/bso/workflows/concurrency-control/workflow.md` | `_bmad/bso/workflows/concurrency-control/workflow.md` |
| U3 | precise-git-commit | `src/modules/bso/workflows/precise-git-commit/workflow.md` | `_bmad/bso/workflows/precise-git-commit/workflow.md` |
| U4 | status-validation | `src/modules/bso/workflows/status-validation/workflow.md` | `_bmad/bso/workflows/status-validation/workflow.md` |
| U5 | lessons-recording | `src/modules/bso/workflows/lessons-recording/workflow.md` | `_bmad/bso/workflows/lessons-recording/workflow.md` |
| U6 | lessons-injection | `src/modules/bso/workflows/lessons-injection/workflow.md` | `_bmad/bso/workflows/lessons-injection/workflow.md` |

```
安装流程：

对于每个 Workflow（C1-C5, F1-F5, U1-U6）：
  1. 确认目标子目录已创建（Step 2）
  2. 从模块源目录读取 workflow.md
  3. 复制到 _bmad/bso/workflows/{workflow-name}/workflow.md
  4. 验证目标文件存在且内容完整

验证：
  → 确认 _bmad/bso/workflows/ 下有 16 个子目录
  → 每个子目录包含 workflow.md 文件
  → Core: 5 个 | Feature: 5 个 | Utility: 6 个
```

### Step 5: Command Installation（命令安装）

将主入口命令安装到 Claude Code 可识别的命令目录。

| # | Command 文件 | 源路径 | 安装路径 |
|---|-------------|--------|---------|
| CMD1 | auto-dev-sprint-team | `src/modules/bso/commands/auto-dev-sprint-team.md` | `.claude/commands/bso/auto-dev-sprint-team.md` |

```
安装流程：

对于每个 Command 文件（CMD1）：
  1. 确认 .claude/commands/bso/ 目录已创建（Step 2）
  2. 从模块源目录读取对应 .md 文件
  3. 复制到 .claude/commands/bso/{filename}
  4. 同时备份到 _bmad/bso/commands/{filename}
  5. 验证目标文件存在且内容完整

安装后用户可通过以下方式调用：
  /bso:auto-dev-sprint-team <epic-spec> [options]      # Agent Team 模式
```

### Step 6: Configuration Initialization（配置初始化）

初始化 BSO 配置文件，提示用户填写自定义变量。

#### 6.1 用户配置变量收集

安装程序需要向用户收集以下配置变量（均有默认值，用户可直接回车跳过）：

| 变量名 | 提示信息 | 默认值 | 说明 |
|--------|---------|-------|------|
| `knowledge_base_path` | "Knowledge Base 存储路径？" | `{output_folder}/knowledge-base` | 知识库的根目录路径 |
| `e2e_enabled` | "启用 E2E 浏览器验证？（需要 Chrome MCP 或 Playwright MCP）" | `false` | 是否开启 E2E Inspector |
| `first_story_checkpoint` | "首个 Story 完成后的检查点模式？" | `pause` | pause / report / skip |
| `git_squash_strategy` | "Git 提交 squash 策略？" | `per_story` | per_story / per_phase / none |

#### 6.2 first_story_checkpoint 选项说明

| 选项 | 说明 | 适用场景 |
|------|------|---------|
| `pause` | 首个 Story 完成后暂停，等待用户质量确认 | 推荐新手使用 |
| `report` | 生成质量报告后继续执行，用户事后审阅 | 有经验的用户 |
| `skip` | 不暂停，全自治模式 | 信任模式 / 资深用户 |

#### 6.3 git_squash_strategy 选项说明

| 选项 | 说明 | 最终 Git 历史 |
|------|------|-------------|
| `per_story` | Story 完成后将所有中间提交 squash 为一个 | 每 Story 一个干净提交（推荐） |
| `per_phase` | 每个阶段保留一个提交（create/dev/review） | 每 Story 三个提交 |
| `none` | 保留所有中间提交（包括 fix 轮次） | 调试用途 |

#### 6.4 配置文件生成

```
安装流程：

1. 读取模块默认 config.yaml 模板
2. 向用户提示每个自定义变量（显示默认值）
3. 用户输入或接受默认值
4. 将用户选择的值填入 config.yaml
5. 将 Core Config 变量（user_name, communication_language, document_output_language, output_folder）
   从 BMAD Core 配置中自动注入
6. 写入 _bmad/bso/config.yaml
7. 同时复制 module.yaml 到 _bmad/bso/module.yaml
8. 验证配置文件语法正确（YAML 格式可解析）
```

### Step 7: Knowledge Base Setup（知识库初始化）

根据用户配置的 `knowledge_base_path` 创建知识管理目录结构。

```
{knowledge_base_path}/
├── index.yaml                          # 统一索引（模糊标签匹配）
├── _archived-index.yaml                # 归档索引（LRU 淘汰的条目）
├── frameworks/                         # 框架/库技术研究报告
│   └── .gitkeep
└── lessons/
    └── _lessons-learned.md             # 共享经验教训库
```

#### 7.1 index.yaml 初始化内容

```yaml
# BSO Knowledge Base Index
# 由 BSO Module Installer 自动生成
# 格式说明：参见 Knowledge Management System 文档

schema_version: 1
bso_module_version: "1.0.0"
created: "{install_date}"
max_entries: 200
cache_ttl_days: 30

entries: []
```

#### 7.2 _archived-index.yaml 初始化内容

```yaml
# BSO Knowledge Base — Archived Index
# LRU 淘汰的条目存储在此文件
# 条目可手动恢复到 index.yaml

schema_version: 1
archived_entries: []
```

#### 7.3 _lessons-learned.md 初始化内容

```markdown
# BSO Lessons Learned

> 由 BSO 自动记录的经验教训。每条不超过 2 行，包含可操作的建议和代码路径引用。
> 注入预算：每次 Agent 启动最多注入 10 条（按时间倒序 + 相关性排序）。

---

<!-- 格式示例：
### [日期] [阶段] [Story Key]
[1-2 行经验教训描述] | 代码路径: `path/to/file.ts`
-->
```

```
安装流程：

1. 解析 knowledge_base_path（将 {output_folder} 替换为实际路径）
2. 创建 knowledge-base/ 根目录
3. 创建 frameworks/ 子目录（含 .gitkeep）
4. 创建 lessons/ 子目录
5. 写入 index.yaml 初始内容
6. 写入 _archived-index.yaml 初始内容
7. 写入 lessons/_lessons-learned.md 初始内容
8. 验证所有文件和目录已正确创建
```

### Step 8: Post-Installation Health Check（安装后健康检查）

运行 BSO 内置的 health-check 工作流，验证安装完整性和环境就绪状态。

```
健康检查项目：

[文件完整性]
  → 检查 10 个 Agent 文件存在于 .claude/agents/
  → 检查 16 个 Workflow 文件存在于 _bmad/bso/workflows/
  → 检查 1 个 Command 文件存在于 .claude/commands/bso/
  → 检查 config.yaml 存在于 _bmad/bso/
  → 检查 module.yaml 存在于 _bmad/bso/

[依赖可用性]
  → BMAD Core: 可用 / 不可用
  → BMM Module: 可用 / 不可用 + 版本号
  → BMM Agents (sm/pm/dev/architect): 逐个验证
  → BMM Workflows (create-story/dev-story/code-review): 逐个验证

[知识库]
  → knowledge-base/ 目录存在
  → index.yaml 可读取且格式正确
  → _lessons-learned.md 存在
  → frameworks/ 目录存在

[运行环境]
  → Git 可用且仓库干净（无未提交变更）
  → sprint-status.yaml 可定位（搜索路径配置）
  → 无 .sprint-running 僵尸锁文件
  → 无孤立中间状态（orphan state 检测）

[MCP 工具（可选）]
  → Context7 MCP: 可用 / 降级到 WebSearch
  → DeepWiki MCP: 可用 / 降级到 WebSearch
  → Chrome MCP: 可用 / 不可用
  → Playwright MCP: 可用 / 不可用
  → E2E 总体状态: 可用 / 已禁用

[配置验证]
  → config.yaml YAML 语法正确
  → role_mapping 中引用的 BMM Agent 均存在
  → workflow_mapping 中引用的 BMM Workflow 均存在
  → knowledge_base_path 路径可访问
  → first_story_checkpoint 值合法 (pause/report/skip)
  → git_squash_strategy 值合法 (per_story/per_phase/none)

健康检查结果：
  ✅ 全部通过 → "BSO Module 安装成功，环境就绪！"
  ⚠️ 可选项不通过 → "BSO Module 安装成功，部分可选功能降级（详见报告）"
  ❌ 必需项不通过 → "BSO Module 安装不完整，请修复以下问题后重新运行 --check"
```

用户也可以在安装后随时通过以下命令手动触发健康检查：

```
/bso:auto-dev-sprint-team --check
```

---

## Configuration Reference（配置参考）

完整的 `config.yaml` 配置项说明。所有配置项均可在安装后手动编辑 `_bmad/bso/config.yaml` 修改。

### Role Mapping（角色映射）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `role_mapping.story_creator_persona` | `bmad:bmm:agents:sm` | Story Creator 使用的 BMM Agent Persona |
| `role_mapping.story_reviewer_persona` | `bmad:bmm:agents:pm` | Story Reviewer 使用的 BMM Agent Persona |
| `role_mapping.dev_runner_persona` | `bmad:bmm:agents:dev` | Dev Runner 使用的 BMM Agent Persona |
| `role_mapping.review_runner_persona` | `bmad:bmm:agents:architect` | Review Runner 使用的 BMM Agent Persona（与 Dev Runner 不同以保持审查独立性，设计原则 #30） |
| `role_mapping.e2e_inspector_persona` | `bmad:bmm:agents:dev` | E2E Inspector 使用的 BMM Agent Persona |
| `role_mapping.knowledge_researcher_persona` | `bmad:bmm:agents:architect` | Knowledge Researcher 使用的 BMM Agent Persona |

### Workflow Mapping（工作流映射）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `workflow_mapping.create_story` | `bmad:bmm:workflows:create-story` | Story 创建使用的 BMM Workflow |
| `workflow_mapping.dev_story` | `bmad:bmm:workflows:dev-story` | 开发执行使用的 BMM Workflow |
| `workflow_mapping.code_review` | `bmad:bmm:workflows:code-review` | 代码审查使用的 BMM Workflow |

### Defaults（默认参数）

| 配置键 | 默认值 | 可选值 | 说明 |
|--------|-------|-------|------|
| `defaults.parallel` | `1` | 正整数 | 最大并行任务数 |
| `defaults.max_review_rounds` | `10` | 正整数 | 代码审查最大轮次 |
| `defaults.max_story_review_rounds` | `3` | 正整数 | Story 审查最大轮次 |
| `defaults.review_strictness` | `normal` | strict / normal / lenient | 审查严格度 |
| `defaults.auto_clear_git_track` | `true` | true / false | 自动清理 Git 跟踪文件 |
| `defaults.story_review_enabled` | `true` | true / false | 是否启用 Story 审查阶段 |
| `defaults.story_review_fallback` | `ask_user` | ask_user / force_pass / skip_story | Story 审查失败后的回退策略 |
| `defaults.first_story_checkpoint` | `pause` | pause / report / skip | 首个 Story 完成后的检查点模式 |

### Agent Timeout（Agent 超时配置）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `defaults.agent_timeout_seconds.story_creation` | `900` (15 min) | Story 创建超时时间 |
| `defaults.agent_timeout_seconds.story_review` | `900` (15 min) | Story 审查超时时间 |
| `defaults.agent_timeout_seconds.dev_execution` | `1800` (30 min) | 开发执行超时时间（最大范围，含 TDD 全周期） |
| `defaults.agent_timeout_seconds.code_review` | `900` (15 min) | 代码审查超时时间 |
| `defaults.agent_timeout_seconds.e2e_inspection` | `900` (15 min) | E2E 检验超时时间 |
| `defaults.agent_timeout_seconds.knowledge_research` | `600` (10 min) | 知识研究超时时间（含网络延迟） |
| `defaults.agent_timeout_action` | `mark_needs_intervention` | mark_needs_intervention / retry_once / skip |

### Review Degradation（审查渐进降级）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `defaults.review_degradation.round_3` | `lower_strictness` | 第 3 轮后自动降低审查严格度 |
| `defaults.review_degradation.round_5` | `high_only` | 第 5 轮后仅修复 HIGH 级别问题 |
| `defaults.review_degradation.round_8` | `force_needs_intervention` | 第 8 轮后强制标记 needs-intervention |

### Token Budget（Token 预算）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `defaults.token_budget.enabled` | `true` | 是否启用 Token 预算追踪 |
| `defaults.token_budget.warning_threshold` | `0.7` | Token 使用率达到 70% 时触发 |
| `defaults.token_budget.action` | `pause_and_report` | pause_and_report / warn_and_continue / ignore |

### Dependency Detection（依赖检测）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `defaults.dependency_detection.mode` | `file_overlap` | file_overlap / none |
| `defaults.dependency_detection.consecutive_failure_threshold` | `3` | 连续 N 个 Story 失败时触发 Sprint 级暂停 |

### Knowledge Research（知识研究）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `knowledge_research.enabled` | `true` | 是否启用知识研究功能 |
| `knowledge_research.knowledge_base_path` | `{output_folder}/knowledge-base` | 知识库路径 |
| `knowledge_research.cache_ttl_days` | `30` | 缓存有效期（天） |
| `knowledge_research.max_calls_per_story` | `3` | 每 Story 最大研究调用次数 |
| `knowledge_research.timeout_seconds` | `600` | 单次研究超时时间 |
| `knowledge_research.cache_fuzzy_match` | `true` | 是否启用模糊标签匹配 |
| `knowledge_research.sources` | `[context7, deepwiki, web_search]` | 研究源优先级 |
| `knowledge_research.fallback_if_mcp_unavailable` | `web_search` | MCP 不可用时的回退源 |

### E2E Inspection（E2E 检验）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `e2e_inspection.enabled` | `false` | 是否启用 E2E 浏览器验证 |
| `e2e_inspection.mode` | `interactive` | interactive / semi-auto / full-auto |
| `e2e_inspection.environment.base_url` | `http://localhost:3100` | 测试环境基础 URL |
| `e2e_inspection.browser_tool.preferred` | `chrome_mcp` | 首选浏览器 MCP |
| `e2e_inspection.browser_tool.fallback` | `playwright_mcp` | 备选浏览器 MCP |
| `e2e_inspection.trigger_conditions` | `story_tags_include: [frontend, ui, web, page]` | E2E 触发条件 |

### Git Configuration（Git 配置）

| 配置键 | 默认值 | 说明 |
|--------|-------|------|
| `git_squash_strategy` | `per_story` | per_story / per_phase / none |
| `git_commit_patterns.story_created` | `docs: Story {epic}.{story}: {title} ...` | Story 创建提交模板 |
| `git_commit_patterns.dev_complete` | `feat: Story {epic}.{story}: {title}` | 开发完成提交模板 |
| `git_commit_patterns.review_complete` | `docs: Story {epic}.{story}: code review...` | 审查完成提交模板 |
| `git_commit_patterns.fix_complete` | `fix: Story {epic}.{story}: [review {round}]...` | 修复完成提交模板 |

---

## File Manifest（完整文件清单）

以下是 BSO 模块安装涉及的全部 28 个文件（27 个可执行组件 + 1 个配置文件），标注源路径和安装路径。

> 源路径基准：`_bmad-output/bmb-creations/src/modules/bso/`
> 安装路径基准：`{project-root}/`

### Agents（10 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 1 | Story Creator | `agents/story-creator.md` | `.claude/agents/bso-story-creator.md` |
| 2 | Story Reviewer | `agents/story-reviewer.md` | `.claude/agents/bso-story-reviewer.md` |
| 3 | Dev Runner | `agents/dev-runner.md` | `.claude/agents/bso-dev-runner.md` |
| 4 | Review Runner | `agents/review-runner.md` | `.claude/agents/bso-review-runner.md` |
| 5 | E2E Inspector | `agents/e2e-inspector.md` | `.claude/agents/bso-e2e-inspector.md` |
| 6 | Knowledge Researcher | `agents/knowledge-researcher.md` | `.claude/agents/bso-knowledge-researcher.md` |
| 7 | Sprint Slave | `agents/sprint-slave.md` | `.claude/agents/bso-sprint-slave.md` |
| 8 | Scrum Master | `agents/scrum-master.md` | `.claude/agents/bso-scrum-master.md` |
| 9 | Debugger | `agents/debugger.md` | `.claude/agents/bso-debugger.md` |
| 10 | E2E Live | `agents/e2e-live.md` | `.claude/agents/bso-e2e-live.md` |

### Core Workflows（5 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 11 | story-creation | `workflows/story-creation/workflow.md` | `_bmad/bso/workflows/story-creation/workflow.md` |
| 12 | story-review | `workflows/story-review/workflow.md` | `_bmad/bso/workflows/story-review/workflow.md` |
| 13 | dev-execution | `workflows/dev-execution/workflow.md` | `_bmad/bso/workflows/dev-execution/workflow.md` |
| 14 | code-review | `workflows/code-review/workflow.md` | `_bmad/bso/workflows/code-review/workflow.md` |
| 15 | slave-orchestration | `workflows/slave-orchestration/workflow.md` | `_bmad/bso/workflows/slave-orchestration/workflow.md` |

### Feature Workflows（5 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 16 | knowledge-research | `workflows/knowledge-research/workflow.md` | `_bmad/bso/workflows/knowledge-research/workflow.md` |
| 17 | e2e-inspection | `workflows/e2e-inspection/workflow.md` | `_bmad/bso/workflows/e2e-inspection/workflow.md` |
| 18 | intent-parsing | `workflows/intent-parsing/workflow.md` | `_bmad/bso/workflows/intent-parsing/workflow.md` |
| 19 | interactive-guide | `workflows/interactive-guide/workflow.md` | `_bmad/bso/workflows/interactive-guide/workflow.md` |
| 20 | course-correction | `workflows/course-correction/workflow.md` | `_bmad/bso/workflows/course-correction/workflow.md` |

### Utility Workflows（6 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 21 | health-check | `workflows/health-check/workflow.md` | `_bmad/bso/workflows/health-check/workflow.md` |
| 22 | concurrency-control | `workflows/concurrency-control/workflow.md` | `_bmad/bso/workflows/concurrency-control/workflow.md` |
| 23 | precise-git-commit | `workflows/precise-git-commit/workflow.md` | `_bmad/bso/workflows/precise-git-commit/workflow.md` |
| 24 | status-validation | `workflows/status-validation/workflow.md` | `_bmad/bso/workflows/status-validation/workflow.md` |
| 25 | lessons-recording | `workflows/lessons-recording/workflow.md` | `_bmad/bso/workflows/lessons-recording/workflow.md` |
| 26 | lessons-injection | `workflows/lessons-injection/workflow.md` | `_bmad/bso/workflows/lessons-injection/workflow.md` |

### Command（1 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 27 | auto-dev-sprint-team | `commands/auto-dev-sprint-team.md` | `.claude/commands/bso/auto-dev-sprint-team.md` |

### Configuration（1 个）

| # | 文件 | 源路径 | 安装路径 |
|---|------|--------|---------|
| 28 | config.yaml | `config.yaml` | `_bmad/bso/config.yaml` |

---

## Quick Start Guide（快速开始指南）

安装完成并通过 Health Check 后，按以下步骤开始使用 BSO。

### 1. 环境确认

```
/bso:auto-dev-sprint-team --check
```

确认所有必需组件显示绿色（通过）。

### 2. 准备 Sprint

确保以下条件满足：

- Epic 规格文件已创建（由 BMM 工作流或手动编写）
- `sprint-status.yaml` 已初始化，包含目标 Story 列表（状态为 `backlog`）
- Git 工作区干净（无未提交变更）

### 3. 首次运行（推荐使用交互引导模式）

```
/bso:auto-dev-sprint-team
```

不带任何参数运行，BSO 将启动交互式引导（Interactive Guide），逐步引导你选择：

1. 目标 Epic
2. 执行范围（哪些 Story）
3. 审查严格程度
4. 是否启用 E2E 验证

### 4. 日常使用（自然语言模式）

```
/bso:auto-dev-sprint-team 把 epic5 没完成的都跑了，严格审查
```

BSO 解析自然语言意图，确认参数后自动执行。

### 5. 精确参数模式（高级用户）

```
/bso:auto-dev-sprint-team epic3 --parallel 2 --review-strictness strict --max-review-rounds 5
```

### 6. 仅干运行（预览模式）

```
/bso:auto-dev-sprint-team epic3 --dry-run
```

预览执行队列而不实际运行。

### 7. 查看执行结果

Sprint 完成后，检查以下位置：

| 位置 | 内容 |
|------|------|
| `sprint-status.yaml` | 每个 Story 的最终状态 |
| `.sprint-session/` | 本次执行的详细报告 |
| `knowledge-base/index.yaml` | 新增的知识研究条目 |
| `knowledge-base/lessons/_lessons-learned.md` | 新增的经验教训 |

---

## Troubleshooting（常见问题排解）

### Q1: 安装后 `--check` 报告 BMM Agent 不可用

**症状：** Health Check 显示 `bmad:bmm:agents:sm` 等 Agent 不可用。

**原因：** BMM 模块未正确安装，或 Agent 文件路径与 BSO 期望的不一致。

**解决方案：**
1. 确认 `_bmad/bmm/` 目录存在
2. 确认 BMM 的 Agent 文件已安装到 `.claude/agents/` 目录
3. 检查 `config.yaml` 中 `role_mapping` 的值是否与 BMM 的实际 Agent 标识符一致
4. 重新运行 BMM 安装程序

### Q2: Knowledge Base 目录不存在或 index.yaml 格式错误

**症状：** 运行时 Knowledge Researcher 报错找不到 index.yaml。

**原因：** 安装 Step 7 未正确执行，或用户手动修改了 `knowledge_base_path` 后未创建对应目录。

**解决方案：**
1. 检查 `config.yaml` 中 `knowledge_research.knowledge_base_path` 的值
2. 确认该路径指向的目录存在
3. 确认目录内有 `index.yaml`、`frameworks/`、`lessons/` 子目录
4. 若缺失，手动重新执行 Step 7 的目录和文件创建

### Q3: `.sprint-running` 僵尸锁导致无法启动 Sprint

**症状：** 运行 auto-dev-sprint 时提示 "另一个 Sprint 正在运行"，但实际没有。

**原因：** 上一次 Sprint 异常退出未清理锁文件。

**解决方案：**
1. 检查 `{project-root}/.sprint-running` 文件是否存在
2. 查看文件内容（包含 PID + 时间戳），确认对应进程是否已不存在
3. 手动删除 `.sprint-running` 文件
4. 重新运行 Sprint

### Q4: Agent 超时被标记为 needs-intervention

**症状：** Story 状态被标记为 `needs-intervention`，执行报告显示 "timeout"。

**原因：** Agent 执行时间超过配置的 `agent_timeout_seconds` 阈值。

**解决方案：**
1. 检查 `config.yaml` 中对应 Agent 的超时时间是否合理
2. 对于复杂 Story（大量代码变更），可适当增大 `dev_execution` 超时值
3. 检查是否有网络延迟导致 Knowledge Researcher 超时（增大 `knowledge_research` 值）
4. 排除后重新运行受影响的 Story

### Q5: Git 提交包含不应提交的敏感文件

**症状：** 代码审查发现 `.env` 或凭证文件被提交。

**原因：** `precise-git-commit` 工作流的敏感文件检测未生效。

**解决方案：**
1. 确认 `_bmad/bso/workflows/precise-git-commit/workflow.md` 已正确安装
2. 检查项目 `.gitignore` 是否包含 `.env`、`credentials.*`、`*.key` 等模式
3. 手动撤销包含敏感文件的提交：`git reset HEAD~1 --soft`
4. 将敏感文件加入 `.gitignore` 后重新提交

### Q6: E2E Inspector 报错 "Browser tool not available"

**症状：** 启用 E2E 后，Inspector 无法启动浏览器。

**原因：** Chrome MCP 和 Playwright MCP 均不可用。

**解决方案：**
1. 安装 Chrome MCP 或 Playwright MCP
2. 确认 MCP 工具在 Claude Code 中可用
3. 或者在 `config.yaml` 中设置 `e2e_inspection.enabled: false` 跳过 E2E 阶段

### Q7: Sprint 运行后 sprint-status.yaml 找不到

**症状：** BSO 报错无法定位 sprint-status.yaml。

**原因：** 状态文件不在默认搜索路径中。

**解决方案：**
1. 确认 `sprint-status.yaml` 的实际位置
2. 使用 `--status-file <path>` 参数指定路径
3. 或修改 `config.yaml` 中的 `status_file_search_paths` 添加自定义路径

---

## Uninstallation（卸载步骤）

按以下步骤完全卸载 BSO 模块。

### Step 1: 停止运行中的 Sprint

```
确认步骤：
1. 检查是否存在 .sprint-running 锁文件
2. 若存在，等待 Sprint 完成或手动终止
3. 删除 .sprint-running 文件
```

### Step 2: 移除 Agent 激活文件

```
删除以下文件：
  .claude/agents/bso-story-creator.md
  .claude/agents/bso-story-reviewer.md
  .claude/agents/bso-dev-runner.md
  .claude/agents/bso-review-runner.md
  .claude/agents/bso-e2e-inspector.md
  .claude/agents/bso-knowledge-researcher.md
  .claude/agents/bso-sprint-slave.md
  .claude/agents/bso-scrum-master.md
  .claude/agents/bso-debugger.md
  .claude/agents/bso-e2e-live.md
```

### Step 3: 移除 Command 文件

```
删除以下文件和目录：
  .claude/commands/bso/auto-dev-sprint-team.md
  .claude/commands/bso/                     （若目录为空则删除）
```

### Step 4: 移除模块目录

```
删除以下目录（递归）：
  _bmad/bso/                                 （包含所有 Agent、Workflow、Config 源文件）
```

### Step 5: Knowledge Base 处理（可选）

> **注意：** Knowledge Base 包含有价值的技术研究报告和经验教训。建议保留或备份。

```
若决定删除：
  删除 {knowledge_base_path}/ 目录（包含 index.yaml、frameworks/、lessons/）

若决定保留：
  Knowledge Base 可独立于 BSO 模块存在，不影响其他模块运行
```

### Step 6: 清理运行时文件

```
删除以下运行时产物（若存在）：
  .sprint-running                            （并发锁文件）
  .sprint-session/                           （会话报告目录）
  .sprint-session/pending-writes.yaml        （并行写入队列）
```

### Step 7: 验证卸载完成

```
验证检查：
  → .claude/agents/ 下无 bso-*.md 文件
  → .claude/commands/bso/ 目录不存在
  → _bmad/bso/ 目录不存在
  → .sprint-running 文件不存在
  → .sprint-session/ 目录不存在
```

---

## Appendix: Installation Checklist（安装检查清单）

安装人员可使用此清单逐项确认安装完整性：

- [ ] Step 1: BMAD Core 已安装且可用
- [ ] Step 1: BMM Module >= 1.0.0 已安装且 Agent/Workflow 可用
- [ ] Step 2: 所有目录结构已创建
- [ ] Step 3: 10 个 Agent 文件已安装到 `.claude/agents/`（bso- 前缀）
- [ ] Step 3: 10 个 Agent 文件已备份到 `_bmad/bso/agents/`
- [ ] Step 4: 5 个 Core Workflow 已安装
- [ ] Step 4: 5 个 Feature Workflow 已安装
- [ ] Step 4: 6 个 Utility Workflow 已安装
- [ ] Step 5: auto-dev-sprint-team.md 已安装到 `.claude/commands/bso/`
- [ ] Step 6: config.yaml 已生成且用户变量已填充
- [ ] Step 6: module.yaml 已复制到 `_bmad/bso/`
- [ ] Step 7: knowledge-base/ 目录结构已创建
- [ ] Step 7: index.yaml 已初始化
- [ ] Step 7: _lessons-learned.md 已初始化
- [ ] Step 8: Health Check 全部通过（或仅可选项降级）

---

_BSO Module Installation Guide v1.0.0_
_Created: 2026-02-07 | Author: BMAD Architect_
_Module: BSO Sprint Orchestrator — Autonomous Sprint Development Engine_
_Status: Implementation Ready_
