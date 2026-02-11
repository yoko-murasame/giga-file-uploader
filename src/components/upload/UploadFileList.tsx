import { Tooltip } from 'radix-ui';

import UploadFileItem from '@/components/upload/UploadFileItem';

import type { PendingFile, UploadTaskProgress } from '@/types/upload';

interface UploadFileListProps {
  files: PendingFile[];
  onRemoveFile: (id: string) => void;
  activeTasks?: Record<string, UploadTaskProgress>;
}

function UploadFileList({ files, onRemoveFile, activeTasks }: UploadFileListProps) {
  const activeTaskList = activeTasks ? Object.values(activeTasks) : [];
  const hasContent = files.length > 0 || activeTaskList.length > 0;

  if (!hasContent) return null;

  return (
    <Tooltip.Provider delayDuration={300}>
      <ul className="flex-1 list-none overflow-y-auto">
        {activeTaskList.map((task) => (
          <UploadFileItem
            key={task.taskId}
            id={task.taskId}
            fileName={task.taskId}
            fileSize={0}
            onRemove={() => {}}
            taskProgress={task}
          />
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
