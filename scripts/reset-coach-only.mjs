import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env' });

const COACH_USERNAME = String(process.env.BOOTSTRAP_COACH_USERNAME || 'JuanCarlos').trim() || 'JuanCarlos';
const COACH_PASSWORD = String(process.env.BOOTSTRAP_COACH_PASSWORD || '151346').trim() || '151346';
const COACH_ID = String(process.env.DEFAULT_COACH_ID || 'juancarlos').trim() || 'juancarlos';
const MONGO_URI = String(process.env.MONGODB_URI || '').trim();
const MONGO_DB = String(process.env.MONGODB_DB || 'track-flow-db').trim() || 'track-flow-db';

if (!MONGO_URI) {
  throw new Error('Falta MONGODB_URI en el entorno.');
}

const APP_COLLECTIONS = [
  'state_cache',
  'athletes',
  'groups',
  'trainings',
  'seasons',
  'week_plans',
  'athlete_day_plans',
  'athlete_day_status',
  'competitions',
  'sync_counters',
  'jogatina_groups',
  'jogatina_memberships',
  'jogatina_wallets',
  'jogatina_bets_open',
  'jogatina_wagers_open',
  'jogatina_group_carryover',
  'jogatina_daily_bonus_claims',
  'jogatina_ledger',
  'gym_exercises',
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB);
  const now = new Date();

  try {
    await Promise.all(APP_COLLECTIONS.map((name) => db.collection(name).deleteMany({})));
    await db.collection('users').deleteMany({});
    await db.collection('users').insertOne({
      _id: `coach:${COACH_ID}`,
      coachId: COACH_ID,
      role: 'coach',
      athleteId: null,
      usernameLower: COACH_USERNAME.toLowerCase(),
      emailLower: null,
      password: COACH_PASSWORD,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
    console.log(`Base "${MONGO_DB}" reiniciada en modo coach-only.`);
    console.log(`Coach: ${COACH_USERNAME} / ${COACH_PASSWORD}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

