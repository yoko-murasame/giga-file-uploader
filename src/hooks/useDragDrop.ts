import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';

import { getCurrentWebview } from '@tauri-apps/api/webview';

import { resolveDroppedPaths } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';

function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

/** Hook for managing Tauri native drag-and-drop file events. */
export function useDragDrop() {
  const [isDragOver, setIsDragOver] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const addFiles = useUploadStore((s) => s.addFiles);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const entries = await resolveDroppedPaths(paths);
      if (entries.length > 0) {
        addFiles(entries);
      }
    },
    [addFiles],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragOver(true);
        } else if (event.payload.type === 'drop') {
          setIsDragOver(false);
          handleDrop(event.payload.paths);
        } else {
          // cancel
          setIsDragOver(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [handleDrop]);

  return { isDragOver, prefersReducedMotion };
}
