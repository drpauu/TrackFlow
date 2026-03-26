import { test, expect } from '@playwright/test';

import { ensureJogatinaMembership } from './support/jogatina.helpers.mjs';
import {
  clickNav,
  createTemporaryAthlete,
  loginAthlete,
  loginCoach,
  removeTemporaryAthlete,
} from './support/trackflow.helpers.mjs';

test('coach móvil usa 4 tabs y el logout vive en Temporadas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginCoach(page);

  await expect(page.locator('.mobile-topbar')).toBeVisible();
  await expect(page.locator('.mobile-tabbar .mobile-tab-btn')).toHaveCount(4);
  await expect(page.locator('.mobile-topbar')).not.toContainText('Salir');

  await clickNav(page, 'Temporadas');
  await expect(page.getByTestId('coach-logout-button')).toBeVisible();
});

test('atleta móvil usa 4 tabs y el logout vive en Mi Perfil', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Mobile Smoke' });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAthlete(page, seed.athleteName, seed.password);

    await expect(page.locator('.mobile-topbar')).toBeVisible();
    await expect(page.locator('.mobile-tabbar .mobile-tab-btn')).toHaveCount(4);
    await expect(page.locator('.mobile-topbar')).not.toContainText('Salir');

    await clickNav(page, 'Jogatina');
    await expect(page.locator('.jogatina-panel')).toBeVisible();

    await clickNav(page, 'Hoy');
    await expect(page.locator('.ph-title', { hasText: /HOY/i }).first()).toBeVisible();

    await clickNav(page, 'Mi Perfil');
    await expect(page.getByTestId('athlete-logout-button')).toBeVisible();
  } finally {
    await removeTemporaryAthlete(seed);
  }
});

test('atleta móvil puede ver y abrir gestionar grupo en Jogatina', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Mobile Grupo' });
  const auth = {
    userId: `playwright:${seed.athleteId}`,
    role: 'athlete',
    athleteId: seed.athleteId,
    coachId: seed.coachId,
    athleteName: seed.athleteName,
  };

  try {
    await ensureJogatinaMembership(auth, 'Grupo QA Mobile');

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAthlete(page, seed.athleteName, seed.password);

    await clickNav(page, 'Jogatina');
    await expect(page.getByTestId('jogatina-hero')).toBeVisible();
    await expect(page.getByTestId('jogatina-manage-group-trigger')).toBeVisible();

    await page.getByTestId('jogatina-manage-group-trigger').click();
    await expect(page.getByTestId('jogatina-manage-group-modal')).toBeVisible();
  } finally {
    await removeTemporaryAthlete(seed);
  }
});
