import crypto from 'node:crypto';
import { config } from '../../config.js';
import { getMongoClient } from '../../storage/providers/mongo/client.js';
import { normalizeCoachId, parseJsonString, safeArray } from '../../storage/providers/mongo/shared.js';
import { publishJogatinaEvent } from './events.js';

const JOGATINA_POINTS_FIRST_JOIN = 1000;
const JOGATINA_POINTS_REJOIN = 100;
const JOGATINA_DAILY_BONUS = 50;
const BET_MIN_CLOSE_MS = 5 * 60 * 1000;
const BET_MAX_CLOSE_MS = 48 * 60 * 60 * 1000;
const BET_RESOLVE_EDIT_WINDOW_MS = 5 * 60 * 1000;
const BET_AUTO_CANCEL_MS = 3 * 60 * 60 * 1000;

const BET_STATUS_OPEN = 'open';
const BET_STATUS_CLOSED = 'closed';
const BET_STATUS_RESOLVED_PENDING_FINAL = 'resolved_pending_final';
const BET_STATUS_CANCELLED_PENDING_FINAL = 'cancelled_pending_final';

const BET_ACTIVE_STATUSES = [
  BET_STATUS_OPEN,
  BET_STATUS_CLOSED,
  BET_STATUS_RESOLVED_PENDING_FINAL,
  BET_STATUS_CANCELLED_PENDING_FINAL,
];

const TX_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  return Math.trunc(parsed);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  safeArray(values).forEach((value) => {
    const safe = String(value || '').trim();
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    result.push(safe);
  });
  return result;
}

function normalizeCode5(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 5 ? digits : '';
}

function parseIsoDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function randomGroupCode5() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function walletId(athleteId, seasonKey) {
  return `${String(athleteId || '').trim()}::${String(seasonKey || '').trim()}`;
}

function wagerId(betId, athleteId) {
  return `${String(betId || '').trim()}::${String(athleteId || '').trim()}`;
}

function dailyBonusClaimId(athleteId, localDate) {
  return `${String(athleteId || '').trim()}::${String(localDate || '').trim()}`;
}

function toIsoDateInTimeZone(timeZone, reference = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: String(timeZone || config.appTimezone || 'UTC'),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(reference);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

async function runTransaction(work) {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const db = client.db(config.mongoDbName);
      output = await work({ db, session });
    }, TX_OPTIONS);
    return output;
  } finally {
    await session.endSession();
  }
}

async function resolveSeasonKey(db, coachId, session = null) {
  const safeCoachId = normalizeCoachId(coachId);

  const unlockedSeason = await db.collection('seasons').findOne(
    { coachId: safeCoachId, isLocked: { $ne: true } },
    {
      projection: { seasonId: 1, label: 1, updatedAt: 1, startedAt: 1 },
      sort: { updatedAt: -1, startedAt: -1 },
      session,
    }
  );

  const seasonId = String(unlockedSeason?.seasonId || unlockedSeason?.label || '').trim();
  if (seasonId) return seasonId;

  const stateRow = await db.collection('state_cache').findOne(
    { coachId: safeCoachId, key: 'tf_current_season_id' },
    { projection: { valueJsonString: 1 }, session }
  );

  const parsedState = parseJsonString(stateRow?.valueJsonString, null);
  const rawState = typeof parsedState === 'string'
    ? parsedState
    : String(parsedState == null ? '' : parsedState);
  const normalizedState = rawState.trim();
  if (normalizedState) return normalizedState;

  return `season_${new Date().getUTCFullYear()}`;
}

async function getMembership(db, athleteId, session = null) {
  const safeAthleteId = String(athleteId || '').trim();
  if (!safeAthleteId) return null;
  return await db.collection('jogatina_memberships').findOne(
    { athleteId: safeAthleteId },
    { session }
  );
}

async function getGroup(db, groupId, session = null) {
  const safeGroupId = String(groupId || '').trim();
  if (!safeGroupId) return null;
  return await db.collection('jogatina_groups').findOne(
    { _id: safeGroupId },
    { session }
  );
}

async function listGroupMemberships(db, groupId, session = null) {
  const safeGroupId = String(groupId || '').trim();
  if (!safeGroupId) return [];
  return await db.collection('jogatina_memberships')
    .find({ groupId: safeGroupId }, { session })
    .sort({ joinedAt: 1, athleteId: 1 })
    .toArray();
}

async function listGroupAthleteNameMap(db, coachId, athleteIds, session = null) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeIds = uniqueStrings(athleteIds);
  if (!safeIds.length) return new Map();

  const athletes = await db.collection('athletes')
    .find(
      { coachId: safeCoachId, athleteId: { $in: safeIds } },
      { projection: { athleteId: 1, name: 1, timezone: 1 }, session }
    )
    .toArray();

  const map = new Map();
  athletes.forEach((athlete) => {
    map.set(String(athlete?.athleteId || '').trim(), {
      name: String(athlete?.name || athlete?.athleteId || '').trim() || String(athlete?.athleteId || '').trim(),
      timezone: String(athlete?.timezone || '').trim() || null,
    });
  });
  return map;
}

async function getGroupCarryoverAmount(db, groupId, session = null) {
  const safeGroupId = String(groupId || '').trim();
  if (!safeGroupId) return 0;

  const row = await db.collection('jogatina_group_carryover').findOne(
    { groupId: safeGroupId },
    { projection: { amount: 1 }, session }
  );
  return toPositiveInt(row?.amount, 0);
}

async function setGroupCarryoverAmount(db, coachId, groupId, amount, session = null) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeGroupId = String(groupId || '').trim();
  const safeAmount = toPositiveInt(amount, 0);
  const now = new Date();

  await db.collection('jogatina_group_carryover').updateOne(
    { groupId: safeGroupId },
    {
      $set: {
        _id: safeGroupId,
        coachId: safeCoachId,
        groupId: safeGroupId,
        amount: safeAmount,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, session }
  );
}

async function incrementGroupCarryover(db, coachId, groupId, delta, session = null) {
  const safeDelta = toPositiveInt(delta, 0);
  if (safeDelta <= 0) return;

  const safeCoachId = normalizeCoachId(coachId);
  const safeGroupId = String(groupId || '').trim();
  const now = new Date();

  await db.collection('jogatina_group_carryover').updateOne(
    { groupId: safeGroupId },
    {
      $inc: { amount: safeDelta },
      $set: { _id: safeGroupId, coachId: safeCoachId, groupId: safeGroupId, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, session }
  );
}

async function writeLedger(db, {
  coachId,
  athleteId,
  groupId = null,
  seasonKey,
  delta,
  reason,
  refId,
  meta = null,
  session = null,
}) {
  const safeDelta = Number(delta || 0);
  if (!Number.isFinite(safeDelta) || safeDelta === 0) return;

  await db.collection('jogatina_ledger').insertOne({
    _id: `jog_ledger_${crypto.randomUUID()}`,
    coachId: normalizeCoachId(coachId),
    athleteId: String(athleteId || '').trim(),
    groupId: groupId ? String(groupId).trim() : null,
    seasonKey: String(seasonKey || '').trim(),
    delta: Math.trunc(safeDelta),
    reason: String(reason || 'adjustment').trim() || 'adjustment',
    refId: String(refId || '').trim() || null,
    meta: meta && typeof meta === 'object' ? meta : null,
    createdAt: new Date(),
  }, { session });
}

async function upsertWalletAbsolute(db, {
  coachId,
  athleteId,
  seasonKey,
  nextPoints,
  reason,
  refId,
  groupId = null,
  joinCount,
  touchLastBetActivity = false,
  session = null,
}) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeAthleteId = String(athleteId || '').trim();
  const safeSeasonKey = String(seasonKey || '').trim();
  const safeNextPoints = toPositiveInt(nextPoints, 0);
  const now = new Date();

  const existing = await db.collection('jogatina_wallets').findOne(
    { athleteId: safeAthleteId, seasonKey: safeSeasonKey },
    { session }
  );
  const previousPoints = toPositiveInt(existing?.points, 0);

  const setPayload = {
    _id: walletId(safeAthleteId, safeSeasonKey),
    coachId: safeCoachId,
    athleteId: safeAthleteId,
    seasonKey: safeSeasonKey,
    points: safeNextPoints,
    updatedAt: now,
  };
  if (joinCount != null) {
    setPayload.joinCount = Math.max(toPositiveInt(joinCount, 0), 0);
  }
  if (touchLastBetActivity) {
    setPayload.lastBetActivityAt = now;
  }

  const setOnInsert = { createdAt: now };
  if (joinCount == null) {
    setOnInsert.joinCount = 0;
  }

  await db.collection('jogatina_wallets').updateOne(
    { athleteId: safeAthleteId, seasonKey: safeSeasonKey },
    {
      $set: setPayload,
      $setOnInsert: setOnInsert,
    },
    { upsert: true, session }
  );

  const delta = safeNextPoints - previousPoints;
  if (delta !== 0) {
    await writeLedger(db, {
      coachId: safeCoachId,
      athleteId: safeAthleteId,
      groupId,
      seasonKey: safeSeasonKey,
      delta,
      reason,
      refId,
      session,
    });
  }

  return {
    previousPoints,
    points: safeNextPoints,
    delta,
    joinCount: joinCount != null ? Math.max(toPositiveInt(joinCount, 0), 0) : toPositiveInt(existing?.joinCount, 0),
  };
}

async function adjustWalletPoints(db, {
  coachId,
  athleteId,
  seasonKey,
  delta,
  reason,
  refId,
  groupId = null,
  touchLastBetActivity = false,
  session = null,
}) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeAthleteId = String(athleteId || '').trim();
  const safeSeasonKey = String(seasonKey || '').trim();
  const safeDelta = Math.trunc(Number(delta || 0));
  if (!Number.isFinite(safeDelta) || safeDelta === 0) {
    const wallet = await db.collection('jogatina_wallets').findOne(
      { athleteId: safeAthleteId, seasonKey: safeSeasonKey },
      { projection: { points: 1 }, session }
    );
    return { points: toPositiveInt(wallet?.points, 0), delta: 0 };
  }

  const wallet = await db.collection('jogatina_wallets').findOne(
    { athleteId: safeAthleteId, seasonKey: safeSeasonKey },
    { session }
  );

  const currentPoints = toPositiveInt(wallet?.points, 0);
  const nextPoints = currentPoints + safeDelta;
  if (nextPoints < 0) {
    throw createHttpError(400, 'Saldo insuficiente para realizar la apuesta.');
  }

  const now = new Date();
  const update = {
    _id: walletId(safeAthleteId, safeSeasonKey),
    coachId: safeCoachId,
    athleteId: safeAthleteId,
    seasonKey: safeSeasonKey,
    points: nextPoints,
    updatedAt: now,
  };
  if (touchLastBetActivity) {
    update.lastBetActivityAt = now;
  }

  await db.collection('jogatina_wallets').updateOne(
    { athleteId: safeAthleteId, seasonKey: safeSeasonKey },
    {
      $set: update,
      $setOnInsert: {
        createdAt: now,
        joinCount: wallet?.joinCount != null ? toPositiveInt(wallet.joinCount, 0) : 1,
      },
    },
    { upsert: true, session }
  );

  await writeLedger(db, {
    coachId: safeCoachId,
    athleteId: safeAthleteId,
    groupId,
    seasonKey: safeSeasonKey,
    delta: safeDelta,
    reason,
    refId,
    session,
  });

  return { points: nextPoints, delta: safeDelta };
}

async function ensureWalletsForGroupMembers(db, {
  coachId,
  seasonKey,
  memberships,
  session = null,
}) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeSeasonKey = String(seasonKey || '').trim();
  const rows = safeArray(memberships).filter(Boolean);
  if (!rows.length) return;

  const now = new Date();
  const operations = rows.map((row) => ({
    updateOne: {
      filter: { athleteId: String(row.athleteId || '').trim(), seasonKey: safeSeasonKey },
      update: {
        $setOnInsert: {
          _id: walletId(row.athleteId, safeSeasonKey),
          coachId: safeCoachId,
          athleteId: String(row.athleteId || '').trim(),
          seasonKey: safeSeasonKey,
          points: JOGATINA_POINTS_FIRST_JOIN,
          joinCount: 1,
          createdAt: now,
          updatedAt: now,
          lastBetActivityAt: null,
        },
      },
      upsert: true,
    },
  }));

  if (!operations.length) return;
  await db.collection('jogatina_wallets').bulkWrite(operations, { ordered: false, session });
}

async function assertAthleteInGroup(db, coachId, athleteId, session = null) {
  const safeCoachId = normalizeCoachId(coachId);
  const membership = await getMembership(db, athleteId, session);
  if (!membership) {
    throw createHttpError(404, 'El atleta no pertenece a ningun grupo de Jogatina.');
  }
  if (String(membership.coachId || '').trim() !== safeCoachId) {
    throw createHttpError(403, 'No puedes operar en un grupo de otro entrenador.');
  }
  const group = await getGroup(db, membership.groupId, session);
  if (!group) {
    throw createHttpError(404, 'Grupo de Jogatina no encontrado.');
  }
  return { membership, group };
}

async function ensureNoOpenParticipationForLeaving(db, groupId, _athleteId, session = null) {
  const safeGroupId = String(groupId || '').trim();
  const activeBetCount = await db.collection('jogatina_bets_open').countDocuments(
    { groupId: safeGroupId, status: { $in: BET_ACTIVE_STATUSES } },
    { session }
  );
  if (activeBetCount > 0) {
    throw createHttpError(409, 'No puedes salir del grupo mientras existan apuestas activas.');
  }
}

async function ensureGroupCodeAvailable(db, session = null) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code5 = randomGroupCode5();
    const existing = await db.collection('jogatina_groups').findOne(
      { code5 },
      { projection: { _id: 1 }, session }
    );
    if (!existing) return code5;
  }
  throw createHttpError(500, 'No se pudo generar un codigo unico para el grupo.');
}

function parseCloseAtOrThrow(closeAt) {
  const parsed = parseIsoDateTime(closeAt);
  if (!parsed) {
    throw createHttpError(400, 'closeAt debe ser una fecha/hora valida en formato ISO.');
  }

  const now = Date.now();
  const ms = parsed.getTime();
  const min = now + BET_MIN_CLOSE_MS;
  const max = now + BET_MAX_CLOSE_MS;
  if (ms < min) {
    throw createHttpError(400, 'La apuesta debe cerrar al menos 5 minutos despues de crearla.');
  }
  if (ms > max) {
    throw createHttpError(400, 'La apuesta no puede cerrar mas alla de 48 horas.');
  }

  return parsed;
}

function buildRankRows({ memberships, walletsByAthlete, athletesById }) {
  const rows = safeArray(memberships).map((membership) => {
    const athleteId = String(membership?.athleteId || '').trim();
    const wallet = walletsByAthlete.get(athleteId) || null;
    const athleteMeta = athletesById.get(athleteId) || null;
    return {
      athleteId,
      name: athleteMeta?.name || athleteId,
      points: toPositiveInt(wallet?.points, JOGATINA_POINTS_FIRST_JOIN),
      lastBetActivityAt: wallet?.lastBetActivityAt || null,
      joinedAt: membership?.joinedAt || null,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aActivity = a.lastBetActivityAt ? Date.parse(a.lastBetActivityAt) : 0;
    const bActivity = b.lastBetActivityAt ? Date.parse(b.lastBetActivityAt) : 0;
    if (bActivity !== aActivity) return bActivity - aActivity;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
  });

  return rows;
}

function buildBetRows({ bets, wagers, athletesById, currentAthleteId, memberIds }) {
  const wagerByBet = new Map();
  safeArray(wagers).forEach((wager) => {
    const betId = String(wager?.betId || '').trim();
    if (!betId) return;
    if (!wagerByBet.has(betId)) wagerByBet.set(betId, []);
    wagerByBet.get(betId).push(wager);
  });

  return safeArray(bets).map((bet) => {
    const betId = String(bet?._id || '').trim();
    const betWagers = safeArray(wagerByBet.get(betId)).sort((a, b) => String(a.athleteId || '').localeCompare(String(b.athleteId || '')));
    const stakeTotal = betWagers.reduce((sum, wager) => sum + toPositiveInt(wager?.stake, 0), 0);

    const parsedCloseAt = parseIsoDateTime(bet?.closeAt || null);
    const closeAtIso = parsedCloseAt ? parsedCloseAt.toISOString() : null;

    return {
      id: betId,
      questionText: String(bet?.questionText || '').trim(),
      creatorAthleteId: String(bet?.creatorAthleteId || '').trim(),
      creatorName: athletesById.get(String(bet?.creatorAthleteId || '').trim())?.name || String(bet?.creatorAthleteId || '').trim(),
      closeAt: closeAtIso,
      resolveDeadlineAt: bet?.resolveDeadlineAt ? new Date(bet.resolveDeadlineAt).toISOString() : null,
      resolvedAt: bet?.resolvedAt ? new Date(bet.resolvedAt).toISOString() : null,
      resolvedEditableUntil: bet?.resolvedEditableUntil ? new Date(bet.resolvedEditableUntil).toISOString() : null,
      winnerAthleteIds: uniqueStrings(bet?.winnerAthleteIds),
      status: String(bet?.status || BET_STATUS_OPEN),
      carryoverIn: toPositiveInt(bet?.carryoverIn, 0),
      pool: {
        carryoverIn: toPositiveInt(bet?.carryoverIn, 0),
        staked: stakeTotal,
        total: toPositiveInt(bet?.carryoverIn, 0) + stakeTotal,
      },
      options: uniqueStrings(memberIds).map((athleteId) => ({
        athleteId,
        name: athletesById.get(athleteId)?.name || athleteId,
      })),
      wagers: betWagers.map((wager) => ({
        athleteId: String(wager?.athleteId || '').trim(),
        athleteName: athletesById.get(String(wager?.athleteId || '').trim())?.name || String(wager?.athleteId || '').trim(),
        pickedAthleteId: String(wager?.pickedAthleteId || '').trim(),
        pickedAthleteName: athletesById.get(String(wager?.pickedAthleteId || '').trim())?.name || String(wager?.pickedAthleteId || '').trim(),
        stake: toPositiveInt(wager?.stake, 0),
        isMine: String(wager?.athleteId || '').trim() === String(currentAthleteId || '').trim(),
        updatedAt: wager?.updatedAt ? new Date(wager.updatedAt).toISOString() : null,
      })),
      myWager: (() => {
        const row = betWagers.find((wager) => String(wager?.athleteId || '').trim() === String(currentAthleteId || '').trim());
        if (!row) return null;
        return {
          pickedAthleteId: String(row.pickedAthleteId || '').trim(),
          stake: toPositiveInt(row.stake, 0),
        };
      })(),
    };
  });
}

async function finalizeResolvedBet(betId) {
  const safeBetId = String(betId || '').trim();
  if (!safeBetId) return { finalized: false };

  return await runTransaction(async ({ db, session }) => {
    const bet = await db.collection('jogatina_bets_open').findOne(
      { _id: safeBetId, status: BET_STATUS_RESOLVED_PENDING_FINAL },
      { session }
    );
    if (!bet) return { finalized: false };

    const coachId = normalizeCoachId(bet.coachId);
    const groupId = String(bet.groupId || '').trim();
    const seasonKey = await resolveSeasonKey(db, coachId, session);

    const wagers = await db.collection('jogatina_wagers_open')
      .find({ betId: safeBetId }, { session })
      .toArray();

    const carryoverIn = toPositiveInt(bet.carryoverIn, 0);
    const totalStake = wagers.reduce((sum, wager) => sum + toPositiveInt(wager?.stake, 0), 0);
    const poolTotal = carryoverIn + totalStake;

    const winners = new Set(uniqueStrings(bet.winnerAthleteIds));
    const winningWagers = wagers.filter((wager) => winners.has(String(wager?.pickedAthleteId || '').trim()));
    const totalWinningStake = winningWagers.reduce((sum, wager) => sum + toPositiveInt(wager?.stake, 0), 0);

    let paidOut = 0;
    if (poolTotal > 0 && totalWinningStake > 0) {
      for (const wager of winningWagers) {
        const stake = toPositiveInt(wager?.stake, 0);
        if (stake <= 0) continue;
        const payout = Math.floor((poolTotal * stake) / totalWinningStake);
        if (payout <= 0) continue;
        paidOut += payout;
        await adjustWalletPoints(db, {
          coachId,
          athleteId: String(wager?.athleteId || '').trim(),
          seasonKey,
          delta: payout,
          reason: 'bet_payout',
          refId: safeBetId,
          groupId,
          session,
        });
      }
    }

    const residue = Math.max(poolTotal - paidOut, 0);
    if (residue > 0) {
      await incrementGroupCarryover(db, coachId, groupId, residue, session);
    }

    await db.collection('jogatina_wagers_open').deleteMany({ betId: safeBetId }, { session });
    await db.collection('jogatina_bets_open').deleteOne({ _id: safeBetId }, { session });

    return {
      finalized: true,
      coachId,
      groupId,
      outcome: {
        betId: safeBetId,
        poolTotal,
        paidOut,
        residue,
        hadWinners: totalWinningStake > 0,
      },
    };
  });
}

async function finalizeCancelledBet(betId) {
  const safeBetId = String(betId || '').trim();
  if (!safeBetId) return { finalized: false };

  return await runTransaction(async ({ db, session }) => {
    const bet = await db.collection('jogatina_bets_open').findOne(
      { _id: safeBetId, status: BET_STATUS_CANCELLED_PENDING_FINAL },
      { session }
    );
    if (!bet) return { finalized: false };

    const coachId = normalizeCoachId(bet.coachId);
    const groupId = String(bet.groupId || '').trim();
    const seasonKey = await resolveSeasonKey(db, coachId, session);

    const wagers = await db.collection('jogatina_wagers_open')
      .find({ betId: safeBetId }, { session })
      .toArray();

    for (const wager of wagers) {
      const refund = toPositiveInt(wager?.stake, 0);
      if (refund <= 0) continue;
      await adjustWalletPoints(db, {
        coachId,
        athleteId: String(wager?.athleteId || '').trim(),
        seasonKey,
        delta: refund,
        reason: 'bet_refund_timeout',
        refId: safeBetId,
        groupId,
        session,
      });
    }

    const carryoverIn = toPositiveInt(bet?.carryoverIn, 0);
    if (carryoverIn > 0) {
      await incrementGroupCarryover(db, coachId, groupId, carryoverIn, session);
    }

    await db.collection('jogatina_wagers_open').deleteMany({ betId: safeBetId }, { session });
    await db.collection('jogatina_bets_open').deleteOne({ _id: safeBetId }, { session });

    return {
      finalized: true,
      coachId,
      groupId,
      outcome: {
        betId: safeBetId,
        refundedStake: wagers.reduce((sum, wager) => sum + toPositiveInt(wager?.stake, 0), 0),
        carryoverReturned: carryoverIn,
      },
    };
  });
}

async function closeExpiredBets(db, coachId = null) {
  const now = new Date();
  const filter = {
    status: BET_STATUS_OPEN,
    closeAt: { $lte: now },
  };
  if (coachId) filter.coachId = normalizeCoachId(coachId);

  const result = await db.collection('jogatina_bets_open').updateMany(
    filter,
    { $set: { status: BET_STATUS_CLOSED, updatedAt: now } }
  );
  return toPositiveInt(result?.modifiedCount, 0);
}

async function markTimedOutBetsAsCancelled(db, coachId = null) {
  const now = new Date();
  const filter = {
    status: BET_STATUS_CLOSED,
    resolveDeadlineAt: { $lte: now },
  };
  if (coachId) filter.coachId = normalizeCoachId(coachId);

  const result = await db.collection('jogatina_bets_open').updateMany(
    filter,
    { $set: { status: BET_STATUS_CANCELLED_PENDING_FINAL, updatedAt: now } }
  );
  return toPositiveInt(result?.modifiedCount, 0);
}

async function finalizeResolvedBetsForCoach(db, coachId = null, limit = 200) {
  const now = new Date();
  const safeLimit = Math.max(toPositiveInt(limit, 200), 1);
  const filter = {
    status: BET_STATUS_RESOLVED_PENDING_FINAL,
    resolvedEditableUntil: { $lte: now },
  };
  if (coachId) filter.coachId = normalizeCoachId(coachId);

  const candidates = await db.collection('jogatina_bets_open')
    .find(filter, { projection: { _id: 1 } })
    .sort({ resolvedEditableUntil: 1 })
    .limit(safeLimit)
    .toArray();

  let finalized = 0;
  for (const candidate of candidates) {
    const row = await finalizeResolvedBet(candidate?._id);
    if (!row?.finalized) continue;
    finalized += 1;
    publishJogatinaEvent({
      coachId: row.coachId,
      groupId: row.groupId,
      type: 'bet_finalized',
      payload: row.outcome,
    });
  }

  return finalized;
}

async function finalizeCancelledBetsForCoach(db, coachId = null, limit = 200) {
  const safeLimit = Math.max(toPositiveInt(limit, 200), 1);
  const filter = { status: BET_STATUS_CANCELLED_PENDING_FINAL };
  if (coachId) filter.coachId = normalizeCoachId(coachId);

  const candidates = await db.collection('jogatina_bets_open')
    .find(filter, { projection: { _id: 1 } })
    .sort({ updatedAt: 1 })
    .limit(safeLimit)
    .toArray();

  let finalized = 0;
  for (const candidate of candidates) {
    const row = await finalizeCancelledBet(candidate?._id);
    if (!row?.finalized) continue;
    finalized += 1;
    publishJogatinaEvent({
      coachId: row.coachId,
      groupId: row.groupId,
      type: 'bet_cancelled_finalized',
      payload: row.outcome,
    });
  }

  return finalized;
}

async function runRealtimeMaintenance({ coachId = null, limit = 100 } = {}) {
  const safeCoachId = coachId ? normalizeCoachId(coachId) : null;
  const client = await getMongoClient();
  const db = client.db(config.mongoDbName);

  const closed = await closeExpiredBets(db, safeCoachId);
  const marked = await markTimedOutBetsAsCancelled(db, safeCoachId);
  const finalizedResolved = await finalizeResolvedBetsForCoach(db, safeCoachId, limit);
  const finalizedCancelled = await finalizeCancelledBetsForCoach(db, safeCoachId, limit);

  return {
    closed,
    marked,
    finalizedResolved,
    finalizedCancelled,
  };
}

async function awardDailyBonusForAthleteDate(_db, {
  coachId,
  athleteId,
  localDate,
  source = 'completion',
}) {
  const safeCoachId = normalizeCoachId(coachId);
  const safeAthleteId = String(athleteId || '').trim();
  const safeLocalDate = String(localDate || '').trim();
  if (!safeAthleteId || !/^\d{4}-\d{2}-\d{2}$/.test(safeLocalDate)) {
    return { awarded: false, reason: 'invalid_input' };
  }

  return await runTransaction(async ({ db, session }) => {
    const membership = await getMembership(db, safeAthleteId, session);
    if (!membership || String(membership.coachId || '').trim() !== safeCoachId) {
      return { awarded: false, reason: 'no_membership' };
    }

    const completion = await db.collection('athlete_day_status').findOne(
      {
        coachId: safeCoachId,
        athleteId: safeAthleteId,
        dateIso: safeLocalDate,
        plannedSlotsCount: { $gt: 0 },
        $expr: { $gte: ['$doneSlotsCount', '$plannedSlotsCount'] },
      },
      { session }
    );
    if (!completion) {
      return { awarded: false, reason: 'not_completed' };
    }

    const claimDoc = {
      _id: dailyBonusClaimId(safeAthleteId, safeLocalDate),
      coachId: safeCoachId,
      athleteId: safeAthleteId,
      localDate: safeLocalDate,
      source: String(source || 'completion').trim() || 'completion',
      createdAt: new Date(),
    };

    try {
      await db.collection('jogatina_daily_bonus_claims').insertOne(claimDoc, { session });
    } catch (error) {
      if (error?.code === 11000) {
        return { awarded: false, reason: 'already_claimed' };
      }
      throw error;
    }

    const seasonKey = await resolveSeasonKey(db, safeCoachId, session);
    await adjustWalletPoints(db, {
      coachId: safeCoachId,
      athleteId: safeAthleteId,
      seasonKey,
      delta: JOGATINA_DAILY_BONUS,
      reason: 'daily_bonus',
      refId: claimDoc._id,
      groupId: String(membership.groupId || '').trim(),
      session,
    });

    return {
      awarded: true,
      coachId: safeCoachId,
      groupId: String(membership.groupId || '').trim(),
      athleteId: safeAthleteId,
      localDate: safeLocalDate,
      amount: JOGATINA_DAILY_BONUS,
    };
  });
}

function assertAthleteAuth(auth) {
  const role = String(auth?.role || '').trim();
  const athleteId = String(auth?.athleteId || '').trim();
  const coachId = normalizeCoachId(auth?.coachId);
  const userId = String(auth?.userId || '').trim();

  if (!userId) throw createHttpError(401, 'Sesion requerida.');
  if (role !== 'athlete' || !athleteId) throw createHttpError(403, 'Solo atletas autenticados pueden usar Jogatina.');

  return { coachId, athleteId, userId };
}

export function createJogatinaService() {
  return {
    async getState(auth) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      await runRealtimeMaintenance({ coachId, limit: 100 });

      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);

      const membership = await getMembership(db, athleteId);
      const seasonKey = await resolveSeasonKey(db, coachId);

      if (!membership) {
        const wallet = await db.collection('jogatina_wallets').findOne(
          { athleteId, seasonKey },
          { projection: { points: 1, lastBetActivityAt: 1 } }
        );
        return {
          seasonKey,
          featureEnabled: true,
          membership: null,
          group: null,
          wallet: wallet
            ? { points: toPositiveInt(wallet.points, 0), lastBetActivityAt: wallet.lastBetActivityAt || null }
            : null,
          ranking: [],
          bets: [],
          carryoverPool: 0,
        };
      }

      const group = await getGroup(db, membership.groupId);
      if (!group) {
        await db.collection('jogatina_memberships').deleteOne({ athleteId });
        return {
          seasonKey,
          featureEnabled: true,
          membership: null,
          group: null,
          wallet: null,
          ranking: [],
          bets: [],
          carryoverPool: 0,
        };
      }

      const memberships = await listGroupMemberships(db, group._id);
      await ensureWalletsForGroupMembers(db, { coachId, seasonKey, memberships });

      const athleteIds = memberships.map((row) => String(row.athleteId || '').trim()).filter(Boolean);
      const [nameMap, walletRows, carryoverPool, betRows] = await Promise.all([
        listGroupAthleteNameMap(db, coachId, athleteIds),
        db.collection('jogatina_wallets')
          .find({ athleteId: { $in: athleteIds }, seasonKey }, { projection: { athleteId: 1, points: 1, lastBetActivityAt: 1 } })
          .toArray(),
        getGroupCarryoverAmount(db, group._id),
        db.collection('jogatina_bets_open')
          .find({ groupId: group._id, status: { $in: BET_ACTIVE_STATUSES } })
          .sort({ createdAt: -1 })
          .toArray(),
      ]);

      const walletMap = new Map();
      walletRows.forEach((wallet) => {
        walletMap.set(String(wallet?.athleteId || '').trim(), wallet);
      });

      const ranking = buildRankRows({
        memberships,
        walletsByAthlete: walletMap,
        athletesById: nameMap,
      });

      const betIds = betRows.map((row) => String(row?._id || '').trim()).filter(Boolean);
      const wagerRows = betIds.length
        ? await db.collection('jogatina_wagers_open')
          .find({ betId: { $in: betIds } })
          .sort({ updatedAt: -1 })
          .toArray()
        : [];

      const bets = buildBetRows({
        bets: betRows,
        wagers: wagerRows,
        athletesById: nameMap,
        currentAthleteId: athleteId,
        memberIds: athleteIds,
      });

      const currentWallet = walletMap.get(athleteId) || null;

      return {
        seasonKey,
        featureEnabled: true,
        membership: {
          athleteId,
          groupId: String(group._id || '').trim(),
          joinedAt: membership?.joinedAt || null,
          isOwner: String(group.ownerAthleteId || '').trim() === athleteId,
        },
        group: {
          id: String(group._id || '').trim(),
          code5: String(group.code5 || '').trim(),
          name: String(group.name || '').trim(),
          ownerAthleteId: String(group.ownerAthleteId || '').trim(),
          openBetLimit: Math.max(toPositiveInt(group.openBetLimit, 3), 1),
          memberCount: memberships.length,
        },
        wallet: {
          points: toPositiveInt(currentWallet?.points, JOGATINA_POINTS_FIRST_JOIN),
          lastBetActivityAt: currentWallet?.lastBetActivityAt || null,
        },
        ranking,
        bets,
        carryoverPool,
      };
    },

    async createGroup(auth, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const rawName = normalizeName(payload?.name);
      if (rawName.length < 2) {
        throw createHttpError(400, 'El nombre del grupo debe tener al menos 2 caracteres.');
      }

      const result = await runTransaction(async ({ db, session }) => {
        const existingMembership = await getMembership(db, athleteId, session);
        if (existingMembership) {
          throw createHttpError(409, 'Primero debes salir de tu grupo actual para crear otro.');
        }

        const code5 = await ensureGroupCodeAvailable(db, session);
        const seasonKey = await resolveSeasonKey(db, coachId, session);
        const now = new Date();
        const groupId = `jog_group_${crypto.randomUUID()}`;

        await db.collection('jogatina_groups').insertOne({
          _id: groupId,
          coachId,
          ownerAthleteId: athleteId,
          code5,
          name: rawName,
          openBetLimit: 3,
          createdAt: now,
          updatedAt: now,
        }, { session });

        await db.collection('jogatina_memberships').insertOne({
          _id: athleteId,
          coachId,
          athleteId,
          groupId,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        }, { session });

        const existingWallet = await db.collection('jogatina_wallets').findOne(
          { athleteId, seasonKey },
          { session }
        );
        const existingJoinCount = toPositiveInt(existingWallet?.joinCount, 0);
        const isFirstJoinInSeason = !existingWallet || existingJoinCount <= 0;

        await upsertWalletAbsolute(db, {
          coachId,
          athleteId,
          seasonKey,
          nextPoints: isFirstJoinInSeason ? JOGATINA_POINTS_FIRST_JOIN : JOGATINA_POINTS_REJOIN,
          joinCount: existingJoinCount + 1,
          reason: isFirstJoinInSeason ? 'season_first_join' : 'season_rejoin',
          refId: groupId,
          groupId,
          session,
        });

        await setGroupCarryoverAmount(db, coachId, groupId, 0, session);

        return {
          groupId,
          code5,
          seasonKey,
        };
      });

      publishJogatinaEvent({
        coachId,
        groupId: result.groupId,
        type: 'group_created',
        payload: { groupId: result.groupId, code5: result.code5 },
      });

      return result;
    },

    async joinGroup(auth, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const code5 = normalizeCode5(payload?.code5);
      if (!code5) {
        throw createHttpError(400, 'El codigo de grupo debe tener 5 digitos.');
      }

      const result = await runTransaction(async ({ db, session }) => {
        const existingMembership = await getMembership(db, athleteId, session);
        if (existingMembership) {
          throw createHttpError(409, 'Primero debes salir de tu grupo actual para unirte a otro.');
        }

        const group = await db.collection('jogatina_groups').findOne(
          { code5 },
          { session }
        );
        if (!group) {
          throw createHttpError(404, 'No existe ningun grupo con ese codigo.');
        }
        if (String(group.coachId || '').trim() !== coachId) {
          throw createHttpError(403, 'Solo puedes unirte a grupos de tu entrenador.');
        }

        const seasonKey = await resolveSeasonKey(db, coachId, session);
        const now = new Date();

        await db.collection('jogatina_memberships').insertOne({
          _id: athleteId,
          coachId,
          athleteId,
          groupId: String(group._id || '').trim(),
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        }, { session });

        const existingWallet = await db.collection('jogatina_wallets').findOne(
          { athleteId, seasonKey },
          { session }
        );
        const existingJoinCount = toPositiveInt(existingWallet?.joinCount, 0);
        const isFirstJoinInSeason = !existingWallet || existingJoinCount <= 0;

        await upsertWalletAbsolute(db, {
          coachId,
          athleteId,
          seasonKey,
          nextPoints: isFirstJoinInSeason ? JOGATINA_POINTS_FIRST_JOIN : JOGATINA_POINTS_REJOIN,
          joinCount: existingJoinCount + 1,
          reason: isFirstJoinInSeason ? 'season_first_join' : 'season_rejoin',
          refId: String(group._id || '').trim(),
          groupId: String(group._id || '').trim(),
          session,
        });

        return {
          groupId: String(group._id || '').trim(),
          code5: String(group.code5 || '').trim(),
          seasonKey,
        };
      });

      publishJogatinaEvent({
        coachId,
        groupId: result.groupId,
        type: 'group_joined',
        payload: { athleteId },
      });

      return result;
    },

    async leaveGroup(auth) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      await runRealtimeMaintenance({ coachId, limit: 100 });

      const result = await runTransaction(async ({ db, session }) => {
        const membership = await getMembership(db, athleteId, session);
        if (!membership) {
          throw createHttpError(404, 'No perteneces a ningun grupo de Jogatina.');
        }
        if (String(membership.coachId || '').trim() !== coachId) {
          throw createHttpError(403, 'No autorizado para salir de este grupo.');
        }

        const group = await getGroup(db, membership.groupId, session);
        if (!group) {
          await db.collection('jogatina_memberships').deleteOne({ athleteId }, { session });
          return { left: true, groupId: null, deletedGroup: false };
        }

        const groupId = String(group._id || '').trim();
        await ensureNoOpenParticipationForLeaving(db, groupId, athleteId, session);

        await db.collection('jogatina_memberships').deleteOne({ athleteId }, { session });

        const isOwner = String(group.ownerAthleteId || '').trim() === athleteId;
        let deletedGroup = false;
        let nextOwnerAthleteId = null;

        if (isOwner) {
          const nextOwnerMembership = await db.collection('jogatina_memberships').findOne(
            { groupId },
            { sort: { joinedAt: 1, athleteId: 1 }, session }
          );

          if (!nextOwnerMembership) {
            deletedGroup = true;
            await db.collection('jogatina_groups').deleteOne({ _id: groupId }, { session });
            await db.collection('jogatina_group_carryover').deleteOne({ groupId }, { session });
            await db.collection('jogatina_wagers_open').deleteMany({ groupId }, { session });
            await db.collection('jogatina_bets_open').deleteMany({ groupId }, { session });
          } else {
            nextOwnerAthleteId = String(nextOwnerMembership.athleteId || '').trim();
            await db.collection('jogatina_groups').updateOne(
              { _id: groupId },
              { $set: { ownerAthleteId: nextOwnerAthleteId, updatedAt: new Date() } },
              { session }
            );
          }
        }

        return {
          left: true,
          groupId,
          deletedGroup,
          nextOwnerAthleteId,
        };
      });

      if (result.groupId) {
        publishJogatinaEvent({
          coachId,
          groupId: result.groupId,
          type: 'group_left',
          payload: { athleteId, deletedGroup: !!result.deletedGroup, nextOwnerAthleteId: result.nextOwnerAthleteId },
        });
      }

      return result;
    },

    async updateMyGroup(auth, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const name = payload?.name != null ? normalizeName(payload.name) : null;
      const openBetLimit = payload?.openBetLimit != null ? toPositiveInt(payload.openBetLimit, 0) : null;
      await runRealtimeMaintenance({ coachId, limit: 100 });

      const result = await runTransaction(async ({ db, session }) => {
        const { group } = await assertAthleteInGroup(db, coachId, athleteId, session);
        const groupId = String(group._id || '').trim();

        if (String(group.ownerAthleteId || '').trim() !== athleteId) {
          throw createHttpError(403, 'Solo el propietario del grupo puede editar esta configuracion.');
        }

        const update = {};
        if (name != null) {
          if (name.length < 2) {
            throw createHttpError(400, 'El nombre del grupo debe tener al menos 2 caracteres.');
          }
          update.name = name;
        }

        if (openBetLimit != null) {
          if (openBetLimit < 1) {
            throw createHttpError(400, 'El limite de apuestas activas debe ser al menos 1.');
          }
          const currentOpen = await db.collection('jogatina_bets_open').countDocuments(
            { groupId, status: { $in: BET_ACTIVE_STATUSES } },
            { session }
          );
          if (openBetLimit < currentOpen) {
            throw createHttpError(400, 'No puedes fijar un limite menor que las apuestas activas actuales.');
          }
          update.openBetLimit = openBetLimit;
        }

        if (!Object.keys(update).length) {
          return {
            groupId,
            name: String(group.name || '').trim(),
            openBetLimit: Math.max(toPositiveInt(group.openBetLimit, 3), 1),
            changed: false,
          };
        }

        update.updatedAt = new Date();
        await db.collection('jogatina_groups').updateOne({ _id: groupId }, { $set: update }, { session });

        const fresh = await db.collection('jogatina_groups').findOne({ _id: groupId }, { session });
        return {
          groupId,
          name: String(fresh?.name || '').trim(),
          openBetLimit: Math.max(toPositiveInt(fresh?.openBetLimit, 3), 1),
          changed: true,
        };
      });

      if (result.changed) {
        publishJogatinaEvent({
          coachId,
          groupId: result.groupId,
          type: 'group_updated',
          payload: { name: result.name, openBetLimit: result.openBetLimit },
        });
      }

      return result;
    },

    async createBet(auth, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const questionText = normalizeName(payload?.questionText);
      if (questionText.length < 3) {
        throw createHttpError(400, 'La pregunta debe tener al menos 3 caracteres.');
      }
      const closeAt = parseCloseAtOrThrow(payload?.closeAt);
      await runRealtimeMaintenance({ coachId, limit: 100 });

      const result = await runTransaction(async ({ db, session }) => {
        const { group } = await assertAthleteInGroup(db, coachId, athleteId, session);
        const groupId = String(group._id || '').trim();
        const openBetLimit = Math.max(toPositiveInt(group.openBetLimit, 3), 1);

        const activeCount = await db.collection('jogatina_bets_open').countDocuments(
          { groupId, status: { $in: BET_ACTIVE_STATUSES } },
          { session }
        );
        if (activeCount >= openBetLimit) {
          throw createHttpError(409, 'El grupo ha alcanzado su limite de apuestas activas.');
        }

        const carryoverIn = await getGroupCarryoverAmount(db, groupId, session);
        if (carryoverIn > 0) {
          await setGroupCarryoverAmount(db, coachId, groupId, 0, session);
        }

        const now = new Date();
        const betId = `jog_bet_${crypto.randomUUID()}`;
        const resolveDeadlineAt = new Date(closeAt.getTime() + BET_AUTO_CANCEL_MS);

        await db.collection('jogatina_bets_open').insertOne({
          _id: betId,
          coachId,
          groupId,
          creatorAthleteId: athleteId,
          questionText,
          closeAt,
          resolveDeadlineAt,
          carryoverIn,
          status: BET_STATUS_OPEN,
          winnerAthleteIds: [],
          resolvedAt: null,
          resolvedEditableUntil: null,
          createdAt: now,
          updatedAt: now,
        }, { session });

        return {
          betId,
          groupId,
          closeAt: closeAt.toISOString(),
          resolveDeadlineAt: resolveDeadlineAt.toISOString(),
          carryoverIn,
        };
      });

      publishJogatinaEvent({
        coachId,
        groupId: result.groupId,
        type: 'bet_created',
        payload: {
          betId: result.betId,
          closeAt: result.closeAt,
          carryoverIn: result.carryoverIn,
        },
      });

      return result;
    },

    async upsertWager(auth, betId, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const safeBetId = String(betId || '').trim();
      if (!safeBetId) {
        throw createHttpError(400, 'betId invalido.');
      }

      const pickedAthleteId = String(payload?.pickedAthleteId || '').trim();
      const stake = toPositiveInt(payload?.stake, 0);
      if (!pickedAthleteId) {
        throw createHttpError(400, 'Debes indicar el atleta seleccionado para la apuesta.');
      }
      if (stake < 1) {
        throw createHttpError(400, 'La apuesta minima es de 1 punto.');
      }

      const result = await runTransaction(async ({ db, session }) => {
        const { membership } = await assertAthleteInGroup(db, coachId, athleteId, session);
        const groupId = String(membership.groupId || '').trim();

        const bet = await db.collection('jogatina_bets_open').findOne(
          { _id: safeBetId, groupId },
          { session }
        );
        if (!bet) {
          throw createHttpError(404, 'Apuesta no encontrada en tu grupo.');
        }

        const now = new Date();
        if (String(bet.status || '') !== BET_STATUS_OPEN || new Date(bet.closeAt).getTime() <= now.getTime()) {
          throw createHttpError(409, 'La apuesta ya esta cerrada y no admite cambios.');
        }

        const memberIds = (await listGroupMemberships(db, groupId, session))
          .map((row) => String(row.athleteId || '').trim())
          .filter(Boolean);
        if (!memberIds.includes(pickedAthleteId)) {
          throw createHttpError(400, 'El atleta seleccionado no pertenece al grupo.');
        }

        const seasonKey = await resolveSeasonKey(db, coachId, session);
        await ensureWalletsForGroupMembers(db, {
          coachId,
          seasonKey,
          memberships: [{ athleteId }],
          session,
        });

        const existing = await db.collection('jogatina_wagers_open').findOne(
          { betId: safeBetId, athleteId },
          { session }
        );

        const previousStake = toPositiveInt(existing?.stake, 0);
        const deltaStake = stake - previousStake;
        if (deltaStake !== 0) {
          await adjustWalletPoints(db, {
            coachId,
            athleteId,
            seasonKey,
            delta: -deltaStake,
            reason: existing ? 'bet_wager_edit' : 'bet_wager_place',
            refId: safeBetId,
            groupId,
            touchLastBetActivity: true,
            session,
          });
        } else {
          await db.collection('jogatina_wallets').updateOne(
            { athleteId, seasonKey },
            { $set: { lastBetActivityAt: now, updatedAt: now } },
            { session }
          );
        }

        await db.collection('jogatina_wagers_open').updateOne(
          { betId: safeBetId, athleteId },
          {
            $set: {
              _id: wagerId(safeBetId, athleteId),
              coachId,
              groupId,
              betId: safeBetId,
              athleteId,
              pickedAthleteId,
              stake,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true, session }
        );

        return {
          betId: safeBetId,
          groupId,
          athleteId,
          pickedAthleteId,
          stake,
          deltaStake,
        };
      });

      publishJogatinaEvent({
        coachId,
        groupId: result.groupId,
        type: 'wager_upserted',
        payload: {
          betId: result.betId,
          athleteId: result.athleteId,
          pickedAthleteId: result.pickedAthleteId,
          stake: result.stake,
        },
      });

      return result;
    },

    async resolveBet(auth, betId, payload = {}) {
      const { coachId, athleteId } = assertAthleteAuth(auth);
      const safeBetId = String(betId || '').trim();
      if (!safeBetId) {
        throw createHttpError(400, 'betId invalido.');
      }

      const winnerAthleteIds = uniqueStrings(payload?.winnerAthleteIds);
      if (!winnerAthleteIds.length) {
        throw createHttpError(400, 'Debes indicar al menos un atleta ganador.');
      }

      const result = await runTransaction(async ({ db, session }) => {
        const { membership } = await assertAthleteInGroup(db, coachId, athleteId, session);
        const groupId = String(membership.groupId || '').trim();

        const bet = await db.collection('jogatina_bets_open').findOne(
          { _id: safeBetId, groupId },
          { session }
        );
        if (!bet) {
          throw createHttpError(404, 'Apuesta no encontrada en tu grupo.');
        }

        if (String(bet.creatorAthleteId || '').trim() !== athleteId) {
          throw createHttpError(403, 'Solo el creador de la pregunta puede resolverla.');
        }

        const now = new Date();
        const closeAt = new Date(bet.closeAt);
        if (closeAt.getTime() > now.getTime()) {
          throw createHttpError(409, 'No puedes resolver una apuesta antes de su cierre.');
        }

        const status = String(bet.status || BET_STATUS_OPEN);
        if (![BET_STATUS_OPEN, BET_STATUS_CLOSED, BET_STATUS_RESOLVED_PENDING_FINAL].includes(status)) {
          throw createHttpError(409, 'Esta apuesta ya no admite resolucion manual.');
        }

        const memberIds = (await listGroupMemberships(db, groupId, session))
          .map((row) => String(row.athleteId || '').trim())
          .filter(Boolean);
        const invalidWinner = winnerAthleteIds.find((winnerId) => !memberIds.includes(winnerId));
        if (invalidWinner) {
          throw createHttpError(400, `El atleta ganador ${invalidWinner} no pertenece al grupo.`);
        }

        let resolvedAt = bet?.resolvedAt ? new Date(bet.resolvedAt) : now;
        let resolvedEditableUntil = bet?.resolvedEditableUntil
          ? new Date(bet.resolvedEditableUntil)
          : new Date(now.getTime() + BET_RESOLVE_EDIT_WINDOW_MS);

        if (status === BET_STATUS_RESOLVED_PENDING_FINAL) {
          if (resolvedEditableUntil.getTime() < now.getTime()) {
            throw createHttpError(409, 'La ventana de edicion de resultado ya ha finalizado.');
          }
        } else {
          resolvedAt = now;
          resolvedEditableUntil = new Date(now.getTime() + BET_RESOLVE_EDIT_WINDOW_MS);
        }

        await db.collection('jogatina_bets_open').updateOne(
          { _id: safeBetId },
          {
            $set: {
              status: BET_STATUS_RESOLVED_PENDING_FINAL,
              winnerAthleteIds,
              resolvedAt,
              resolvedEditableUntil,
              updatedAt: now,
            },
          },
          { session }
        );

        return {
          betId: safeBetId,
          groupId,
          status: BET_STATUS_RESOLVED_PENDING_FINAL,
          winnerAthleteIds,
          resolvedAt: resolvedAt.toISOString(),
          resolvedEditableUntil: resolvedEditableUntil.toISOString(),
        };
      });

      publishJogatinaEvent({
        coachId,
        groupId: result.groupId,
        type: 'bet_resolved_pending',
        payload: {
          betId: result.betId,
          winnerAthleteIds: result.winnerAthleteIds,
          resolvedEditableUntil: result.resolvedEditableUntil,
        },
      });

      return result;
    },

    async closeExpiredBets({ coachId = null } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);
      const closed = await closeExpiredBets(db, coachId);
      return { closed };
    },

    async markTimedOutBetsAsCancelled({ coachId = null } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);
      const marked = await markTimedOutBetsAsCancelled(db, coachId);
      return { marked };
    },

    async finalizeResolvedBets({ coachId = null, limit = 200 } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);
      const finalized = await finalizeResolvedBetsForCoach(db, coachId, limit);
      return { finalized };
    },

    async finalizeCancelledBets({ coachId = null, limit = 200 } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);
      const finalized = await finalizeCancelledBetsForCoach(db, coachId, limit);
      return { finalized };
    },

    async runDailyBonusSweep({ coachId = null, lookbackDays = 2 } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);
      const safeLookbackDays = Math.max(toPositiveInt(lookbackDays, 2), 1);

      const now = new Date();
      const threshold = new Date(now.getTime() - safeLookbackDays * 24 * 60 * 60 * 1000);
      const filter = {
        plannedSlotsCount: { $gt: 0 },
        $expr: { $gte: ['$doneSlotsCount', '$plannedSlotsCount'] },
        updatedAt: { $gte: threshold },
      };
      if (coachId) filter.coachId = normalizeCoachId(coachId);

      const rows = await db.collection('athlete_day_status')
        .find(filter, { projection: { coachId: 1, athleteId: 1, dateIso: 1 } })
        .toArray();

      let awarded = 0;
      for (const row of rows) {
        const result = await awardDailyBonusForAthleteDate(db, {
          coachId: normalizeCoachId(row?.coachId),
          athleteId: String(row?.athleteId || '').trim(),
          localDate: String(row?.dateIso || '').trim(),
          source: 'daily_bonus_cron',
        });
        if (!result?.awarded) continue;
        awarded += 1;
        publishJogatinaEvent({
          coachId: result.coachId,
          groupId: result.groupId,
          type: 'daily_bonus_awarded',
          payload: {
            athleteId: result.athleteId,
            localDate: result.localDate,
            amount: result.amount,
          },
        });
      }

      return { awarded };
    },

    async cleanupOrphans({ coachId = null } = {}) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);

      const groupFilter = coachId ? { coachId: normalizeCoachId(coachId) } : {};
      const activeGroups = await db.collection('jogatina_groups').find(groupFilter, { projection: { _id: 1 } }).toArray();
      const groupIds = activeGroups.map((row) => String(row?._id || '').trim()).filter(Boolean);

      const wagerDeleteFilter = groupIds.length
        ? { groupId: { $nin: groupIds } }
        : {};
      const betDeleteFilter = groupIds.length
        ? { groupId: { $nin: groupIds } }
        : {};

      if (coachId) {
        wagerDeleteFilter.coachId = normalizeCoachId(coachId);
        betDeleteFilter.coachId = normalizeCoachId(coachId);
      }

      const [deletedWagers, deletedBets] = await Promise.all([
        db.collection('jogatina_wagers_open').deleteMany(wagerDeleteFilter),
        db.collection('jogatina_bets_open').deleteMany(betDeleteFilter),
      ]);

      return {
        deletedWagers: toPositiveInt(deletedWagers?.deletedCount, 0),
        deletedBets: toPositiveInt(deletedBets?.deletedCount, 0),
      };
    },

    async runMaintenance({ coachId = null } = {}) {
      const safeCoachId = coachId ? normalizeCoachId(coachId) : null;
      const stepClose = await this.closeExpiredBets({ coachId: safeCoachId });
      const stepCancelMark = await this.markTimedOutBetsAsCancelled({ coachId: safeCoachId });
      const stepFinalizeResolved = await this.finalizeResolvedBets({ coachId: safeCoachId });
      const stepFinalizeCancelled = await this.finalizeCancelledBets({ coachId: safeCoachId });
      const stepBonus = await this.runDailyBonusSweep({ coachId: safeCoachId });
      const stepCleanup = await this.cleanupOrphans({ coachId: safeCoachId });

      return {
        closeExpired: stepClose,
        markTimedOut: stepCancelMark,
        finalizeResolved: stepFinalizeResolved,
        finalizeCancelled: stepFinalizeCancelled,
        dailyBonus: stepBonus,
        cleanup: stepCleanup,
      };
    },

    async awardDailyCompletionBonus({ coachId, athleteId, dateIso, timezone = null, source = 'day_status_update' }) {
      const client = await getMongoClient();
      const db = client.db(config.mongoDbName);

      const localDate = String(dateIso || '').trim() || toIsoDateInTimeZone(timezone || config.appTimezone);
      const result = await awardDailyBonusForAthleteDate(db, {
        coachId,
        athleteId,
        localDate,
        source,
      });

      if (result?.awarded) {
        publishJogatinaEvent({
          coachId: result.coachId,
          groupId: result.groupId,
          type: 'daily_bonus_awarded',
          payload: {
            athleteId: result.athleteId,
            localDate: result.localDate,
            amount: result.amount,
          },
        });
      }

      return result;
    },
  };
}
