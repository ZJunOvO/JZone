export type LyricsFormat = 'plain' | 'lrc' | 'ttml';
export type LyricsTiming = 'none' | 'line' | 'word';

export interface LyricsWord {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  romanizedText?: string;
}

export interface LyricsLine {
  id: string;
  text: string;
  startTimeMs: number | null;
  endTimeMs: number | null;
  words: LyricsWord[];
  translatedText: string;
  romanizedText: string;
  isBackground: boolean;
  isDuet: boolean;
}

export interface LyricsTextInput {
  format?: LyricsFormat;
  content?: string;
  rawContent?: string;
}

export type LyricsInput = string | LyricsTextInput;

export interface ParsedLyrics {
  format: LyricsFormat;
  timing: LyricsTiming;
  rawContent: string;
  lines: LyricsLine[];
}
