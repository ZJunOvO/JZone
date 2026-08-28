import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  detectLyricsFormat,
  isParsedLyrics,
  parseLyrics,
} from '../utils/lyrics';
import type {
  LyricsFormat,
  LyricsInput,
  LyricsLine,
  LyricsTiming,
  LyricsWord,
  ParsedLyrics,
} from '../utils/lyrics';

export const LYRICS_DRAFT_VERSION = 1 as const;
export const LYRICS_DRAFT_STORAGE_PREFIX = 'jzone:lyrics-draft:v1:';

export type LyricsDraftStorageStatus = 'disabled' | 'idle' | 'saved' | 'error';

export interface LyricsDraftSnapshot {
  content: string;
  format: LyricsFormat;
  timing: LyricsTiming;
  offsetMs: number;
  lines: LyricsLine[];
}

interface LyricsDraftWorkingState extends LyricsDraftSnapshot {
  parseError: string | null;
}

export interface UseLyricsDraftOptions {
  initialLyrics?: LyricsInput | ParsedLyrics | null;
  initialOffsetMs?: number;
  songId?: string | null;
  draftKey?: string | null;
}

export interface SetLyricsDraftLinesOptions {
  content?: string;
  format?: LyricsFormat;
  timing?: LyricsTiming;
}

export interface UseLyricsDraftResult extends LyricsDraftSnapshot {
  parsedLyrics: ParsedLyrics | null;
  parseError: string | null;
  hasDraft: boolean;
  hasLocalDraft: boolean;
  isDirty: boolean;
  isRestored: boolean;
  storageKey: string | null;
  storageStatus: LyricsDraftStorageStatus;
  setContent: (content: string, format?: LyricsFormat) => void;
  setLines: (lines: readonly LyricsLine[], options?: SetLyricsDraftLinesOptions) => void;
  setOffsetMs: (offsetMs: number) => void;
  clearDraft: () => void;
  resetDraft: () => void;
}

export interface LyricsValidationIssue {
  code: 'empty' | 'parse' | 'missing-time' | 'negative-time' | 'non-monotonic' | 'duration';
  message: string;
  lineIndex?: number;
}

export interface LyricsValidationResult {
  valid: boolean;
  issues: LyricsValidationIssue[];
}

export interface ValidateLyricsDraftInput {
  content: string;
  lines: readonly LyricsLine[];
  offsetMs: number;
  durationSeconds?: number | null;
  parseError?: string | null;
}

const LYRICS_FORMATS = new Set<LyricsFormat>(['plain', 'lrc', 'ttml']);
const LYRICS_TIMINGS = new Set<LyricsTiming>(['none', 'line', 'word']);

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const asNonEmptyString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value : fallback
);

const asNonNegativeTime = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
};

const asOffset = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
);

const normalizeWord = (value: unknown): LyricsWord | null => {
  const record = asRecord(value);
  if (!record) return null;
  const text = typeof record.text === 'string' ? record.text : '';
  const startTimeMs = asNonNegativeTime(record.startTimeMs) ?? 0;
  const endTimeMs = asNonNegativeTime(record.endTimeMs) ?? startTimeMs;
  const romanizedText = typeof record.romanizedText === 'string' && record.romanizedText
    ? record.romanizedText
    : undefined;
  return { text, startTimeMs, endTimeMs, romanizedText };
};

const normalizeLine = (value: unknown, index: number): LyricsLine | null => {
  const record = asRecord(value);
  if (!record) return null;
  const words = Array.isArray(record.words)
    ? record.words.map(normalizeWord).filter((word): word is LyricsWord => Boolean(word))
    : [];
  return {
    id: asNonEmptyString(record.id, `lyrics-line-${index + 1}`),
    text: typeof record.text === 'string' ? record.text : '',
    startTimeMs: asNonNegativeTime(record.startTimeMs),
    endTimeMs: asNonNegativeTime(record.endTimeMs),
    words,
    translatedText: typeof record.translatedText === 'string' ? record.translatedText : '',
    romanizedText: typeof record.romanizedText === 'string' ? record.romanizedText : '',
    isBackground: Boolean(record.isBackground),
    isDuet: Boolean(record.isDuet),
  };
};

const normalizeLines = (lines: readonly unknown[]): LyricsLine[] => (
  lines.map(normalizeLine).filter((line): line is LyricsLine => Boolean(line))
);

const cloneLine = (line: LyricsLine, index: number): LyricsLine => (
  normalizeLine(line, index) ?? {
    id: `lyrics-line-${index + 1}`,
    text: '',
    startTimeMs: null,
    endTimeMs: null,
    words: [],
    translatedText: '',
    romanizedText: '',
    isBackground: false,
    isDuet: false,
  }
);

const cloneLines = (lines: readonly LyricsLine[]): LyricsLine[] => (
  lines.map(cloneLine)
);

const getInputContent = (input: LyricsInput | ParsedLyrics | null | undefined): string => {
  if (!input) return '';
  if (isParsedLyrics(input)) return input.rawContent;
  if (typeof input === 'string') return input;
  return input.content ?? input.rawContent ?? '';
};

const getInputFormat = (
  input: LyricsInput | ParsedLyrics | null | undefined,
  content: string,
): LyricsFormat => {
  if (isParsedLyrics(input)) return input.format;
  if (input && typeof input !== 'string' && input.format) return input.format;
  return detectLyricsFormat(content);
};

const getParseErrorMessage = (error: unknown): string => (
  error instanceof Error && error.message.trim() ? error.message : '歌词解析失败，请检查内容后重试。'
);

const parseContent = (
  content: string,
  format?: LyricsFormat,
): { parsedLyrics: ParsedLyrics | null; format: LyricsFormat; parseError: string | null } => {
  const normalizedContent = content.replace(/^\uFEFF/, '');
  const resolvedFormat = format ?? detectLyricsFormat(normalizedContent);
  if (!normalizedContent.trim()) {
    return { parsedLyrics: null, format: resolvedFormat, parseError: null };
  }

  try {
    const parsedLyrics = parseLyrics({ format: resolvedFormat, content: normalizedContent });
    if ((resolvedFormat === 'lrc' || resolvedFormat === 'ttml') && parsedLyrics.lines.length === 0) {
      throw new Error(`${resolvedFormat === 'lrc' ? 'LRC' : 'TTML'} 歌词没有可用的歌词行。`);
    }
    return { parsedLyrics, format: resolvedFormat, parseError: null };
  } catch (error) {
    return { parsedLyrics: null, format: resolvedFormat, parseError: getParseErrorMessage(error) };
  }
};

const createWorkingState = (
  input: LyricsInput | ParsedLyrics | null | undefined,
  initialOffsetMs: number,
): LyricsDraftWorkingState => {
  const content = getInputContent(input).replace(/^\uFEFF/, '');
  const format = getInputFormat(input, content);

  if (isParsedLyrics(input)) {
    return {
      content,
      format: input.format,
      timing: input.timing,
      offsetMs: initialOffsetMs,
      lines: cloneLines(input.lines),
      parseError: null,
    };
  }

  const parsed = parseContent(content, format);
  return {
    content,
    format: parsed.format,
    timing: parsed.parsedLyrics?.timing ?? 'none',
    offsetMs: initialOffsetMs,
    lines: parsed.parsedLyrics ? cloneLines(parsed.parsedLyrics.lines) : [],
    parseError: parsed.parseError,
  };
};

const formatCentiseconds = (timeMs: number): string => {
  const safeTime = Math.max(0, Math.round(timeMs));
  const totalCentiseconds = Math.round(safeTime / 10);
  const minutes = Math.floor(totalCentiseconds / 6_000);
  const seconds = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

export const formatLyricsTime = (timeMs: number | null | undefined): string => (
  timeMs === null || timeMs === undefined || !Number.isFinite(timeMs)
    ? '--:--.--'
    : formatCentiseconds(timeMs)
);

export const serializeLyricsLines = (lines: readonly LyricsLine[]): string => (
  lines
    .map((line, index) => cloneLine(line, index))
    .filter((line) => line.text.trim().length > 0)
    .map((line) => (
      line.startTimeMs === null
        ? line.text.trim()
        : `[${formatCentiseconds(line.startTimeMs)}]${line.text.trim()}`
    ))
    .join('\n')
);

export const createParsedLyricsFromLines = (
  lines: readonly LyricsLine[],
  format: LyricsFormat,
  timing: LyricsTiming,
  rawContent: string,
): ParsedLyrics => ({
  format,
  timing,
  rawContent,
  lines: cloneLines(lines),
});

export const createLyricsDraftStorageKey = (options: {
  songId?: string | null;
  draftKey?: string | null;
}): string | null => {
  const normalizedDraftKey = typeof options.draftKey === 'string' ? options.draftKey.trim() : '';
  const normalizedSongId = typeof options.songId === 'string' ? options.songId.trim() : '';
  const scope = normalizedSongId
    ? `song:${normalizedSongId}`
    : normalizedDraftKey
      ? `draft:${normalizedDraftKey}`
      : '';
  return scope ? `${LYRICS_DRAFT_STORAGE_PREFIX}${encodeURIComponent(scope)}` : null;
};

interface StoredLyricsDraft {
  version: typeof LYRICS_DRAFT_VERSION;
  scope: string;
  content: string;
  format: LyricsFormat;
  timing: LyricsTiming;
  offsetMs: number;
  lines: unknown[];
  parseError?: string | null;
  updatedAt: number;
}

const getStorageScope = (storageKey: string): string => (
  storageKey.slice(LYRICS_DRAFT_STORAGE_PREFIX.length)
);

const readStoredDraft = (
  storageKey: string,
): { state: LyricsDraftWorkingState | null; failed: boolean } => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { state: null, failed: false };
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { state: null, failed: false };
    const value = JSON.parse(raw) as Partial<StoredLyricsDraft>;
    if (
      value.version !== LYRICS_DRAFT_VERSION
      || value.scope !== getStorageScope(storageKey)
      || typeof value.content !== 'string'
      || !LYRICS_FORMATS.has(value.format as LyricsFormat)
      || !LYRICS_TIMINGS.has(value.timing as LyricsTiming)
      || !Array.isArray(value.lines)
    ) return { state: null, failed: false };

    return {
      failed: false,
      state: {
        content: value.content,
        format: value.format as LyricsFormat,
        timing: value.timing as LyricsTiming,
        offsetMs: asOffset(value.offsetMs),
        lines: normalizeLines(value.lines),
        parseError: typeof value.parseError === 'string' ? value.parseError : null,
      },
    };
  } catch {
    return { state: null, failed: true };
  }
};

const writeStoredDraft = (storageKey: string, state: LyricsDraftWorkingState): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const payload: StoredLyricsDraft = {
      version: LYRICS_DRAFT_VERSION,
      scope: getStorageScope(storageKey),
      content: state.content,
      format: state.format,
      timing: state.timing,
      offsetMs: state.offsetMs,
      lines: cloneLines(state.lines),
      parseError: state.parseError,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

const removeStoredDraft = (storageKey: string | null): boolean => {
  if (!storageKey) return true;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
};

export const validateLyricsDraft = ({
  content,
  lines,
  offsetMs,
  durationSeconds,
  parseError,
}: ValidateLyricsDraftInput): LyricsValidationResult => {
  const issues: LyricsValidationIssue[] = [];
  const nonEmptyLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.text.trim().length > 0);

  if (!content.trim() && nonEmptyLines.length === 0) {
    issues.push({ code: 'empty', message: '歌词内容不能为空。' });
    return { valid: false, issues };
  }

  if (parseError) {
    issues.push({ code: 'parse', message: parseError });
    return { valid: false, issues };
  }

  if (nonEmptyLines.length === 0) {
    issues.push({ code: 'empty', message: '歌词内容不能为空。' });
    return { valid: false, issues };
  }

  const hasTiming = nonEmptyLines.some(({ line }) => line.startTimeMs !== null);
  if (!hasTiming) return { valid: true, issues };

  let previousTimeMs: number | null = null;
  let previousIndex = -1;
  const durationMs = typeof durationSeconds === 'number'
    && Number.isFinite(durationSeconds)
    && durationSeconds >= 0
    ? Math.round(durationSeconds * 1_000)
    : null;

  for (const { line, index } of nonEmptyLines) {
    if (line.startTimeMs === null) {
      issues.push({
        code: 'missing-time',
        lineIndex: index,
        message: `第 ${index + 1} 行还没有标记时间。`,
      });
      continue;
    }

    const effectiveTimeMs = line.startTimeMs + offsetMs;
    if (effectiveTimeMs < 0) {
      issues.push({
        code: 'negative-time',
        lineIndex: index,
        message: `第 ${index + 1} 行的偏移后时间不能小于 0 秒。`,
      });
    }
    if (previousTimeMs !== null && effectiveTimeMs < previousTimeMs) {
      issues.push({
        code: 'non-monotonic',
        lineIndex: index,
        message: `第 ${index + 1} 行时间早于第 ${previousIndex + 1} 行，请按播放顺序调整。`,
      });
    }
    if (durationMs !== null && effectiveTimeMs > durationMs) {
      issues.push({
        code: 'duration',
        lineIndex: index,
        message: `第 ${index + 1} 行超过歌曲时长 ${formatClockSeconds(durationSeconds ?? 0)}。`,
      });
    }
    previousTimeMs = effectiveTimeMs;
    previousIndex = index;
  }

  return { valid: issues.length === 0, issues };
};

const formatClockSeconds = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

export const useLyricsDraft = ({
  initialLyrics = null,
  initialOffsetMs = 0,
  songId,
  draftKey,
}: UseLyricsDraftOptions = {}): UseLyricsDraftResult => {
  const initialContent = getInputContent(initialLyrics).replace(/^\uFEFF/, '');
  const initialFormat = getInputFormat(initialLyrics, initialContent);
  const normalizedInitialOffset = asOffset(initialOffsetMs);
  const initialSignature = `${initialFormat}\u0000${initialContent}\u0000${normalizedInitialOffset}`;
  const initialState = useMemo(
    () => createWorkingState(initialLyrics, normalizedInitialOffset),
    [initialSignature],
  );
  const storageKey = useMemo(
    () => createLyricsDraftStorageKey({ songId, draftKey }),
    [draftKey, songId],
  );
  const [state, setState] = useState<LyricsDraftWorkingState>(initialState);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [isRestored, setIsRestored] = useState(() => !storageKey);
  const [storageStatus, setStorageStatus] = useState<LyricsDraftStorageStatus>(
    storageKey ? 'idle' : 'disabled',
  );
  const restoreGenerationRef = useRef(0);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    const generation = ++restoreGenerationRef.current;
    skipNextPersistRef.current = false;
    setIsRestored(!storageKey);
    setHasLocalDraft(false);
    setStorageStatus(storageKey ? 'idle' : 'disabled');

    if (!storageKey) {
      setState(initialState);
      return;
    }

    const stored = readStoredDraft(storageKey);
    if (generation !== restoreGenerationRef.current) return;
    setState(stored.state ?? initialState);
    setHasLocalDraft(Boolean(stored.state));
    setStorageStatus(stored.failed ? 'error' : 'idle');
    setIsRestored(true);
  }, [initialSignature, initialState, storageKey]);

  useEffect(() => {
    if (!storageKey || !isRestored) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const didWrite = writeStoredDraft(storageKey, state);
    setHasLocalDraft(didWrite || hasLocalDraft);
    setStorageStatus(didWrite ? 'saved' : 'error');
  }, [hasLocalDraft, isRestored, state, storageKey]);

  const setContent = useCallback((content: string, format?: LyricsFormat) => {
    const parsed = parseContent(content, format);
    setState((previous) => ({
      content: content.replace(/^\uFEFF/, ''),
      format: parsed.format,
      timing: parsed.parsedLyrics?.timing ?? 'none',
      offsetMs: previous.offsetMs,
      lines: parsed.parsedLyrics ? cloneLines(parsed.parsedLyrics.lines) : [],
      parseError: parsed.parseError,
    }));
  }, []);

  const setLines = useCallback((lines: readonly LyricsLine[], options: SetLyricsDraftLinesOptions = {}) => {
    const normalizedLines = cloneLines(lines);
    const hasTiming = normalizedLines.some((line) => line.startTimeMs !== null);
    const format = options.format ?? (hasTiming ? 'lrc' : 'plain');
    const timing = options.timing ?? (hasTiming ? 'line' : 'none');
    const content = options.content ?? serializeLyricsLines(normalizedLines);
    setState((previous) => ({
      content,
      format,
      timing,
      offsetMs: previous.offsetMs,
      lines: normalizedLines,
      parseError: null,
    }));
  }, []);

  const setOffsetMs = useCallback((offsetMs: number) => {
    setState((previous) => ({ ...previous, offsetMs: asOffset(offsetMs) }));
  }, []);

  const clearDraft = useCallback(() => {
    const removed = removeStoredDraft(storageKey);
    skipNextPersistRef.current = true;
    setHasLocalDraft(false);
    setStorageStatus(!storageKey ? 'disabled' : removed ? 'idle' : 'error');
  }, [storageKey]);

  const resetDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    skipNextPersistRef.current = true;
    setState(initialState);
    setHasLocalDraft(false);
    setStorageStatus(!storageKey ? 'disabled' : 'idle');
  }, [initialState, storageKey]);

  const parsedLyrics = useMemo(() => {
    if (state.parseError) return null;
    if (!state.content.trim() && state.lines.length === 0) return null;
    return createParsedLyricsFromLines(state.lines, state.format, state.timing, state.content);
  }, [state.content, state.format, state.lines, state.parseError, state.timing]);

  const hasDraft = Boolean(
    state.content.trim()
    || state.lines.some((line) => line.text.trim())
    || state.offsetMs !== 0,
  );
  const isDirty = initialSignature !== `${state.format}\u0000${state.content}\u0000${state.offsetMs}`;

  return {
    ...state,
    parsedLyrics,
    hasDraft,
    hasLocalDraft,
    isDirty,
    isRestored,
    storageKey,
    storageStatus,
    setContent,
    setLines,
    setOffsetMs,
    clearDraft,
    resetDraft,
  };
};
