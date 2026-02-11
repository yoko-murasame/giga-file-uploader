import { ChevronDown, Check } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';

import { useUploadStore } from '@/stores/uploadStore';

const RETENTION_OPTIONS = [3, 5, 7, 14, 30, 60, 100] as const;

interface RetentionSelectorProps {
  disabled?: boolean;
}

function RetentionSelector({ disabled }: RetentionSelectorProps) {
  const retentionDays = useUploadStore((s) => s.retentionDays);
  const setRetentionDays = useUploadStore((s) => s.setRetentionDays);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface
                   px-3 py-2 text-sm text-text-primary hover:bg-bg
                   focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none
                   disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="选择文件保留期限"
      >
        {retentionDays} 天
        <ChevronDown className="h-4 w-4 text-text-secondary" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[120px] rounded-md border border-border bg-surface
                     p-1 shadow-md"
          sideOffset={4}
          align="start"
        >
          {RETENTION_OPTIONS.map((days) => (
            <DropdownMenu.Item
              key={days}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5
                         text-sm text-text-primary outline-none
                         data-[highlighted]:bg-bg"
              onSelect={() => setRetentionDays(days)}
            >
              <Check
                className={`h-4 w-4 ${days === retentionDays ? 'opacity-100' : 'opacity-0'}`}
              />
              {days} 天
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default RetentionSelector;
