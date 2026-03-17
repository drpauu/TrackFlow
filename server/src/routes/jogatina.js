import { Router } from 'express';
import { config } from '../config.js';
import { createJogatinaService } from '../domain/jogatina/service.js';
import { subscribeJogatinaEvents } from '../domain/jogatina/events.js';

function requireJogatinaEnabled(res) {
  if (config.jogatinaEnabled) return true;
  res.status(404).json({
    ok: false,
    error: 'Jogatina esta desactivado por feature flag.',
  });
  return false;
}

function requireAthleteAuth(req, res) {
  const auth = req.context?.auth || null;
  if (!auth?.userId) {
    res.status(401).json({ ok: false, error: 'Sesion requerida.' });
    return null;
  }
  if (String(auth.role || '').trim() !== 'athlete' || !String(auth.athleteId || '').trim()) {
    res.status(403).json({ ok: false, error: 'Solo atletas autenticados pueden usar Jogatina.' });
    return null;
  }
  return auth;
}

function assertCronAuth(req, res) {
  const secret = String(config.jogatinaCronSecret || '').trim();
  if (!secret) return true;

  const bearer = String(req.headers?.authorization || '').trim();
  const queryToken = String(req.query?.token || req.body?.token || '').trim();

  if (bearer === `Bearer ${secret}` || queryToken === secret) return true;

  res.status(401).json({ ok: false, error: 'Cron no autorizado.' });
  return false;
}

function sendSseEvent(res, type, payload) {
  const safeType = String(type || 'message').trim() || 'message';
  const data = JSON.stringify(payload ?? {});
  res.write(`event: ${safeType}\n`);
  res.write(`data: ${data}\n\n`);
}

export default function createJogatinaRouter() {
  const router = Router();
  const service = createJogatinaService();

  router.get('/state', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const state = await service.getState(auth);
      return res.json({ ok: true, state });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/groups', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.createGroup(auth, req.body || {});
      return res.status(201).json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/groups/join', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.joinGroup(auth, req.body || {});
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/groups/leave', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.leaveGroup(auth);
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/groups/me', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.updateMyGroup(auth, req.body || {});
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/bets', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.createBet(auth, req.body || {});
      return res.status(201).json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/bets/:betId/wager', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.upsertWager(auth, req.params?.betId, req.body || {});
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/bets/:betId/resolve', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;
      const result = await service.resolveBet(auth, req.params?.betId, req.body || {});
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/stream', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      const auth = requireAthleteAuth(req, res);
      if (!auth) return;

      const state = await service.getState(auth);
      const subscriptionCoachId = String(auth.coachId || '').trim();
      const subscriptionGroupId = String(state?.membership?.groupId || '').trim() || null;
      if (!subscriptionGroupId) {
        return res.status(409).json({ ok: false, error: 'Debes pertenecer a un grupo para usar el stream.' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      sendSseEvent(res, 'ready', {
        groupId: subscriptionGroupId,
        connectedAt: new Date().toISOString(),
      });

      const onEvent = (event) => {
        if (!event) return;
        if (String(event.coachId || '') !== subscriptionCoachId) return;
        if (subscriptionGroupId && String(event.groupId || '') !== subscriptionGroupId) return;
        sendSseEvent(res, 'jogatina_update', event);
      };

      const unsubscribe = subscribeJogatinaEvents(onEvent);
      const heartbeat = setInterval(() => {
        res.write(': ping\n\n');
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/cron/run', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      if (!assertCronAuth(req, res)) return;
      const coachId = String(req.query?.coachId || '').trim() || null;
      const result = await service.runMaintenance({ coachId });
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/cron/run', async (req, res, next) => {
    try {
      if (!requireJogatinaEnabled(res)) return;
      if (!assertCronAuth(req, res)) return;
      const coachId = String(req.body?.coachId || req.query?.coachId || '').trim() || null;
      const result = await service.runMaintenance({ coachId });
      return res.json({ ok: true, result });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
