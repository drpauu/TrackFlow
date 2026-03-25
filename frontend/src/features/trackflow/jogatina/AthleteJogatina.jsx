import { useCallback, useEffect, useMemo, useState } from 'react';
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

function formatBetStatusLabel(status) {
  const safeStatus = String(status || '').trim();
  if (safeStatus === 'open') return 'Abierta';
  if (safeStatus === 'closed') return 'Cerrada';
  if (safeStatus === 'resolved_pending_final') return 'Resultado editable';
  if (safeStatus === 'cancelled_pending_final') return 'Cancelándose';
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
    return 'Se está cancelando y devolviendo los puntos apostados.';
  }
  return '';
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
  }, [state, loadState, athleteId]);

  const bets = useMemo(() => state?.bets || [], [state]);
  const ranking = useMemo(() => state?.ranking || [], [state]);
  const isOwner = !!state?.membership?.isOwner;

  const runAction = useCallback(async (task) => {
    setBusy(true);
    setError('');
    try {
      await task();
      await loadState();
    } catch (actionError) {
      setError(actionError?.message || 'Operación no disponible.');
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
      setError('El código de grupo debe tener 5 dígitos.');
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
      setError('La apuesta mínima es 1 punto.');
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
      const current = new Set(prev[betId] || []);
      if (current.has(winnerId)) current.delete(winnerId);
      else current.add(winnerId);
      return {
        ...prev,
        [betId]: Array.from(current),
      };
    });
  }, []);

  const handleResolve = useCallback((betId) => {
    const winnerAthleteIds = resolveDrafts[betId] || [];
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
          <h2>Jogatina</h2>
          <p>Cargando estado...</p>
        </header>
      </section>
    );
  }

  return (
    <section className="jogatina-panel">
      <header className="jogatina-header">
        <div>
          <h2>Jogatina</h2>
          <p>Apuestas entre atletas con puntos del grupo.</p>
        </div>
        <div className="jogatina-wallet">
          <span>Puntos</span>
          <strong>{state?.wallet?.points ?? 0}</strong>
        </div>
      </header>

      {!!error && <div className="jogatina-error">{error}</div>}

      {!state?.membership && (
        <div className="jogatina-grid">
          <article className="jogatina-card">
            <h3>Crear grupo</h3>
            <div className="jogatina-inline-form">
              <input
                type="text"
                value={createGroupName}
                placeholder="Nombre del grupo"
                onChange={(event) => setCreateGroupName(event.target.value)}
              />
              <button type="button" disabled={busy} onClick={handleCreateGroup}>Crear</button>
            </div>
          </article>

          <article className="jogatina-card">
            <h3>Unirse por código</h3>
            <div className="jogatina-inline-form">
              <input
                type="text"
                value={joinCode}
                placeholder="12345"
                onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
              />
              <button type="button" disabled={busy} onClick={handleJoinGroup}>Unirse</button>
            </div>
          </article>
        </div>
      )}

      {!!state?.membership && (
        <>
          <div className="jogatina-grid">
            <article className="jogatina-card">
              <h3>Tu grupo</h3>
              <p><strong>{state?.group?.name}</strong></p>
              <p>Código: <strong>{state?.group?.code5}</strong></p>
              <button type="button" disabled={busy} onClick={handleLeaveGroup}>Salir del grupo</button>
            </article>

            {isOwner && (
              <article className="jogatina-card">
                <h3>Configurar grupo</h3>
                <label>
                  Nombre
                  <input
                    type="text"
                    value={groupNameDraft}
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                  />
                </label>
                <label>
                  Límite de apuestas activas
                  <input
                    type="number"
                    min={1}
                    value={groupLimitDraft}
                    onChange={(event) => setGroupLimitDraft(event.target.value)}
                  />
                </label>
                <button type="button" disabled={busy} onClick={handleSaveGroupSettings}>Guardar</button>
              </article>
            )}
          </div>

          <article className="jogatina-card">
            <h3>Crear apuesta</h3>
            <label>
              Pregunta
              <input
                type="text"
                value={questionDraft}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="¿Quién hará mejor tiempo hoy?"
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
            <button type="button" disabled={busy} onClick={handleCreateBet}>Publicar apuesta</button>
          </article>

          <div className="jogatina-grid">
            <article className="jogatina-card">
              <h3>Ranking del grupo</h3>
              {!ranking.length && <p>Sin datos de ranking.</p>}
              {!!ranking.length && (
                <ol className="jogatina-ranking">
                  {ranking.map((row) => (
                    <li key={row.athleteId}>
                      <span>{row.name}{row.athleteId === athleteId ? ' (tú)' : ''}</span>
                      <strong>{row.points}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </article>

            <article className="jogatina-card">
              <h3>Carryover</h3>
              <p>Pozo acumulado del grupo:</p>
              <strong className="jogatina-carryover">{state?.carryoverPool ?? 0} pts</strong>
            </article>
          </div>

          <article className="jogatina-card">
            <h3>Apuestas activas</h3>
            {!bets.length && <p>No hay apuestas activas.</p>}
            {!!bets.length && (
              <div className="jogatina-bets">
                {bets.map((bet) => {
                  const canBet = bet.status === 'open';
                  const canResolve = bet.creatorAthleteId === athleteId
                    && (bet.status === 'closed' || bet.status === 'resolved_pending_final');
                  const resolveSelection = resolveDrafts[bet.id] || bet.winnerAthleteIds || [];
                  const wagerDraft = wagerDrafts[bet.id] || { pickedAthleteId: '', stake: '1' };
                  const lifecycleNote = getBetLifecycleNote(bet);
                  return (
                    <section key={bet.id} className="jogatina-bet">
                      <header className="jogatina-bet-head">
                        <h4>{bet.questionText}</h4>
                        <span className={`status status-${bet.status}`}>{formatBetStatusLabel(bet.status)}</span>
                      </header>
                      <p>Creador: <strong>{bet.creatorName}</strong></p>
                      <p>Cierra: <strong>{formatDateTime(bet.closeAt)}</strong></p>
                      <p>Pozo total: <strong>{bet.pool.total} pts</strong> (carryover {bet.pool.carryoverIn})</p>
                      {!!lifecycleNote && (
                        <p className="jogatina-note">{lifecycleNote}</p>
                      )}

                      <div className="jogatina-bet-table-wrap">
                        <table className="jogatina-bet-table">
                          <thead>
                            <tr>
                              <th>Atleta</th>
                              <th>Apuesta por</th>
                              <th>Puntos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(bet.wagers || []).map((row) => (
                              <tr key={`${bet.id}-${row.athleteId}`}>
                                <td>{row.athleteName}{row.isMine ? ' (tú)' : ''}</td>
                                <td>{row.pickedAthleteName}</td>
                                <td>{row.stake}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                      <p className="jogatina-note">Puedes apostar por cualquier miembro del grupo, incluido tu propio atleta.</p>

                      {canResolve && (
                        <div className="jogatina-resolve">
                          <p>Selecciona ganador(es):</p>
                          <div className="jogatina-resolve-grid">
                            {(bet.options || []).map((option) => (
                              <label key={`${bet.id}-winner-${option.athleteId}`}>
                                <input
                                  type="checkbox"
                                  checked={resolveSelection.includes(option.athleteId)}
                                  onChange={() => toggleWinner(bet.id, option.athleteId)}
                                  disabled={busy}
                                />
                                {option.name}
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
          </article>
        </>
      )}
    </section>
  );
}


