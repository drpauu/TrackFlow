import { Router } from 'express';

function requireRole(req, res, role) {
  const auth = req.context?.auth || null;
  if (!auth?.userId) {
    res.status(401).json({ ok: false, error: 'Sesión requerida.' });
    return null;
  }
  if (role && auth.role !== role) {
    res.status(403).json({ ok: false, error: 'No autorizado.' });
    return null;
  }
  return auth;
}

export default function createDomainRouter({ storage }) {
  const router = Router();

  router.get('/coach/weeks', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, 'coach');
      if (!auth) return;
      const weeks = await storage.listCoachWeeks(auth.coachId, {
        seasonId: req.query?.seasonId || null,
      });
      return res.json({ ok: true, weeks });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/coach/weeks/:id/publish', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, 'coach');
      if (!auth) return;
      const week = await storage.publishWeek(auth.coachId, req.params?.id);
      if (!week) return res.status(404).json({ ok: false, error: 'Semana no encontrada.' });
      return res.json({ ok: true, week });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/coach/athletes', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, 'coach');
      if (!auth) return;
      const athletes = await storage.listCoachAthletes(auth.coachId);
      return res.json({ ok: true, athletes });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/coach/groups', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, 'coach');
      if (!auth) return;
      const groups = await storage.listCoachGroups(auth.coachId);
      return res.json({ ok: true, groups });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/catalog/trainings', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const trainings = await storage.listCatalogTrainings(auth.coachId);
      return res.json({ ok: true, trainings });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/catalog/gym-exercises', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const exercises = await storage.listCatalogGymExercises(auth.coachId);
      return res.json({ ok: true, exercises });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/athlete/day-status', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const athleteId = auth.role === 'athlete'
        ? auth.athleteId
        : String(req.query?.athleteId || '').trim();
      if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId obligatorio.' });
      const status = await storage.listAthleteDayStatus(auth.coachId, athleteId, {
        from: req.query?.from,
        to: req.query?.to,
        limit: req.query?.limit,
      });
      return res.json({ ok: true, status });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/athlete/day-status', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const athleteId = auth.role === 'athlete'
        ? auth.athleteId
        : String(req.body?.athleteId || '').trim();
      if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId obligatorio.' });
      const status = await storage.upsertAthleteDayStatus(
        auth.coachId,
        athleteId,
        req.body || {},
        auth.userId
      );
      return res.json({ ok: true, status });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/athlete/competitions', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const athleteId = auth.role === 'athlete'
        ? auth.athleteId
        : String(req.query?.athleteId || '').trim();
      if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId obligatorio.' });
      const competitions = await storage.listAthleteCompetitions(auth.coachId, athleteId);
      return res.json({ ok: true, competitions });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/athlete/competitions', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const athleteId = auth.role === 'athlete'
        ? auth.athleteId
        : String(req.body?.athleteId || '').trim();
      if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId obligatorio.' });
      const competition = await storage.upsertAthleteCompetition(
        auth.coachId,
        athleteId,
        req.body || {},
        auth.userId
      );
      return res.json({ ok: true, competition });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/athlete/competitions/:id', async (req, res, next) => {
    try {
      const auth = requireRole(req, res, null);
      if (!auth) return;
      const athleteId = auth.role === 'athlete'
        ? auth.athleteId
        : String(req.query?.athleteId || '').trim();
      if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId obligatorio.' });
      const result = await storage.deleteAthleteCompetition(auth.coachId, athleteId, req.params?.id);
      return res.json({ ok: true, deleted: Number(result?.deletedCount || 0) > 0 });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

