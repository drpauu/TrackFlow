import { test, expect } from '@playwright/test';

import {
  clickNav,
  createTemporaryAthlete,
  loginAthlete,
  removeTemporaryAthlete,
  restoreWeekPlanState,
  seedPublishedThursdayOnlyWeek,
  snapshotWeekPlanState,
  waitForAppReady,
} from './support/trackflow.helpers.mjs';

test('el atleta puede abrir el modal y guardar una competición con marca objetivo desde su calendario', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Competiciones' });
  const competitionName = `Control QA ${Date.now()}`;
  const targetMark = '3:58.20';

  try {
    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    await page.getByRole('button', { name: 'Añadir competición' }).click();

    const modal = page.locator('.modal').filter({
      has: page.getByText('Añadir competición'),
    }).first();
    await expect(modal).toBeVisible();

    await modal.getByLabel('Nombre').fill(competitionName);
    await modal.getByLabel('Marca objetivo (opcional)').fill(targetMark);
    await modal.getByRole('button', { name: 'Guardar competición' }).click();

    await expect(modal).toBeHidden();
    await expect(page.locator('.athlete-comp-list')).toContainText(competitionName);
    await expect(page.locator('.athlete-comp-list')).toContainText(targetMark);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page.locator('.app-wrap')).toContainText(competitionName);
    await expect(page.locator('.app-wrap')).toContainText(targetMark);
  } finally {
    await removeTemporaryAthlete(seed);
  }
});

test('el calendario del atleta no replica un jueves publicado en otros jueves del mes', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Calendario Exacto' });
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedThursdayOnlyWeek({
    sessionName: `Control exacto ${Date.now()}`,
  });

  try {
    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    const targetDay = page.locator('.cal-cell').filter({ hasText: /^26$/ }).first();
    const previousThursday = page.locator('.cal-cell').filter({ hasText: /^19$/ }).first();

    await expect(targetDay).toBeVisible();
    await expect(previousThursday).toBeVisible();
    await expect(targetDay).toHaveClass(/has-training/);
    await expect(previousThursday).not.toHaveClass(/has-training/);

    await previousThursday.click();
    const detail = page.locator('.athlete-cal-detail').first();
    await expect(detail).toContainText('Jueves 2026-03-19');
    await expect(detail).toContainText('Sin plan asignado a tus grupos para este día.');
    await expect(detail).not.toContainText(seededWeek.sessionName);

    await targetDay.click();
    await expect(detail).toContainText('Jueves 2026-03-26');
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});
