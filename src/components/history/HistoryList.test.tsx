import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HistoryList from '@/components/history/HistoryList';
import { useAppStore } from '@/stores/appStore';
import { useHistoryStore } from '@/stores/historyStore';

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
  getHistory: vi.fn(),
  deleteHistory: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

const sampleRecords: HistoryRecord[] = [
  {
    id: 'rec-1',
    fileName: 'photo.jpg',
    downloadUrl: 'https://46.gigafile.nu/abc123',
    fileSize: 1048576,
    uploadedAt: '2026-02-11T08:30:00+00:00',
    expiresAt: '2099-12-31T23:59:59+00:00',
  },
  {
    id: 'rec-2',
    fileName: 'document.pdf',
    downloadUrl: 'https://46.gigafile.nu/def456',
    fileSize: 2048000,
    uploadedAt: '2026-02-10T08:30:00+00:00',
    expiresAt: '2025-01-08T00:00:00+00:00',
  },
];

describe('HistoryList', () => {
  beforeEach(() => {
    useHistoryStore.setState({ records: [] });
    useAppStore.setState({ currentTab: 'history' });
    vi.clearAllMocks();
  });

  it('should render empty state when no records', () => {
    render(<HistoryList />);

    expect(screen.getByText('还没有上传记录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去上传' })).toBeInTheDocument();
  });

  it('should switch tab to upload when clicking go-upload button', async () => {
    const user = userEvent.setup();

    render(<HistoryList />);

    const goUploadButton = screen.getByRole('button', { name: '去上传' });
    await user.click(goUploadButton);

    expect(useAppStore.getState().currentTab).toBe('upload');
  });

  it('should render ul list when records exist', () => {
    useHistoryStore.setState({ records: sampleRecords });

    render(<HistoryList />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('should render file names for all records', () => {
    useHistoryStore.setState({ records: sampleRecords });

    render(<HistoryList />);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('should have aria-live polite on ul element', () => {
    useHistoryStore.setState({ records: sampleRecords });

    render(<HistoryList />);

    expect(screen.getByRole('list')).toHaveAttribute('aria-live', 'polite');
  });

  it('should not render empty state when records exist', () => {
    useHistoryStore.setState({ records: sampleRecords });

    render(<HistoryList />);

    expect(screen.queryByText('还没有上传记录')).not.toBeInTheDocument();
  });
});
