import { create } from 'zustand';

import { deleteHistory, getHistory } from '@/lib/tauri';

import type { HistoryRecord } from '@/types/history';

interface HistoryState {
  records: HistoryRecord[];
  loadHistory: () => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  records: [],

  loadHistory: async () => {
    try {
      const records = await getHistory();
      set({ records });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  deleteRecord: async (id) => {
    try {
      await deleteHistory(id);
      set({ records: get().records.filter((r) => r.id !== id) });
    } catch (error) {
      console.error('Failed to delete history record:', error);
    }
  },
}));
