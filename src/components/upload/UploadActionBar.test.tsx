import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import UploadActionBar from '@/components/upload/UploadActionBar';
import { useUploadStore } from '@/stores/uploadStore';
import { useAppStore } from '@/stores/appStore';

vi.mock('@/lib/tauri', () => ({
  startUpload: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  checkNetwork: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('UploadActionBar', () => {
  beforeEach(() => {
    useAppStore.setState({ isOnline: true });
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {},
      allUploadsComplete: false,
      retentionDays: 7,
    });
  });

  it('should not render when there are no pending files and no active tasks', () => {
    const { container } = render(<UploadActionBar />);
    expect(container.querySelector('nav')).not.toBeInTheDocument();
  });

  it('should render file stats and enabled start button when there are pending files', () => {
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 1048576,
          status: 'pending' as const,
        },
        {
          id: '2',
          fileName: 'b.txt',
          filePath: '/b.txt',
          fileSize: 2097152,
          status: 'pending' as const,
        },
      ],
    });

    render(<UploadActionBar />);

    expect(screen.getByText('2 个文件，3.0 MB')).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: '开始上传' });
    expect(startButton).toBeInTheDocument();
    expect(startButton).not.toBeDisabled();
  });

  it('should call startUpload(7) when start button is clicked', async () => {
    const startUploadMock = vi.fn().mockResolvedValue(undefined);
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 100,
          status: 'pending' as const,
        },
      ],
      startUpload: startUploadMock,
    });

    const user = userEvent.setup();
    render(<UploadActionBar />);

    await user.click(screen.getByRole('button', { name: '开始上传' }));
    expect(startUploadMock).toHaveBeenCalledWith(7);
  });

  it('should disable start button immediately on click to prevent double-click', async () => {
    let resolveUpload: () => void;
    const startUploadMock = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpload = resolve;
        })
    );
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 100,
          status: 'pending' as const,
        },
      ],
      startUpload: startUploadMock,
    });

    const user = userEvent.setup();
    render(<UploadActionBar />);

    const button = screen.getByRole('button', { name: '开始上传' });
    expect(button).not.toBeDisabled();

    // Click once - button should become disabled immediately (before IPC resolves)
    await user.click(button);
    expect(button).toBeDisabled();
    expect(startUploadMock).toHaveBeenCalledTimes(1);

    // Resolve the pending upload inside act to flush state update
    await act(async () => {
      resolveUpload!();
    });
  });

  it('should disable start button when uploading', () => {
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'a.txt',
          fileSize: 100,
          fileProgress: 50,
          shards: [],
          status: 'uploading',
        },
      },
    });

    render(<UploadActionBar />);

    expect(screen.getByText('1 个文件上传中')).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: '开始上传' });
    expect(startButton).toBeDisabled();
  });

  it('should show completed stats and clear button when all uploads complete', () => {
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'a.txt',
          fileSize: 100,
          fileProgress: 100,
          shards: [],
          status: 'completed',
        },
        'task-2': {
          taskId: 'task-2',
          fileName: 'b.txt',
          fileSize: 200,
          fileProgress: 100,
          shards: [],
          status: 'completed',
        },
      },
      allUploadsComplete: true,
    });

    render(<UploadActionBar />);

    expect(screen.getByText('2 个文件上传完成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空列表' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始上传' })).not.toBeInTheDocument();
  });

  it('should call clearCompletedTasks when clear button is clicked', async () => {
    const clearMock = vi.fn();
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'a.txt',
          fileSize: 100,
          fileProgress: 100,
          shards: [],
          status: 'completed',
        },
      },
      allUploadsComplete: true,
      clearCompletedTasks: clearMock,
    });

    const user = userEvent.setup();
    render(<UploadActionBar />);

    await user.click(screen.getByRole('button', { name: '清空列表' }));
    expect(clearMock).toHaveBeenCalled();
  });

  it('should show failed stats and clear button when all tasks have error status', () => {
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'a.txt',
          fileSize: 100,
          fileProgress: 30,
          shards: [],
          status: 'error',
        },
        'task-2': {
          taskId: 'task-2',
          fileName: 'b.txt',
          fileSize: 200,
          fileProgress: 10,
          shards: [],
          status: 'error',
        },
      },
      allUploadsComplete: false,
    });

    render(<UploadActionBar />);

    expect(screen.getByText('2 个文件上传失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空列表' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始上传' })).not.toBeInTheDocument();
  });

  it('should call clearCompletedTasks when clear button is clicked in allFailed state', async () => {
    const clearMock = vi.fn();
    useUploadStore.setState({
      pendingFiles: [],
      activeTasks: {
        'task-1': {
          taskId: 'task-1',
          fileName: 'a.txt',
          fileSize: 100,
          fileProgress: 30,
          shards: [],
          status: 'error',
        },
      },
      allUploadsComplete: false,
      clearCompletedTasks: clearMock,
    });

    const user = userEvent.setup();
    render(<UploadActionBar />);

    await user.click(screen.getByRole('button', { name: '清空列表' }));
    expect(clearMock).toHaveBeenCalled();
  });

  it('should have correct accessibility attributes', () => {
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 100,
          status: 'pending' as const,
        },
      ],
    });

    render(<UploadActionBar />);

    const nav = screen.getByRole('navigation', { name: '上传操作' });
    expect(nav).toBeInTheDocument();

    const statsText = screen.getByText(/个文件/);
    expect(statsText).toHaveAttribute('aria-live', 'polite');
  });

  it('should disable start button when offline', () => {
    useAppStore.setState({ isOnline: false });
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 100,
          status: 'pending' as const,
        },
      ],
    });

    render(<UploadActionBar />);

    const startButton = screen.getByRole('button', { name: '开始上传' });
    expect(startButton).toBeDisabled();
  });

  it('should show offline message when offline and no active tasks', () => {
    useAppStore.setState({ isOnline: false });
    useUploadStore.setState({
      pendingFiles: [
        {
          id: '1',
          fileName: 'a.txt',
          filePath: '/a.txt',
          fileSize: 100,
          status: 'pending' as const,
        },
      ],
    });

    render(<UploadActionBar />);

    expect(screen.getByText('当前无网络连接，请连接网络后上传')).toBeInTheDocument();
  });
});
