import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';

import UploadFileItem from '@/components/upload/UploadFileItem';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <ul>{children}</ul>
    </Tooltip.Provider>
  );
}

describe('UploadFileItem', () => {
  const defaultProps = {
    id: 'test-id-1',
    fileName: 'document.pdf',
    fileSize: 1048576, // 1 MB
    onRemove: vi.fn(),
  };

  it('should render as a li element', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const listItem = screen.getByRole('listitem');
    expect(listItem).toBeInTheDocument();
  });

  it('should display the file name', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('should display formatted file size', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('should have truncate class on file name for long names', () => {
    render(
      <UploadFileItem
        {...defaultProps}
        fileName="a-very-long-file-name-that-should-be-truncated.pdf"
      />,
      { wrapper: Wrapper },
    );

    const nameEl = screen.getByText(
      'a-very-long-file-name-that-should-be-truncated.pdf',
    );
    expect(nameEl).toHaveClass('truncate');
  });

  it('should call onRemove with correct id when delete button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} onRemove={onRemove} />, {
      wrapper: Wrapper,
    });

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    // onRemove is called after 200ms timeout (or immediately with reduced motion)
    // With matchMedia mocked to matches: false (no reduced motion), wait for timeout
    await vi.waitFor(() => {
      expect(onRemove).toHaveBeenCalledWith('test-id-1');
    });
  });

  it('should have aria-label on delete button with file name', () => {
    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const deleteButton = screen.getByRole('button', {
      name: '删除 document.pdf',
    });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should apply opacity-0 and max-h-0 classes after clicking delete', async () => {
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} />, { wrapper: Wrapper });

    const listItem = screen.getByRole('listitem');
    expect(listItem).toHaveClass('opacity-100', 'max-h-12');

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    expect(listItem).toHaveClass('opacity-0', 'max-h-0');
  });

  it('should call onRemove immediately when prefers-reduced-motion is enabled', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<UploadFileItem {...defaultProps} onRemove={onRemove} />, {
      wrapper: Wrapper,
    });

    const deleteButton = screen.getByRole('button', { name: /删除/ });
    await user.click(deleteButton);

    // Should be called immediately, not after a timeout
    expect(onRemove).toHaveBeenCalledWith('test-id-1');

    // li should NOT have removing classes since we skip animation
    const listItem = screen.getByRole('listitem');
    expect(listItem).not.toHaveClass('opacity-0');

    window.matchMedia = originalMatchMedia;
  });
});
