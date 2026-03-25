import { test, expect } from '@playwright/test';

import {
  cleanupBetByQuestion,
  expireResolvedBetWindow,
  findBetByQuestion,
  forceBetClosedForResolution,
  getAthleteAuthByName,
} from './support/jogatina.helpers.mjs';
import {
  openJogatina,
  loginAthlete,
  uniqueQuestion,
} from './support/trackflow.helpers.mjs';

test('owner puede crear apuesta, apostar por si mismo y resolverla desde la UI', async ({ page }) => {
  const auth = await getAthleteAuthByName('Nuria');
  const question = uniqueQuestion('e2e_jogatina_owner');

  try {
    await loginAthlete(page, auth.athleteName);
    await openJogatina(page);

    const createBetCard = page.locator('.jogatina-card', {
      has: page.getByRole('heading', { name: 'Crear apuesta' }),
    });

    await createBetCard.getByLabel('Pregunta').fill(question);
    await createBetCard.getByRole('button', { name: 'Publicar apuesta' }).click();

    const bet = page.locator('.jogatina-bet', { hasText: question }).first();
    await expect(bet).toBeVisible();

    await bet.getByLabel('Apostar por').selectOption({ label: auth.athleteName });
    await bet.getByLabel('Stake').fill('7');
    await bet.getByRole('button', { name: 'Guardar apuesta' }).click();

    await expect(bet.locator('tbody tr', { hasText: `${auth.athleteName} (tu)` }).first()).toContainText('7');

    const createdBet = await findBetByQuestion(question);
    if (!createdBet?._id) {
      throw new Error(`No se ha encontrado en Mongo la apuesta "${question}".`);
    }

    await forceBetClosedForResolution(createdBet._id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openJogatina(page);

    const closedBet = page.locator('.jogatina-bet', { hasText: question }).first();
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
    await expect(page.locator('.jogatina-bet', { hasText: question })).toHaveCount(0);
  } finally {
    await cleanupBetByQuestion(auth, question);
  }
});
