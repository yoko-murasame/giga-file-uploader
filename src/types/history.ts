/** Upload history record from local storage */
export interface HistoryRecord {
  id: string;
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  uploadedAt: string;
  expiresAt: string;
}
