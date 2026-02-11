import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import CopyButton from '@/components/shared/CopyButton';

// Mock the clipboard function from tauri.ts
vi.mock('@/lib/tauri', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call copyToClipboard when clicked', async () => {
    const { copyToClipboard } = await import('@/lib/tauri');

    render(<CopyButton text="https://46.gigafile.nu/abc123" />);

    const button = screen.getByRole('button', { name: '复制链接' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('https://46.gigafile.nu/abc123');
    });
  });

  it('should change aria-label to 已复制 after click', async () => {
    render(<CopyButton text="https://46.gigafile.nu/abc123" />);

    const button = screen.getByRole('button', { name: '复制链接' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
    });
  });

  it('should render with default aria-label 复制链接', () => {
    render(<CopyButton text="https://example.com" />);

    expect(screen.getByRole('button', { name: '复制链接' })).toBeInTheDocument();
  });

  it('should revert aria-label back to 复制链接 after 1.5s', async () => {
    vi.useFakeTimers();

    render(<CopyButton text="https://46.gigafile.nu/abc123" />);

    const button = screen.getByRole('button', { name: '复制链接' });

    // Use act to flush the async copyToClipboard promise + React state update
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();

    // Advance past the 1500ms timer and flush React updates
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByRole('button', { name: '复制链接' })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
