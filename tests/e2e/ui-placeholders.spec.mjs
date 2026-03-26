import { test, expect } from '@playwright/test';

import {
  clickNav,
  createTemporaryAthlete,
  loginAthlete,
  loginCoach,
  removeTemporaryAthlete,
} from './support/trackflow.helpers.mjs';

test('las vistas del atleta usan emoji reales en placeholders y botones visibles', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Placeholders' });

  try {
    await loginAthlete(page, seed.athleteName, seed.password);

    const todayCard = page.locator('.card').filter({
      hasText: /SEMANA NO PUBLICADA|SIN PLAN ASIGNADO|DÍA DE DESCANSO/,
    }).first();
    await expect(todayCard).toBeVisible();
    await expect(todayCard).toContainText(/🔒|👥|🛌/);

    await clickNav(page, 'Mi Calendario');

    const calendarPlaceholder = page.locator('.athlete-cal-placeholder').first();
    await expect(calendarPlaceholder).toBeVisible();
    await expect(calendarPlaceholder).toContainText('📅');

    await page.locator('.athlete-cal-month-grid .cal-cell').first().click();
    const detailClose = page.locator('.athlete-cal-detail').getByRole('button', { name: 'Cerrar' });
    await expect(detailClose).toBeVisible();
  } finally {
    await removeTemporaryAthlete(seed);
  }
});

test('las vistas del coach muestran iconos reales en calendario y dataset', async ({ page }) => {
  await loginCoach(page);

  await clickNav(page, 'Calendario');
  const coachCalendarPlaceholder = page.locator('.card').filter({
    hasText: 'Selecciona un día para ver el detalle.',
  }).first();
  await expect(coachCalendarPlaceholder).toBeVisible();
  await expect(coachCalendarPlaceholder).toContainText('📅');

  await clickNav(page, 'Dataset Ejercicios');
  const sentadillaRow = page.locator('.exercise-compact-row').filter({ hasText: 'Sentadilla' }).first();
  await expect(sentadillaRow).toBeVisible();
  await expect(sentadillaRow).toContainText('🦵');
});
