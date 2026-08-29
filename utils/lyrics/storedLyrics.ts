import type { SongLyricsRow } from '../../services/supabase/types';
import type { LyricsInput, LyricsLine, LyricsTiming, LyricsWord, ParsedLyrics } from './types';

export interface StoredLyricsActiveRange {
  startIndex: number;
  endIndex: number;
}

export interface StoredLyricsModel {
  editorLyrics: LyricsInput | ParsedLyrics;
  playbackLyrics: LyricsInput | ParsedLyrics;
  activeRange: StoredLyricsActiveRange | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const asFiniteTime = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
);

const readWord = (value: unknown): LyricsWord | null => {
  const record = asRecord(value);
  if (!record || typeof record.text !== 'string') return null;
  const startTimeMs = asFiniteTime(record.startMs) ?? 0;
  const endTimeMs = asFiniteTime(record.endMs) ?? startTimeMs;
  return {
    text: record.text,
    startTimeMs,
    endTimeMs,
    ...(typeof record.romanizedText === 'string' && record.romanizedText
      ? { romanizedText: record.romanizedText }
      : {}),
  };
};

const readLine = (value: unknown, index: number): LyricsLine | null => {
  const record = asRecord(value);
  if (!record || typeof record.text !== 'string') return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : `stored-lyrics-line-${index + 1}`,
    text: record.text,
    startTimeMs: asFiniteTime(record.startMs),
    endTimeMs: asFiniteTime(record.endMs),
    words: Array.isArray(record.words)
      ? record.words.map(readWord).filter((word): word is LyricsWord => Boolean(word))
      : [],
    translatedText: typeof record.translatedText === 'string' ? record.translatedText : '',
    romanizedText: typeof record.romanizedText === 'string' ? record.romanizedText : '',
    isBackground: Boolean(record.isBackground),
    isDuet: Boolean(record.isDuet),
  };
};

const readActiveRange = (
  value: unknown,
  lineCount: number,
): StoredLyricsActiveRange | null => {
  const record = asRecord(value);
  if (!record || lineCount === 0) return null;
  const rawStart = Number(record.startIndex);
  const rawEnd = Number(record.endIndex);
  if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) return null;
  const startIndex = Math.max(0, Math.min(lineCount - 1, rawStart));
  const endIndex = Math.max(startIndex, Math.min(lineCount - 1, rawEnd));
  return { startIndex, endIndex };
};

export const getStoredLyricsModel = (row: SongLyricsRow): StoredLyricsModel => {
  const fallback: LyricsInput = { format: row.format, content: row.raw_content };
  const normalized = asRecord(row.normalized_content);
  if (!normalized || !Array.isArray(normalized.lines)) {
    return { editorLyrics: fallback, playbackLyrics: fallback, activeRange: null };
  }

  const lines = normalized.lines
    .map(readLine)
    .filter((line): line is LyricsLine => Boolean(line));
  if (lines.length === 0) {
    return { editorLyrics: fallback, playbackLyrics: fallback, activeRange: null };
  }

  const timing: LyricsTiming = normalized.timing === 'word'
    ? 'word'
    : normalized.timing === 'none'
      ? 'none'
      : 'line';
  const editorLyrics: ParsedLyrics = {
    format: row.format,
    timing,
    rawContent: row.raw_content,
    lines,
  };
  const activeRange = readActiveRange(normalized.activeRange, lines.length);
  const playbackLines = activeRange
    ? lines.slice(activeRange.startIndex, activeRange.endIndex + 1)
    : lines;

  return {
    editorLyrics,
    playbackLyrics: { ...editorLyrics, lines: playbackLines },
    activeRange,
  };
};
