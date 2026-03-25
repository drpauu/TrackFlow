import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installWindowStorageShim } from './lib/storageClient.js';
import { PESAS2024_HARDCODED_DB } from './data/pesas2024_hardcoded_db.js';

installWindowStorageShim();
if (typeof window !== 'undefined') {
  window.PESAS2024_HARDCODED_DB = PESAS2024_HARDCODED_DB;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
