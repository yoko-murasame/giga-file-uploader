# Story 6.5: 每个任务的实时上传速度显示

## Story 信息

| 字段 | 值 |
|------|-----|
| Story Key | 6-5 |
| Epic | Epic 6: Bug 修复与体验优化 |
| 前置依赖 | Story 6.4（流式进度 128KB 粒度）— 已完成 |
| FRs 覆盖 | 无（体验优化，非新增功能） |
| NFRs 关联 | 无 |

## User Story

As a 用户,
I want 上传过程中看到每个文件的实时传输速度,
So that 我能了解当前网络状况和预估剩余时间。

---

## Acceptance Criteria

### AC-1: 上传中显示实时速度

**Given** 文件正在上传
**When** 进度事件推送到前端
**Then** 每个文件任务旁显示实时速度（格式如 `12.5 MB/s`）
**And** 速度显示在进度百分比旁边

### AC-2: 速度基于滑动窗口平滑计算

**Given** 上传过程中网络速度波动
**When** 每 50ms 采样一次进度数据
**Then** 速度基于最近 2 秒（40 个采样点）的滑动窗口平均计算
**And** 速度值不会因瞬时波动而剧烈跳动

### AC-3: 上传完成或速度为零时隐藏速度

**Given** 上传完成或暂停
**When** 速度为 0 或任务状态为 `completed`
**Then** 速度显示消失或显示 `--`

### AC-4: 多线程并发上传速度自然聚合

**Given** 多线程并发上传（默认 8 并发）
**When** 计算速度
**Then** 速度值自然包含所有并发线程贡献的聚合值
**And** 因为速度基于 shard 级 `AtomicU64` 计数器的总和计算，多线程贡献自动包含

### AC-5: 速度格式化符合用户习惯

**Given** 后端发送 `speed` 字段（bytes/sec）
**When** 前端显示速度
**Then** 自动选择合适单位格式化（如 `512 KB/s`、`12.5 MB/s`、`1.23 GB/s`）
**And** 速度为 0 时显示 `--`

---

## Technical Design

### 现状分析

当前 `ProgressAggregator::start_emitter` 每 50ms 读取各 task 的 `AtomicU64` 计数器并 emit `upload:progress` 事件。事件 payload（`ProgressPayload`）包含 `task_id`、`file_progress`、`shards`，但**不包含速度信息**。

Story 6.4 已完成 128KB 粒度的流式进度更新，`AtomicU64` 计数器每 128KB 更新一次，50ms 定时器自然采样这些更新。这为速度计算提供了足够精细的数据源。

### 修改方案

#### 1. Rust 后端：速度计算（`progress.rs`）

在 `start_emitter` 的 emitter 循环中，维护一个**本地** `HashMap<String, VecDeque<(Instant, u64)>>` 作为速度计算的滑动窗口。不修改共享的 `TaskProgress` 结构体，保持速度计算状态仅存在于 emitter 任务内部。

```rust
use std::collections::VecDeque;
use std::time::Instant;

/// 滑动窗口大小：40 个采样点 × 50ms = 2 秒
const SPEED_WINDOW_SIZE: usize = 40;

struct SpeedSample {
    timestamp: Instant,
    total_bytes: u64,
}

// 在 emitter 循环外初始化
let mut speed_trackers: HashMap<String, VecDeque<SpeedSample>> = HashMap::new();

// 每 50ms tick 内，对每个 task：
// 1. 将当前 (now, total_bytes) push 到 VecDeque
// 2. 如果 VecDeque 长度超过 SPEED_WINDOW_SIZE，pop_front
// 3. 计算速度 = (newest.total_bytes - oldest.total_bytes) / (newest.timestamp - oldest.timestamp)
```

速度计算逻辑：
```rust
fn calculate_speed(samples: &VecDeque<SpeedSample>) -> u64 {
    if samples.len() < 2 {
        return 0;
    }
    let oldest = samples.front().unwrap();
    let newest = samples.back().unwrap();
    let duration = newest.timestamp.duration_since(oldest.timestamp);
    let secs = duration.as_secs_f64();
    if secs < 0.001 {
        return 0;
    }
    let bytes_delta = newest.total_bytes.saturating_sub(oldest.total_bytes);
    (bytes_delta as f64 / secs) as u64
}
```

`ProgressPayload` 新增 `speed` 字段：
```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub task_id: String,
    pub file_progress: f64,
    pub shards: Vec<ShardProgressPayload>,
    pub speed: u64,  // bytes/sec, 新增
}
```

#### 2. 前端类型：新增 speed 字段（`types/upload.ts`）

```typescript
export interface ProgressPayload {
  taskId: string;
  fileProgress: number;
  shards: ShardProgress[];
  speed: number;  // bytes/sec, 新增
}

export interface UploadTaskProgress {
  taskId: string;
  fileName: string;
  fileSize: number;
  fileProgress: number;
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
  downloadUrl?: string;
  speed?: number;  // bytes/sec, 新增（optional，因为非上传状态无速度）
}
```

#### 3. Store：传递 speed 字段（`uploadStore.ts`）

```typescript
updateProgress: (payload) =>
  set((state) => {
    const existing = state.activeTasks[payload.taskId];
    if (!existing) return state;
    return {
      activeTasks: {
        ...state.activeTasks,
        [payload.taskId]: {
          ...existing,
          fileProgress: payload.fileProgress,
          shards: payload.shards,
          speed: payload.speed,  // 新增
        },
      },
    };
  }),
```

#### 4. 速度格式化函数（`format.ts`）

```typescript
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '--';
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}
```

#### 5. UI 显示（`UploadFileItem.tsx`）

在进度百分比旁边显示速度：
```tsx
{isUploading && (
  isCompleted ? (
    <CheckCircle2 size={18} className="shrink-0 text-success" />
  ) : (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-xs text-text-secondary">
        {formatSpeed(taskProgress.speed ?? 0)}
      </span>
      <span className="text-sm font-medium text-text-primary">
        {Math.round(taskProgress.fileProgress)}%
      </span>
    </div>
  )
)}
```

### 设计决策

1. **速度计算状态保持在 emitter 内部而非 `TaskProgress` 中**：`VecDeque<SpeedSample>` 仅被 emitter 任务使用，无需跨线程共享。将其作为 emitter 的本地变量避免了对 `TaskProgress` 的侵入性修改，且无需额外的锁。

2. **滑动窗口 40 采样点（2 秒）**：太短（如 5 个 = 250ms）会导致速度波动明显；太长（如 100 个 = 5 秒）响应迟钝。2 秒是常见的平衡点，大多数下载/上传工具使用 1-3 秒窗口。

3. **`speed` 字段类型使用 `u64`（bytes/sec）**：整数足以表达精度（1 byte/sec 粒度），避免浮点数的序列化和精度问题。前端格式化时再转换为可读单位。

4. **emitter 清理已完成的 speed tracker**：当任务从 `tasks` HashMap 中被 `remove_task` 移除后，emitter 下一次循环检测到该 task 不存在，也应从本地 `speed_trackers` 中移除，防止内存泄漏。

5. **复用 `formatFileSize` 的单位逻辑但独立函数**：虽然 `formatSpeed` 和 `formatFileSize` 逻辑相似，但职责不同（一个带 `/s` 后缀，一个不带），且 0 值处理不同（`formatSpeed` 返回 `--`），保持独立函数更清晰。

6. **`models/upload.rs` 无需修改**：Epic 中提到修改 `models/upload.rs`，但实际 `ProgressPayload` 定义在 `services/progress.rs` 中，不在 models 层。修改仅涉及 `progress.rs`。

---

## Tasks

### Task 1: ProgressPayload 新增 speed 字段并实现速度计算

**依赖:** 无

**Subtasks:**

1.1. 在 `src-tauri/src/services/progress.rs` 的 `ProgressPayload` 结构体中，添加字段 `pub speed: u64`（bytes/sec）
1.2. 在文件顶部添加 `use std::collections::VecDeque;` 和 `use std::time::Instant;` import
1.3. 在模块级定义常量 `const SPEED_WINDOW_SIZE: usize = 40;`（40 × 50ms = 2 秒窗口）
1.4. 在模块级定义结构体 `SpeedSample { timestamp: Instant, total_bytes: u64 }`
1.5. 在模块级定义函数 `fn calculate_speed(samples: &VecDeque<SpeedSample>) -> u64`，逻辑如 Technical Design 所述
1.6. 修改 `start_emitter` 方法：在 `loop` 外初始化 `let mut speed_trackers: HashMap<String, VecDeque<SpeedSample>> = HashMap::new();`
1.7. 在 `start_emitter` 的每次 tick 中，对每个 task：记录 `(Instant::now(), total_bytes)` 到 `speed_trackers`，维持窗口大小不超过 `SPEED_WINDOW_SIZE`，调用 `calculate_speed` 获取速度值
1.8. 在 emit `ProgressPayload` 时传入计算得到的 `speed` 值
1.9. 在 tick 结束后，清理 `speed_trackers` 中不再存在于 `tasks` 中的 key（防止内存泄漏）

**验证:** `cargo check` 编译通过

### Task 2: 前端类型和 Store 新增 speed 字段

**依赖:** Task 1

**Subtasks:**

2.1. 在 `src/types/upload.ts` 的 `ProgressPayload` 接口中，添加 `speed: number` 字段
2.2. 在 `src/types/upload.ts` 的 `UploadTaskProgress` 接口中，添加 `speed?: number` 字段（optional，非上传状态无速度）
2.3. 在 `src/stores/uploadStore.ts` 的 `updateProgress` action 中，新增 `speed: payload.speed` 到更新对象

**验证:** `pnpm lint` 无错误

### Task 3: 速度格式化函数

**依赖:** 无

**Subtasks:**

3.1. 在 `src/lib/format.ts` 中添加 `formatSpeed(bytesPerSec: number): string` 函数
3.2. 逻辑：bytesPerSec <= 0 返回 `'--'`；否则按 B/s → KB/s → MB/s → GB/s 自动选择单位，保留 1 位小数（GB/s 保留 2 位）

**验证:** 可在 vitest 中为 `formatSpeed` 编写单元测试验证

### Task 4: UploadFileItem 显示速度

**依赖:** Task 2, Task 3

**Subtasks:**

4.1. 在 `src/components/upload/UploadFileItem.tsx` 中导入 `formatSpeed` from `@/lib/format`
4.2. 在上传进行中（非 completed）的 UI 区域，在进度百分比旁边添加速度显示：`<span className="text-xs text-text-secondary">{formatSpeed(taskProgress.speed ?? 0)}</span>`
4.3. 速度显示与百分比用 gap-2 分隔，速度在左、百分比在右

**验证:** `pnpm lint` 无错误；`pnpm build` 编译通过

### Task 5: 编译验证与单元测试

**依赖:** Task 4

**Subtasks:**

5.1. 运行 `cargo clippy --manifest-path src-tauri/Cargo.toml` 确认无警告
5.2. 在 `src-tauri/src/services/progress.rs` tests 模块中添加 `test_calculate_speed_basic` 测试：构造 VecDeque 包含 2 个 SpeedSample（时间差 1 秒，字节差 1MB），断言返回值约 1048576
5.3. 在 `src-tauri/src/services/progress.rs` tests 模块中添加 `test_calculate_speed_empty_samples` 测试：传入空 VecDeque，断言返回 0
5.4. 在 `src-tauri/src/services/progress.rs` tests 模块中添加 `test_calculate_speed_single_sample` 测试：传入仅 1 个 sample 的 VecDeque，断言返回 0
5.5. 在 `src-tauri/src/services/progress.rs` tests 模块中添加 `test_progress_payload_speed_serialization` 测试：构造含 speed 字段的 ProgressPayload，序列化后断言 JSON 包含 `"speed"` key
5.6. 在 `src/lib/format.test.ts` 中添加 `formatSpeed` 单元测试：覆盖 0、512、1024*100、1024*1024*12.5、1024*1024*1024*1.5 等边界情况
5.7. 运行 `cargo test --manifest-path src-tauri/Cargo.toml` 确认所有 Rust 测试通过
5.8. 运行 `pnpm test` 确认所有前端测试通过

**验证:** `cargo clippy` 无警告，`cargo test` 全部通过，`pnpm test` 全部通过

### Task 6: 手动验证（人工测试）

**依赖:** Task 5

**Subtasks:**

6.1. 运行 `pnpm tauri dev`，上传一个 500MB+ 的文件
6.2. 观察每个文件任务旁是否显示实时速度（如 `12.5 MB/s`）
6.3. 确认速度值平滑变化，无剧烈跳动
6.4. 确认上传完成后速度显示消失，显示完成图标
6.5. 上传一个小文件（< 100MB），确认速度显示正常
6.6. 多文件并发上传，确认各文件速度独立显示

---

## Task 依赖顺序

```
Task 1 (ProgressPayload + 速度计算)      Task 3 (formatSpeed 函数)
    |                                         |
    v                                         |
Task 2 (前端类型 + Store)                     |
    |                                         |
    +--------------------+--------------------+
                         |
                         v
                    Task 4 (UI 显示)
                         |
                         v
                    Task 5 (编译验证 + 测试)
                         |
                         v
                    Task 6 (手动验证)
```

---

## File Scope

Dev Runner 被允许修改的文件列表：

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/services/progress.rs` | `ProgressPayload` 添加 `speed: u64` 字段；添加 `SpeedSample` 结构体、`SPEED_WINDOW_SIZE` 常量、`calculate_speed` 函数；`start_emitter` 内维护滑动窗口并计算速度；新增测试 |
| `src/types/upload.ts` | `ProgressPayload` 添加 `speed: number`；`UploadTaskProgress` 添加 `speed?: number` |
| `src/stores/uploadStore.ts` | `updateProgress` action 传递 `speed` 字段 |
| `src/components/upload/UploadFileItem.tsx` | 导入 `formatSpeed`，在进度百分比旁显示速度 |
| `src/lib/format.ts` | 添加 `formatSpeed(bytesPerSec: number): string` 函数 |
| `src/lib/format.test.ts` | 添加 `formatSpeed` 单元测试 |

### 禁止修改

- `src-tauri/src/models/upload.rs` -- 数据模型无需改动（`ProgressPayload` 不在此文件）
- `src-tauri/src/api/` -- API 层无需改动
- `src-tauri/src/services/upload_engine.rs` -- 上传引擎无需改动
- `src-tauri/src/commands/` -- IPC 层无需改动

---

## Technical Notes

### 滑动窗口 vs 指数移动平均

滑动窗口（固定 N 个采样点）实现简单、行为可预测：速度反映过去 2 秒的平均值。指数移动平均（EMA）需要调优权重参数且行为不如窗口直观。对于上传速度这种不需要高精度预测的场景，滑动窗口足够。

### speed_trackers 的生命周期

`speed_trackers` 是 `start_emitter` 内部的本地变量，随 emitter 任务退出（`tasks.is_empty()` 时 break）自动释放。在 emitter 运行期间，每次 tick 结束时主动清理已移除 task 的 tracker entry，避免短暂的内存泄漏。

### `Instant` 在 emitter 中的使用

`std::time::Instant` 是单调时钟，不受系统时间调整影响，适合用于测量时间间隔。每次 tick 获取一次 `Instant::now()` 并在该 tick 内复用同一时间戳，保持一致性。

### ProgressPayload 兼容性

`speed` 字段作为 `u64` 添加到 `ProgressPayload`，Serde 序列化后前端 JSON 中多出 `speed` key。由于前端使用 TypeScript 接口（非严格 schema 校验），新增字段天然向前兼容。

---

## Definition of Done

- [ ] `ProgressPayload` 包含 `speed: u64` 字段（bytes/sec）
- [ ] `start_emitter` 内维护滑动窗口（40 采样点 / 2 秒），每 50ms 计算速度
- [ ] `calculate_speed` 函数正确处理空窗口、单采样点、正常窗口三种情况
- [ ] 前端 `ProgressPayload` 和 `UploadTaskProgress` 类型包含 `speed` 字段
- [ ] `uploadStore.updateProgress` 传递 `speed` 到 active task
- [ ] `formatSpeed` 函数支持 B/s、KB/s、MB/s、GB/s 单位自动选择，0 值返回 `--`
- [ ] `UploadFileItem` 在上传中显示速度（进度百分比左侧）
- [ ] 上传完成后速度显示消失
- [ ] `cargo clippy` 无警告
- [ ] `cargo test` 全部通过（含速度计算相关测试）
- [ ] `pnpm test` 全部通过（含 formatSpeed 测试）
- [ ] 上传 500MB+ 文件时速度平滑显示，无剧烈跳动
- [ ] 多文件并发上传速度独立且准确
