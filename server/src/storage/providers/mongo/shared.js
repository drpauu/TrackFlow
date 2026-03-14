import { config } from '../../../config.js';

export const USERS_KEY = 'tf_users_csv';
export const DEFAULT_USERS_CSV_HEADER = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions\n';

export function toFiniteInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toStoredString(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function parseJsonString(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeCoachId(value) {
  const safe = String(value || '').trim();
  return safe || config.defaultCoachId;
}

export function normalizeIsoDate(value) {
  const safe = String(value || '').trim();
  const match = safe.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function addDaysIso(isoDate, days) {
  const base = normalizeIsoDate(isoDate);
  if (!base) return null;
  const [y, m, d] = base.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  const yy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function todayIsoInTimeZone(timeZone = config.appTimezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

export function normalizeGroupName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function sanitizeKms(zones = {}) {
  const regen = Number(zones?.regen || 0);
  const ua = Number(zones?.ua || 0);
  const uan = Number(zones?.uan || 0);
  const anae = Number(zones?.anae || 0);
  return {
    total: regen + ua + uan + anae,
    regen,
    ua,
    uan,
    anae,
  };
}

export function buildAthleteDayStatusColor({ dateIso, plannedSlotsCount, doneSlotsCount }) {
  const todayIso = todayIsoInTimeZone(config.appTimezone);
  if (dateIso && dateIso > todayIso) return 'gray';
  if (Number(plannedSlotsCount || 0) <= 0) return 'green';
  if (Number(doneSlotsCount || 0) <= 0) return 'red';
  if (Number(doneSlotsCount || 0) < Number(plannedSlotsCount || 0)) return 'orange';
  return 'green';
}

export function normalizeSessionTargets(session = {}, day = {}) {
  const targetGroups = safeArray(session?.targetGroups).map((value) => normalizeGroupName(value)).filter(Boolean);
  const targetAthleteIds = safeArray(session?.targetAthleteIds).map((value) => String(value || '').trim()).filter(Boolean);
  const rawGroup = String(session?.targetGroup || day?.targetGroup || 'all').trim();
  const group = normalizeGroupName(rawGroup);
  const targetAll = session?.targetAll != null
    ? !!session.targetAll
    : (group === 'all' && targetGroups.length === 0 && targetAthleteIds.length === 0);

  const mergedGroups = targetGroups.length
    ? targetGroups
    : (group && group !== 'all' ? [group] : []);

  return {
    targetAll,
    targetGroups: mergedGroups,
    targetAthleteIds,
  };
}

export function sessionVisibleForAthlete(session = {}, day = {}, athlete = {}) {
  const targets = normalizeSessionTargets(session, day);
  if (targets.targetAll) return true;
  if (targets.targetAthleteIds.includes(String(athlete.athleteId || athlete.id || '').trim())) return true;
  const athleteGroups = new Set(safeArray(athlete.groupSlugs).map((g) => normalizeGroupName(g)));
  return targets.targetGroups.some((group) => athleteGroups.has(normalizeGroupName(group)));
}

function getLegacySession(slot, day) {
  const value = String(day?.[slot] || '').trim();
  if (!value) return null;
  return {
    id: `legacy_${slot}_${slugify(value)}`,
    slot,
    name: value,
    description: '',
    targetAll: true,
    targetGroups: [],
    targetAthleteIds: [],
    targetGroup: 'all',
    zones: {},
  };
}

export function slotSessionsFromDay(day = {}, slot = 'am') {
  const output = [];
  const direct = day?.sessions?.[slot];
  if (direct && typeof direct === 'object') output.push(direct);
  safeArray(day?.extraSessions).forEach((session) => {
    if (String(session?.slot || '').trim() === slot) output.push(session);
  });
  if (!output.length) {
    const legacy = getLegacySession(slot, day);
    if (legacy) output.push(legacy);
  }
  return output;
}
