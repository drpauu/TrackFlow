import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { hashPassword } from '../server/src/security/auth.js';
import {
  addDaysIso,
  buildAthleteDayStatusColor,
  normalizeCoachId,
  normalizeGroupName,
  parseJsonString,
  safeArray,
  slugify,
  slotSessionsFromDay,
  sessionVisibleForAthlete,
  toStoredString,
} from '../server/src/storage/providers/mongo/shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });
dotenv.config({ path: path.resolve(REPO_ROOT, 'server/.env') });

const DATABASE_NAME = 'TrackFlow';
const COACH_ID = normalizeCoachId(process.env.DEFAULT_COACH_ID || 'coach_default');
const COACH_NAME = 'Juan Carlos';
const COACH_EMAIL = 'coach@trackflow.app';
const COACH_PASSWORD = '150346';
const ATHLETE_DEFAULT_PASSWORD = '1234';
const DEFAULT_USERS_CSV_HEADER = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions,password,passwordChangedOnce';

const APP_STORAGE_PATH = path.resolve(REPO_ROOT, 'server/data/app_storage.json');
const USERS_CSV_PATH = path.resolve(REPO_ROOT, 'server/data/users.csv');
const OUTPUT_SEED_PATH = path.resolve(REPO_ROOT, 'server/data/seeds/trackflow-mega-seed.json');
const OUTPUT_MDM_PATH = path.resolve(REPO_ROOT, 'docs/trackflow-data-model.mdm');

const BUILTIN_GYM_EXERCISES = [
  { id: 'sq', name: 'Sentadilla', type: 'weight', category: 'compound', muscles: 'Cuadriceps · Gluteos' },
  { id: 'dl', name: 'Peso Muerto', type: 'weight', category: 'compound', muscles: 'Isquios · Espalda' },
  { id: 'bp', name: 'Press Banca', type: 'weight', category: 'upper', muscles: 'Pecho · Triceps' },
  { id: 'ht', name: 'Hip Thrust', type: 'weight', category: 'compound', muscles: 'Gluteos · Isquios' },
  { id: 'lp', name: 'Prensa', type: 'weight', category: 'compound', muscles: 'Cuadriceps' },
  { id: 'row', name: 'Remo con Barra', type: 'weight', category: 'upper', muscles: 'Dorsal · Biceps' },
  { id: 'lunge', name: 'Zancadas', type: 'reps', category: 'unilateral', muscles: 'Cuadriceps · Gluteos' },
  { id: 'rdl', name: 'RDL', type: 'weight', category: 'compound', muscles: 'Isquios · Gluteos' },
  { id: 'calf', name: 'Gemelos', type: 'reps', category: 'isolation', muscles: 'Soleo · Gastrocnemio' },
  { id: 'pm', name: 'Press Militar', type: 'weight', category: 'upper', muscles: 'Hombros · Triceps' },
  { id: 'plank', name: 'Plancha', type: 'time_reps', category: 'core', muscles: 'Core · Abdomen' },
  { id: 'box', name: 'Box Jump', type: 'reps', category: 'power', muscles: 'Cuadriceps · Gluteos' },
  { id: 'sj', name: 'Salto Vertical', type: 'reps', category: 'power', muscles: 'Gemelos · Gluteos' },
];

const SYNTHETIC_CUSTOM_EXERCISES = [
  { id: 'custom_nordic', name: 'Nordic Hamstring', type: 'reps', category: 'posterior_chain', muscles: 'Isquios' },
  { id: 'custom_stepup_drive', name: 'Step-Up Drive', type: 'weight', category: 'unilateral', muscles: 'Gluteos · Cuadriceps' },
  { id: 'custom_copenhagens', name: 'Copenhagens', type: 'time_reps', category: 'core', muscles: 'Aductores · Core' },
  { id: 'custom_medball_rot', name: 'Med Ball Rotation Throw', type: 'reps', category: 'power', muscles: 'Core · Hombros' },
  { id: 'custom_sled_push', name: 'Sled Push', type: 'time_reps', category: 'power', muscles: 'Pierna completa' },
  { id: 'custom_tibialis_raise', name: 'Tibialis Raise', type: 'reps', category: 'prehab', muscles: 'Tibial anterior' },
];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

async function readJson(filePath, fallback = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function stableUuid(input) {
  const hex = crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function seededRatio(seed) {
  const hash = crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 8);
  return parseInt(hash, 16) / 0xffffffff;
}

function extJson(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map((item) => extJson(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, extJson(item)])
    );
  }
  return value;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAthletesFromState(appStorage, csvText) {
  const athletesFromState = safeArray(parseJsonString(appStorage.tf_athletes, []));
  if (athletesFromState.length) return athletesFromState;

  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]).map((item) => item.trim());
  const indexByHeader = Object.fromEntries(headers.map((header, index) => [header, index]));

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const pick = (key, fallback = '') => {
      const index = indexByHeader[key];
      return index == null ? fallback : (cols[index] ?? fallback);
    };
    return {
      id: pick('id'),
      name: pick('name'),
      group: pick('group', 'por-asignar'),
      groups: parseJsonString(pick('groups', '[]'), []),
      avatar: pick('avatar'),
      maxW: parseJsonString(pick('maxW', '{}'), {}),
      weekKms: parseJsonString(pick('weekKms', '[]'), []),
      todayDone: pick('todayDone', '0') === '1',
      competitions: parseJsonString(pick('competitions', '[]'), []),
      password: pick('password', ATHLETE_DEFAULT_PASSWORD),
      passwordChangedOnce: pick('passwordChangedOnce', '0') === '1',
    };
  }).filter((athlete) => athlete.id && athlete.name);
}

function buildAthletes(baseAthletes) {
  const targetGroups = ['1500m', '800m', 'pequeños'];
  return baseAthletes.map((athlete, index) => {
    const primaryGroup = targetGroups[index % targetGroups.length];
    const baseVolume = primaryGroup === '1500m' ? 78 : primaryGroup === '800m' ? 62 : 46;
    const ratio = seededRatio(`${athlete.id}:weights`);
    const maxW = {
      sq: clampInt(60 + index * 2 + ratio * 10, 55, 120),
      dl: clampInt(80 + index * 2 + ratio * 12, 70, 145),
      bp: clampInt(35 + index + ratio * 8, 30, 85),
      ht: clampInt(90 + index * 3 + ratio * 14, 80, 180),
      lp: clampInt(140 + index * 4 + ratio * 20, 120, 260),
      row: clampInt(40 + index + ratio * 8, 35, 85),
      rdl: clampInt(65 + index * 2 + ratio * 8, 55, 120),
      pm: clampInt(25 + index + ratio * 6, 22, 60),
    };
    const weekKms = [
      clampInt(baseVolume - 8 + seededRatio(`${athlete.id}:wk0`) * 6, 28, 90),
      clampInt(baseVolume - 3 + seededRatio(`${athlete.id}:wk1`) * 6, 30, 92),
      clampInt(baseVolume + seededRatio(`${athlete.id}:wk2`) * 7, 32, 95),
      clampInt(baseVolume - 5 + seededRatio(`${athlete.id}:wk3`) * 6, 28, 90),
      clampInt(baseVolume + 2 + seededRatio(`${athlete.id}:wk4`) * 5, 30, 96),
      clampInt(baseVolume - 1 + seededRatio(`${athlete.id}:wk5`) * 5, 30, 94),
    ];

    const competitions = uniqueBy([
      ...safeArray(athlete.competitions),
      ...(index % 3 === 0 ? [{
        id: `comp_${athlete.id}_spring`,
        name: primaryGroup === '1500m' ? 'Control 1500m' : primaryGroup === '800m' ? 'Meeting 800m' : 'Cross Escolar',
        dateIso: addDaysIso('2026-03-29', index % 5),
        notes: 'Competicion sintetica de seed',
      }] : []),
      ...(index % 5 === 0 ? [{
        id: `comp_${athlete.id}_summer`,
        name: primaryGroup === 'pequeños' ? 'Festival de Fondo' : 'Campeonato Catalan',
        dateIso: addDaysIso('2026-05-10', index % 7),
        notes: 'Objetivo de temporada',
      }] : []),
    ], (competition) => String(competition?.id || '').trim());

    return {
      ...athlete,
      group: primaryGroup,
      groups: [primaryGroup],
      avatar: athlete.avatar || String(athlete.name || '').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      maxW,
      weekKms,
      todayDone: index % 4 !== 0,
      competitions,
      password: athlete.password || ATHLETE_DEFAULT_PASSWORD,
      passwordChangedOnce: !!athlete.passwordChangedOnce,
      timezone: 'Europe/Madrid',
      syntheticSeed: true,
    };
  });
}

function buildUsersCsv(athletes) {
  const lines = [DEFAULT_USERS_CSV_HEADER];
  safeArray(athletes).forEach((athlete) => {
    const values = [
      athlete.id,
      athlete.name,
      athlete.group,
      JSON.stringify(safeArray(athlete.groups)),
      athlete.avatar || '',
      JSON.stringify(athlete.maxW || {}),
      JSON.stringify(safeArray(athlete.weekKms)),
      athlete.todayDone ? '1' : '0',
      JSON.stringify(safeArray(athlete.competitions)),
      athlete.password || ATHLETE_DEFAULT_PASSWORD,
      athlete.passwordChangedOnce ? '1' : '0',
    ].map((value) => {
      const safe = String(value ?? '');
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    });
    lines.push(values.join(','));
  });
  return `${lines.join('\n')}\n`;
}

function buildSeasons(existingSeasons) {
  const seasons = safeArray(existingSeasons).map((season) => ({ ...season }));
  const currentExists = seasons.some((season) => String(season?.id || '') === '25/26');
  if (!currentExists) {
    seasons.push({
      id: '25/26',
      label: 'Temporada 25/26',
      weekOneStartIso: '2025-09-15',
      startedAt: '2025-09-15T08:00:00.000Z',
      finalizedAt: null,
      archived: null,
    });
  }
  if (!seasons.some((season) => String(season?.id || '') === '24/25')) {
    seasons.unshift({
      id: '24/25',
      label: 'Temporada 24/25',
      weekOneStartIso: '2024-09-16',
      startedAt: '2024-09-16T08:00:00.000Z',
      finalizedAt: '2025-07-20T12:00:00.000Z',
      archived: { summary: 'Temporada archivada sintetica' },
    });
  }
  if (!seasons.some((season) => String(season?.id || '') === '26/27')) {
    seasons.push({
      id: '26/27',
      label: 'Temporada 26/27',
      weekOneStartIso: '2026-09-14',
      startedAt: null,
      finalizedAt: null,
      archived: null,
    });
  }
  return seasons;
}

function buildWeekPlans(appStorage, trainings) {
  const parsedPlans = parseJsonString(appStorage.tf_week_plans, {});
  const currentWeek = parseJsonString(appStorage.tf_week, null);
  const template = deepClone(
    parsedPlans?.['26']
    || currentWeek
    || {
      id: 'week_base',
      name: 'Semana 26',
      type: 'Inicial',
      targetGroup: 'all',
      weekNumber: 26,
      startDate: '2026-03-09',
      endDate: '2026-03-15',
      days: [],
    }
  );
  const types = ['Volumen', 'Inicial', 'Competitiva', 'Inicial', 'Volumen', 'Competitiva'];
  const trainingByName = new Map(safeArray(trainings).map((training) => [String(training.name || '').trim(), training]));
  const labels = [
    ['Rodaje Z2 continuo', 'Tecnica de carrera'],
    ['Fartlek suave', 'Movilidad y estiramiento'],
    ['Series 400m', 'Rodaje regenerativo'],
    ['Umbral aerobico continuo', 'Series 1000m extensivo'],
    ['Rodaje largo Z2', 'Drills tecnicos'],
    ['Competicion', 'Descanso activo'],
  ];

  const plans = {};
  for (let offset = -3; offset <= 2; offset += 1) {
    const weekNumber = 26 + offset;
    const startDate = addDaysIso('2026-03-09', offset * 7);
    const endDate = addDaysIso(startDate, 6);
    const plan = deepClone(template);
    plan.id = `week_${weekNumber}`;
    plan.name = `Semana ${weekNumber}`;
    plan.weekNumber = weekNumber;
    plan.type = types[(offset + 3) % types.length];
    plan.startDate = startDate;
    plan.endDate = endDate;
    plan.published = weekNumber <= 26;
    plan.publishedAt = plan.published ? `${startDate}T08:00:00.000Z` : null;
    plan.updatedAt = `${startDate}T06:00:00.000Z`;
    plan.isEditingPublished = false;
    plan.publishedVersion = plan.published ? 1 : null;
    plan.days = safeArray(plan.days).map((day, dayIndex) => {
      const nextDay = deepClone(day);
      const [amLabel, pmLabel] = labels[dayIndex % labels.length];
      if (dayIndex === 0 && trainingByName.has(amLabel)) nextDay.am = amLabel;
      if (dayIndex === 2 && trainingByName.has(pmLabel)) nextDay.pm = pmLabel;
      nextDay.dateIso = addDaysIso(startDate, dayIndex);
      return nextDay;
    });
    plans[String(weekNumber)] = plan;
  }
  return plans;
}

function createAthleteNotifications(athletes) {
  const createdAt = '2026-03-14T22:35:42.613Z';
  return Object.fromEntries(
    athletes.map((athlete, index) => [
      athlete.id,
      [
        {
          id: `notif_${athlete.id}_week_26`,
          title: 'Semana 26 publicada',
          message: 'Tu nueva semana ya esta publicada y disponible en calendario.',
          createdAt,
          weekNumber: 26,
        },
        ...(index % 2 === 0 ? [{
          id: `notif_${athlete.id}_jogatina`,
          title: 'Jogatina activa',
          message: 'Tu grupo tiene una apuesta abierta para el entreno de hoy.',
          createdAt: '2026-03-17T08:15:00.000Z',
          weekNumber: 27,
        }] : []),
      ],
    ])
  );
}

function createHistoryRows(athletes, weekPlans) {
  const rows = [];
  const relevantWeeks = Object.values(weekPlans)
    .filter((plan) => Number(plan.weekNumber || 0) >= 24 && Number(plan.weekNumber || 0) <= 26);

  for (const athlete of athletes) {
    for (const week of relevantWeeks) {
      for (let dayIndex = 0; dayIndex < safeArray(week.days).length; dayIndex += 1) {
        const day = week.days[dayIndex];
        const dateIso = String(day?.dateIso || addDaysIso(week.startDate, dayIndex));
        if (dateIso > '2026-03-17') continue;
        const plannedAm = slotSessionsFromDay(day, 'am').filter((session) => sessionVisibleForAthlete(session, day, athlete)).length > 0;
        const plannedPm = slotSessionsFromDay(day, 'pm').filter((session) => sessionVisibleForAthlete(session, day, athlete)).length > 0;
        const plannedGym = !!day?.gym;
        if (!plannedAm && !plannedPm && !plannedGym) continue;

        const ratio = seededRatio(`${athlete.id}:${dateIso}:history`);
        const amDone = plannedAm ? ratio < 0.7 : false;
        const pmDone = plannedPm ? ratio < 0.55 : false;
        const gymDone = plannedGym ? ratio < 0.45 : false;
        const completed = [amDone, pmDone, gymDone].filter(Boolean).length >= [plannedAm, plannedPm, plannedGym].filter(Boolean).length;

        if (!amDone && !pmDone && !gymDone) continue;
        rows.push({
          id: `${dateIso}_${athlete.id}`,
          athleteId: athlete.id,
          athlete: athlete.name,
          group: athlete.group,
          groups: athlete.groups,
          dateIso,
          dateLabel: dateIso,
          time: '19:00',
          am: String(day?.am || ''),
          pm: String(day?.pm || ''),
          gym: plannedGym,
          amDone,
          pmDone,
          gymDone,
          completed,
        });
      }
    }
  }
  return rows;
}

function buildAppState(appStorage, athletes, seasons, weekPlans, trainings, routines) {
  const athleteNotifications = createAthleteNotifications(athletes);
  const history = createHistoryRows(athletes, weekPlans);
  const groups = ['por-asignar', '1500m', '800m', 'pequeños'];
  const customExercises = SYNTHETIC_CUSTOM_EXERCISES.map((exercise, index) => ({
    ...exercise,
    position: index,
    defaultPrescription: exercise.type === 'weight'
      ? { sets: 3, reps: 6, pct: 65, duration: 0 }
      : exercise.type === 'time_reps'
        ? { sets: 3, reps: 1, pct: 0, duration: 20 }
        : { sets: 3, reps: 10, pct: 0, duration: 0 },
  }));
  const currentWeek = weekPlans['26'];

  return {
    tf_exercise_images: {},
    tf_seasons: seasons,
    tf_current_season_id: '25/26',
    tf_week_plans: weekPlans,
    tf_active_week_number: 26,
    tf_week: currentWeek,
    tf_trainings: trainings,
    tf_history: history,
    tf_calendar_weeks: safeArray(parseJsonString(appStorage.tf_calendar_weeks, [])),
    tf_athletes: athletes.map(({ syntheticSeed, timezone, ...athlete }) => athlete),
    tf_groups: groups,
    tf_routines: routines,
    tf_notifs: [
      {
        id: 'coach_notif_publish_26',
        title: 'Semana 26 publicada',
        message: 'El plan semanal actual ya esta visible para todos los atletas.',
        createdAt: '2026-03-14T22:35:42.613Z',
      },
    ],
    tf_season_week_one_start: '2025-09-15',
    tf_seed_meta: {
      kind: 'synthetic-mega-seed',
      generatedAt: new Date().toISOString(),
      sourceKeys: Object.keys(appStorage).sort(),
    },
    tf_user: null,
    tf_custom_exercises: customExercises,
    tf_athlete_notifs: athleteNotifications,
  };
}

async function buildUsersCollection(athletes, now) {
  const hashes = await Promise.all([
    hashPassword(COACH_PASSWORD),
    ...athletes.map((athlete) => hashPassword(athlete.password || ATHLETE_DEFAULT_PASSWORD)),
  ]);
  const [coachHash, ...athleteHashes] = hashes;
  const users = [
    {
      _id: `coach:${COACH_ID}`,
      coachId: COACH_ID,
      role: 'coach',
      athleteId: null,
      usernameLower: normalizeGroupName(COACH_NAME),
      emailLower: COACH_EMAIL.toLowerCase(),
      passwordHash: coachHash,
      isActive: true,
      updatedAt: now,
      createdAt: now,
    },
  ];

  athletes.forEach((athlete, index) => {
    users.push({
      _id: `athlete:${COACH_ID}:${athlete.id}`,
      coachId: COACH_ID,
      role: 'athlete',
      athleteId: athlete.id,
      usernameLower: normalizeGroupName(athlete.name),
      emailLower: null,
      passwordHash: athleteHashes[index],
      isActive: true,
      updatedAt: now,
      createdAt: now,
    });
  });

  return users;
}

function buildGroupsCollection(groups, now) {
  return groups.map((name, index) => ({
    _id: `${COACH_ID}:${slugify(name)}`,
    coachId: COACH_ID,
    name,
    slug: slugify(name),
    position: index,
    isActive: true,
    updatedAt: now,
    createdAt: now,
  }));
}

function buildAthletesCollection(athletes, now) {
  return athletes.map((athlete) => ({
    _id: `${COACH_ID}:${athlete.id}`,
    coachId: COACH_ID,
    athleteId: athlete.id,
    name: athlete.name,
    nameLower: normalizeGroupName(athlete.name),
    primaryGroupSlug: slugify(athlete.group),
    groupSlugs: athlete.groups.map((group) => slugify(group)),
    avatar: athlete.avatar,
    maxWeights: athlete.maxW,
    weekKms: athlete.weekKms,
    todayDone: athlete.todayDone,
    timezone: athlete.timezone,
    isActive: true,
    updatedAt: now,
    createdAt: now,
  }));
}

function buildGymExercisesCollection(customExercises, now) {
  const builtins = BUILTIN_GYM_EXERCISES.map((exercise, index) => ({
    _id: `${COACH_ID}:builtin:${exercise.id}`,
    coachId: COACH_ID,
    exerciseId: exercise.id,
    name: exercise.name,
    type: exercise.type,
    category: exercise.category,
    muscles: exercise.muscles,
    imageUrl: null,
    defaultPrescription: {},
    position: index,
    source: 'builtin',
    isActive: true,
    updatedAt: now,
    createdAt: now,
  }));

  const customs = customExercises.map((exercise, index) => ({
    _id: `${COACH_ID}:${exercise.id}`,
    coachId: COACH_ID,
    exerciseId: exercise.id,
    name: exercise.name,
    type: exercise.type,
    category: exercise.category,
    muscles: exercise.muscles,
    imageUrl: null,
    defaultPrescription: exercise.defaultPrescription || {},
    position: BUILTIN_GYM_EXERCISES.length + index,
    source: 'custom',
    isActive: true,
    updatedAt: now,
    createdAt: now,
  }));

  return [...builtins, ...customs];
}

function buildTrainingsCollection(trainings, now) {
  return trainings.map((training) => ({
    _id: `${COACH_ID}:${training.id}`,
    coachId: COACH_ID,
    trainingId: training.id,
    name: training.name,
    description: training.description,
    weekTypes: safeArray(training.weekTypes),
    kms: {
      total: Number(training?.zones?.regen || 0)
        + Number(training?.zones?.ua || 0)
        + Number(training?.zones?.uan || 0)
        + Number(training?.zones?.anae || 0),
      regen: Number(training?.zones?.regen || 0),
      ua: Number(training?.zones?.ua || 0),
      uan: Number(training?.zones?.uan || 0),
      anae: Number(training?.zones?.anae || 0),
    },
    source: training.source || 'dataset',
    isActive: true,
    updatedAt: now,
    createdAt: now,
  }));
}

function buildSeasonsCollection(seasons, now) {
  return seasons.map((season) => ({
    _id: `${COACH_ID}:${season.id}`,
    coachId: COACH_ID,
    seasonId: season.id,
    label: season.label || season.id,
    weekOneStartIso: season.weekOneStartIso,
    startedAt: season.startedAt ? new Date(season.startedAt) : null,
    finalizedAt: season.finalizedAt ? new Date(season.finalizedAt) : null,
    isLocked: !!season.finalizedAt,
    archived: season.archived || null,
    updatedAt: now,
    createdAt: now,
  }));
}

function buildWeekPlansCollection(weekPlans, seasonId, now) {
  return Object.values(weekPlans).map((week) => ({
    _id: `${COACH_ID}:${seasonId}:${week.weekNumber}`,
    coachId: COACH_ID,
    seasonId,
    weekNumber: Number(week.weekNumber),
    startDateIso: week.startDate,
    endDateIso: week.endDate,
    status: week.published ? 'published' : 'draft',
    publishedAt: week.publishedAt ? new Date(week.publishedAt) : null,
    days: safeArray(week.days).map((day) => ({ ...day })),
    raw: deepClone(week),
    updatedAt: week.updatedAt ? new Date(week.updatedAt) : now,
    createdAt: now,
  }));
}

function buildDayPlansAndStatus(athletesCollection, weekPlansCollection, now) {
  const dayPlans = [];
  const dayStatus = [];

  for (const week of weekPlansCollection) {
    const athleteLookupRows = athletesCollection.map((athlete) => ({
      athleteId: athlete.athleteId,
      groupSlugs: athlete.groupSlugs,
    }));
    for (let dayIndex = 0; dayIndex < safeArray(week.days).length; dayIndex += 1) {
      const day = week.days[dayIndex];
      const dateIso = String(day?.dateIso || addDaysIso(week.startDateIso, dayIndex));
      for (const athlete of athleteLookupRows) {
        const athleteVisibility = {
          athleteId: athlete.athleteId,
          groupSlugs: athlete.groupSlugs,
        };
        const amSessions = slotSessionsFromDay(day, 'am').filter((session) => sessionVisibleForAthlete(session, day, athleteVisibility));
        const pmSessions = slotSessionsFromDay(day, 'pm').filter((session) => sessionVisibleForAthlete(session, day, athleteVisibility));
        const gymPlanned = !!day?.gym;
        const plannedSlotsCount = Number(amSessions.length > 0) + Number(pmSessions.length > 0) + Number(gymPlanned);

        const planId = `${COACH_ID}:${athlete.athleteId}:${dateIso}`;
        dayPlans.push({
          _id: planId,
          coachId: COACH_ID,
          athleteId: athlete.athleteId,
          dateIso,
          weekPlanId: week._id,
          weekNumber: week.weekNumber,
          slots: {
            am: { planned: amSessions.length > 0, count: amSessions.length },
            pm: { planned: pmSessions.length > 0, count: pmSessions.length },
            gym: { planned: gymPlanned, count: gymPlanned ? 1 : 0 },
          },
          plannedSlotsCount,
          hasPlannedWork: plannedSlotsCount > 0,
          updatedAt: now,
          createdAt: now,
        });

        let amDone = false;
        let pmDone = false;
        let gymDone = false;
        if (dateIso <= '2026-03-17' && plannedSlotsCount > 0) {
          const ratio = seededRatio(`${athlete.athleteId}:${dateIso}:status`);
          if (ratio < 0.45) {
            amDone = amSessions.length > 0;
            pmDone = pmSessions.length > 0;
            gymDone = gymPlanned;
          } else if (ratio < 0.75) {
            amDone = amSessions.length > 0;
            pmDone = pmSessions.length > 0 && seededRatio(`${athlete.athleteId}:${dateIso}:pm`) < 0.5;
            gymDone = gymPlanned && seededRatio(`${athlete.athleteId}:${dateIso}:gym`) < 0.35;
          }
        }
        const doneSlotsCount = Number(amDone) + Number(pmDone) + Number(gymDone);
        dayStatus.push({
          _id: planId,
          coachId: COACH_ID,
          athleteId: athlete.athleteId,
          dateIso,
          plannedSlotsCount,
          amDone,
          pmDone,
          gymDone,
          doneSlotsCount,
          colorStatus: buildAthleteDayStatusColor({ dateIso, plannedSlotsCount, doneSlotsCount }),
          updatedBy: athlete.athleteId,
          updatedAt: now,
          createdAt: now,
        });
      }
    }
  }

  return { dayPlans, dayStatus };
}

function buildCompetitionsCollection(athletes, now) {
  const competitions = [];
  athletes.forEach((athlete) => {
    safeArray(athlete.competitions).forEach((competition, index) => {
      competitions.push({
        _id: `${COACH_ID}:${athlete.id}:${competition.id || `${competition.dateIso}_${index}`}`,
        coachId: COACH_ID,
        athleteId: athlete.id,
        dateIso: competition.dateIso,
        name: competition.name || 'Competicion',
        notes: competition.notes || null,
        createdBy: athlete.id,
        updatedAt: now,
        createdAt: now,
      });
    });
  });
  return competitions;
}

function buildJogatinaData(athletes, dayStatusRows, seasonKey, now) {
  const playableGroups = ['1500m', '800m', 'pequeños'];
  const groupCodeBySlug = { '1500m': '15001', '800m': '80001', 'pequeños': '33001' };

  const jogGroups = playableGroups.map((groupSlug) => {
    const members = athletes.filter((athlete) => athlete.group === groupSlug);
    return {
      _id: `jog_group_${slugify(groupSlug)}`,
      coachId: COACH_ID,
      code5: groupCodeBySlug[groupSlug],
      ownerAthleteId: members[0]?.id || null,
      name: `Jogatina ${groupSlug}`,
      openBetLimit: 3,
      createdAt: now,
      updatedAt: now,
      groupSlug,
      memberIds: members.map((member) => member.id),
    };
  });

  const memberships = jogGroups.flatMap((group) => group.memberIds.map((athleteId, index) => ({
    _id: athleteId,
    coachId: COACH_ID,
    athleteId,
    groupId: group._id,
    joinedAt: new Date(now.getTime() - (index + 1) * 86400000),
    createdAt: now,
    updatedAt: now,
  })));

  const completedRowsByAthlete = new Map();
  dayStatusRows.forEach((row) => {
    if (Number(row.plannedSlotsCount || 0) <= 0) return;
    if (Number(row.doneSlotsCount || 0) < Number(row.plannedSlotsCount || 0)) return;
    if (!completedRowsByAthlete.has(row.athleteId)) completedRowsByAthlete.set(row.athleteId, []);
    completedRowsByAthlete.get(row.athleteId).push(row);
  });

  const dailyBonusClaims = [];
  const ledger = [];
  const walletPoints = new Map();

  athletes.forEach((athlete) => {
    walletPoints.set(athlete.id, 1000);
    const membership = memberships.find((item) => item.athleteId === athlete.id);
    ledger.push({
      _id: `jog_ledger_join_${athlete.id}`,
      coachId: COACH_ID,
      athleteId: athlete.id,
      groupId: membership?.groupId || null,
      seasonKey,
      delta: 1000,
      reason: 'season_first_join',
      refId: membership?.groupId || athlete.id,
      meta: null,
      createdAt: new Date(now.getTime() - 7 * 86400000),
    });

    const claims = safeArray(completedRowsByAthlete.get(athlete.id)).slice(0, 2);
    claims.forEach((claim, claimIndex) => {
      dailyBonusClaims.push({
        _id: `${athlete.id}::${claim.dateIso}`,
        coachId: COACH_ID,
        athleteId: athlete.id,
        localDate: claim.dateIso,
        source: 'synthetic_seed',
        createdAt: new Date(now.getTime() - (claimIndex + 1) * 3600000),
      });
      walletPoints.set(athlete.id, walletPoints.get(athlete.id) + 50);
      ledger.push({
        _id: `jog_ledger_bonus_${athlete.id}_${claim.dateIso}`,
        coachId: COACH_ID,
        athleteId: athlete.id,
        groupId: membership?.groupId || null,
        seasonKey,
        delta: 50,
        reason: 'daily_bonus',
        refId: `${athlete.id}::${claim.dateIso}`,
        meta: { localDate: claim.dateIso },
        createdAt: new Date(`${claim.dateIso}T20:00:00.000Z`),
      });
    });
  });

  const betsOpen = [];
  const wagersOpen = [];
  const carryover = [
    {
      _id: 'jog_group_800m',
      coachId: COACH_ID,
      groupId: 'jog_group_800m',
      amount: 120,
      createdAt: now,
      updatedAt: now,
    },
  ];

  jogGroups.forEach((group, index) => {
    const baseClose = new Date(now.getTime() + (index === 0 ? 6 : index === 1 ? -2 : -4) * 3600000);
    const betId = `jog_bet_${group.groupSlug}`;
    const status = index === 0 ? 'open' : index === 1 ? 'closed' : 'resolved_pending_final';
    const winners = index === 2 ? [group.memberIds[0]].filter(Boolean) : [];
    betsOpen.push({
      _id: betId,
      coachId: COACH_ID,
      groupId: group._id,
      creatorAthleteId: group.ownerAthleteId,
      questionText: index === 0
        ? 'Quien hara mejor tiempo en el entreno de hoy?'
        : index === 1
          ? 'Quien tendra las pulsaciones mas altas en la sesion?'
          : 'Quien acabara mas fresco el bloque de gym?',
      closeAt: baseClose,
      resolveDeadlineAt: new Date(baseClose.getTime() + 3 * 3600000),
      carryoverIn: index === 2 ? 50 : 0,
      status,
      winnerAthleteIds: winners,
      resolvedAt: index === 2 ? new Date(now.getTime() - 2 * 60000) : null,
      resolvedEditableUntil: index === 2 ? new Date(now.getTime() + 3 * 60000) : null,
      createdAt: new Date(now.getTime() - (index + 1) * 3600000),
      updatedAt: now,
    });

    group.memberIds.slice(0, Math.min(group.memberIds.length, 5)).forEach((athleteId, memberIndex) => {
      const pickedAthleteId = group.memberIds[(memberIndex + index + 1) % group.memberIds.length];
      const stake = 20 + memberIndex * 10 + index * 5;
      wagersOpen.push({
        _id: `${betId}::${athleteId}`,
        coachId: COACH_ID,
        groupId: group._id,
        betId,
        athleteId,
        pickedAthleteId,
        stake,
        createdAt: new Date(now.getTime() - (memberIndex + 1) * 1800000),
        updatedAt: new Date(now.getTime() - (memberIndex + 1) * 1200000),
      });
      walletPoints.set(athleteId, walletPoints.get(athleteId) - stake);
      ledger.push({
        _id: `jog_ledger_wager_${betId}_${athleteId}`,
        coachId: COACH_ID,
        athleteId,
        groupId: group._id,
        seasonKey,
        delta: -stake,
        reason: 'bet_wager_place',
        refId: betId,
        meta: { pickedAthleteId },
        createdAt: new Date(now.getTime() - (memberIndex + 1) * 1800000),
      });
    });
  });

  const wallets = athletes.map((athlete) => ({
    _id: `${athlete.id}::${seasonKey}`,
    coachId: COACH_ID,
    athleteId: athlete.id,
    seasonKey,
    points: walletPoints.get(athlete.id),
    joinCount: 1,
    lastBetActivityAt: wagersOpen.find((wager) => wager.athleteId === athlete.id)?.updatedAt || null,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    jogatina_groups: jogGroups.map(({ groupSlug, memberIds, ...group }) => group),
    jogatina_memberships: memberships,
    jogatina_wallets: wallets,
    jogatina_bets_open: betsOpen,
    jogatina_wagers_open: wagersOpen,
    jogatina_group_carryover: carryover,
    jogatina_daily_bonus_claims: dailyBonusClaims,
    jogatina_ledger: ledger,
  };
}

function buildStateCacheCollection(appState, now) {
  const keys = Object.keys(appState).sort();
  return keys.map((key, index) => ({
    _id: `${COACH_ID}:${key}`,
    coachId: COACH_ID,
    key,
    valueJsonString: toStoredString(appState[key]),
    syncVersion: index + 1,
    updatedAt: now,
    updatedBy: 'synthetic_seed_generator',
    createdAt: now,
  }));
}

function buildSyncCountersCollection(stateCache) {
  return [
    {
      _id: `coach:${COACH_ID}`,
      coachId: COACH_ID,
      value: stateCache.length,
      updatedAt: new Date(),
    },
  ];
}

function inferBsonType(value) {
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function mergeSchemas(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return existing;
  const existingAny = safeArray(existing.anyOf);
  const incomingAny = safeArray(incoming.anyOf);
  const variants = [...(existingAny.length ? existingAny : [existing]), ...(incomingAny.length ? incomingAny : [incoming])];
  return { anyOf: uniqueBy(variants, (variant) => JSON.stringify(variant)) };
}

function inferSchema(values) {
  const presentValues = values.filter((value) => value !== undefined && value !== null);
  if (!presentValues.length) return { bsonType: 'string' };
  const types = uniqueBy(presentValues.map((value) => inferBsonType(value)), (type) => type);
  if (types.length > 1) {
    return {
      anyOf: types.map((type) => inferSchema(presentValues.filter((value) => inferBsonType(value) === type))),
    };
  }

  const type = types[0];
  if (type === 'object') {
    const propertyKeys = uniqueBy(presentValues.flatMap((value) => Object.keys(value || {})), (key) => key);
    const properties = {};
    propertyKeys.forEach((key) => {
      properties[key] = inferSchema(presentValues.map((value) => value?.[key]));
    });
    return { bsonType: 'object', properties };
  }
  if (type === 'array') {
    const items = presentValues.flatMap((value) => safeArray(value));
    return items.length ? { bsonType: 'array', items: inferSchema(items) } : { bsonType: 'array' };
  }
  return { bsonType: type };
}

function makeRelationship(fromNs, fromField, fromCardinality, toNs, toField, toCardinality, note = '') {
  return {
    id: stableUuid(`${fromNs}:${fromField}:${toNs}:${toField}`),
    relationship: [
      {
        ns: fromNs,
        cardinality: fromCardinality,
        fields: [fromField],
      },
      {
        ns: toNs,
        cardinality: toCardinality,
        fields: [toField],
      },
    ],
    isInferred: false,
    note,
  };
}

function buildMdm(collections) {
  const collectionNames = Object.keys(collections);
  const diagramCollections = collectionNames.map((collectionName, index) => ({
    ns: `${DATABASE_NAME}.${collectionName}`,
    fieldData: inferSchema(collections[collectionName]).bsonType === 'object'
      ? inferSchema(collections[collectionName])
      : { bsonType: 'object', properties: {} },
    indexes: [
      {
        name: '_id_',
        key: { _id: 1 },
        unique: true,
      },
    ],
    displayPosition: [(index % 5) * 420, Math.floor(index / 5) * 300],
    note: `Synthetic seed collection (${collections[collectionName].length} docs)`,
  }));

  const relationships = [
    makeRelationship(`${DATABASE_NAME}.users`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1, 'Athlete login user'),
    makeRelationship(`${DATABASE_NAME}.athletes`, 'primaryGroupSlug', 100, `${DATABASE_NAME}.groups`, 'slug', 1, 'Athlete primary training group'),
    makeRelationship(`${DATABASE_NAME}.week_plans`, 'seasonId', 100, `${DATABASE_NAME}.seasons`, 'seasonId', 1),
    makeRelationship(`${DATABASE_NAME}.athlete_day_plans`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.athlete_day_plans`, 'weekPlanId', 100, `${DATABASE_NAME}.week_plans`, '_id', 1),
    makeRelationship(`${DATABASE_NAME}.athlete_day_status`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.competitions`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_memberships`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_memberships`, 'groupId', 100, `${DATABASE_NAME}.jogatina_groups`, '_id', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_wallets`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_bets_open`, 'groupId', 100, `${DATABASE_NAME}.jogatina_groups`, '_id', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_bets_open`, 'creatorAthleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_wagers_open`, 'betId', 100, `${DATABASE_NAME}.jogatina_bets_open`, '_id', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_wagers_open`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_wagers_open`, 'pickedAthleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_group_carryover`, 'groupId', 1, `${DATABASE_NAME}.jogatina_groups`, '_id', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_daily_bonus_claims`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_ledger`, 'athleteId', 100, `${DATABASE_NAME}.athletes`, 'athleteId', 1),
    makeRelationship(`${DATABASE_NAME}.jogatina_ledger`, 'groupId', 100, `${DATABASE_NAME}.jogatina_groups`, '_id', 1),
  ];

  const edits = [
    {
      id: stableUuid('trackflow:setmodel'),
      timestamp: new Date().toISOString(),
      type: 'SetModel',
      model: {
        collections: diagramCollections,
        relationships,
      },
    },
  ];

  return {
    type: 'Compass Data Modeling Diagram',
    version: 1,
    name: 'TrackFlow Data Model',
    database: DATABASE_NAME,
    edits: Buffer.from(JSON.stringify(edits)).toString('base64'),
  };
}

async function main() {
  const [appStorage, usersCsv] = await Promise.all([
    readJson(APP_STORAGE_PATH, {}),
    readText(USERS_CSV_PATH, ''),
  ]);

  const baseAthletes = normalizeAthletesFromState(appStorage, usersCsv);
  const athletes = buildAthletes(baseAthletes);
  const seasons = buildSeasons(parseJsonString(appStorage.tf_seasons, []));
  const trainings = safeArray(parseJsonString(appStorage.tf_trainings, []));
  const routines = uniqueBy([
    ...safeArray(parseJsonString(appStorage.tf_routines, [])),
    {
      id: 'rt_speed_support',
      name: 'Speed Support',
      targetGroup: '800m',
      exercises: [
        { exId: 'custom_sled_push', name: 'Sled Push', sets: 4, reps: 1, pct: 0, type: 'time_reps', duration: 18, imageUrl: null },
        { exId: 'box', name: 'Box Jump', sets: 4, reps: 6, pct: 0, type: 'reps', duration: 0, imageUrl: null },
        { exId: 'custom_medball_rot', name: 'Med Ball Rotation Throw', sets: 4, reps: 8, pct: 0, type: 'reps', duration: 0, imageUrl: null },
      ],
    },
    {
      id: 'rt_injury_prevention',
      name: 'Injury Prevention',
      targetGroup: 'all',
      exercises: [
        { exId: 'custom_nordic', name: 'Nordic Hamstring', sets: 3, reps: 6, pct: 0, type: 'reps', duration: 0, imageUrl: null },
        { exId: 'custom_tibialis_raise', name: 'Tibialis Raise', sets: 3, reps: 15, pct: 0, type: 'reps', duration: 0, imageUrl: null },
        { exId: 'custom_copenhagens', name: 'Copenhagens', sets: 3, reps: 1, pct: 0, type: 'time_reps', duration: 20, imageUrl: null },
      ],
    },
  ], (routine) => String(routine?.id || '').trim());

  const weekPlans = buildWeekPlans(appStorage, trainings);
  const now = new Date();
  const usersCsvSeed = buildUsersCsv(athletes);
  const appState = buildAppState(appStorage, athletes, seasons, weekPlans, trainings, routines);
  appState.tf_users_csv = usersCsvSeed;

  const usersCollection = await buildUsersCollection(athletes, now);
  const groupsCollection = buildGroupsCollection(appState.tf_groups, now);
  const athletesCollection = buildAthletesCollection(athletes, now);
  const gymExercisesCollection = buildGymExercisesCollection(appState.tf_custom_exercises, now);
  const trainingsCollection = buildTrainingsCollection(trainings, now);
  const seasonsCollection = buildSeasonsCollection(seasons, now);
  const weekPlansCollection = buildWeekPlansCollection(weekPlans, '25/26', now);
  const { dayPlans, dayStatus } = buildDayPlansAndStatus(athletesCollection, weekPlansCollection, now);
  const competitionsCollection = buildCompetitionsCollection(athletes, now);
  const stateCacheCollection = buildStateCacheCollection(appState, now);
  const syncCountersCollection = buildSyncCountersCollection(stateCacheCollection);
  const jogatina = buildJogatinaData(athletes, dayStatus, '25/26', now);

  const collections = {
    users: usersCollection,
    groups: groupsCollection,
    athletes: athletesCollection,
    gym_exercises: gymExercisesCollection,
    trainings: trainingsCollection,
    seasons: seasonsCollection,
    week_plans: weekPlansCollection,
    athlete_day_plans: dayPlans,
    athlete_day_status: dayStatus,
    competitions: competitionsCollection,
    state_cache: stateCacheCollection,
    sync_counters: syncCountersCollection,
    ...jogatina,
  };

  const megaSeed = {
    type: 'TrackFlowMegaSeed',
    version: 1,
    database: DATABASE_NAME,
    coach: {
      coachId: COACH_ID,
      name: COACH_NAME,
      email: COACH_EMAIL,
    },
    generatedAt: new Date().toISOString(),
    notes: [
      'Base seed sintetico construido desde server/data/app_storage.json y users.csv',
      'Incluye colecciones Mongo proyectadas y datos de Jogatina',
      'Las fechas se exportan en Extended JSON para facilitar importacion',
    ],
    catalogs: {
      builtinGymExercises: BUILTIN_GYM_EXERCISES,
      customGymExercises: appState.tf_custom_exercises,
      trainings,
      routines,
    },
    appState,
    usersCsv: usersCsvSeed,
    counts: Object.fromEntries(Object.entries(collections).map(([key, docs]) => [key, docs.length])),
    collections: Object.fromEntries(
      Object.entries(collections).map(([key, docs]) => [key, docs.map((doc) => extJson(doc))])
    ),
  };

  const mdm = buildMdm(collections);

  await fs.mkdir(path.dirname(OUTPUT_SEED_PATH), { recursive: true });
  await fs.mkdir(path.dirname(OUTPUT_MDM_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_SEED_PATH, `${JSON.stringify(megaSeed, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUTPUT_MDM_PATH, `${JSON.stringify(mdm, null, 2)}\n`, 'utf8');

  console.log(`Mega seed generado: ${OUTPUT_SEED_PATH}`);
  console.log(`Diagrama MDM generado: ${OUTPUT_MDM_PATH}`);
  console.log(JSON.stringify(megaSeed.counts, null, 2));
}

main().catch((error) => {
  console.error('generate-mega-seed-and-diagram failed:', error?.message || error);
  process.exit(1);
});
