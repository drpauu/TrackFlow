import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getMongoClient } from '../server/src/storage/providers/mongo/client.js';
import { ensureIndexes } from '../server/src/storage/providers/mongo/projection.js';
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

const DATABASE_NAME = 'track-flow-db';
const COACH_ID = normalizeCoachId(process.env.DEFAULT_COACH_ID || 'coach_default');
const COACH_NAME = 'JuanCarlos';
const COACH_EMAIL = 'coach@trackflow.app';
const COACH_PASSWORD = '151346';
const ATHLETE_DEFAULT_PASSWORD = '1234';
const DEFAULT_USERS_CSV_HEADER = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions,password,passwordChangedOnce';

const APP_STORAGE_PATH = path.resolve(REPO_ROOT, 'server/data/app_storage.json');
const USERS_CSV_PATH = path.resolve(REPO_ROOT, 'server/data/users.csv');
const APP_STORAGE_SEED_PATH = path.resolve(REPO_ROOT, 'server/data/seeds/app_storage.seed.json');
const USERS_CSV_SEED_PATH = path.resolve(REPO_ROOT, 'server/data/seeds/users.seed.csv');

const BUILTIN_GYM_EXERCISES = [
  { id: 'sq', name: 'Sentadilla', type: 'weight', category: 'compound', muscles: 'Cuadriceps Â· Gluteos' },
  { id: 'dl', name: 'Peso Muerto', type: 'weight', category: 'compound', muscles: 'Isquios Â· Espalda' },
  { id: 'bp', name: 'Press Banca', type: 'weight', category: 'upper', muscles: 'Pecho Â· Triceps' },
  { id: 'ht', name: 'Hip Thrust', type: 'weight', category: 'compound', muscles: 'Gluteos Â· Isquios' },
  { id: 'lp', name: 'Prensa', type: 'weight', category: 'compound', muscles: 'Cuadriceps' },
  { id: 'row', name: 'Remo con Barra', type: 'weight', category: 'upper', muscles: 'Dorsal Â· Biceps' },
  { id: 'lunge', name: 'Zancadas', type: 'reps', category: 'unilateral', muscles: 'Cuadriceps Â· Gluteos' },
  { id: 'rdl', name: 'RDL', type: 'weight', category: 'compound', muscles: 'Isquios Â· Gluteos' },
  { id: 'calf', name: 'Gemelos', type: 'reps', category: 'isolation', muscles: 'Soleo Â· Gastrocnemio' },
  { id: 'pm', name: 'Press Militar', type: 'weight', category: 'upper', muscles: 'Hombros Â· Triceps' },
  { id: 'plank', name: 'Plancha', type: 'time_reps', category: 'core', muscles: 'Core Â· Abdomen' },
  { id: 'box', name: 'Box Jump', type: 'reps', category: 'power', muscles: 'Cuadriceps Â· Gluteos' },
  { id: 'sj', name: 'Salto Vertical', type: 'reps', category: 'power', muscles: 'Gemelos Â· Gluteos' },
];

const DEFAULT_TRAININGS = [
  { id: 'tr_run_regen', name: 'Rodaje regenerativo', description: 'Trote suave de recuperacion activa', weekTypes: ['Inicial', 'Competitiva', 'Volumen'], zones: { regen: 6, ua: 0, uan: 0, anae: 0 } },
  { id: 'tr_run_z2', name: 'Rodaje Z2 continuo', description: 'Carrera continua a ritmo aerobico', weekTypes: ['Inicial', 'Volumen'], zones: { regen: 2, ua: 8, uan: 0, anae: 0 } },
  { id: 'tr_run_z2_lng', name: 'Rodaje largo Z2', description: 'Tirada larga de 80-100 minutos', weekTypes: ['Inicial', 'Volumen'], zones: { regen: 4, ua: 14, uan: 0, anae: 0 } },
  { id: 'tr_fartlek_s', name: 'Fartlek suave', description: 'Cambios de ritmo a UA/UAN', weekTypes: ['Inicial', 'Volumen'], zones: { regen: 2, ua: 4, uan: 3, anae: 0 } },
  { id: 'tr_fartlek_f', name: 'Fartlek intenso', description: 'Cambios de ritmo a UAN/Anae', weekTypes: ['Competitiva', 'Volumen'], zones: { regen: 2, ua: 3, uan: 4, anae: 1 } },
  { id: 'tr_series_200', name: 'Series 200m', description: '6-10 series de 200m a ritmo de competicion', weekTypes: ['Competitiva'], zones: { regen: 2, ua: 1, uan: 2, anae: 3 } },
  { id: 'tr_series_400', name: 'Series 400m', description: '6-8 series de 400m a ritmo UAN/Anae', weekTypes: ['Inicial', 'Competitiva'], zones: { regen: 2, ua: 1, uan: 4, anae: 2 } },
  { id: 'tr_series_1k', name: 'Series 1000m extensivo', description: '8-10 series de 1000m a ritmo UA/UAN', weekTypes: ['Inicial', 'Volumen'], zones: { regen: 2, ua: 2, uan: 6, anae: 1 } },
  { id: 'tr_series_800', name: 'Series 800m', description: '4-6 series de 800m a ritmo UAN', weekTypes: ['Competitiva'], zones: { regen: 2, ua: 1, uan: 5, anae: 1 } },
  { id: 'tr_tecnica', name: 'Tecnica de carrera', description: 'Drills, ABC y skipping', weekTypes: ['Inicial', 'Competitiva'], zones: { regen: 2, ua: 0, uan: 0, anae: 0 } },
  { id: 'tr_precomp', name: 'Calentamiento precomp.', description: 'Calentamiento para competir', weekTypes: ['Competitiva'], zones: { regen: 2, ua: 1, uan: 1, anae: 0 } },
  { id: 'tr_competicion', name: 'Competicion', description: 'Carrera oficial o simulacion competitiva', weekTypes: ['Competitiva'], zones: { regen: 1, ua: 1, uan: 2, anae: 4 } },
  { id: 'tr_movilidad', name: 'Movilidad y estiramiento', description: 'Movilidad articular y flexibilidad', weekTypes: ['Inicial', 'Competitiva', 'Volumen'], zones: { regen: 0, ua: 0, uan: 0, anae: 0 } },
  { id: 'tr_pliometria', name: 'Pliometria', description: 'Saltos y trabajo explosivo', weekTypes: ['Inicial', 'Competitiva'], zones: { regen: 1, ua: 0, uan: 1, anae: 1 } },
  { id: 'tr_umbral', name: 'Umbral aerobico continuo', description: 'Carrera continua a ritmo de umbral aerobico', weekTypes: ['Inicial', 'Volumen'], zones: { regen: 1, ua: 10, uan: 1, anae: 0 } },
];

const DEFAULT_WEEK_DAYS = [
  { am: 'Rodaje 10km suave Z2', pm: 'Tecnica + 6x200m', targetGroup: 'all', gym: true, gymPlan: { mode: 'saved', routineId: 'rt_lower_strength_a' }, gymFocus: ['sq', 'ht', 'rdl', 'calf'] },
  { am: 'Descanso activo', pm: '', targetGroup: 'all', gym: false, gymPlan: null, gymFocus: [] },
  { am: 'Fartlek 8x1\' Z4', pm: 'Rodaje 8km recuperacion', targetGroup: 'all', gym: true, gymPlan: { mode: 'saved', routineId: 'rt_mixed_power_b' }, gymFocus: ['lp', 'lunge', 'rdl', 'pm'] },
  { am: '', pm: 'Series 4x1000m', targetGroup: 'all', gym: false, gymPlan: null, gymFocus: [] },
  { am: 'Rodaje 12km Z2', pm: 'Drills tecnicos', targetGroup: 'all', gym: true, gymPlan: { mode: 'saved', routineId: 'rt_full_body_c' }, gymFocus: ['sq', 'bp', 'row', 'calf'] },
  { am: 'Rodaje largo 18km', pm: '', targetGroup: 'all', gym: false, gymPlan: null, gymFocus: [] },
  { am: 'Descanso', pm: '', targetGroup: 'all', gym: false, gymPlan: null, gymFocus: [] },
];

const SYNTHETIC_CUSTOM_EXERCISES = [
  { id: 'custom_nordic', name: 'Nordic Hamstring', type: 'reps', category: 'posterior_chain', muscles: 'Isquios' },
  { id: 'custom_stepup_drive', name: 'Step-Up Drive', type: 'weight', category: 'unilateral', muscles: 'Gluteos Â· Cuadriceps' },
  { id: 'custom_copenhagens', name: 'Copenhagens', type: 'time_reps', category: 'core', muscles: 'Aductores Â· Core' },
  { id: 'custom_medball_rot', name: 'Med Ball Rotation Throw', type: 'reps', category: 'power', muscles: 'Core Â· Hombros' },
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

function parseStoredValue(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return parseJsonString(value, fallback);
  return value;
}

function normalizeAthletesFromState(appStorage, csvText) {
  const athletesFromState = safeArray(parseStoredValue(appStorage.tf_athletes, []));
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
  const targetGroups = ['1500m', '800m', 'pequeÃ±os'];
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
      {
        id: `comp_${athlete.id}_spring`,
        name: primaryGroup === '1500m' ? 'Control 1500m' : primaryGroup === '800m' ? 'Meeting 800m' : 'Cross Escolar',
        dateIso: addDaysIso('2026-03-12', (index * 2) % 16),
        notes: 'Competicion sintetica de marzo',
      },
      {
        id: `comp_${athlete.id}_block`,
        name: primaryGroup === 'peque?os' ? 'Festival de Fondo' : 'Control de bloque',
        dateIso: addDaysIso('2026-03-24', index % 7),
        notes: 'Control de seguimiento dentro del mes',
      },
      ...(index % 2 === 0 ? [{
        id: `comp_${athlete.id}_summer`,
        name: primaryGroup === 'peque?os' ? 'Encuentro Base' : 'Campeonato Catalan',
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
  const parsedPlans = parseStoredValue(appStorage.tf_week_plans, {});
  const currentWeek = parseStoredValue(appStorage.tf_week, null);
  const template = {
    id: 'week_base',
    name: 'Semana 28',
    type: 'Inicial',
    targetGroup: 'all',
    weekNumber: 28,
    startDate: '2026-03-23',
    endDate: '2026-03-29',
    days: deepClone(DEFAULT_WEEK_DAYS),
  };
  const typeByWeek = {
    24: 'Volumen',
    25: 'Inicial',
    26: 'Volumen',
    27: 'Competitiva',
    28: 'Inicial',
    29: 'Competitiva',
    30: 'Volumen',
  };
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
  for (let weekNumber = 24; weekNumber <= 30; weekNumber += 1) {
    const offset = weekNumber - 28;
    const startDate = addDaysIso('2026-03-23', offset * 7);
    const endDate = addDaysIso(startDate, 6);
    const plan = deepClone(template);
    plan.id = `week_${weekNumber}`;
    plan.name = `Semana ${weekNumber}`;
    plan.weekNumber = weekNumber;
    plan.type = typeByWeek[weekNumber] || 'Inicial';
    plan.startDate = startDate;
    plan.endDate = endDate;
    plan.published = weekNumber <= 29;
    plan.publishedAt = plan.published
      ? (weekNumber === 29 ? '2026-03-24T18:30:00.000Z' : `${startDate}T08:00:00.000Z`)
      : null;
    plan.updatedAt = `${startDate}T06:00:00.000Z`;
    plan.isEditingPublished = false;
    plan.publishedVersion = null;
    plan.days = safeArray(plan.days).map((day, dayIndex) => {
      const nextDay = deepClone(day);
      const [amLabel, pmLabel] = labels[dayIndex % labels.length];
      if (trainingByName.has(amLabel)) nextDay.am = amLabel;
      if (trainingByName.has(pmLabel)) nextDay.pm = pmLabel;
      nextDay.dateIso = addDaysIso(startDate, dayIndex);
      return nextDay;
    });
    plans[String(weekNumber)] = plan;
  }
  return plans;
}

function createAthleteNotifications(athletes) {
  const createdAt = '2026-03-25T08:00:00.000Z';
  return Object.fromEntries(
    athletes.map((athlete, index) => [
      athlete.id,
      [
        {
          id: `notif_${athlete.id}_week_28`,
          title: 'Semana 28 publicada',
          message: 'Tu semana activa ya esta publicada y disponible en calendario.',
          createdAt,
          weekNumber: 28,
        },
        ...(index % 2 === 0 ? [{
          id: `notif_${athlete.id}_jogatina`,
          title: 'Jogatina activa',
          message: 'Tu grupo tiene una apuesta abierta para el entreno de hoy.',
          createdAt: '2026-03-25T08:15:00.000Z',
          weekNumber: 28,
        }] : []),
        ...(index % 3 === 0 ? [{
          id: `notif_${athlete.id}_comp`,
          title: 'Competicion cercana',
          message: 'Tienes una competicion cargada en el calendario durante este bloque.',
          createdAt: '2026-03-25T08:30:00.000Z',
          weekNumber: null,
        }] : []),
      ],
    ])
  );
}

function createHistoryRows(athletes, weekPlans) {
  const rows = [];
  const relevantWeeks = Object.values(weekPlans)
    .filter((plan) => Number(plan.weekNumber || 0) >= 24 && Number(plan.weekNumber || 0) <= 29);

  for (const athlete of athletes) {
    for (const week of relevantWeeks) {
      for (let dayIndex = 0; dayIndex < safeArray(week.days).length; dayIndex += 1) {
        const day = week.days[dayIndex];
        const dateIso = String(day?.dateIso || addDaysIso(week.startDate, dayIndex));
        if (dateIso > '2026-03-25') continue;
        const plannedAm = slotSessionsFromDay(day, 'am').filter((session) => sessionVisibleForAthlete(session, day, athlete)).length > 0;
        const plannedPm = slotSessionsFromDay(day, 'pm').filter((session) => sessionVisibleForAthlete(session, day, athlete)).length > 0;
        const plannedGym = !!day?.gym;
        if (!plannedAm && !plannedPm && !plannedGym) continue;

        const ratio = seededRatio(`${athlete.id}:${dateIso}:history`);
        const amDone = plannedAm ? ratio < 0.78 : false;
        const pmDone = plannedPm ? ratio < 0.58 : false;
        const gymDone = plannedGym ? ratio < 0.42 : false;
        const completed = [amDone, pmDone, gymDone].filter(Boolean).length >= [plannedAm, plannedPm, plannedGym].filter(Boolean).length;

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
  const groups = ['por-asignar', '1500m', '800m', 'peque?os'];
  const customExercises = SYNTHETIC_CUSTOM_EXERCISES.map((exercise, index) => ({
    ...exercise,
    position: index,
    defaultPrescription: exercise.type === 'weight'
      ? { sets: 3, reps: 6, pct: 65, duration: 0 }
      : exercise.type === 'time_reps'
        ? { sets: 3, reps: 1, pct: 0, duration: 20 }
        : { sets: 3, reps: 10, pct: 0, duration: 0 },
  }));
  const currentWeek = weekPlans['28'];

  return {
    tf_exercise_images: {},
    tf_seasons: seasons,
    tf_current_season_id: '25/26',
    tf_week_plans: weekPlans,
    tf_active_week_number: 28,
    tf_week: currentWeek,
    tf_trainings: trainings,
    tf_history: history,
    tf_calendar_weeks: Object.values(weekPlans)
      .filter((week) => week?.published)
      .map((week) => ({
        id: week.id,
        weekNumber: week.weekNumber,
        name: week.name,
        type: week.type,
        startDate: week.startDate,
        endDate: week.endDate,
        published: !!week.published,
        publishedAt: week.publishedAt || null,
      })),
    tf_athletes: athletes.map(({ syntheticSeed, timezone, ...athlete }) => athlete),
    tf_groups: groups,
    tf_routines: routines,
    tf_notifs: [
      {
        id: 'coach_notif_publish_28',
        title: 'Semana 28 publicada',
        message: 'El plan semanal actual ya esta visible para todos los atletas.',
        createdAt: '2026-03-25T09:00:00.000Z',
      },
      {
        id: 'coach_notif_demo_marzo',
        title: 'Demo rico cargado',
        message: 'El entorno demo de marzo de 2026 se ha regenerado con datos densos.',
        createdAt: '2026-03-25T09:15:00.000Z',
      },
    ],
    tf_season_week_one_start: '2025-09-15',
    tf_seed_meta: {
      kind: 'rich-demo-seed',
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
  const groupSeeds = [
    { name: 'Recta Opuesta', code5: '27114', openBetLimit: 3 },
    { name: 'Curva Norte', code5: '31482', openBetLimit: 4 },
    { name: 'Pista 3', code5: '46015', openBetLimit: 3 },
    { name: 'Lobos del Tartan', code5: '52840', openBetLimit: 4 },
    { name: 'Ritmo Roto', code5: '69017', openBetLimit: 3 },
  ];
  const jogGroups = groupSeeds.map((seed, groupIndex) => {
    const members = athletes.filter((_, athleteIndex) => athleteIndex % groupSeeds.length === groupIndex);
    return {
      _id: `jog_group_${slugify(seed.name)}`,
      coachId: COACH_ID,
      code5: seed.code5,
      ownerAthleteId: members[0]?.id || null,
      name: seed.name,
      openBetLimit: seed.openBetLimit,
      createdAt: new Date(now.getTime() - (30 + groupIndex) * 86400000),
      updatedAt: now,
      memberIds: members.map((member) => member.id),
    };
  });

  const memberships = jogGroups.flatMap((group, groupIndex) => group.memberIds.map((athleteId, memberIndex) => ({
    _id: athleteId,
    coachId: COACH_ID,
    athleteId,
    groupId: group._id,
    joinedAt: new Date(now.getTime() - (18 + groupIndex * 3 + memberIndex) * 86400000),
    createdAt: now,
    updatedAt: now,
  })));

  const membershipByAthlete = new Map(memberships.map((row) => [row.athleteId, row]));
  const completedRowsByAthlete = new Map();
  dayStatusRows.forEach((row) => {
    if (String(row?.dateIso || '') > '2026-03-25') return;
    if (Number(row.plannedSlotsCount || 0) <= 0) return;
    if (Number(row.doneSlotsCount || 0) < Number(row.plannedSlotsCount || 0)) return;
    if (!completedRowsByAthlete.has(row.athleteId)) completedRowsByAthlete.set(row.athleteId, []);
    completedRowsByAthlete.get(row.athleteId).push(row);
  });

  const dailyBonusClaims = [];
  const ledger = [];
  const walletPoints = new Map();
  const lastBetActivityAt = new Map();

  athletes.forEach((athlete, athleteIndex) => {
    const membership = membershipByAthlete.get(athlete.id);
    walletPoints.set(athlete.id, 1000);
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
      createdAt: new Date(now.getTime() - 20 * 86400000),
    });

    safeArray(completedRowsByAthlete.get(athlete.id)).slice(0, 5 + (athleteIndex % 3)).forEach((claim) => {
      dailyBonusClaims.push({
        _id: `${athlete.id}::${claim.dateIso}`,
        coachId: COACH_ID,
        athleteId: athlete.id,
        localDate: claim.dateIso,
        source: 'seed_rich_demo',
        createdAt: new Date(`${claim.dateIso}T20:00:00.000Z`),
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

    if (seededRatio(`${athlete.id}:historic_payout`) > 0.35) {
      const delta = clampInt(120 + seededRatio(`${athlete.id}:historic_delta`) * 140, 120, 260);
      const payoutAt = new Date(now.getTime() - (8 + athleteIndex) * 86400000);
      walletPoints.set(athlete.id, walletPoints.get(athlete.id) + delta);
      ledger.push({
        _id: `jog_ledger_hist_${athlete.id}`,
        coachId: COACH_ID,
        athleteId: athlete.id,
        groupId: membership?.groupId || null,
        seasonKey,
        delta,
        reason: 'bet_win_payout',
        refId: `hist_${athlete.id}`,
        meta: { syntheticHistory: true },
        createdAt: payoutAt,
      });
      lastBetActivityAt.set(athlete.id, payoutAt);
    }
  });

  const carryoverAmounts = [180, 0, 95, 0, 140];
  const carryover = jogGroups.map((group, index) => ({
    _id: group._id,
    coachId: COACH_ID,
    groupId: group._id,
    amount: carryoverAmounts[index],
    createdAt: now,
    updatedAt: now,
  }));

  const questions = [
    ['?Quien hara el mejor parcial hoy?', '?Quien cerrara mejor la ultima repeticion?', '?Quien llega mas fresco al gym?'],
    ['?Quien sumara mas calidad esta tarde?', '?Quien tendra el paso mas regular?', '?Quien remata mejor el circuito?'],
    ['?Quien hace mejor tecnica hoy?', '?Quien sale mas fuerte en la serie principal?', '?Quien mantiene mejor la postura final?'],
  ];

  const betsOpen = [];
  const wagersOpen = [];
  jogGroups.forEach((group, groupIndex) => {
    const memberIds = group.memberIds;
    const questionSet = questions[groupIndex % questions.length];
    const betConfigs = [
      { suffix: 'open', status: 'open', closeAt: new Date(now.getTime() + (4 + groupIndex) * 3600000), carryoverIn: 0, winners: [], resolvedAt: null, resolvedEditableUntil: null, question: questionSet[0], createdAt: new Date(now.getTime() - (3 + groupIndex) * 3600000) },
      { suffix: 'closed', status: 'closed', closeAt: new Date(now.getTime() - (90 + groupIndex * 10) * 60000), carryoverIn: Math.min(80, carryoverAmounts[groupIndex]), winners: [], resolvedAt: null, resolvedEditableUntil: null, question: questionSet[1], createdAt: new Date(now.getTime() - (16 + groupIndex) * 3600000) },
      { suffix: 'resolved_pending_final', status: 'resolved_pending_final', closeAt: new Date(now.getTime() - (9 + groupIndex) * 3600000), carryoverIn: Math.min(80, carryoverAmounts[groupIndex]), winners: [memberIds[(groupIndex + 1) % memberIds.length]].filter(Boolean), resolvedAt: new Date(now.getTime() - (35 + groupIndex * 4) * 60000), resolvedEditableUntil: new Date(now.getTime() + (85 + groupIndex * 5) * 60000), question: questionSet[2], createdAt: new Date(now.getTime() - (30 + groupIndex) * 3600000) },
    ];

    betConfigs.forEach((config, statusIndex) => {
      const betId = `jog_bet_${slugify(group.name)}_${config.suffix}`;
      betsOpen.push({
        _id: betId,
        coachId: COACH_ID,
        groupId: group._id,
        creatorAthleteId: group.ownerAthleteId,
        questionText: config.question,
        closeAt: config.closeAt,
        resolveDeadlineAt: new Date(config.closeAt.getTime() + 3 * 3600000),
        carryoverIn: config.carryoverIn,
        status: config.status,
        winnerAthleteIds: config.winners,
        resolvedAt: config.resolvedAt,
        resolvedEditableUntil: config.resolvedEditableUntil,
        createdAt: config.createdAt,
        updatedAt: now,
      });

      memberIds.slice(0, Math.max(1, memberIds.length - ((groupIndex + statusIndex) % 2))).forEach((athleteId, memberIndex) => {
        const pickedAthleteId = memberIds[(memberIndex + statusIndex + 1) % memberIds.length];
        const stake = clampInt(14 + seededRatio(`${betId}:${athleteId}`) * 56 + statusIndex * 8, 12, 84);
        const updatedAt = new Date(config.createdAt.getTime() + (memberIndex + 1) * 1020000);
        wagersOpen.push({
          _id: `${betId}::${athleteId}`,
          coachId: COACH_ID,
          groupId: group._id,
          betId,
          athleteId,
          pickedAthleteId,
          stake,
          createdAt: new Date(updatedAt.getTime() - 480000),
          updatedAt,
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
          createdAt: updatedAt,
        });
        lastBetActivityAt.set(athleteId, updatedAt);
      });
    });
  });

  const wallets = athletes.map((athlete) => ({
    _id: `${athlete.id}::${seasonKey}`,
    coachId: COACH_ID,
    athleteId: athlete.id,
    seasonKey,
    points: Math.max(walletPoints.get(athlete.id), 80),
    joinCount: 1,
    lastBetActivityAt: lastBetActivityAt.get(athlete.id) || null,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    jogatina_groups: jogGroups.map(({ memberIds, ...group }) => group),
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
  const seasons = buildSeasons(parseStoredValue(appStorage.tf_seasons, []));
  const trainings = DEFAULT_TRAININGS.map((training) => ({ ...training }));
  const routines = uniqueBy([
    ...safeArray(parseStoredValue(appStorage.tf_routines, [])),
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
  const jogatina = buildJogatinaData(athletes, dayStatus, '25/26', now);

  let stateCacheCollection = buildStateCacheCollection(appState, now);
  let syncCountersCollection = buildSyncCountersCollection(stateCacheCollection);
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

  appState.tf_seed_meta = {
    ...(appState.tf_seed_meta || {}),
    counts: Object.fromEntries(Object.entries(collections).map(([key, docs]) => [key, docs.length])),
  };
  stateCacheCollection = buildStateCacheCollection(appState, now);
  syncCountersCollection = buildSyncCountersCollection(stateCacheCollection);
  collections.state_cache = stateCacheCollection;
  collections.sync_counters = syncCountersCollection;

  const localAppStorage = {
    bootstrap_coach: {
      name: COACH_NAME,
      email: COACH_EMAIL,
      password: COACH_PASSWORD,
    },
    ...appState,
  };

  await fs.mkdir(path.dirname(APP_STORAGE_PATH), { recursive: true });
  await fs.mkdir(path.dirname(APP_STORAGE_SEED_PATH), { recursive: true });
  await Promise.all([
    fs.writeFile(APP_STORAGE_PATH, JSON.stringify(localAppStorage, null, 2) + '\n', 'utf8'),
    fs.writeFile(APP_STORAGE_SEED_PATH, JSON.stringify(localAppStorage, null, 2) + '\n', 'utf8'),
    fs.writeFile(USERS_CSV_PATH, usersCsvSeed, 'utf8'),
    fs.writeFile(USERS_CSV_SEED_PATH, usersCsvSeed, 'utf8'),
  ]);

  const client = await getMongoClient();
  try {
    const db = client.db(DATABASE_NAME);
    await ensureIndexes(db);
    const replaceCollection = async (name, docs) => {
      if (name === 'sync_counters') {
        await db.collection(name).deleteOne({ _id: 'coach:' + COACH_ID });
        if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
        return;
      }
      await db.collection(name).deleteMany({ coachId: COACH_ID });
      if (docs.length) {
        await db.collection(name).insertMany(docs, { ordered: false });
      }
    };
    for (const collectionName of [
      'users',
      'groups',
      'athletes',
      'gym_exercises',
      'trainings',
      'seasons',
      'week_plans',
      'athlete_day_plans',
      'athlete_day_status',
      'competitions',
      'state_cache',
      'sync_counters',
      'jogatina_groups',
      'jogatina_memberships',
      'jogatina_wallets',
      'jogatina_bets_open',
      'jogatina_wagers_open',
      'jogatina_group_carryover',
      'jogatina_daily_bonus_claims',
      'jogatina_ledger',
    ]) {
      await replaceCollection(collectionName, collections[collectionName] || []);
    }
  } finally {
    await client.close();
  }

  console.log('Seed rico aplicado sobre ' + DATABASE_NAME + ' para ' + COACH_ID + '.');
  console.log(JSON.stringify(appState.tf_seed_meta.counts, null, 2));
  console.log('Coach: ' + COACH_NAME + ' / ' + COACH_PASSWORD);
  console.log('Atleta demo: ' + (athletes[0]?.name || 'N/A') + ' / ' + ATHLETE_DEFAULT_PASSWORD);
}

main().catch((error) => {
  console.error('seed-rich-demo failed:', error?.stack || error?.message || error);
  process.exit(1);
});

