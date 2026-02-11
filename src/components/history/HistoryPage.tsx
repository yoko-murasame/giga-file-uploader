import { useEffect } from 'react';

import HistoryList from '@/components/history/HistoryList';
import { useHistoryStore } from '@/stores/historyStore';

function HistoryPage() {
  const loadHistory = useHistoryStore((s) => s.loadHistory);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <HistoryList />
    </div>
  );
}

export default HistoryPage;
