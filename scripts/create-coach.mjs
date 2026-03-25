import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { hashPassword } from '../server/src/security/auth.js';
import { normalizeGroupName, slugify } from '../server/src/storage/providers/mongo/shared.js';

dotenv.config({ path: '.env' });

function getArgValue(flag, short = null) {
  const args = process.argv.slice(2);
  const longIndex = args.indexOf(flag);
  if (longIndex >= 0) return String(args[longIndex + 1] || '').trim();
  if (short) {
    const shortIndex = args.indexOf(short);
    if (shortIndex >= 0) return String(args[shortIndex + 1] || '').trim();
  }
  return '';
}

function printUsageAndExit(code = 1) {
  console.log('Usage: npm run coach:create -- --username <name> --password <pass> [--email <email>] [--coach-id <id>]');
  process.exit(code);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsageAndExit(0);
  }

  const usernameInput = getArgValue('--username', '-u');
  const password = getArgValue('--password', '-p');
  const emailInput = getArgValue('--email', '-e');
  const coachIdInput = getArgValue('--coach-id');

  if (!usernameInput || !password) {
    printUsageAndExit(1);
  }

  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  const mongoDbName = String(process.env.MONGODB_DB || 'track-flow-db').trim() || 'track-flow-db';
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI in .env');
  }

  const usernameLower = normalizeGroupName(usernameInput).replace(/\s+/g, '');
  const coachId = slugify(coachIdInput || usernameInput);
  const emailLower = emailInput ? emailInput.toLowerCase() : null;
  const userId = `coach:${coachId}`;

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(mongoDbName);

  try {
    const byId = await db.collection('users').findOne({ _id: userId });
    if (byId) {
      throw new Error(`Coach ID already exists: ${userId}`);
    }

    const byUsername = await db.collection('users').findOne({
      role: 'coach',
      usernameLower,
      isActive: { $ne: false },
    });
    if (byUsername) {
      throw new Error(`Coach username already exists: ${usernameInput}`);
    }

    if (emailLower) {
      const byEmail = await db.collection('users').findOne({
        role: 'coach',
        emailLower,
        isActive: { $ne: false },
      });
      if (byEmail) {
        throw new Error(`Coach email already exists: ${emailInput}`);
      }
    }

    const now = new Date();
    const passwordHash = await hashPassword(password);
    await db.collection('users').insertOne({
      _id: userId,
      coachId,
      role: 'coach',
      athleteId: null,
      usernameLower,
      emailLower: emailLower || null,
      passwordHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });

    console.log(`Coach created: ${usernameInput}`);
    console.log(`coachId: ${coachId}`);
    console.log(`userId: ${userId}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
