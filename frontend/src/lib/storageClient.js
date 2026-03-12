const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const CLIENT_ID_KEY = 'trackflow_client_id';
const LAST_SEQ_KEY = 'trackflow_last_seq';
const DEFAULT_SYNC_INTERVAL_MS = Number(import.meta.env.VITE_STORAGE_SYNC_INTERVAL_MS || 2500);
const DEFAULT_SYNC_LIMIT = Number(import.meta.env.VITE_STORAGE_SYNC_LIMIT || 200);

let syncStarted = false;
let syncTimer = null;
let syncInFlight = false;
let clientIdCache = null;
let lastSeqCache = null;

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

function localRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore quota/privacy mode issues
  }
}

function safeRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getClientId() {
  if (clientIdCache) return clientIdCache;
  const existing = localGet(CLIENT_ID_KEY).value;
  if (existing && String(existing).trim()) {
    clientIdCache = String(existing).trim();
    return clientIdCache;
  }
  const next = safeRandomId();
  clientIdCache = next;
  localSet(CLIENT_ID_KEY, next);
  return next;
}

function getLastSeq() {
  if (lastSeqCache != null) return lastSeqCache;
  const raw = localGet(LAST_SEQ_KEY).value;
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  lastSeqCache = Number.isFinite(parsed) ? parsed : 0;
  return lastSeqCache;
}

function setLastSeq(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  lastSeqCache = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
  localSet(LAST_SEQ_KEY, String(lastSeqCache));
}

async function fetchKeyFromApi(key) {
  const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const value = data && Object.prototype.hasOwnProperty.call(data, 'value') ? data.value : null;
  if (value == null) {
    localRemove(key);
  } else {
    localSet(key, value);
  }
  return value;
}

async function pollChangesOnce() {
  if (syncInFlight || typeof window === 'undefined') return;
  syncInFlight = true;
  try {
    const previousSeq = getLastSeq();
    const params = new URLSearchParams({
      since: String(previousSeq),
      clientId: getClientId(),
      limit: String(Math.min(Math.max(DEFAULT_SYNC_LIMIT, 1), 500)),
    });
    const res = await fetch(apiUrl(`/api/storage/changes?${params.toString()}`), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const latestSeq = Number(payload?.latestSeq ?? previousSeq);
    if (Number.isFinite(latestSeq) && latestSeq < previousSeq) {
      // Server sequence restarted (local mode restart). Force a full UI re-sync.
      setLastSeq(latestSeq);
      window.dispatchEvent(new CustomEvent('trackflow:storage-updated', {
        detail: {
          keys: [],
          latestSeq,
          source: 'remote',
          reset: true,
        },
      }));
      return;
    }
    if (Number.isFinite(latestSeq) && latestSeq >= previousSeq) {
      setLastSeq(latestSeq);
    }
    if (!Number.isFinite(latestSeq)) {
      setLastSeq(previousSeq);
    }

    const incoming = Array.isArray(payload?.changes) ? payload.changes : [];
    if (!incoming.length) return;

    const uniqueKeys = [];
    incoming.forEach((change) => {
      const key = String(change?.key || '').trim();
      if (!key) return;
      if (!uniqueKeys.includes(key)) uniqueKeys.push(key);
    });
    if (!uniqueKeys.length) return;

    await Promise.all(uniqueKeys.map((key) => fetchKeyFromApi(key).catch(() => null)));
    window.dispatchEvent(new CustomEvent('trackflow:storage-updated', {
      detail: {
        keys: uniqueKeys,
        latestSeq,
        source: 'remote',
      },
    }));
  } catch {
    // silent fallback: app continues with local storage snapshot
  } finally {
    syncInFlight = false;
  }
}

function startSyncLoop() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  pollChangesOnce();
  syncTimer = window.setInterval(pollChangesOnce, Math.max(DEFAULT_SYNC_INTERVAL_MS, 1000));
  window.addEventListener('focus', pollChangesOnce);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollChangesOnce();
  });
  window.addEventListener('online', pollChangesOnce);
}

export function installWindowStorageShim() {
  if (typeof window === 'undefined') return;

  const getWithFallback = async (key) => {
    try {
      const value = await fetchKeyFromApi(key);
      return { value };
    } catch {
      return localGet(key);
    }
  };

  const setWithFallback = async (key, value) => {
    const stringValue = String(value);
    const previous = localGet(key).value;
    localSet(key, stringValue);
    if (previous === stringValue) return;

    try {
      const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-trackflow-client-id': getClientId(),
        },
        body: JSON.stringify({ value: stringValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // keep local value as fallback when backend is unavailable
    }
  };

  if (!window.storage || typeof window.storage.get !== 'function' || typeof window.storage.set !== 'function') {
    window.storage = {
      get: getWithFallback,
      set: setWithFallback,
    };
  }

  startSyncLoop();
}
