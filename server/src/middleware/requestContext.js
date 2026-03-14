import { config } from '../config.js';
import { parseCookieHeader, verifySessionToken } from '../security/auth.js';

function sanitizeCoachId(value) {
  const raw = String(value || '').trim();
  return raw || config.defaultCoachId;
}

export function attachRequestContext(req, _res, next) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  const rawToken = cookies[config.authCookieName] || '';
  const session = verifySessionToken(rawToken);
  const coachIdFromHeader = sanitizeCoachId(
    req.headers?.['x-trackflow-coach-id']
    || req.query?.coachId
  );

  const auth = session
    ? {
        userId: String(session.sub || '').trim() || null,
        coachId: sanitizeCoachId(session.coachId || coachIdFromHeader),
        role: String(session.role || '').trim() || null,
        athleteId: String(session.athleteId || '').trim() || null,
      }
    : null;

  const coachId = auth?.coachId || coachIdFromHeader || config.defaultCoachId;
  req.context = {
    coachId,
    auth,
    requireAuth: config.mongoRequireAuth === true,
  };
  next();
}
