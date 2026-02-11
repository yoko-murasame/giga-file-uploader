import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useUploadEvents } from '@/hooks/useUploadEvents';
import { useUploadStore } from '@/stores/uploadStore';

import type {
  AllCompletePayload,
  FileCompletePayload,
  ProgressPayload,
  UploadErrorPayload,
} from '@/types/upload';

type EventCallback<T> = (event: { payload: T }) => void;

const mockListeners: Map<string, EventCallback<unknown>> = new Map();
const mockUnlisteners: Array<vi.Mock> = [];

vi.mock('@/lib/tauri', () => ({
  startUpload: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn().mockImplementation((event: string, callback: EventCallback<unknown>) => {
    mockListeners.set(event, callback);
    const unlisten = vi.fn();
    mockUnlisteners.push(unlisten);
    return Promise.resolve(unlisten);
  }),
}));

describe('useUploadEvents', () => {
  beforeEach(() => {
    mockListeners.clear();
    mockUnlisteners.length = 0;
    useUploadStore.setState({ pendingFiles: [], activeTasks: {}, allUploadsComplete: false });
  });

  it('should subscribe to upload:progress and upload:error events on mount', async () => {
    renderHook(() => useUploadEvents());

    // Wait for async setup to complete
    await vi.waitFor(() => {
      expect(mockListeners.has('upload:progress')).toBe(true);
      expect(mockListeners.has('upload:error')).toBe(true);
      expect(mockListeners.has('upload:file-complete')).toBe(true);
      expect(mockListeners.has('upload:all-complete')).toBe(true);
    });
  });

  it('should call all unlisten functions on unmount', async () => {
    const { unmount } = renderHook(() => useUploadEvents());

    await vi.waitFor(() => {
      expect(mockUnlisteners).toHaveLength(4);
    });

    unmount();

    for (const unlisten of mockUnlisteners) {
      expect(unlisten).toHaveBeenCalled();
    }
  });

  it('should call updateProgress when progress event is received', async () => {
    useUploadStore.setState({
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'test.bin',
          fileSize: 1000,
          fileProgress: 0,
          shards: [],
          status: 'uploading',
        },
      },
    });

    renderHook(() => useUploadEvents());

    await vi.waitFor(() => {
      expect(mockListeners.has('upload:progress')).toBe(true);
    });

    const progressCallback = mockListeners.get('upload:progress') as EventCallback<ProgressPayload>;
    progressCallback({
      payload: {
        taskId: 'task-1',
        fileProgress: 50,
        shards: [{ shardIndex: 0, progress: 50, status: 'uploading' }],
      },
    });

    const task = useUploadStore.getState().activeTasks['task-1'];
    expect(task.fileProgress).toBe(50);
  });

  it('should call setTaskError when error event is received', async () => {
    useUploadStore.setState({
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'test.bin',
          fileSize: 1000,
          fileProgress: 30,
          shards: [],
          status: 'uploading',
        },
      },
    });

    renderHook(() => useUploadEvents());

    await vi.waitFor(() => {
      expect(mockListeners.has('upload:error')).toBe(true);
    });

    const errorCallback = mockListeners.get('upload:error') as EventCallback<UploadErrorPayload>;
    errorCallback({
      payload: {
        taskId: 'task-1',
        fileName: 'test.bin',
        errorMessage: 'Network error',
      },
    });

    const task = useUploadStore.getState().activeTasks['task-1'];
    expect(task.status).toBe('error');
  });

  it('should call setTaskFileComplete when file-complete event is received', async () => {
    useUploadStore.setState({
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'test.bin',
          fileSize: 1000,
          fileProgress: 90,
          shards: [],
          status: 'uploading',
        },
      },
    });

    renderHook(() => useUploadEvents());

    await vi.waitFor(() => {
      expect(mockListeners.has('upload:file-complete')).toBe(true);
    });

    const fileCompleteCallback = mockListeners.get('upload:file-complete') as EventCallback<FileCompletePayload>;
    fileCompleteCallback({
      payload: {
        taskId: 'task-1',
        fileName: 'test.bin',
        downloadUrl: 'https://46.gigafile.nu/abc123',
        fileSize: 1000,
      },
    });

    const task = useUploadStore.getState().activeTasks['task-1'];
    expect(task.status).toBe('completed');
    expect(task.fileProgress).toBe(100);
    expect(task.downloadUrl).toBe('https://46.gigafile.nu/abc123');
  });

  it('should call setAllComplete when all-complete event is received', async () => {
    renderHook(() => useUploadEvents());

    await vi.waitFor(() => {
      expect(mockListeners.has('upload:all-complete')).toBe(true);
    });

    const allCompleteCallback = mockListeners.get('upload:all-complete') as EventCallback<AllCompletePayload>;
    allCompleteCallback({
      payload: {},
    });

    expect(useUploadStore.getState().allUploadsComplete).toBe(true);
  });
});
