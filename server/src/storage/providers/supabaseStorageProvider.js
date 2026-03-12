import { config } from '../../config.js';
import { readJsonFile, readTextFile } from '../../utils/fs.js';

const USERS_KEY = 'tf_users_csv';
const DEFAULT_USERS_CSV_HEADER = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions\n';

function toFiniteInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStoredString(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function createSupabaseError(status, payloadText) {
  let message = payloadText || `HTTP ${status}`;
  try {
    const parsed = JSON.parse(payloadText);
    if (parsed?.message) message = parsed.message;
  } catch {
    // ignore JSON parse errors
  }
  const err = new Error(`Supabase request failed (${status}): ${message}`);
  err.status = status;
  err.payload = payloadText;
  return err;
}

function chunkArray(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export function createSupabaseStorageProvider() {
  const supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/$/, '');
  const serviceRoleKey = String(config.supabaseServiceRoleKey || '').trim();
  const schema = String(config.supabaseSchema || 'public').trim() || 'public';
  const kvTable = String(config.supabaseKvTable || 'app_kv').trim() || 'app_kv';
  const usersTable = String(config.supabaseUsersTable || 'users_csv_registry').trim() || 'users_csv_registry';
  const changesTable = String(config.supabaseChangesTable || 'app_changes').trim() || 'app_changes';
  const timeoutMs = Math.min(Math.max(Number(config.supabaseRequestTimeoutMs || 12000), 1000), 60000);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase provider requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
      'Revisa server/.env y usa el SQL de server/sql/supabase_schema.sql.'
    );
  }

  const restBaseUrl = `${supabaseUrl}/rest/v1`;

  const request = async (tableOrPath, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const isWrite = method !== 'GET' && method !== 'HEAD';
    const query = options.query || {};
    const url = new URL(
      tableOrPath.startsWith('/')
        ? `${restBaseUrl}${tableOrPath}`
        : `${restBaseUrl}/${tableOrPath}`
    );
    Object.entries(query).forEach(([key, value]) => {
      if (value == null) return;
      url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Accept-Profile': schema,
      Accept: 'application/json',
      ...(isWrite ? { 'Content-Profile': schema, 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const payloadText = await response.text();
      throw createSupabaseError(response.status, payloadText);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const getKv = async (key) => {
    const rows = await request(kvTable, {
      query: {
        select: 'value',
        key: `eq.${key}`,
        limit: 1,
      },
    });
    const raw = Array.isArray(rows) ? rows[0]?.value : null;
    return toStoredString(raw);
  };

  const getUsersCsv = async () => {
    const rows = await request(usersTable, {
      query: {
        select: 'csv',
        id: 'eq.1',
        limit: 1,
      },
    });
    const csv = Array.isArray(rows) ? rows[0]?.csv : null;
    return typeof csv === 'string' ? csv : '';
  };

  const appendChange = async (key, clientId) => {
    await request(changesTable, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: [{ key, client_id: clientId || null }],
    });
  };

  const upsertKv = async (key, value, clientId) => {
    await request(kvTable, {
      method: 'POST',
      query: { on_conflict: 'key' },
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: [{
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: clientId || null,
      }],
    });
  };

  const upsertUsersCsv = async (csv, clientId) => {
    await request(usersTable, {
      method: 'POST',
      query: { on_conflict: 'id' },
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: [{
        id: 1,
        csv,
        updated_at: new Date().toISOString(),
        updated_by: clientId || null,
      }],
    });
  };

  const verifySchema = async () => {
    try {
      await request(kvTable, { query: { select: 'key', limit: 1 } });
      await request(usersTable, { query: { select: 'id', limit: 1 } });
      await request(changesTable, { query: { select: 'seq', limit: 1 } });
    } catch (error) {
      throw new Error(
        `No se pudo validar el esquema de Supabase (${error.message}). ` +
        'Ejecuta server/sql/supabase_schema.sql en el SQL Editor del proyecto Supabase.'
      );
    }
  };

  const seedFromLocalIfNeeded = async () => {
    const rows = await request(kvTable, { query: { select: 'key', limit: 1 } });
    const kvHasData = Array.isArray(rows) && rows.length > 0;

    if (!kvHasData) {
      const localDb = await readJsonFile(config.appStorageFile, {});
      const entries = Object.entries(localDb || {})
        .filter(([key]) => typeof key === 'string' && key.trim());
      if (entries.length > 0) {
        const nowIso = new Date().toISOString();
        const payload = entries.map(([key, value]) => ({
          key,
          value: toStoredString(value) ?? '',
          updated_at: nowIso,
          updated_by: 'local_migration',
        }));
        for (const chunk of chunkArray(payload, 200)) {
          await request(kvTable, {
            method: 'POST',
            query: { on_conflict: 'key' },
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: chunk,
          });
        }
        console.log(`Supabase seed: importadas ${payload.length} keys desde app_storage.json`);
      }
    }

    const csv = await getUsersCsv();
    if (!csv || csv.trim() === '' || csv.trim() === DEFAULT_USERS_CSV_HEADER.trim()) {
      const localCsv = await readTextFile(config.usersCsvFile, '');
      const fallbackCsv = localCsv && localCsv.trim() ? localCsv : DEFAULT_USERS_CSV_HEADER;
      await upsertUsersCsv(fallbackCsv, 'local_migration');
      console.log('Supabase seed: users.csv importado en users_csv_registry');
    }
  };

  return {
    name: 'supabase',

    async init() {
      await verifySchema();
      await seedFromLocalIfNeeded();
    },

    async get(key) {
      if (key === USERS_KEY) return await getUsersCsv();
      return await getKv(key);
    },

    async set(key, value, options = {}) {
      const textValue = String(value ?? '');
      const clientId = options?.clientId ? String(options.clientId) : null;

      if (key === USERS_KEY) {
        const current = await getUsersCsv();
        if (current === textValue) return { changed: false };
        await upsertUsersCsv(textValue, clientId);
        await appendChange(key, clientId);
        return { changed: true };
      }

      const current = await getKv(key);
      if (current === textValue) return { changed: false };
      await upsertKv(key, textValue, clientId);
      await appendChange(key, clientId);
      return { changed: true };
    },

    async getChanges(options = {}) {
      const since = Math.max(toFiniteInt(options?.since, 0), 0);
      const limit = Math.min(Math.max(toFiniteInt(options?.limit, 200), 1), 500);
      const clientId = options?.clientId ? String(options.clientId) : null;
      const fetchLimit = Math.min(limit * 5, 1000);
      const rows = await request(changesTable, {
        query: {
          select: 'seq,key,client_id,changed_at',
          seq: `gt.${since}`,
          order: 'seq.asc',
          limit: fetchLimit,
        },
      });
      const rawList = Array.isArray(rows) ? rows : [];
      const latestSeq = rawList.length
        ? Number(rawList[rawList.length - 1]?.seq || since)
        : since;
      const filtered = rawList
        .filter((entry) => !clientId || !entry?.client_id || String(entry.client_id) !== clientId)
        .slice(0, limit)
        .map((entry) => ({
          seq: Number(entry.seq || 0),
          key: entry.key,
          clientId: entry.client_id || null,
          changedAt: entry.changed_at || null,
        }));
      return { latestSeq, changes: filtered };
    },
  };
}
