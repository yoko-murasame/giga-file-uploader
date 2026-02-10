import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from './App';
import { useAppStore } from '@/stores/appStore';

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState({ currentTab: 'upload' });
  });

  it('renders the tab navigation with upload tab', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: '上传' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '历史记录' })).toBeInTheDocument();
  });

  it('renders upload page placeholder by default', () => {
    render(<App />);
    expect(screen.getByText('上传页面 - 待实现')).toBeInTheDocument();
  });
});
