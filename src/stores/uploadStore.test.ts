import { describe, it, expect, beforeEach } from 'vitest';

import { useUploadStore } from '@/stores/uploadStore';

import type { FileEntry } from '@/types/upload';

describe('uploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({ pendingFiles: [] });
  });

  describe('addFiles', () => {
    it('should add files to an empty queue', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(2);
      expect(pendingFiles[0].fileName).toBe('a.txt');
      expect(pendingFiles[0].filePath).toBe('/path/a.txt');
      expect(pendingFiles[0].fileSize).toBe(100);
      expect(pendingFiles[0].status).toBe('pending');
      expect(pendingFiles[0].id).toBeTruthy();
      expect(pendingFiles[1].fileName).toBe('b.txt');
    });

    it('should generate unique ids for each file', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles[0].id).not.toBe(pendingFiles[1].id);
    });

    it('should append files without overwriting existing ones', () => {
      const first: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
      ];
      const second: FileEntry[] = [
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(first);
      const firstId = useUploadStore.getState().pendingFiles[0].id;

      useUploadStore.getState().addFiles(second);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(2);
      expect(pendingFiles[0].id).toBe(firstId);
      expect(pendingFiles[0].fileName).toBe('a.txt');
      expect(pendingFiles[1].fileName).toBe('b.txt');
    });

    it('should handle empty entries array', () => {
      useUploadStore.getState().addFiles([]);
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });
  });

  describe('removeFile', () => {
    it('should remove a file by id', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);
      const idToRemove = useUploadStore.getState().pendingFiles[0].id;

      useUploadStore.getState().removeFile(idToRemove);

      const { pendingFiles } = useUploadStore.getState();
      expect(pendingFiles).toHaveLength(1);
      expect(pendingFiles[0].fileName).toBe('b.txt');
    });

    it('should do nothing if id does not exist', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
      ];

      useUploadStore.getState().addFiles(entries);
      useUploadStore.getState().removeFile('nonexistent-id');

      expect(useUploadStore.getState().pendingFiles).toHaveLength(1);
    });
  });

  describe('clearFiles', () => {
    it('should clear all pending files', () => {
      const entries: FileEntry[] = [
        { fileName: 'a.txt', filePath: '/path/a.txt', fileSize: 100 },
        { fileName: 'b.txt', filePath: '/path/b.txt', fileSize: 200 },
      ];

      useUploadStore.getState().addFiles(entries);
      expect(useUploadStore.getState().pendingFiles).toHaveLength(2);

      useUploadStore.getState().clearFiles();
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });

    it('should work on already empty queue', () => {
      useUploadStore.getState().clearFiles();
      expect(useUploadStore.getState().pendingFiles).toHaveLength(0);
    });
  });
});
