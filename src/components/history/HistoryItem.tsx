import { memo, useCallback, useState, useRef, useEffect } from 'react';

import { CheckCircle, Clock, Trash2 } from 'lucide-react';

import CopyButton from '@/components/shared/CopyButton';
import { formatFileSize } from '@/lib/format';

import type { HistoryRecord } from '@/types/history';

interface HistoryItemProps {
  record: HistoryRecord;
  onDelete: (id: string) => void;
}

function isExpired(expiresAt: string): boolean {
  return new Date() > new Date(expiresAt);
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}

function HistoryItemInner({ record, onDelete }: HistoryItemProps) {
  const expired = isExpired(record.expiresAt);
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleDeleteClick = useCallback(() => {
    if (confirming) {
      onDelete(record.id);
      setConfirming(false);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    } else {
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  }, [confirming, record.id, onDelete]);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-opacity duration-200">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-text-primary" title={record.fileName}>
            {record.fileName}
          </span>
          <span className="shrink-0 text-xs text-text-secondary">
            {formatFileSize(record.fileSize)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
          <span>上传: {formatDate(record.uploadedAt)}</span>
          <span>过期: {formatDate(record.expiresAt)}</span>
        </div>
        <div className="mt-1 truncate text-xs text-text-secondary" title={record.downloadUrl}>
          {record.downloadUrl}
        </div>
      </div>

      {expired ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-border px-2 py-0.5 text-xs text-text-secondary">
          <Clock size={14} />
          已过期
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-success">
          <CheckCircle size={14} />
          有效
        </span>
      )}

      <CopyButton text={record.downloadUrl} className={expired ? 'opacity-50' : ''} />

      {confirming ? (
        <button
          type="button"
          onClick={handleDeleteClick}
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-error hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-error focus-visible:outline-none"
        >
          确认删除？
        </button>
      ) : (
        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label="删除记录"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-border hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

const HistoryItem = memo(HistoryItemInner);
export default HistoryItem;
