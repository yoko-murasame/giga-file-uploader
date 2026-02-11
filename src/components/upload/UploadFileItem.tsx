import { memo, useCallback, useState } from 'react';

import { CheckCircle2, ChevronDown, ChevronRight, File, X } from 'lucide-react';
import { Progress, Tooltip } from 'radix-ui';

import CopyButton from '@/components/shared/CopyButton';
import { formatFileSize, formatSpeed } from '@/lib/format';
import { useUploadStore } from '@/stores/uploadStore';

interface UploadFileItemProps {
  id: string;
  fileName?: string;
  fileSize?: number;
  onRemove: (id: string) => void;
  taskId?: string;
}

function statusLabel(status: 'uploading' | 'completed' | 'error' | undefined): string {
  switch (status) {
    case 'uploading':
      return '上传中';
    case 'completed':
      return '已完成';
    case 'error':
      return '出错';
    default:
      return '等待中';
  }
}

function shardStatusLabel(status: 'pending' | 'uploading' | 'completed' | 'error'): string {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'uploading':
      return '上传中';
    case 'completed':
      return '已完成';
    case 'error':
      return '出错';
  }
}

function UploadFileItemInner({
  id,
  fileName: fileNameProp,
  fileSize: fileSizeProp,
  onRemove,
  taskId,
}: UploadFileItemProps) {
  const taskProgress = useUploadStore((s) => (taskId ? s.activeTasks[taskId] : undefined));
  const [isRemoving, setIsRemoving] = useState(false);
  const [shardsExpanded, setShardsExpanded] = useState(true);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleRemove = useCallback(() => {
    if (prefersReducedMotion) {
      onRemove(id);
      return;
    }
    setIsRemoving(true);
    setTimeout(() => onRemove(id), 200);
  }, [id, onRemove, prefersReducedMotion]);

  const isUploading = !!taskProgress;
  const isCompleted = taskProgress?.status === 'completed';
  const fileName = taskProgress?.fileName ?? fileNameProp ?? '';
  const fileSize = taskProgress?.fileSize ?? fileSizeProp ?? 0;
  const hasMultipleShards = taskProgress && taskProgress.shards.length > 1;

  return (
    <li
      className={`overflow-hidden rounded-md px-3 py-2 transition-[opacity,max-height] duration-200 ${
        isRemoving ? 'max-h-0 opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <File size={16} className="shrink-0 text-text-secondary" />

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="truncate text-sm text-text-primary">{fileName}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="rounded-md bg-text-primary px-2 py-1 text-xs text-surface"
                sideOffset={4}
              >
                {fileName}
                <Tooltip.Arrow className="fill-text-primary" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">{formatFileSize(fileSize)}</span>
            {isUploading && (
              <span className="text-xs text-text-secondary">
                {statusLabel(taskProgress.status)}
              </span>
            )}
          </div>
        </div>

        {isUploading && (
          isCompleted ? (
            <CheckCircle2 size={18} className="shrink-0 text-success" />
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-text-secondary">
                {formatSpeed(taskProgress.speed ?? 0)}
              </span>
              <span className="text-sm font-medium text-text-primary">
                {Math.round(taskProgress.fileProgress)}%
              </span>
            </div>
          )
        )}

        {!isUploading && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label={`删除 ${fileName}`}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-border hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isUploading && (
        <div className="mt-2">
          <Progress.Root className="h-2 w-full overflow-hidden rounded-full bg-border">
            <Progress.Indicator
              className={`h-full ${isCompleted ? 'bg-success' : 'bg-brand'}`}
              style={{
                width: `${taskProgress.fileProgress}%`,
                transition: 'width 300ms ease',
              }}
            />
          </Progress.Root>

          {isCompleted && taskProgress.downloadUrl && (
            <div className="mt-1.5 flex items-center gap-1">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <a
                    href={taskProgress.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-xs text-brand hover:underline"
                  >
                    {taskProgress.downloadUrl}
                  </a>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="max-w-xs break-all rounded-md bg-text-primary px-2 py-1 text-xs text-surface"
                    sideOffset={4}
                  >
                    {taskProgress.downloadUrl}
                    <Tooltip.Arrow className="fill-text-primary" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
              <CopyButton text={taskProgress.downloadUrl} />
            </div>
          )}

          {!isCompleted && hasMultipleShards && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShardsExpanded(!shardsExpanded)}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
              >
                {shardsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                分片详情 ({taskProgress.shards.length})
              </button>

              {shardsExpanded && (
                <div className="mt-1 space-y-1 pl-4">
                  {taskProgress.shards.map((shard) => (
                    <div key={shard.shardIndex} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-xs text-text-secondary">
                        分片 {shard.shardIndex + 1}
                      </span>
                      <Progress.Root className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                        <Progress.Indicator
                          className="h-full bg-brand"
                          style={{
                            width: `${shard.progress}%`,
                            transition: 'width 300ms ease',
                          }}
                        />
                      </Progress.Root>
                      <span className="w-10 shrink-0 text-right text-xs text-text-secondary">
                        {Math.round(shard.progress)}%
                      </span>
                      <span className="w-12 shrink-0 text-xs text-text-secondary">
                        {shardStatusLabel(shard.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const UploadFileItem = memo(UploadFileItemInner);
export default UploadFileItem;
