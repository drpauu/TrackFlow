import { test, expect } from '@playwright/test';

import {
  cleanupBetByQuestion,
  createBetAndSelfWager,
  expireResolvedBetWindow,
  finalizeBetForCancellation,
  findBetByQuestion,
  forceBetClosedForResolution,
  getAthleteAuthByName,
  getJogatinaState,
  listMembershipAthletes,
  resolveBetAsSelfWinner,
} from './support/jogatina.helpers.mjs';
import { uniqueQuestion } from './support/trackflow.helpers.mjs';

test('jogatina permite cargar estado sin sesion usando athleteId abierto', async ({ request }) => {
  const auth = await getAthleteAuthByName('Nuria');
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
});

test('getState carga correctamente para todos los atletas con membership', async () => {
  const memberships = await listMembershipAthletes();
  const failures = [];

  for (const row of memberships) {
    const auth = {
      userId: `playwright:${row.athleteId}`,
      role: 'athlete',
      athleteId: String(row.athleteId || '').trim(),
      coachId: String(row.coachId || '').trim(),
    };

    try {
      const state = await getJogatinaState(auth);
      expect(state?.membership?.groupId).toBeTruthy();
      expect(Array.isArray(state?.ranking)).toBe(true);
      expect(Array.isArray(state?.bets)).toBe(true);
    } catch (error) {
      failures.push({
        athleteId: String(row.athleteId || '').trim(),
        error: error?.message || String(error),
      });
    }
  }

  expect(failures).toEqual([]);
});

test('owner puede autovotarse y el mantenimiento inline finaliza sin cron', async () => {
  const auth = await getAthleteAuthByName('Pelayo');
  const question = uniqueQuestion('e2e_jogatina_domain');
  const cancelQuestion = uniqueQuestion('e2e_jogatina_cancel');

  try {
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
  }
});
