import { create } from 'zustand';

import type { TabId } from '@/types/app';

interface AppState {
  currentTab: TabId;
  setCurrentTab: (tab: TabId) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentTab: 'upload',
  setCurrentTab: (tab) => set({ currentTab: tab }),
}));
