import { FileX } from 'lucide-react';

import HistoryItem from '@/components/history/HistoryItem';
import { useAppStore } from '@/stores/appStore';
import { useHistoryStore } from '@/stores/historyStore';

function HistoryList() {
  const records = useHistoryStore((s) => s.records);
  const deleteRecord = useHistoryStore((s) => s.deleteRecord);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <FileX size={48} className="text-text-secondary" />
        <p className="text-sm text-text-secondary">还没有上传记录</p>
        <button
          type="button"
          onClick={() => setCurrentTab('upload')}
          className="cursor-pointer rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary hover:bg-border focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          去上传
        </button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {records.map((record) => (
        <HistoryItem key={record.id} record={record} onDelete={deleteRecord} />
      ))}
    </ul>
  );
}

export default HistoryList;
