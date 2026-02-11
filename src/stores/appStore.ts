import { create } from 'zustand';

import { checkNetwork } from '@/lib/tauri';

import type { TabId } from '@/types/app';

interface AppState {
  currentTab: TabId;
  isOnline: boolean;
  setCurrentTab: (tab: TabId) => void;
  setOnlineStatus: (online: boolean) => void;
  checkNetworkStatus: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentTab: 'upload',
  isOnline: true,

  setCurrentTab: (tab) => set({ currentTab: tab }),

  setOnlineStatus: (online) => set({ isOnline: online }),

  checkNetworkStatus: async () => {
    try {
      const online = await checkNetwork();
      set({ isOnline: online });
    } catch {
      set({ isOnline: false });
    }
  },
}));
