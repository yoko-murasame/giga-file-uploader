import { useEffect } from 'react';

import { listen } from '@/lib/tauri';
import { useUploadStore } from '@/stores/uploadStore';

import type {
  AllCompletePayload,
  FileCompletePayload,
  ProgressPayload,
  UploadErrorPayload,
} from '@/types/upload';

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

      const unlisten3 = await listen<FileCompletePayload>(
        'upload:file-complete',
        (event) => {
          useUploadStore.getState().setTaskFileComplete(
            event.payload.taskId,
            event.payload.downloadUrl,
          );
        },
      );
      if (cancelled) {
        unlisten3();
        return;
      }
      cleanups.push(unlisten3);

      const unlisten4 = await listen<AllCompletePayload>(
        'upload:all-complete',
        () => {
          useUploadStore.getState().setAllComplete();
        },
      );
      if (cancelled) {
        unlisten4();
        return;
      }
      cleanups.push(unlisten4);
    };

    setup();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
