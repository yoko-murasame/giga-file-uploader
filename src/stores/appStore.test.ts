import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/appStore';

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useAppStore.setState({ currentTab: 'upload' });
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
});
