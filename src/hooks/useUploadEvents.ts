import { useEffect } from 'react';

import { listen } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';

import type { ProgressPayload, UploadErrorPayload } from '@/types/upload';

export function useUploadEvents() {
  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const setup = async () => {
      const unlisten1 = await listen<ProgressPayload>('upload:progress', (event) => {
        useUploadStore.getState().updateProgress(event.payload);
      });
      if (cancelled) {
        unlisten1();
        return;
      }
      cleanups.push(unlisten1);

      const unlisten2 = await listen<UploadErrorPayload>('upload:error', (event) => {
        useUploadStore.getState().setTaskError(event.payload.taskId);
      });
      if (cancelled) {
        unlisten2();
        return;
      }
      cleanups.push(unlisten2);
    };

    setup();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
