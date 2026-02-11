import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import HistoryPage from '@/components/history/HistoryPage';
import { useHistoryStore } from '@/stores/historyStore';

// Mock child component to isolate HistoryPage logic
vi.mock('@/components/history/HistoryList', () => ({
  default: () => <div data-testid="history-list">HistoryList</div>,
}));

vi.mock('@/lib/tauri', () => ({
  getHistory: vi.fn().mockResolvedValue([]),
  deleteHistory: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('HistoryPage', () => {
  beforeEach(() => {
    useHistoryStore.setState({ records: [] });
    vi.clearAllMocks();
  });

  it('should call loadHistory on mount', () => {
    const loadHistorySpy = vi.fn();
    useHistoryStore.setState({ loadHistory: loadHistorySpy });

    render(<HistoryPage />);

    expect(loadHistorySpy).toHaveBeenCalledOnce();
  });

  it('should render HistoryList component', () => {
    const { getByTestId } = render(<HistoryPage />);

    expect(getByTestId('history-list')).toBeInTheDocument();
  });
});
