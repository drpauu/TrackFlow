import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CHUNK_SIZE = 100;
const PRIVATE_KEYS = new Set(['tf_user']);

function parseArgs(argv) {
  const out = {
    dryRun: false,
    includePrivate: false,
    fromSeeds: false,
    adminPassword: '',
  };

  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--include-private') out.includePrivate = true;
    else if (arg === '--from-seeds') out.fromSeeds = true;
    else if (arg.startsWith('--admin-password=')) out.adminPassword = arg.slice('--admin-password='.length);
  }
  return out;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseDotEnv(content = '') {
  const env = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadMergedEnv() {
  const files = [
    path.resolve(REPO_ROOT, '.env'),
    path.resolve(REPO_ROOT, 'server/.env'),
  ];
  const merged = { ...process.env };
  for (const envPath of files) {
    if (!(await fileExists(envPath))) continue;
    const text = await readTextFile(envPath, '');
    const parsed = parseDotEnv(text);
    for (const [key, value] of Object.entries(parsed)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key) || !merged[key]) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function resolveSupabaseConfig(env, cliAdminPassword = '') {
  const supabaseUrl = String(
    env.SUPABASE_URL
    || env.VITE_SUPABASE_URL
    || env.NEXT_PUBLIC_SUPABASE_URL
    || ''
  ).trim().replace(/\/$/, '');

  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(
    env.SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || ''
  ).trim();

  const adminEmail = String(
    env.SUPABASE_ADMIN_EMAIL
    || env.VITE_SUPABASE_ADMIN_EMAIL
    || ''
  ).trim();

  const adminPassword = String(
    cliAdminPassword
    || env.SUPABASE_ADMIN_PASSWORD
    || ''
  ).trim();

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    adminEmail,
    adminPassword,
  };
}

async function authWithPassword({ supabaseUrl, anonKey, email, password }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const payloadText = await response.text();
  const payload = parseJson(payloadText, null);
  if (!response.ok) {
    const message = payload?.msg || payload?.error_description || payload?.error || payloadText || `HTTP ${response.status}`;
    throw new Error(`Auth de admin fallida: ${message}`);
  }
  const accessToken = String(payload?.access_token || '').trim();
  if (!accessToken) throw new Error('Auth de admin completada sin access_token.');
  const userId = String(payload?.user?.id || '').trim();
  return { accessToken, userId: userId || null };
}

async function restRequest({
  baseUrl,
  apiKey,
  bearerToken,
  pathWithQuery,
  method = 'GET',
  body = null,
  extraHeaders = {},
}) {
  const response = await fetch(`${baseUrl}${pathWithQuery}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payloadText = await response.text();
  if (!response.ok) {
    const parsed = parseJson(payloadText, null);
    const message = parsed?.message || parsed?.error || parsed?.hint || payloadText || `HTTP ${response.status}`;
    throw new Error(`Supabase REST error (${method} ${pathWithQuery}): ${message}`);
  }
  if (!payloadText) return null;
  return parseJson(payloadText, payloadText);
}

function chunkArray(items, size = DEFAULT_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeStoredValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function loadSourceData({ fromSeeds, includePrivate }) {
  const baseDir = fromSeeds
    ? path.resolve(REPO_ROOT, 'server/data/seeds')
    : path.resolve(REPO_ROOT, 'server/data');

  const appStorageFile = path.resolve(baseDir, fromSeeds ? 'app_storage.seed.json' : 'app_storage.json');
  const usersCsvFile = path.resolve(baseDir, fromSeeds ? 'users.seed.csv' : 'users.csv');

  if (!(await fileExists(appStorageFile))) {
    throw new Error(`No existe el archivo: ${appStorageFile}`);
  }
  if (!(await fileExists(usersCsvFile))) {
    throw new Error(`No existe el archivo: ${usersCsvFile}`);
  }

  const appStorageText = await readTextFile(appStorageFile, '{}');
  const appStorageObj = parseJson(appStorageText, null);
  if (!appStorageObj || typeof appStorageObj !== 'object' || Array.isArray(appStorageObj)) {
    throw new Error(`JSON invalido en ${appStorageFile}`);
  }

  const usersCsv = await readTextFile(usersCsvFile, '');
  if (!usersCsv.trim()) {
    throw new Error(`CSV vacio en ${usersCsvFile}`);
  }

  const rows = [];
  for (const [keyRaw, valueRaw] of Object.entries(appStorageObj)) {
    const key = String(keyRaw || '').trim();
    if (!key) continue;
    const isPrivate = PRIVATE_KEYS.has(key);
    if (isPrivate && !includePrivate) continue;
    rows.push({
      key,
      value: normalizeStoredValue(valueRaw),
      is_public: !isPrivate,
      position: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    });
  }

  rows.push({
    key: 'tf_users_csv',
    value: usersCsv,
    is_public: true,
    position: null,
    updated_by: null,
    updated_at: new Date().toISOString(),
  });

  const dedupedByKey = new Map();
  for (const row of rows) dedupedByKey.set(row.key, row);
  const finalRows = Array.from(dedupedByKey.values()).sort((a, b) => a.key.localeCompare(b.key));

  return {
    appStorageFile,
    usersCsvFile,
    rows: finalRows,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadMergedEnv();
  const cfg = resolveSupabaseConfig(env, args.adminPassword);

  if (!cfg.supabaseUrl) {
    throw new Error('Falta SUPABASE_URL o VITE_SUPABASE_URL en entorno.');
  }

  const source = await loadSourceData({
    fromSeeds: args.fromSeeds,
    includePrivate: args.includePrivate,
  });

  console.log(`Origen app storage: ${source.appStorageFile}`);
  console.log(`Origen users csv: ${source.usersCsvFile}`);
  console.log(`Keys a ingerir: ${source.rows.length}`);
  console.log(`Incluye private keys: ${args.includePrivate ? 'si' : 'no'}`);

  if (args.dryRun) {
    console.log('Dry run completado (sin escrituras).');
    return;
  }

  const restBase = `${cfg.supabaseUrl}/rest/v1`;
  let apiKey = '';
  let bearerToken = '';

  if (cfg.serviceRoleKey) {
    apiKey = cfg.serviceRoleKey;
    bearerToken = cfg.serviceRoleKey;
    console.log('Autenticacion: service role key');
  } else {
    if (!cfg.anonKey) {
      throw new Error('Falta SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY y no hay service role key.');
    }
    if (!cfg.adminEmail || !cfg.adminPassword) {
      throw new Error(
        'Falta autenticacion de admin. Define SUPABASE_SERVICE_ROLE_KEY o pasa SUPABASE_ADMIN_PASSWORD ' +
        '(y SUPABASE_ADMIN_EMAIL/VITE_SUPABASE_ADMIN_EMAIL).'
      );
    }
    const auth = await authWithPassword({
      supabaseUrl: cfg.supabaseUrl,
      anonKey: cfg.anonKey,
      email: cfg.adminEmail,
      password: cfg.adminPassword,
    });
    apiKey = cfg.anonKey;
    bearerToken = auth.accessToken;
    console.log(`Autenticacion: admin password (${cfg.adminEmail})`);
  }

  const chunks = chunkArray(source.rows, DEFAULT_CHUNK_SIZE);
  let written = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    await restRequest({
      baseUrl: restBase,
      apiKey,
      bearerToken,
      pathWithQuery: '/app_kv?on_conflict=key',
      method: 'POST',
      body: chunk,
      extraHeaders: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
    written += chunk.length;
    console.log(`Upsert ${i + 1}/${chunks.length} (${written}/${source.rows.length})`);
  }

  const allRows = await restRequest({
    baseUrl: restBase,
    apiKey,
    bearerToken,
    pathWithQuery: '/app_kv?select=key&order=key.asc',
    method: 'GET',
  });
  const allKeys = Array.isArray(allRows) ? allRows.map((row) => String(row?.key || '').trim()).filter(Boolean) : [];
  const expectedMissing = source.rows.filter((row) => !allKeys.includes(row.key)).map((row) => row.key);

  console.log(`Total keys en Supabase (app_kv): ${allKeys.length}`);
  if (expectedMissing.length) {
    console.log(`Faltan ${expectedMissing.length} keys:`);
    expectedMissing.forEach((key) => console.log(`- ${key}`));
    throw new Error('La verificacion final detecto keys faltantes.');
  }

  console.log('Ingestion completada correctamente.');
}

run().catch((error) => {
  console.error(`ingest:supabase fallo: ${error?.message || error}`);
  process.exit(1);
});
