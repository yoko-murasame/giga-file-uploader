# Sprint 变更提案

**日期**: 2026-02-12
**项目**: giga-file-uploader
**提交人**: John (PM) / Shaoyoko
**变更范围**: Minor — 开发团队直接实施

---

## 1. 问题摘要

全部 5 个 Epic 实施完成后，在实际使用测试中发现 7 个需要修正和增强的事项，涵盖 Bug 修复、实现偏差、遗漏需求和新增功能。所有变更均不影响 MVP 范围和核心架构，属于交付前打磨阶段的直接调整。

---

## 2. 影响分析

### 2.1 Epic 影响

- **无 Epic 级别变更**：不需要新增、删除或重排 Epic
- 所有变更可作为独立的修复/增强 Story 在现有 Epic 框架下实施

### 2.2 制品冲突

- **PRD**: 无冲突。变更 #2（速度显示）为新增增强功能，PRD 未覆盖但不与现有需求矛盾
- **架构文档**: 无冲突。变更 #3（进度粒度）实际是**回归到架构设计意图**（文档要求 128KB 粒度，实现为 100MB 粒度）
- **UX 设计**: 无冲突。变更 #7（操作栏固定底部）是回归到 UX 规范要求

### 2.3 技术影响

- 变更 #3 涉及 reqwest 流式上传 API 改造，需要确保 Content-Length 和 multipart 表单兼容性
- 变更 #2 依赖变更 #3 完成后才有意义（速度计算需要细粒度的进度数据）

---

## 3. 推荐方案

**路径: 直接调整（Direct Adjustment）**

理由：
- 所有 Epic 已完成，变更属于打磨和修复阶段
- 不涉及 Epic 级别的重新规划
- 不需要回滚任何已完成工作
- MVP 范围不变

---

## 4. 详细变更提案

### 变更 #1: 应用图标替换

| 字段 | 内容 |
|------|------|
| **类型** | 遗漏需求 |
| **工作量** | Low |
| **风险** | Low |
| **依赖** | 无 |

**问题**: 当前 `src-tauri/icons/` 下的图标为 Tauri 默认占位符（32x32.png 仅 104 字节）。根目录下有候选图标 `icon_candidate.png`（640x640，25KB）和 `icon_candidate.svg`（2.6KB）。

**注意**: `icon_candidate.png` 实际为 JPEG 格式（扩展名错误），直接用 `pnpm tauri icon` 会报 `Invalid PNG signature` 错误。

**方案**:
1. 使用 `sips -s format png icon_candidate.png --out icon_source.png` 转换为真正的 PNG
2. 执行 `pnpm tauri icon icon_source.png` 生成所有所需尺寸（32x32, 128x128, 128x128@2x, icon.ico, icon.icns）

**影响文件**:
- `src-tauri/icons/` 下所有图标文件（替换）

---

### 变更 #2: 每个任务的实时上传速度显示

| 字段 | 内容 |
|------|------|
| **类型** | 新功能需求（PRD/UX 未涵盖） |
| **工作量** | Medium |
| **风险** | Low |
| **依赖** | 变更 #3 必须先完成 |

**问题**: 用户上传时无法看到每个文件的实时传输速度，缺乏上传性能的直观感知。

**方案**:
1. **Rust 进度聚合器** (`services/progress.rs`): 在 50ms 定时器中，使用采样差值算法计算每个 taskId 的瞬时速度（bytes/sec）
2. **数据模型** (`models/upload.rs`): 进度结构体新增 `speed: u64` 字段
3. **事件 payload**: `upload:progress` 事件新增 `speed` 字段
4. **前端 UI** (`UploadFileItem.tsx`): 显示格式化速度（如 `12.5 MB/s`）

**设计要点（多线程场景）**:
- 最多 8 个并发 chunk 上传线程同时写入同一个 `AtomicU64` 计数器
- 速度 = 聚合后的总字节增量，天然包含所有并发线程的贡献
- 使用滑动窗口或最近 N 个采样点平均，避免瞬时波动

**影响文件**:
- `src-tauri/src/services/progress.rs`（速度计算 + payload 扩展）
- `src-tauri/src/models/upload.rs`（结构体新增字段）
- `src/components/upload/UploadFileItem.tsx`（速度显示）
- `src/stores/uploadStore.ts`（状态结构扩展）

---

### 变更 #3: 进度汇报 128KB 流式更新

| 字段 | 内容 |
|------|------|
| **类型** | 实现偏差（与架构设计不一致） |
| **工作量** | Medium |
| **风险** | Medium |
| **依赖** | 无 |

**问题**: 架构文档要求每 128KB 更新进度计数器，但当前实现在 `upload_engine.rs:315-318` 和 `upload_engine.rs:397-400` 中，`fetch_add` 仅在整个 100MB chunk 上传完成后才调用。对于 2.9G 文件（33 个 chunks），每个 chunk 上传期间（10-30 秒）进度条完全静止。

**当前实现**:
```
开始上传 100MB chunk → 等待 10-30 秒 → chunk 完成 → fetch_add(104_857_600)
```

**目标实现**:
```
每发送 128KB → fetch_add(131_072) → 50ms debounce 聚合 → emit("upload:progress")
```

**方案**:
1. **API 层改造** (`api/v1.rs`): `upload_chunk()` 接收 `Arc<AtomicU64>` 进度计数器参数
2. **流式 Body**: 将 100MB chunk 数据包装为 `reqwest::Body::wrap_stream()`，每发送 128KB 调用 `counter.fetch_add(131_072)`
3. **上传引擎适配** (`services/upload_engine.rs`): 将计数器传递给 API 调用，移除原有的 chunk 完成后 `fetch_add`
4. **聚合器无需改动**: 现有 50ms debounce 机制正确

**修复后效果（2.9G 文件）**:
- 修复前: 33 次更新，每次间隔 10-30 秒
- 修复后: 约 29,696 次原始更新，经 50ms debounce 后约 20fps，进度条视觉流畅

**影响文件**:
- `src-tauri/src/api/v1.rs`（流式上传 + 128KB 粒度回调）
- `src-tauri/src/services/upload_engine.rs`（传递计数器，移除旧逻辑）

---

### 变更 #4: 上传中 FileDropZone 禁用

| 字段 | 内容 |
|------|------|
| **类型** | Bug |
| **工作量** | Low |
| **风险** | Low |
| **依赖** | 无 |

**问题**: `UploadActionBar` 的上传按钮和保留期选择器在上传中已正确禁用，但 `FileDropZone` 完全没有上传状态判断，用户仍可通过拖拽或点击添加新文件。

**方案**:

`src/components/upload/FileDropZone.tsx` 中增加：
1. 从 `uploadStore` 获取 `activeTasks`，计算 `isUploading`
2. `handleClick` 中 `if (isUploading) return;`
3. 拖拽事件处理中检查 `isUploading`，阻止 `addFiles` 调用
4. 上传中降低透明度 + `cursor-not-allowed`，移除 hover 效果
5. 添加 `aria-disabled={isUploading}`

**影响文件**:
- `src/components/upload/FileDropZone.tsx`
- `src/hooks/useDragDrop.ts`（可能需要传入 disabled 参数）

---

### 变更 #5: Windows 双版本打包（NSIS + Portable）

| 字段 | 内容 |
|------|------|
| **类型** | 新需求 |
| **工作量** | Low-Medium |
| **风险** | Low |
| **依赖** | 变更 #1（图标替换） |

**问题**: 用户需要 Windows 上同时提供标准安装包和免安装便携版。

**方案**:
1. **NSIS 安装包**: 当前 `"targets": "all"` 已包含，确认构建产物正常
2. **Portable 免安装版**: 配置 NSIS portable 模式或从构建产物中提取独立可执行文件
3. **WebView2 依赖**: 安装包版本自动捆绑；Portable 版本依赖目标机器已有 WebView2（Win10 1803+ / Win11 已预装）

**影响文件**:
- `src-tauri/tauri.conf.json`（bundle 配置）

---

### 变更 #6: 历史记录存储位置确认

| 字段 | 内容 |
|------|------|
| **类型** | 信息确认 |
| **工作量** | 无 |
| **风险** | 无 |
| **依赖** | — |

**结论**:
- 存储引擎: `tauri-plugin-store`
- 存储文件: `history.json`（键名 `"records"`，JSON 数组）
- macOS: `~/Library/Application Support/com.gigafile.uploader/history.json`
- Windows: `%APPDATA%\com.gigafile.uploader\history.json`
- dev 模式和 production 模式共享同一目录（Tauri 2 默认行为）
- 持久化策略: 每次操作后立即 `store.save()`

**无需代码变更。**

---

### 变更 #7: 操作栏固定底部（布局修复）

| 字段 | 内容 |
|------|------|
| **类型** | Bug |
| **工作量** | Low |
| **风险** | Low |
| **依赖** | 无 |

**问题**: `UploadActionBar` 使用 `sticky bottom-0`，但父容器 `App.tsx` 使用 `min-h-screen` 导致容器随内容撑开，sticky 失效。

**根因**:
```
App.tsx:         div.min-h-screen        ← 随内容撑开，无固定高度
  └─ TabNav
       └─ UploadPage:   div.flex.h-full.flex-col
            ├─ FileDropZone
            ├─ UploadFileList (overflow-y-auto)
            └─ UploadActionBar (sticky bottom-0) ← sticky 无效
```

**方案**:
1. `App.tsx`: `min-h-screen` → `h-screen overflow-hidden`，锁定视口高度
2. 确保 TabNav 内容区正确传递高度到 UploadPage
3. `UploadFileList` 作为唯一滚动区域（`flex-1 overflow-y-auto`）
4. `UploadActionBar` 移除 `sticky bottom-0`，依赖 flex 布局自然固定在底部
5. 验证历史记录 Tab 页面布局不受影响

**影响文件**:
- `src/App.tsx`
- `src/components/shared/TabNav.tsx`（可能）
- `src/components/upload/UploadPage.tsx`（可能）
- `src/components/upload/UploadActionBar.tsx`

---

## 5. 实施交接

### 变更范围分类: Minor

由开发团队直接实施，不需要 PRD/架构文档修改。

### 建议实施顺序

```
#7 布局修复 ──┐
#4 禁用修复 ──┤── 独立 Bug 修复，可并行
#1 图标替换 ──┘
      │
      ▼
#3 进度流式更新 ── 前置条件
      │
      ▼
#2 速度显示 ── 依赖 #3
      │
      ▼
#5 Windows 打包 ── 依赖 #1，最后执行
```

### 成功标准

- [ ] 应用图标在 macOS 和 Windows 上正确显示自定义图标
- [ ] 2.9G 文件上传时进度条平滑更新（无长时间静止）
- [ ] 每个上传任务旁显示实时速度（如 `12.5 MB/s`）
- [ ] 上传进行中时文件拖拽区和选择按钮被禁用
- [ ] Windows 可生成 NSIS 安装包和 Portable 免安装版
- [ ] 操作栏在文件列表较长时仍固定在窗口底部
- [ ] 历史记录 Tab 页面布局不受影响
