import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useUploadStore } from '@/stores/uploadStore';

// Mock Tauri IPC (specific to this test)
vi.mock('@/lib/tauri', () => ({
  resolveDroppedPaths: vi.fn().mockResolvedValue([]),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

import FileDropZone from '@/components/upload/FileDropZone';

describe('FileDropZone', () => {
  beforeEach(() => {
    useUploadStore.setState({ pendingFiles: [] });
  });

  describe('idle state (not collapsed)', () => {
    it('should render the default drop zone text', () => {
      render(<FileDropZone />);
      expect(
        screen.getByText('将文件拖到这里，或点击选择文件'),
      ).toBeInTheDocument();
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

    it('should contain a hidden file input', () => {
      render(<FileDropZone />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('multiple');
    });

    it('should trigger file input on click', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should trigger file input on Enter key', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      dropZone.focus();
      await user.keyboard('{Enter}');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should trigger file input on Space key', async () => {
      const user = userEvent.setup();
      render(<FileDropZone />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      dropZone.focus();
      await user.keyboard(' ');

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('collapsed state', () => {
    it('should render collapsed text', () => {
      render(<FileDropZone collapsed />);
      expect(
        screen.getByText('继续拖拽或点击添加文件'),
      ).toBeInTheDocument();
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

    it('should have a hidden file input', () => {
      render(<FileDropZone collapsed />);
      const input = document.querySelector('input[type="file"]');
      expect(input).toBeInTheDocument();
    });

    it('should trigger file input on click in collapsed mode', async () => {
      const user = userEvent.setup();
      render(<FileDropZone collapsed />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const clickSpy = vi.spyOn(input, 'click');

      const dropZone = screen.getByRole('button', { name: '添加文件' });
      await user.click(dropZone);

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
