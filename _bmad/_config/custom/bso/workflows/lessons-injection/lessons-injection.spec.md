---
name: lessons-injection
id: U6
type: utility
description: "Read accumulated lessons from _lessons-learned.md, filter by phase, sort by recency and relevance, inject top 10 entries into agent context"
module: bso
version: 1.0.0
agent: knowledge-researcher
status: validated
created: 2026-02-07
updated: 2026-02-07
---

# Workflow Specification: lessons-injection

**Module:** bso
**Status:** Validated -- Aligned with workflow.md v1.0.0
**Created:** 2026-02-07
**Updated:** 2026-02-07

---

## Workflow Overview

**Goal:** Read accumulated lessons and inject relevant ones into agent context at startup.

**Description:** Reads _lessons-learned.md, filters by current phase tag, sorts by recency + relevance, selects top N entries (budget, default 10 per Principle 25), and formats as `[LESSONS]` warning block for agent prompt injection. Paired with Lessons Recording (U5) as the "read side" of the BSO knowledge management system.

**Workflow Type:** Utility (U6)

**Workflow ID:** U6

---

## Primary Agent

Knowledge Researcher (`bso-knowledge-researcher`) -- executes injection as `lessons-inject` mode. Skips Persona Loading in this mode (deterministic data processing, no research judgment needed).

## Consumers

All BSO agents receive injected lessons at startup (step 3 of file-read protocol):

| Consumer Agent | Phase Tag | Invocation Context |
|---------------|-----------|-------------------|
| Story Creator (C2) | `story-creation` | Story 创建前注入经验 |
| Story Reviewer (C3) | `story-review` | Story 审查前注入经验 |
| Dev Runner (C4) | `dev-execution` | 开发执行前注入经验 |
| Review Runner (C5) | `code-review` | 代码审查前注入经验 |
| E2E Inspector (F2) | `e2e-inspection` | E2E 验证前注入经验 |

---

## Valid Phase Tags

| Tag | Description |
|-----|-------------|
| `story-creation` | Story 创建阶段（AC 编写、任务拆分陷阱） |
| `story-review` | Story 审查阶段（审查标准、常见质量问题） |
| `dev-execution` | 开发执行阶段（API 陷阱、框架用法、TDD 模式） |
| `code-review` | 代码审查阶段（常见 Bug 模式、安全问题） |
| `e2e-inspection` | E2E 验证阶段（浏览器兼容性、等待策略） |

---

## Input Schema

```yaml
inputs:
  required:
    story_key: "3-1"                          # Story 标识符
    mode: "lessons-inject"                    # 固定值
    session_id: "sprint-2026-02-07-001"       # Sprint 会话 ID
    lessons_inject:
      phase: "dev-execution"                  # 当前阶段标签
  optional:
    config_overrides:
      injection_budget: 10                    # 覆盖默认注入预算
    context_hints:                            # 上下文提示（用于相关性排序）
      framework: "vue-easytable"
      topic: "virtual scrolling"
```

### Input Validation Rules

| Field | Validation | On Failure |
|-------|-----------|------------|
| `story_key` | 匹配 `\d+-\d+` | 返回空注入（降级） |
| `mode` | 值为 `"lessons-inject"` | abort, status: "failure" |
| `session_id` | 非空字符串 | 返回空注入（降级） |
| `lessons_inject.phase` | 5 种有效 phase tag 之一 | 返回空注入（降级） |

---

## Output Schema (Return Value)

```yaml
return:
  status: "success" | "empty" | "failure"
  story_key: "3-1"
  mode: "lessons-inject"
  session_id: "sprint-2026-02-07-001"
  results:
    phase: "dev-execution"
    total_lessons_found: 25
    phase_filtered_count: 8
    injected_count: 8
    injection_block: |
      [LESSONS] dev-execution phase warnings:
      1. ...
  errors: []
```

---

## Planned Steps

| Step | Name | Goal |
|------|------|------|
| 1 | Locate Lessons File | 定位 `_lessons-learned.md` 文件，不存在则返回空注入 |
| 2 | Read and Parse Entries | 读取文件，解析所有 `- [date] [phase] summary` 格式的条目 |
| 3 | Phase Filter | 按当前阶段标签过滤条目 |
| 4 | Sort by Recency and Relevance | 按时间新旧排序，可选按 context_hints 相关性二次排序 |
| 5 | Apply Injection Budget | 截取前 N 条（默认 10，Principle 25） |
| 6 | Format Injection Block | 格式化为 `[LESSONS] {phase} phase warnings:` 块 |
| 7 | Return | 返回注入结果，格式与 Knowledge Researcher Agent 对齐 |

---

## Injection Budget

- Maximum 10 entries per injection (Principle 25)
- Prevents prompt token bloat when lessons accumulate
- Sorted by: newest first, then relevance to current framework/topic (via optional context_hints)
- Budget configurable via `config_overrides.injection_budget`

---

## Error Handling

| Error Scenario | Severity | Action | Status |
|---------------|----------|--------|--------|
| `_lessons-learned.md` 不存在 | Info | 返回空注入 | `empty` |
| 文件读取权限不足 | Warning | 返回空注入 | `empty` |
| 单条条目解析失败 | Warning | 跳过该条目，继续 | N/A |
| 文件完全无法解析 | Warning | 返回空注入 | `empty` |
| 零条目匹配 phase | Info | 返回空注入 | `empty` |
| 无效 phase tag | Warning | 返回空注入 | `empty` |
| injection_block 格式化失败 | Error | 返回空注入 | `failure` |

### Failure Isolation

本 workflow 的失败绝不阻断 Agent 启动。注入失败时 Agent 以零经验启动（正常运行，只是没有历史提示）。

### Timeout

无独立超时配置 -- 由调用方 Agent 的整体超时覆盖。

---

## Configuration Dependencies

```yaml
knowledge_research.knowledge_base_path       # _lessons-learned.md 所在目录
knowledge_research.enabled                    # 总开关
# injection_budget: 10 (implicit, Principle 25, overridable via config_overrides)
```

---

## Design Principles

| # | Principle | Application |
|---|-----------|-------------|
| 25 | Lessons 注入预算 | 每次注入最多 10 条 |
| 2 | 降级优于报错 | 文件不存在、零匹配均返回空注入 |
| 3 | 预算控制一切 | injection_budget 可配置 |
| 16 | 知识容量管理 | 与 U5 配合：U5 控制写入，U6 控制读取 |
| 8 | Headless Persona Loading | Knowledge Researcher headless 模式 |

---

_Spec created on 2026-02-07 via BMAD Module workflow_
_Updated on 2026-02-07 via bmad:bmb:workflows:workflow validate mode (YOLO) -- aligned with workflow.md v1.0.0_
