import { test, expect } from '@playwright/test';

import {
  createTemporaryAthlete,
  loginAthlete,
  loginCoach,
  removeTemporaryAthlete,
} from './support/trackflow.helpers.mjs';

const EMOJI_LEG = '\u{1F9B5}';
const EMOJI_LIFT = '\u{1F3CB}\uFE0F';
const EMOJI_CORE = '\u{1F9D8}';
const EMOJI_MANUAL = '\u{1F9E9}';

test('perfil del atleta muestra emoji reales en los marcadores base', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Emoji Perfil' });

  try {
    await loginAthlete(page, seed.athleteName, seed.password);
    await page.getByRole('button', { name: /Mi Perfil/i }).click();
    await expect(page.locator('.athlete-profile-page').first()).toBeVisible();

    const maxCard = page.locator('.profile-max-card').first();
    await expect(maxCard).toBeVisible();

    const squatRow = maxCard.locator('.max-row', { hasText: 'Sentadilla' }).first();
    const deadliftRow = maxCard.locator('.max-row', { hasText: 'Peso Muerto' }).first();

    await expect(squatRow.locator('.max-emoji')).toContainText(EMOJI_LEG);
    await expect(squatRow).not.toContainText('SQ');
    await expect(deadliftRow.locator('.max-emoji')).toContainText(EMOJI_LIFT);
    await expect(deadliftRow).not.toContainText('DL');
  } finally {
    await removeTemporaryAthlete(seed);
  }
});

test('coach guarda emoji inferido y respeta emoji manual en ejercicios personalizados', async ({ page }) => {
  const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const autoName = `Plancha lateral QA ${uniqueSuffix}`;
  const manualName = `Press QA manual ${uniqueSuffix}`;

  await loginCoach(page);
  await page.getByRole('button', { name: /Dataset Ejercicios/i }).click();
  await expect(page.locator('.ph-title', { hasText: /EJERCICIOS/i }).first()).toBeVisible();

  await page.getByRole('button', { name: /\+ Nuevo ejercicio/i }).click();
  const autoForm = page.locator('.card').filter({ hasText: 'Nuevo ejercicio' }).first();
  await autoForm.getByPlaceholder('Nombre del ejercicio').fill(autoName);
  await autoForm.locator('select').first().selectOption('time_reps');
  await autoForm.getByRole('button', { name: 'Guardar ejercicio' }).click();

  const autoRow = page.locator('.exercise-compact-row', { hasText: autoName }).first();
  await expect(autoRow).toBeVisible();
  await expect(autoRow).toContainText(EMOJI_CORE);
  await expect(autoRow).not.toContainText('EX');

  await page.getByRole('button', { name: /\+ Nuevo ejercicio/i }).click();
  const manualForm = page.locator('.card').filter({ hasText: 'Nuevo ejercicio' }).first();
  await manualForm.getByPlaceholder('Nombre del ejercicio').fill(manualName);
  await manualForm.getByPlaceholder('Automático').fill(EMOJI_MANUAL);
  await manualForm.getByRole('button', { name: 'Guardar ejercicio' }).click();

  const manualRow = page.locator('.exercise-compact-row', { hasText: manualName }).first();
  await expect(manualRow).toBeVisible();
  await expect(manualRow).toContainText(EMOJI_MANUAL);
});
