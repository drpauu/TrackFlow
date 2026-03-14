import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    fromSeeds: argv.includes('--from-seeds'),
    coachId: (() => {
      const item = argv.find((arg) => arg.startsWith('--coach-id='));
      return item ? item.slice('--coach-id='.length).trim() : '';
    })(),
  };
}

async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

async function readJson(filePath, fallback = {}) {
  const text = await readText(filePath, '');
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function toStoredString(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function normalizeCoachId(value) {
  const safe = String(value || '').trim();
  return safe;
}

async function run() {
  dotenv.config({ path: path.resolve(repoRoot, '.env') });
  dotenv.config({ path: path.resolve(repoRoot, 'server/.env') });

  const [{ createMongoStorageProvider }, { config }] = await Promise.all([
    import('../server/src/storage/providers/mongoStorageProvider.js'),
    import('../server/src/config.js'),
  ]);

  const args = parseArgs(process.argv.slice(2));
  const coachId = normalizeCoachId(args.coachId) || config.defaultCoachId;
  const sourceDir = args.fromSeeds
    ? path.resolve(repoRoot, 'server/data/seeds')
    : path.resolve(repoRoot, 'server/data');
  const appStorageFile = path.resolve(sourceDir, args.fromSeeds ? 'app_storage.seed.json' : 'app_storage.json');
  const usersCsvFile = path.resolve(sourceDir, args.fromSeeds ? 'users.seed.csv' : 'users.csv');

  const state = await readJson(appStorageFile, {});
  const usersCsv = await readText(usersCsvFile, '');
  const entries = Object.entries(state || {}).filter(([key]) => String(key || '').startsWith('tf_'));
  if (!entries.some(([key]) => key === 'tf_users_csv')) {
    entries.push(['tf_users_csv', usersCsv]);
  }
  entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  console.log(`Origen: ${appStorageFile}`);
  console.log(`CoachId destino: ${coachId}`);
  console.log(`Keys a migrar: ${entries.length}`);
  if (args.dryRun) return;

  const storage = createMongoStorageProvider();
  await storage.init();

  for (const [key, value] of entries) {
    const payload = toStoredString(value);
    const result = await storage.set(key, payload, {
      coachId,
      clientId: 'migration_script',
      auth: { userId: 'migration_script', role: 'coach' },
    });
    console.log(`upsert ${key} -> changed=${result?.changed ? 'yes' : 'no'} sync=${result?.latestSyncVersion || 0}`);
  }

  const keys = await storage.listStateKeys(coachId);
  console.log(`State keys en Mongo (${coachId}): ${keys.length}`);

  if (typeof storage.getMongoDb === 'function') {
    const db = await storage.getMongoDb();
    const [
      users,
      groups,
      athletes,
      trainings,
      seasons,
      weekPlans,
      dayPlans,
      dayStatus,
      competitions,
      stateCache,
      publishedWeeks,
    ] = await Promise.all([
      db.collection('users').countDocuments({ coachId }),
      db.collection('groups').countDocuments({ coachId }),
      db.collection('athletes').countDocuments({ coachId }),
      db.collection('trainings').countDocuments({ coachId }),
      db.collection('seasons').countDocuments({ coachId }),
      db.collection('week_plans').countDocuments({ coachId }),
      db.collection('athlete_day_plans').countDocuments({ coachId }),
      db.collection('athlete_day_status').countDocuments({ coachId }),
      db.collection('competitions').countDocuments({ coachId }),
      db.collection('state_cache').countDocuments({ coachId }),
      db.collection('week_plans').countDocuments({ coachId, status: 'published' }),
    ]);
    console.log('--- Resumen post-migracion ---');
    console.log(`users=${users} groups=${groups} athletes=${athletes}`);
    console.log(`trainings=${trainings} seasons=${seasons} week_plans=${weekPlans} (published=${publishedWeeks})`);
    console.log(`athlete_day_plans=${dayPlans} athlete_day_status=${dayStatus} competitions=${competitions}`);
    console.log(`state_cache=${stateCache}`);
  }
}

run().catch((error) => {
  console.error(`migrate-to-mongo failed: ${error?.message || error}`);
  process.exit(1);
});
