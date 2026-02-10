# Zustand v5 Store Patterns for File Upload Queue Management

**Framework:** Zustand v5
**Topic:** Managing file upload queue with add/remove/update operations
**Confidence:** High
**Source:** Context7 - pmndrs/zustand official docs
**Researched:** 2026-02-11

## Overview

Zustand v5 with Immer middleware is the recommended pattern for managing file upload queues. Immer enables direct mutation syntax while maintaining immutable state updates, which simplifies add/remove/update operations on `Record<string, T>` structures.

## Recommended: Record-Based Store with Immer

Using `Record<string, FileEntry>` instead of arrays provides O(1) lookup by ID, which is critical for frequent progress updates during uploads.

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface FileEntry {
  id: string;
  name: string;
  path: string;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface UploadState {
  tasks: Record<string, FileEntry>;
}

interface UploadActions {
  addFiles: (files: Omit<FileEntry, 'status' | 'progress'>[]) => void;
  removeFile: (id: string) => void;
  updateProgress: (id: string, progress: number) => void;
  setStatus: (id: string, status: FileEntry['status'], error?: string) => void;
  clearCompleted: () => void;
}

export const useUploadStore = create<UploadState & UploadActions>()(
  immer((set) => ({
    tasks: {},

    addFiles: (files) =>
      set((state) => {
        for (const file of files) {
          state.tasks[file.id] = {
            ...file,
            status: 'pending',
            progress: 0,
          };
        }
      }),

    removeFile: (id) =>
      set((state) => {
        delete state.tasks[id];
      }),

    updateProgress: (id, progress) =>
      set((state) => {
        if (state.tasks[id]) {
          state.tasks[id].progress = progress;
        }
      }),

    setStatus: (id, status, error) =>
      set((state) => {
        if (state.tasks[id]) {
          state.tasks[id].status = status;
          if (error) state.tasks[id].error = error;
        }
      }),

    clearCompleted: () =>
      set((state) => {
        for (const id in state.tasks) {
          if (state.tasks[id].status === 'completed') {
            delete state.tasks[id];
          }
        }
      }),
  }))
);
```

## Immer Middleware Setup

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Basic pattern - immer wraps the store creator
const useStore = create<State & Actions>()(
  immer((set) => ({
    // state and actions
  }))
);
```

Key points:
- Import `immer` from `'zustand/middleware/immer'`
- Wrap the store creator function with `immer()`
- Inside `set()`, mutate `state` directly - Immer converts to immutable updates
- No need for spread operators (`...state`) or manual copying

## Selector Patterns for Performance

```typescript
// GOOD: Precise selector - only re-renders when this specific task changes
const task = useUploadStore((s) => s.tasks[taskId]);
const progress = useUploadStore((s) => s.tasks[taskId]?.progress);

// GOOD: Derived value with shallow comparison
import { useShallow } from 'zustand/react/shallow';

const taskIds = useUploadStore(useShallow((s) => Object.keys(s.tasks)));
const pendingCount = useUploadStore((s) =>
  Object.values(s.tasks).filter((t) => t.status === 'pending').length
);

// BAD: Never destructure entire store
const { tasks, addFiles } = useUploadStore(); // causes re-render on ANY state change
```

## Without Immer (Manual Immutable Updates)

For comparison, the same operations without Immer require manual spreading:

```typescript
addFiles: (files) =>
  set((state) => ({
    tasks: {
      ...state.tasks,
      ...Object.fromEntries(
        files.map((f) => [f.id, { ...f, status: 'pending' as const, progress: 0 }])
      ),
    },
  })),

removeFile: (id) =>
  set((state) => {
    const { [id]: _, ...rest } = state.tasks;
    return { tasks: rest };
  }),

updateProgress: (id, progress) =>
  set((state) => ({
    tasks: {
      ...state.tasks,
      [id]: { ...state.tasks[id], progress },
    },
  })),
```

This is more verbose and error-prone for nested updates. Immer is recommended for upload queue management.

## Key Patterns for Upload Queues

1. **Use `Record<string, T>` not arrays** - O(1) lookups for progress updates
2. **Use Immer middleware** - simplifies mutations, especially for nested state
3. **Status enums** - use string union types (`'pending' | 'uploading' | ...`), not boolean flags
4. **Precise selectors** - subscribe to individual task properties to minimize re-renders
5. **`useShallow`** - for derived arrays/objects to prevent unnecessary re-renders
6. **Guard mutations** - always check `if (state.tasks[id])` before mutating to handle race conditions
7. **Actions in store** - keep all mutations as store actions, components never call `set` directly
