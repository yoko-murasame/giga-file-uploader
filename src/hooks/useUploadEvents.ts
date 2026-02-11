import { useEffect } from 'react';

import { listen } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';

import type { ProgressPayload, UploadErrorPayload } from '@/types/upload';

export function useUploadEvents() {
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const unlisten1 = await listen<ProgressPayload>('upload:progress', (event) => {
        useUploadStore.getState().updateProgress(event.payload);
      });
      unlisteners.push(unlisten1);

      const unlisten2 = await listen<UploadErrorPayload>('upload:error', (event) => {
        useUploadStore.getState().setTaskError(event.payload.taskId);
      });
      unlisteners.push(unlisten2);
    };

    setup();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);
}
