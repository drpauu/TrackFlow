import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 8787),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  storageProvider: (process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase(),
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || './data'),
  appStorageFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'app_storage.json'),
  usersCsvFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'users.csv'),
  seedsDir: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds'),
  appStorageSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'app_storage.seed.json'),
  usersCsvSeedFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'seeds', 'users.seed.csv'),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseSchema: process.env.SUPABASE_SCHEMA || 'public',
  supabaseKvTable: process.env.SUPABASE_KV_TABLE || 'app_kv',
  supabaseUsersTable: process.env.SUPABASE_USERS_TABLE || 'users_csv_registry',
  supabaseRequestTimeoutMs: Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 12000)
};
