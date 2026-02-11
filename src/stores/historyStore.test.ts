import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useHistoryStore } from '@/stores/historyStore';

import type { HistoryRecord } from '@/types/history';

// Mock the tauri IPC module
vi.mock('@/lib/tauri', () => ({
  getHistory: vi.fn(),
  deleteHistory: vi.fn(),
}));

const sampleRecords: HistoryRecord[] = [
  {
    id: 'record-1',
    fileName: 'photo.jpg',
    downloadUrl: 'https://46.gigafile.nu/abc123',
    fileSize: 1024000,
    uploadedAt: '2026-02-11T08:30:00+00:00',
    expiresAt: '2026-02-18T08:30:00+00:00',
  },
  {
    id: 'record-2',
    fileName: 'document.pdf',
    downloadUrl: 'https://46.gigafile.nu/def456',
    fileSize: 2048000,
    uploadedAt: '2026-02-10T08:30:00+00:00',
    expiresAt: '2026-02-17T08:30:00+00:00',
  },
];

describe('historyStore', () => {
  beforeEach(() => {
    useHistoryStore.setState({ records: [] });
    vi.clearAllMocks();
  });

  describe('loadHistory', () => {
    it('should load records from IPC and populate state', async () => {
      const { getHistory } = await import('@/lib/tauri');
      vi.mocked(getHistory).mockResolvedValueOnce(sampleRecords);

      await useHistoryStore.getState().loadHistory();

      const { records } = useHistoryStore.getState();
      expect(records).toHaveLength(2);
      expect(records[0].id).toBe('record-1');
      expect(records[0].fileName).toBe('photo.jpg');
      expect(records[0].downloadUrl).toBe('https://46.gigafile.nu/abc123');
      expect(records[1].id).toBe('record-2');
      expect(getHistory).toHaveBeenCalledOnce();
    });

    it('should handle empty history', async () => {
      const { getHistory } = await import('@/lib/tauri');
      vi.mocked(getHistory).mockResolvedValueOnce([]);

      await useHistoryStore.getState().loadHistory();

      expect(useHistoryStore.getState().records).toHaveLength(0);
    });

    it('should handle IPC error gracefully', async () => {
      const { getHistory } = await import('@/lib/tauri');
      vi.mocked(getHistory).mockRejectedValueOnce(new Error('Storage error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await useHistoryStore.getState().loadHistory();

      expect(useHistoryStore.getState().records).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('deleteRecord', () => {
    it('should call IPC and remove record from state', async () => {
      const { deleteHistory } = await import('@/lib/tauri');
      vi.mocked(deleteHistory).mockResolvedValueOnce(undefined);

      // Pre-populate records
      useHistoryStore.setState({ records: [...sampleRecords] });

      await useHistoryStore.getState().deleteRecord('record-1');

      const { records } = useHistoryStore.getState();
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('record-2');
      expect(deleteHistory).toHaveBeenCalledWith('record-1');
    });

    it('should handle IPC error gracefully', async () => {
      const { deleteHistory } = await import('@/lib/tauri');
      vi.mocked(deleteHistory).mockRejectedValueOnce(new Error('Storage error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      useHistoryStore.setState({ records: [...sampleRecords] });

      await useHistoryStore.getState().deleteRecord('record-1');

      // Records should remain unchanged on error
      expect(useHistoryStore.getState().records).toHaveLength(2);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
