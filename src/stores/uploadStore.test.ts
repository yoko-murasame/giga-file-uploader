import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useUploadStore } from '@/stores/uploadStore';

import type { FileEntry, ProgressPayload } from '@/types/upload';

// Mock the tauri IPC module
vi.mock('@/lib/tauri', () => ({
  startUpload: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('uploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({ pendingFiles: [], activeTasks: {} });
  });

  describe('addFiles', () => {
    it('should add files to an empty queue', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(2);
      expect(pendingFiles[0].fileName).toBe('a.txt');
      expect(pendingFiles[0].filePath).toBe('/path/a.txt');
      expect(pendingFiles[0].fileSize).toBe(100);
      expect(pendingFiles[0].status).toBe('pending');
      expect(pendingFiles[0].id).toBeTruthy();
      expect(pendingFiles[1].fileName).toBe('b.txt');
    });

    it('should generate unique ids for each file', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles[0].id).not.toBe(pendingFiles[1].id);
    });

    it('should append files without overwriting existing ones', () => {
      const first: FileEntry[] = [{ fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 }];
      const second: FileEntry[] = [{ fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 }];

      useUploadStore.getState().addFiles(first);
      const firstId = useUploadStore.getState().pendingFiles[0].id;

      useUploadStore.getState().addFiles(second);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(2);
      expect(pendingFiles[0].id).toBe(firstId);
      expect(pendingFiles[0].fileName).toBe('a.txt');
      expect(pendingFiles[1].fileName).toBe('b.txt');
    });

    it('should handle empty entries array', () => {
      useUploadStore.getState().addFiles([]);
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });
  });

  describe('removeFile', () => {
    it('should remove a file by id', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);
      const idToRemove = useUploadStore.getState().pendingFiles[0].id;

      useUploadStore.getState().removeFile(idToRemove);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(1);
      expect(pendingFiles[0].fileName).toBe('b.txt');
    });

    it('should do nothing if id does not exist', () => {
      const entries: FileEntry[] = [{ fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 }];

      useUploadStore.getState().addFiles(entries);
      useUploadStore.getState().removeFile('nonexistent-id');

      expect(useUploadStore.getState().pendingFiles).toHaveLength(1);
    });
  });

  describe('clearFiles', () => {
    it('should clear all pending files', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);
      expect(useUploadStore.getState().pendingFiles).toHaveLength(2);

      useUploadStore.getState().clearFiles();
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });

    it('should work on already empty queue', () => {
      useUploadStore.getState().clearFiles();
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });
  });

  describe('updateProgress', () => {
    it('should update progress for an active task', () => {
      // Set up an active task
      useUploadStore.setState({
        activeTasks: {
          'task-1': {
            taskId: 'task-1',
            fileProgress: 0,
            shards: [],
            status: 'uploading',
          },
        },
      });

      const payload: ProgressPayload = {
        taskId: 'task-1',
        fileProgress: 50.5,
        shards: [{ shardIndex: 0, progress: 50.5, status: 'uploading' }],
      };

      useUploadStore.getState().updateProgress(payload);

      const task = useUploadStore.getState().activeTasks['task-1'];
      expect(task.fileProgress).toBe(50.5);
      expect(task.shards).toHaveLength(1);
      expect(task.shards[0].progress).toBe(50.5);
      expect(task.shards[0].status).toBe('uploading');
      expect(task.status).toBe('uploading');
    });

    it('should not modify state for non-existent task', () => {
      const payload: ProgressPayload = {
        taskId: 'non-existent',
        fileProgress: 50,
        shards: [],
      };

      useUploadStore.getState().updateProgress(payload);

      expect(useUploadStore.getState().activeTasks['non-existent']).toBeUndefined();
    });

    it('should not affect other active tasks', () => {
      useUploadStore.setState({
        activeTasks: {
          'task-1': {
            taskId: 'task-1',
            fileProgress: 10,
            shards: [],
            status: 'uploading',
          },
          'task-2': {
            taskId: 'task-2',
            fileProgress: 20,
            shards: [],
            status: 'uploading',
          },
        },
      });

      const payload: ProgressPayload = {
        taskId: 'task-1',
        fileProgress: 75,
        shards: [],
      };

      useUploadStore.getState().updateProgress(payload);

      expect(useUploadStore.getState().activeTasks['task-1'].fileProgress).toBe(75);
      expect(useUploadStore.getState().activeTasks['task-2'].fileProgress).toBe(20);
    });
  });

  describe('setTaskError', () => {
    it('should set task status to error', () => {
      useUploadStore.setState({
        activeTasks: {
          'task-1': {
            taskId: 'task-1',
            fileProgress: 30,
            shards: [],
            status: 'uploading',
          },
        },
      });

      useUploadStore.getState().setTaskError('task-1');

      const task = useUploadStore.getState().activeTasks['task-1'];
      expect(task.status).toBe('error');
      expect(task.fileProgress).toBe(30);
    });

    it('should not modify state for non-existent task', () => {
      useUploadStore.getState().setTaskError('non-existent');
      expect(useUploadStore.getState().activeTasks['non-existent']).toBeUndefined();
    });
  });

  describe('setTaskCompleted', () => {
    it('should set task status to completed and progress to 100', () => {
      useUploadStore.setState({
        activeTasks: {
          'task-1': {
            taskId: 'task-1',
            fileProgress: 95,
            shards: [],
            status: 'uploading',
          },
        },
      });

      useUploadStore.getState().setTaskCompleted('task-1');

      const task = useUploadStore.getState().activeTasks['task-1'];
      expect(task.status).toBe('completed');
      expect(task.fileProgress).toBe(100);
    });
  });

  describe('startUpload', () => {
    it('should clear pendingFiles and create activeTasks on success', async () => {
      const { startUpload: startUploadMock } = await import('@/lib/tauri');
      vi.mocked(startUploadMock).mockResolvedValueOnce(['task-a', 'task-b']);

      useUploadStore.getState().addFiles([
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ]);
      expect(useUploadStore.getState().pendingFiles).toHaveLength(2);

      await useUploadStore.getState().startUpload(7);

      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
      const tasks = useUploadStore.getState().activeTasks;
      expect(Object.keys(tasks)).toHaveLength(2);
      expect(tasks['task-a'].status).toBe('uploading');
      expect(tasks['task-a'].fileProgress).toBe(0);
      expect(tasks['task-b'].status).toBe('uploading');
    });

    it('should not call IPC when no pending files', async () => {
      const { startUpload: startUploadMock } = await import('@/lib/tauri');
      vi.mocked(startUploadMock).mockClear();

      await useUploadStore.getState().startUpload(7);

      expect(startUploadMock).not.toHaveBeenCalled();
    });
  });
});
