import { Tabs } from 'radix-ui';
import { useAppStore } from '@/stores/appStore';
import UploadPage from '@/components/upload/UploadPage';
import HistoryPage from '@/components/history/HistoryPage';

import type { TabId } from '@/types/app';

function TabNav() {
  const currentTab = useAppStore((state) => state.currentTab);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);

  return (
    <Tabs.Root
      value={currentTab}
      onValueChange={(value) => setCurrentTab(value as TabId)}
      className="flex h-screen flex-col"
    >
      <Tabs.List className="flex border-b border-border bg-surface">
        <Tabs.Trigger
          value="upload"
          className="px-4 py-3 text-text-secondary transition-colors hover:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-semibold data-[state=active]:text-brand"
        >
          上传
        </Tabs.Trigger>
        <Tabs.Trigger
          value="history"
          className="px-4 py-3 text-text-secondary transition-colors hover:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-semibold data-[state=active]:text-brand"
        >
          历史记录
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="upload" className="flex-1 overflow-hidden min-h-0 bg-bg px-6 py-4">
        <UploadPage />
      </Tabs.Content>
      <Tabs.Content value="history" className="flex-1 overflow-hidden min-h-0 bg-bg px-6 py-4">
        <HistoryPage />
      </Tabs.Content>
    </Tabs.Root>
  );
}

export default TabNav;
