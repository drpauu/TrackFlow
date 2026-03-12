import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installWindowStorageShim } from './lib/storageClient.js';
import { PESAS2024_HARDCODED_DB } from './data/pesas2024_hardcoded_db.js';

installWindowStorageShim();
if (typeof window !== 'undefined') {
  window.PESAS2024_HARDCODED_DB = PESAS2024_HARDCODED_DB;
}

function RootApp() {
  const [reloadKey, setReloadKey] = React.useState(0);
  const reloadTimerRef = React.useRef(null);

  React.useEffect(() => {
    const handleRemoteStorageUpdate = (event) => {
      if (event?.detail?.source !== 'remote') return;
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        React.startTransition(() => {
          setReloadKey((prev) => prev + 1);
        });
      }, 180);
    };

    window.addEventListener('trackflow:storage-updated', handleRemoteStorageUpdate);
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      window.removeEventListener('trackflow:storage-updated', handleRemoteStorageUpdate);
    };
  }, []);

  return <App key={reloadKey} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
