import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import createStorageRouter from './routes/storage.js';
import createAuthRouter from './routes/auth.js';
import createDomainRouter from './routes/domain.js';
import createJogatinaRouter from './routes/jogatina.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { createStorageProvider } from './storage/provider.js';
import {
  ensureDir,
  ensureFile,
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
} from './utils/fs.js';

const DEFAULT_USERS_CSV_HEADER = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions\n';

function isUsersCsvEmpty(csvText) {
  if (!csvText || !csvText.trim()) return true;
  const rows = csvText.split(/\r?\n/).filter(Boolean);
  return rows.length <= 1;
}

async function seedUsersCsvIfNeeded() {
  const currentCsv = await readTextFile(config.usersCsvFile, '');
  if (!isUsersCsvEmpty(currentCsv)) return false;

  const seedCsv = await readTextFile(config.usersCsvSeedFile, '');
  if (seedCsv && seedCsv.trim()) {
    await writeTextFile(config.usersCsvFile, seedCsv);
    return true;
  }

  if (!currentCsv.trim()) {
    await writeTextFile(config.usersCsvFile, DEFAULT_USERS_CSV_HEADER);
  }
  return false;
}

async function seedAppStorageIfNeeded() {
  const currentDb = await readJsonFile(config.appStorageFile, {});
  const seedDb = await readJsonFile(config.appStorageSeedFile, null);
  if (!seedDb || typeof seedDb !== 'object' || Array.isArray(seedDb)) return false;

  const currentKeys = Object.keys(currentDb || {});
  if (currentKeys.length === 0) {
    await writeJsonFile(config.appStorageFile, seedDb);
    return true;
  }

  let changed = false;
  const merged = { ...currentDb };
  for (const [key, value] of Object.entries(seedDb)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = value;
      changed = true;
    }
  }

  if (changed) {
    await writeJsonFile(config.appStorageFile, merged);
    return true;
  }

  return false;
}

async function bootstrapLocalFiles() {
  await ensureDir(config.dataDir);
  await ensureDir(config.seedsDir);
  await ensureFile(config.appStorageFile, '{}\n');
  await ensureFile(config.usersCsvFile, DEFAULT_USERS_CSV_HEADER);

  const seededUsers = await seedUsersCsvIfNeeded();
  const seededStorage = await seedAppStorageIfNeeded();
  if (seededUsers) {
    console.log('Seed aplicado: users.csv');
  }
  if (seededStorage) {
    console.log('Seed aplicado/mergeado: app_storage.json');
  }
}

export async function buildTrackFlowApp() {
  const isLocalMode = config.storageProvider === 'local';
  if (isLocalMode) {
    await bootstrapLocalFiles();
  }

  const storageProvider = createStorageProvider();
  await storageProvider.init();

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(attachRequestContext);
  app.use('/api', createStorageRouter({ storage: storageProvider }));
  if (storageProvider?.name === 'mongo') {
    app.use('/api/auth', createAuthRouter({ storage: storageProvider }));
    app.use('/api', createDomainRouter({ storage: storageProvider }));
    app.use('/api/jogatina', createJogatinaRouter({ storage: storageProvider }));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    const statusCode = Number(err?.statusCode || 500);
    res.status(statusCode).json({ error: err?.message || 'Internal server error' });
  });

  return { app, storageProvider, isLocalMode };
}

let serverlessAppPromise = null;

export function getServerlessTrackFlowApp() {
  if (!serverlessAppPromise) {
    serverlessAppPromise = buildTrackFlowApp();
  }
  return serverlessAppPromise;
}
