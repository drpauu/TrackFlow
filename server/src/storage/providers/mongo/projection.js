import crypto from 'node:crypto';
import { config } from '../../../config.js';
import { hashPassword } from '../../../security/auth.js';
import { readJsonFile, readTextFile } from '../../../utils/fs.js';
import {
  USERS_KEY,
  DEFAULT_USERS_CSV_HEADER,
  addDaysIso,
  buildAthleteDayStatusColor,
  normalizeCoachId,
  normalizeGroupName,
  normalizeIsoDate,
  parseJsonString,
  safeArray,
  sanitizeKms,
  sessionVisibleForAthlete,
  slotSessionsFromDay,
  slugify,
  toStoredString,
} from './shared.js';

const PROJECTION_KEYS = new Set([
  'tf_user',
  'tf_groups',
  'tf_athletes',
  'tf_trainings',
  'tf_custom_exercises',
  'tf_exercise_images',
  'tf_seasons',
  'tf_week_plans',
  'tf_history',
  'tf_current_season_id',
]);

export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndexes([
      { key: { coachId: 1, role: 1 }, name: 'idx_users_coach_role' },
      { key: { emailLower: 1 }, name: 'uniq_users_email_coach', unique: true, partialFilterExpression: { role: 'coach', emailLower: { $type: 'string' } } },
      { key: { coachId: 1, usernameLower: 1 }, name: 'uniq_users_username_athlete', unique: true, partialFilterExpression: { role: 'athlete', usernameLower: { $type: 'string' } } },
    ]),
    db.collection('groups').createIndexes([
      { key: { coachId: 1, slug: 1 }, name: 'uniq_groups_coach_slug', unique: true },
      { key: { coachId: 1, position: 1 }, name: 'idx_groups_position' },
    ]),
    db.collection('athletes').createIndexes([
      { key: { coachId: 1, athleteId: 1 }, name: 'uniq_athletes_athlete_id', unique: true },
      { key: { coachId: 1, nameLower: 1 }, name: 'uniq_athletes_name', unique: true },
      { key: { coachId: 1, primaryGroupSlug: 1 }, name: 'idx_athletes_group' },
    ]),
    db.collection('gym_exercises').createIndexes([
      { key: { coachId: 1, isActive: 1, position: 1 }, name: 'idx_gym_exercises_active_position' },
      { key: { coachId: 1, name: 1 }, name: 'idx_gym_exercises_name' },
    ]),
    db.collection('trainings').createIndexes([
      { key: { coachId: 1, isActive: 1 }, name: 'idx_trainings_active' },
      { key: { coachId: 1, weekTypes: 1 }, name: 'idx_trainings_weektypes' },
    ]),
    db.collection('seasons').createIndexes([
      { key: { coachId: 1, label: 1 }, name: 'uniq_seasons_label', unique: true },
      { key: { coachId: 1, isLocked: 1 }, name: 'idx_seasons_locked' },
    ]),
    db.collection('week_plans').createIndexes([
      { key: { coachId: 1, seasonId: 1, weekNumber: 1 }, name: 'uniq_week_plans', unique: true },
      { key: { coachId: 1, status: 1, startDateIso: 1 }, name: 'idx_week_plans_status_date' },
      { key: { coachId: 1, updatedAt: -1 }, name: 'idx_week_plans_updated' },
    ]),
    db.collection('athlete_day_plans').createIndexes([
      { key: { coachId: 1, athleteId: 1, dateIso: 1 }, name: 'uniq_day_plans', unique: true },
      { key: { coachId: 1, dateIso: 1 }, name: 'idx_day_plans_date' },
    ]),
    db.collection('athlete_day_status').createIndexes([
      { key: { coachId: 1, athleteId: 1, dateIso: 1 }, name: 'uniq_day_status', unique: true },
      { key: { coachId: 1, dateIso: 1, colorStatus: 1 }, name: 'idx_day_status_color' },
    ]),
    db.collection('competitions').createIndexes([
      { key: { coachId: 1, athleteId: 1, dateIso: 1 }, name: 'idx_comp_athlete_date' },
    ]),
    db.collection('state_cache').createIndexes([
      { key: { coachId: 1, key: 1 }, name: 'uniq_state_cache_key', unique: true },
      { key: { coachId: 1, syncVersion: 1 }, name: 'idx_state_cache_sync' },
    ]),
    Promise.resolve(),
    db.collection('jogatina_groups').createIndexes([
      { key: { code5: 1 }, name: 'uniq_jogatina_group_code5', unique: true },
      { key: { coachId: 1, ownerAthleteId: 1 }, name: 'idx_jogatina_group_owner' },
      { key: { coachId: 1, name: 1 }, name: 'idx_jogatina_group_name' },
    ]),
    db.collection('jogatina_memberships').createIndexes([
      { key: { athleteId: 1 }, name: 'uniq_jogatina_membership_athlete', unique: true },
      { key: { groupId: 1, joinedAt: 1 }, name: 'idx_jogatina_membership_group_joined' },
      { key: { coachId: 1, groupId: 1 }, name: 'idx_jogatina_membership_coach_group' },
    ]),
    db.collection('jogatina_wallets').createIndexes([
      { key: { athleteId: 1, seasonKey: 1 }, name: 'uniq_jogatina_wallet', unique: true },
      { key: { coachId: 1, seasonKey: 1, points: -1 }, name: 'idx_jogatina_wallet_ranking' },
      { key: { coachId: 1, athleteId: 1 }, name: 'idx_jogatina_wallet_athlete' },
    ]),
    db.collection('jogatina_bets_open').createIndexes([
      { key: { groupId: 1, status: 1, closeAt: 1 }, name: 'idx_jogatina_bets_group_status_close' },
      { key: { coachId: 1, resolveDeadlineAt: 1, status: 1 }, name: 'idx_jogatina_bets_deadline' },
      { key: { groupId: 1, creatorAthleteId: 1, createdAt: -1 }, name: 'idx_jogatina_bets_creator' },
    ]),
    db.collection('jogatina_wagers_open').createIndexes([
      { key: { betId: 1, athleteId: 1 }, name: 'uniq_jogatina_wager', unique: true },
      { key: { groupId: 1, betId: 1 }, name: 'idx_jogatina_wager_group_bet' },
      { key: { athleteId: 1, updatedAt: -1 }, name: 'idx_jogatina_wager_athlete' },
    ]),
    db.collection('jogatina_group_carryover').createIndexes([
      { key: { groupId: 1 }, name: 'uniq_jogatina_carryover_group', unique: true },
      { key: { coachId: 1 }, name: 'idx_jogatina_carryover_coach' },
    ]),
    db.collection('jogatina_daily_bonus_claims').createIndexes([
      { key: { athleteId: 1, localDate: 1 }, name: 'uniq_jogatina_bonus_claim', unique: true },
      { key: { coachId: 1, localDate: 1 }, name: 'idx_jogatina_bonus_claim_date' },
    ]),
    db.collection('jogatina_ledger').createIndexes([
      { key: { athleteId: 1, createdAt: -1 }, name: 'idx_jogatina_ledger_athlete' },
      { key: { groupId: 1, createdAt: -1 }, name: 'idx_jogatina_ledger_group' },
      { key: { coachId: 1, seasonKey: 1, createdAt: -1 }, name: 'idx_jogatina_ledger_coach_season' },
    ]),
  ]);
}

export async function nextSyncVersion(db, coachId) {
  const safeCoachId = normalizeCoachId(coachId);
  const counter = await db.collection('sync_counters').findOneAndUpdate(
    { _id: `coach:${safeCoachId}` },
    { $inc: { value: 1 }, $set: { coachId: safeCoachId, updatedAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  return Number(counter?.value || 1);
}

export async function getCurrentSyncVersion(db, coachId) {
  const safeCoachId = normalizeCoachId(coachId);
  const row = await db.collection('sync_counters').findOne(
    { _id: `coach:${safeCoachId}` },
    { projection: { value: 1 } }
  );
  return Number(row?.value || 0);
}

export async function getStateEntry(db, coachId, key) {
  return await db.collection('state_cache').findOne(
    { coachId: normalizeCoachId(coachId), key: String(key || '').trim() },
    { projection: { valueJsonString: 1, syncVersion: 1, updatedAt: 1 } }
  );
}

export async function getStateValue(db, coachId, key) {
  const row = await getStateEntry(db, coachId, key);
  return row?.valueJsonString ?? null;
}

export async function upsertStateValue({ db, coachId, key, valueJsonString, updatedBy = null }) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeKey = String(key || '').trim();
  const current = await getStateEntry(db, safeCoachId, safeKey);
  if ((current?.valueJsonString ?? null) === valueJsonString) {
    return { changed: false, syncVersion: Number(current?.syncVersion || 0) };
  }

  const syncVersion = await nextSyncVersion(db, safeCoachId);
  await db.collection('state_cache').updateOne(
    { coachId: safeCoachId, key: safeKey },
    {
      $set: {
        coachId: safeCoachId,
        key: safeKey,
        valueJsonString,
        syncVersion,
        updatedAt: new Date(),
        updatedBy: updatedBy || null,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  return { changed: true, syncVersion };
}

async function syncCoach(db, coachId, rawValue) {
  const coach = parseJsonString(rawValue, null);
  if (!coach || typeof coach !== 'object') return;
  const now = new Date();
  await db.collection('users').updateOne(
    { _id: `coach:${coachId}` },
    {
      $set: {
        coachId,
        role: 'coach',
        usernameLower: normalizeGroupName(coach?.name || 'coach'),
        emailLower: String(coach?.email || '').trim().toLowerCase() || null,
        passwordHash: await hashPassword(String(coach?.password || '150346')),
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

async function syncGroups(db, coachId, rawValue) {
  const names = safeArray(parseJsonString(rawValue, []))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const now = new Date();
  await db.collection('groups').deleteMany({ coachId });
  if (!names.length) return;
  const seen = new Set();
  const docs = [];
  names.forEach((name) => {
    const slug = slugify(name);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    docs.push({
      _id: `${coachId}:${slug}`,
      coachId,
      name,
      slug,
      position: docs.length,
      isActive: true,
      updatedAt: now,
      createdAt: now,
    });
  });
  if (docs.length) {
    await db.collection('groups').insertMany(docs, { ordered: false });
  }
}

async function syncAthletesAndCompetitions(db, coachId, rawValue) {
  const athletes = safeArray(parseJsonString(rawValue, []))
    .filter((item) => item && typeof item === 'object');
  const now = new Date();

  await db.collection('athletes').deleteMany({ coachId });
  const athleteDocs = athletes
    .map((item) => {
      const athleteId = String(item?.id || '').trim();
      const name = String(item?.name || '').trim();
      if (!athleteId || !name) return null;
      const groups = safeArray(item?.groups).map((value) => normalizeGroupName(value)).filter(Boolean);
      const primary = normalizeGroupName(item?.group || groups[0] || 'por-asignar') || 'por-asignar';
      return {
        _id: `${coachId}:${athleteId}`,
        coachId,
        athleteId,
        name,
        nameLower: normalizeGroupName(name),
        primaryGroupSlug: primary,
        groupSlugs: groups.length ? groups : [primary],
        avatar: item?.avatar || null,
        maxWeights: item?.maxW && typeof item.maxW === 'object' ? item.maxW : {},
        weekKms: safeArray(item?.weekKms).map((value) => Number(value || 0)),
        todayDone: !!item?.todayDone,
        isActive: true,
        updatedAt: now,
        createdAt: now,
      };
    })
    .filter(Boolean);
  if (athleteDocs.length) {
    await db.collection('athletes').insertMany(athleteDocs, { ordered: false });
  }

  await db.collection('users').deleteMany({ coachId, role: 'athlete' });
  const athleteUsers = [];
  for (const athlete of athletes) {
    const athleteId = String(athlete?.id || '').trim();
    const name = String(athlete?.name || '').trim();
    if (!athleteId || !name) continue;
    athleteUsers.push({
      _id: `athlete:${coachId}:${athleteId}`,
      coachId,
      role: 'athlete',
      athleteId,
      usernameLower: normalizeGroupName(name),
      emailLower: null,
      passwordHash: await hashPassword(String(athlete?.password || '1234')),
      isActive: true,
      updatedAt: now,
      createdAt: now,
    });
  }
  if (athleteUsers.length) {
    await db.collection('users').insertMany(athleteUsers, { ordered: false });
  }

  await db.collection('competitions').deleteMany({ coachId });
  const competitionDocs = [];
  athletes.forEach((athlete) => {
    const athleteId = String(athlete?.id || '').trim();
    if (!athleteId) return;
    safeArray(athlete?.competitions).forEach((competition, index) => {
      const dateIso = normalizeIsoDate(competition?.dateIso || competition?.date);
      if (!dateIso) return;
      const name = String(competition?.name || competition?.title || 'Competicion').trim() || 'Competicion';
      const compId = String(competition?.id || `${dateIso}_${index}`).trim();
      competitionDocs.push({
        _id: `${coachId}:${athleteId}:${compId}`,
        coachId,
        athleteId,
        dateIso,
        name,
        notes: String(competition?.notes || '').trim() || null,
        createdBy: athleteId,
        updatedAt: now,
        createdAt: now,
      });
    });
  });
  if (competitionDocs.length) {
    await db.collection('competitions').insertMany(competitionDocs, { ordered: false });
  }
}

async function syncTrainings(db, coachId, rawValue) {
  const trainings = safeArray(parseJsonString(rawValue, []));
  const now = new Date();
  await db.collection('trainings').deleteMany({ coachId });
  const docs = trainings.map((training) => {
    const trainingId = String(training?.id || '').trim() || crypto.randomUUID();
    return {
      _id: `${coachId}:${trainingId}`,
      coachId,
      trainingId,
      name: String(training?.name || '').trim() || trainingId,
      description: String(training?.description || '').trim(),
      weekTypes: safeArray(training?.weekTypes).map((item) => String(item || '').trim()).filter(Boolean),
      kms: sanitizeKms(training?.zones || {}),
      source: String(training?.source || 'dataset').trim() || 'dataset',
      isActive: true,
      updatedAt: now,
      createdAt: now,
    };
  });
  if (docs.length) {
    await db.collection('trainings').insertMany(docs, { ordered: false });
  }
}

async function syncSeasons(db, coachId, rawValue) {
  const seasons = safeArray(parseJsonString(rawValue, []));
  const now = new Date();
  await db.collection('seasons').deleteMany({ coachId });
  const docs = seasons.map((season) => {
    const seasonId = String(season?.id || '').trim() || crypto.randomUUID();
    return {
      _id: `${coachId}:${seasonId}`,
      coachId,
      seasonId,
      label: String(season?.label || seasonId).trim(),
      weekOneStartIso: normalizeIsoDate(season?.weekOneStartIso) || null,
      startedAt: season?.startedAt || null,
      finalizedAt: season?.finalizedAt || null,
      isLocked: !!season?.finalizedAt,
      updatedAt: now,
      createdAt: now,
    };
  });
  if (docs.length) {
    await db.collection('seasons').insertMany(docs, { ordered: false });
  }
}

async function syncGymExercises(db, coachId) {
  const customRaw = await getStateValue(db, coachId, 'tf_custom_exercises');
  const imageRaw = await getStateValue(db, coachId, 'tf_exercise_images');
  const custom = safeArray(parseJsonString(customRaw, []));
  const images = parseJsonString(imageRaw, {});
  const imageMap = images && typeof images === 'object' ? images : {};
  const now = new Date();

  await db.collection('gym_exercises').deleteMany({ coachId, source: 'custom' });
  const docs = custom.map((exercise, position) => {
    const exerciseId = String(exercise?.id || '').trim() || `custom_${crypto.randomUUID()}`;
    return {
      _id: `${coachId}:${exerciseId}`,
      coachId,
      exerciseId,
      name: String(exercise?.name || '').trim() || exerciseId,
      type: ['weight', 'reps', 'time_reps'].includes(String(exercise?.type || '').trim())
        ? String(exercise.type).trim()
        : 'reps',
      category: String(exercise?.category || 'custom').trim() || 'custom',
      muscles: String(exercise?.muscles || '').trim(),
      imageUrl: imageMap?.[exerciseId] || exercise?.imageUrl || null,
      defaultPrescription: exercise?.defaultPrescription && typeof exercise.defaultPrescription === 'object'
        ? exercise.defaultPrescription
        : {},
      position,
      source: 'custom',
      isActive: true,
      updatedAt: now,
      createdAt: now,
    };
  });
  if (docs.length) {
    await db.collection('gym_exercises').insertMany(docs, { ordered: false });
  }
}

async function rebuildAthleteDayPlansAndStatus(db, coachId) {
  const [athletes, weeks] = await Promise.all([
    db.collection('athletes').find({ coachId }).toArray(),
    db.collection('week_plans').find({ coachId, status: 'published' }).toArray(),
  ]);
  const now = new Date();
  const dayPlans = [];

  weeks.forEach((week) => {
    safeArray(week?.days).forEach((day, dayIndex) => {
      const dateIso = normalizeIsoDate(day?.dateIso) || addDaysIso(week?.startDateIso, dayIndex);
      if (!dateIso) return;
      athletes.forEach((athlete) => {
        const athleteId = String(athlete?.athleteId || '').trim();
        if (!athleteId) return;
        const amSessions = slotSessionsFromDay(day, 'am').filter((session) => sessionVisibleForAthlete(session, day, athlete));
        const pmSessions = slotSessionsFromDay(day, 'pm').filter((session) => sessionVisibleForAthlete(session, day, athlete));
        const gymVisible = !!day?.gym && sessionVisibleForAthlete(
          { targetGroup: day?.gymTargetGroup || day?.targetGroup || 'all' },
          day,
          athlete
        );
        const amPlanned = amSessions.some((session) => String(session?.name || '').trim());
        const pmPlanned = pmSessions.some((session) => String(session?.name || '').trim());
        const gymPlanned = gymVisible;
        const plannedSlotsCount = Number(amPlanned) + Number(pmPlanned) + Number(gymPlanned);
        dayPlans.push({
          _id: `${coachId}:${athleteId}:${dateIso}`,
          coachId,
          athleteId,
          dateIso,
          weekPlanId: week?._id || null,
          weekNumber: Number(week?.weekNumber || 0) || null,
          slots: {
            am: { planned: amPlanned, count: amSessions.length },
            pm: { planned: pmPlanned, count: pmSessions.length },
            gym: { planned: gymPlanned, count: gymPlanned ? 1 : 0 },
          },
          plannedSlotsCount,
          hasPlannedWork: plannedSlotsCount > 0,
          updatedAt: now,
          createdAt: now,
        });
      });
    });
  });

  await db.collection('athlete_day_plans').deleteMany({ coachId });
  if (dayPlans.length) {
    await db.collection('athlete_day_plans').insertMany(dayPlans, { ordered: false });
  }

  const existing = await db.collection('athlete_day_status').find({ coachId }).toArray();
  const existingById = new Map(existing.map((row) => [String(row?._id || ''), row]));
  const ops = dayPlans.map((plan) => {
    const prev = existingById.get(plan._id) || {};
    const amDone = plan.slots?.am?.planned ? !!prev?.amDone : false;
    const pmDone = plan.slots?.pm?.planned ? !!prev?.pmDone : false;
    const gymDone = plan.slots?.gym?.planned ? !!prev?.gymDone : false;
    const doneSlotsCount = Number(amDone) + Number(pmDone) + Number(gymDone);
    return {
      updateOne: {
        filter: { _id: plan._id },
        update: {
          $set: {
            coachId,
            athleteId: plan.athleteId,
            dateIso: plan.dateIso,
            plannedSlotsCount: plan.plannedSlotsCount,
            amDone,
            pmDone,
            gymDone,
            doneSlotsCount,
            colorStatus: buildAthleteDayStatusColor({
              dateIso: plan.dateIso,
              plannedSlotsCount: plan.plannedSlotsCount,
              doneSlotsCount,
            }),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  });
  if (ops.length) {
    await db.collection('athlete_day_status').bulkWrite(ops, { ordered: false });
  }
}

async function syncWeekPlans(db, coachId, rawValue) {
  const plansByNumber = parseJsonString(rawValue, {});
  if (!plansByNumber || typeof plansByNumber !== 'object' || Array.isArray(plansByNumber)) return;
  const seasonRaw = await getStateValue(db, coachId, 'tf_current_season_id');
  const seasonId = String(parseJsonString(seasonRaw, null) || 'default').trim() || 'default';
  const now = new Date();
  await db.collection('week_plans').deleteMany({ coachId, seasonId });
  const docs = Object.entries(plansByNumber)
    .map(([rawWeekNumber, rawWeek]) => {
      const week = rawWeek && typeof rawWeek === 'object' ? rawWeek : {};
      const weekNumber = Number(week?.weekNumber || rawWeekNumber || 0) || 0;
      if (weekNumber <= 0) return null;
      const status = week?.published ? 'published' : 'draft';
      return {
        _id: `${coachId}:${seasonId}:${weekNumber}`,
        coachId,
        seasonId,
        weekNumber,
        startDateIso: normalizeIsoDate(week?.startDate) || null,
        endDateIso: normalizeIsoDate(week?.endDate) || null,
        status,
        publishedAt: status === 'published' ? (week?.publishedAt || null) : null,
        days: safeArray(week?.days),
        raw: week,
        updatedAt: now,
        createdAt: now,
      };
    })
    .filter(Boolean);
  if (docs.length) {
    await db.collection('week_plans').insertMany(docs, { ordered: false });
  }
  await rebuildAthleteDayPlansAndStatus(db, coachId);
}

async function syncHistory(db, coachId, rawValue) {
  const history = safeArray(parseJsonString(rawValue, []));
  if (!history.length) return;
  const plans = await db.collection('athlete_day_plans').find({ coachId }).toArray();
  const planById = new Map(plans.map((plan) => [String(plan?._id || ''), plan]));
  const now = new Date();
  const ops = history.map((row, index) => {
    const athleteId = String(row?.athleteId || '').trim();
    const dateIso = normalizeIsoDate(row?.dateIso);
    if (!athleteId || !dateIso) return null;
    const statusId = `${coachId}:${athleteId}:${dateIso}`;
    const plan = planById.get(statusId) || null;
    const plannedSlotsCount = Number(plan?.plannedSlotsCount || 0);
    const amDone = !!row?.amDone;
    const pmDone = !!row?.pmDone;
    const gymDone = !!row?.gymDone;
    const doneSlotsCount = Number(amDone) + Number(pmDone) + Number(gymDone);
    return {
      updateOne: {
        filter: { _id: statusId },
        update: {
          $set: {
            coachId,
            athleteId,
            dateIso,
            plannedSlotsCount,
            amDone,
            pmDone,
            gymDone,
            doneSlotsCount,
            colorStatus: buildAthleteDayStatusColor({ dateIso, plannedSlotsCount, doneSlotsCount }),
            sourceRowId: String(row?.id || `${statusId}:${index}`),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  }).filter(Boolean);
  if (ops.length) {
    await db.collection('athlete_day_status').bulkWrite(ops, { ordered: false });
  }
}

export async function applyProjectionForKey({ db, coachId, key, rawValue }) {
  if (!PROJECTION_KEYS.has(key)) return;
  if (key === 'tf_user') await syncCoach(db, coachId, rawValue);
  if (key === 'tf_groups') await syncGroups(db, coachId, rawValue);
  if (key === 'tf_athletes') await syncAthletesAndCompetitions(db, coachId, rawValue);
  if (key === 'tf_trainings') await syncTrainings(db, coachId, rawValue);
  if (key === 'tf_seasons') await syncSeasons(db, coachId, rawValue);
  if (key === 'tf_week_plans') await syncWeekPlans(db, coachId, rawValue);
  if (key === 'tf_history') await syncHistory(db, coachId, rawValue);
  if (key === 'tf_custom_exercises' || key === 'tf_exercise_images') {
    await syncGymExercises(db, coachId);
  }
}

export async function ensureCoachUserFromLocalData(db, coachId) {
  const safeCoachId = normalizeCoachId(coachId);
  const existing = await db.collection('users').findOne(
    { _id: `coach:${safeCoachId}`, role: 'coach' },
    { projection: { _id: 1 } }
  );
  if (existing) return;

  // Try from state_cache (previously synced tf_user)
  const cachedDoc = await db.collection('state_cache').findOne({ coachId: safeCoachId, key: 'tf_user' });
  if (cachedDoc?.value && cachedDoc.value !== 'null') {
    await syncCoach(db, safeCoachId, cachedDoc.value);
    return;
  }

  // Try from local app_storage.json
  const storageJson = await readJsonFile(config.appStorageFile, {});
  const localValue = storageJson?.tf_user;
  const localStr = toStoredString(localValue);
  if (localStr && localStr !== 'null') {
    await syncCoach(db, safeCoachId, localStr);
  }
}

export async function seedFromLocalIfNeeded(db, coachId) {
  const safeCoachId = normalizeCoachId(coachId);
  const count = await db.collection('state_cache').countDocuments({ coachId: safeCoachId }, { limit: 1 });
  if (count > 0) return;

  const storageJson = await readJsonFile(config.appStorageFile, {});
  const usersCsv = await readTextFile(config.usersCsvFile, DEFAULT_USERS_CSV_HEADER);
  const entries = Object.entries(storageJson || {}).filter(([key]) => key.startsWith('tf_'));
  if (!entries.some(([key]) => key === USERS_KEY)) {
    entries.push([USERS_KEY, usersCsv || DEFAULT_USERS_CSV_HEADER]);
  }

  for (const [key, value] of entries) {
    const valueJsonString = toStoredString(value) ?? '';
    await upsertStateValue({
      db,
      coachId: safeCoachId,
      key,
      valueJsonString,
      updatedBy: 'local_seed',
    });
    await applyProjectionForKey({ db, coachId: safeCoachId, key, rawValue: valueJsonString });
  }
}
