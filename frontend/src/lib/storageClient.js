import {
  deleteStateEntry,
  getCurrentSession,
  getStateEntry,
  hasSupabaseRepository,
  isCurrentUserAdmin,
  signInWithPassword,
  signOutCurrentSession,
  subscribeToStateChanges,
  upsertStateEntry,
} from './trackflowRepository.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const STORAGE_MODE = hasSupabaseRepository() ? 'supabase' : 'legacy_api';

const CLIENT_ID_KEY = 'trackflow_client_id';
const LAST_SEQ_KEY = 'trackflow_last_seq';
const DEFAULT_SYNC_INTERVAL_MS = Number(import.meta.env.VITE_STORAGE_SYNC_INTERVAL_MS || 700);
const DEFAULT_SYNC_LIMIT = Number(import.meta.env.VITE_STORAGE_SYNC_LIMIT || 200);
const PRIVATE_KEYS = new Set(['tf_user']);

let syncStarted = false;
let syncTimer = null;
let syncInFlight = false;
let clientIdCache = null;
let lastSeqCache = null;
let realtimeChannelHandle = null;
let writeEnabled = STORAGE_MODE !== 'supabase';

const entryVersionByKey = new Map();

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

function sessionGet(key) {
  try {
    return { value: window.sessionStorage.getItem(key) };
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

function sessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, String(value));
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
  const existing = sessionGet(CLIENT_ID_KEY).value;
  if (existing && String(existing).trim()) {
    clientIdCache = String(existing).trim();
    return clientIdCache;
  }
  const next = safeRandomId();
  clientIdCache = next;
  sessionSet(CLIENT_ID_KEY, next);
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

function toMillis(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function toVersion(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function shouldApplySnapshot(key, snapshot) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return false;

  const next = {
    version: toVersion(snapshot?.version),
    updatedAt: toMillis(snapshot?.updatedAt),
  };
  const prev = entryVersionByKey.get(safeKey);

  if (!prev) {
    entryVersionByKey.set(safeKey, next);
    return true;
  }

  if (next.version > 0 && prev.version > 0) {
    if (next.version < prev.version) return false;
    if (next.version === prev.version && next.updatedAt <= prev.updatedAt) return false;
  } else if (next.updatedAt > 0 && next.updatedAt <= prev.updatedAt) {
    return false;
  }

  entryVersionByKey.set(safeKey, {
    version: Math.max(prev.version, next.version),
    updatedAt: Math.max(prev.updatedAt, next.updatedAt),
  });
  return true;
}

function syncSnapshot(key, snapshot) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  entryVersionByKey.set(safeKey, {
    version: toVersion(snapshot?.version),
    updatedAt: toMillis(snapshot?.updatedAt),
  });
}

function removeSnapshot(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  entryVersionByKey.delete(safeKey);
}

function dispatchRemoteStorageUpdated(keys, extraDetail = {}) {
  if (typeof window === 'undefined') return;
  const deduped = Array.from(
    new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || '').trim()).filter(Boolean))
  );
  if (!deduped.length) return;
  window.dispatchEvent(new CustomEvent('trackflow:storage-updated', {
    detail: {
      keys: deduped,
      source: 'remote',
      ...extraDetail,
    },
  }));
}

function isPrivateKey(key) {
  return PRIVATE_KEYS.has(String(key || '').trim());
}

async function fetchKeyFromSupabase(key) {
  if (isPrivateKey(key)) return localGet(key).value;

  const row = await getStateEntry(key);
  if (!row || row.value == null) {
    removeSnapshot(key);
    localRemove(key);
    return null;
  }
  syncSnapshot(key, row);
  localSet(key, row.value);
  return row.value;
}

async function setKeyInSupabase(key, value) {
  const stringValue = String(value ?? '');
  const previous = localGet(key).value;
  localSet(key, stringValue);

  if (previous === stringValue) return;
  if (isPrivateKey(key)) return;
  if (!writeEnabled) return;

  const row = await upsertStateEntry({
    key,
    value: stringValue,
    isPublic: true,
    updatedBy: getClientId(),
  });
  syncSnapshot(key, row);
}

async function deleteKeyInSupabase(key) {
  if (isPrivateKey(key)) {
    localRemove(key);
    removeSnapshot(key);
    return;
  }
  localRemove(key);
  removeSnapshot(key);
  if (!writeEnabled) return;
  await deleteStateEntry(key);
}

function handleSupabaseInsert(row) {
  const key = String(row?.key || '').trim();
  if (!key || isPrivateKey(key)) return;
  if (!shouldApplySnapshot(key, row)) return;
  const nextValue = row?.value == null ? null : String(row.value);
  const previous = localGet(key).value;
  if (nextValue == null) {
    localRemove(key);
  } else {
    localSet(key, nextValue);
  }
  if (previous !== nextValue) {
    dispatchRemoteStorageUpdated([key], { event: 'INSERT' });
  }
}

function handleSupabaseUpdate(row) {
  const key = String(row?.key || '').trim();
  if (!key || isPrivateKey(key)) return;
  if (!shouldApplySnapshot(key, row)) return;
  const nextValue = row?.value == null ? null : String(row.value);
  const previous = localGet(key).value;
  if (nextValue == null) {
    localRemove(key);
  } else {
    localSet(key, nextValue);
  }
  if (previous !== nextValue) {
    dispatchRemoteStorageUpdated([key], { event: 'UPDATE' });
  }
}

function handleSupabaseDelete(row) {
  const key = String(row?.key || '').trim();
  if (!key || isPrivateKey(key)) return;
  if (!shouldApplySnapshot(key, row)) return;
  const previous = localGet(key).value;
  localRemove(key);
  removeSnapshot(key);
  if (previous != null) {
    dispatchRemoteStorageUpdated([key], { event: 'DELETE' });
  }
}

async function refreshWriteAccessFromSession() {
  if (STORAGE_MODE !== 'supabase') {
    writeEnabled = true;
    return writeEnabled;
  }
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      writeEnabled = false;
      return false;
    }
    writeEnabled = await isCurrentUserAdmin();
    return writeEnabled;
  } catch {
    writeEnabled = false;
    return false;
  }
}

async function startSupabaseRealtime() {
  if (realtimeChannelHandle || typeof window === 'undefined') return;
  realtimeChannelHandle = subscribeToStateChanges({
    onInsert: handleSupabaseInsert,
    onUpdate: handleSupabaseUpdate,
    onDelete: handleSupabaseDelete,
    onError: (error) => {
      console.error('[storage] realtime error:', error);
    },
  });
}

async function fetchKeyFromApi(key) {
  const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
    method: 'GET',
    cache: 'no-store',
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
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const latestSeq = Number(payload?.latestSeq ?? previousSeq);
    if (Number.isFinite(latestSeq) && latestSeq < previousSeq) {
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

function startLegacySyncLoop() {
  pollChangesOnce();
  syncTimer = window.setInterval(pollChangesOnce, Math.max(DEFAULT_SYNC_INTERVAL_MS, 300));
  window.addEventListener('focus', pollChangesOnce);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollChangesOnce();
  });
  window.addEventListener('online', pollChangesOnce);
}

function startSyncLoop() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  if (STORAGE_MODE === 'supabase') {
    refreshWriteAccessFromSession().catch(() => {
      writeEnabled = false;
    });
    startSupabaseRealtime();
    return;
  }
  startLegacySyncLoop();
}

export async function hydrateStorageWriteAccess() {
  return await refreshWriteAccessFromSession();
}

export function isStorageWriteEnabled() {
  return writeEnabled;
}

export async function signInSupabaseAdmin({ email, password }) {
  if (STORAGE_MODE !== 'supabase') {
    writeEnabled = true;
    return { ok: true, mode: STORAGE_MODE };
  }
  try {
    await signInWithPassword({ email, password });
    const admin = await isCurrentUserAdmin();
    if (!admin) {
      await signOutCurrentSession();
      writeEnabled = false;
      return { ok: false, error: 'Tu usuario existe, pero no tiene rol de entrenador (admin).' };
    }
    writeEnabled = true;
    return { ok: true, mode: STORAGE_MODE };
  } catch (error) {
    writeEnabled = false;
    return { ok: false, error: error?.message || 'No se pudo iniciar sesion en Supabase.' };
  }
}

export async function signOutStorageSession() {
  if (STORAGE_MODE !== 'supabase') {
    writeEnabled = true;
    return;
  }
  try {
    await signOutCurrentSession();
  } catch {
    // keep logout best-effort
  } finally {
    writeEnabled = false;
  }
}

export function installWindowStorageShim() {
  if (typeof window === 'undefined') return;

  const getWithSupabase = async (key) => {
    try {
      const value = await fetchKeyFromSupabase(key);
      return { value };
    } catch {
      return localGet(key);
    }
  };

  const setWithSupabase = async (key, value) => {
    try {
      if (value == null) {
        await deleteKeyInSupabase(key);
      } else {
        await setKeyInSupabase(key, value);
      }
    } catch (error) {
      console.error(`[storage] error guardando ${key}:`, error);
    }
  };

  const getWithApiFallback = async (key) => {
    try {
      const value = await fetchKeyFromApi(key);
      return { value };
    } catch {
      return localGet(key);
    }
  };

  const setWithApiFallback = async (key, value) => {
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
      get: STORAGE_MODE === 'supabase' ? getWithSupabase : getWithApiFallback,
      set: STORAGE_MODE === 'supabase' ? setWithSupabase : setWithApiFallback,
    };
  }

  startSyncLoop();
}
