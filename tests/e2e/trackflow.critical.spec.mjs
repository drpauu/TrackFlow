import { test, expect } from '@playwright/test';

const COACH_SEED_USER = {
  id: 'coach',
  name: 'Juan Carlos',
  role: 'coach',
  password: '150346',
};

async function seedCoachSession(page) {
  await page.addInitScript((payload) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('tf_user', JSON.stringify(payload));
  }, COACH_SEED_USER);
}

async function clickNav(page, label) {
  const desktop = page.locator('.sidebar .nav-item', { hasText: label });
  if (await desktop.first().isVisible().catch(() => false)) {
    await desktop.first().click();
    return;
  }

  const mobileTab = page.locator('.mobile-tab-btn', { hasText: label });
  if (await mobileTab.first().isVisible().catch(() => false)) {
    await mobileTab.first().click();
    return;
  }
}

test('coach publica semana y persiste al refrescar', async ({ page }) => {
  await seedCoachSession(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.app-wrap')).toBeVisible();

  const publishBtn = page.getByRole('button', { name: 'Publicar' });
  const modifyBtn = page.getByRole('button', { name: 'Modificar' });
  const saveBtn = page.getByRole('button', { name: 'Guardar cambios' });

  if (await publishBtn.isVisible().catch(() => false)) {
    await publishBtn.click();
  } else if (await modifyBtn.isVisible().catch(() => false)) {
    await modifyBtn.click();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
  }

  await expect(page.locator('.ph .badge', { hasText: 'Publicada' }).first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ph .badge', { hasText: 'Publicada' }).first()).toBeVisible();
});

test('athlete login y navegación principal', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.login-wrap')).toBeVisible();

  await page.getByPlaceholder('Nombre del atleta').fill('Nuria');
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /Entrar/ }).click();
  await expect(page.locator('.app-wrap')).toBeVisible();

  await clickNav(page, 'Semana');
  await expect(page.locator('.sidebar .nav-item.active, .mobile-tab-btn.active', { hasText: /Semana/i }).first()).toBeVisible();

  await clickNav(page, 'Calendario');
  await expect(page.locator('.sidebar .nav-item.active, .mobile-tab-btn.active', { hasText: /Calendario/i }).first()).toBeVisible();

  await clickNav(page, 'Gym');
  await expect(page.locator('.sidebar .nav-item.active, .mobile-tab-btn.active', { hasText: /Gym/i }).first()).toBeVisible();
});
