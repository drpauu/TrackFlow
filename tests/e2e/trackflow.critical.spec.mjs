import { test, expect } from '@playwright/test';

import {
  clickNav,
  loginAthlete,
  seedCoachSession,
  waitForAppReady,
} from './support/trackflow.helpers.mjs';

test('coach con sesion persistida mantiene la semana publicada tras refrescar', async ({ page }) => {
  await seedCoachSession(page);
  const publishedBadge = page.locator('.ph .badge').filter({ hasText: 'Publicada' }).first();

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

  await expect(publishedBadge).toBeVisible({ timeout: 15_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await expect(publishedBadge).toBeVisible({ timeout: 15_000 });
});

test('athlete login real y navegacion principal base', async ({ page }) => {
  await loginAthlete(page, 'Nuria');

  await clickNav(page, 'Semana');
  await expect(page.locator('.ph-title', { hasText: /SEMANA/i }).first()).toBeVisible();

  await clickNav(page, 'Gym');
  await expect(page.locator('.ph-title', { hasText: /GYM/i }).first()).toBeVisible();
});
