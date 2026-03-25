import { expect } from '@playwright/test';
import { config } from '../../../server/src/config.js';
import { getMongoClient } from '../../../server/src/storage/providers/mongo/client.js';

export const COACH_CREDENTIALS = {
  username: 'JuanCarlos',
  password: '151346',
};

export const DEFAULT_ATHLETE_PASSWORD = '1234';
const LOCAL_USER_KEY = 'trackflow_local_tf_user';

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
  if (key.includes('gym')) return page.locator('.ph-title', { hasText: /GYM/i }).first();
  if (key.includes('semana')) return page.locator('.ph-title', { hasText: /SEMANA/i }).first();
  if (key.includes('hoy')) return page.locator('.ph-title', { hasText: /HOY/i }).first();
  if (key.includes('calendario')) return page.locator('.ph-title', { hasText: /CALENDARIO/i }).first();
  if (key.includes('perfil')) return page.locator('.profile-card, .profile-panel, .athlete-profile').first();
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
  const desktop = page.locator('.nav-item-danger');
  if (await desktop.first().isVisible().catch(() => false)) {
    await desktop.first().click();
    return;
  }

  const mobile = page.locator('.mobile-logout');
  if (await mobile.first().isVisible().catch(() => false)) {
    await mobile.first().click();
  }
}

export async function waitForAppReady(page, timeout = 30_000) {
  const loading = page.locator('.app-loading');
  await loading.waitFor({ state: 'hidden', timeout }).catch(() => {});
  await expect(page.locator('.app-wrap')).toBeVisible({ timeout });
  await expect(page.locator('.sidebar .nav-item, .mobile-tabbar .mobile-tab-btn').first()).toBeVisible({ timeout });
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
  const memberMarker = page.locator('.jogatina-card').filter({
    has: page.getByRole('heading', { name: 'Crear apuesta' }),
  }).first();
  const guestMarker = page.locator('.jogatina-card').filter({
    has: page.getByRole('heading', { name: 'Crear grupo' }),
  }).first();
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
