import { create } from 'zustand';

import type { FileEntry, PendingFile } from '@/types/upload';

interface UploadState {
  pendingFiles: PendingFile[];
  addFiles: (entries: FileEntry[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  pendingFiles: [],

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
          }),
        ),
      ],
    })),

  removeFile: (id) =>
    set((state) => ({
      pendingFiles: state.pendingFiles.filter((f) => f.id !== id),
    })),

  clearFiles: () => set({ pendingFiles: [] }),
}));
