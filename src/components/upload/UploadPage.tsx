import FileDropZone from '@/components/upload/FileDropZone';
import { useUploadStore } from '@/stores/uploadStore';

function UploadPage() {
  const fileCount = useUploadStore((s) => s.pendingFiles.length);
  const hasFiles = fileCount > 0;

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <FileDropZone collapsed={hasFiles} />
      {hasFiles && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-surface">
          <p className="text-text-secondary">
            已添加 {fileCount} 个文件 - 文件列表待实现
          </p>
        </div>
      )}
    </div>
  );
}

export default UploadPage;
