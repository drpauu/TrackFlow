import { EventEmitter } from 'node:events';

const jogatinaEvents = new EventEmitter();
jogatinaEvents.setMaxListeners(0);

export function publishJogatinaEvent(event = {}) {
  const payload = {
    coachId: String(event?.coachId || '').trim() || null,
    groupId: String(event?.groupId || '').trim() || null,
    type: String(event?.type || 'update').trim() || 'update',
    at: event?.at ? new Date(event.at).toISOString() : new Date().toISOString(),
    payload: event?.payload && typeof event.payload === 'object' ? event.payload : {},
  };
  jogatinaEvents.emit('event', payload);
}

export function subscribeJogatinaEvents(listener) {
  if (typeof listener !== 'function') return () => {};
  jogatinaEvents.on('event', listener);
  return () => {
    jogatinaEvents.off('event', listener);
  };
}
