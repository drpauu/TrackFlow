const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const CLIENT_ID_KEY = 'trackflow_client_id';
const LAST_SEQ_KEY = 'trackflow_last_seq';
const DEFAULT_SYNC_INTERVAL_MS = Number(import.meta.env.VITE_STORAGE_SYNC_INTERVAL_MS || 700);
const DEFAULT_SYNC_LIMIT = Number(import.meta.env.VITE_STORAGE_SYNC_LIMIT || 200);
const TRACKFLOW_KEY_PREFIX = 'tf_';

let syncStarted = false;
let syncTimer = null;
let syncInFlight = false;
let shimInstalled = false;
let clientIdCache = null;
let writeEnabled = true;
const hydratedKeys = new Set();

let nativeGetItem = null;
let nativeSetItem = null;
let nativeRemoveItem = null;

let syncStatus = {
  mode: 'mongo',
  state: 'synced',
  pendingWrites: 0,
  retries: 0,
  inFlight: false,
  online: true,
  writeEnabled: true,
  realtimeStatus: 'DISABLED',
  lastError: null,
};

function isOnlineNow() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function ensureNativeStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  if (!nativeGetItem) nativeGetItem = window.localStorage.getItem.bind(window.localStorage);
  if (!nativeSetItem) nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  if (!nativeRemoveItem) nativeRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
  return true;
}

function localGet(key) {
  if (!ensureNativeStorage()) return null;
  try {
    return nativeGetItem(String(key));
  } catch {
    return null;
  }
}

function localSet(key, value) {
  if (!ensureNativeStorage()) return;
  try {
    nativeSetItem(String(key), String(value));
  } catch {
    // ignore quota / private mode errors
  }
}

function localRemove(key) {
  if (!ensureNativeStorage()) return;
  try {
    nativeRemoveItem(String(key));
  } catch {
    // ignore quota / private mode errors
  }
}

function shouldSyncKey(key) {
  return typeof key === 'string' && key.startsWith(TRACKFLOW_KEY_PREFIX);
}

function dispatchSyncStatus() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('trackflow:sync-status', {
    detail: { ...syncStatus },
  }));
}

function updateSyncStatus(patch = {}) {
  syncStatus = {
    ...syncStatus,
    ...patch,
    online: patch.online ?? isOnlineNow(),
    writeEnabled: patch.writeEnabled ?? writeEnabled,
  };
  dispatchSyncStatus();
}

function dispatchStorageUpdated(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('trackflow:storage-updated', {
    detail: {
      source: detail.source || 'remote',
      mode: 'api',
      ...detail,
    },
  }));
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function getClientId() {
  if (clientIdCache) return clientIdCache;
  const stored = localGet(CLIENT_ID_KEY);
  if (stored) {
    clientIdCache = stored;
    return clientIdCache;
  }
  const generated = (typeof window !== 'undefined' && window.crypto?.randomUUID)
    ? window.crypto.randomUUID()
    : `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  clientIdCache = generated;
  localSet(CLIENT_ID_KEY, generated);
  return generated;
}

function getLastSeq() {
  const raw = localGet(LAST_SEQ_KEY);
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function setLastSeq(value) {
  const safe = Math.max(Number.parseInt(String(value ?? ''), 10) || 0, 0);
  localSet(LAST_SEQ_KEY, String(safe));
}

async function apiRequest(path, { method = 'GET', body = null } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-trackflow-client-id': getClientId(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchKeyFromApi(key) {
  const safeKey = encodeURIComponent(String(key || '').trim());
  if (!safeKey) return null;
  const payload = await apiRequest(`/api/storage/${safeKey}`);
  return payload?.value == null ? null : String(payload.value);
}

async function pushKeyToApi(key, value) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  await apiRequest(`/api/storage/${encodeURIComponent(safeKey)}`, {
    method: 'PUT',
    body: {
      value: String(value ?? 'null'),
      clientId: getClientId(),
    },
  });
}

async function refreshKeyFromApi(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey || !shouldSyncKey(safeKey)) return;
  const previous = localGet(safeKey);
  const remoteValue = await fetchKeyFromApi(safeKey);

  if (remoteValue == null) {
    if (previous != null) {
      localRemove(safeKey);
      dispatchStorageUpdated({ key: safeKey, source: 'remote' });
    }
    return;
  }

  if (previous !== remoteValue) {
    localSet(safeKey, remoteValue);
    dispatchStorageUpdated({ key: safeKey, source: 'remote' });
  }
}

async function pollChangesOnce() {
  if (syncInFlight || typeof window === 'undefined') return;
  syncInFlight = true;
  updateSyncStatus({ inFlight: true, state: isOnlineNow() ? 'syncing' : 'offline', lastError: null });

  try {
    const since = getLastSeq();
    const query = new URLSearchParams({
      since: String(since),
      limit: String(Math.min(Math.max(DEFAULT_SYNC_LIMIT, 1), 500)),
      clientId: getClientId(),
    });
    const payload = await apiRequest(`/api/storage/changes?${query.toString()}`);

    const changes = Array.isArray(payload?.changes) ? payload.changes : [];
    let latest = Number(payload?.latestSyncVersion || payload?.latestSeq || since);

    for (const change of changes) {
      const key = String(change?.key || '').trim();
      if (!key) continue;
      await refreshKeyFromApi(key);
      const seq = Number(change?.syncVersion || change?.seq || 0);
      if (seq > latest) latest = seq;
    }

    if (Number.isFinite(latest) && latest >= 0) {
      setLastSeq(Math.max(getLastSeq(), Math.trunc(latest)));
    }

    updateSyncStatus({ inFlight: false, state: 'synced', lastError: null, online: isOnlineNow() });
  } catch (error) {
    updateSyncStatus({
      inFlight: false,
      state: isOnlineNow() ? 'error' : 'offline',
      lastError: error?.message || 'No se pudo sincronizar con el servidor.',
      online: isOnlineNow(),
    });
  } finally {
    syncInFlight = false;
  }
}

function startSyncPolling() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;

  const handleOnline = () => {
    updateSyncStatus({ state: 'syncing', online: true, lastError: null });
    void pollChangesOnce();
  };
  const handleOffline = () => {
    updateSyncStatus({ state: 'offline', online: false });
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  syncTimer = window.setInterval(() => {
    void pollChangesOnce();
  }, Math.max(DEFAULT_SYNC_INTERVAL_MS, 300));

  void pollChangesOnce();
}

export async function hydrateStorageWriteAccess() {
  startSyncPolling();
  try {
    await apiRequest('/api/auth/me');
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true, state: 'synced', lastError: null });
  } catch {
    // El backend puede no tener sesion activa; mantenemos escritura local/API habilitada.
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true, state: isOnlineNow() ? syncStatus.state : 'offline' });
  }
}

export function isStorageWriteEnabled() {
  return writeEnabled;
}

export function getStorageSyncSnapshot() {
  return { ...syncStatus };
}

export async function signInStorageSession({ email, password, role = 'coach', coachId = '' }) {
  const usernameOrEmail = String(email || '').trim();
  const safePassword = String(password || '');
  const safeRole = String(role || 'coach').trim().toLowerCase();
  const safeCoachId = String(coachId || '').trim();

  if (!usernameOrEmail || !safePassword) {
    return { ok: false, error: 'Usuario y contraseña son obligatorios.' };
  }

  try {
    const payload = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        role: safeRole,
        usernameOrEmail,
        password: safePassword,
        coachId: safeCoachId || undefined,
      },
    });
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true, state: 'synced', lastError: null });
    await pollChangesOnce();
    return { ok: true, user: payload?.user || null };
  } catch (error) {
    updateSyncStatus({ state: isOnlineNow() ? 'error' : 'offline', lastError: error?.message || null });
    return { ok: false, error: error?.message || 'No se pudo iniciar sesion.' };
  }
}

export async function signOutStorageSession() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // best effort logout
  }
  writeEnabled = true;
  updateSyncStatus({ writeEnabled: true, state: isOnlineNow() ? 'synced' : 'offline', lastError: null });
}

export function installWindowStorageShim() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  ensureNativeStorage();
  startSyncPolling();

  if (shimInstalled) return;
  shimInstalled = true;

  window.localStorage.getItem = (key) => {
    const safeKey = String(key || '');
    const value = localGet(safeKey);
    if (shouldSyncKey(safeKey) && !hydratedKeys.has(safeKey)) {
      hydratedKeys.add(safeKey);
      void refreshKeyFromApi(safeKey).catch((error) => {
        updateSyncStatus({ state: isOnlineNow() ? 'error' : 'offline', lastError: error?.message || null });
      });
    }
    return value;
  };

  window.localStorage.setItem = (key, value) => {
    const safeKey = String(key || '');
    const safeValue = String(value ?? '');
    localSet(safeKey, safeValue);
    if (!shouldSyncKey(safeKey)) return;

    updateSyncStatus({ state: isOnlineNow() ? 'syncing' : 'offline', lastError: null });
    void pushKeyToApi(safeKey, safeValue)
      .then(() => {
        updateSyncStatus({ state: 'synced', lastError: null, online: isOnlineNow() });
      })
      .catch((error) => {
        updateSyncStatus({
          state: isOnlineNow() ? 'error' : 'offline',
          lastError: error?.message || 'No se pudo guardar en el servidor.',
        });
      });
  };

  window.localStorage.removeItem = (key) => {
    const safeKey = String(key || '');
    localRemove(safeKey);
    if (!shouldSyncKey(safeKey)) return;

    updateSyncStatus({ state: isOnlineNow() ? 'syncing' : 'offline', lastError: null });
    void pushKeyToApi(safeKey, 'null')
      .then(() => {
        updateSyncStatus({ state: 'synced', lastError: null, online: isOnlineNow() });
      })
      .catch((error) => {
        updateSyncStatus({
          state: isOnlineNow() ? 'error' : 'offline',
          lastError: error?.message || 'No se pudo eliminar en el servidor.',
        });
      });
  };
}
