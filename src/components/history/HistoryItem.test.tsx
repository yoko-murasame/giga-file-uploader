import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HistoryItem from '@/components/history/HistoryItem';

import type { HistoryRecord } from '@/types/history';

// Mock CopyButton to avoid clipboard API dependency
vi.mock('@/components/shared/CopyButton', () => ({
  default: ({ text, className }: { text: string; className?: string }) => (
    <button data-testid="copy-button" data-text={text} className={className}>
      Copy
    </button>
  ),
}));

vi.mock('@/lib/tauri', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

const activeRecord: HistoryRecord = {
  id: 'rec-1',
  fileName: 'photo.jpg',
  downloadUrl: 'https://46.gigafile.nu/abc123',
  fileSize: 1048576,
  uploadedAt: '2026-02-11T08:30:00+00:00',
  expiresAt: '2099-12-31T23:59:59+00:00',
};

const expiredRecord: HistoryRecord = {
  id: 'rec-2',
  fileName: 'old-document.pdf',
  downloadUrl: 'https://46.gigafile.nu/def456',
  fileSize: 2048000,
  uploadedAt: '2025-01-01T00:00:00+00:00',
  expiresAt: '2025-01-08T00:00:00+00:00',
};

describe('HistoryItem', () => {
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render file name, dates, link, and active status label', () => {
    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('有效')).toBeInTheDocument();
    expect(screen.getByText('https://46.gigafile.nu/abc123')).toBeInTheDocument();
  });

  it('should render expired status label for expired record', () => {
    render(
      <ul>
        <HistoryItem record={expiredRecord} onDelete={onDelete} />
      </ul>
    );

    expect(screen.getByText('已过期')).toBeInTheDocument();
    expect(screen.queryByText('有效')).not.toBeInTheDocument();
  });

  it('should apply opacity-50 to CopyButton for expired record', () => {
    render(
      <ul>
        <HistoryItem record={expiredRecord} onDelete={onDelete} />
      </ul>
    );

    const copyButton = screen.getByTestId('copy-button');
    expect(copyButton).toHaveClass('opacity-50');
  });

  it('should not apply opacity-50 to CopyButton for active record', () => {
    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const copyButton = screen.getByTestId('copy-button');
    expect(copyButton).not.toHaveClass('opacity-50');
  });

  it('should pass download URL to CopyButton', () => {
    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const copyButton = screen.getByTestId('copy-button');
    expect(copyButton).toHaveAttribute('data-text', 'https://46.gigafile.nu/abc123');
  });

  it('should show confirm text on first delete click', async () => {
    const user = userEvent.setup();

    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const deleteButton = screen.getByRole('button', { name: '删除记录' });
    await user.click(deleteButton);

    expect(screen.getByText('确认删除？')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('should call onDelete on second click (confirm)', async () => {
    const user = userEvent.setup();

    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const deleteButton = screen.getByRole('button', { name: '删除记录' });
    await user.click(deleteButton);

    const confirmButton = screen.getByText('确认删除？');
    await user.click(confirmButton);

    expect(onDelete).toHaveBeenCalledWith('rec-1');
  });

  it('should revert confirm state after 3 seconds', async () => {
    vi.useFakeTimers();

    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const deleteButton = screen.getByRole('button', { name: '删除记录' });

    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(screen.getByText('确认删除？')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('确认删除？')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除记录' })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('should display file size', () => {
    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('should have title attribute on file name for tooltip', () => {
    render(
      <ul>
        <HistoryItem record={activeRecord} onDelete={onDelete} />
      </ul>
    );

    const fileName = screen.getByText('photo.jpg');
    expect(fileName).toHaveAttribute('title', 'photo.jpg');
  });
});
