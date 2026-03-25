import { config } from '../../../server/src/config.js';
import { createJogatinaService } from '../../../server/src/domain/jogatina/service.js';
import { closeMongoClient, getMongoClient } from '../../../server/src/storage/providers/mongo/client.js';

const jogatinaService = createJogatinaService();

function toPastDate(ms = 60_000) {
  return new Date(Date.now() - ms);
}

function toFutureDate(ms = 10 * 60 * 1000) {
  return new Date(Date.now() + ms);
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(config.mongoDbName);
}

export async function closeTestMongo() {
  await closeMongoClient();
}

export async function getAthleteAuthByName(name) {
  const db = await getDb();
  const athlete = await db.collection('athletes').findOne({
    coachId: config.defaultCoachId,
    name: String(name || '').trim(),
  });
  if (!athlete) {
    throw new Error(`No existe el atleta "${name}" en Mongo.`);
  }
  const athleteId = String(athlete.athleteId || athlete.id || '').trim();
  if (!athleteId) {
    throw new Error(`El atleta "${name}" no tiene athleteId valido.`);
  }
  return {
    userId: `playwright:${athleteId}`,
    role: 'athlete',
    athleteId,
    coachId: String(athlete.coachId || config.defaultCoachId).trim() || config.defaultCoachId,
    athleteName: String(athlete.name || '').trim() || athleteId,
  };
}

export async function ensureJogatinaMembership(auth, groupNamePrefix = 'Grupo QA') {
  const state = await jogatinaService.getState(auth);
  if (state?.membership?.groupId) return state;
  await jogatinaService.createGroup(auth, {
    name: `${groupNamePrefix} ${Date.now().toString(36)}`,
  });
  return await jogatinaService.getState(auth);
}

export async function listMembershipAthletes() {
  const db = await getDb();
  return await db.collection('jogatina_memberships')
    .find({}, { projection: { athleteId: 1, coachId: 1, groupId: 1 } })
    .sort({ athleteId: 1 })
    .toArray();
}

export async function findBetByQuestion(questionText) {
  const db = await getDb();
  return await db.collection('jogatina_bets_open').findOne({
    questionText: String(questionText || '').trim(),
  });
}

export async function forceBetClosedForResolution(betId) {
  const db = await getDb();
  await db.collection('jogatina_bets_open').updateOne(
    { _id: String(betId || '').trim() },
    {
      $set: {
        status: 'closed',
        closeAt: toPastDate(),
        resolveDeadlineAt: toFutureDate(),
        updatedAt: new Date(),
      },
    }
  );
}

export async function expireResolvedBetWindow(betId) {
  const db = await getDb();
  await db.collection('jogatina_bets_open').updateOne(
    { _id: String(betId || '').trim() },
    {
      $set: {
        status: 'resolved_pending_final',
        closeAt: toPastDate(),
        resolvedAt: toPastDate(),
        resolvedEditableUntil: toPastDate(),
        updatedAt: new Date(),
      },
    }
  );
}

export async function finalizeBetForCancellation(betId) {
  const db = await getDb();
  await db.collection('jogatina_bets_open').updateOne(
    { _id: String(betId || '').trim() },
    {
      $set: {
        status: 'closed',
        closeAt: toPastDate(),
        resolveDeadlineAt: toPastDate(),
        updatedAt: new Date(),
      },
    }
  );
}

export async function cleanupBetByQuestion(auth, questionText) {
  const bet = await findBetByQuestion(questionText);
  if (!bet) return { removed: true, hardDeleted: false };

  const status = String(bet.status || '').trim();
  if (status === 'resolved_pending_final') {
    await expireResolvedBetWindow(bet._id);
  } else {
    await finalizeBetForCancellation(bet._id);
  }

  await jogatinaService.getState(auth);

  const remaining = await findBetByQuestion(questionText);
  if (!remaining) {
    return { removed: true, hardDeleted: false };
  }

  const db = await getDb();
  await db.collection('jogatina_wagers_open').deleteMany({ betId: String(remaining._id || '').trim() });
  await db.collection('jogatina_bets_open').deleteOne({ _id: remaining._id });
  return { removed: true, hardDeleted: true };
}

export async function getJogatinaState(auth) {
  return await jogatinaService.getState(auth);
}

export async function createBetAndSelfWager(auth, questionText, stake = 7) {
  const result = await jogatinaService.createBet(auth, {
    questionText: String(questionText || '').trim(),
    closeAt: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
  });
  await jogatinaService.upsertWager(auth, result.betId, {
    pickedAthleteId: String(auth.athleteId || '').trim(),
    stake,
  });
  return result;
}

export async function resolveBetAsSelfWinner(auth, betId) {
  return await jogatinaService.resolveBet(auth, betId, {
    winnerAthleteIds: [String(auth.athleteId || '').trim()],
  });
}
