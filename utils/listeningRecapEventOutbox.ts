import type { ListeningRecapRecordEventInput } from '../services/supabase/listeningRecapTypes';

export type ListeningRecapEventInput = ListeningRecapRecordEventInput;

export interface ListeningRecapOutboxSendContext {
  hasPriorAttempt: boolean;
}

export interface ListeningRecapOutboxSendResult {
  acknowledged: boolean;
}

export type ListeningRecapOutboxSender = (
  event: ListeningRecapEventInput,
  context: ListeningRecapOutboxSendContext,
) => Promise<ListeningRecapOutboxSendResult>;

export type EnqueueListeningRecapEventResult = 'queued' | 'duplicate' | 'unavailable';

export interface ListeningRecapEventOutboxFlushResult {
  attempted: number;
  acknowledged: number;
  pending: number;
}

interface StoredOutboxEntry {
  event: ListeningRecapEventInput;
  attempted: boolean;
}

const OUTBOX_KEY_PREFIX = 'jzone_listening_recap_event_outbox_v1:';

const acknowledgedEventsByUser = new Map<string, Set<string>>();
const activeFlushes = new Map<string, Promise<ListeningRecapEventOutboxFlushResult>>();

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getStorageKey = (userId: string) => `${OUTBOX_KEY_PREFIX}${userId}`;

const getEventKey = (event: ListeningRecapEventInput) => `event:${event.eventId}`;

const getSessionKey = (event: ListeningRecapEventInput) => `session:${event.playSessionId}:${event.metric}`;

const isFiniteNonNegative = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const normalizeEvent = (value: unknown): ListeningRecapEventInput | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.eventId !== 'string'
    || !candidate.eventId
    || typeof candidate.playSessionId !== 'string'
    || !candidate.playSessionId
    || typeof candidate.songId !== 'string'
    || !candidate.songId
    || candidate.metric !== 'qualified_play'
    || candidate.policyVersion !== 'd1-20pct-v1'
  ) {
    return null;
  }

  return {
    eventId: candidate.eventId,
    playSessionId: candidate.playSessionId,
    songId: candidate.songId,
    metric: 'qualified_play',
    policyVersion: 'd1-20pct-v1',
    observedAt: typeof candidate.observedAt === 'string' ? candidate.observedAt : null,
    qualifyingSeconds: isFiniteNonNegative(candidate.qualifyingSeconds) ? candidate.qualifyingSeconds : null,
    listenedSeconds: isFiniteNonNegative(candidate.listenedSeconds) ? candidate.listenedSeconds : null,
  };
};

const normalizeStoredEntry = (value: unknown): StoredOutboxEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const event = normalizeEvent(candidate.event ?? value);
  if (!event) return null;
  return {
    event,
    attempted: candidate.event !== undefined && candidate.attempted === true,
  };
};

const getAcknowledgedEvents = (userId: string) => {
  let events = acknowledgedEventsByUser.get(userId);
  if (!events) {
    events = new Set<string>();
    acknowledgedEventsByUser.set(userId, events);
  }
  return events;
};

const dedupeEntries = (entries: StoredOutboxEntry[], userId: string) => {
  const eventIds = new Set<string>();
  const sessions = new Set<string>();
  const acknowledged = getAcknowledgedEvents(userId);
  const result: StoredOutboxEntry[] = [];

  for (const entry of entries) {
    const event = entry.event;
    if (
      acknowledged.has(getEventKey(event))
      || acknowledged.has(getSessionKey(event))
      || eventIds.has(event.eventId)
      || sessions.has(getSessionKey(event))
    ) {
      continue;
    }
    eventIds.add(event.eventId);
    sessions.add(getSessionKey(event));
    result.push(entry);
  }

  return result;
};

const readEntries = (userId: string): StoredOutboxEntry[] => {
  if (!userId) return [];
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeEntries(
      parsed.map(normalizeStoredEntry).filter((entry): entry is StoredOutboxEntry => Boolean(entry)),
      userId,
    );
  } catch {
    return [];
  }
};

const writeEntries = (userId: string, entries: StoredOutboxEntry[]) => {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const key = getStorageKey(userId);
    if (!entries.length) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(entries));
    }
    return true;
  } catch {
    return false;
  }
};

export const getListeningRecapEventOutbox = (userId: string): ListeningRecapEventInput[] => (
  readEntries(userId).map((entry) => entry.event)
);

export const enqueueListeningRecapEvent = (
  userId: string,
  input: ListeningRecapEventInput,
): EnqueueListeningRecapEventResult => {
  if (!userId) return 'unavailable';
  const event = normalizeEvent(input);
  if (!event) return 'unavailable';
  const acknowledged = getAcknowledgedEvents(userId);
  if (acknowledged.has(getEventKey(event)) || acknowledged.has(getSessionKey(event))) return 'duplicate';

  const entries = readEntries(userId);
  if (
    entries.some(({ event: existing }) => (
      existing.eventId === event.eventId
      || (
        existing.playSessionId === event.playSessionId
        && existing.metric === event.metric
      )
    ))
  ) {
    return 'duplicate';
  }

  return writeEntries(userId, [...entries, { event, attempted: false }]) ? 'queued' : 'unavailable';
};

const isSameEvent = (left: ListeningRecapEventInput, right: ListeningRecapEventInput) => (
  left.eventId === right.eventId
  || (
    left.playSessionId === right.playSessionId
    && left.metric === right.metric
  )
);

const isRetryableOutboxError = (error: unknown) => {
  if (!error || typeof error !== 'object') return true;
  const retryable = (error as { retryable?: unknown }).retryable;
  return typeof retryable === 'boolean' ? retryable : true;
};

const markEventAttempted = (userId: string, event: ListeningRecapEventInput) => {
  const entries = readEntries(userId);
  const updated = entries.map((entry) => (
    isSameEvent(entry.event, event) ? { ...entry, attempted: true } : entry
  ));
  writeEntries(userId, updated);
};

const removeEvent = (userId: string, event: ListeningRecapEventInput) => {
  const pending = readEntries(userId).filter((entry) => !isSameEvent(entry.event, event));
  writeEntries(userId, pending);
};

const acknowledgeEvent = (userId: string, event: ListeningRecapEventInput) => {
  const acknowledged = getAcknowledgedEvents(userId);
  acknowledged.add(getEventKey(event));
  acknowledged.add(getSessionKey(event));
  const pending = readEntries(userId).filter((entry) => !isSameEvent(entry.event, event));
  writeEntries(userId, pending);
};

const flushEvents = async (
  userId: string,
  sender: ListeningRecapOutboxSender,
): Promise<ListeningRecapEventOutboxFlushResult> => {
  const entries = readEntries(userId);
  let attempted = 0;
  let acknowledged = 0;

  for (const entry of entries) {
    const hasPriorAttempt = entry.attempted;
    entry.attempted = true;
    markEventAttempted(userId, entry.event);
    attempted += 1;
    try {
      const result = await sender(entry.event, { hasPriorAttempt });
      if (!result.acknowledged) break;
      acknowledgeEvent(userId, entry.event);
      acknowledged += 1;
    } catch (error) {
      if (!isRetryableOutboxError(error)) {
        // 终态业务拒绝不会因重试改变结果；移除后继续发送后续事件。
        removeEvent(userId, entry.event);
        continue;
      }
      // 未确认或可重试失败保留事件和重试标记，避免不确定请求后丢失事件。
      break;
    }
  }

  return {
    attempted,
    acknowledged,
    pending: readEntries(userId).length,
  };
};

export const flushListeningRecapEventOutbox = (
  userId: string,
  sender: ListeningRecapOutboxSender,
): Promise<ListeningRecapEventOutboxFlushResult> => {
  if (!userId) return Promise.resolve({ attempted: 0, acknowledged: 0, pending: 0 });

  const active = activeFlushes.get(userId);
  if (active) return active;

  let flushPromise: Promise<ListeningRecapEventOutboxFlushResult>;
  flushPromise = flushEvents(userId, sender).finally(() => {
    if (activeFlushes.get(userId) === flushPromise) activeFlushes.delete(userId);
  });
  activeFlushes.set(userId, flushPromise);
  return flushPromise;
};

export const clearListeningRecapEventOutbox = (userId: string): number => {
  if (!userId) return 0;
  const count = readEntries(userId).length;
  acknowledgedEventsByUser.delete(userId);
  const storage = getStorage();
  try {
    storage?.removeItem(getStorageKey(userId));
  } catch {
    // 存储不可用时不影响退出登录流程。
  }
  return count;
};
