import FileDropZone from '@/components/upload/FileDropZone';
import UploadActionBar from '@/components/upload/UploadActionBar';
import UploadFileList from '@/components/upload/UploadFileList';
import { useUploadEvents } from '@/hooks/useUploadEvents';
import { useUploadStore } from '@/stores/uploadStore';

function UploadPage() {
  const pendingFiles = useUploadStore((s) => s.pendingFiles);
  const hasActiveTasks = useUploadStore((s) => Object.keys(s.activeTasks).length > 0);
  const removeFile = useUploadStore((s) => s.removeFile);
  const hasFiles = pendingFiles.length > 0 || hasActiveTasks;

  useUploadEvents();

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <FileDropZone collapsed={hasFiles} />
      {hasFiles && <UploadFileList files={pendingFiles} onRemoveFile={removeFile} />}
      <UploadActionBar />
    </div>
  );
}

export default UploadPage;
