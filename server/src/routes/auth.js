import { Router } from 'express';
import { buildAuthCookie, buildClearAuthCookie } from '../security/auth.js';

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 12;
const loginRate = new Map();

function getRequestIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const [first] = forwarded.split(',');
    if (first && first.trim()) return first.trim();
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function getLoginBucket(req, usernameOrEmail) {
  const ip = getRequestIp(req);
  const user = String(usernameOrEmail || '').trim().toLowerCase() || 'unknown';
  return `${ip}:${user}`;
}

function readLoginRate(bucket) {
  const now = Date.now();
  const current = loginRate.get(bucket);
  if (!current || current.resetAt <= now) {
    const next = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginRate.set(bucket, next);
    return next;
  }
  return current;
}

function registerLoginFailure(bucket) {
  const current = readLoginRate(bucket);
  current.count += 1;
  loginRate.set(bucket, current);
}

function registerLoginSuccess(bucket) {
  loginRate.delete(bucket);
}

export default function createAuthRouter({ storage }) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const role = String(req.body?.role || '').trim().toLowerCase();
      const usernameOrEmail = String(req.body?.usernameOrEmail || req.body?.email || req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();
      if (!role || !password || !usernameOrEmail) {
        return res.status(400).json({ ok: false, error: 'role, usernameOrEmail y password son obligatorios.' });
      }
      const bucket = getLoginBucket(req, usernameOrEmail);
      const rate = readLoginRate(bucket);
      if (rate.count >= LOGIN_MAX_ATTEMPTS) {
        const retryAfterSec = Math.max(Math.ceil((rate.resetAt - Date.now()) / 1000), 1);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          ok: false,
          error: 'Demasiados intentos. Espera un momento antes de reintentar.',
        });
      }

      let result;
      if (role === 'coach') {
        result = await storage.authenticateCoach({ usernameOrEmail, password });
      } else if (role === 'athlete') {
        result = await storage.authenticateAthlete({
          coachId: req.body?.coachId || req.context?.coachId,
          username: usernameOrEmail,
          password,
        });
      } else {
        return res.status(400).json({ ok: false, error: 'role invalido. Usa coach o athlete.' });
      }

      if (!result?.ok) {
        registerLoginFailure(bucket);
        return res.status(401).json({ ok: false, error: result?.error || 'Credenciales invalidas.' });
      }
      registerLoginSuccess(bucket);
      res.setHeader('Set-Cookie', buildAuthCookie(result.token));
      return res.json({ ok: true, user: result.user });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', buildClearAuthCookie());
    return res.json({ ok: true });
  });

  router.get('/me', async (req, res, next) => {
    try {
      const auth = req.context?.auth || null;
      if (!auth?.userId) return res.status(401).json({ ok: false, error: 'Sesion no valida.' });
      const user = await storage.getUserById(auth.userId);
      if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida.' });
      return res.json({ ok: true, user });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
