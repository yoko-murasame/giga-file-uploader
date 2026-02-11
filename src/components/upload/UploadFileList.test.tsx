import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import UploadFileList from '@/components/upload/UploadFileList';

import type { PendingFile } from '@/types/upload';

const mockFiles: PendingFile[] = [
  {
    id: 'file-1',
    fileName: 'document.pdf',
    filePath: '/path/document.pdf',
    fileSize: 1048576,
    status: 'pending',
  },
  {
    id: 'file-2',
    fileName: 'image.png',
    filePath: '/path/image.png',
    fileSize: 2097152,
    status: 'pending',
  },
  {
    id: 'file-3',
    fileName: 'video.mp4',
    filePath: '/path/video.mp4',
    fileSize: 1073741824,
    status: 'pending',
  },
];

describe('UploadFileList', () => {
  it('should render a ul element', () => {
    render(<UploadFileList files={mockFiles} onRemoveFile={vi.fn()} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('should render multiple file list items', () => {
    render(<UploadFileList files={mockFiles} onRemoveFile={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('should display file names for all files', () => {
    render(<UploadFileList files={mockFiles} onRemoveFile={vi.fn()} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('image.png')).toBeInTheDocument();
    expect(screen.getByText('video.mp4')).toBeInTheDocument();
  });

  it('should not render list when files array is empty', () => {
    const { container } = render(<UploadFileList files={[]} onRemoveFile={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });
});
