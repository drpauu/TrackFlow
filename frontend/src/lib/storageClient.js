import {
  deleteStateEntries,
  getCurrentSession,
  getStateEntry,
  hasSupabaseRepository,
  isCurrentUserAdmin,
  listStateEntries,
  signInWithPassword,
  signOutCurrentSession,
  subscribeToStateChanges,
  upsertStateEntries,
} from './trackflowRepository.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const STORAGE_MODE_OVERRIDE = String(import.meta.env.VITE_STORAGE_MODE || '').trim().toLowerCase();
const STORAGE_MODE = (() => {
  if (STORAGE_MODE_OVERRIDE === 'api' || STORAGE_MODE_OVERRIDE === 'legacy_api') {
    return 'legacy_api';
  }
  if (STORAGE_MODE_OVERRIDE === 'supabase') {
    return hasSupabaseRepository() ? 'supabase' : 'legacy_api';
  }
  return 'legacy_api';
})();

const CLIENT_ID_KEY = 'trackflow_client_id';
const LAST_SEQ_KEY = 'trackflow_last_seq';
const PENDING_WRITES_CACHE_KEY = 'trackflow_supabase_pending_writes_v1';
const DEFAULT_SYNC_INTERVAL_MS = Number(import.meta.env.VITE_STORAGE_SYNC_INTERVAL_MS || 700);
const DEFAULT_SYNC_LIMIT = Number(import.meta.env.VITE_STORAGE_SYNC_LIMIT || 200);
const DEFAULT_SUPABASE_WRITE_DEBOUNCE_MS = Number(import.meta.env.VITE_SUPABASE_WRITE_DEBOUNCE_MS || 160);
const DEFAULT_SUPABASE_RETRY_BASE_MS = Number(import.meta.env.VITE_SUPABASE_RETRY_BASE_MS || 900);
const DEFAULT_SUPABASE_RETRY_MAX_MS = Number(import.meta.env.VITE_SUPABASE_RETRY_MAX_MS || 9000);
const PRIVATE_KEYS = new Set(['tf_user']);
const SUPABASE_PREFETCH_KEYS = [
  'tf_active_week_number',
  'tf_athlete_notifs',
  'tf_athletes',
  'tf_calendar_weeks',
  'tf_current_season_id',
  'tf_custom_exercises',
  'tf_exercise_images',
  'tf_groups',
  'tf_history',
  'tf_notifs',
  'tf_pesas_raw',
  'tf_routines',
  'tf_season_week_one_start',
  'tf_seasons',
  'tf_seed_meta',
  'tf_trainings',
  'tf_users_csv',
  'tf_week',
  'tf_week_plans',
];
const SUPABASE_PREFETCH_KEY_SET = new Set(SUPABASE_PREFETCH_KEYS);

let syncStarted = false;
let syncTimer = null;
let syncInFlight = false;
let clientIdCache = null;
let lastSeqCache = null;
let realtimeChannelHandle = null;
let writeEnabled = STORAGE_MODE !== 'supabase';
let supabaseCacheHydrated = false;
let supabaseCacheHydrationPromise = null;
let supabaseWriteFlushTimer = null;
let supabaseWriteFlushInFlight = false;
let supabaseWriteFlushPromise = null;
let supabaseWriteFlushRequested = false;
let supabaseRetryTimer = null;
let supabaseRetryAttempt = 0;
let realtimeReconnectTimer = null;
let realtimeReconnectAttempt = 0;
let syncStatus = {
  mode: STORAGE_MODE,
  state: STORAGE_MODE === 'supabase' ? 'idle' : 'legacy',
  pendingWrites: 0,
  retries: 0,
  inFlight: false,
  online: true,
  writeEnabled: STORAGE_MODE !== 'supabase',
  realtimeStatus: STORAGE_MODE === 'supabase' ? 'INITIAL' : 'DISABLED',
  lastError: null,
};

const entryVersionByKey = new Map();
const knownSupabaseKeys = new Set();
const pendingSupabaseWrites = new Map();

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

function isOnlineNow() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function dispatchSyncStatus() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('trackflow:sync-status', {
    detail: { ...syncStatus },
  }));
}

function updateSyncStatus(patch = {}) {
  const nextOnline = patch.online ?? isOnlineNow();
  syncStatus = {
    ...syncStatus,
    ...patch,
    online: nextOnline,
    pendingWrites: patch.pendingWrites ?? pendingSupabaseWrites.size,
    inFlight: patch.inFlight ?? supabaseWriteFlushInFlight,
    retries: patch.retries ?? supabaseRetryAttempt,
    writeEnabled: patch.writeEnabled ?? writeEnabled,
  };
  dispatchSyncStatus();
}

function getPendingWritesCacheRaw() {
  if (typeof window === 'undefined') return null;
  return localGet(PENDING_WRITES_CACHE_KEY).value;
}

function persistPendingWritesCache() {
  if (typeof window === 'undefined') return;
  if (!pendingSupabaseWrites.size) {
    localRemove(PENDING_WRITES_CACHE_KEY);
    updateSyncStatus({ pendingWrites: 0 });
    return;
  }
  const payload = Array.from(pendingSupabaseWrites.values()).map((entry) => ({
    type: entry.type === 'delete' ? 'delete' : 'upsert',
    key: entry.key,
    value: entry.value ?? null,
    isPublic: entry.isPublic !== false,
    updatedBy: entry.updatedBy || null,
  }));
  localSet(PENDING_WRITES_CACHE_KEY, JSON.stringify(payload));
  updateSyncStatus({ pendingWrites: payload.length });
}

function restorePendingWritesCache() {
  if (STORAGE_MODE !== 'supabase' || typeof window === 'undefined') return;
  if (pendingSupabaseWrites.size) return;
  const raw = getPendingWritesCacheRaw();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    parsed.forEach((entry) => {
      const key = String(entry?.key || '').trim();
      if (!key || isPrivateKey(key)) return;
      pendingSupabaseWrites.set(key, {
        type: entry?.type === 'delete' ? 'delete' : 'upsert',
        key,
        value: entry?.value == null ? null : String(entry.value),
        isPublic: entry?.isPublic !== false,
        updatedBy: entry?.updatedBy || null,
        resolvers: [],
        rejectors: [],
      });
    });
    persistPendingWritesCache();
  } catch {
    localRemove(PENDING_WRITES_CACHE_KEY);
  }
}

function clearSupabaseRetryTimer() {
  if (!supabaseRetryTimer) return;
  clearTimeout(supabaseRetryTimer);
  supabaseRetryTimer = null;
}

function clearRealtimeReconnectTimer() {
  if (!realtimeReconnectTimer) return;
  clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
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

function rememberKnownSupabaseKey(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey || isPrivateKey(safeKey)) return;
  knownSupabaseKeys.add(safeKey);
}

function forgetKnownSupabaseKey(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  knownSupabaseKeys.delete(safeKey);
}

function resolvePendingWrite(entry, value = null) {
  if (!entry || !Array.isArray(entry.resolvers)) return;
  entry.resolvers.forEach((resolve) => {
    try {
      resolve(value);
    } catch {
      // ignore resolve errors
    }
  });
}

function rejectPendingWrite(entry, error) {
  if (!entry || !Array.isArray(entry.rejectors)) return;
  entry.rejectors.forEach((reject) => {
    try {
      reject(error);
    } catch {
      // ignore reject errors
    }
  });
}

function clearPendingWrites(error) {
  if (!pendingSupabaseWrites.size) return;
  const batch = Array.from(pendingSupabaseWrites.values());
  pendingSupabaseWrites.clear();
  persistPendingWritesCache();
  if (!error) {
    batch.forEach((entry) => resolvePendingWrite(entry, null));
    return;
  }
  batch.forEach((entry) => rejectPendingWrite(entry, error));
}

function mergePendingWriteEntry(nextOperation, resolvers = [], rejectors = []) {
  const safeKey = String(nextOperation?.key || '').trim();
  if (!safeKey) return null;
  const existing = pendingSupabaseWrites.get(safeKey);
  if (existing) {
    existing.type = nextOperation.type === 'delete' ? 'delete' : 'upsert';
    existing.value = nextOperation.value ?? null;
    existing.isPublic = nextOperation.isPublic;
    existing.updatedBy = nextOperation.updatedBy;
    if (resolvers.length) existing.resolvers.push(...resolvers);
    if (rejectors.length) existing.rejectors.push(...rejectors);
    return existing;
  }

  const created = {
    type: nextOperation.type === 'delete' ? 'delete' : 'upsert',
    key: safeKey,
    value: nextOperation.value ?? null,
    isPublic: nextOperation.isPublic,
    updatedBy: nextOperation.updatedBy,
    resolvers: [...resolvers],
    rejectors: [...rejectors],
  };
  pendingSupabaseWrites.set(safeKey, created);
  return created;
}

function enqueueRetryBatch(entries = [], error = null) {
  entries.forEach((entry) => {
    if (!entry?.key) return;
    mergePendingWriteEntry(entry, entry.resolvers || [], entry.rejectors || []);
  });
  persistPendingWritesCache();

  if (!isOnlineNow()) {
    updateSyncStatus({
      state: 'offline',
      lastError: error?.message || 'Sin conexion. Reintentando cuando vuelva internet.',
    });
    return;
  }

  const nextAttempt = supabaseRetryAttempt + 1;
  const delayMs = Math.min(
    DEFAULT_SUPABASE_RETRY_BASE_MS * Math.pow(2, Math.max(nextAttempt - 1, 0)),
    DEFAULT_SUPABASE_RETRY_MAX_MS
  );

  if (!supabaseRetryTimer) {
    supabaseRetryTimer = setTimeout(() => {
      supabaseRetryTimer = null;
      flushSupabaseWrites().catch((flushError) => {
        console.error('[storage] error reintentando sincronizacion:', flushError);
      });
    }, delayMs);
  }
  supabaseRetryAttempt = nextAttempt;
  updateSyncStatus({
    state: 'retrying',
    retries: nextAttempt,
    lastError: error?.message || 'Error temporal sincronizando cambios.',
  });
}

function handleRealtimeStatus(status, error = null) {
  const nextStatus = String(status || 'UNKNOWN').toUpperCase();
  if (nextStatus === 'SUBSCRIBED') {
    realtimeReconnectAttempt = 0;
    clearRealtimeReconnectTimer();
    updateSyncStatus({ realtimeStatus: nextStatus });
    return;
  }

  updateSyncStatus({
    realtimeStatus: nextStatus,
    lastError: error?.message || syncStatus.lastError,
  });

  if (!['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(nextStatus)) return;
  if (realtimeReconnectTimer || typeof window === 'undefined') return;

  const delayMs = Math.min(700 * Math.pow(2, realtimeReconnectAttempt), 10000);
  realtimeReconnectAttempt += 1;
  realtimeReconnectTimer = setTimeout(async () => {
    realtimeReconnectTimer = null;
    if (realtimeChannelHandle?.unsubscribe) {
      try {
        await realtimeChannelHandle.unsubscribe();
      } catch {
        // ignore cleanup errors
      }
    }
    realtimeChannelHandle = null;
    startSupabaseRealtime().catch((reconnectError) => {
      console.error('[storage] error reconectando realtime:', reconnectError);
    });
  }, delayMs);
}

async function flushSupabaseWrites() {
  if (STORAGE_MODE !== 'supabase') return;
  if (!pendingSupabaseWrites.size && !supabaseWriteFlushInFlight) return;

  if (supabaseWriteFlushInFlight) {
    supabaseWriteFlushRequested = true;
    return supabaseWriteFlushPromise;
  }

  if (!isOnlineNow()) {
    const retryBatch = Array.from(pendingSupabaseWrites.values()).map((entry) => ({
      ...entry,
      resolvers: Array.isArray(entry?.resolvers) ? [...entry.resolvers] : [],
      rejectors: Array.isArray(entry?.rejectors) ? [...entry.rejectors] : [],
    }));
    pendingSupabaseWrites.clear();
    enqueueRetryBatch(retryBatch, new Error('Sin conexion a internet'));
    return;
  }

  clearSupabaseRetryTimer();
  supabaseWriteFlushInFlight = true;
  updateSyncStatus({ state: 'syncing', inFlight: true, lastError: null });
  supabaseWriteFlushPromise = (async () => {
    do {
      supabaseWriteFlushRequested = false;
      const batch = Array.from(pendingSupabaseWrites.values());
      pendingSupabaseWrites.clear();
      persistPendingWritesCache();
      if (!batch.length) continue;

      const upserts = batch.filter((entry) => entry.type !== 'delete');
      const deletes = batch.filter((entry) => entry.type === 'delete');

      if (upserts.length) {
        try {
          const rows = await upsertStateEntries(
            upserts.map((entry) => ({
              key: entry.key,
              value: entry.value,
              isPublic: entry.isPublic,
              updatedBy: entry.updatedBy,
            }))
          );
          const rowByKey = new Map(
            (Array.isArray(rows) ? rows : [])
              .filter((row) => row?.key)
              .map((row) => [row.key, row])
          );
          upserts.forEach((entry) => {
            const row = rowByKey.get(entry.key) || null;
            if (row) {
              syncSnapshot(entry.key, row);
            } else {
              syncSnapshot(entry.key, { updatedAt: new Date().toISOString() });
            }
            rememberKnownSupabaseKey(entry.key);
            resolvePendingWrite(entry, row);
          });
        } catch (error) {
          enqueueRetryBatch(upserts, error);
        }
      }

      if (deletes.length) {
        try {
          await deleteStateEntries(deletes.map((entry) => entry.key));
          deletes.forEach((entry) => {
            forgetKnownSupabaseKey(entry.key);
            removeSnapshot(entry.key);
            resolvePendingWrite(entry, null);
          });
        } catch (error) {
          enqueueRetryBatch(deletes, error);
        }
      }
      persistPendingWritesCache();
    } while (supabaseWriteFlushRequested || pendingSupabaseWrites.size > 0);
  })();

  try {
    await supabaseWriteFlushPromise;
    if (!pendingSupabaseWrites.size) {
      supabaseRetryAttempt = 0;
      updateSyncStatus({
        state: 'synced',
        retries: 0,
        lastError: null,
      });
    }
  } finally {
    supabaseWriteFlushInFlight = false;
    supabaseWriteFlushPromise = null;
    updateSyncStatus({ inFlight: false });
  }
}

function scheduleSupabaseWriteFlush(options = {}) {
  const immediate = options?.immediate === true;
  if (supabaseWriteFlushTimer) {
    clearTimeout(supabaseWriteFlushTimer);
    supabaseWriteFlushTimer = null;
  }

  if (immediate) {
    return flushSupabaseWrites();
  }

  const delayMs = Math.max(DEFAULT_SUPABASE_WRITE_DEBOUNCE_MS, 0);
  supabaseWriteFlushTimer = setTimeout(() => {
    supabaseWriteFlushTimer = null;
    flushSupabaseWrites().catch((error) => {
      console.error('[storage] error sincronizando cambios pendientes:', error);
    });
  }, delayMs);
  return Promise.resolve();
}

function enqueueSupabaseWrite(nextOperation) {
  const safeKey = String(nextOperation?.key || '').trim();
  if (!safeKey) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    mergePendingWriteEntry({ ...nextOperation, key: safeKey }, [resolve], [reject]);
    persistPendingWritesCache();
    updateSyncStatus({ state: 'queued', lastError: null });
    scheduleSupabaseWriteFlush();
  });
}

async function hydrateSupabaseCache() {
  if (STORAGE_MODE !== 'supabase' || typeof window === 'undefined') return false;
  if (supabaseCacheHydrated) return true;
  if (supabaseCacheHydrationPromise) return await supabaseCacheHydrationPromise;

  supabaseCacheHydrationPromise = (async () => {
    try {
      const rows = await listStateEntries({ keys: SUPABASE_PREFETCH_KEYS });
      SUPABASE_PREFETCH_KEYS.forEach((prefetchKey) => {
        forgetKnownSupabaseKey(prefetchKey);
      });
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = String(row?.key || '').trim();
        if (!key || isPrivateKey(key)) return;
        rememberKnownSupabaseKey(key);
        syncSnapshot(key, row);
        if (pendingSupabaseWrites.has(key)) return;
        if (row.value == null) {
          localRemove(key);
        } else {
          localSet(key, row.value);
        }
      });
      supabaseCacheHydrated = true;
      return true;
    } catch {
      return false;
    } finally {
      supabaseCacheHydrationPromise = null;
    }
  })();

  return await supabaseCacheHydrationPromise;
}

async function fetchKeyFromSupabase(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  if (isPrivateKey(safeKey)) return localGet(safeKey).value;

  const hydrated = await hydrateSupabaseCache();
  if (hydrated && knownSupabaseKeys.has(safeKey)) {
    const localValue = localGet(safeKey).value;
    if (localValue != null) return localValue;
  }
  if (hydrated && SUPABASE_PREFETCH_KEY_SET.has(safeKey) && !knownSupabaseKeys.has(safeKey)) {
    removeSnapshot(safeKey);
    localRemove(safeKey);
    return null;
  }

  const row = await getStateEntry(safeKey);
  if (!row || row.value == null) {
    forgetKnownSupabaseKey(safeKey);
    removeSnapshot(safeKey);
    localRemove(safeKey);
    return null;
  }
  rememberKnownSupabaseKey(safeKey);
  syncSnapshot(safeKey, row);
  localSet(safeKey, row.value);
  return row.value;
}

async function setKeyInSupabase(key, value) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  const stringValue = String(value ?? '');
  const previous = localGet(safeKey).value;
  localSet(safeKey, stringValue);

  if (previous === stringValue) return;
  if (isPrivateKey(safeKey)) return;
  if (!writeEnabled) return;

  rememberKnownSupabaseKey(safeKey);
  await enqueueSupabaseWrite({
    type: 'upsert',
    key: safeKey,
    value: stringValue,
    isPublic: true,
    updatedBy: getClientId(),
  });
}

async function deleteKeyInSupabase(key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  if (isPrivateKey(safeKey)) {
    localRemove(safeKey);
    removeSnapshot(safeKey);
    return;
  }
  localRemove(safeKey);
  forgetKnownSupabaseKey(safeKey);
  removeSnapshot(safeKey);
  if (!writeEnabled) return;
  await enqueueSupabaseWrite({
    type: 'delete',
    key: safeKey,
  });
}

function handleSupabaseInsert(row) {
  const key = String(row?.key || '').trim();
  if (!key || isPrivateKey(key)) return;
  rememberKnownSupabaseKey(key);
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
  rememberKnownSupabaseKey(key);
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
  forgetKnownSupabaseKey(key);
  const previous = localGet(key).value;
  localRemove(key);
  removeSnapshot(key);
  if (previous != null) {
    dispatchRemoteStorageUpdated([key], { event: 'DELETE' });
  }
}

async function refreshWriteAccessFromSession() {
  if (STORAGE_MODE !== 'supabase') {
    if (STORAGE_MODE === 'legacy_api') {
      try {
        await fetchLegacyAuthUser();
      } catch {
        // Auth en modo API puede ser opcional.
      }
    }
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true });
    return writeEnabled;
  }
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      writeEnabled = false;
      clearPendingWrites(new Error('Sesion expirada. Cambios pendientes descartados.'));
      updateSyncStatus({ writeEnabled: false, state: 'readonly' });
      return false;
    }
    writeEnabled = await isCurrentUserAdmin();
    if (!writeEnabled) {
      clearPendingWrites(new Error('Usuario sin permisos de escritura.'));
    }
    updateSyncStatus({ writeEnabled, state: writeEnabled ? syncStatus.state : 'readonly' });
    return writeEnabled;
  } catch {
    writeEnabled = false;
    clearPendingWrites(new Error('No se pudo validar permisos de escritura.'));
    updateSyncStatus({ writeEnabled: false, state: 'readonly' });
    return false;
  }
}

async function startSupabaseRealtime() {
  if (realtimeChannelHandle || typeof window === 'undefined') return;
  updateSyncStatus({ realtimeStatus: 'CONNECTING' });
  realtimeChannelHandle = subscribeToStateChanges({
    onInsert: handleSupabaseInsert,
    onUpdate: handleSupabaseUpdate,
    onDelete: handleSupabaseDelete,
    onStatus: handleRealtimeStatus,
    onError: (error) => {
      console.error('[storage] realtime error:', error);
      handleRealtimeStatus('CHANNEL_ERROR', error);
    },
  });
}

async function fetchKeyFromApi(key) {
  const res = await fetch(apiUrl(`/api/storage/${encodeURIComponent(key)}`), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
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

async function fetchLegacyAuthUser() {
  const res = await fetch(apiUrl('/api/auth/me'), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  try {
    const payload = await res.json();
    return payload?.user || null;
  } catch {
    return null;
  }
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
      credentials: 'include',
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
  updateSyncStatus({
    state: STORAGE_MODE === 'supabase' ? 'idle' : 'legacy',
    online: isOnlineNow(),
    writeEnabled,
  });
  if (STORAGE_MODE === 'supabase') {
    restorePendingWritesCache();
    refreshWriteAccessFromSession().catch(() => {
      writeEnabled = false;
      updateSyncStatus({ writeEnabled: false });
    });
    const refreshSupabaseCache = () => {
      supabaseCacheHydrated = false;
      hydrateSupabaseCache().catch(() => {
        // keep lazy key-by-key fallback when prefetch fails
      });
    };
    const flushPendingWrites = () => {
      scheduleSupabaseWriteFlush({ immediate: true }).catch(() => {
        // best effort flush while page is losing focus
      });
    };
    const handleOnline = () => {
      updateSyncStatus({
        online: true,
        state: !writeEnabled ? 'readonly' : (pendingSupabaseWrites.size ? 'queued' : 'synced'),
      });
      refreshSupabaseCache();
      if (!realtimeChannelHandle) {
        startSupabaseRealtime().catch((error) => {
          console.error('[storage] error iniciando realtime:', error);
        });
      }
      flushPendingWrites();
    };
    const handleOffline = () => {
      updateSyncStatus({ online: false, state: 'offline' });
    };

    refreshSupabaseCache();
    startSupabaseRealtime();
    if (pendingSupabaseWrites.size) {
      scheduleSupabaseWriteFlush({ immediate: true }).catch(() => {
        // best effort boot flush
      });
    }
    window.addEventListener('focus', refreshSupabaseCache);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', flushPendingWrites);
    window.addEventListener('beforeunload', flushPendingWrites);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (isOnlineNow()) handleOnline();
        else handleOffline();
        return;
      }
      flushPendingWrites();
    });
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

export function getStorageSyncSnapshot() {
  return { ...syncStatus };
}

export async function signInSupabaseAdmin({ email, password, role = 'coach', coachId = '' }) {
  const normalizedRole = String(role || 'coach').trim().toLowerCase() === 'athlete' ? 'athlete' : 'coach';
  if (STORAGE_MODE === 'legacy_api') {
    const usernameOrEmail = String(email || '').trim();
    const safePassword = String(password || '');
    if (!usernameOrEmail || !safePassword) {
      return { ok: false, error: 'Usuario/email y contraseña son obligatorios.' };
    }
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          role: normalizedRole,
          coachId: String(coachId || '').trim() || undefined,
          usernameOrEmail,
          password: safePassword,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        return {
          ok: false,
          error: payload?.error || `Error ${res.status} autenticando ${normalizedRole === 'coach' ? 'entrenador' : 'atleta'}.`,
        };
      }
      writeEnabled = true;
      updateSyncStatus({ writeEnabled: true, state: 'synced', lastError: null });
      return { ok: true, mode: STORAGE_MODE };
    } catch (error) {
      return { ok: false, error: error?.message || 'No se pudo autenticar con la API.' };
    }
  }

  if (STORAGE_MODE !== 'supabase') {
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true });
    return { ok: true, mode: STORAGE_MODE };
  }

  if (normalizedRole !== 'coach') {
    try {
      await signOutCurrentSession();
    } catch {
      // keep athlete mode read-only in supabase
    }
    writeEnabled = false;
    updateSyncStatus({ writeEnabled: false, state: 'readonly' });
    return { ok: true, mode: STORAGE_MODE };
  }
  try {
    await signInWithPassword({ email, password });
    const admin = await isCurrentUserAdmin();
    if (!admin) {
      await signOutCurrentSession();
      writeEnabled = false;
      updateSyncStatus({ writeEnabled: false, state: 'readonly' });
      return { ok: false, error: 'Tu usuario existe, pero no tiene rol de entrenador (admin).' };
    }
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true, state: pendingSupabaseWrites.size ? 'queued' : 'synced' });
    if (pendingSupabaseWrites.size) {
      scheduleSupabaseWriteFlush({ immediate: true }).catch(() => {
        // best effort immediate sync after admin login
      });
    }
    return { ok: true, mode: STORAGE_MODE };
  } catch (error) {
    writeEnabled = false;
    updateSyncStatus({
      writeEnabled: false,
      state: 'error',
      lastError: error?.message || 'No se pudo iniciar sesion en Supabase.',
    });
    return { ok: false, error: error?.message || 'No se pudo iniciar sesion en Supabase.' };
  }
}

export async function signOutStorageSession() {
  if (STORAGE_MODE === 'legacy_api') {
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // keep logout best-effort
    } finally {
      writeEnabled = true;
      updateSyncStatus({ writeEnabled: true });
    }
    return;
  }

  if (STORAGE_MODE !== 'supabase') {
    writeEnabled = true;
    updateSyncStatus({ writeEnabled: true });
    return;
  }
  try {
    await scheduleSupabaseWriteFlush({ immediate: true });
    await signOutCurrentSession();
  } catch {
    // keep logout best-effort
  } finally {
    clearPendingWrites(new Error('Sesion cerrada. Cambios pendientes descartados.'));
    writeEnabled = false;
    updateSyncStatus({ writeEnabled: false, state: 'readonly' });
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
      updateSyncStatus({ state: 'error', lastError: error?.message || `Error guardando ${key}` });
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-trackflow-client-id': getClientId(),
        },
        body: JSON.stringify({ value: stringValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      updateSyncStatus({
        state: 'error',
        lastError: error?.message || `Error guardando ${key} en API`,
      });
    }
  };

  if (!window.storage || typeof window.storage.get !== 'function' || typeof window.storage.set !== 'function') {
    window.storage = {
      get: STORAGE_MODE === 'supabase' ? getWithSupabase : getWithApiFallback,
      set: STORAGE_MODE === 'supabase' ? setWithSupabase : setWithApiFallback,
    };
  }

  startSyncLoop();
  dispatchSyncStatus();
}
