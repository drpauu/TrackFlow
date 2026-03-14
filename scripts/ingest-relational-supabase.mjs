import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CHUNK_SIZE = 100;

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseDotEnv(content = '') {
  const env = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const candidates = [
    path.resolve(REPO_ROOT, '.env'),
    path.resolve(REPO_ROOT, 'server/.env'),
  ];
  const env = { ...process.env };
  for (const filePath of candidates) {
    if (!(await fileExists(filePath))) continue;
    const parsed = parseDotEnv(await readText(filePath, ''));
    for (const [key, value] of Object.entries(parsed)) {
      if (!env[key]) env[key] = value;
    }
  }
  return env;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function safeStoredParse(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toIsoDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function addDaysIso(dateIso, days) {
  const base = toIsoDate(dateIso);
  if (!base) return null;
  const [y, m, d] = base.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  const yy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function chunkArray(items, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function restRequest({
  baseUrl,
  apiKey,
  pathWithQuery,
  method = 'GET',
  body = null,
  extraHeaders = {},
}) {
  const response = await fetch(`${baseUrl}${pathWithQuery}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payloadText = await response.text();
  if (!response.ok) {
    const payload = parseJson(payloadText, null);
    const message = payload?.message || payload?.error || payloadText || `HTTP ${response.status}`;
    throw new Error(`Supabase REST error (${method} ${pathWithQuery}): ${message}`);
  }
  if (!payloadText) return null;
  return parseJson(payloadText, payloadText);
}

async function upsertRows({ baseUrl, apiKey, table, rows }) {
  if (!rows.length) {
    console.log(`Tabla ${table}: 0 filas (saltado)`);
    return;
  }
  const chunks = chunkArray(rows, CHUNK_SIZE);
  let processed = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    await restRequest({
      baseUrl,
      apiKey,
      method: 'POST',
      pathWithQuery: `/${table}?on_conflict=id`,
      body: chunk,
      extraHeaders: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
    processed += chunk.length;
    console.log(`Tabla ${table}: ${processed}/${rows.length}`);
  }
}

function dedupeById(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    byId.set(id, row);
  }
  return Array.from(byId.values());
}

async function buildRelationalPayload() {
  const appStoragePath = path.resolve(REPO_ROOT, 'server/data/app_storage.json');
  const usersCsvPath = path.resolve(REPO_ROOT, 'server/data/users.csv');

  if (!(await fileExists(appStoragePath))) throw new Error(`No existe ${appStoragePath}`);
  if (!(await fileExists(usersCsvPath))) throw new Error(`No existe ${usersCsvPath}`);

  const appStorage = parseJson(await readText(appStoragePath, '{}'), null);
  if (!appStorage || typeof appStorage !== 'object' || Array.isArray(appStorage)) {
    throw new Error('server/data/app_storage.json no es JSON valido');
  }

  const coachRaw = safeStoredParse(appStorage.tf_user, null);
  const coach = {
    id: String(coachRaw?.id || 'coach').trim() || 'coach',
    name: String(coachRaw?.name || 'Entrenador').trim() || 'Entrenador',
    password_plain: String(coachRaw?.password || '150346').trim() || '150346',
    auth_user_id: null,
    is_active: true,
  };

  const groupsRaw = safeStoredParse(appStorage.tf_groups, []);
  const groupNames = Array.isArray(groupsRaw) && groupsRaw.length
    ? groupsRaw.map((group) => String(group || '').trim()).filter(Boolean)
    : ['por-asignar', '1500m', '800m', 'pequenos'];

  const groupIdByName = new Map();
  const groups = [];
  for (const groupNameRaw of groupNames) {
    const groupName = String(groupNameRaw || '').trim();
    if (!groupName) continue;
    const baseId = `grp_${slugify(groupName) || 'grupo'}`;
    let id = baseId;
    let seq = 2;
    while (groups.some((group) => group.id === id)) {
      id = `${baseId}_${seq}`;
      seq += 1;
    }
    groupIdByName.set(groupName.toLowerCase(), id);
    groups.push({
      id,
      coach_id: coach.id,
      name: groupName,
      position: groups.length,
      is_active: true,
    });
  }

  function getOrCreateGroupId(groupNameRaw) {
    const groupName = String(groupNameRaw || '').trim();
    if (!groupName) return null;
    const key = groupName.toLowerCase();
    const existing = groupIdByName.get(key);
    if (existing) return existing;
    const id = `grp_${slugify(groupName) || `grupo_${groups.length + 1}`}`;
    groupIdByName.set(key, id);
    groups.push({
      id,
      coach_id: coach.id,
      name: groupName,
      position: groups.length,
      is_active: true,
    });
    return id;
  }

  const athletesRaw = safeStoredParse(appStorage.tf_athletes, []);
  const athletes = [];
  if (Array.isArray(athletesRaw)) {
    for (const raw of athletesRaw) {
      const athleteId = String(raw?.id || `ath_${slugify(raw?.name)}`).trim();
      const athleteName = String(raw?.name || '').trim();
      if (!athleteId || !athleteName) continue;
      const rawGroups = Array.isArray(raw?.groups) ? raw.groups : [];
      const mergedGroupNames = [
        ...rawGroups.map((group) => String(group || '').trim()).filter(Boolean),
        String(raw?.group || '').trim(),
      ].filter(Boolean);
      const groupIds = dedupeById(
        mergedGroupNames.map((groupName) => ({ id: getOrCreateGroupId(groupName) })).filter((row) => !!row.id)
      ).map((row) => row.id);

      const primaryGroupId = getOrCreateGroupId(raw?.group || mergedGroupNames[0] || 'por-asignar');
      athletes.push({
        id: athleteId,
        coach_id: coach.id,
        auth_user_id: null,
        name: athleteName,
        password_plain: String(raw?.password || '1234').trim() || '1234',
        avatar: String(raw?.avatar || '').trim() || null,
        primary_group_id: primaryGroupId,
        group_ids: groupIds,
        exercise_maxes: raw?.maxW && typeof raw.maxW === 'object' ? raw.maxW : {},
        week_kms: Array.isArray(raw?.weekKms) ? raw.weekKms : [],
        competitions: Array.isArray(raw?.competitions) ? raw.competitions : [],
        is_active: true,
      });
    }
  }

  const routinesRaw = safeStoredParse(appStorage.tf_routines, []);
  const routines = Array.isArray(routinesRaw) ? routinesRaw : [];
  const customExercisesRaw = safeStoredParse(appStorage.tf_custom_exercises, []);
  const customExercises = Array.isArray(customExercisesRaw) ? customExercisesRaw : [];
  const exerciseImagesRaw = safeStoredParse(appStorage.tf_exercise_images, {});
  const exerciseImages = exerciseImagesRaw && typeof exerciseImagesRaw === 'object' ? exerciseImagesRaw : {};

  const exercisesMap = new Map();
  const pushExercise = (exercise) => {
    const id = String(exercise?.id || exercise?.exId || '').trim();
    const name = String(exercise?.name || id || '').trim();
    if (!id || !name) return;
    const typeRaw = String(exercise?.type || exercise?.exercise_type || '').trim().toLowerCase();
    const exerciseType = ['weight', 'reps', 'time_reps'].includes(typeRaw)
      ? typeRaw
      : (Number(exercise?.duration || 0) > 0 ? 'time_reps' : 'reps');
    const row = {
      id,
      coach_id: coach.id,
      name,
      exercise_type: exerciseType,
      category: String(exercise?.category || '').trim() || null,
      muscles: String(exercise?.muscles || '').trim() || null,
      default_payload: {
        sets: Number(exercise?.sets || 0) || null,
        reps: Number(exercise?.reps || 0) || null,
        pct: Number(exercise?.pct || 0) || null,
        duration: Number(exercise?.duration || 0) || null,
      },
      image_url: exercise?.imageUrl || exerciseImages[id] || null,
      position: Number(exercise?.position || 0) || 0,
      is_active: true,
    };
    exercisesMap.set(id, row);
  };

  customExercises.forEach(pushExercise);
  for (const routine of routines) {
    const list = Array.isArray(routine?.exercises) ? routine.exercises : [];
    list.forEach((exercise) => {
      pushExercise({
        ...exercise,
        id: exercise?.id || exercise?.exId,
      });
    });
  }
  const exercises = Array.from(exercisesMap.values());

  const seasonsRaw = safeStoredParse(appStorage.tf_seasons, []);
  const seasonsList = Array.isArray(seasonsRaw) ? seasonsRaw : [];
  const currentSeasonId = safeStoredParse(appStorage.tf_current_season_id, null);
  const currentSeasonWeekOneStart = safeStoredParse(appStorage.tf_season_week_one_start, null);

  const seasons = [];
  for (const raw of seasonsList) {
    const seasonId = String(raw?.id || '').trim();
    if (!seasonId) continue;
    seasons.push({
      id: seasonId,
      coach_id: coach.id,
      label: String(raw?.label || `Temporada ${seasonId}`).trim(),
      week_one_start: toIsoDate(raw?.weekOneStartIso || currentSeasonWeekOneStart) || toIsoDate(new Date().toISOString()) || '2025-09-15',
      started_at: raw?.startedAt || null,
      finalized_at: raw?.finalizedAt || null,
      archive_payload: raw?.archived || null,
      is_locked: !!raw?.finalizedAt,
    });
  }
  if (!seasons.length) {
    const fallbackSeasonId = String(currentSeasonId || '25/26').trim() || '25/26';
    seasons.push({
      id: fallbackSeasonId,
      coach_id: coach.id,
      label: `Temporada ${fallbackSeasonId}`,
      week_one_start: toIsoDate(currentSeasonWeekOneStart) || '2025-09-15',
      started_at: null,
      finalized_at: null,
      archive_payload: null,
      is_locked: false,
    });
  }

  const seasonsById = new Map(seasons.map((season) => [season.id, season]));
  const activeSeasonId = seasonsById.has(String(currentSeasonId || '').trim())
    ? String(currentSeasonId || '').trim()
    : seasons[0].id;

  const weekPlansRaw = safeStoredParse(appStorage.tf_week_plans, {});
  const weekPlans = weekPlansRaw && typeof weekPlansRaw === 'object' ? weekPlansRaw : {};
  const routinesById = new Map(routines.map((routine) => [String(routine?.id || '').trim(), routine]));

  const coachCalendar = [];
  const slotPosition = { am: 1, pm: 2, gym: 3 };
  const addCoachEntry = ({
    week,
    weekNumber,
    day,
    dayIndex,
    slot,
    title,
    payload,
    targetGroup,
    targetAthleteId,
  }) => {
    if (!title) return;
    const groupId = targetGroup && String(targetGroup).toLowerCase() !== 'all'
      ? getOrCreateGroupId(targetGroup)
      : null;
    const athleteId = targetAthleteId ? String(targetAthleteId).trim() : null;
    const targetType = athleteId ? 'athlete' : (groupId ? 'group' : 'all');
    const id = `cc_${activeSeasonId}_${weekNumber}_${dayIndex}_${slot}_${targetType}_${groupId || athleteId || 'all'}`;
    coachCalendar.push({
      id,
      coach_id: coach.id,
      season_id: activeSeasonId,
      week_number: weekNumber,
      day_index: dayIndex,
      day_date: toIsoDate(addDaysIso(week?.startDate, dayIndex)),
      slot,
      target_type: targetType,
      target_group_id: groupId,
      target_athlete_id: athleteId,
      title: String(title).trim(),
      description: String(payload?.description || '').trim() || null,
      payload: payload || {},
      status: week?.published ? 'published' : 'draft',
      published_at: week?.published ? (week?.publishedAt || null) : null,
      position: slotPosition[slot] || 0,
      updated_by: coach.id,
    });
  };

  for (const [weekKey, weekValue] of Object.entries(weekPlans)) {
    const week = weekValue && typeof weekValue === 'object' ? weekValue : null;
    if (!week) continue;
    const weekNumber = Number(week?.weekNumber || weekKey || 1) || 1;
    const days = Array.isArray(week?.days) ? week.days : [];
    for (let dayIndex = 0; dayIndex < Math.min(days.length, 7); dayIndex += 1) {
      const day = days[dayIndex] && typeof days[dayIndex] === 'object' ? days[dayIndex] : {};
      const amSession = day?.sessions?.am || null;
      const pmSession = day?.sessions?.pm || null;

      addCoachEntry({
        week,
        weekNumber,
        day,
        dayIndex,
        slot: 'am',
        title: day?.am || amSession?.name || '',
        payload: { ...day, slot: 'am', session: amSession },
        targetGroup: amSession?.targetGroup || day?.targetGroup || 'all',
        targetAthleteId: Array.isArray(amSession?.targetAthleteIds) ? amSession.targetAthleteIds[0] : null,
      });

      addCoachEntry({
        week,
        weekNumber,
        day,
        dayIndex,
        slot: 'pm',
        title: day?.pm || pmSession?.name || '',
        payload: { ...day, slot: 'pm', session: pmSession },
        targetGroup: pmSession?.targetGroup || day?.targetGroup || 'all',
        targetAthleteId: Array.isArray(pmSession?.targetAthleteIds) ? pmSession.targetAthleteIds[0] : null,
      });

      if (day?.gym) {
        const savedRoutine = day?.gymPlan?.routineId ? routinesById.get(String(day.gymPlan.routineId).trim()) : null;
        const gymTitle = savedRoutine?.name
          || day?.gymPlan?.inline?.name
          || 'Gym';
        addCoachEntry({
          week,
          weekNumber,
          day,
          dayIndex,
          slot: 'gym',
          title: gymTitle,
          payload: { ...day, slot: 'gym' },
          targetGroup: day?.gymTargetGroup || day?.targetGroup || 'all',
          targetAthleteId: null,
        });
      }
    }
  }

  const historyRaw = safeStoredParse(appStorage.tf_history, []);
  const historyList = Array.isArray(historyRaw) ? historyRaw : [];
  const historyByAthleteDate = new Map();
  for (const row of historyList) {
    const athleteId = String(row?.athleteId || '').trim();
    const dateIso = toIsoDate(row?.dateIso);
    if (!athleteId || !dateIso) continue;
    historyByAthleteDate.set(`${athleteId}|${dateIso}`, row);
  }

  const athleteCalendar = [];
  const athletesById = new Map(athletes.map((athlete) => [athlete.id, athlete]));

  function isEntryVisibleForAthlete(entry, athlete) {
    if (!entry || !athlete) return false;
    if (entry.target_type === 'all') return true;
    if (entry.target_type === 'athlete') return entry.target_athlete_id === athlete.id;
    if (entry.target_type === 'group') {
      return Array.isArray(athlete.group_ids) && athlete.group_ids.includes(entry.target_group_id);
    }
    return false;
  }

  function completionFromHistory(entry, historyRow) {
    if (!historyRow) return 'none';
    if (entry.slot === 'am') return historyRow?.amDone ? 'done' : (historyRow?.pmDone || historyRow?.gymDone ? 'partial' : 'none');
    if (entry.slot === 'pm') return historyRow?.pmDone ? 'done' : (historyRow?.amDone || historyRow?.gymDone ? 'partial' : 'none');
    if (entry.slot === 'gym') return historyRow?.gymDone ? 'done' : (historyRow?.amDone || historyRow?.pmDone ? 'partial' : 'none');
    return 'none';
  }

  for (const entry of coachCalendar) {
    for (const athlete of athletes) {
      if (!isEntryVisibleForAthlete(entry, athlete)) continue;
      const historyRow = historyByAthleteDate.get(`${athlete.id}|${entry.day_date || ''}`) || null;
      const completion = completionFromHistory(entry, historyRow);
      athleteCalendar.push({
        id: `ac_${athlete.id}_${entry.id}`,
        athlete_id: athlete.id,
        coach_entry_id: entry.id,
        season_id: entry.season_id,
        day_date: entry.day_date || toIsoDate(new Date().toISOString()),
        week_number: entry.week_number,
        slot: entry.slot,
        source_type: entry.target_type === 'athlete' ? 'personal' : 'group',
        title: entry.title,
        payload: entry.payload,
        completion_status: completion,
        completed_at: completion === 'done' ? new Date().toISOString() : null,
      });
    }
  }

  for (const athlete of athletes) {
    const competitions = Array.isArray(athlete.competitions) ? athlete.competitions : [];
    competitions.forEach((competition, index) => {
      const dateIso = toIsoDate(competition?.dateIso || competition?.date || '');
      if (!dateIso) return;
      const compId = String(competition?.id || `${dateIso}_${index}`).trim();
      athleteCalendar.push({
        id: `ac_comp_${athlete.id}_${slugify(compId) || index}`,
        athlete_id: athlete.id,
        coach_entry_id: null,
        season_id: activeSeasonId,
        day_date: dateIso,
        week_number: null,
        slot: 'competition',
        source_type: 'competition',
        title: String(competition?.title || competition?.name || 'Competicion').trim(),
        payload: competition || {},
        completion_status: 'none',
        completed_at: null,
      });
    });
  }

  return {
    coach: [coach],
    groups: dedupeById(groups),
    athletes: dedupeById(athletes),
    exercises: dedupeById(exercises),
    seasons: dedupeById(seasons),
    coachCalendar: dedupeById(coachCalendar),
    athleteCalendar: dedupeById(athleteCalendar),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadEnv();
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl) throw new Error('Falta SUPABASE_URL o VITE_SUPABASE_URL.');
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (requerido para ingesta relacional).');

  const baseUrl = `${supabaseUrl}/rest/v1`;
  const payload = await buildRelationalPayload();

  console.log('Preview de filas:');
  console.log(`- coaches: ${payload.coach.length}`);
  console.log(`- groups: ${payload.groups.length}`);
  console.log(`- athletes: ${payload.athletes.length}`);
  console.log(`- gym_exercises: ${payload.exercises.length}`);
  console.log(`- seasons: ${payload.seasons.length}`);
  console.log(`- coach_calendar_entries: ${payload.coachCalendar.length}`);
  console.log(`- athlete_calendar_entries: ${payload.athleteCalendar.length}`);

  if (args.dryRun) {
    console.log('Dry run completado (sin escrituras).');
    return;
  }

  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'coaches', rows: payload.coach });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'groups', rows: payload.groups });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'athletes', rows: payload.athletes });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'gym_exercises', rows: payload.exercises });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'seasons', rows: payload.seasons });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'coach_calendar_entries', rows: payload.coachCalendar });
  await upsertRows({ baseUrl, apiKey: serviceRoleKey, table: 'athlete_calendar_entries', rows: payload.athleteCalendar });

  const tables = [
    'coaches',
    'groups',
    'athletes',
    'gym_exercises',
    'seasons',
    'coach_calendar_entries',
    'athlete_calendar_entries',
  ];

  for (const table of tables) {
    const rows = await restRequest({
      baseUrl,
      apiKey: serviceRoleKey,
      pathWithQuery: `/${table}?select=id`,
      method: 'GET',
    });
    const count = Array.isArray(rows) ? rows.length : 0;
    console.log(`Tabla ${table}: ${count} filas`);
  }

  console.log('Ingesta relacional completada.');
}

main().catch((error) => {
  console.error(`ingest:relational fallo: ${error?.message || error}`);
  process.exit(1);
});

