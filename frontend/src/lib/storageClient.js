const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function localGet(key) {
  try {
    return { value: window.localStorage.getItem(key) };
  } catch {
    return { value: null };
  }
}

function localSet(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore quota/privacy mode issues
  }
}

export function installWindowStorageShim() {
  if (typeof window === 'undefined') return;
  if (window.storage && typeof window.storage.get === 'function' && typeof window.storage.set === 'function') {
    return;
  }

  window.storage = {
    async get(key) {
      try {
        const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const value = data && Object.prototype.hasOwnProperty.call(data, 'value') ? data.value : null;
        if (value != null) localSet(key, value);
        return { value };
      } catch {
        return localGet(key);
      }
    },

    async set(key, value) {
      const stringValue = String(value);
      try {
        const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ value: stringValue })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        localSet(key, stringValue);
      }
    }
  };
}
