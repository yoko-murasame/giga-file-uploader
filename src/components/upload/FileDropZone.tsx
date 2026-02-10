import { useRef, useCallback } from 'react';

import { Upload } from 'lucide-react';

import { resolveDroppedPaths } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';
import { useDragDrop } from '@/hooks/useDragDrop';

interface FileDropZoneProps {
  collapsed?: boolean;
}

function FileDropZone({ collapsed = false }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDragOver, prefersReducedMotion } = useDragDrop();
  const addFiles = useUploadStore((s) => s.addFiles);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        // In Tauri, webkitRelativePath or name can be used, but we need
        // the native path. For file input, we use the file name and resolve
        // via the backend. The path property is available in Tauri webview.
        const file = files[i];
        // Tauri's file input provides path via webkitRelativePath or the
        // File object. We pass the file paths to resolve_dropped_paths.
        const filePath = (file as unknown as { path?: string }).path;
        if (filePath) {
          paths.push(filePath);
        } else {
          console.warn('File input entry missing native path property:', file.name);
        }
      }

      if (paths.length > 0) {
        try {
          const entries = await resolveDroppedPaths(paths);
          if (entries.length > 0) {
            addFiles(entries);
          }
        } catch (error) {
          console.error('Failed to resolve file input paths:', error);
        }
      }

      // Reset input so the same file can be selected again
      e.target.value = '';
    },
    [addFiles],
  );

  const transitionClass =
    !prefersReducedMotion ? 'transition-all duration-200' : '';

  if (collapsed) {
    return (
      <div
        role="button"
        aria-label="添加文件"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`flex h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAFB] hover:border-brand ${transitionClass} ${
          isDragOver ? 'border-solid border-brand bg-brand/20' : ''
        } focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none`}
      >
        <span className="text-xs text-text-secondary">
          {isDragOver ? '松手即可添加' : '继续拖拽或点击添加文件'}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      aria-label="添加文件"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`flex min-h-[320px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg ${transitionClass} ${
        isDragOver
          ? 'border-2 border-solid border-brand bg-brand/20'
          : 'border-2 border-dashed border-[#D1D5DB] bg-[#F9FAFB]'
      } focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none`}
    >
      <Upload size={48} className="mb-4 text-text-secondary" />
      <span className="text-sm text-text-secondary">
        {isDragOver ? '松手即可添加' : '将文件拖到这里，或点击选择文件'}
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}

export default FileDropZone;
