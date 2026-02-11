import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAppStore } from '@/stores/appStore';

vi.mock('@/lib/tauri', () => ({
  checkNetwork: vi.fn(),
}));

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useAppStore.setState({ currentTab: 'upload', isOnline: true });
  });

  it('should have default currentTab as "upload"', () => {
    const state = useAppStore.getState();
    expect(state.currentTab).toBe('upload');
  });

  it('should switch currentTab to "history"', () => {
    useAppStore.getState().setCurrentTab('history');
    expect(useAppStore.getState().currentTab).toBe('history');
  });

  it('should switch currentTab back to "upload"', () => {
    useAppStore.getState().setCurrentTab('history');
    useAppStore.getState().setCurrentTab('upload');
    expect(useAppStore.getState().currentTab).toBe('upload');
  });

  it('should have isOnline default to true', () => {
    expect(useAppStore.getState().isOnline).toBe(true);
  });

  it('should update isOnline to false via setOnlineStatus', () => {
    useAppStore.getState().setOnlineStatus(false);
    expect(useAppStore.getState().isOnline).toBe(false);
  });

  it('should restore isOnline to true via setOnlineStatus', () => {
    useAppStore.getState().setOnlineStatus(false);
    expect(useAppStore.getState().isOnline).toBe(false);

    useAppStore.getState().setOnlineStatus(true);
    expect(useAppStore.getState().isOnline).toBe(true);
  });
});
