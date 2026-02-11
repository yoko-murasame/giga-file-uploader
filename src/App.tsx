import { useEffect } from 'react';

import TabNav from '@/components/shared/TabNav';
import { useUploadStore } from '@/stores/uploadStore';

function App() {
  useEffect(() => {
    useUploadStore.getState().loadRetentionPreference();
  }, []);

  return (
    <div className="min-h-screen bg-bg font-sans text-sm text-text-primary">
      <TabNav />
    </div>
  );
}

export default App;
