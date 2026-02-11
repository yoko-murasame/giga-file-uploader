import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RetentionSelector from '@/components/upload/RetentionSelector';
import { useUploadStore } from '@/stores/uploadStore';

vi.mock('@/lib/tauri', () => ({
  startUpload: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

describe('RetentionSelector', () => {
  beforeEach(() => {
    useUploadStore.setState({
      retentionDays: 7,
    });
  });

  it('should render with default value of 7 days', () => {
    render(<RetentionSelector />);

    const trigger = screen.getByRole('button', { name: '选择文件保留期限' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('7 天');
  });

  it('should update displayed value when a different retention period is selected', async () => {
    const setRetentionDaysMock = vi.fn();
    useUploadStore.setState({
      retentionDays: 7,
      setRetentionDays: setRetentionDaysMock,
    });

    const user = userEvent.setup();
    render(<RetentionSelector />);

    // Open the dropdown
    await user.click(screen.getByRole('button', { name: '选择文件保留期限' }));

    // Select 30 days
    const option30 = screen.getByText('30 天');
    await user.click(option30);

    expect(setRetentionDaysMock).toHaveBeenCalledWith(30);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<RetentionSelector disabled />);

    const trigger = screen.getByRole('button', { name: '选择文件保留期限' });
    expect(trigger).toBeDisabled();
  });

  it('should display the current retentionDays from store', () => {
    useUploadStore.setState({ retentionDays: 14 });

    render(<RetentionSelector />);

    const trigger = screen.getByRole('button', { name: '选择文件保留期限' });
    expect(trigger).toHaveTextContent('14 天');
  });
});
