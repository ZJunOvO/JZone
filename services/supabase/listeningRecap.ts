import { ensureSupabase } from './client';
import { createSignedCoverUrl } from './storageApi';
import {
  isListeningRecapPeriod,
  normalizeListeningRecapPeriod,
  parseListeningRecapRecordEventResult,
  parseListeningRecapResponse,
  type ListeningRecapErrorCode,
  type ListeningRecapPeriod,
  type ListeningRecapRecordEventInput,
  type ListeningRecapRecordEventResult,
  type ListeningRecapResponse,
  type ListeningRecapResponseError,
  type ListeningRecapSong,
} from './listeningRecapTypes';

export interface ListeningRecapApiErrorInit {
  code: ListeningRecapErrorCode;
  retryable: boolean;
  message?: string;
  cause?: unknown;
}

export class ListeningRecapApiError extends Error {
  readonly code: ListeningRecapErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor({ code, retryable, message, cause }: ListeningRecapApiErrorInit) {
    super(message ?? '聆听回顾暂时不可用');
    this.name = 'ListeningRecapApiError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

// 接受所有规范的 128 位 UUID（包含本地 fixture 常用的 nil/test UUID）。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readErrorField = (error: unknown, field: string): unknown => {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)[field];
};

const readErrorMessage = (error: unknown): string => {
  const message = readErrorField(error, 'message');
  return typeof message === 'string' ? message : '';
};

const readErrorStatus = (error: unknown): number | undefined => {
  const status = readErrorField(error, 'status');
  return typeof status === 'number' ? status : undefined;
};

const readErrorCode = (error: unknown): string => {
  const code = readErrorField(error, 'code');
  return typeof code === 'string' ? code : '';
};

const P0001_BRACKET_CODE_PATTERN = /\[(not_authenticated|song_not_allowed|invalid_input|invalid_metric|invalid_policy|event_conflict|rpc_unavailable)\]/;

const isRpcMissingError = (error: unknown, message: string, code: string) => (
  code === 'PGRST202'
  || code === '42883'
  || /could not find the function|function .* does not exist|schema cache.*function/i.test(message)
);

const mapKnownErrorCode = (code: string): ListeningRecapErrorCode | null => {
  switch (code) {
    case 'not_authenticated':
    case 'song_not_allowed':
    case 'invalid_input':
    case 'invalid_metric':
    case 'invalid_policy':
    case 'event_conflict':
    case 'rpc_unavailable':
    case 'network_error':
    case 'server_error':
    case 'not_configured':
    case 'invalid_response':
    case 'unknown_error':
      return code;
    default:
      return null;
  }
};

const extractP0001BracketCode = (
  code: string,
  message: string,
): ListeningRecapErrorCode | null => {
  if (code !== 'P0001') return null;
  const bracketCode = message.match(P0001_BRACKET_CODE_PATTERN)?.[1];
  return bracketCode ? mapKnownErrorCode(bracketCode) : null;
};

export const mapListeningRecapError = (error: unknown): ListeningRecapApiError => {
  if (error instanceof ListeningRecapApiError) return error;

  const message = readErrorMessage(error);
  const normalizedMessage = message.toLowerCase();
  const code = readErrorCode(error);
  const status = readErrorStatus(error);
  const knownCode = mapKnownErrorCode(code);
  if (knownCode) {
    return new ListeningRecapApiError({
      code: knownCode,
      retryable: knownCode === 'network_error' || knownCode === 'server_error',
      cause: error,
    });
  }

  const p0001BracketCode = extractP0001BracketCode(code, message);
  if (p0001BracketCode) {
    return new ListeningRecapApiError({ code: p0001BracketCode, retryable: false, cause: error });
  }

  if (/supabase 未配置/i.test(message)) {
    return new ListeningRecapApiError({ code: 'not_configured', retryable: false, cause: error });
  }
  if (isRpcMissingError(error, message, code)) {
    return new ListeningRecapApiError({ code: 'rpc_unavailable', retryable: false, cause: error });
  }
  if (status === 401 || /not authenticated|jwt|unauthorized|未登录/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'not_authenticated', retryable: false, cause: error });
  }
  if (status === 403 || /not allowed|permission denied|forbidden|无权限|不可见/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'song_not_allowed', retryable: false, cause: error });
  }
  if (status === 409 || code === '23505' || /event conflict|duplicate.*event|冲突/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'event_conflict', retryable: false, cause: error });
  }
  if (/invalid metric|指标无效/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'invalid_metric', retryable: false, cause: error });
  }
  if (/invalid policy|策略无效/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'invalid_policy', retryable: false, cause: error });
  }
  if (status === 400 || /invalid input|invalid uuid|参数无效|输入无效/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'invalid_input', retryable: false, cause: error });
  }
  if (status === 408 || status === 429 || status !== undefined && status >= 500) {
    return new ListeningRecapApiError({
      code: status !== undefined && status >= 500 ? 'server_error' : 'network_error',
      retryable: true,
      cause: error,
    });
  }
  if (error instanceof TypeError || /failed to fetch|network|timeout|超时|网络/i.test(normalizedMessage)) {
    return new ListeningRecapApiError({ code: 'network_error', retryable: true, cause: error });
  }
  return new ListeningRecapApiError({ code: 'unknown_error', retryable: false, cause: error });
};

export const listeningRecapErrorFromResponse = (
  error: ListeningRecapResponseError,
): ListeningRecapApiError => new ListeningRecapApiError({
  code: mapKnownErrorCode(error.code) ?? 'unknown_error',
  retryable: error.retryable,
  message: error.messageKey ?? undefined,
});

const assertRecordEventInput = (input: ListeningRecapRecordEventInput) => {
  if (!input || !UUID_PATTERN.test(input.eventId) || !UUID_PATTERN.test(input.playSessionId) || !UUID_PATTERN.test(input.songId)) {
    throw new ListeningRecapApiError({ code: 'invalid_input', retryable: false });
  }
  if (input.metric !== 'qualified_play') {
    throw new ListeningRecapApiError({ code: 'invalid_metric', retryable: false });
  }
  if (input.policyVersion !== 'd1-20pct-v1') {
    throw new ListeningRecapApiError({ code: 'invalid_policy', retryable: false });
  }
  if (input.observedAt !== undefined && input.observedAt !== null && typeof input.observedAt !== 'string') {
    throw new ListeningRecapApiError({ code: 'invalid_input', retryable: false });
  }
  for (const seconds of [input.qualifyingSeconds, input.listenedSeconds]) {
    if (seconds !== undefined && seconds !== null && (!Number.isFinite(seconds) || seconds < 0)) {
      throw new ListeningRecapApiError({ code: 'invalid_input', retryable: false });
    }
  }
};

const resolveCoverUrl = async (coverUrl: string): Promise<string | null> => {
  try {
    return await createSignedCoverUrl(coverUrl);
  } catch {
    // 封面签名失败不能让回顾数据失败，也不能把私有路径原样暴露给页面。
    return null;
  }
};

const resolveResponseCovers = async (response: ListeningRecapResponse): Promise<ListeningRecapResponse> => {
  const coverPromises = new Map<string, Promise<string | null>>();
  const resolve = (song: ListeningRecapSong) => {
    const key = song.coverUrl ?? '';
    if (!key) return Promise.resolve(song);
    const pending = coverPromises.get(key);
    if (pending) return pending.then((coverUrl) => ({ ...song, coverUrl, coverPath: key }));
    const promise = resolveCoverUrl(key);
    coverPromises.set(key, promise);
    return promise.then((coverUrl) => ({ ...song, coverUrl, coverPath: key }));
  };

  const opening = response.opening
    ? {
        ...response.opening,
        coverSong: response.opening.coverSong ? await resolve(response.opening.coverSong) : null,
      }
    : null;
  const longestCompanion = response.longestCompanion
    ? { ...response.longestCompanion, songs: await Promise.all(response.longestCompanion.songs.map(resolve)) }
    : null;
  const ownedSounds = response.ownedSounds
    ? { ...response.ownedSounds, songs: await Promise.all(response.ownedSounds.songs.map(resolve)) }
    : null;

  return { ...response, opening, longestCompanion, ownedSounds };
};

export const createListeningRecapApi = () => ({
  async fetchListeningRecap(period?: ListeningRecapPeriod): Promise<ListeningRecapResponse> {
    let normalizedPeriod: ListeningRecapPeriod | undefined;
    if (period !== undefined) {
      if (!isListeningRecapPeriod(period)) {
        throw new ListeningRecapApiError({ code: 'invalid_input', retryable: false });
      }
      normalizedPeriod = normalizeListeningRecapPeriod(period);
    }

    try {
      const client = ensureSupabase();
      const { data, error } = await client.rpc('get_listening_recap', {
        p_period_type: normalizedPeriod?.type ?? 'month',
        p_period_id: normalizedPeriod?.id ?? null,
      });
      if (error) throw error;

      let response: ListeningRecapResponse;
      try {
        response = parseListeningRecapResponse(data);
      } catch (parseError) {
        throw new ListeningRecapApiError({ code: 'invalid_response', retryable: false, cause: parseError });
      }
      return resolveResponseCovers(response);
    } catch (error) {
      throw mapListeningRecapError(error);
    }
  },

  async recordListeningPlayEvent(
    input: ListeningRecapRecordEventInput,
  ): Promise<ListeningRecapRecordEventResult> {
    assertRecordEventInput(input);
    try {
      const client = ensureSupabase();
      const { data, error } = await client.rpc('record_listening_play_event', {
        p_event_id: input.eventId,
        p_play_session_id: input.playSessionId,
        p_song_id: input.songId,
        p_metric: input.metric,
        p_policy_version: input.policyVersion,
        p_observed_at: input.observedAt ?? null,
        p_qualifying_seconds: input.qualifyingSeconds ?? null,
        p_listened_seconds: input.listenedSeconds ?? null,
      });
      if (error) throw error;

      try {
        return parseListeningRecapRecordEventResult(data);
      } catch (parseError) {
        throw new ListeningRecapApiError({ code: 'invalid_response', retryable: false, cause: parseError });
      }
    } catch (error) {
      throw mapListeningRecapError(error);
    }
  },
});
