import { useCallback, useRef } from 'react';

import { Upload } from 'lucide-react';

import { openFilePicker, resolveDroppedPaths } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';
import { useDragDrop } from '@/hooks/useDragDrop';

interface FileDropZoneProps {
  collapsed?: boolean;
  disabled?: boolean;
}

function FileDropZone({ collapsed = false, disabled = false }: FileDropZoneProps) {
  const { isDragOver, prefersReducedMotion } = useDragDrop({ disabled });
  const addFiles = useUploadStore((s) => s.addFiles);
  const isPickerOpenRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (disabled) return;
    if (isPickerOpenRef.current) return;
    isPickerOpenRef.current = true;
    try {
      const paths = await openFilePicker();
      if (paths === null) return;

      const entries = await resolveDroppedPaths(paths);
      if (entries.length > 0) {
        addFiles(entries);
      }
    } catch (error) {
      console.error('Failed to open file picker:', error);
    } finally {
      isPickerOpenRef.current = false;
    }
  }, [addFiles, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [disabled, handleClick]
  );

  const transitionClass = !prefersReducedMotion ? 'transition-all duration-200' : '';

  if (collapsed) {
    return (
      <div
        role="button"
        aria-label="添加文件"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`flex h-12 items-center justify-center rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-brand'} ${transitionClass} ${
          isDragOver ? 'border-solid border-brand bg-brand/20' : ''
        } focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none`}
      >
        <span className="text-xs text-text-secondary">
          {isDragOver ? '松手即可添加' : '继续拖拽或点击添加文件'}
        </span>
      </div>
    );
  }

  return (
    <div
      role="button"
      aria-label="添加文件"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-lg ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${transitionClass} ${
        isDragOver
          ? 'border-2 border-solid border-brand bg-brand/20'
          : 'border-2 border-dashed border-[#D1D5DB] bg-[#F9FAFB]'
      } focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none`}
    >
      <Upload size={48} className="mb-4 text-text-secondary" />
      <span className="text-sm text-text-secondary">
        {isDragOver ? '松手即可添加' : '将文件拖到这里，或点击选择文件'}
      </span>
    </div>
  );
}

export default FileDropZone;
