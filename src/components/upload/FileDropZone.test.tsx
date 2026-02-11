import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useUploadStore } from '@/stores/uploadStore';

import type { FileEntry } from '@/types/upload';

const mockOpenFilePicker = vi.fn();
const mockResolveDroppedPaths = vi.fn();

vi.mock('@/lib/tauri', () => ({
  openFilePicker: (...args: unknown[]) => mockOpenFilePicker(...args),
  resolveDroppedPaths: (...args: unknown[]) => mockResolveDroppedPaths(...args),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

import FileDropZone from '@/components/upload/FileDropZone';

describe('FileDropZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUploadStore.setState({ pendingFiles: [] });
    mockOpenFilePicker.mockResolvedValue(null);
    mockResolveDroppedPaths.mockResolvedValue([]);
  });

  describe('idle state (not collapsed)', () => {
    it('should render the default drop zone text', () => {
      render(<FileDropZone />);
      expect(screen.getByText('将文件拖到这里，或点击选择文件')).toBeInTheDocument();
    });

    it('should have role="button" accessibility attribute', () => {
      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      expect(dropZone).toBeInTheDocument();
    });

    it('should have aria-label="添加文件"', () => {
      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      expect(dropZone).toHaveAttribute('aria-label', '添加文件');
    });

    it('should have tabIndex=0 for keyboard focus', () => {
      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      expect(dropZone).toHaveAttribute('tabindex', '0');
    });

    it('should NOT contain a hidden file input element', () => {
      render(<FileDropZone />);
      const input = document.querySelector('input[type="file"]');
      expect(input).not.toBeInTheDocument();
    });

    it('should call openFilePicker on click', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
    });

    it('should call resolveDroppedPaths and addFiles when files are selected', async () => {
      const user = userEvent.setup();
      const mockEntries: FileEntry[] = [
        { id: '1', name: 'test.txt', path: '/tmp/test.txt', size: 100 },
        { id: '2', name: 'image.png', path: '/tmp/image.png', size: 200 },
      ];
      mockOpenFilePicker.mockResolvedValue(['/tmp/test.txt', '/tmp/image.png']);
      mockResolveDroppedPaths.mockResolvedValue(mockEntries);

      const addFilesSpy = vi.spyOn(useUploadStore.getState(), 'addFiles');

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockResolveDroppedPaths).toHaveBeenCalledWith(['/tmp/test.txt', '/tmp/image.png']);
      expect(addFilesSpy).toHaveBeenCalledWith(mockEntries);
    });

    it('should not call addFiles when user cancels file picker (returns null)', async () => {
      const user = userEvent.setup();
      mockOpenFilePicker.mockResolvedValue(null);

      const addFilesSpy = vi.spyOn(useUploadStore.getState(), 'addFiles');

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
      expect(mockResolveDroppedPaths).not.toHaveBeenCalled();
      expect(addFilesSpy).not.toHaveBeenCalled();
    });

    it('should call openFilePicker on Enter key', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      dropZone.focus();
      await user.keyboard('{Enter}');

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
    });

    it('should call openFilePicker on Space key', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      dropZone.focus();
      await user.keyboard(' ');

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
    });

    it('should not crash when openFilePicker throws an error', async () => {
      const user = userEvent.setup();
      mockOpenFilePicker.mockRejectedValue(new Error('Dialog plugin error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to open file picker:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should handle resolveDroppedPaths rejection after successful file selection', async () => {
      const user = userEvent.setup();
      mockOpenFilePicker.mockResolvedValue(['/tmp/test.txt']);
      mockResolveDroppedPaths.mockRejectedValue(new Error('IPC resolve error'));

      const addFilesSpy = vi.spyOn(useUploadStore.getState(), 'addFiles');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
      expect(mockResolveDroppedPaths).toHaveBeenCalledWith(['/tmp/test.txt']);
      expect(addFilesSpy).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to open file picker:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should not call addFiles when resolveDroppedPaths returns empty array', async () => {
      const user = userEvent.setup();
      mockOpenFilePicker.mockResolvedValue(['/tmp/gone.txt']);
      mockResolveDroppedPaths.mockResolvedValue([]);

      const addFilesSpy = vi.spyOn(useUploadStore.getState(), 'addFiles');

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
      expect(mockResolveDroppedPaths).toHaveBeenCalledWith(['/tmp/gone.txt']);
      expect(addFilesSpy).not.toHaveBeenCalled();
    });

    it('should prevent concurrent file picker invocations on rapid clicks', async () => {
      const user = userEvent.setup();
      let resolveFirst: ((value: string[] | null) => void) | undefined;
      mockOpenFilePicker.mockImplementationOnce(
        () =>
          new Promise<string[] | null>((resolve) => {
            resolveFirst = resolve;
          })
      );

      render(<FileDropZone />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });

      // First click - starts async operation
      await user.click(dropZone);
      // Second click - should be blocked by guard
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledTimes(1);

      // Resolve first call to clean up
      resolveFirst!(null);
    });
  });

  describe('collapsed state', () => {
    it('should render collapsed text', () => {
      render(<FileDropZone collapsed />);
      expect(screen.getByText('继续拖拽或点击添加文件')).toBeInTheDocument();
    });

    it('should still have role="button"', () => {
      render(<FileDropZone collapsed />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      expect(dropZone).toBeInTheDocument();
    });

    it('should still have aria-label="添加文件"', () => {
      render(<FileDropZone collapsed />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      expect(dropZone).toHaveAttribute('aria-label', '添加文件');
    });

    it('should NOT contain a hidden file input element', () => {
      render(<FileDropZone collapsed />);
      const input = document.querySelector('input[type="file"]');
      expect(input).not.toBeInTheDocument();
    });

    it('should call openFilePicker on click in collapsed mode', async () => {
      const user = userEvent.setup();
      render(<FileDropZone collapsed />);

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockOpenFilePicker).toHaveBeenCalledOnce();
    });

    it('should call resolveDroppedPaths and addFiles in collapsed mode', async () => {
      const user = userEvent.setup();
      const mockEntries: FileEntry[] = [
        { id: '3', name: 'doc.pdf', path: '/tmp/doc.pdf', size: 500 },
      ];
      mockOpenFilePicker.mockResolvedValue(['/tmp/doc.pdf']);
      mockResolveDroppedPaths.mockResolvedValue(mockEntries);

      const addFilesSpy = vi.spyOn(useUploadStore.getState(), 'addFiles');

      render(<FileDropZone collapsed />);
      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(mockResolveDroppedPaths).toHaveBeenCalledWith(['/tmp/doc.pdf']);
      expect(addFilesSpy).toHaveBeenCalledWith(mockEntries);
    });
  });
});
