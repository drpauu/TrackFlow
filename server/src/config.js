import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(serverRoot, '..', '.env') });

export const config = {
  port: Number(process.env.PORT || 8787),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  defaultCoachId: String(process.env.DEFAULT_COACH_ID || 'juancarlos').trim() || 'juancarlos',
  appTimezone: String(process.env.APP_TIMEZONE || 'Europe/Madrid').trim() || 'Europe/Madrid',
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || './data'),
  appStorageFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'app_storage.json'),
  usersCsvFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'users.csv'),
  seedsDir: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds'),
  appStorageSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'app_storage.seed.json'),
  usersCsvSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'users.seed.csv'),
  mongoUri: String(process.env.MONGODB_URI || '').trim(),
  mongoDbName: String(process.env.MONGODB_DB || 'track-flow-db').trim() || 'track-flow-db',
  mongoRequireAuth: String(process.env.MONGO_REQUIRE_AUTH || 'false').trim().toLowerCase() === 'true',
  authJwtSecret: String(process.env.AUTH_JWT_SECRET || '').trim(),
  authJwtTtlSec: Number(process.env.AUTH_JWT_TTL_SEC || 60 * 60 * 24 * 14),
  authCookieName: String(process.env.AUTH_COOKIE_NAME || 'tf_session').trim() || 'tf_session',
  authCookieSecure: String(
    process.env.AUTH_COOKIE_SECURE
    || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
  ).trim().toLowerCase() === 'true',
  jogatinaEnabled: String(process.env.JOGATINA_ENABLED || 'true').trim().toLowerCase() === 'true',
  jogatinaCronSecret: String(process.env.JOGATINA_CRON_SECRET || process.env.CRON_SECRET || '').trim()
};
