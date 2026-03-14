import { hasSupabaseConfig, supabase } from './supabaseClient.js';

const STATE_TABLE = 'app_kv';
const PROFILES_TABLE = 'app_profiles';
const STATE_SELECT_COLUMNS = 'key,value,is_public,position,version,updated_at,updated_by';

function createRepositoryError(context, error) {
  const message = error?.message ? `${context}: ${error.message}` : context;
  const wrapped = new Error(message);
  wrapped.cause = error;
  return wrapped;
}

function assertSupabaseConfigured() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase no configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
}

function normalizeKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) throw new Error('La key no puede estar vacia.');
  return normalized;
}

function normalizePosition(position) {
  if (position == null || position === '') return null;
  const parsed = Number(position);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeVersion(version) {
  const parsed = Number(version);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    key: String(row.key || '').trim(),
    value: row.value == null ? null : String(row.value),
    isPublic: row.is_public !== false,
    position: normalizePosition(row.position),
    version: normalizeVersion(row.version),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

function buildStatePayload({ key, value, isPublic = true, position = null, updatedBy = null }) {
  return {
    key: normalizeKey(key),
    value: value == null ? '' : String(value),
    is_public: isPublic !== false,
    position: normalizePosition(position),
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  };
}

export function hasSupabaseRepository() {
  return hasSupabaseConfig && !!supabase;
}

export async function listStateEntries(options = {}) {
  assertSupabaseConfigured();
  const keys = Array.isArray(options?.keys)
    ? options.keys.map((key) => String(key || '').trim()).filter(Boolean)
    : null;

  let query = supabase
    .from(STATE_TABLE)
    .select(STATE_SELECT_COLUMNS)
    .order('key', { ascending: true });

  if (keys?.length) query = query.in('key', keys);
  if (options?.onlyPublic === true) query = query.eq('is_public', true);

  const { data, error } = await query;
  if (error) throw createRepositoryError('No se pudieron listar los registros', error);
  return (Array.isArray(data) ? data : []).map((row) => normalizeRow(row)).filter(Boolean);
}

export async function getStateEntry(key) {
  assertSupabaseConfigured();
  const safeKey = normalizeKey(key);
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .select(STATE_SELECT_COLUMNS)
    .eq('key', safeKey)
    .maybeSingle();
  if (error) throw createRepositoryError(`No se pudo leer la key ${safeKey}`, error);
  return normalizeRow(data);
}

export async function createStateEntry(entry) {
  assertSupabaseConfigured();
  const payload = buildStatePayload(entry || {});
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .insert(payload)
    .select(STATE_SELECT_COLUMNS)
    .single();
  if (error) throw createRepositoryError(`No se pudo crear la key ${payload.key}`, error);
  return normalizeRow(data);
}

export async function updateStateEntry(entry) {
  assertSupabaseConfigured();
  const payload = buildStatePayload(entry || {});
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .update(payload)
    .eq('key', payload.key)
    .select(STATE_SELECT_COLUMNS)
    .single();
  if (error) throw createRepositoryError(`No se pudo actualizar la key ${payload.key}`, error);
  return normalizeRow(data);
}

export async function upsertStateEntry(entry) {
  assertSupabaseConfigured();
  const payload = buildStatePayload(entry || {});
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .upsert(payload, { onConflict: 'key' })
    .select(STATE_SELECT_COLUMNS)
    .single();
  if (error) throw createRepositoryError(`No se pudo guardar la key ${payload.key}`, error);
  return normalizeRow(data);
}

export async function upsertStateEntries(entries = []) {
  assertSupabaseConfigured();
  const payloads = (Array.isArray(entries) ? entries : [])
    .map((entry) => buildStatePayload(entry || {}))
    .filter((entry) => entry?.key);

  if (!payloads.length) return [];

  const { data, error } = await supabase
    .from(STATE_TABLE)
    .upsert(payloads, { onConflict: 'key' })
    .select(STATE_SELECT_COLUMNS);

  if (error) throw createRepositoryError('No se pudieron guardar registros en lote', error);
  return (Array.isArray(data) ? data : []).map((row) => normalizeRow(row)).filter(Boolean);
}

export async function deleteStateEntry(key) {
  assertSupabaseConfigured();
  const safeKey = normalizeKey(key);
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .delete()
    .eq('key', safeKey)
    .select(STATE_SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw createRepositoryError(`No se pudo eliminar la key ${safeKey}`, error);
  return normalizeRow(data);
}

export async function deleteStateEntries(keys = []) {
  assertSupabaseConfigured();
  const safeKeys = (Array.isArray(keys) ? keys : [])
    .map((key) => {
      try {
        return normalizeKey(key);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!safeKeys.length) return [];

  const { data, error } = await supabase
    .from(STATE_TABLE)
    .delete()
    .in('key', safeKeys)
    .select(STATE_SELECT_COLUMNS);

  if (error) throw createRepositoryError('No se pudieron eliminar registros en lote', error);
  return (Array.isArray(data) ? data : []).map((row) => normalizeRow(row)).filter(Boolean);
}

export function subscribeToStateChanges(handlers = {}) {
  assertSupabaseConfigured();
  const channel = supabase
    .channel(`trackflow-state-${Math.random().toString(36).slice(2, 10)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: STATE_TABLE },
      (payload) => handlers?.onInsert?.(normalizeRow(payload?.new), payload)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: STATE_TABLE },
      (payload) => handlers?.onUpdate?.(normalizeRow(payload?.new), payload)
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: STATE_TABLE },
      (payload) => handlers?.onDelete?.(normalizeRow(payload?.old), payload)
    )
    .subscribe((status, error) => {
      handlers?.onStatus?.(status, error || null);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const fallbackError = new Error(`Error de canal Realtime para app_kv (${status})`);
        handlers?.onError?.(error || fallbackError);
      }
    });

  return {
    channel,
    unsubscribe: async () => {
      await supabase.removeChannel(channel);
    },
  };
}

export async function getCurrentSession() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw createRepositoryError('No se pudo obtener la sesion', error);
  return data?.session || null;
}

export async function signInWithPassword({ email, password }) {
  assertSupabaseConfigured();
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '');
  if (!safeEmail) throw new Error('Email de admin vacio.');
  if (!safePassword) throw new Error('Password de admin vacio.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: safeEmail,
    password: safePassword,
  });
  if (error) throw createRepositoryError('No se pudo iniciar sesion de admin', error);
  return data?.session || null;
}

export async function signOutCurrentSession() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw createRepositoryError('No se pudo cerrar sesion', error);
}

export async function isCurrentUserAdmin() {
  assertSupabaseConfigured();
  const session = await getCurrentSession();
  const userId = session?.user?.id || null;
  if (!userId) return false;

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw createRepositoryError('No se pudo validar rol admin', error);
  return data?.is_admin === true;
}
