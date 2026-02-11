import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useUploadStore } from '@/stores/uploadStore';

import type { FileEntry } from '@/types/upload';

// Capture the event handler registered by the hook
let dragDropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null =
  null;
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn((handler) => {
      dragDropHandler = handler;
      return Promise.resolve(mockUnlisten);
    }),
  }),
}));

const mockResolveDroppedPaths = vi.fn<(paths: string[]) => Promise<FileEntry[]>>();

vi.mock('@/lib/tauri', () => ({
  resolveDroppedPaths: (...args: unknown[]) => mockResolveDroppedPaths(args[0] as string[]),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('useDragDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragDropHandler = null;
    mockResolveDroppedPaths.mockReset();
    useUploadStore.setState({ pendingFiles: [] });
  });

  it('should subscribe to drag-drop events on mount', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    renderHook(() => useDragDrop());

    // Wait for the async onDragDropEvent promise to resolve
    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });
  });

  it('should call unlisten on unmount', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { unmount } = renderHook(() => useDragDrop());

    // Wait for unlisten to be assigned
    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('should set isDragOver to true on dragenter (over event)', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { result } = renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    act(() => {
      dragDropHandler!({ payload: { type: 'over' } });
    });

    expect(result.current.isDragOver).toBe(true);
  });

  it('should set isDragOver to false on cancel event', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { result } = renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    // First set to true via over
    act(() => {
      dragDropHandler!({ payload: { type: 'over' } });
    });
    expect(result.current.isDragOver).toBe(true);

    // Then cancel
    act(() => {
      dragDropHandler!({ payload: { type: 'cancel' } });
    });
    expect(result.current.isDragOver).toBe(false);
  });

  it('should set isDragOver to false on drop and resolve paths', async () => {
    const mockEntries: FileEntry[] = [
      { fileName: 'test.txt', filePath: '/tmp/test.txt', fileSize: 100 },
    ];
    mockResolveDroppedPaths.mockResolvedValue(mockEntries);

    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { result } = renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    // Set over first
    act(() => {
      dragDropHandler!({ payload: { type: 'over' } });
    });
    expect(result.current.isDragOver).toBe(true);

    // Drop
    await act(async () => {
      dragDropHandler!({ payload: { type: 'drop', paths: ['/tmp/test.txt'] } });
    });

    expect(result.current.isDragOver).toBe(false);
    expect(mockResolveDroppedPaths).toHaveBeenCalledWith(['/tmp/test.txt']);
  });

  it('should call addFiles when drop resolves with entries', async () => {
    const mockEntries: FileEntry[] = [{ fileName: 'a.txt', filePath: '/tmp/a.txt', fileSize: 50 }];
    mockResolveDroppedPaths.mockResolvedValue(mockEntries);

    const addFilesSpy = vi.fn();
    useUploadStore.setState({ addFiles: addFilesSpy } as never);

    const { useDragDrop } = await import('@/hooks/useDragDrop');
    renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    await act(async () => {
      dragDropHandler!({ payload: { type: 'drop', paths: ['/tmp/a.txt'] } });
    });

    // Wait for the async handleDrop to complete
    await vi.waitFor(() => {
      expect(addFilesSpy).toHaveBeenCalledWith(mockEntries);
    });
  });

  it('should not call resolveDroppedPaths when drop has empty paths', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    await act(async () => {
      dragDropHandler!({ payload: { type: 'drop', paths: [] } });
    });

    expect(mockResolveDroppedPaths).not.toHaveBeenCalled();
  });

  it('should handle resolveDroppedPaths rejection gracefully', async () => {
    mockResolveDroppedPaths.mockRejectedValue(new Error('Permission denied'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useDragDrop } = await import('@/hooks/useDragDrop');
    renderHook(() => useDragDrop());

    await vi.waitFor(() => {
      expect(dragDropHandler).not.toBeNull();
    });

    await act(async () => {
      dragDropHandler!({ payload: { type: 'drop', paths: ['/no/access'] } });
    });

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to resolve dropped paths:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should report prefersReducedMotion from matchMedia', async () => {
    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { result } = renderHook(() => useDragDrop());

    // Default mock returns matches: false
    expect(result.current.prefersReducedMotion).toBe(false);
  });

  it('should report prefersReducedMotion as true when media query matches', async () => {
    // Override matchMedia to return matches: true
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    );

    const { useDragDrop } = await import('@/hooks/useDragDrop');
    const { result } = renderHook(() => useDragDrop());

    expect(result.current.prefersReducedMotion).toBe(true);

    matchMediaSpy.mockRestore();
  });
});
