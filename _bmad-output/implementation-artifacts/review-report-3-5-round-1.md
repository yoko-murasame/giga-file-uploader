# Code Review Report: Story 3-5 (Round 1)

## Review Metadata

| Field | Value |
|-------|-------|
| Story Key | 3-5 |
| Review Round | 1 |
| Reviewer Persona | BMM Architect (Winston) |
| Strictness | strict |
| Degradation Applied | none |
| Verdict | **needs-fix** |

## Findings Summary

| Severity | Count |
|----------|-------|
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 2 |
| **Total** | **7** |

---

## Findings

### RR-001 [HIGH] — UploadTaskProgress 缺少 fileName/fileSize 字段导致活跃任务显示 UUID

**Category:** functional-defect

**Description:**
`UploadTaskProgress` 类型 (`src/types/upload.ts:28-33`) 未定义 `fileName` 和 `fileSize` 字段。当文件从 `pendingFiles` 转入 `activeTasks` 时，文件元数据丢失。`uploadStore.ts:58-66` 的 `startUpload` action 创建 `UploadTaskProgress` 时只存储 `taskId`，不保留文件名和大小。

直接后果：`UploadFileList.tsx:26-27` 被迫将 `task.taskId`（一个 UUID 字符串）作为 `fileName` 传递，`fileSize` 硬编码为 `0`。用户在上传过程中看到的不是文件名而是一串随机 UUID，文件大小显示为 `0 B`。这违反了 AC-7 的 "显示文件名" 要求和 FR14 的用户体验目标。

**Affected Files:**
- `src/types/upload.ts:28-33`
- `src/stores/uploadStore.ts:58-66`
- `src/components/upload/UploadFileList.tsx:23-30`

**Fix Instruction:**
1. 在 `UploadTaskProgress` interface 中添加 `fileName: string` 和 `fileSize: number` 字段
2. 在 `startUpload` action 中利用 `taskIds` 与 `files` 的索引对应关系，将 `fileName` 和 `fileSize` 映射到每个 `UploadTaskProgress`
3. 在 `UploadFileList.tsx` 中使用 `task.fileName` 和 `task.fileSize` 替代当前的 `task.taskId` 和 `0`

---

### RR-002 [MEDIUM] — useUploadEvents 清理函数存在竞态条件导致事件监听泄漏

**Category:** error-handling

**Description:**
`useUploadEvents.ts:10-28` 中，`setup()` 是异步的，但 cleanup 函数同步执行。如果组件在 `setup()` 的 `await listen(...)` resolve 之前卸载，`unlisteners` 数组仍然为空，cleanup 不会调用任何 unlisten 函数，导致事件监听器泄漏。

对比同项目中 `useDragDrop.ts:47-75` 使用了 `cancelled` 标志位模式正确处理了这种竞态，`useUploadEvents` 缺少同等保护。

**Affected Files:**
- `src/hooks/useUploadEvents.ts:9-29`

**Fix Instruction:**
参照 `useDragDrop.ts` 的模式，添加 `cancelled` 标志位：
```typescript
useEffect(() => {
  let cancelled = false;
  const cleanups: Array<() => void> = [];

  const setup = async () => {
    const unlisten1 = await listen<ProgressPayload>('upload:progress', (event) => {
      useUploadStore.getState().updateProgress(event.payload);
    });
    if (cancelled) { unlisten1(); return; }
    cleanups.push(unlisten1);
    // ... same for unlisten2
  };

  setup();

  return () => {
    cancelled = true;
    cleanups.forEach((fn) => fn());
  };
}, []);
```

---

### RR-003 [MEDIUM] — startUpload action 缺少错误处理，IPC 失败时用户无反馈

**Category:** error-handling

**Description:**
`uploadStore.ts:46-72` 中 `startUpload` action 直接 `await startUploadIpc(files, { lifetime })` 但没有 try/catch。如果 IPC 调用失败（如服务器发现失败、网络错误），异常向上传播但无人处理。`pendingFiles` 保持不变但 UI 不知道出了问题，用户看到文件列表停留在 "等待中" 状态且没有任何错误提示。

**Affected Files:**
- `src/stores/uploadStore.ts:46-72`

**Fix Instruction:**
用 try/catch 包裹 IPC 调用。捕获异常时可以 `console.error` 记录日志，并保持 `pendingFiles` 不变（不清空），让用户可以重试。如果需要更好的用户体验，可以在 store 中添加一个 `uploadError` 状态字段供 UI 展示错误信息。至少需要 try/catch 防止 unhandled promise rejection。

---

### RR-004 [MEDIUM] — activeTasks 选择器粒度过粗导致所有 UploadFileItem 每 50ms 重渲染

**Category:** performance

**Description:**
`UploadPage.tsx:8` 中 `const activeTasks = useUploadStore((s) => s.activeTasks)` 订阅了整个 `activeTasks` 对象。由于 `updateProgress` action 使用不可变更新（spread 创建新对象引用），每 50ms 的进度事件都会触发 UploadPage 重渲染。

UploadPage 将 `activeTasks` 传递给 UploadFileList（未用 memo 包裹），UploadFileList 遍历所有 task 生成 UploadFileItem props。虽然 UploadFileItem 使用了 `memo`，但 `taskProgress` prop 是每次从 spread 出来的新对象引用，memo 浅比较失败，导致所有 UploadFileItem 每 50ms 全部重渲染。

这违反了 AC-7 的要求："使用 Zustand 精确选择器...仅变化的文件/分片触发重渲染"。

**Affected Files:**
- `src/components/upload/UploadPage.tsx:8`
- `src/components/upload/UploadFileList.tsx:13-31`
- `src/components/upload/UploadFileItem.tsx:15` (taskProgress prop)

**Fix Instruction:**
推荐的架构调整：
1. UploadFileList 只从 store 订阅活跃任务的 ID 列表（`Object.keys(activeTasks)`），用于渲染列表结构
2. 每个 UploadFileItem 内部使用精确选择器 `useUploadStore(s => s.activeTasks[taskId])` 直接从 store 获取自己的进度数据
3. 这样只有进度实际变化的 task 对应的 UploadFileItem 会重渲染

---

### RR-005 [MEDIUM] — AC-7 (UploadFileItem 进度展示) 无测试覆盖

**Category:** test-coverage

**Description:**
`UploadFileItem.test.tsx` 中所有测试用例仅覆盖 pending 状态（无 taskProgress prop）。没有任何测试验证以下 AC-7 要求的行为：
- 提供 `taskProgress` 后进度条是否渲染
- 单分片 vs 多分片的不同展示逻辑
- 分片折叠/展开交互
- 状态文字（"上传中"/"已完成"/"出错"）是否正确显示
- 百分比数字是否正确渲染

AC-7 定义的6个子行为目前没有一个被测试覆盖。如果进度条 UI 被意外删除或修改，没有测试会失败。

**Affected Files:**
- `src/components/upload/UploadFileItem.test.tsx`

**Fix Instruction:**
追加以下测试用例：
1. 传入单分片 `taskProgress`（shards.length === 1），验证渲染一根进度条 + 百分比数字 + "上传中" 文字
2. 传入多分片 `taskProgress`（shards.length > 1），验证渲染整体进度条 + "分片详情" 折叠按钮 + 子进度条列表
3. 验证点击折叠按钮可以收起/展开分片详情
4. 验证 status 为 'completed' 时显示 "已完成"，status 为 'error' 时显示 "出错"
5. 验证上传中状态下不显示删除按钮

---

### RR-006 [LOW] — useUploadEvents hook 无独立测试文件

**Category:** test-coverage

**Description:**
`useUploadEvents` hook 的事件订阅和清理逻辑没有单独的测试文件。考虑到 RR-002 中发现的竞态条件 bug，如果有 unmount 清理的测试，该 bug 有可能被提前发现。同项目中 `useDragDrop.ts` 有配套的 `useDragDrop.test.ts`，但 `useUploadEvents.ts` 没有。

**Affected Files:**
- （缺失文件）`src/hooks/useUploadEvents.test.ts`

**Fix Instruction:**
创建 `src/hooks/useUploadEvents.test.ts`，至少包含：
1. mount 时订阅 `upload:progress` 和 `upload:error` 事件
2. unmount 时调用所有 unlisten 函数
3. 收到 progress 事件时调用 `updateProgress` action
4. 收到 error 事件时调用 `setTaskError` action

---

### RR-007 [LOW] — shard_status_to_string 在热路径上每次分配堆内存

**Category:** performance

**Description:**
`progress.rs:172-178` 中 `shard_status_to_string()` 每次调用都通过 `.to_string()` 分配一个新的堆 `String`。该函数在 50ms 定时器的 emitter 循环中被调用，对于多文件多分片场景，每秒会执行 20 * (任务数 * 分片数) 次堆分配。

**Affected Files:**
- `src-tauri/src/services/progress.rs:172-178`

**Fix Instruction:**
返回 `&'static str` 而非 `String`，避免堆分配：
```rust
fn shard_status_to_str(status: &ShardStatus) -> &'static str {
    match status {
        ShardStatus::Pending => "pending",
        ShardStatus::Uploading => "uploading",
        ShardStatus::Completed => "completed",
        ShardStatus::Error => "error",
    }
}
```
同时将 `ShardProgressPayload.status` 字段类型保持为 `String`（serde 需要），在构建 payload 时使用 `.to_string()`，或者将字段改为 `&'static str`（serde 同样支持序列化 `&str`，但需要生命周期标注，可能过度改动）。最简方案是修改返回值和调用点即可。

---

## Checklist Results

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | AC Coverage | **FAIL** | AC-7 要求显示文件名，但活跃任务显示的是 UUID (RR-001) |
| 2 | Test Coverage | **FAIL** | AC-7 进度 UI 无测试 (RR-005)，useUploadEvents 无测试 (RR-006) |
| 3 | Error Handling | **FAIL** | startUpload IPC 失败无处理 (RR-003)，useUploadEvents 清理竞态 (RR-002) |
| 4 | Security Baseline | PASS | 无硬编码凭证，无 SQL 拼接，无 XSS 向量 |
| 5 | Performance Baseline | **FAIL** | activeTasks 粗选择器导致全量重渲染 (RR-004) |
| 6 | Scope Compliance | PASS | 所有修改在声明范围内 |

## Verdict

**needs-fix** — 1 个 HIGH (用户可见功能缺陷) + 4 个 MEDIUM (错误处理/性能/测试覆盖) + 2 个 LOW。strict 模式下所有问题都需修复。
