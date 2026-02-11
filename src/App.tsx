import { useEffect } from 'react';

import TabNav from '@/components/shared/TabNav';
import { useAppStore } from '@/stores/appStore';
import { useUploadStore } from '@/stores/uploadStore';

function App() {
  useEffect(() => {
    useUploadStore.getState().loadRetentionPreference();
    useAppStore.getState().checkNetworkStatus();

    const handleOnline = () => {
      useAppStore.getState().checkNetworkStatus();
    };
    const handleOffline = () => {
      useAppStore.getState().setOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-bg font-sans text-sm text-text-primary">
      <TabNav />
    </div>
  );
}

export default App;
