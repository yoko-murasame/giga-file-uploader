# Story 4.2: 历史记录列表展示与链接管理

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 4-2 |
| Epic | Epic 4: 历史记录与链接管理 |
| 前置依赖 | Story 4-1 (上传历史持久化存储) -- 已完成 |
| FRs 覆盖 | FR19 (查看历史列表), FR20 (复制历史链接), FR21 (删除历史记录), FR22 (过期状态可视化) |
| NFRs 关联 | NFR5 (历史记录列表加载 <1s / 1000 条以内) |

## User Story

As a 用户,
I want 在"历史记录" Tab 中查看所有上传过的文件记录并复制链接,
So that 我可以随时找到之前分享的链接。

---

## Acceptance Criteria

### AC-1: 历史记录列表加载与展示

**Given** 用户切换到"历史记录" Tab
**When** 有历史记录存在
**Then** 展示历史记录列表，加载时间 < 1 秒（1000 条以内）（NFR5）
**And** 不显示 Loading 指示器（加载足够快不需要）
**And** 每条记录展示以下信息（FR19）：

| 信息 | 说明 |
|------|------|
| 文件名 | 过长时截断，悬停 Tooltip 显示完整名称 |
| 上传日期 | 本地化格式 `Intl.DateTimeFormat`（如"2026/2/11"） |
| 过期日期 | 本地化格式 `Intl.DateTimeFormat` |
| 下载链接 | 显示链接文本（过长时截断） |
| 过期状态标签 | "有效" 或 "已过期"（见 AC-2） |

**And** 列表按上传时间倒序排列（最新在前，由 `historyStore.records` 直接提供，无需前端排序）
**And** HistoryPage 组件在挂载时（`useEffect`）调用 `historyStore.loadHistory()` 加载数据
**And** 列表使用语义化 `<ul>/<li>` 结构

### AC-2: 过期状态三重编码可视化

**Given** 用户查看历史记录列表
**When** 链接尚未过期（当前日期 <= 过期日期）
**Then** 显示绿色"有效"标签：
- 颜色：Success #10B981（背景浅绿 + 文字深绿）
- 文字："有效"
- 图标：`CheckCircle`（Lucide React）

**Given** 用户查看历史记录列表
**When** 链接已过期（当前日期 > 过期日期）
**Then** 显示灰色"已过期"标签（FR22）：
- 颜色：灰色（`text-text-secondary` + 灰色背景）
- 文字："已过期"
- 图标：`Clock`（Lucide React）

**And** 过期状态通过颜色 + 文字 + 图标三重编码（无障碍要求，确保色盲用户也能识别状态）

### AC-3: 复制链接按钮与反馈

**Given** 用户点击某条记录的 [复制] 按钮
**When** 执行复制操作
**Then** 链接复制到剪贴板（FR20）
**And** 按钮图标变为勾号（Check），1.5 秒后恢复为复制图标（Copy）
**And** 复用 `src/components/shared/CopyButton.tsx` 共享组件（已由 Story 3-6 实现）
**And** 已过期的记录复制按钮仍可用但视觉灰化（`opacity-50`），复制功能正常

### AC-4: 内联删除确认

**Given** 用户点击某条记录的 [删除] 按钮（Ghost Icon Button，`Trash2` 图标）
**When** 首次点击
**Then** 按钮变为"确认删除？"文字按钮（内联确认，不弹对话框）
**And** 文字使用 Error 色 #EF4444
**And** 点击其他区域或等待 3 秒后自动恢复为原始删除按钮

**Given** 用户点击"确认删除？"按钮
**When** 二次确认
**Then** 调用 `historyStore.deleteRecord(id)` 从列表和本地存储中移除记录（FR21）
**And** 列表项淡出消失（200ms transition，使用 Tailwind `transition-opacity duration-200`）

### AC-5: 空状态展示

**Given** 用户切换到"历史记录" Tab
**When** 没有任何历史记录（`records` 为空数组）
**Then** 展示空状态：
- 灰色图标：`FileX`（Lucide React，48px，`text-text-secondary`）
- 文案："还没有上传记录"（`text-text-secondary`，14px）
- [去上传] 按钮（Secondary 样式，白底灰边）
**And** 点击 [去上传] 按钮后调用 `appStore.setCurrentTab('upload')` 切换到"上传" Tab

### AC-6: HistoryItem 组件优化与无障碍

**Given** 历史记录列表渲染
**When** HistoryItem 组件挂载
**Then** HistoryItem 使用 `React.memo` 包裹，避免不必要的重渲染
**And** `historyStore` 通过 Tauri command 加载数据，组件内不直接调用 `invoke()`
**And** 状态变化使用 `aria-live="polite"` 通知屏幕阅读器（列表项删除、复制成功）
**And** 所有交互元素支持键盘导航（Tab 聚焦、Enter/Space 触发）

### AC-7: 单元测试与代码质量

**Given** 前端组件和逻辑实现完成
**When** 执行测试
**Then** 组件测试（`src/components/history/HistoryItem.test.tsx`）：
- 渲染历史记录条目，显示文件名、日期、链接、状态标签
- 未过期记录显示绿色"有效"标签
- 已过期记录显示灰色"已过期"标签
- 复制按钮点击后调用 `copyToClipboard`
- 删除按钮首次点击变为"确认删除？"，二次点击触发删除

**And** 组件测试（`src/components/history/HistoryList.test.tsx`）：
- 有记录时渲染 `<ul>` 列表
- 空记录时渲染空状态（"还没有上传记录" + [去上传] 按钮）
- [去上传] 按钮点击后切换 Tab

**And** HistoryPage 测试（`src/components/history/HistoryPage.test.tsx`）：
- 挂载时调用 `historyStore.loadHistory()`

**And** `pnpm test` 前端测试通过
**And** `pnpm lint` ESLint 无错误
**And** `pnpm format:check` Prettier 格式正确

---

## Technical Design

### 现状分析

Story 4-1 已完成后端持久化和前端 store 基础，本 Story 的关键依赖已就绪：

- `src/stores/historyStore.ts` -- 已实现 `records` 状态 + `loadHistory()` + `deleteRecord()` actions
- `src/types/history.ts` -- 已定义 `HistoryRecord` 接口（`id`, `fileName`, `downloadUrl`, `fileSize`, `uploadedAt`, `expiresAt`）
- `src/lib/tauri.ts` -- 已封装 `getHistory()` + `deleteHistory()` IPC 函数，以及 `copyToClipboard()` 剪贴板函数
- `src/components/shared/CopyButton.tsx` -- 已实现复制按钮（含 1.5s 勾号反馈、`React.memo`、`aria-label` 无障碍）
- `src/stores/appStore.ts` -- 已实现 `setCurrentTab()` action，用于 Tab 切换
- `src/lib/format.ts` -- 已实现 `formatFileSize()` 格式化工具
- `src/components/history/HistoryPage.tsx` -- 当前是占位符（"历史记录页面 - 待实现"），需替换为完整实现

### 新增/修改模块

#### 1. `src/components/history/HistoryItem.tsx` -- 单条历史记录组件（新建）

```tsx
import { memo, useCallback, useState, useRef, useEffect } from 'react';

import { CheckCircle, Clock, Trash2 } from 'lucide-react';

import CopyButton from '@/components/shared/CopyButton';
import { formatFileSize } from '@/lib/format';

import type { HistoryRecord } from '@/types/history';

interface HistoryItemProps {
  record: HistoryRecord;
  onDelete: (id: string) => void;
}

function isExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt);
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}

function HistoryItemInner({ record, onDelete }: HistoryItemProps) {
  const expired = isExpired(record.expiresAt);
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleDeleteClick = useCallback(() => {
    if (confirming) {
      onDelete(record.id);
      setConfirming(false);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    } else {
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  }, [confirming, record.id, onDelete]);

  return (
    <li className={`transition-opacity duration-200 ...`}>
      {/* 文件名 + 文件大小 */}
      {/* 上传日期 + 过期日期 */}
      {/* 链接文本（截断） */}
      {/* 过期状态标签 */}
      {expired ? (
        <span className="... text-text-secondary">
          <Clock size={14} />
          已过期
        </span>
      ) : (
        <span className="... text-success">
          <CheckCircle size={14} />
          有效
        </span>
      )}
      {/* CopyButton（已过期时加 opacity-50） */}
      <CopyButton text={record.downloadUrl} className={expired ? 'opacity-50' : ''} />
      {/* 删除按钮 / 确认删除 */}
      {confirming ? (
        <button onClick={handleDeleteClick} className="text-error ...">
          确认删除？
        </button>
      ) : (
        <button onClick={handleDeleteClick} aria-label="删除记录">
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

const HistoryItem = memo(HistoryItemInner);
export default HistoryItem;
```

> **关键设计点：**
> - `isExpired()` 和 `formatDate()` 是模块级纯函数，便于测试
> - `confirming` 状态管理内联删除确认逻辑，3 秒超时自动恢复
> - `React.memo` 包裹避免列表项不必要重渲染
> - `onDelete` 回调由父组件传入（来自 `historyStore.deleteRecord`）
> - 日期格式使用 `Intl.DateTimeFormat` 的 `ja-JP` locale 以获得 YYYY/MM/DD 格式（与中日韩用户习惯一致）

#### 2. `src/components/history/HistoryList.tsx` -- 历史记录列表组件（新建）

```tsx
import { FileX } from 'lucide-react';

import { useAppStore } from '@/stores/appStore';
import { useHistoryStore } from '@/stores/historyStore';
import HistoryItem from '@/components/history/HistoryItem';

function HistoryList() {
  const records = useHistoryStore((s) => s.records);
  const deleteRecord = useHistoryStore((s) => s.deleteRecord);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <FileX size={48} className="text-text-secondary" />
        <p className="text-sm text-text-secondary">还没有上传记录</p>
        <button
          type="button"
          onClick={() => setCurrentTab('upload')}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary hover:bg-border ..."
        >
          去上传
        </button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {records.map((record) => (
        <HistoryItem key={record.id} record={record} onDelete={deleteRecord} />
      ))}
    </ul>
  );
}

export default HistoryList;
```

> **关键设计点：**
> - Zustand 精确选择器：`useHistoryStore((s) => s.records)` 和 `useHistoryStore((s) => s.deleteRecord)`
> - 空状态直接在组件内通过 `records.length === 0` 判断渲染
> - `aria-live="polite"` 在列表容器上，删除操作时屏幕阅读器自动通知
> - `deleteRecord` 传递给 HistoryItem 的 `onDelete` 回调

#### 3. `src/components/history/HistoryPage.tsx` -- 历史记录页面容器（修改）

```tsx
import { useEffect } from 'react';

import { useHistoryStore } from '@/stores/historyStore';
import HistoryList from '@/components/history/HistoryList';

function HistoryPage() {
  const loadHistory = useHistoryStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <HistoryList />
    </div>
  );
}

export default HistoryPage;
```

> **关键设计点：**
> - 挂载时调用 `loadHistory()` 从本地存储加载数据
> - 不显示 Loading 指示器（NFR5 要求 <1s 加载，足够快）
> - `overflow-y-auto` 支持记录超出视口时滚动

### 数据流

```
用户切换到"历史记录" Tab:
  -> App.tsx 条件渲染 HistoryPage
  -> HistoryPage useEffect 调用 historyStore.loadHistory()
  -> loadHistory() -> lib/tauri.ts getHistory()
    -> invoke('get_history')
    -> commands::history::get_history()
    -> storage::history::get_all()
    -> 返回 Vec<HistoryRecord> -> HistoryRecord[] -> set({ records })
  -> HistoryList 读取 records 渲染列表

用户复制链接:
  -> HistoryItem 内 CopyButton 组件处理
  -> CopyButton 调用 copyToClipboard(record.downloadUrl)
  -> navigator.clipboard.writeText()
  -> 按钮图标变勾号 1.5 秒后恢复

用户删除记录:
  -> HistoryItem [删除] 按钮首次点击 -> confirming=true -> 显示"确认删除？"
  -> 二次点击 -> 调用 onDelete(record.id) -> historyStore.deleteRecord(id)
  -> deleteRecord() -> lib/tauri.ts deleteHistory(id)
    -> invoke('delete_history', { id })
    -> commands::history::delete_history()
    -> storage::history::delete_record()
    -> store.save() 刷盘
  -> 前端 set({ records: filtered }) -> 列表项淡出消失

用户点击 [去上传]:
  -> HistoryList 空状态按钮 onClick
  -> appStore.setCurrentTab('upload')
  -> App.tsx currentTab 变更 -> 渲染 UploadPage
```

### 设计决策

1. **HistoryItem 内部管理删除确认状态**：使用组件内部 `confirming` state 而非 store 状态，因为这是纯 UI 交互状态，无需持久化或跨组件共享。3 秒超时自动恢复通过 `setTimeout` 实现，组件卸载时清理定时器。

2. **过期状态前端计算**：`isExpired()` 使用 `new Date() > new Date(expiresAt)` 在前端实时判断，无需后端参与。每次渲染时重新计算，确保状态实时准确。这是纯函数，易于测试。

3. **复用 CopyButton 共享组件**：Story 3-6 已实现 `CopyButton`（含 1.5s 勾号反馈、memo、aria-label），直接复用。已过期记录通过传入 `className="opacity-50"` 实现视觉灰化，功能不受限制。

4. **日期格式化使用 Intl.DateTimeFormat**：不引入额外日期库（如 dayjs），原生 API 足够满足简单的日期展示需求。使用 `ja-JP` locale 获得 `YYYY/MM/DD` 格式，与中日韩用户的日期阅读习惯一致。

5. **不使用虚拟滚动**：NFR5 定义为 1000 条以内 <1s 加载。React.memo 包裹 HistoryItem 后，1000 条记录的渲染性能在现代硬件上完全可接受。如果未来需要支持更大数据量，可在后续 Story 中引入虚拟滚动。

6. **HistoryPage 每次挂载都调用 loadHistory()**：确保从其他 Tab 切换回来时数据是最新的（可能有新的上传完成记录）。由于 tauri-plugin-store 是本地同步读取，性能开销可忽略。

7. **列表项淡出动画**：使用 Tailwind `transition-opacity duration-200` 实现 200ms 淡出效果。通过在删除时短暂保留 DOM 元素并设置 `opacity-0`，完成过渡后再从 records 中移除。实际实现时 Dev Runner 可选择直接移除（store 更新即移除）或使用 `onTransitionEnd` 延迟移除，优先保证功能正确性。

8. **`aria-live="polite"` 放在 `<ul>` 容器上**：列表内容变化（删除项）时，屏幕阅读器会在适当时机播报变化，不打断用户当前操作。

### 与前后 Story 的关系

| Story | 关系 |
|-------|------|
| Story 4-1（历史持久化） | 本 Story 依赖 4-1 提供的 `historyStore`、`HistoryRecord` 类型、`getHistory`/`deleteHistory` IPC |
| Story 3-6（链接产出与复制） | 本 Story 复用 3-6 实现的 `CopyButton` 共享组件 |
| Story 1-2（Tab 导航框架） | 本 Story 使用 1-2 建立的 Tab 导航和 `appStore.setCurrentTab()` |
| Story 5-1（保留期选择） | Story 5-1 的保留期选择影响 `expiresAt` 计算，但不影响本 Story 的展示逻辑 |
| Story 5-2（离线模式） | 历史记录页面不依赖网络，天然支持离线查看 |

---

## Tasks

### Task 1: 创建 HistoryItem 组件

**文件:** `src/components/history/HistoryItem.tsx`（新建）
**依赖:** 无

**Subtasks:**

1.1. 创建 `HistoryItem.tsx`，定义 `HistoryItemProps` 接口（`record: HistoryRecord`, `onDelete: (id: string) => void`）
1.2. 实现 `isExpired(expiresAt: string): boolean` 纯函数（模块级）
1.3. 实现 `formatDate(isoString: string): string` 纯函数，使用 `Intl.DateTimeFormat`
1.4. 渲染文件名（截断 + title 属性 Tooltip）、文件大小（`formatFileSize`）、上传日期、过期日期、链接文本（截断）
1.5. 实现过期状态三重编码标签（颜色 + 文字 + 图标：`CheckCircle`/"有效" 或 `Clock`/"已过期"）
1.6. 集成 `CopyButton` 共享组件，已过期时添加 `opacity-50` class
1.7. 实现内联删除确认逻辑（`confirming` state + 3 秒超时 + 定时器清理）
1.8. 使用 `React.memo` 包裹导出
1.9. 添加无障碍属性：删除按钮 `aria-label="删除记录"`，键盘可操作

### Task 2: 创建 HistoryList 组件

**文件:** `src/components/history/HistoryList.tsx`（新建）
**依赖:** Task 1

**Subtasks:**

2.1. 创建 `HistoryList.tsx`，使用 Zustand 精确选择器读取 `records` 和 `deleteRecord`
2.2. 实现空状态渲染：`FileX` 图标 + "还没有上传记录" + [去上传] 按钮
2.3. [去上传] 按钮调用 `appStore.setCurrentTab('upload')`
2.4. 有记录时渲染 `<ul>` 列表，遍历 `records` 渲染 `HistoryItem`
2.5. `<ul>` 添加 `aria-live="polite"` 属性

### Task 3: 替换 HistoryPage 占位内容

**文件:** `src/components/history/HistoryPage.tsx`（修改）
**依赖:** Task 2

**Subtasks:**

3.1. 替换占位内容为完整实现：`useEffect` 中调用 `loadHistory()`
3.2. 渲染 `HistoryList` 子组件
3.3. 添加容器样式（`overflow-y-auto` 支持滚动、padding）

### Task 4: 编写 HistoryItem 组件测试

**文件:** `src/components/history/HistoryItem.test.tsx`（新建）
**依赖:** Task 1

**Subtasks:**

4.1. 测试渲染未过期记录：显示文件名、日期、"有效"标签（绿色）
4.2. 测试渲染已过期记录：显示"已过期"标签（灰色）、复制按钮视觉灰化
4.3. 测试复制按钮点击触发 `copyToClipboard`
4.4. 测试删除按钮首次点击显示"确认删除？"
4.5. 测试"确认删除？"二次点击调用 `onDelete` 回调

### Task 5: 编写 HistoryList 组件测试

**文件:** `src/components/history/HistoryList.test.tsx`（新建）
**依赖:** Task 2

**Subtasks:**

5.1. 测试有记录时渲染 `<ul>` 列表和 HistoryItem 组件
5.2. 测试空记录时渲染空状态："还没有上传记录" + [去上传] 按钮
5.3. 测试 [去上传] 按钮点击后调用 `setCurrentTab('upload')`

### Task 6: 编写 HistoryPage 测试

**文件:** `src/components/history/HistoryPage.test.tsx`（新建）
**依赖:** Task 3

**Subtasks:**

6.1. 测试组件挂载时调用 `historyStore.loadHistory()`

### Task 7: 代码质量验证

**文件:** 无新文件
**依赖:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

**Subtasks:**

7.1. 执行 `pnpm test` 确认前端测试通过
7.2. 执行 `pnpm lint` 确认 ESLint 无错误
7.3. 执行 `pnpm format:check` 确认 Prettier 格式正确

---

## Task 依赖顺序

```
Task 1 (HistoryItem) ──-> Task 2 (HistoryList) ──-> Task 3 (HistoryPage)
     |                         |                         |
     v                         v                         v
Task 4 (HistoryItem 测试)  Task 5 (HistoryList 测试)  Task 6 (HistoryPage 测试)
                                                         |
                                                         v
                                                    Task 7 (代码质量验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 新增文件

| 文件 | 内容 |
|------|------|
| `src/components/history/HistoryItem.tsx` | 单条历史记录组件，含过期状态标签、复制按钮、内联删除确认，`React.memo` 包裹 |
| `src/components/history/HistoryList.tsx` | 历史记录列表组件，含空状态渲染、语义化列表结构、`aria-live` |
| `src/components/history/HistoryItem.test.tsx` | HistoryItem 组件测试 |
| `src/components/history/HistoryList.test.tsx` | HistoryList 组件测试 |
| `src/components/history/HistoryPage.test.tsx` | HistoryPage 组件测试 |

### 修改文件

| 文件 | 修改内容 |
|---------|---------|
| `src/components/history/HistoryPage.tsx` | 替换占位符为完整实现：`useEffect` 加载数据 + `HistoryList` 渲染 |

### 禁止修改

- `src-tauri/` -- 所有后端代码不涉及（后端已在 Story 4-1 完成）
- `src/stores/historyStore.ts` -- Store 已在 Story 4-1 完成，本 Story 仅使用
- `src/stores/uploadStore.ts` -- 上传 store 不涉及
- `src/stores/appStore.ts` -- 仅使用 `setCurrentTab`，不修改
- `src/types/history.ts` -- 类型定义已在 Story 4-1 完成
- `src/lib/tauri.ts` -- IPC 封装已在 Story 4-1 完成
- `src/lib/format.ts` -- 格式化工具已存在
- `src/components/shared/CopyButton.tsx` -- 共享组件已在 Story 3-6 完成，直接复用
- `src/components/upload/` -- 上传组件不涉及
- `src/components/shared/TabNav.tsx` -- Tab 导航不涉及
- `src/App.tsx` -- 应用入口不变（已通过 `currentTab` 条件渲染 HistoryPage）
- `src/App.css` -- 设计 Token 不变

---

## Technical Notes

### 过期状态判断

```typescript
// 模块级纯函数，放在 HistoryItem.tsx 中
function isExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt);
}
```

`expiresAt` 是 ISO 8601 格式字符串（如 `"2026-02-18T08:30:00+00:00"`），`new Date()` 可直接解析。比较使用本地时间与 UTC 时间的标准 JavaScript Date 比较。

### 日期格式化

```typescript
function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}
// 输出示例："2026/02/11"
```

选择 `ja-JP` locale 是因为它输出 `YYYY/MM/DD` 格式，符合中日韩用户的日期阅读习惯。不引入 dayjs 或 date-fns 等第三方库。

### 内联删除确认模式

```
初始状态: [Trash2 图标按钮]
  |
  v (首次点击)
确认状态: [确认删除？] (红色文字按钮)
  |
  +--> (二次点击) --> 执行删除 --> 列表项淡出
  +--> (3秒超时) --> 恢复初始状态
  +--> (点击其他区域) --> 组件内部不需要处理（3秒超时自动恢复即可）
```

### 测试 Mock 策略

```typescript
// HistoryItem.test.tsx
import { vi } from 'vitest';

// Mock CopyButton 避免 clipboard API 依赖
vi.mock('@/components/shared/CopyButton', () => ({
  default: ({ text, className }: { text: string; className?: string }) => (
    <button data-testid="copy-button" data-text={text} className={className}>
      Copy
    </button>
  ),
}));

// Mock lib/format.ts
vi.mock('@/lib/format', () => ({
  formatFileSize: (bytes: number) => `${bytes} B`,
}));
```

```typescript
// HistoryList.test.tsx / HistoryPage.test.tsx
import { vi } from 'vitest';

// Mock historyStore
vi.mock('@/stores/historyStore');
vi.mock('@/stores/appStore');
```

遵循项目中已有的 mock 模式（参考 `uploadStore.test.ts`、`CopyButton.test.tsx`）。

### NFR5 性能考量

1000 条记录场景下的性能保障：
- `historyStore.records` 由 Rust 后端一次性返回，tauri-plugin-store 是本地 JSON 读取，<1ms
- `React.memo` 包裹 HistoryItem，只有 props 变化的项重渲染
- `isExpired()` 是简单的 Date 比较，计算量可忽略
- 不使用虚拟滚动（1000 条 DOM 节点在桌面端完全可接受）
- 不显示 Loading 指示器（加载足够快）

---

## Definition of Done

- [ ] `HistoryItem.tsx` 新建，使用 `React.memo` 包裹
- [ ] HistoryItem 展示文件名（截断 + Tooltip）、文件大小、上传日期、过期日期、链接
- [ ] 未过期记录显示绿色"有效"标签（`CheckCircle` 图标 + 绿色文字 + 绿色背景）
- [ ] 已过期记录显示灰色"已过期"标签（`Clock` 图标 + 灰色文字 + 灰色背景）
- [ ] 过期状态通过颜色 + 文字 + 图标三重编码（无障碍）
- [ ] 复用 `CopyButton` 共享组件，已过期时添加 `opacity-50`
- [ ] 内联删除确认：首次点击显示"确认删除？"，二次点击执行删除
- [ ] 删除确认 3 秒超时自动恢复，组件卸载时清理定时器
- [ ] 列表项删除后淡出消失（200ms transition）
- [ ] `HistoryList.tsx` 新建，使用语义化 `<ul>/<li>` 结构
- [ ] `<ul>` 添加 `aria-live="polite"` 属性
- [ ] 空状态：`FileX` 图标 + "还没有上传记录" + [去上传] 按钮
- [ ] [去上传] 按钮点击调用 `appStore.setCurrentTab('upload')`
- [ ] `HistoryPage.tsx` 替换占位内容，挂载时调用 `loadHistory()`
- [ ] 不显示 Loading 指示器（NFR5）
- [ ] Zustand 使用精确选择器，不解构整个 store
- [ ] 组件内不直接调用 `invoke()`（通过 store actions）
- [ ] 所有交互元素支持键盘导航
- [ ] `HistoryItem.test.tsx` 测试通过（过期/未过期状态、复制、删除确认）
- [ ] `HistoryList.test.tsx` 测试通过（列表渲染、空状态、Tab 切换）
- [ ] `HistoryPage.test.tsx` 测试通过（挂载加载数据）
- [ ] `pnpm test` 前端测试通过
- [ ] `pnpm lint` ESLint 无错误
- [ ] `pnpm format:check` Prettier 格式正确
