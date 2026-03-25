import { test, expect } from '@playwright/test';

import {
  cleanupBetByQuestion,
  createBetAndSelfWager,
  ensureJogatinaMembership,
  expireResolvedBetWindow,
  finalizeBetForCancellation,
  findBetByQuestion,
  forceBetClosedForResolution,
  getJogatinaState,
  resolveBetAsSelfWinner,
} from './support/jogatina.helpers.mjs';
import {
  createTemporaryAthlete,
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

test('jogatina permite cargar estado sin sesion usando athleteId abierto', async ({ request }) => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Jogatina API' });
  const auth = toAuth(seed);
  try {
    await ensureJogatinaMembership(auth, 'Grupo QA API');
    const response = await request.get('/api/jogatina/state', {
      headers: {
        'x-jogatina-athlete-id': auth.athleteId,
        'x-jogatina-athlete-name': auth.athleteName,
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload?.ok).toBeTruthy();
    expect(payload?.state?.membership?.athleteId).toBe(auth.athleteId);
    expect(Array.isArray(payload?.state?.bets)).toBeTruthy();
  } finally {
    await removeTemporaryAthlete(seed);
  }
});

test('owner puede autovotarse y el mantenimiento inline finaliza sin cron', async () => {
  const seed = await createTemporaryAthlete({ name: 'Atleta QA Jogatina Dominio' });
  const auth = toAuth(seed);
  const question = uniqueQuestion('e2e_jogatina_domain');
  const cancelQuestion = uniqueQuestion('e2e_jogatina_cancel');

  try {
    await ensureJogatinaMembership(auth, 'Grupo QA Dominio');
    const created = await createBetAndSelfWager(auth, question, 9);
    await forceBetClosedForResolution(created.betId);

    const resolved = await resolveBetAsSelfWinner(auth, created.betId);
    expect(resolved?.winnerAthleteIds).toContain(auth.athleteId);

    await expireResolvedBetWindow(created.betId);
    await getJogatinaState(auth);

    const afterResolve = await findBetByQuestion(question);
    expect(afterResolve).toBeNull();

    const cancelCreated = await createBetAndSelfWager(auth, cancelQuestion, 5);
    await finalizeBetForCancellation(cancelCreated.betId);
    await getJogatinaState(auth);

    const afterCancel = await findBetByQuestion(cancelQuestion);
    expect(afterCancel).toBeNull();
  } finally {
    await cleanupBetByQuestion(auth, question);
    await cleanupBetByQuestion(auth, cancelQuestion);
    await removeTemporaryAthlete(seed);
  }
});
