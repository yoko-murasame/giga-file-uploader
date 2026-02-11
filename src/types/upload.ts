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

/** Shard-level progress from Rust backend */
export interface ShardProgress {
  shardIndex: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

/** Active upload task progress state */
export interface UploadTaskProgress {
  taskId: string;
  fileProgress: number;
  shards: ShardProgress[];
  status: 'uploading' | 'completed' | 'error';
}

/** Progress event payload from Rust upload:progress event */
export interface ProgressPayload {
  taskId: string;
  fileProgress: number;
  shards: ShardProgress[];
}

/** Error event payload from Rust upload:error event */
export interface UploadErrorPayload {
  taskId: string;
  fileName: string;
  errorMessage: string;
}

/** Retry warning event payload from Rust upload:retry-warning event */
export interface RetryWarningPayload {
  taskId: string;
  fileName: string;
  retryCount: number;
  errorMessage: string;
}
