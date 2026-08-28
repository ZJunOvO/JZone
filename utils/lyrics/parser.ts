import { parseLrc, parseTTML } from '@applemusic-like-lyrics/lyric';
import type { LyricLine as AmllLyricLine } from '@applemusic-like-lyrics/core';
import type {
  LyricsFormat,
  LyricsInput,
  LyricsLine,
  LyricsTextInput,
  LyricsTiming,
  LyricsWord,
  ParsedLyrics,
} from './types';

const LRC_TIMESTAMP_PATTERN = /^\s*\[(?:\d+:)*\d+(?:\.\d+)?\]/m;
const TTML_ROOT_PATTERN = /<tt(?:\s|>)/i;
const JZONE_LINE_ROLE_PATTERN = /^\s*\[jzone:role:(\d+):(lead|duet|background)\]\s*$/i;
const MAX_TIME_MS = Number.MAX_SAFE_INTEGER;

type PersistedLyricsRole = 'lead' | 'duet' | 'background';

const extractJzoneLineRoles = (content: string): {
  content: string;
  roles: Map<number, PersistedLyricsRole>;
} => {
  const roles = new Map<number, PersistedLyricsRole>();
  const lyricLines: string[] = [];
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(JZONE_LINE_ROLE_PATTERN);
    if (!match) {
      lyricLines.push(line);
      return;
    }
    const lineIndex = Number.parseInt(match[1], 10);
    const role = match[2].toLowerCase() as PersistedLyricsRole;
    if (Number.isSafeInteger(lineIndex) && lineIndex >= 0) roles.set(lineIndex, role);
  });
  return { content: lyricLines.join('\n'), roles };
};

const applyJzoneLineRoles = (
  lines: readonly LyricsLine[],
  roles: ReadonlyMap<number, PersistedLyricsRole>,
): LyricsLine[] => lines.map((line, index) => {
  const role = roles.get(index);
  if (!role) return line;
  return {
    ...line,
    isDuet: role === 'duet',
    isBackground: role === 'background',
  };
});

export class LyricsParseError extends Error {
  readonly format: LyricsFormat;

  constructor(format: LyricsFormat, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'LyricsParseError';
    this.format = format;
  }
}

const asFiniteTime = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
};

const getInputContent = (input: LyricsInput): string => {
  if (typeof input === 'string') return input;
  const textInput = input as LyricsTextInput;
  return textInput.content ?? textInput.rawContent ?? '';
};

const getInputFormat = (input: LyricsInput): LyricsFormat | undefined => {
  if (typeof input === 'string') return undefined;
  return input.format;
};

export const detectLyricsFormat = (content: string): LyricsFormat => {
  const trimmed = content.trimStart();
  if (TTML_ROOT_PATTERN.test(trimmed)) return 'ttml';
  if (LRC_TIMESTAMP_PATTERN.test(content)) return 'lrc';
  return 'plain';
};

const createPlainLines = (content: string): LyricsLine[] => content
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((text, index) => ({
    id: `plain-${index + 1}`,
    text,
    startTimeMs: null,
    endTimeMs: null,
    words: [],
    translatedText: '',
    romanizedText: '',
    isBackground: false,
    isDuet: false,
  }));

const parsePlainLyrics = (content: string): ParsedLyrics => ({
  format: 'plain',
  timing: 'none',
  rawContent: content,
  lines: createPlainLines(content),
});

const parseLrcLyrics = (content: string): ParsedLyrics => {
  let sourceLines: ReturnType<typeof parseLrc>;
  try {
    sourceLines = parseLrc(content);
  } catch (error) {
    throw new LyricsParseError('lrc', 'LRC 歌词解析失败。', error);
  }

  const lines = sourceLines.map((sourceLine, index) => {
    const text = sourceLine.words.map((word) => word.word).join('').trim();
    const startTimeMs = asFiniteTime(sourceLine.startTime);
    const nextStartTimeMs = asFiniteTime(sourceLines[index + 1]?.startTime);
    return {
      id: `lrc-${index + 1}`,
      text,
      startTimeMs,
      endTimeMs: nextStartTimeMs,
      // 普通 LRC 没有逐字时间，这里刻意不把整行伪装成逐字数据。
      words: [],
      translatedText: sourceLine.translatedLyric ?? '',
      romanizedText: sourceLine.romanLyric ?? '',
      isBackground: Boolean(sourceLine.isBG),
      isDuet: Boolean(sourceLine.isDuet),
    } satisfies LyricsLine;
  }).filter((line) => line.text.length > 0 && line.startTimeMs !== null);

  return {
    format: 'lrc',
    timing: 'line',
    rawContent: content,
    lines,
  };
};

const mapAmllWord = (word: { word?: string; startTime?: number; endTime?: number; romanWord?: string }): LyricsWord => ({
  text: word.word ?? '',
  startTimeMs: asFiniteTime(word.startTime) ?? 0,
  endTimeMs: asFiniteTime(word.endTime) ?? asFiniteTime(word.startTime) ?? 0,
  romanizedText: word.romanWord || undefined,
});

const parseTtmlLyrics = (content: string): ParsedLyrics => {
  let sourceResult: ReturnType<typeof parseTTML>;
  try {
    sourceResult = parseTTML(content);
  } catch (error) {
    throw new LyricsParseError('ttml', 'TTML 歌词解析失败。', error);
  }

  const lines = sourceResult.lines.map((sourceLine, index) => {
    const words = sourceLine.words.map(mapAmllWord);
    const firstWordStart = asFiniteTime(words[0]?.startTimeMs);
    const lastWordEnd = asFiniteTime(words[words.length - 1]?.endTimeMs);
    const startTimeMs = asFiniteTime(sourceLine.startTime) ?? firstWordStart;
    const endTimeMs = asFiniteTime(sourceLine.endTime) ?? lastWordEnd;
    const text = words.map((word) => word.text).join('').trim();

    return {
      id: `ttml-${index + 1}`,
      text,
      startTimeMs,
      endTimeMs,
      words,
      translatedText: sourceLine.translatedLyric ?? '',
      romanizedText: sourceLine.romanLyric ?? '',
      isBackground: Boolean(sourceLine.isBG),
      isDuet: Boolean(sourceLine.isDuet),
    } satisfies LyricsLine;
  }).filter((line) => line.text.length > 0);

  const hasWordTiming = lines.some((line) => (
    line.words.length > 1
    && line.words.some((word) => word.endTimeMs > word.startTimeMs)
  ));

  return {
    format: 'ttml',
    timing: hasWordTiming ? 'word' : 'line',
    rawContent: content,
    lines,
  };
};

export function parseLyrics(input: LyricsInput, format?: LyricsFormat): ParsedLyrics {
  const content = getInputContent(input).replace(/^\uFEFF/, '');
  const resolvedFormat = format ?? getInputFormat(input) ?? detectLyricsFormat(content);
  const extracted = extractJzoneLineRoles(content);
  let parsedLyrics: ParsedLyrics;

  switch (resolvedFormat) {
    case 'plain':
      parsedLyrics = parsePlainLyrics(extracted.content);
      break;
    case 'lrc':
      parsedLyrics = parseLrcLyrics(extracted.content);
      break;
    case 'ttml':
      parsedLyrics = parseTtmlLyrics(extracted.content);
      break;
    default: {
      const unreachableFormat: never = resolvedFormat;
      throw new LyricsParseError('plain', `不支持的歌词格式：${String(unreachableFormat)}。`);
    }
  }

  return {
    ...parsedLyrics,
    rawContent: content,
    lines: applyJzoneLineRoles(parsedLyrics.lines, extracted.roles),
  };
}

const getLineEndTime = (
  line: LyricsLine,
  nextLine: LyricsLine | undefined,
  durationMs?: number,
): number => {
  const startTimeMs = line.startTimeMs ?? 0;
  if (line.endTimeMs !== null && line.endTimeMs > startTimeMs) return line.endTimeMs;
  if (nextLine?.startTimeMs !== null && nextLine?.startTimeMs !== undefined && nextLine.startTimeMs > startTimeMs) {
    return nextLine.startTimeMs;
  }
  if (durationMs !== undefined && durationMs > startTimeMs) return durationMs;
  return MAX_TIME_MS;
};

const toAmllLine = (
  line: LyricsLine,
  nextLine: LyricsLine | undefined,
  timing: LyricsTiming,
  durationMs?: number,
): AmllLyricLine => {
  const startTime = line.startTimeMs ?? 0;
  const endTime = getLineEndTime(line, nextLine, durationMs);
  const words = timing === 'word' && line.words.length > 0
    ? line.words.map((word) => ({
      word: word.text,
      startTime: word.startTimeMs,
      endTime: word.endTimeMs,
      romanWord: word.romanizedText,
    }))
    : [{
      // LRC 的单个整行词只用于满足 AMLL 行数据协议，不代表逐字时间。
      word: line.text,
      startTime,
      endTime,
      romanWord: undefined,
    }];

  return {
    words,
    translatedLyric: line.translatedText,
    romanLyric: line.romanizedText,
    isBG: line.isBackground,
    isDuet: line.isDuet,
    startTime,
    endTime,
  };
};

export const toAmllLyricLines = (lyrics: ParsedLyrics, durationMs?: number): AmllLyricLine[] => {
  if (lyrics.timing === 'none') return [];
  return lyrics.lines.map((line, index) => toAmllLine(
    line,
    lyrics.lines[index + 1],
    lyrics.timing,
    durationMs,
  ));
};

export const getActiveLyricsLineIndex = (lines: readonly LyricsLine[], currentTimeMs: number): number => {
  let activeIndex = -1;
  for (const [index, line] of lines.entries()) {
    if (line.startTimeMs === null) continue;
    if (currentTimeMs < line.startTimeMs) break;
    activeIndex = index;
  }
  return activeIndex;
};

export const getLyricsLineProgress = (
  line: LyricsLine,
  currentTimeMs: number,
  durationMs?: number,
): number => {
  if (line.startTimeMs === null || currentTimeMs <= line.startTimeMs) return 0;
  const endTimeMs = line.endTimeMs
    ?? (durationMs !== undefined && durationMs > line.startTimeMs ? durationMs : line.startTimeMs + 1_000);
  if (endTimeMs <= line.startTimeMs) return 1;
  return Math.min(1, Math.max(0, (currentTimeMs - line.startTimeMs) / (endTimeMs - line.startTimeMs)));
};

export const clampSeekTimeSeconds = (timeMs: number, durationSeconds?: number): number => {
  const seconds = Math.max(0, timeMs / 1_000);
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds < 0) return seconds;
  return Math.min(durationSeconds, seconds);
};

export const normalizePlaybackTimeSeconds = (time: number | undefined, duration?: number): number => {
  const safeTime = typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time) : 0;
  if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) return Math.min(duration, safeTime);
  return safeTime;
};

export const isTimedLyrics = (lyrics: ParsedLyrics | null | undefined): lyrics is ParsedLyrics & { timing: 'line' | 'word' } => (
  Boolean(lyrics && lyrics.timing !== 'none' && lyrics.lines.length > 0)
);

export const isParsedLyrics = (value: LyricsInput | ParsedLyrics | null | undefined): value is ParsedLyrics => (
  Boolean(
    value
    && typeof value === 'object'
    && 'rawContent' in value
    && 'lines' in value
    && 'timing' in value
    && 'format' in value,
  )
);

export { MAX_TIME_MS };
