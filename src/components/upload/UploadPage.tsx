import FileDropZone from '@/components/upload/FileDropZone';
import UploadFileList from '@/components/upload/UploadFileList';
import { useUploadEvents } from '@/hooks/useUploadEvents';
import { useUploadStore } from '@/stores/uploadStore';

function UploadPage() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const activeTasks = useUploadStore((s) => s.activeTasks);
  const removeFile = useUploadStore((s) => s.removeFile);
  const hasFiles = pendingFiles.length > 0 || Object.keys(activeTasks).length > 0;

  useUploadEvents();

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <FileDropZone collapsed={hasFiles} />
      {hasFiles && (
        <UploadFileList files={pendingFiles} onRemoveFile={removeFile} activeTasks={activeTasks} />
      )}
    </div>
  );
}

export default UploadPage;
