import { Router } from 'express';

function toFiniteInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function createStorageRouter({ storage }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'trackflow-server', storage: storage?.name || 'unknown' });
  });

  router.get('/storage/changes', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const since = Math.max(toFiniteInt(req.query?.since, 0), 0);
      const limit = Math.min(Math.max(toFiniteInt(req.query?.limit, 200), 1), 500);
      const clientId = String(req.query?.clientId || req.get('x-trackflow-client-id') || '').trim() || null;
      const coachId = req.context?.coachId || null;
      const auth = req.context?.auth || null;

      const payload = await storage.getChanges({ since, limit, clientId, coachId, auth });
      return res.json({
        since,
        latestSeq: Number(payload?.latestSeq || payload?.latestSyncVersion || since),
        latestSyncVersion: Number(payload?.latestSyncVersion || payload?.latestSeq || since),
        changes: Array.isArray(payload?.changes) ? payload.changes : [],
        storage: storage?.name || 'unknown',
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/storage/:key', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { key } = req.params;
      const value = await storage.get(key, {
        coachId: req.context?.coachId || null,
        auth: req.context?.auth || null,
      });
      return res.json({ key, value: value == null ? null : value, storage: storage?.name || 'unknown' });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/storage/:key', async (req, res, next) => {
    try {
      const { key } = req.params;
      const value = req.body?.value;
      if (typeof value !== 'string') {
        return res.status(400).json({ error: 'Body must include a string field: value' });
      }
      const clientId = String(req.get('x-trackflow-client-id') || req.body?.clientId || '').trim() || null;
      const result = await storage.set(key, value, {
        clientId,
        coachId: req.context?.coachId || null,
        auth: req.context?.auth || null,
      });
      return res.json({
        ok: true,
        key,
        changed: !!result?.changed,
        latestSyncVersion: Number(result?.latestSyncVersion || result?.seq || 0),
        storage: storage?.name || 'unknown',
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/users-csv', async (_req, res, next) => {
    try {
      const csv = await storage.get('tf_users_csv', {
        coachId: _req.context?.coachId || null,
        auth: _req.context?.auth || null,
      });
      res.type('text/csv').send(csv || '');
    } catch (err) {
      next(err);
    }
  });

  return router;
}
