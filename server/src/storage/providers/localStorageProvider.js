import { config } from '../../config.js';
import {
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
} from '../../utils/fs.js';

const USERS_KEY = 'tf_users_csv';
const MAX_CHANGES = 5000;

function toStoredString(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toFiniteInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createLocalStorageProvider() {
  let seq = 0;
  let changes = [];

  const appendChange = (key, clientId) => {
    seq += 1;
    changes.push({
      seq,
      key,
      clientId: clientId || null,
      changedAt: new Date().toISOString(),
    });
    if (changes.length > MAX_CHANGES) {
      changes = changes.slice(-MAX_CHANGES);
    }
  };

  return {
    name: 'local',

    async init() {
      // No-op: bootstrap local files is handled in server startup.
    },

    async get(key) {
      if (key === USERS_KEY) {
        return await readTextFile(config.usersCsvFile, '');
      }
      const db = await readJsonFile(config.appStorageFile, {});
      if (!Object.prototype.hasOwnProperty.call(db, key)) return null;
      return toStoredString(db[key]);
    },

    async set(key, value, options = {}) {
      const clientId = options?.clientId ? String(options.clientId) : null;
      const textValue = String(value ?? '');

      if (key === USERS_KEY) {
        const current = await readTextFile(config.usersCsvFile, '');
        if (current === textValue) {
          return { changed: false, seq };
        }
        await writeTextFile(config.usersCsvFile, textValue);
        appendChange(key, clientId);
        return { changed: true, seq };
      }

      const db = await readJsonFile(config.appStorageFile, {});
      const prev = Object.prototype.hasOwnProperty.call(db, key)
        ? toStoredString(db[key])
        : null;
      if (prev === textValue) {
        return { changed: false, seq };
      }
      db[key] = textValue;
      await writeJsonFile(config.appStorageFile, db);
      appendChange(key, clientId);
      return { changed: true, seq };
    },

    async getChanges(options = {}) {
      const since = Math.max(toFiniteInt(options?.since, 0), 0);
      const limit = Math.min(Math.max(toFiniteInt(options?.limit, 200), 1), 500);
      const clientId = options?.clientId ? String(options.clientId) : null;
      const filtered = changes.filter((entry) => (
        entry.seq > since && (!clientId || !entry.clientId || entry.clientId !== clientId)
      ));
      return {
        latestSeq: seq,
        changes: filtered.slice(0, limit),
      };
    },
  };
}
