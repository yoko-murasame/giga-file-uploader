import { Tooltip } from 'radix-ui';

import UploadFileItem from '@/components/upload/UploadFileItem';

import type { PendingFile } from '@/types/upload';

interface UploadFileListProps {
  files: PendingFile[];
  onRemoveFile: (id: string) => void;
}

function UploadFileList({ files, onRemoveFile }: UploadFileListProps) {
  if (files.length === 0) return null;

  return (
    <Tooltip.Provider delayDuration={300}>
      <ul className="flex-1 list-none overflow-y-auto">
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
