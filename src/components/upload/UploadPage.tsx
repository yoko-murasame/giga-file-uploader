import FileDropZone from '@/components/upload/FileDropZone';
import UploadFileList from '@/components/upload/UploadFileList';
import { useUploadStore } from '@/stores/uploadStore';

function UploadPage() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const removeFile = useUploadStore((s) => s.removeFile);
  const hasFiles = pendingFiles.length > 0;

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <FileDropZone collapsed={hasFiles} />
      {hasFiles && (
        <UploadFileList files={pendingFiles} onRemoveFile={removeFile} />
      )}
    </div>
  );
}

export default UploadPage;
