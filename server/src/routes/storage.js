import { Router } from 'express';
import { config } from '../config.js';
import { readJsonFile, writeJsonFile, readTextFile, writeTextFile } from '../utils/fs.js';

const router = Router();

function isUsersCsvKey(key) {
  return key === 'tf_users_csv';
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'trackflow-server' });
});

router.get('/storage/:key', async (req, res, next) => {
  try {
    const { key } = req.params;

    if (isUsersCsvKey(key)) {
      const csv = await readTextFile(config.usersCsvFile, '');
      return res.json({ key, value: csv || null, source: 'users.csv' });
    }

    const db = await readJsonFile(config.appStorageFile, {});
    const value = Object.prototype.hasOwnProperty.call(db, key) ? db[key] : null;
    return res.json({ key, value, source: 'app_storage.json' });
  } catch (err) {
    next(err);
  }
});

router.put('/storage/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const value = req.body?.value;

    if (typeof value !== 'string') {
      return res.status(400).json({ error: 'Body must include a string field: value' });
    }

    if (isUsersCsvKey(key)) {
      await writeTextFile(config.usersCsvFile, value);
      return res.json({ ok: true, key, source: 'users.csv' });
    }

    const db = await readJsonFile(config.appStorageFile, {});
    db[key] = value;
    await writeJsonFile(config.appStorageFile, db);
    return res.json({ ok: true, key, source: 'app_storage.json' });
  } catch (err) {
    next(err);
  }
});

// utilidad de inspección rápida del CSV (opcional)
router.get('/users-csv', async (_req, res, next) => {
  try {
    const csv = await readTextFile(config.usersCsvFile, '');
    res.type('text/csv').send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
