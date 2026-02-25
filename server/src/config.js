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
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || './data'),
  appStorageFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'app_storage.json'),
  usersCsvFile: path.resolve(serverRoot, process.env.DATA_DIR || './data', 'users.csv')
};
