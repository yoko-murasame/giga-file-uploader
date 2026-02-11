import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';

import UploadFileItem from '@/components/upload/UploadFileItem';
import { useUploadStore } from '@/stores/uploadStore';

import type { UploadTaskProgress } from '@/types/upload';

vi.mock('@/lib/tauri', () => ({
  startUpload: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <ul>{children}</ul>
    </Tooltip.Provider>
  );
}

describe('UploadFileItem', () => {
  const defaultProps = {
    id: 'test-id-1',
    fileName: 'document.pdf',
    fileSize: 1048576, // 1 MB
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    useUploadStore.setState({ pendingFiles: [], activeTasks: {} });
  });

  it('should render as a li element', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const listItem = screen.getByRole('listitem');
    expect(listItem).toBeInTheDocument();
  });

  it('should display the file name', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('should display formatted file size', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('should have truncate class on file name for long names', () => {
    render(
      <UploadFileItem
        {...defaultProps}
        fileName="a-very-long-file-name-that-should-be-truncated.pdf"
      />,
      { wrapper: Wrapper }
    );

    const nameEl = screen.getByText('a-very-long-file-name-that-should-be-truncated.pdf');
    expect(nameEl).toHaveClass('truncate');
  });

  it('should call onRemove with correct id when delete button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} onRemove={onRemove} />, {
      wrapper: Wrapper,
    });

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    // onRemove is called after 200ms timeout (or immediately with reduced motion)
    // With matchMedia mocked to matches: false (no reduced motion), wait for timeout
    await vi.waitFor(() => {
      expect(onRemove).toHaveBeenCalledWith('test-id-1');
    });
  });

  it('should have aria-label on delete button with file name', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const deleteButton = screen.getByRole('button', {
      name: '删除 document.pdf',
    });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should apply opacity-0 and max-h-0 classes after clicking delete', async () => {
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const listItem = screen.getByRole('listitem');
    expect(listItem).toHaveClass('opacity-100');

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    expect(listItem).toHaveClass('opacity-0', 'max-h-0');
  });

  it('should call onRemove immediately when prefers-reduced-motion is enabled', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} onRemove={onRemove} />, {
      wrapper: Wrapper,
    });

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    // Should be called immediately, not after a timeout
    expect(onRemove).toHaveBeenCalledWith('test-id-1');

    // li should NOT have removing classes since we skip animation
    const listItem = screen.getByRole('listitem');
    expect(listItem).not.toHaveClass('opacity-0');

    window.matchMedia = originalMatchMedia;
  });

  describe('with active task progress (single shard)', () => {
    const singleShardTask: UploadTaskProgress = {
      taskId: 'task-single',
      fileName: 'video.mp4',
      fileSize: 5242880,
      fileProgress: 45,
      shards: [{ shardIndex: 0, progress: 45, status: 'uploading' }],
      status: 'uploading',
    };

    beforeEach(() => {
      useUploadStore.setState({
        activeTasks: { 'task-single': singleShardTask },
      });
    });

    it('should render progress bar and percentage', () => {
      render(<UploadFileItem id="task-single" taskId="task-single" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('上传中')).toBeInTheDocument();
    });

    it('should display file name from task progress', () => {
      render(<UploadFileItem id="task-single" taskId="task-single" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('video.mp4')).toBeInTheDocument();
    });

    it('should not show shard details button for single shard', () => {
      render(<UploadFileItem id="task-single" taskId="task-single" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByText(/分片详情/)).not.toBeInTheDocument();
    });

    it('should hide delete button when uploading', () => {
      render(<UploadFileItem id="task-single" taskId="task-single" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    });
  });

  describe('with active task progress (multiple shards)', () => {
    const multiShardTask: UploadTaskProgress = {
      taskId: 'task-multi',
      fileName: 'archive.zip',
      fileSize: 3221225472,
      fileProgress: 60,
      shards: [
        { shardIndex: 0, progress: 100, status: 'completed' },
        { shardIndex: 1, progress: 80, status: 'uploading' },
        { shardIndex: 2, progress: 0, status: 'pending' },
      ],
      status: 'uploading',
    };

    beforeEach(() => {
      useUploadStore.setState({
        activeTasks: { 'task-multi': multiShardTask },
      });
    });

    it('should render overall progress bar and shard details button', () => {
      render(<UploadFileItem id="task-multi" taskId="task-multi" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('60%')).toBeInTheDocument();
      expect(screen.getByText(/分片详情/)).toBeInTheDocument();
      expect(screen.getByText(/分片详情 \(3\)/)).toBeInTheDocument();
    });

    it('should show shard sub-progress bars expanded by default', () => {
      render(<UploadFileItem id="task-multi" taskId="task-multi" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('分片 1')).toBeInTheDocument();
      expect(screen.getByText('分片 2')).toBeInTheDocument();
      expect(screen.getByText('分片 3')).toBeInTheDocument();
    });

    it('should collapse/expand shard details on button click', async () => {
      const user = userEvent.setup();

      render(<UploadFileItem id="task-multi" taskId="task-multi" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      // Initially expanded
      expect(screen.getByText('分片 1')).toBeInTheDocument();

      // Click to collapse
      const toggleButton = screen.getByText(/分片详情/);
      await user.click(toggleButton);

      expect(screen.queryByText('分片 1')).not.toBeInTheDocument();

      // Click to expand again
      await user.click(toggleButton);

      expect(screen.getByText('分片 1')).toBeInTheDocument();
    });
  });

  describe('status text display', () => {
    it('should display completed status text', () => {
      useUploadStore.setState({
        activeTasks: {
          'task-done': {
            taskId: 'task-done',
            fileName: 'done.txt',
            fileSize: 100,
            fileProgress: 100,
            shards: [{ shardIndex: 0, progress: 100, status: 'completed' }],
            status: 'completed',
          },
        },
      });

      render(<UploadFileItem id="task-done" taskId="task-done" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('已完成')).toBeInTheDocument();
    });

    it('should display error status text', () => {
      useUploadStore.setState({
        activeTasks: {
          'task-err': {
            taskId: 'task-err',
            fileName: 'fail.txt',
            fileSize: 100,
            fileProgress: 30,
            shards: [{ shardIndex: 0, progress: 30, status: 'error' }],
            status: 'error',
          },
        },
      });

      render(<UploadFileItem id="task-err" taskId="task-err" onRemove={() => {}} />, {
        wrapper: Wrapper,
      });

      expect(screen.getByText('出错')).toBeInTheDocument();
    });
  });
});
