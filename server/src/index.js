import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import storageRouter from './routes/storage.js';
import {
  ensureDir,
  ensureFile,
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile
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

async function bootstrap() {
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

async function main() {
  await bootstrap();

  const app = express();
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', storageRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(config.port, () => {
    console.log(`TrackFlow server listening on http://localhost:${config.port}`);
    console.log(`Users CSV: ${config.usersCsvFile}`);
    console.log(`App storage: ${config.appStorageFile}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
