import { describe, it, expect } from 'vitest';

import { formatFileSize } from '@/lib/format';

describe('formatFileSize', () => {
  it('should return "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should return bytes for values less than 1024', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('should return "1 B" for 1 byte', () => {
    expect(formatFileSize(1)).toBe('1 B');
  });

  it('should return "1023 B" for 1023 bytes', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('should return KB with 1 decimal for values in KB range', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('should format KB with correct decimal precision', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should return MB with 1 decimal for values in MB range', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('should format MB with correct decimal precision', () => {
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('should return GB with 2 decimals for values in GB range', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('should format large GB values correctly', () => {
    // 8.5 GB
    expect(formatFileSize(8.5 * 1024 * 1024 * 1024)).toBe('8.50 GB');
  });

  it('should treat negative values as 0', () => {
    expect(formatFileSize(-100)).toBe('0 B');
  });
});
