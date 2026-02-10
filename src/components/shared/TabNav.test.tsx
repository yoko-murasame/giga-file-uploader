import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import TabNav from '@/components/shared/TabNav';
import { useAppStore } from '@/stores/appStore';

describe('TabNav', () => {
  beforeEach(() => {
    useAppStore.setState({ currentTab: 'upload' });
  });

  it('renders two tabs with correct labels', () => {
    render(<TabNav />);
    expect(screen.getByRole('tab', { name: '上传' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '历史记录' })).toBeInTheDocument();
  });

  it('has "上传" tab selected by default', () => {
    render(<TabNav />);
    const uploadTab = screen.getByRole('tab', { name: '上传' });
    expect(uploadTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders upload page content by default', () => {
    render(<TabNav />);
    expect(screen.getByText('将文件拖到这里，或点击选择文件')).toBeInTheDocument();
  });

  it('switches to history tab on click and updates store', async () => {
    const user = userEvent.setup();
    render(<TabNav />);

    const historyTab = screen.getByRole('tab', { name: '历史记录' });
    await user.click(historyTab);

    expect(useAppStore.getState().currentTab).toBe('history');
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('历史记录页面 - 待实现')).toBeInTheDocument();
  });

  it('switches back to upload tab on click', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ currentTab: 'history' });
    render(<TabNav />);

    const uploadTab = screen.getByRole('tab', { name: '上传' });
    await user.click(uploadTab);

    expect(useAppStore.getState().currentTab).toBe('upload');
    expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('将文件拖到这里，或点击选择文件')).toBeInTheDocument();
  });

  it('renders tablist role for accessibility', () => {
    render(<TabNav />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders tabpanel role for content area', () => {
    render(<TabNav />);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });
});
