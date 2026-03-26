import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(serverRoot, '..', '.env') });

const rawMongoDbName = String(process.env.MONGODB_DB || process.env.MONGODB_DATABASE || '').trim();
const normalizedMongoDbName = rawMongoDbName.toLowerCase();
const resolvedMongoDbName = (
  !rawMongoDbName
  || normalizedMongoDbName === 'trackflow'
)
  ? 'track-flow-db'
  : rawMongoDbName;

function parseOrigins(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

const corsOrigins = (() => {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://track-flow-frontend.vercel.app',
  ];
  const explicit = [
    ...parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN),
    ...parseOrigins(process.env.FRONTEND_URL),
    ...parseOrigins(process.env.FRONTEND_ORIGIN),
    ...parseOrigins(process.env.APP_URL),
  ];
  return [...new Set([...defaults, ...explicit].map((origin) => normalizeOrigin(origin)).filter(Boolean))];
})();

export const config = {
  nodeEnv: String(process.env.NODE_ENV || 'development').trim() || 'development',
  port: Number(process.env.PORT || 8787),
  corsOrigins,
  defaultCoachId: String(process.env.DEFAULT_COACH_ID || 'juancarlos').trim() || 'juancarlos',
  appTimezone: String(process.env.APP_TIMEZONE || 'Europe/Madrid').trim() || 'Europe/Madrid',
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || './data'),
  appStorageFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'app_storage.json'),
  usersCsvFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'users.csv'),
  seedsDir: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds'),
  appStorageSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'app_storage.seed.json'),
  usersCsvSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'users.seed.csv'),
  mongoUri: String(process.env.MONGODB_URI || '').trim(),
  mongoDbName: resolvedMongoDbName,
  mongoRequireAuth: String(process.env.MONGO_REQUIRE_AUTH || 'false').trim().toLowerCase() === 'true',
  authJwtSecret: String(process.env.AUTH_JWT_SECRET || '').trim(),
  authJwtTtlSec: Number(process.env.AUTH_JWT_TTL_SEC || 60 * 60 * 24 * 14),
  authCookieName: String(process.env.AUTH_COOKIE_NAME || 'tf_session').trim() || 'tf_session',
  authCookieSameSite: String(
    process.env.AUTH_COOKIE_SAMESITE
    || (process.env.NODE_ENV === 'production' ? 'Lax' : 'Lax')
  ).trim() || 'Lax',
  authCookieSecure: String(
    process.env.AUTH_COOKIE_SECURE
    || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
  ).trim().toLowerCase() === 'true',
  jogatinaEnabled: String(process.env.JOGATINA_ENABLED || 'true').trim().toLowerCase() === 'true',
  jogatinaCronSecret: String(process.env.JOGATINA_CRON_SECRET || process.env.CRON_SECRET || '').trim()
};
