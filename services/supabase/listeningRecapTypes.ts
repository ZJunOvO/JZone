export type ListeningRecapPeriodType = 'month' | 'year';

export interface ListeningRecapPeriod {
  type: ListeningRecapPeriodType;
  id: string;
}

export type ListeningRecapCoverageStatus =
  | 'event_complete'
  | 'event_partial'
  | 'legacy_only'
  | 'no_event'
  | 'error';

export type ListeningRecapCoverageSource =
  | 'listening_play_events'
  | 'user_song_plays'
  | 'mixed'
  | 'none'
  | string;

export type ListeningRecapErrorCode =
  | 'not_authenticated'
  | 'song_not_allowed'
  | 'invalid_input'
  | 'invalid_metric'
  | 'invalid_policy'
  | 'event_conflict'
  | 'not_configured'
  | 'rpc_unavailable'
  | 'network_error'
  | 'server_error'
  | 'invalid_response'
  | 'unknown_error';

export interface ListeningRecapRecordEventInput {
  eventId: string;
  playSessionId: string;
  songId: string;
  metric: 'qualified_play';
  policyVersion: 'd1-20pct-v1';
  observedAt?: string | null;
  qualifyingSeconds?: number | null;
  listenedSeconds?: number | null;
}

export interface ListeningRecapRecordEventResult {
  status: 'accepted' | 'duplicate';
  isNew: boolean;
  eventId: string;
  playSessionId: string;
  songId: string;
  metric: 'qualified_play';
  policyVersion: 'd1-20pct-v1';
  acceptedAt: string;
  userSongPlayCount: number;
}

export interface ListeningRecapResponsePeriod extends ListeningRecapPeriod {
  timezone: 'Asia/Shanghai';
  start: string;
  end: string;
  asOf: string;
}

export interface ListeningRecapCoverage {
  status: ListeningRecapCoverageStatus;
  source: ListeningRecapCoverageSource;
  coverageStart: string | null;
  messageKey: string | null;
}

export interface ListeningRecapSummary {
  validPlayCount: number;
  songCount: number;
  listeningDayCount: number;
}

export interface ListeningRecapSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  /** 客户端解析签名地址时保留的原始存储路径，用于签名过期后按需重签。 */
  coverPath?: string | null;
  visibility: 'private' | 'public';
  validPlayCount: number;
  firstAcceptedAt: string;
  lastAcceptedAt: string;
}

export interface ListeningRecapOpening {
  title: string;
  coverSong: ListeningRecapSong | null;
}

export interface ListeningRecapLongestCompanion {
  songs: ListeningRecapSong[];
  validPlayCount: number;
  isTie: boolean;
}

export interface ListeningRecapOwnedSounds {
  songCount: number;
  songs: ListeningRecapSong[];
}

export type ListeningRecapQueueOrder = 'first_accepted_at_asc_song_id_asc';

export interface ListeningRecapQueue {
  songIds: string[];
  totalCount: number;
  truncated: boolean;
  order: ListeningRecapQueueOrder;
}

export interface ListeningRecapResponseError {
  code: ListeningRecapErrorCode;
  retryable: boolean;
  messageKey?: string | null;
}

export interface ListeningRecapResponse {
  schemaVersion: 'listening-recap.v1';
  coverageVersion: string;
  period: ListeningRecapResponsePeriod;
  coverage: ListeningRecapCoverage;
  summary: ListeningRecapSummary | null;
  opening: ListeningRecapOpening | null;
  longestCompanion: ListeningRecapLongestCompanion | null;
  ownedSounds: ListeningRecapOwnedSounds | null;
  queue: ListeningRecapQueue;
  generatedAt: string;
  error: ListeningRecapResponseError | null;
}

const MONTH_ID_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_ID_PATTERN = /^\d{4}$/;

export const isListeningRecapPeriod = (value: unknown): value is ListeningRecapPeriod => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ListeningRecapPeriod>;
  if (candidate.type === 'month') return typeof candidate.id === 'string' && MONTH_ID_PATTERN.test(candidate.id);
  if (candidate.type === 'year') return typeof candidate.id === 'string' && YEAR_ID_PATTERN.test(candidate.id);
  return false;
};

export const normalizeListeningRecapPeriod = (period: ListeningRecapPeriod): ListeningRecapPeriod => {
  if (!isListeningRecapPeriod(period)) throw new Error('聆听回顾周期无效');
  return { type: period.type, id: period.id };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isFiniteNonNegativeNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value) throw new Error(`聆听回顾响应字段无效: ${field}`);
  return value;
};

const requireNullableString = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  return requireString(value, field);
};

const parseSong = (value: unknown): ListeningRecapSong => {
  if (!isRecord(value)) throw new Error('聆听回顾歌曲字段无效');
  const visibility = value.visibility;
  if (visibility !== 'private' && visibility !== 'public') {
    throw new Error('聆听回顾歌曲可见性无效');
  }
  const validPlayCount = value.validPlayCount;
  if (!isFiniteNonNegativeNumber(validPlayCount)) throw new Error('聆听回顾歌曲播放次数无效');
  return {
    id: requireString(value.id, 'song.id'),
    title: requireString(value.title, 'song.title'),
    artist: requireString(value.artist, 'song.artist'),
    coverUrl: requireNullableString(value.coverUrl, 'song.coverUrl'),
    visibility,
    validPlayCount,
    firstAcceptedAt: requireString(value.firstAcceptedAt, 'song.firstAcceptedAt'),
    lastAcceptedAt: requireString(value.lastAcceptedAt, 'song.lastAcceptedAt'),
  };
};

const parseSummary = (value: unknown): ListeningRecapSummary | null => {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('聆听回顾摘要字段无效');
  if (!isFiniteNonNegativeNumber(value.validPlayCount)
    || !isFiniteNonNegativeNumber(value.songCount)
    || !isFiniteNonNegativeNumber(value.listeningDayCount)) {
    throw new Error('聆听回顾摘要数字无效');
  }
  return {
    validPlayCount: value.validPlayCount,
    songCount: value.songCount,
    listeningDayCount: value.listeningDayCount,
  };
};

const parseOpening = (value: unknown): ListeningRecapOpening | null => {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('聆听回顾开场字段无效');
  return {
    title: requireString(value.title, 'opening.title'),
    coverSong: value.coverSong === null ? null : parseSong(value.coverSong),
  };
};

const parseLongestCompanion = (value: unknown): ListeningRecapLongestCompanion | null => {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.songs)) throw new Error('聆听回顾陪伴章节字段无效');
  if (!isFiniteNonNegativeNumber(value.validPlayCount) || typeof value.isTie !== 'boolean') {
    throw new Error('聆听回顾陪伴章节数字无效');
  }
  return {
    songs: value.songs.map(parseSong),
    validPlayCount: value.validPlayCount,
    isTie: value.isTie,
  };
};

const parseOwnedSounds = (value: unknown): ListeningRecapOwnedSounds | null => {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.songs)) throw new Error('聆听回顾本人声音字段无效');
  if (!isFiniteNonNegativeNumber(value.songCount)) throw new Error('聆听回顾本人声音数量无效');
  return {
    songCount: value.songCount,
    songs: value.songs.map(parseSong),
  };
};

const parseQueue = (value: unknown): ListeningRecapQueue => {
  if (!isRecord(value) || !Array.isArray(value.songIds)) throw new Error('聆听回顾队列字段无效');
  if (!value.songIds.every((songId) => typeof songId === 'string' && songId.length > 0)) {
    throw new Error('聆听回顾队列歌曲 ID 无效');
  }
  if (!isFiniteNonNegativeNumber(value.totalCount) || typeof value.truncated !== 'boolean') {
    throw new Error('聆听回顾队列元数据无效');
  }
  if (value.order !== 'first_accepted_at_asc_song_id_asc') throw new Error('聆听回顾队列排序无效');
  return {
    songIds: [...value.songIds] as string[],
    totalCount: value.totalCount,
    truncated: value.truncated,
    order: value.order,
  };
};

export const parseListeningRecapResponse = (value: unknown): ListeningRecapResponse => {
  if (!isRecord(value)) throw new Error('聆听回顾响应无效');
  const period = value.period;
  if (!isRecord(period)
    || (period.type !== 'month' && period.type !== 'year')
    || !isListeningRecapPeriod({ type: period.type, id: period.id })
    || period.timezone !== 'Asia/Shanghai') {
    throw new Error('聆听回顾周期响应无效');
  }

  const coverage = value.coverage;
  if (!isRecord(coverage)
    || !['event_complete', 'event_partial', 'legacy_only', 'no_event', 'error'].includes(String(coverage.status))) {
    throw new Error('聆听回顾覆盖状态无效');
  }
  const coverageStart = coverage.coverageStart;
  if (coverageStart !== null && typeof coverageStart !== 'string') throw new Error('聆听回顾覆盖起点无效');
  const messageKey = coverage.messageKey;
  if (messageKey !== null && typeof messageKey !== 'string') throw new Error('聆听回顾覆盖文案键无效');

  const errorValue = value.error;
  let responseError: ListeningRecapResponseError | null = null;
  if (errorValue !== null) {
    if (!isRecord(errorValue) || typeof errorValue.code !== 'string' || typeof errorValue.retryable !== 'boolean') {
      throw new Error('聆听回顾错误字段无效');
    }
    const errorMessageKey = errorValue.messageKey;
    if (errorMessageKey !== undefined && errorMessageKey !== null && typeof errorMessageKey !== 'string') {
      throw new Error('聆听回顾错误文案键无效');
    }
    responseError = {
      code: errorValue.code as ListeningRecapErrorCode,
      retryable: errorValue.retryable,
      messageKey: errorMessageKey === undefined || errorMessageKey === null
        ? null
        : errorMessageKey as string,
    };
  }

  if (coverage.status === 'error' && !responseError) throw new Error('聆听回顾错误状态缺少错误字段');
  if (coverage.status !== 'error' && responseError) throw new Error('聆听回顾成功状态包含错误字段');

  const summary = parseSummary(value.summary);
  const opening = parseOpening(value.opening);
  const longestCompanion = parseLongestCompanion(value.longestCompanion);
  const ownedSounds = parseOwnedSounds(value.ownedSounds);
  const queue = parseQueue(value.queue);

  return {
    schemaVersion: value.schemaVersion === 'listening-recap.v1'
      ? value.schemaVersion
      : (() => { throw new Error('聆听回顾 schemaVersion 无效'); })(),
    coverageVersion: requireString(value.coverageVersion, 'coverageVersion'),
    period: {
      type: period.type,
      id: period.id as string,
      timezone: period.timezone,
      start: requireString(period.start, 'period.start'),
      end: requireString(period.end, 'period.end'),
      asOf: requireString(period.asOf, 'period.asOf'),
    },
    coverage: {
      status: coverage.status as ListeningRecapCoverageStatus,
      source: requireString(coverage.source, 'coverage.source'),
      coverageStart: coverageStart === null ? null : coverageStart as string,
      messageKey: messageKey === null ? null : messageKey as string,
    },
    summary,
    opening,
    longestCompanion,
    ownedSounds,
    queue,
    generatedAt: requireString(value.generatedAt, 'generatedAt'),
    error: responseError,
  };
};

export const isListeningRecapResponse = (value: unknown): value is ListeningRecapResponse => {
  try {
    parseListeningRecapResponse(value);
    return true;
  } catch {
    return false;
  }
};

export const parseListeningRecapRecordEventResult = (value: unknown): ListeningRecapRecordEventResult => {
  if (!isRecord(value)
    || (value.status !== 'accepted' && value.status !== 'duplicate')
    || typeof value.isNew !== 'boolean') {
    throw new Error('聆听回顾事件响应无效');
  }
  if (value.metric !== 'qualified_play') throw new Error('聆听回顾事件指标无效');
  if (value.policyVersion !== 'd1-20pct-v1') throw new Error('聆听回顾事件策略无效');
  if (!isFiniteNonNegativeNumber(value.userSongPlayCount)) throw new Error('聆听回顾个人播放累计无效');
  return {
    status: value.status,
    isNew: value.isNew,
    eventId: requireString(value.eventId, 'eventId'),
    playSessionId: requireString(value.playSessionId, 'playSessionId'),
    songId: requireString(value.songId, 'songId'),
    metric: value.metric,
    policyVersion: value.policyVersion,
    acceptedAt: requireString(value.acceptedAt, 'acceptedAt'),
    userSongPlayCount: value.userSongPlayCount,
  };
};

export const isListeningRecapRecordEventResult = (
  value: unknown,
): value is ListeningRecapRecordEventResult => {
  try {
    parseListeningRecapRecordEventResult(value);
    return true;
  } catch {
    return false;
  }
};
