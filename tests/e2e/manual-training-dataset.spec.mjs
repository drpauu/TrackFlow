import { test, expect } from '@playwright/test';

import {
  clickNav,
  loginCoach,
} from './support/trackflow.helpers.mjs';

test('al publicar un entreno manual se guarda en el dataset sin duplicarse', async ({ page }) => {
  const trainingName = `Entreno manual QA ${Date.now()}`;

  await loginCoach(page);

  const publishButton = page.getByRole('button', { name: /^Publicar$/i });
  const modifyButton = page.getByRole('button', { name: /^Modificar$/i });
  if (await modifyButton.isVisible().catch(() => false) && !await publishButton.isVisible().catch(() => false)) {
    await modifyButton.click();
  }

  await page.locator('.day-col').first().getByRole('button', { name: /Editar/i }).click();

  const modal = page.locator('.modal-week-editor').first();
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Escribe el entreno o selecciona del dataset').first().fill(trainingName);
  await modal.getByRole('button', { name: /^Guardar día$/i }).click();
  await expect(modal).toBeHidden();

  const saveWeekButton = page.getByRole('button', { name: /^(Publicar|Guardar cambios)$/i }).first();
  await saveWeekButton.click();

  await clickNav(page, 'Dataset Entrenos');
  const datasetRows = page.locator('table.tbl tbody tr').filter({ hasText: trainingName });
  await expect(datasetRows).toHaveCount(1);

  await clickNav(page, 'Plan Semanal');
  const modifyAfterPublish = page.getByRole('button', { name: /^Modificar$/i });
  if (await modifyAfterPublish.isVisible().catch(() => false)) {
    await modifyAfterPublish.click();
  }
  await page.getByRole('button', { name: /^Guardar cambios$/i }).click();

  await clickNav(page, 'Dataset Entrenos');
  await expect(page.locator('table.tbl tbody tr').filter({ hasText: trainingName })).toHaveCount(1);
});
