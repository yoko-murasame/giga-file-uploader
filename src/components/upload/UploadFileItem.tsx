import { memo, useCallback, useState } from 'react';

import { File, X } from 'lucide-react';
import { Tooltip } from 'radix-ui';

import { formatFileSize } from '@/lib/format';

interface UploadFileItemProps {
  id: string;
  fileName: string;
  fileSize: number;
  onRemove: (id: string) => void;
}

function UploadFileItemInner({
  id,
  fileName,
  fileSize,
  onRemove,
}: UploadFileItemProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleRemove = useCallback(() => {
    if (prefersReducedMotion) {
      onRemove(id);
      return;
    }
    setIsRemoving(true);
    setTimeout(() => onRemove(id), 200);
  }, [id, onRemove, prefersReducedMotion]);

  return (
    <li
      className={`flex h-12 items-center gap-3 rounded-md px-3 transition-[opacity,max-height] duration-200 ${
        isRemoving ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'
      }`}
    >
      <File size={16} className="shrink-0 text-text-secondary" />

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="truncate text-sm text-text-primary">
              {fileName}
            </span>
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
        <span className="text-xs text-text-secondary">
          {formatFileSize(fileSize)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleRemove}
        aria-label={`删除 ${fileName}`}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-border hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <X size={16} />
      </button>
    </li>
  );
}

const UploadFileItem = memo(UploadFileItemInner);
export default UploadFileItem;
