import { create } from 'zustand';

import { startUpload as startUploadIpc, getSettings, saveSettings } from '@/lib/tauri';

import type { FileEntry, PendingFile, ProgressPayload, UploadTaskProgress } from '@/types/upload';

interface UploadState {
  pendingFiles: PendingFile[];
  activeTasks: Record<string, UploadTaskProgress>;
  allUploadsComplete: boolean;
  retentionDays: number;
  addFiles: (entries: FileEntry[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  startUpload: (lifetime: number) => Promise<void>;
  updateProgress: (payload: ProgressPayload) => void;
  setTaskError: (taskId: string) => void;
  setTaskCompleted: (taskId: string) => void;
  setTaskFileComplete: (taskId: string, downloadUrl: string) => void;
  setAllComplete: () => void;
  clearCompletedTasks: () => void;
  setRetentionDays: (days: number) => void;
  loadRetentionPreference: () => Promise<void>;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  pendingFiles: [],
  activeTasks: {},
  allUploadsComplete: false,
  retentionDays: 7,

  addFiles: (entries) =>
    set((state) => ({
      pendingFiles: [
        ...state.pendingFiles,
        ...entries.map(
          (entry): PendingFile => ({
            id: crypto.randomUUID(),
            fileName: entry.fileName,
            filePath: entry.filePath,
            fileSize: entry.fileSize,
            status: 'pending',
          })
        ),
      ],
    })),

  removeFile: (id) =>
    set((state) => ({
      pendingFiles: state.pendingFiles.filter((f) => f.id !== id),
    })),

  clearFiles: () => set({ pendingFiles: [] }),

  startUpload: async (lifetime) => {
    const { pendingFiles } = get();
    if (pendingFiles.length === 0) return;

    const files: FileEntry[] = pendingFiles.map((f) => ({
      fileName: f.fileName,
      filePath: f.filePath,
      fileSize: f.fileSize,
    }));

    let taskIds: string[];
    try {
      taskIds = await startUploadIpc(files, { lifetime });
    } catch (error) {
      console.error('Failed to start upload:', error);
      return;
    }

    const newActiveTasks: Record<string, UploadTaskProgress> = {};
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      newActiveTasks[taskId] = {
        taskId,
        fileName: files[i].fileName,
        fileSize: files[i].fileSize,
        fileProgress: 0,
        shards: [],
        status: 'uploading',
      };
    }

    set((state) => ({
      pendingFiles: [],
      activeTasks: { ...state.activeTasks, ...newActiveTasks },
      allUploadsComplete: false,
    }));
  },

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
            speed: payload.speed,
          },
        },
      };
    }),

  setTaskError: (taskId) =>
    set((state) => {
      const existing = state.activeTasks[taskId];
      if (!existing) return state;
      return {
        activeTasks: {
          ...state.activeTasks,
          [taskId]: { ...existing, status: 'error' },
        },
      };
    }),

  setTaskCompleted: (taskId) =>
    set((state) => {
      const existing = state.activeTasks[taskId];
      if (!existing) return state;
      return {
        activeTasks: {
          ...state.activeTasks,
          [taskId]: { ...existing, status: 'completed', fileProgress: 100 },
        },
      };
    }),

  setTaskFileComplete: (taskId, downloadUrl) =>
    set((state) => {
      const existing = state.activeTasks[taskId];
      if (!existing) return state;
      return {
        activeTasks: {
          ...state.activeTasks,
          [taskId]: {
            ...existing,
            status: 'completed',
            fileProgress: 100,
            downloadUrl,
          },
        },
      };
    }),

  setAllComplete: () => set({ allUploadsComplete: true }),

  clearCompletedTasks: () => set({ activeTasks: {}, allUploadsComplete: false }),

  setRetentionDays: (days) => {
    set({ retentionDays: days });
    saveSettings({ retentionDays: days }).catch((error) => {
      console.error('Failed to save retention preference:', error);
    });
  },

  loadRetentionPreference: async () => {
    try {
      const settings = await getSettings();
      set({ retentionDays: settings.retentionDays });
    } catch (error) {
      console.error('Failed to load retention preference:', error);
    }
  },
}));
