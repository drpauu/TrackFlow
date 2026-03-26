import { test, expect } from '@playwright/test';

import {
  cleanupBetByQuestion,
  expireResolvedBetWindow,
  findBetByQuestion,
  forceBetClosedForResolution,
  forceBetExpiredButStillOpen,
} from './support/jogatina.helpers.mjs';
import {
  createTemporaryAthlete,
  logout,
  openJogatina,
  loginAthlete,
  removeTemporaryAthlete,
  uniqueQuestion,
} from './support/trackflow.helpers.mjs';

function toAuth(seed) {
  return {
    userId: `playwright:${seed.athleteId}`,
    role: 'athlete',
    athleteId: seed.athleteId,
    coachId: seed.coachId,
    athleteName: seed.athleteName,
  };
}

test('owner puede crear apuesta, apostar por sí mismo y resolverla desde la UI', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Jogatina UI' });
  const auth = toAuth(seed);
  const question = uniqueQuestion('e2e_jogatina_owner');

  try {
    await loginAthlete(page, auth.athleteName, seed.password);
    await openJogatina(page);

    const guestCreate = page.getByTestId('jogatina-guest-create').first();
    if (await guestCreate.isVisible().catch(() => false)) {
      await guestCreate.getByPlaceholder('Nombre del grupo').fill(`Grupo ${Date.now()}`);
      await guestCreate.getByRole('button', { name: 'Crear grupo' }).click();
      await expect(page.getByTestId('jogatina-hero')).toBeVisible();
    }

    await page.getByTestId('jogatina-create-bet-trigger').click();
    const createBetModal = page.getByTestId('jogatina-create-bet-modal');
    await expect(createBetModal).toBeVisible();
    await createBetModal.getByLabel('Pregunta').fill(question);
    await createBetModal.getByRole('button', { name: 'Publicar apuesta' }).click();
    await expect(createBetModal).toBeHidden();

    const bet = page.getByTestId('jogatina-bet-card').filter({ hasText: question }).first();
    await expect(bet).toBeVisible();

    await bet.getByLabel('Apostar por').selectOption({ label: auth.athleteName });
    await bet.getByLabel('Stake').fill('7');
    await bet.getByRole('button', { name: 'Guardar apuesta' }).click();

    await expect(bet.locator('.jogatina-wager-row', { hasText: auth.athleteName }).first()).toContainText('7');

    const createdBet = await findBetByQuestion(question);
    if (!createdBet?._id) {
      throw new Error(`No se ha encontrado en Mongo la apuesta "${question}".`);
    }

    await forceBetClosedForResolution(createdBet._id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openJogatina(page);

    const closedBet = page.getByTestId('jogatina-bet-card').filter({ hasText: question }).first();
    await expect(closedBet).toBeVisible();
    await expect(closedBet.locator('.status')).toHaveText('Cerrada');

    const selfWinnerLabel = closedBet.locator('.jogatina-resolve-grid label', { hasText: auth.athleteName }).first();
    await selfWinnerLabel.locator('input[type="checkbox"]').check();
    await closedBet.getByRole('button', { name: 'Publicar resultado' }).click();

    await expect(closedBet.locator('.status')).toHaveText('Resultado editable');

    const resolvedBet = await findBetByQuestion(question);
    if (!resolvedBet?._id) {
      throw new Error(`No se ha encontrado en Mongo la apuesta resuelta "${question}".`);
    }

    await expireResolvedBetWindow(resolvedBet._id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openJogatina(page);
    await expect(page.getByTestId('jogatina-bet-card').filter({ hasText: question })).toHaveCount(0);
  } finally {
    await cleanupBetByQuestion(auth, question);
    await removeTemporaryAthlete(seed);
  }
});

test('owner puede publicar resultado aunque la apuesta siga open pero ya haya vencido', async ({ page }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Jogatina Expirada' });
  const auth = toAuth(seed);
  const question = uniqueQuestion('e2e_jogatina_expired_open');

  try {
    await loginAthlete(page, auth.athleteName, seed.password);
    await openJogatina(page);

    const guestCreate = page.getByTestId('jogatina-guest-create').first();
    if (await guestCreate.isVisible().catch(() => false)) {
      await guestCreate.getByPlaceholder('Nombre del grupo').fill(`Grupo ${Date.now()}`);
      await guestCreate.getByRole('button', { name: 'Crear grupo' }).click();
      await expect(page.getByTestId('jogatina-hero')).toBeVisible();
    }

    await page.getByTestId('jogatina-create-bet-trigger').click();
    const createBetModal = page.getByTestId('jogatina-create-bet-modal');
    await expect(createBetModal).toBeVisible();
    await createBetModal.getByLabel('Pregunta').fill(question);
    await createBetModal.getByRole('button', { name: 'Publicar apuesta' }).click();
    await expect(createBetModal).toBeHidden();

    const createdBet = await findBetByQuestion(question);
    if (!createdBet?._id) {
      throw new Error(`No se ha encontrado en Mongo la apuesta "${question}".`);
    }

    await forceBetExpiredButStillOpen(createdBet._id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openJogatina(page);

    const expiredBet = page.getByTestId('jogatina-bet-card').filter({ hasText: question }).first();
    await expect(expiredBet).toBeVisible();
    await expect(expiredBet.locator('.status')).toHaveText('Cerrada');

    const selfWinnerLabel = expiredBet.locator('.jogatina-resolve-grid label', { hasText: auth.athleteName }).first();
    await selfWinnerLabel.locator('input[type="checkbox"]').check();
    await expiredBet.getByRole('button', { name: 'Publicar resultado' }).click();

    await expect(expiredBet.locator('.status')).toHaveText('Resultado editable');
  } finally {
    await cleanupBetByQuestion(auth, question);
    await removeTemporaryAthlete(seed);
  }
});

test('gestionar grupo muestra edición al owner y solo lectura al miembro', async ({ page }) => {
  const owner = await createTemporaryAthlete({ name: 'Atleta QA Owner Grupo' });
  const member = await createTemporaryAthlete({ name: 'Atleta QA Miembro Grupo' });

  try {
    await loginAthlete(page, owner.athleteName, owner.password);
    await openJogatina(page);

    await expect(page.locator('.jogatina-header h2')).toContainText('Jogatina');
    await expect(page.locator('.jogatina-header h2')).toContainText('de corrida');
    await expect(page.locator('.jogatina-panel')).not.toContainText('Modo competición');

    const guestCreate = page.getByTestId('jogatina-guest-create').first();
    if (await guestCreate.isVisible().catch(() => false)) {
      await guestCreate.getByPlaceholder('Nombre del grupo').fill(`Grupo ${Date.now()}`);
      await guestCreate.getByRole('button', { name: 'Crear grupo' }).click();
      await expect(page.getByTestId('jogatina-hero')).toBeVisible();
    }

    const groupCodeText = await page.locator('.jogatina-hero-badge').first().textContent();
    const groupCodeMatch = String(groupCodeText || '').match(/\d{5}/);
    if (!groupCodeMatch) {
      throw new Error(`No se ha encontrado un código de grupo válido en "${groupCodeText}".`);
    }
    const groupCode = groupCodeMatch[0];

    await page.getByTestId('jogatina-manage-group-trigger').click();
    const ownerModal = page.getByTestId('jogatina-manage-group-modal');
    await expect(ownerModal).toBeVisible();
    await expect(ownerModal.getByTestId('jogatina-manage-owner')).toBeVisible();
    await expect(ownerModal.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
    await ownerModal.getByRole('button', { name: 'Cerrar' }).click();

    await logout(page);

    await loginAthlete(page, member.athleteName, member.password);
    await openJogatina(page);

    const guestJoin = page.getByTestId('jogatina-guest-join').first();
    await expect(guestJoin).toBeVisible();
    await guestJoin.getByPlaceholder('12345').fill(groupCode);
    await guestJoin.getByRole('button', { name: 'Unirse por código' }).click();
    await expect(page.getByTestId('jogatina-hero')).toBeVisible();

    await page.getByTestId('jogatina-manage-group-trigger').click();
    const memberModal = page.getByTestId('jogatina-manage-group-modal');
    await expect(memberModal).toBeVisible();
    await expect(memberModal.getByTestId('jogatina-manage-readonly')).toBeVisible();
    await expect(memberModal).toContainText('Solo el creador del grupo puede modificar esta configuración.');
    await expect(memberModal.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
  } finally {
    await removeTemporaryAthlete(owner);
    await removeTemporaryAthlete(member);
  }
});
