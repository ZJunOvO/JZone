import type {
  LyricsFormat,
  LyricsLine,
  LyricsTiming,
  ParsedLyrics,
} from '../../../utils/lyrics';
import type {
  LyricsEditorActiveRange,
  LyricsEditorNormalizedContent,
} from './types';

export const formatLabels: Record<LyricsFormat, string> = {
  plain: '纯文本',
  lrc: 'LRC 行级',
  ttml: 'TTML 逐字/行级',
};

export const toSafeSeconds = (value: number | null | undefined): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

export const clampSeconds = (value: number, duration: number | null): number => {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  return duration === null ? safeValue : Math.min(duration, safeValue);
};

export const formatClock = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export const formatOffset = (offsetMs: number): string => (
  offsetMs > 0 ? `+${offsetMs} 毫秒` : `${offsetMs} 毫秒`
);

export const createEditorLine = (index: number): LyricsLine => ({
  id: `editor-line-${Date.now()}-${index}`,
  text: '',
  startTimeMs: null,
  endTimeMs: null,
  words: [],
  translatedText: '',
  romanizedText: '',
  isBackground: false,
  isDuet: false,
});

export const toLineLevelLines = (lines: readonly LyricsLine[]): LyricsLine[] => (
  lines.map((line, index) => ({
    ...line,
    id: line.id || `editor-line-${index + 1}`,
    words: [],
    translatedText: '',
    romanizedText: '',
    endTimeMs: null,
  }))
);

const shiftTime = (timeMs: number | null, offsetMs: number): number | null => (
  timeMs === null ? null : Math.max(0, timeMs + offsetMs)
);

export const applyLyricsOffset = (
  lyrics: ParsedLyrics | null,
  offsetMs: number,
): ParsedLyrics | null => {
  if (!lyrics || offsetMs === 0) return lyrics;
  return {
    ...lyrics,
    lines: lyrics.lines.map((line) => ({
      ...line,
      startTimeMs: shiftTime(line.startTimeMs, offsetMs),
      endTimeMs: shiftTime(line.endTimeMs, offsetMs),
      words: line.words.map((word) => ({
        ...word,
        startTimeMs: Math.max(0, word.startTimeMs + offsetMs),
        endTimeMs: Math.max(0, word.endTimeMs + offsetMs),
      })),
    })),
  };
};

export const createNormalizedContent = (
  lines: readonly LyricsLine[],
  format: LyricsFormat,
  timing: LyricsTiming,
  offsetMs: number,
  version: number,
  activeRange?: LyricsEditorActiveRange,
): LyricsEditorNormalizedContent => ({
  version,
  format,
  timing,
  offsetMs,
  ...(activeRange ? { activeRange } : {}),
  lines: lines.map((line) => ({
    id: line.id,
    text: line.text,
    startMs: line.startTimeMs,
    endMs: line.endTimeMs,
    words: line.words.map((word) => ({
      text: word.text,
      startMs: word.startTimeMs,
      endMs: word.endTimeMs,
      ...(word.romanizedText ? { romanizedText: word.romanizedText } : {}),
    })),
    translatedText: line.translatedText,
    romanizedText: line.romanizedText,
    isBackground: line.isBackground,
    isDuet: line.isDuet,
  })),
});
