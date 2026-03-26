import { expect } from '@playwright/test';
import { config } from '../../../server/src/config.js';
import { getMongoClient } from '../../../server/src/storage/providers/mongo/client.js';

export const COACH_CREDENTIALS = {
  username: 'JuanCarlos',
  password: '151346',
};

export const DEFAULT_ATHLETE_PASSWORD = '1234';
const LOCAL_USER_KEY = 'trackflow_local_tf_user';
const SEASON_ANCHOR_DATE = new Date(2025, 8, 15);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeSeedName(name) {
  return String(name || 'Atleta QA').trim() || 'Atleta QA';
}

function buildInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'QA';
}

function parseAthletesState(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === 'object') : [];
  } catch {
    return [];
  }
}

function toAthletesCsv(list = []) {
  const header = 'id,name,group,groups,avatar,maxW,weekKms,todayDone,competitions,password,passwordChangedOnce';
  const escapeCsv = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = list.map((athlete) => [
    athlete.id,
    athlete.name,
    athlete.group || 'por-asignar',
    JSON.stringify(athlete.groups || [athlete.group || 'por-asignar']),
    athlete.avatar || '',
    JSON.stringify(athlete.maxW || {}),
    JSON.stringify(athlete.weekKms || []),
    athlete.todayDone ? '1' : '0',
    JSON.stringify(athlete.competitions || []),
    athlete.password || DEFAULT_ATHLETE_PASSWORD,
    athlete.passwordChangedOnce ? '1' : '0',
  ].map(escapeCsv).join(','));
  return [header, ...rows].join('\n');
}

async function getDb() {
  const client = await getMongoClient();
  return client.db(config.mongoDbName);
}

function toIsoDate(date) {
  const value = new Date(date);
  const y = String(value.getFullYear()).padStart(4, '0');
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSeasonWeekNumber(date = new Date(), anchorDate = SEASON_ANCHOR_DATE) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const anchor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / MS_PER_DAY);
  return Math.floor(diffDays / 7) + 1;
}

function getSeasonWeekStartDate(weekNumber, anchorDate = SEASON_ANCHOR_DATE) {
  const safeWeekNumber = Number(weekNumber || 1) || 1;
  return new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate() + (safeWeekNumber - 1) * 7
  );
}

function buildEmptyWeekDay() {
  return {
    am: '',
    pm: '',
    targetGroup: 'all',
    gym: false,
    gymPlan: null,
    gymFocus: [],
    sessions: { am: null, pm: null },
    extraSessions: [],
  };
}

async function writeStateCacheValue(db, coachId, key, value, updatedBy = 'e2e_seed') {
  const now = new Date();
  await db.collection('state_cache').updateOne(
    { coachId, key },
    {
      $set: {
        coachId,
        key,
        valueJsonString: JSON.stringify(value),
        updatedAt: now,
        updatedBy,
      },
      $setOnInsert: { _id: `${coachId}:${key}`, createdAt: now, syncVersion: 1 },
    },
    { upsert: true }
  );
}

export async function snapshotWeekPlanState(coachId = String(config.defaultCoachId || 'juancarlos').trim() || 'juancarlos') {
  const db = await getDb();
  const rows = await db.collection('state_cache')
    .find({ coachId, key: { $in: ['tf_week_plans', 'tf_week', 'tf_active_week_number'] } })
    .toArray();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.valueJsonString ?? null;
    return acc;
  }, {});
}

export async function restoreWeekPlanState(snapshot = {}, coachId = String(config.defaultCoachId || 'juancarlos').trim() || 'juancarlos') {
  const db = await getDb();
  const now = new Date();
  for (const key of ['tf_week_plans', 'tf_week', 'tf_active_week_number']) {
    const rawValue = Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : null;
    if (rawValue == null) {
      await db.collection('state_cache').deleteOne({ coachId, key });
      continue;
    }
    await db.collection('state_cache').updateOne(
      { coachId, key },
      {
        $set: {
          coachId,
          key,
          valueJsonString: rawValue,
          updatedAt: now,
          updatedBy: 'e2e_restore',
        },
        $setOnInsert: { _id: `${coachId}:${key}`, createdAt: now, syncVersion: 1 },
      },
      { upsert: true }
    );
  }
}

export async function seedPublishedThursdayOnlyWeek({
  coachId = String(config.defaultCoachId || 'juancarlos').trim() || 'juancarlos',
  targetDateIso = '2026-03-26',
  sessionName = 'Control QA jueves',
} = {}) {
  const db = await getDb();
  const targetDate = new Date(`${targetDateIso}T12:00:00`);
  const weekNumber = getSeasonWeekNumber(targetDate);
  const weekStart = getSeasonWeekStartDate(weekNumber);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const days = Array.from({ length: 7 }, () => buildEmptyWeekDay());
  days[3] = {
    ...buildEmptyWeekDay(),
    am: sessionName,
    sessions: {
      am: {
        id: `session_${weekNumber}_thu_am`,
        slot: 'am',
        trainingId: '',
        name: sessionName,
        description: 'Sesión QA visible solo el jueves exacto.',
        targetAll: true,
        targetGroups: [],
        targetAthleteIds: [],
        targetGroup: 'all',
        zones: { regen: 4, ua: 0, uan: 0, anae: 0 },
      },
      pm: null,
    },
  };

  const week = {
    id: `week_${weekNumber}`,
    name: `Semana ${weekNumber}`,
    type: 'Inicial',
    targetGroup: 'all',
    weekNumber,
    startDate: toIsoDate(weekStart),
    endDate: toIsoDate(weekEnd),
    published: true,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isEditingPublished: false,
    publishedVersion: null,
    days,
  };

  await writeStateCacheValue(db, coachId, 'tf_week_plans', { [weekNumber]: week });
  await writeStateCacheValue(db, coachId, 'tf_week', week);
  await writeStateCacheValue(db, coachId, 'tf_active_week_number', weekNumber);

  return {
    coachId,
    weekNumber,
    targetDateIso,
    previousThursdayIso: toIsoDate(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 7)),
    weekStartIso: toIsoDate(weekStart),
    weekEndIso: toIsoDate(weekEnd),
    sessionName,
  };
}

export async function createTemporaryAthlete({ name = 'Atleta QA', password = DEFAULT_ATHLETE_PASSWORD } = {}) {
  const db = await getDb();
  const coachId = String(config.defaultCoachId || 'juancarlos').trim() || 'juancarlos';
  const baseName = normalizeSeedName(name);
  const safeName = `${baseName} ${Math.random().toString(36).slice(2, 7)}`.trim();
  const athleteId = `qa_${safeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_${Date.now().toString(36)}`;
  const avatar = buildInitials(safeName);
  const now = new Date();

  await db.collection('athletes').updateOne(
    { _id: `${coachId}:${athleteId}` },
    {
      $set: {
        coachId,
        athleteId,
        name: safeName,
        nameLower: safeName.toLowerCase(),
        primaryGroupSlug: 'por-asignar',
        groupSlugs: ['por-asignar'],
        avatar,
        maxWeights: {},
        weekKms: [],
        todayDone: false,
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await db.collection('users').updateOne(
    { _id: `athlete:${coachId}:${athleteId}` },
    {
      $set: {
        coachId,
        role: 'athlete',
        athleteId,
        usernameLower: safeName.toLowerCase(),
        emailLower: null,
        password: String(password || DEFAULT_ATHLETE_PASSWORD),
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, lastLoginAt: null },
      $unset: { passwordHash: '' },
    },
    { upsert: true }
  );

  const stateDoc = await db.collection('state_cache').findOne({ coachId, key: 'tf_athletes' });
  const athletes = parseAthletesState(stateDoc?.valueJsonString || '');
  const nextAthletes = [
    ...athletes.filter((row) => String(row?.id || '').trim() !== athleteId),
    {
      id: athleteId,
      name: safeName,
      group: 'por-asignar',
      groups: ['por-asignar'],
      avatar,
      maxW: {},
      weekKms: [],
      todayDone: false,
      competitions: [],
      password: String(password || DEFAULT_ATHLETE_PASSWORD),
      passwordChangedOnce: false,
    },
  ];

  await db.collection('state_cache').updateOne(
    { coachId, key: 'tf_athletes' },
    {
      $set: {
        _id: `${coachId}:tf_athletes`,
        coachId,
        key: 'tf_athletes',
        valueJsonString: JSON.stringify(nextAthletes),
        updatedAt: now,
        updatedBy: 'e2e_seed',
      },
      $setOnInsert: { createdAt: now, syncVersion: 1 },
    },
    { upsert: true }
  );

  await db.collection('state_cache').updateOne(
    { coachId, key: 'tf_users_csv' },
    {
      $set: {
        _id: `${coachId}:tf_users_csv`,
        coachId,
        key: 'tf_users_csv',
        valueJsonString: toAthletesCsv(nextAthletes),
        updatedAt: now,
        updatedBy: 'e2e_seed',
      },
      $setOnInsert: { createdAt: now, syncVersion: 1 },
    },
    { upsert: true }
  );

  return {
    coachId,
    athleteId,
    athleteName: safeName,
    password: String(password || DEFAULT_ATHLETE_PASSWORD),
  };
}

export async function removeTemporaryAthlete(seed) {
  const coachId = String(seed?.coachId || config.defaultCoachId || 'juancarlos').trim() || 'juancarlos';
  const athleteId = String(seed?.athleteId || '').trim();
  if (!athleteId) return;

  const db = await getDb();
  await Promise.all([
    db.collection('users').deleteOne({ _id: `athlete:${coachId}:${athleteId}` }),
    db.collection('athletes').deleteOne({ _id: `${coachId}:${athleteId}` }),
    db.collection('competitions').deleteMany({ coachId, athleteId }),
    db.collection('athlete_day_status').deleteMany({ coachId, athleteId }),
    db.collection('jogatina_memberships').deleteMany({ coachId, athleteId }),
    db.collection('jogatina_wallets').deleteMany({ coachId, athleteId }),
    db.collection('jogatina_wagers_open').deleteMany({ coachId, athleteId }),
    db.collection('jogatina_daily_bonus_claims').deleteMany({ coachId, athleteId }),
    db.collection('jogatina_ledger').deleteMany({ coachId, athleteId }),
  ]);

  const athletesDoc = await db.collection('state_cache').findOne({ coachId, key: 'tf_athletes' });
  const athletes = parseAthletesState(athletesDoc?.valueJsonString || '');
  const filtered = athletes.filter((row) => String(row?.id || '').trim() !== athleteId);
  const now = new Date();

  await db.collection('state_cache').updateOne(
    { coachId, key: 'tf_athletes' },
    { $set: { valueJsonString: JSON.stringify(filtered), updatedAt: now, updatedBy: 'e2e_cleanup' } }
  );
  await db.collection('state_cache').updateOne(
    { coachId, key: 'tf_users_csv' },
    { $set: { valueJsonString: toAthletesCsv(filtered), updatedAt: now, updatedBy: 'e2e_cleanup' } }
  );
}

export async function resetBrowserStorage(page) {
  await page.context().clearCookies();
}

export async function openApp(page) {
  await resetBrowserStorage(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // ignore storage cleanup errors in strict contexts
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPageMarker(page, label) {
  const key = String(label || '').trim().toLowerCase();
  if (key.includes('jogatina')) return page.locator('.jogatina-panel').first();
  if (key.includes('dataset')) return page.locator('.ph-title', { hasText: /DATASET/i }).first();
  if (key.includes('gym')) return page.locator('.ph-title', { hasText: /GYM/i }).first();
  if (key.includes('semana')) return page.locator('.ph-title', { hasText: /SEMANA/i }).first();
  if (key.includes('hoy')) return page.locator('.ph-title', { hasText: /HOY/i }).first();
  if (key.includes('calendario')) {
    return page.locator('.athlete-calendar-page').first().or(
      page.locator('.ph-title', { hasText: /CALENDARIO/i }).first()
    );
  }
  if (key.includes('perfil')) return page.locator('.athlete-profile-page, .profile-card, .profile-panel, .athlete-profile').first();
  return page.locator('.page-shell, .jogatina-panel').first();
}

async function clickVisibleNavItem(navItem) {
  await navItem.scrollIntoViewIfNeeded();
  try {
    await navItem.click({ timeout: 5_000 });
  } catch {
    await navItem.dispatchEvent('click');
  }
}

export async function clickNav(page, label) {
  const labelRegex = new RegExp(escapeRegex(label), 'i');
  const pageMarker = getPageMarker(page, label);

  const desktop = page.locator('.sidebar .nav-item').filter({ hasText: labelRegex }).first();
  if (await desktop.isVisible().catch(() => false)) {
    await clickVisibleNavItem(desktop);
    await expect(pageMarker).toBeVisible({ timeout: 15_000 });
    return;
  }

  const mobileTab = page.locator('.mobile-tabbar .mobile-tab-btn').filter({ hasText: labelRegex }).first();
  if (await mobileTab.isVisible().catch(() => false)) {
    await clickVisibleNavItem(mobileTab);
    await expect(pageMarker).toBeVisible({ timeout: 15_000 });
    return;
  }

  const menuBtn = page.locator('.mobile-menu-btn').first();
  if (await menuBtn.isVisible().catch(() => false)) {
    await clickVisibleNavItem(menuBtn);
    const mobileMenuItem = page.locator('.mobile-menu-sheet .mobile-menu-item').filter({ hasText: labelRegex }).first();
    if (await mobileMenuItem.isVisible().catch(() => false)) {
      await clickVisibleNavItem(mobileMenuItem);
      await expect(pageMarker).toBeVisible({ timeout: 15_000 });
      return;
    }
  }

  throw new Error(`No se encontro la navegacion "${label}".`);
}

export async function logout(page) {
  const coachNav = page.locator('.sidebar .nav-item, .mobile-menu-sheet .mobile-menu-item, .mobile-tabbar .mobile-tab-btn').filter({ hasText: /Temporadas/i }).first();
  if (await coachNav.isVisible().catch(() => false)) {
    await clickNav(page, 'Temporadas');
    const coachLogout = page.getByTestId('coach-logout-button').first();
    await expect(coachLogout).toBeVisible({ timeout: 15_000 });
    await coachLogout.click();
    return;
  }

  await clickNav(page, 'Mi Perfil');
  const athleteLogout = page.getByTestId('athlete-logout-button').first();
  await expect(athleteLogout).toBeVisible({ timeout: 15_000 });
  await athleteLogout.click();
}

export async function waitForAppReady(page, timeout = 30_000) {
  const loading = page.locator('.app-loading');
  await loading.waitFor({ state: 'hidden', timeout }).catch(() => {});
  await expect(page.locator('.app-wrap')).toBeVisible({ timeout });
  const mobileNav = page.locator('.mobile-tabbar .mobile-tab-btn').first();
  const desktopNav = page.locator('.sidebar .nav-item').first();
  await page.waitForFunction(() => {
    const isVisible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    return isVisible('.mobile-tabbar .mobile-tab-btn') || isVisible('.sidebar .nav-item');
  }, { timeout });
  const hasVisibleMobileNav = await mobileNav.isVisible().catch(() => false);
  if (hasVisibleMobileNav) return;
  await expect(desktopNav).toBeVisible({ timeout });
}

export async function waitForPersistedUser(page, timeout = 15_000) {
  await page.waitForFunction((storageKey) => {
    try {
      return !!window.localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  }, LOCAL_USER_KEY, { timeout });
}

export async function loginAthlete(page, athleteName = 'Atleta QA', password = DEFAULT_ATHLETE_PASSWORD) {
  await openApp(page);
  await expect(page.locator('.login-wrap')).toBeVisible();
  await page.getByRole('button', { name: /Atleta/i }).click();
  const inputs = page.locator('.login-card .input');
  await inputs.nth(0).fill(athleteName);
  await inputs.nth(1).fill(password);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await waitForAppReady(page);
  await waitForPersistedUser(page);
}

export async function loginCoach(page, username = COACH_CREDENTIALS.username, password = COACH_CREDENTIALS.password) {
  await openApp(page);
  await expect(page.locator('.login-wrap')).toBeVisible();
  await page.getByRole('button', { name: /Entrenador/i }).click();
  const inputs = page.locator('.login-card .input');
  await inputs.nth(0).fill(username);
  await inputs.nth(1).fill(password);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await waitForAppReady(page);
  await waitForPersistedUser(page);
}

export async function seedAthleteSession(page, athlete) {
  await loginAthlete(
    page,
    String(athlete?.name || '').trim() || 'Atleta QA',
    String(athlete?.password || DEFAULT_ATHLETE_PASSWORD)
  );
}

export async function seedCoachSession(page, coach = COACH_CREDENTIALS) {
  await loginCoach(
    page,
    String(coach?.username || COACH_CREDENTIALS.username).trim() || COACH_CREDENTIALS.username,
    String(coach?.password || COACH_CREDENTIALS.password).trim() || COACH_CREDENTIALS.password
  );
}

export async function openJogatina(page) {
  await waitForAppReady(page);
  const panel = page.locator('.jogatina-panel').first();
  const memberMarker = page.getByTestId('jogatina-hero').first();
  const guestMarker = page.getByTestId('jogatina-guest-create').first();
  const errorBanner = page.locator('.jogatina-error').first();

  const ensurePanelOpen = async () => {
    if (!await panel.isVisible().catch(() => false)) {
      await clickNav(page, 'Jogatina');
    }
    await expect(panel).toBeVisible({ timeout: 15_000 });
  };

  await ensurePanelOpen();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hasCard = await memberMarker.or(guestMarker).isVisible().catch(() => false);
    if (hasCard) {
      await expect(memberMarker.or(guestMarker)).toBeVisible({ timeout: 15_000 });
      return;
    }

    const hasError = await errorBanner.isVisible().catch(() => false);
    if (hasError) {
      await page.waitForTimeout(700);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await ensurePanelOpen();
      continue;
    }

    await page.waitForTimeout(500);
  }

  await expect(memberMarker.or(guestMarker)).toBeVisible({ timeout: 15_000 });
}

export function uniqueQuestion(prefix = 'e2e_jogatina') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}
