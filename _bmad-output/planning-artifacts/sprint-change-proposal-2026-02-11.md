# Sprint Change Proposal

**Project:** giga-file-uploader
**Date:** 2026-02-11
**Author:** Bob (Scrum Master)
**Status:** Approved

## Section 1: Issue Summary

### Problem Statement

Epic 3 的 Story 规划中存在缝隙：上传按钮（底部操作栏 UploadActionBar）没有被任何 Story 明确负责实现。

- **Story 3.3** 的 AC 假设上传按钮已存在（"用户点击上传按钮，uploadStore 触发 startUpload action"），但该 Story 聚焦于 Rust 侧上传引擎
- **Story 5.1** 才描述底部操作栏的布局（"上传按钮左侧显示保留期选择控件"），但属于 Epic 5

结果：Epic 3 全部标记为 done，后端 `uploadStore.startUpload(lifetime)` 已完整实现，但前端 `UploadPage.tsx` 无任何按钮触发上传。核心流程"拖入文件 -> 点上传 -> 拿链接"无法端到端跑通。

### Discovery Context

在 Sprint 回顾中检查 Epic 3 完成度时发现。通过代码审查确认 `UploadPage.tsx` 只包含 `<FileDropZone>` 和 `<UploadFileList>`，缺少触发入口。

## Section 2: Impact Analysis

### Epic Impact

| Epic | 影响 | 说明 |
|------|------|------|
| Epic 3 | 状态回退 in-progress | 新增 Story 3.7，Epic 3 暂不能标记 done |
| Epic 4 | 无影响 | 不依赖上传按钮 |
| Epic 5 | Story 5.1 AC 微调 | 底部操作栏由 3.7 创建，5.1 只需增加保留期下拉选择器 |

### Artifact Conflicts

| Artifact | 冲突 | 处理 |
|----------|------|------|
| PRD | 无冲突 | FR 覆盖无缺口，按钮是 UI 实现层面遗漏 |
| Architecture | 无冲突 | 已预见 `UploadActions.tsx` 组件 |
| UX Design | 无冲突 | 底部操作栏设计已存在 |
| sprint-status.yaml | 需更新 | 已执行：Epic 3 回退 in-progress，新增 3.7 条目 |
| epics.md | 需更新 | 已执行：新增 Story 3.7，修改 Story 5.1 AC |

### Technical Impact

- 代码变更范围极小：新增 1 个 React 组件 `UploadActionBar.tsx`
- 后端无变更：`uploadStore.startUpload()` 已就绪
- 不影响任何已完成的代码

## Section 3: Recommended Approach

### Selected Path: Direct Adjustment（直接调整）

在 Epic 3 末尾新增 Story 3.7 "底部操作栏与上传触发按钮"，在 Epic 4 开始前完成。

**Rationale:**
- 工作量 Low：仅 1 个前端组件，后端已就绪
- 风险 Low：不涉及架构变更，不影响已完成工作
- 保留期暂用默认值 7 天硬编码，Story 5.1 再替换为下拉选择器
- 让核心上传流程可以端到端验证

**Alternatives Considered:**
- Rollback: 不适用，无需回滚
- MVP Review: 不需要，缺口很小

## Section 4: Detailed Change Proposals

### Change 1: epics.md — 新增 Story 3.7

在 Epic 3 Story 3.6 之后追加完整的 Story 3.7 定义，包含 6 组 BDD AC，覆盖：有文件时按钮可用+文件统计、空队列时按钮禁用、点击触发上传、上传中防重复点击、全部完成后清空列表+完成统计。

**Status:** Applied

### Change 2: sprint-status.yaml — 新增 Story 3.7 条目 + Epic 3 状态回退

- Epic 3 状态从 `done` 回退为 `in-progress`
- 新增 `3-7-upload-action-bar-and-trigger-button: backlog`

**Status:** Applied

### Change 3: epics.md — Story 5.1 AC 修改

将 Story 5.1 第一组 AC 中"查看底部固定区域"改为"查看底部固定区域（UploadActionBar，已由 Story 3.7 实现）"，明确 5.1 只负责增加保留期下拉选择器。

**Status:** Applied

### Change 4: Story 3.7 增加文件统计显示

底部操作栏左侧显示文件统计："N 个文件，X.X GB"（对齐 Excalidraw 线框图 Screen 2 的 "3 files, 3.2 GB total"）。

**Status:** Applied

### Change 5: Story 3.7 增加清空列表功能

全部上传完成后：左侧统计变为"N 个文件上传完成"（对齐线框图 Screen 4），[开始上传] 按钮替换为 [清空列表] 按钮，点击后回到初始拖拽区状态。

**Status:** Applied

## Section 5: Implementation Handoff

### Change Scope: Minor

可由开发团队直接实现，无需 PM/Architect 介入。

### Handoff Plan

| Role | 责任 |
|------|------|
| Scrum Master (Bob) | 创建 Story 3.7 文件（通过 create-story 工作流） |
| Developer (Dev agent) | 实现 UploadActionBar.tsx 组件 |
| Code Reviewer | 审查 Story 3.7 实现 |

### Success Criteria

- [ ] `UploadActionBar.tsx` 组件创建并集成到 `UploadPage.tsx`
- [ ] 底部左侧显示文件统计（文件数 + 总大小）
- [ ] 用户可以通过底部按钮触发上传
- [ ] 空队列时按钮禁用
- [ ] 上传中按钮不可重复点击
- [ ] 全部完成后显示"N 个文件上传完成" + [清空列表] 按钮
- [ ] 清空后回到初始拖拽区状态
- [ ] Epic 3 所有 Story 完成后状态恢复为 done

## Section 6: Process Improvement - UX Compliance Warning

### Problem Identified

在 Epic 1-3 的实施过程中，开发产出未严格遵循 UX 设计规范（Excalidraw 线框图 + UX Design Specification）。具体表现：

1. **底部操作栏缺失**: 线框图 Screen 2 明确标注了底部操作栏（文件统计 + 上传按钮），但无 Story 负责实现
2. **文件统计缺失**: 线框图标注 "3 files, 3.2 GB total"，未被纳入任何 Story 的 AC
3. **完成后流程断裂**: 线框图 Screen 4 标注 "3 files uploaded successfully"，但 Story 规划中全部完成后没有回到初始状态的路径
4. **UX 设计文档自身的 Flow Optimization 原则**（"零死胡同：任何状态下用户都有明确的下一步操作"）也未被充分落实

### Root Cause

- Story 创建阶段未将 Excalidraw 线框图作为必须对照的输入源
- UX 设计规范中的交互细节（统计信息、状态流转）在拆分为 Story AC 时被遗漏
- Code Review 阶段未将 UX 合规性作为检查项

### Corrective Actions

**For Story Creation (SM agent):**
- 创建 Story 时必须打开对应的 Excalidraw 线框图逐屏对照，确保每个可见 UI 元素都被 AC 覆盖
- 特别关注：状态流转的完整闭环（初始 -> 操作中 -> 完成 -> 回到初始）

**For Development (Dev agent):**
- 实现前必须阅读 UX Design Specification 中对应组件的描述
- 实现后自查：当前页面视觉是否与线框图一致

**For Code Review (Reviewer):**
- 新增 UX 合规性检查项：组件是否与 Excalidraw 线框图匹配
- 检查状态流转是否完整（无死胡同）
