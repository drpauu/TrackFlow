import { config } from '../../config.js';
import { verifyPassword, signSessionToken } from '../../security/auth.js';
import { getMongoDb } from './mongo/client.js';
import {
  ensureIndexes,
  ensureCoachUserFromLocalData,
  getCurrentSyncVersion,
  getStateValue,
  nextSyncVersion,
  upsertStateValue,
  applyProjectionForKey,
} from './mongo/projection.js';
import {
  buildAthleteDayStatusColor,
  normalizeCoachId,
  normalizeIsoDate,
  parseJsonString,
  safeArray,
  slugify,
  toFiniteInt,
} from './mongo/shared.js';
import { createJogatinaService } from '../../domain/jogatina/service.js';

const jogatinaService = createJogatinaService();

function assertAuthForWrite(options = {}) {
  if (!config.mongoRequireAuth) return;
  const auth = options?.auth || null;
  const requestedCoachId = normalizeCoachId(options?.coachId);
  const sessionCoachId = normalizeCoachId(auth?.coachId);
  if (!auth?.userId) {
    const error = new Error('Auth requerida para escribir en storage.');
    error.statusCode = 401;
    throw error;
  }
  if (requestedCoachId !== sessionCoachId) {
    const error = new Error('No puedes escribir fuera de tu coachId.');
    error.statusCode = 403;
    throw error;
  }
  if (auth.role === 'coach') return;
  const allowedAthleteKeys = new Set(['tf_history', 'tf_athletes']);
  if (auth.role === 'athlete' && allowedAthleteKeys.has(String(options?.key || '').trim())) return;
  const error = new Error('No tienes permisos para esta escritura.');
  error.statusCode = 403;
  throw error;
}

function mergeAthleteHistory(existingValue, incomingValue, athleteId) {
  const safeAthleteId = String(athleteId || '').trim();
  const existing = safeArray(parseJsonString(existingValue, []))
    .filter((row) => row && typeof row === 'object');
  const incoming = safeArray(parseJsonString(incomingValue, []))
    .filter((row) => row && typeof row === 'object');
  if (!safeAthleteId) return JSON.stringify(existing);

  const otherRows = existing.filter((row) => String(row?.athleteId || '').trim() !== safeAthleteId);
  const ownRows = incoming
    .filter((row) => String(row?.athleteId || '').trim() === safeAthleteId)
    .map((row) => ({ ...row, athleteId: safeAthleteId }));
  return JSON.stringify([...ownRows, ...otherRows]);
}

function mergeAthleteRoster(existingValue, incomingValue, athleteId) {
  const safeAthleteId = String(athleteId || '').trim();
  const existing = safeArray(parseJsonString(existingValue, []))
    .filter((row) => row && typeof row === 'object');
  const incoming = safeArray(parseJsonString(incomingValue, []))
    .filter((row) => row && typeof row === 'object');
  if (!safeAthleteId) return JSON.stringify(existing);

  const ownIncoming = incoming.find((row) => String(row?.id || '').trim() === safeAthleteId) || null;
  if (!ownIncoming) return JSON.stringify(existing);

  const ownExisting = existing.find((row) => String(row?.id || '').trim() === safeAthleteId) || {};
  const sanitizedOwn = {
    ...ownExisting,
    id: safeAthleteId,
    name: String(ownIncoming?.name || ownExisting?.name || '').trim() || ownExisting?.name || '',
    avatar: ownIncoming?.avatar || ownExisting?.avatar || null,
    maxW: ownIncoming?.maxW && typeof ownIncoming.maxW === 'object' ? ownIncoming.maxW : (ownExisting?.maxW || {}),
    weekKms: safeArray(ownIncoming?.weekKms).map((item) => Number(item || 0)),
    todayDone: !!ownIncoming?.todayDone,
    competitions: safeArray(ownIncoming?.competitions),
    password: String(ownIncoming?.password || ownExisting?.password || '1234'),
    passwordChangedOnce: ownIncoming?.passwordChangedOnce != null
      ? !!ownIncoming.passwordChangedOnce
      : !!ownExisting?.passwordChangedOnce,
  };

  const merged = existing.map((row) => (
    String(row?.id || '').trim() === safeAthleteId
      ? { ...row, ...sanitizedOwn, id: safeAthleteId }
      : row
  ));
  if (!merged.some((row) => String(row?.id || '').trim() === safeAthleteId)) {
    merged.push(sanitizedOwn);
  }
  return JSON.stringify(merged);
}

async function sanitizeAthletePayloadForWrite(db, coachId, key, incomingValue, athleteId) {
  const safeKey = String(key || '').trim();
  if (!safeKey || !athleteId) return String(incomingValue ?? '');
  const existingValue = await getStateValue(db, coachId, safeKey);
  if (safeKey === 'tf_history') {
    return mergeAthleteHistory(existingValue, incomingValue, athleteId);
  }
  if (safeKey === 'tf_athletes') {
    return mergeAthleteRoster(existingValue, incomingValue, athleteId);
  }
  return String(incomingValue ?? '');
}

async function readCoachUser(db, usernameOrEmail) {
  const normalized = String(usernameOrEmail || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('@')) {
    return await db.collection('users').findOne({
      role: 'coach',
      emailLower: normalized,
      isActive: { $ne: false },
    });
  }
  return await db.collection('users').findOne({
    role: 'coach',
    usernameLower: normalized,
    isActive: { $ne: false },
  });
}

async function readAthleteUser(db, coachId, username) {
  const safeCoachId = normalizeCoachId(coachId);
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;
  return await db.collection('users').findOne({
    role: 'athlete',
    coachId: safeCoachId,
    usernameLower: normalized,
    isActive: { $ne: false },
  });
}

export function createMongoStorageProvider() {
  if (!config.mongoUri) {
    throw new Error('Mongo provider requires MONGODB_URI.');
  }

  return {
    name: 'mongo',

    async init() {
      const db = await getMongoDb();
      await ensureIndexes(db);
      await ensureCoachUserFromLocalData(db, config.defaultCoachId);
    },

    async get(key, options = {}) {
      const db = await getMongoDb();
      const coachId = normalizeCoachId(options?.coachId);
      return await getStateValue(db, coachId, key);
    },

    async set(key, value, options = {}) {
      const db = await getMongoDb();
      const coachId = normalizeCoachId(options?.coachId);
      const safeKey = String(key || '').trim();
      let valueJsonString = String(value ?? '');

      assertAuthForWrite({ ...options, key: safeKey });
      if (config.mongoRequireAuth && options?.auth?.role === 'athlete') {
        valueJsonString = await sanitizeAthletePayloadForWrite(
          db,
          coachId,
          safeKey,
          valueJsonString,
          options?.auth?.athleteId
        );
      }
      const result = await upsertStateValue({
        db,
        coachId,
        key: safeKey,
        valueJsonString,
        updatedBy: options?.auth?.userId || options?.clientId || null,
      });

      if (result.changed) {
        await applyProjectionForKey({ db, coachId, key: safeKey, rawValue: valueJsonString });
      }

      return {
        changed: result.changed,
        seq: Number(result.syncVersion || 0),
        latestSyncVersion: Number(result.syncVersion || 0),
      };
    },

    async getChanges(options = {}) {
      const db = await getMongoDb();
      const coachId = normalizeCoachId(options?.coachId);
      const since = Math.max(toFiniteInt(options?.since, 0), 0);
      const limit = Math.min(Math.max(toFiniteInt(options?.limit, 200), 1), 500);

      const rows = await db.collection('state_cache')
        .find(
          { coachId, syncVersion: { $gt: since } },
          { projection: { key: 1, syncVersion: 1, updatedAt: 1 } }
        )
        .sort({ syncVersion: 1 })
        .limit(limit)
        .toArray();

      const latestSyncVersion = await getCurrentSyncVersion(db, coachId);
      return {
        latestSeq: latestSyncVersion,
        latestSyncVersion,
        changes: rows.map((row) => ({
          seq: Number(row?.syncVersion || 0),
          syncVersion: Number(row?.syncVersion || 0),
          key: String(row?.key || ''),
          changedAt: row?.updatedAt || null,
          clientId: null,
        })),
      };
    },

    async authenticateCoach({ usernameOrEmail, password }) {
      const db = await getMongoDb();
      const user = await readCoachUser(db, usernameOrEmail);
      if (!user) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
      const valid = await verifyPassword(String(password || ''), String(user?.passwordHash || ''));
      if (!valid) return { ok: false, error: 'Usuario o contraseña incorrectos.' };

      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
      );
      const token = signSessionToken({
        sub: String(user._id),
        coachId: String(user.coachId || config.defaultCoachId),
        role: 'coach',
      });
      return {
        ok: true,
        token,
        user: {
          id: String(user._id),
          coachId: String(user.coachId || config.defaultCoachId),
          role: 'coach',
          username: user?.usernameLower || null,
          email: user?.emailLower || null,
        },
      };
    },

    async authenticateAthlete({ coachId, username, password }) {
      const db = await getMongoDb();
      const user = await readAthleteUser(db, coachId, username);
      if (!user) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
      const valid = await verifyPassword(String(password || ''), String(user?.passwordHash || ''));
      if (!valid) return { ok: false, error: 'Usuario o contraseña incorrectos.' };

      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
      );
      const token = signSessionToken({
        sub: String(user._id),
        coachId: String(user.coachId || config.defaultCoachId),
        role: 'athlete',
        athleteId: String(user?.athleteId || ''),
      });
      return {
        ok: true,
        token,
        user: {
          id: String(user._id),
          coachId: String(user.coachId || config.defaultCoachId),
          role: 'athlete',
          athleteId: String(user?.athleteId || ''),
          username: user?.usernameLower || null,
        },
      };
    },

    async getUserById(userId) {
      const db = await getMongoDb();
      const safeUserId = String(userId || '').trim();
      if (!safeUserId) return null;
      const user = await db.collection('users').findOne({ _id: safeUserId });
      if (!user) return null;
      return {
        id: String(user._id),
        coachId: String(user.coachId || config.defaultCoachId),
        role: String(user.role || ''),
        athleteId: user?.athleteId ? String(user.athleteId) : null,
        username: user?.usernameLower || null,
        email: user?.emailLower || null,
      };
    },

    async listCoachWeeks(coachId, options = {}) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const filter = { coachId: safeCoachId };
      if (options?.seasonId) filter.seasonId = String(options.seasonId || '').trim();
      return await db.collection('week_plans').find(filter).sort({ weekNumber: 1 }).toArray();
    },

    async publishWeek(coachId, weekPlanId) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const safeWeekPlanId = String(weekPlanId || '').trim();
      if (!safeWeekPlanId) throw new Error('weekPlanId vacio.');

      const nowIso = new Date().toISOString();
      const weekDoc = await db.collection('week_plans').findOneAndUpdate(
        { _id: safeWeekPlanId, coachId: safeCoachId },
        { $set: { status: 'published', publishedAt: nowIso, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!weekDoc) return null;

      const weekNumberKey = String(weekDoc?.weekNumber || '').trim();
      if (weekNumberKey) {
        const rawState = await getStateValue(db, safeCoachId, 'tf_week_plans');
        const currentState = parseJsonString(rawState, {});
        const stateByWeek = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
          ? { ...currentState }
          : {};
        const previousWeekState = stateByWeek[weekNumberKey] && typeof stateByWeek[weekNumberKey] === 'object'
          ? stateByWeek[weekNumberKey]
          : {};
        const baseWeek = weekDoc?.raw && typeof weekDoc.raw === 'object' ? weekDoc.raw : {};

        stateByWeek[weekNumberKey] = {
          ...previousWeekState,
          ...baseWeek,
          id: previousWeekState?.id || baseWeek?.id || `week_${weekNumberKey}`,
          weekNumber: Number(weekDoc?.weekNumber || previousWeekState?.weekNumber || weekNumberKey),
          startDate: weekDoc?.startDateIso || previousWeekState?.startDate || null,
          endDate: weekDoc?.endDateIso || previousWeekState?.endDate || null,
          days: safeArray(weekDoc?.days).length ? safeArray(weekDoc.days) : safeArray(previousWeekState?.days),
          published: true,
          publishedAt: weekDoc?.publishedAt || nowIso,
          updatedAt: nowIso,
          isEditingPublished: false,
        };

        const serialized = JSON.stringify(stateByWeek);
        const stateUpdate = await upsertStateValue({
          db,
          coachId: safeCoachId,
          key: 'tf_week_plans',
          valueJsonString: serialized,
          updatedBy: 'domain_publish_week',
        });
        if (stateUpdate.changed) {
          await applyProjectionForKey({
            db,
            coachId: safeCoachId,
            key: 'tf_week_plans',
            rawValue: serialized,
          });
        }
      }

      return await db.collection('week_plans').findOne({ _id: safeWeekPlanId, coachId: safeCoachId });
    },

    async listCoachAthletes(coachId) {
      const db = await getMongoDb();
      return await db.collection('athletes')
        .find({ coachId: normalizeCoachId(coachId) })
        .sort({ name: 1 })
        .toArray();
    },

    async listCoachGroups(coachId) {
      const db = await getMongoDb();
      return await db.collection('groups')
        .find({ coachId: normalizeCoachId(coachId) })
        .sort({ position: 1, name: 1 })
        .toArray();
    },

    async listCatalogTrainings(coachId) {
      const db = await getMongoDb();
      return await db.collection('trainings')
        .find({ coachId: normalizeCoachId(coachId), isActive: { $ne: false } })
        .sort({ name: 1 })
        .toArray();
    },

    async listCatalogGymExercises(coachId) {
      const db = await getMongoDb();
      return await db.collection('gym_exercises')
        .find({ coachId: normalizeCoachId(coachId), isActive: { $ne: false } })
        .sort({ position: 1, name: 1 })
        .toArray();
    },

    async listAthleteDayStatus(coachId, athleteId, options = {}) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const safeAthleteId = String(athleteId || '').trim();
      const filter = { coachId: safeCoachId, athleteId: safeAthleteId };
      const from = normalizeIsoDate(options?.from);
      const to = normalizeIsoDate(options?.to);
      if (from || to) {
        filter.dateIso = {};
        if (from) filter.dateIso.$gte = from;
        if (to) filter.dateIso.$lte = to;
      }
      const limit = Math.min(Math.max(toFiniteInt(options?.limit, 180), 1), 400);
      const rows = await db.collection('athlete_day_status')
        .find(filter)
        .sort({ dateIso: 1 })
        .limit(limit)
        .toArray();
      return rows.map((row) => ({
        ...row,
        colorStatus: buildAthleteDayStatusColor({
          dateIso: row?.dateIso || null,
          plannedSlotsCount: Number(row?.plannedSlotsCount || 0),
          doneSlotsCount: Number(row?.doneSlotsCount || 0),
        }),
      }));
    },

    async listAthleteCompetitions(coachId, athleteId) {
      const db = await getMongoDb();
      return await db.collection('competitions')
        .find({ coachId: normalizeCoachId(coachId), athleteId: String(athleteId || '').trim() })
        .sort({ dateIso: 1 })
        .toArray();
    },

    async upsertAthleteDayStatus(coachId, athleteId, payload = {}, updatedBy = null) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const safeAthleteId = String(athleteId || '').trim();
      const dateIso = normalizeIsoDate(payload?.dateIso || payload?.date);
      if (!safeAthleteId || !dateIso) throw new Error('athleteId/dateIso obligatorios.');

      const rowId = `${safeCoachId}:${safeAthleteId}:${dateIso}`;
      const [plan, previous] = await Promise.all([
        db.collection('athlete_day_plans').findOne({ _id: rowId }),
        db.collection('athlete_day_status').findOne({ _id: rowId }),
      ]);

      const amPlanned = !!plan?.slots?.am?.planned;
      const pmPlanned = !!plan?.slots?.pm?.planned;
      const gymPlanned = !!plan?.slots?.gym?.planned;
      const plannedSlotsCount = Number(plan?.plannedSlotsCount || 0);
      const mode = String(payload?.mode || 'replace').trim().toLowerCase();
      const slot = String(payload?.slot || '').trim().toLowerCase();

      let amDone = amPlanned ? !!previous?.amDone : false;
      let pmDone = pmPlanned ? !!previous?.pmDone : false;
      let gymDone = gymPlanned ? !!previous?.gymDone : false;

      if (mode === 'toggle' && (slot === 'am' || slot === 'pm' || slot === 'gym')) {
        const nextDone = !!payload?.done;
        if (slot === 'am' && amPlanned) amDone = nextDone;
        if (slot === 'pm' && pmPlanned) pmDone = nextDone;
        if (slot === 'gym' && gymPlanned) gymDone = nextDone;
      } else {
        amDone = amPlanned ? !!payload?.amDone : false;
        pmDone = pmPlanned ? !!payload?.pmDone : false;
        gymDone = gymPlanned ? !!payload?.gymDone : false;
      }

      const doneSlotsCount = Number(amDone) + Number(pmDone) + Number(gymDone);
      const colorStatus = buildAthleteDayStatusColor({ dateIso, plannedSlotsCount, doneSlotsCount });
      await db.collection('athlete_day_status').updateOne(
        { _id: rowId },
        {
          $set: {
            coachId: safeCoachId,
            athleteId: safeAthleteId,
            dateIso,
            plannedSlotsCount,
            amDone,
            pmDone,
            gymDone,
            doneSlotsCount,
            colorStatus,
            updatedBy: String(updatedBy || safeAthleteId),
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      const statusRow = await db.collection('athlete_day_status').findOne({ _id: rowId });

      const shouldTryDailyBonus = Number(statusRow?.plannedSlotsCount || 0) > 0
        && Number(statusRow?.doneSlotsCount || 0) >= Number(statusRow?.plannedSlotsCount || 0);

      if (shouldTryDailyBonus) {
        try {
          const athlete = await db.collection('athletes').findOne(
            { coachId: safeCoachId, athleteId: safeAthleteId },
            { projection: { timezone: 1 } }
          );
          await jogatinaService.awardDailyCompletionBonus({
            coachId: safeCoachId,
            athleteId: safeAthleteId,
            dateIso,
            timezone: athlete?.timezone || null,
            source: 'day_status_update',
          });
        } catch (error) {
          // No bloqueamos el flujo principal si falla el bonus de Jogatina.
          console.error('Jogatina daily bonus error:', error?.message || error);
        }
      }

      return statusRow;
    },

    async upsertAthleteCompetition(coachId, athleteId, payload = {}, createdBy = null) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const safeAthleteId = String(athleteId || '').trim();
      const dateIso = normalizeIsoDate(payload?.dateIso || payload?.date);
      if (!safeAthleteId || !dateIso) throw new Error('athleteId/dateIso obligatorios.');
      const name = String(payload?.name || 'Competicion').trim() || 'Competicion';
      const competitionId = String(payload?.id || '').trim() || slugify(`${dateIso}-${name}`);
      const id = `${safeCoachId}:${safeAthleteId}:${competitionId}`;
      await db.collection('competitions').updateOne(
        { _id: id },
        {
          $set: {
            coachId: safeCoachId,
            athleteId: safeAthleteId,
            dateIso,
            name,
            notes: String(payload?.notes || '').trim() || null,
            createdBy: String(createdBy || safeAthleteId),
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      return await db.collection('competitions').findOne({ _id: id });
    },

    async deleteAthleteCompetition(coachId, athleteId, competitionId) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const safeAthleteId = String(athleteId || '').trim();
      const safeCompetitionId = String(competitionId || '').trim();
      if (!safeAthleteId || !safeCompetitionId) return { deletedCount: 0 };
      return await db.collection('competitions').deleteOne({
        _id: `${safeCoachId}:${safeAthleteId}:${safeCompetitionId}`,
      });
    },

    async listCoachDashboard(coachId) {
      const db = await getMongoDb();
      const safeCoachId = normalizeCoachId(coachId);
      const [groups, athletes, weeks] = await Promise.all([
        db.collection('groups').find({ coachId: safeCoachId }).sort({ position: 1, name: 1 }).toArray(),
        db.collection('athletes').find({ coachId: safeCoachId }).sort({ name: 1 }).toArray(),
        db.collection('week_plans').find({ coachId: safeCoachId }).sort({ weekNumber: 1 }).toArray(),
      ]);
      return { groups, athletes, weeks };
    },

    async forceSyncVersion(coachId) {
      const db = await getMongoDb();
      return await nextSyncVersion(db, normalizeCoachId(coachId));
    },

    async getStateParsed(coachId, key, fallback = null) {
      const db = await getMongoDb();
      const value = await getStateValue(db, normalizeCoachId(coachId), key);
      return parseJsonString(value, fallback);
    },

    async listStateKeys(coachId) {
      const db = await getMongoDb();
      const rows = await db.collection('state_cache')
        .find({ coachId: normalizeCoachId(coachId) }, { projection: { key: 1 } })
        .toArray();
      return safeArray(rows).map((row) => String(row?.key || '').trim()).filter(Boolean);
    },

    async getMongoDb() {
      return await getMongoDb();
    },
  };
}
