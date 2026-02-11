# Story 6.1: 操作栏固定底部布局修复

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-1 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | 无（独立布局修复，不依赖其他 Story） |
| FRs 覆盖 | 无（Bug 修复，非新增功能） |
| NFRs 关联 | 无 |

## User Story

As a 用户,
I want 上传操作栏始终固定在窗口底部,
So that 无论文件列表多长，我都能看到上传按钮和统计信息。

---

## Acceptance Criteria

### AC-1: 文件列表超出可视区域时独立滚动

**Given** 用户添加了大量文件到待上传列表
**When** 文件列表超出可视区域高度
**Then** 文件列表区域（`UploadFileList`）出现独立滚动条
**And** UploadActionBar 始终固定在窗口底部，不随列表滚动
**And** TabNav 顶部导航栏始终可见，不被推出视口

### AC-2: 历史记录页面布局不受影响

**Given** 用户切换到"历史记录" Tab
**When** 历史记录列表较长
**Then** 历史记录页面布局正常，HistoryPage 仍可正常滚动
**And** 不因本次布局修复引入新的布局问题

### AC-3: 窗口缩放时布局保持正确

**Given** 布局修复已应用
**When** 用户调整窗口大小（拉大或缩小）
**Then** UploadActionBar 始终贴合窗口底部
**And** 文件列表区域自适应剩余高度

---

## Technical Design

### 现状分析

当前布局存在的问题：

```
App.tsx          → div.min-h-screen       (允许内容超出视口，整页滚动)
  TabNav.tsx     → Tabs.Root.min-h-screen (同上，允许无限增长)
    Tabs.Content → flex-1                  (父级无高度约束，flex-1 无效)
      UploadPage → div.h-full.flex-col     (父级无固定高度，h-full 无参考)
        FileDropZone                       (固定高度或折叠)
        UploadFileList → flex-1.overflow-y-auto  (正确意图，但祖先无高度约束)
        UploadActionBar → sticky.bottom-0  (整页滚动时 sticky 失效)
```

根本原因：从 `App.tsx` 到 `Tabs.Root` 使用了 `min-h-screen`，允许内容无限增长。当文件列表很长时，整个页面滚动，`sticky bottom-0` 的 UploadActionBar 被推到页面底部（而非视口底部）。

### 修复方案

将布局从"可增长"改为"视口约束 + 内部滚动"：

```
App.tsx          → div.h-screen.overflow-hidden  (约束到视口高度，禁止外层滚动)
  TabNav.tsx     → Tabs.Root.h-screen.flex.flex-col (约束高度，flex 纵向排列)
                   Tabs.List                       (固定高度 Tab 导航栏)
                   Tabs.Content.flex-1.overflow-hidden.min-h-0 (占满剩余空间，高度约束传递)
      UploadPage → div.h-full.flex-col             (不变，已正确)
        FileDropZone                                (固定高度或折叠)
        UploadFileList → flex-1.overflow-y-auto.min-h-0 (唯一滚动区域)
        UploadActionBar → 移除 sticky bottom-0，改为 shrink-0 (flex 末尾自然固定)
      HistoryPage → div.h-full.flex-col.overflow-y-auto (保持可滚动)
```

关键变更点：

1. **`App.tsx`**: `min-h-screen` -> `h-screen overflow-hidden` -- 约束整个应用到视口高度
2. **`TabNav.tsx` / `Tabs.Root`**: `min-h-screen` -> `h-screen` -- 同步约束
3. **`TabNav.tsx` / `Tabs.Content`**: 添加 `overflow-hidden min-h-0` -- 确保 flex 子元素的高度约束正确传递到内部组件（`min-h-0` 覆盖 flex 子元素默认的 `min-height: auto`，允许内容收缩）
4. **`UploadActionBar.tsx`**: `sticky bottom-0` -> `shrink-0` -- 依赖 flex 布局自然固定在底部，`shrink-0` 确保不被压缩
5. **`UploadFileList.tsx`**: 添加 `min-h-0` -- 允许 flex 子元素在内容不足时收缩（覆盖默认 `min-height: auto`）

### 设计决策

1. **使用 `h-screen overflow-hidden` 而非 `h-screen overflow-auto`**：`overflow-hidden` 彻底禁止外层滚动，确保只有 `UploadFileList` 内部滚动。如果用 `overflow-auto`，当布局计算有误时可能出现双滚动条。

2. **UploadActionBar 使用 `shrink-0` 而非保留 `sticky`**：在 flex 布局约束下，UploadActionBar 作为 flex 容器的最后一个子元素，自然位于底部。`shrink-0` 确保它不会被兄弟元素的 flex-grow 压缩。`sticky` 在此场景下不再需要，因为外层已无滚动。

3. **`min-h-0` 的必要性**：CSS flexbox 规范中，flex 子元素的默认 `min-height` 为 `auto`（即内容的最小高度）。这会阻止子元素缩小到其内容高度以下，导致 `overflow-y-auto` 无法触发滚动。`min-h-0` 覆盖此默认值，允许元素缩小并出现滚动条。

4. **HistoryPage 不需要变更**：HistoryPage 当前已使用 `overflow-y-auto`，在新的高度约束下自然可以独立滚动，不受影响。

---

## Tasks

### Task 1: 修改 App.tsx 根容器高度约束

**依赖:** 无

**Subtasks:**

1.1. 在 `src/App.tsx` 第 29 行，将根 `div` 的 className 中 `min-h-screen` 修改为 `h-screen overflow-hidden`

**验证:** 根容器高度固定为视口高度，无外层滚动条

### Task 2: 修改 TabNav.tsx 高度约束和内容区传递

**依赖:** Task 1

**Subtasks:**

2.1. 在 `src/components/shared/TabNav.tsx` 第 16 行，将 `Tabs.Root` 的 className 中 `min-h-screen` 修改为 `h-screen`
2.2. 在 `src/components/shared/TabNav.tsx` 第 33 行，为 `Tabs.Content`（upload）的 className 添加 `overflow-hidden min-h-0`
2.3. 在 `src/components/shared/TabNav.tsx` 第 36 行，为 `Tabs.Content`（history）的 className 添加 `overflow-hidden min-h-0`

**验证:** Tab 内容区高度被正确约束，不超出视口

### Task 3: 修改 UploadActionBar 定位方式

**依赖:** Task 2

**Subtasks:**

3.1. 在 `src/components/upload/UploadActionBar.tsx` 第 64 行，将 `<nav>` 的 className 中 `sticky bottom-0` 修改为 `shrink-0`

**验证:** UploadActionBar 固定在底部，不随文件列表滚动

### Task 4: 确保 UploadFileList 可收缩滚动

**依赖:** Task 2

**Subtasks:**

4.1. 在 `src/components/upload/UploadFileList.tsx` 第 22 行，为 `<ul>` 的 className 添加 `min-h-0`，最终为 `flex-1 list-none overflow-y-auto min-h-0`

**验证:** 文件列表超出可视区域时出现独立滚动条，不影响 UploadActionBar 位置

### Task 5: 手动验证（人工测试）

**依赖:** Task 1, 2, 3, 4

**Subtasks:**

5.1. 运行 `pnpm tauri dev`，添加 20+ 个文件，确认文件列表独立滚动
5.2. 确认 UploadActionBar（上传按钮、统计信息）始终可见在窗口底部
5.3. 切换到"历史记录" Tab，确认布局正常，长列表可滚动
5.4. 调整窗口大小，确认 UploadActionBar 始终贴合底部
5.5. 确认 TabNav 顶部导航栏始终可见

---

## Task 依赖顺序

```
Task 1 (App.tsx 高度约束)
    |
    v
Task 2 (TabNav.tsx 高度传递)
    |
    v
Task 3 (UploadActionBar 定位) + Task 4 (UploadFileList 收缩)
    |
    v
Task 5 (手动验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 根容器 `min-h-screen` -> `h-screen overflow-hidden` |
| `src/components/shared/TabNav.tsx` | `Tabs.Root` 高度约束 + `Tabs.Content` 添加 `overflow-hidden min-h-0` |
| `src/components/upload/UploadActionBar.tsx` | `sticky bottom-0` -> `shrink-0` |
| `src/components/upload/UploadFileList.tsx` | 添加 `min-h-0` |

### 禁止修改

- `src/components/upload/UploadPage.tsx` -- 当前 className 已正确（`h-full flex-col`），无需变更
- `src/components/history/HistoryPage.tsx` -- 当前布局已兼容新约束，无需变更
- `src/components/upload/FileDropZone.tsx` -- 不涉及本次布局修复
- `src-tauri/` -- 不涉及 Rust 代码变更
- `package.json` -- 不涉及依赖变更

---

## Technical Notes

### CSS Flexbox min-height 陷阱

在 flex 布局中，子元素默认 `min-height: auto`（即不会小于其内容高度）。这意味着即使设置了 `overflow-y: auto`，如果没有显式设置 `min-height: 0`，元素不会出现滚动条，而是撑大父容器。

```css
/* 问题：flex 子元素不会缩小 */
.parent { display: flex; flex-direction: column; height: 100%; }
.child  { flex: 1; overflow-y: auto; }  /* 滚动条不会出现 */

/* 解决：覆盖默认 min-height */
.child  { flex: 1; overflow-y: auto; min-height: 0; }  /* 滚动条正常工作 */
```

这是本次修复中 `min-h-0` 出现在多处的原因。

### Radix UI Tabs.Content 注意事项

Radix UI 的 `Tabs.Content` 在非活动状态时会设置 `display: none`，激活时恢复。添加的 flex/overflow 类只在内容可见时生效，不会影响非活动 Tab。

---

## Definition of Done

- [ ] `App.tsx` 根容器使用 `h-screen overflow-hidden`
- [ ] `TabNav.tsx` 的 `Tabs.Root` 使用 `h-screen`
- [ ] `TabNav.tsx` 的两个 `Tabs.Content` 包含 `overflow-hidden min-h-0`
- [ ] `UploadActionBar.tsx` 使用 `shrink-0` 代替 `sticky bottom-0`
- [ ] `UploadFileList.tsx` 包含 `min-h-0`
- [ ] 添加 20+ 文件后，文件列表区域独立滚动
- [ ] UploadActionBar 始终固定在窗口底部
- [ ] 切换到历史记录 Tab 后布局正常
- [ ] 调整窗口大小后布局自适应
- [ ] TabNav 顶部导航栏始终可见
