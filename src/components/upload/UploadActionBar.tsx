import { useState } from 'react';

import { useUploadStore } from '@/stores/uploadStore';
import { formatFileSize } from '@/lib/format';

function UploadActionBar() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const activeTasks = useUploadStore((s) => s.activeTasks);
  const allUploadsComplete = useUploadStore((s) => s.allUploadsComplete);
  const startUpload = useUploadStore((s) => s.startUpload);
  const clearCompletedTasks = useUploadStore((s) => s.clearCompletedTasks);

  const [isStarting, setIsStarting] = useState(false);

  const activeTaskList = Object.values(activeTasks);
  const hasActiveTasks = activeTaskList.length > 0;
  const hasPendingFiles = pendingFiles.length > 0;

  if (!hasPendingFiles && !hasActiveTasks) return null;

  const isUploading = activeTaskList.some((t) => t.status === 'uploading');
  const completedCount = activeTaskList.filter((t) => t.status === 'completed').length;
  const errorCount = activeTaskList.filter((t) => t.status === 'error').length;
  const allFailed =
    hasActiveTasks && !isUploading && !allUploadsComplete && errorCount === activeTaskList.length;

  let statsText: string;
  if (allUploadsComplete) {
    statsText = `${completedCount} 个文件上传完成`;
  } else if (allFailed) {
    statsText = `${errorCount} 个文件上传失败`;
  } else if (isUploading) {
    statsText = `${activeTaskList.length} 个文件上传中`;
  } else {
    const totalSize = pendingFiles.reduce((sum, f) => sum + f.fileSize, 0);
    statsText = `${pendingFiles.length} 个文件，${formatFileSize(totalSize)}`;
  }

  const handleStartUpload = async () => {
    setIsStarting(true);
    try {
      await startUpload(7);
    } finally {
      setIsStarting(false);
    }
  };

  const handleClearCompleted = () => {
    clearCompletedTasks();
  };

  const isStartDisabled = isStarting || !hasPendingFiles || isUploading;
  const showClearButton = allUploadsComplete || allFailed;

  return (
    <nav
      aria-label="上传操作"
      className="sticky bottom-0 border-t border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary" aria-live="polite">
          {statsText}
        </span>

        {showClearButton ? (
          <button
            type="button"
            onClick={handleClearCompleted}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            清空列表
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartUpload}
            disabled={isStartDisabled}
            aria-disabled={isStartDisabled}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始上传
          </button>
        )}
      </div>
    </nav>
  );
}

export default UploadActionBar;
