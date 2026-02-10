/** Pending file entry in the upload queue */
export interface PendingFile {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  status: 'pending';
}

/** File entry returned from Rust resolve_dropped_paths command */
export interface FileEntry {
  fileName: string;
  filePath: string;
  fileSize: number;
}

/** Drop zone visual state */
export type DropZoneState = 'idle' | 'dragover' | 'collapsed';
