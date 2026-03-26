import { test, expect } from '@playwright/test';

import {
  assignAthleteGroups,
  clickNav,
  createTemporaryAthlete,
  loginCoach,
  loginAthlete,
  removeTemporaryAthlete,
  restoreWeekPlanState,
  seedAthleteHistoryRows,
  seedPublishedCompletionWeek,
  seedPublishedCurrentWeekOnly,
  seedPublishedTargetedWeekOutsideActiveWeek,
  seedPublishedThursdayOnlyWeek,
  seedPublishedThursdayOutsideActiveWeek,
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
    await expect(detail).toContainText('No hay semana publicada para este día.');
    await expect(detail).not.toContainText(seededWeek.sessionName);

    await targetDay.click();
    await expect(detail).toContainText('Jueves 2026-03-26');
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});

test('el calendario del atleta muestra días publicados aunque la semana activa sea otra distinta', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Calendario Multiweek' });
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedThursdayOutsideActiveWeek({
    sessionName: `Control fuera activa ${Date.now()}`,
  });

  try {
    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    const targetDay = page.locator('.cal-cell').filter({ hasText: /^26$/ }).first();
    await expect(targetDay).toBeVisible();
    await expect(targetDay).toHaveClass(/has-training/);

    await targetDay.click();
    const detail = page.locator('.athlete-cal-detail').first();
    await expect(detail).toContainText('Jueves 2026-03-26');
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});

test('el calendario del atleta usa la semana real mapeada por fecha para respetar targetGroup', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Calendario Grupo Objetivo' });
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedTargetedWeekOutsideActiveWeek({
    sessionName: `Control grupo objetivo ${Date.now()}`,
    targetGroup: '800m',
    activeWeekTargetGroup: '1500m',
  });

  try {
    await assignAthleteGroups(seed, ['800m']);

    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    const targetDay = page.locator('.cal-cell').filter({ hasText: /^26$/ }).first();
    await expect(targetDay).toBeVisible();
    await expect(targetDay).toHaveClass(/has-training/);

    await targetDay.click();
    const detail = page.locator('.athlete-cal-detail').first();
    await expect(detail).toContainText('Jueves 2026-03-26');
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});

test('el calendario del atleta pinta rojo, amarillo y verde según el progreso real del día', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Calendario Colores' });
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedCompletionWeek({
    sessionPrefix: `Control color ${Date.now()}`,
  });

  try {
    await seedAthleteHistoryRows({
      athleteId: seed.athleteId,
      rows: [
        { dateIso: seededWeek.fullDateIso, amDone: true, pmDone: false, gymDone: false },
        { dateIso: seededWeek.partialDateIso, amDone: true, pmDone: false, gymDone: false },
        { dateIso: seededWeek.noneDateIso, amDone: false, pmDone: false, gymDone: false },
      ],
    });

    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    const fullDay = page.locator('.cal-cell').filter({ hasText: new RegExp(`^${Number(seededWeek.fullDateIso.slice(-2))}$`) }).first();
    const partialDay = page.locator('.cal-cell').filter({ hasText: new RegExp(`^${Number(seededWeek.partialDateIso.slice(-2))}$`) }).first();
    const noneDay = page.locator('.cal-cell').filter({ hasText: new RegExp(`^${Number(seededWeek.noneDateIso.slice(-2))}$`) }).first();

    await expect(fullDay).toHaveClass(/has-training/);
    await expect(partialDay).toHaveClass(/has-training/);
    await expect(noneDay).toHaveClass(/has-training/);

    await expect(fullDay).toHaveAttribute('style', /74,\s*222,\s*128/);
    await expect(partialDay).toHaveAttribute('style', /255,\s*167,\s*38/);
    await expect(noneDay).toHaveAttribute('style', /248,\s*113,\s*113/);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});

test('el calendario del coach muestra días publicados aunque la semana activa sea otra distinta', async ({ page }) => {
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedThursdayOutsideActiveWeek({
    sessionName: `Control coach fuera activa ${Date.now()}`,
  });

  try {
    await loginCoach(page);
    await clickNav(page, 'Calendario');

    const targetDay = page.locator('.cal-cell').filter({ hasText: /^26$/ }).first();
    await expect(targetDay).toBeVisible();
    await expect(targetDay).toHaveClass(/has-training/);

    await targetDay.click();
    const detail = page.locator('.card').filter({ hasText: /Jueves 2026-03-26/ }).first();
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
  }
});

test('el calendario diario sigue mostrando la semana publicada actual aunque tf_week_plans falte', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Calendario Fallback' });
  const snapshot = await snapshotWeekPlanState();
  const seededWeek = await seedPublishedCurrentWeekOnly({
    sessionName: `Control fallback ${Date.now()}`,
  });

  try {
    await loginAthlete(page, seed.athleteName, seed.password);
    await clickNav(page, 'Mi Calendario');

    const targetDay = page.locator('.cal-cell').filter({ hasText: /^26$/ }).first();
    await expect(targetDay).toBeVisible();
    await expect(targetDay).toHaveClass(/has-training/);

    await targetDay.click();
    const detail = page.locator('.athlete-cal-detail').first();
    await expect(detail).toContainText('Jueves 2026-03-26');
    await expect(detail).toContainText(seededWeek.sessionName);
  } finally {
    await restoreWeekPlanState(snapshot);
    await removeTemporaryAthlete(seed);
  }
});
