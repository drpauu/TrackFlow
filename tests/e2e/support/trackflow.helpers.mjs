import { expect } from '@playwright/test';

export const COACH_CREDENTIALS = {
  username: 'JuanCarlos',
  password: '151346',
};

export const DEFAULT_ATHLETE_PASSWORD = '1234';
const LOCAL_USER_KEY = 'trackflow_local_tf_user';

export async function resetBrowserStorage(page) {
  await page.context().clearCookies();
}

export async function openApp(page) {
  await resetBrowserStorage(page);
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

export async function loginAthlete(page, athleteName = 'Nuria', password = DEFAULT_ATHLETE_PASSWORD) {
  await openApp(page);
  await expect(page.locator('.login-wrap')).toBeVisible();
  await page.getByPlaceholder('Nombre del atleta').fill(athleteName);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await waitForAppReady(page);
  await waitForPersistedUser(page);
}

export async function loginCoach(page, username = COACH_CREDENTIALS.username, password = COACH_CREDENTIALS.password) {
  await openApp(page);
  await expect(page.locator('.login-wrap')).toBeVisible();
  await page.getByRole('button', { name: /Entrenador/i }).click();
  await page.getByPlaceholder('JuanCarlos o email admin').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await waitForAppReady(page);
  await waitForPersistedUser(page);
}

export async function seedAthleteSession(page, athlete) {
  const payload = {
    id: String(athlete?.id || '').trim(),
    name: String(athlete?.name || '').trim() || 'Atleta',
    role: 'athlete',
    group: String(athlete?.group || 'por-asignar').trim() || 'por-asignar',
    groups: Array.isArray(athlete?.groups) && athlete.groups.length
      ? athlete.groups
      : [String(athlete?.group || 'por-asignar').trim() || 'por-asignar'],
    avatar: String(athlete?.avatar || '').trim() || String(athlete?.name || 'AT').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
  };

  await openApp(page);
  await page.evaluate((user) => {
    window.localStorage.setItem('trackflow_local_tf_user', JSON.stringify(user));
  }, payload);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

export async function seedCoachSession(page, coach = COACH_CREDENTIALS) {
  const payload = {
    id: 'coach',
    name: String(coach?.username || COACH_CREDENTIALS.username).trim() || COACH_CREDENTIALS.username,
    role: 'coach',
  };

  await openApp(page);
  await page.evaluate((user) => {
    window.localStorage.setItem('trackflow_local_tf_user', JSON.stringify(user));
  }, payload);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
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

  if (!await panel.isVisible().catch(() => false)) {
    await clickNav(page, 'Jogatina');
  }

  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(memberMarker.or(guestMarker)).toBeVisible({ timeout: 15_000 });
}

export function uniqueQuestion(prefix = 'e2e_jogatina') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

