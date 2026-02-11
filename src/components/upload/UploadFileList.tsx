import { Tooltip } from 'radix-ui';
import { useShallow } from 'zustand/react/shallow';

import UploadFileItem from '@/components/upload/UploadFileItem';
import { useUploadStore } from '@/stores/uploadStore';

import type { PendingFile } from '@/types/upload';

interface UploadFileListProps {
  files: PendingFile[];
  onRemoveFile: (id: string) => void;
}

function UploadFileList({ files, onRemoveFile }: UploadFileListProps) {
  const activeTaskIds = useUploadStore(useShallow((s) => Object.keys(s.activeTasks)));
  const hasContent = files.length > 0 || activeTaskIds.length > 0;

  if (!hasContent) return null;

  return (
    <Tooltip.Provider delayDuration={300}>
      <ul className="flex-1 list-none overflow-y-auto min-h-0">
        {activeTaskIds.map((taskId) => (
          <UploadFileItem key={taskId} id={taskId} taskId={taskId} onRemove={() => {}} />
        ))}
        {files.map((file) => (
          <UploadFileItem
            key={file.id}
            id={file.id}
            fileName={file.fileName}
            fileSize={file.fileSize}
            onRemove={onRemoveFile}
          />
        ))}
      </ul>
    </Tooltip.Provider>
  );
}

export default UploadFileList;
