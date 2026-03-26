import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import './jogatina.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const JOGATINA_GUEST_ID_KEY = 'tf_jogatina_guest_id';
const JOGATINA_GUEST_NAME_KEY = 'tf_jogatina_guest_name';

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function toLocalInputValue(date = null) {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = value.getFullYear();
  const mm = pad(value.getMonth() + 1);
  const dd = pad(value.getDate());
  const hh = pad(value.getHours());
  const min = pad(value.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function defaultCloseInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  now.setSeconds(0, 0);
  return toLocalInputValue(now);
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPoints(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('es-ES')} pts`;
}

function formatBetStatusLabel(status) {
  const safeStatus = String(status || '').trim();
  if (safeStatus === 'open') return 'Abierta';
  if (safeStatus === 'closed') return 'Cerrada';
  if (safeStatus === 'resolved_pending_final') return 'Resultado editable';
  if (safeStatus === 'cancelled_pending_final') return 'Cancel\u00e1ndose';
  return safeStatus || 'Activa';
}

function getBetLifecycleNote(bet) {
  const status = String(bet?.status || '').trim();
  if (status === 'closed' && bet?.resolveDeadlineAt) {
    return `El creador debe resolverla antes del ${formatDateTime(bet.resolveDeadlineAt)}.`;
  }
  if (status === 'resolved_pending_final' && bet?.resolvedEditableUntil) {
    return `El resultado se puede editar hasta el ${formatDateTime(bet.resolvedEditableUntil)}.`;
  }
  if (status === 'cancelled_pending_final') {
    return 'Se est\u00e1 cancelando y devolviendo los puntos apostados.';
  }
  return '';
}

function getBetSortPriority(status) {
  const safeStatus = String(status || '').trim();
  if (safeStatus === 'open') return 0;
  if (safeStatus === 'closed') return 1;
  if (safeStatus === 'resolved_pending_final') return 2;
  if (safeStatus === 'cancelled_pending_final') return 3;
  return 4;
}

function getStatValueLabel(position) {
  if (!position || position < 1) return '-';
  return `#${position}`;
}

function getPresenceCopy(bet) {
  if (bet?.myWager?.stake) {
    return `Tu apuesta est\u00e1 activa con ${formatPoints(bet.myWager.stake)}.`;
  }
  if (bet?.status === 'open') return 'Todav\u00eda no has apostado.';
  return 'No tienes una apuesta registrada.';
}

function getWagerPickedName(bet) {
  const pickedId = String(bet?.myWager?.pickedAthleteId || '').trim();
  if (!pickedId) return '';
  return bet?.options?.find((option) => option.athleteId === pickedId)?.name || pickedId;
}

function getResolveTitle(status) {
  if (status === 'resolved_pending_final') return 'Resultado provisional';
  return 'Publica el resultado';
}

function getEffectiveBetStatus(bet, referenceTime = Date.now()) {
  const safeStatus = String(bet?.status || '').trim();
  if (safeStatus !== 'open') return safeStatus || 'open';
  const closeAtTime = Date.parse(String(bet?.closeAt || '').trim());
  if (Number.isFinite(closeAtTime) && closeAtTime <= referenceTime) return 'closed';
  return 'open';
}

async function request(path, {
  method = 'GET',
  body = null,
  athleteId = '',
  athleteName = '',
} = {}) {
  const safeAthleteId = String(athleteId || '').trim();
  const safeAthleteName = String(athleteName || '').trim();
  const response = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(safeAthleteId ? { 'x-jogatina-athlete-id': safeAthleteId } : {}),
      ...(safeAthleteName ? { 'x-jogatina-athlete-name': safeAthleteName } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function JogatinaModal({
  open,
  title,
  description = '',
  onClose,
  children,
  testId,
  width = 560,
}) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="modal-overlay jogatina-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="modal jogatina-modal"
        data-testid={testId}
        style={{ maxWidth: width }}
      >
        <div className="jogatina-modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {!!description && <p>{description}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>Cerrar</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function AthleteJogatina({ athlete }) {
  const identity = useMemo(() => {
    const idFromProps = String(athlete?.id || '').trim();
    const nameFromProps = String(athlete?.name || '').trim();
    if (idFromProps) {
      return {
        athleteId: idFromProps,
        athleteName: nameFromProps || 'Atleta',
      };
    }
    if (typeof window === 'undefined') {
      return { athleteId: 'guest_local', athleteName: 'Invitado' };
    }
    let guestId = String(window.localStorage.getItem(JOGATINA_GUEST_ID_KEY) || '').trim();
    if (!guestId) {
      const randomPart = window.crypto?.randomUUID?.()
        || `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
      guestId = `guest_${randomPart}`;
      window.localStorage.setItem(JOGATINA_GUEST_ID_KEY, guestId);
    }
    let guestName = String(window.localStorage.getItem(JOGATINA_GUEST_NAME_KEY) || '').trim();
    if (!guestName) {
      guestName = 'Invitado';
      window.localStorage.setItem(JOGATINA_GUEST_NAME_KEY, guestName);
    }
    return { athleteId: guestId, athleteName: guestName };
  }, [athlete?.id, athlete?.name]);

  const athleteId = identity.athleteId;
  const athleteName = identity.athleteName;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreateBetModal, setShowCreateBetModal] = useState(false);
  const [showManageGroupModal, setShowManageGroupModal] = useState(false);

  const [createGroupName, setCreateGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupLimitDraft, setGroupLimitDraft] = useState('3');
  const [questionDraft, setQuestionDraft] = useState('');
  const [closeAtDraft, setCloseAtDraft] = useState(defaultCloseInput());
  const [wagerDrafts, setWagerDrafts] = useState({});
  const [resolveDrafts, setResolveDrafts] = useState({});

  const jogatinaRequest = useCallback((path, options = {}) => request(path, {
    ...options,
    athleteId,
    athleteName,
  }), [athleteId, athleteName]);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await jogatinaRequest('/api/jogatina/state');
      const nextState = payload?.state || null;
      setState(nextState);
      setGroupNameDraft(nextState?.group?.name || '');
      setGroupLimitDraft(String(nextState?.group?.openBetLimit || 3));

      const nextWagers = {};
      (nextState?.bets || []).forEach((bet) => {
        nextWagers[bet.id] = {
          pickedAthleteId: bet?.myWager?.pickedAthleteId || '',
          stake: String(bet?.myWager?.stake || 1),
        };
      });
      setWagerDrafts(nextWagers);
    } catch (loadError) {
      setError(loadError?.message || 'No se pudo cargar Jogatina.');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [jogatinaRequest]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    if (!state?.membership?.groupId) return undefined;

    let source = null;
    try {
      const streamParams = new URLSearchParams();
      if (athleteId) streamParams.set('athleteId', athleteId);
      source = new EventSource(
        apiUrl(`/api/jogatina/stream${streamParams.toString() ? `?${streamParams}` : ''}`),
        { withCredentials: true }
      );
      source.addEventListener('jogatina_update', () => {
        loadState().catch(() => {});
      });
    } catch {
      // Sin fallback de polling por requisito.
    }

    return () => {
      if (source) source.close();
    };
  }, [state?.membership?.groupId, loadState, athleteId]);

  useEffect(() => {
    if (state?.membership?.groupId) return;
    setShowCreateBetModal(false);
    setShowManageGroupModal(false);
  }, [state?.membership?.groupId]);

  const hasModalOpen = showCreateBetModal || showManageGroupModal;

  useEffect(() => {
    if (!hasModalOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasModalOpen]);

  useEffect(() => {
    if (!hasModalOpen || typeof window === 'undefined') return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setShowCreateBetModal(false);
      setShowManageGroupModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasModalOpen]);

  const bets = useMemo(() => state?.bets || [], [state]);
  const ranking = useMemo(() => state?.ranking || [], [state]);
  const betById = useMemo(() => new Map(bets.map((bet) => [bet.id, bet])), [bets]);
  const sortedBets = useMemo(() => [...bets].sort((a, b) => {
    const priorityDiff = getBetSortPriority(getEffectiveBetStatus(a)) - getBetSortPriority(getEffectiveBetStatus(b));
    if (priorityDiff !== 0) return priorityDiff;
    const aTime = Date.parse(a?.closeAt || a?.resolveDeadlineAt || a?.resolvedEditableUntil || 0) || 0;
    const bTime = Date.parse(b?.closeAt || b?.resolveDeadlineAt || b?.resolvedEditableUntil || 0) || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.questionText || '').localeCompare(String(b?.questionText || ''), 'es', { sensitivity: 'base' });
  }), [bets]);
  const isOwner = !!state?.membership?.isOwner;
  const openBetsCount = useMemo(() => bets.filter((bet) => bet?.status === 'open').length, [bets]);
  const myRankPosition = useMemo(() => {
    const index = ranking.findIndex((row) => row.athleteId === athleteId);
    return index >= 0 ? index + 1 : null;
  }, [ranking, athleteId]);
  const podiumRows = useMemo(() => ranking.slice(0, 3), [ranking]);
  const restRows = useMemo(() => ranking.slice(3), [ranking]);

  const runAction = useCallback(async (task) => {
    setBusy(true);
    setError('');
    try {
      await task();
      await loadState();
    } catch (actionError) {
      setError(actionError?.message || 'Operaci\u00f3n no disponible.');
    } finally {
      setBusy(false);
    }
  }, [loadState]);

  const handleCreateGroup = useCallback(() => {
    const name = createGroupName.trim();
    if (!name) {
      setError('Debes indicar un nombre para el grupo.');
      return;
    }
    runAction(async () => {
      await jogatinaRequest('/api/jogatina/groups', {
        method: 'POST',
        body: { name },
      });
      setCreateGroupName('');
    });
  }, [createGroupName, runAction, jogatinaRequest]);

  const handleJoinGroup = useCallback(() => {
    const code5 = joinCode.replace(/\D/g, '').slice(0, 5);
    if (code5.length !== 5) {
      setError('El c\u00f3digo de grupo debe tener 5 d\u00edgitos.');
      return;
    }
    runAction(async () => {
      await jogatinaRequest('/api/jogatina/groups/join', {
        method: 'POST',
        body: { code5 },
      });
      setJoinCode('');
    });
  }, [joinCode, runAction, jogatinaRequest]);

  const handleLeaveGroup = useCallback(() => {
    runAction(async () => {
      await jogatinaRequest('/api/jogatina/groups/leave', { method: 'POST' });
      setShowManageGroupModal(false);
    });
  }, [runAction, jogatinaRequest]);

  const handleSaveGroupSettings = useCallback(() => {
    runAction(async () => {
      await jogatinaRequest('/api/jogatina/groups/me', {
        method: 'PATCH',
        body: {
          name: groupNameDraft.trim(),
          openBetLimit: Number(groupLimitDraft || 3),
        },
      });
      setShowManageGroupModal(false);
    });
  }, [groupLimitDraft, groupNameDraft, runAction, jogatinaRequest]);

  const handleCreateBet = useCallback(() => {
    const questionText = questionDraft.trim();
    if (!questionText) {
      setError('Debes escribir una pregunta.');
      return;
    }
    if (!closeAtDraft) {
      setError('Debes seleccionar una fecha de cierre.');
      return;
    }
    runAction(async () => {
      await jogatinaRequest('/api/jogatina/bets', {
        method: 'POST',
        body: {
          questionText,
          closeAt: new Date(closeAtDraft).toISOString(),
        },
      });
      setQuestionDraft('');
      setCloseAtDraft(defaultCloseInput());
      setShowCreateBetModal(false);
    });
  }, [closeAtDraft, questionDraft, runAction, jogatinaRequest]);

  const handleWagerChange = useCallback((betId, partial) => {
    setWagerDrafts((prev) => ({
      ...prev,
      [betId]: {
        ...(prev[betId] || { pickedAthleteId: '', stake: '1' }),
        ...partial,
      },
    }));
  }, []);

  const handleSubmitWager = useCallback((betId) => {
    const draft = wagerDrafts[betId] || {};
    const pickedAthleteId = String(draft.pickedAthleteId || '').trim();
    const stake = Number(draft.stake || 0);
    if (!pickedAthleteId) {
      setError('Selecciona el atleta por el que apuestas.');
      return;
    }
    if (!Number.isFinite(stake) || stake < 1) {
      setError('La apuesta m\u00ednima es 1 punto.');
      return;
    }
    runAction(async () => {
      await jogatinaRequest(`/api/jogatina/bets/${encodeURIComponent(betId)}/wager`, {
        method: 'PUT',
        body: {
          pickedAthleteId,
          stake: Math.trunc(stake),
        },
      });
    });
  }, [runAction, wagerDrafts, jogatinaRequest]);

  const toggleWinner = useCallback((betId, winnerId) => {
    setResolveDrafts((prev) => {
      const fallbackSelection = prev[betId] || betById.get(betId)?.winnerAthleteIds || [];
      const current = new Set(fallbackSelection);
      if (current.has(winnerId)) current.delete(winnerId);
      else current.add(winnerId);
      return {
        ...prev,
        [betId]: Array.from(current),
      };
    });
  }, [betById]);

  const handleResolve = useCallback((betId) => {
    const winnerAthleteIds = resolveDrafts[betId] || betById.get(betId)?.winnerAthleteIds || [];
    if (!winnerAthleteIds.length) {
      setError('Selecciona al menos un ganador.');
      return;
    }
    runAction(async () => {
      await jogatinaRequest(`/api/jogatina/bets/${encodeURIComponent(betId)}/resolve`, {
        method: 'POST',
        body: { winnerAthleteIds },
      });
    });
  }, [resolveDrafts, runAction, jogatinaRequest]);

  if (loading) {
    return (
      <section className="jogatina-panel">
        <header className="jogatina-header">
          <div>
            <p className="jogatina-kicker">Jogatina</p>
            <h2>Preparando el tablero</h2>
            <p>Cargando estado del grupo y de las apuestas...</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="jogatina-panel">
      <header className="jogatina-header">
        <div>
          <p className="jogatina-kicker">Jogatina</p>
          <h2>Jogatina <span>de corrida</span></h2>
          <p>Apuestas activas, puntos y ranking del grupo en una sola pantalla.</p>
        </div>
      </header>

      {!!error && <div className="jogatina-error">{error}</div>}

      {!state?.membership && (
        <section className="jogatina-guest" data-testid="jogatina-guest-portal">
          <div className="jogatina-guest-grid">
            <article className="jogatina-card jogatina-entry-card" data-testid="jogatina-guest-create">
              <div className="jogatina-entry-badge">Crear grupo</div>
              <h3>Activa tu grupo</h3>
              <p>Crea el grupo, convi&eacute;rtete en owner y deja listas las primeras apuestas.</p>
              <label>
                Nombre del grupo
                <input
                  type="text"
                  value={createGroupName}
                  placeholder="Nombre del grupo"
                  onChange={(event) => setCreateGroupName(event.target.value)}
                />
              </label>
              <button type="button" disabled={busy} onClick={handleCreateGroup}>Crear grupo</button>
            </article>

            <article className="jogatina-card jogatina-entry-card" data-testid="jogatina-guest-join">
              <div className="jogatina-entry-badge">Unirse por c&oacute;digo</div>
              <h3>Entra en una liga activa</h3>
              <p>Introduce el c&oacute;digo de 5 d&iacute;gitos y entra directo a las apuestas activas.</p>
              <label>
                C&oacute;digo del grupo
                <input
                  type="text"
                  value={joinCode}
                  placeholder="12345"
                  onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </label>
              <button type="button" disabled={busy} onClick={handleJoinGroup}>Unirse por c&oacute;digo</button>
            </article>
          </div>
        </section>
      )}

      {!!state?.membership && (
        <>
          <section className="jogatina-hero" data-testid="jogatina-hero">
            <div className="jogatina-hero-main">
              <div className="jogatina-hero-copy">
                <span className="jogatina-hero-badge">Grupo {state?.group?.code5}</span>
                <h3>{state?.group?.name}</h3>
              </div>

              <div className="jogatina-hero-actions">
                <button
                  type="button"
                  className="jogatina-primary-btn"
                  data-testid="jogatina-create-bet-trigger"
                  disabled={busy}
                  onClick={() => setShowCreateBetModal(true)}
                >
                  Crear apuesta
                </button>
                <button
                  type="button"
                  className="jogatina-secondary-btn"
                  data-testid="jogatina-manage-group-trigger"
                  disabled={busy}
                  onClick={() => setShowManageGroupModal(true)}
                >
                  {isOwner ? 'Gestionar grupo' : 'Ver grupo'}
                </button>
              </div>
            </div>

            <div className="jogatina-hero-stats">
              <article className="jogatina-stat jogatina-stat-points" data-testid="jogatina-points-hero">
                <span>Tus puntos</span>
                <strong>{formatPoints(state?.wallet?.points ?? 0)}</strong>
                <small>Saldo disponible para apostar ahora.</small>
              </article>
              <article className="jogatina-stat">
                <span>Tu posici&oacute;n</span>
                <strong>{getStatValueLabel(myRankPosition)}</strong>
                <small>{myRankPosition ? 'As\u00ed vas en el ranking actual.' : 'A\u00fan sin posici\u00f3n registrada.'}</small>
              </article>
              <article className="jogatina-stat">
                <span>Carryover</span>
                <strong>{formatPoints(state?.carryoverPool ?? 0)}</strong>
                <small>Pozo acumulado pendiente de entrar en juego.</small>
              </article>
              <article className="jogatina-stat">
                <span>Apuestas activas</span>
                <strong>{bets.length}</strong>
                <small>{openBetsCount} abiertas para apostar ahora.</small>
              </article>
            </div>
          </section>

          <div className="jogatina-layout">
            <main className="jogatina-feed">
              <section className="jogatina-card jogatina-feed-card">
                <div className="jogatina-section-head">
                  <div>
                    <p className="jogatina-section-kicker">Feed principal</p>
                    <h3>Apuestas activas</h3>
                    <p>Las abiertas van primero. La acci&oacute;n principal siempre est&aacute; visible en cada apuesta.</p>
                  </div>
                  <div className="jogatina-feed-summary">
                    <strong>{openBetsCount}</strong>
                    <span>abiertas ahora</span>
                  </div>
                </div>

                {!sortedBets.length && (
                  <div className="jogatina-empty-state">
                    <h4>Tu grupo est&aacute; listo para arrancar.</h4>
                    <p>Publica la primera apuesta y empieza a mover puntos, ranking y carryover.</p>
                    <button type="button" disabled={busy} onClick={() => setShowCreateBetModal(true)}>Crear apuesta</button>
                  </div>
                )}

                {!!sortedBets.length && (
                  <div className="jogatina-bets">
                    {sortedBets.map((bet) => {
                      const effectiveStatus = getEffectiveBetStatus(bet);
                      const canBet = effectiveStatus === 'open';
                      const canResolve = bet.creatorAthleteId === athleteId
                        && (effectiveStatus === 'closed' || effectiveStatus === 'resolved_pending_final');
                      const resolveSelection = resolveDrafts[bet.id] || bet.winnerAthleteIds || [];
                      const wagerDraft = wagerDrafts[bet.id] || { pickedAthleteId: '', stake: '1' };
                      const lifecycleNote = getBetLifecycleNote({ ...bet, status: effectiveStatus });
                      const myPickedName = getWagerPickedName(bet);

                      return (
                        <section
                          key={bet.id}
                          className={`jogatina-bet jogatina-bet--${effectiveStatus}`}
                          data-testid="jogatina-bet-card"
                        >
                          <header className="jogatina-bet-head">
                            <div className="jogatina-bet-head-copy">
                              <div className="jogatina-bet-tags">
                                <span className={`status status-${effectiveStatus}`}>{formatBetStatusLabel(effectiveStatus)}</span>
                                <span className={`jogatina-bet-presence ${bet.myWager ? 'is-active' : ''}`}>
                                  {getPresenceCopy({ ...bet, status: effectiveStatus })}
                                </span>
                              </div>
                              <h4>{bet.questionText}</h4>
                              <p className="jogatina-bet-meta">
                                Creada por <strong>{bet.creatorName}</strong> / cierra el <strong>{formatDateTime(bet.closeAt)}</strong>
                              </p>
                              {!!lifecycleNote && <p className="jogatina-note">{lifecycleNote}</p>}
                            </div>

                            <div className="jogatina-bet-pool">
                              <span>Pozo total</span>
                              <strong>{formatPoints(bet.pool.total)}</strong>
                              <small>{formatPoints(bet.pool.staked)} en stakes / {formatPoints(bet.pool.carryoverIn)} de carryover</small>
                            </div>
                          </header>

                          <div className="jogatina-bet-strip">
                            <span className="jogatina-chip">{bet.wagers.length} jugadas</span>
                            <span className="jogatina-chip">Carryover {formatPoints(bet.pool.carryoverIn)}</span>
                            <span className="jogatina-chip">Stake total {formatPoints(bet.pool.staked)}</span>
                            <span className="jogatina-chip">
                              {canBet ? 'Apuesta abierta' : canResolve ? 'Pendiente de resoluci\u00f3n' : 'En revisi\u00f3n'}
                            </span>
                          </div>

                          {!!bet.myWager && (
                            <div className="jogatina-my-wager">
                              Tu jugada: <strong>{formatPoints(bet.myWager.stake)}</strong> por <strong>{myPickedName || 'tu selecci\u00f3n'}</strong>.
                            </div>
                          )}

                          <div className="jogatina-bet-body">
                            <div className="jogatina-bet-market">
                              <div className="jogatina-block-head">
                                <div>
                                  <h5>{canBet ? 'Haz tu apuesta' : 'Mercado de la apuesta'}</h5>
                                  <p>Puedes apostar por cualquier miembro del grupo, incluido tu propio atleta.</p>
                                </div>
                              </div>

                              <div className="jogatina-bet-actions">
                                <label>
                                  Apostar por
                                  <select
                                    value={wagerDraft.pickedAthleteId}
                                    onChange={(event) => handleWagerChange(bet.id, { pickedAthleteId: event.target.value })}
                                    disabled={!canBet || busy}
                                  >
                                    <option value="">Selecciona atleta</option>
                                    {(bet.options || []).map((option) => (
                                      <option key={`${bet.id}-${option.athleteId}`} value={option.athleteId}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Stake
                                  <input
                                    type="number"
                                    min={1}
                                    value={wagerDraft.stake}
                                    onChange={(event) => handleWagerChange(bet.id, { stake: event.target.value })}
                                    disabled={!canBet || busy}
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={!canBet || busy}
                                  onClick={() => handleSubmitWager(bet.id)}
                                >
                                  Guardar apuesta
                                </button>
                              </div>
                            </div>

                            <div className="jogatina-bet-market jogatina-bet-market-activity">
                              <div className="jogatina-block-head">
                                <div>
                                  <h5>Actividad del mercado</h5>
                                  <p>Se muestran primero las jugadas m&aacute;s recientes y queda marcado cu&aacute;ndo la apuesta es tuya.</p>
                                </div>
                              </div>

                              {!bet.wagers?.length && (
                                <p className="jogatina-note">Todav&iacute;a no hay apuestas registradas en esta pregunta.</p>
                              )}

                              {!!bet.wagers?.length && (
                                <div className="jogatina-wager-list">
                                  {bet.wagers.map((row) => (
                                    <div key={`${bet.id}-${row.athleteId}`} className={`jogatina-wager-row ${row.isMine ? 'is-mine' : ''}`}>
                                      <div>
                                        <strong>{row.athleteName}{row.isMine ? ' (t\u00fa)' : ''}</strong>
                                        <span>{row.pickedAthleteName}</span>
                                      </div>
                                      <strong>{formatPoints(row.stake)}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {canResolve && (
                            <div className="jogatina-resolve">
                              <div className="jogatina-block-head">
                                <div>
                                  <h5>{getResolveTitle(bet.status)}</h5>
                                  <p>El owner puede incluirse como ganador si corresponde. No se bloquea el autovoto.</p>
                                </div>
                              </div>
                              <div className="jogatina-resolve-grid">
                                {(bet.options || []).map((option) => (
                                  <label key={`${bet.id}-winner-${option.athleteId}`}>
                                    <input
                                      type="checkbox"
                                      checked={resolveSelection.includes(option.athleteId)}
                                      onChange={() => toggleWinner(bet.id, option.athleteId)}
                                      disabled={busy}
                                    />
                                    <span>{option.name}</span>
                                  </label>
                                ))}
                              </div>
                              <button type="button" disabled={busy} onClick={() => handleResolve(bet.id)}>
                                Publicar resultado
                              </button>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            </main>

            <aside className="jogatina-rail">
              <section className="jogatina-card jogatina-ranking-card" data-testid="jogatina-ranking">
                <div className="jogatina-section-head jogatina-section-head-compact">
                  <div>
                    <p className="jogatina-section-kicker">Rail competitivo</p>
                    <h3>Ranking del grupo</h3>
                    <p>Podio visible de un vistazo y lista compacta para el resto del grupo.</p>
                  </div>
                </div>

                {!ranking.length && <p className="jogatina-note">Todav&iacute;a no hay ranking disponible.</p>}

                {!!podiumRows.length && (
                  <div className="jogatina-podium">
                    {podiumRows.map((row, index) => {
                      const position = index + 1;
                      return (
                        <article
                          key={row.athleteId}
                          className={`jogatina-podium-card position-${position} ${row.athleteId === athleteId ? 'is-me' : ''}`}
                        >
                          <span className="jogatina-podium-position">#{position}</span>
                          <strong>{row.name}</strong>
                          <span>{formatPoints(row.points)}</span>
                          {row.athleteId === athleteId && <em>T&uacute;</em>}
                        </article>
                      );
                    })}
                  </div>
                )}

                {!!restRows.length && (
                  <ol className="jogatina-ranking-list">
                    {restRows.map((row, index) => {
                      const position = index + 4;
                      return (
                        <li key={row.athleteId} className={row.athleteId === athleteId ? 'is-me' : ''}>
                          <span className="jogatina-ranking-position">#{position}</span>
                          <span className="jogatina-ranking-name">
                            {row.name}
                            {row.athleteId === athleteId && <em>T&uacute;</em>}
                          </span>
                          <strong>{row.points}</strong>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

            </aside>
          </div>

          <button
            type="button"
            className="jogatina-floating-create"
            disabled={busy}
            onClick={() => setShowCreateBetModal(true)}
          >
            Crear apuesta
          </button>
        </>
      )}

      <JogatinaModal
        open={showCreateBetModal}
        title="Crear apuesta"
        description={'Pregunta compacta, fecha de cierre y publicaci\u00f3n inmediata sin salir de Jogatina.'}
        onClose={() => setShowCreateBetModal(false)}
        testId="jogatina-create-bet-modal"
      >
        <div className="jogatina-modal-body">
          <label>
            Pregunta
            <input
              type="text"
              value={questionDraft}
              onChange={(event) => setQuestionDraft(event.target.value)}
              placeholder={'\u00bfQui\u00e9n har\u00e1 mejor tiempo hoy?'}
            />
          </label>
          <label>
            Cierre
            <input
              type="datetime-local"
              value={closeAtDraft}
              onChange={(event) => setCloseAtDraft(event.target.value)}
            />
          </label>
          <div className="jogatina-modal-actions">
            <button type="button" className="jogatina-secondary-btn" onClick={() => setShowCreateBetModal(false)}>Cancelar</button>
            <button type="button" disabled={busy} onClick={handleCreateBet}>Publicar apuesta</button>
          </div>
        </div>
      </JogatinaModal>

      <JogatinaModal
        open={showManageGroupModal}
        title={isOwner ? 'Gestionar grupo' : 'Tu grupo'}
        description={isOwner
          ? 'Solo el creador puede ajustar la configuraci\u00f3n del grupo.'
          : 'Consulta la configuraci\u00f3n del grupo y sal si quieres entrar en otro.'}
        onClose={() => setShowManageGroupModal(false)}
        testId="jogatina-manage-group-modal"
        width={720}
      >
        <div className="jogatina-modal-body jogatina-manage-body">
          <section className="jogatina-manage-hero">
            <div className="jogatina-manage-title">
              <span className="jogatina-hero-badge">Grupo {state?.group?.code5 || '-'}</span>
              <h3>{state?.group?.name || 'Grupo sin nombre'}</h3>
              <p>{isOwner ? 'Eres el creador de este grupo.' : 'Estás dentro del grupo como miembro.'}</p>
            </div>
            <div className="jogatina-manage-summary" data-testid="jogatina-manage-summary">
              <div>
                <span>C&oacute;digo</span>
                <strong>{state?.group?.code5 || '-'}</strong>
              </div>
              <div>
                <span>Miembros</span>
                <strong>{state?.group?.memberCount || 0}</strong>
              </div>
              <div>
                <span>Carryover</span>
                <strong>{formatPoints(state?.carryoverPool ?? 0)}</strong>
              </div>
            </div>
          </section>

          <section
            className="jogatina-manage-block"
            data-testid={isOwner ? 'jogatina-manage-owner' : 'jogatina-manage-readonly'}
          >
            <div className="jogatina-block-head">
              <div>
                <h5>Configuraci&oacute;n del grupo</h5>
                <p>
                  {isOwner
                    ? 'Solo el creador del grupo puede modificar esta configuración.'
                    : 'Solo el creador del grupo puede modificar esta configuración.'}
                </p>
              </div>
            </div>

            {isOwner ? (
              <>
                <label>
                  Nombre del grupo
                  <input
                    type="text"
                    value={groupNameDraft}
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                  />
                </label>
                <label>
                  L&iacute;mite de apuestas activas
                  <input
                    type="number"
                    min={1}
                    value={groupLimitDraft}
                    onChange={(event) => setGroupLimitDraft(event.target.value)}
                  />
                </label>
                <div className="jogatina-modal-actions">
                  <button type="button" disabled={busy} onClick={handleSaveGroupSettings}>Guardar cambios</button>
                </div>
              </>
            ) : (
              <div className="jogatina-manage-readonly-grid">
                <div className="jogatina-manage-readonly-row">
                  <span>Nombre del grupo</span>
                  <strong>{state?.group?.name || '-'}</strong>
                </div>
                <div className="jogatina-manage-readonly-row">
                  <span>L&iacute;mite de apuestas activas</span>
                  <strong>{state?.group?.openBetLimit || 0}</strong>
                </div>
              </div>
            )}
          </section>

          <section className="jogatina-manage-footer" data-testid="jogatina-manage-leave">
            <div>
              <h4>Salir del grupo</h4>
              <p>Abandonas el ranking actual, pero conservas el acceso general a Jogatina para entrar en otro grupo.</p>
            </div>
            <button type="button" className="jogatina-danger-btn" disabled={busy} onClick={handleLeaveGroup}>Salir del grupo</button>
          </section>
        </div>
      </JogatinaModal>
    </section>
  );
}
