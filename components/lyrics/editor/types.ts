import type {
  ChangeEvent,
  ClipboardEvent,
  FC,
  KeyboardEvent,
  MouseEvent,
} from 'react';
import type {
  LyricsFormat,
  LyricsInput,
  LyricsLine,
  LyricsTiming,
  ParsedLyrics,
} from '../../../utils/lyrics';
import type {
  LyricsValidationIssue,
} from '../../../hooks/useLyricsDraft';

export type LyricsEditorSaveSource = 'upload' | 'embedded' | 'editor';
export type LyricsEditorAudioAction = () => void | Promise<void>;
export type LyricsEditorLineRole = 'lead' | 'duet' | 'background';

export interface LyricsEditorFocusRequest {
  id: number;
  index: number;
}

export interface LyricsEditorAudioControls {
  currentTime?: number | null;
  duration?: number | null;
  playing?: boolean;
  onPlay?: LyricsEditorAudioAction;
  onPause?: LyricsEditorAudioAction;
  onTogglePlay?: LyricsEditorAudioAction;
  onSeek?: (timeSeconds: number) => void | Promise<void>;
}

export interface LyricsEditorNormalizedWord {
  text: string;
  startMs: number;
  endMs: number;
  romanizedText?: string;
}

export interface LyricsEditorNormalizedLine {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  words: LyricsEditorNormalizedWord[];
  translatedText: string;
  romanizedText: string;
  isBackground: boolean;
  isDuet: boolean;
}

export interface LyricsEditorNormalizedContent {
  version: number;
  format: LyricsFormat;
  timing: LyricsTiming;
  offsetMs: number;
  lines: LyricsEditorNormalizedLine[];
}

export interface LyricsEditorSavePayload {
  format: LyricsFormat;
  source: LyricsEditorSaveSource;
  version: number;
  rawContent: string;
  content: string;
  normalizedContent: LyricsEditorNormalizedContent;
  offsetMs: number;
  lines: LyricsLine[];
  parsedLyrics: ParsedLyrics;
}

export interface LyricsEditorProps {
  /** 初始歌词，可以是纯文本、统一歌词输入或已经解析的歌词模型。 */
  initialLyrics?: LyricsInput | ParsedLyrics | null;
  /** 初始全局偏移，单位为毫秒。 */
  initialOffsetMs?: number;
  /** 用于隔离本地草稿的歌曲 ID。 */
  songId?: string | null;
  /** 没有歌曲 ID 时使用的本地草稿标识。 */
  draftKey?: string | null;
  /** 歌曲时长，单位为秒；用于保存前的超时校验。 */
  duration?: number | null;
  /** 可选的音频地址。没有外部控制回调时，编辑器会使用它进行试听。 */
  audioUrl?: string;
  /** 外部播放器控制；业务页面可以只传这一组回调和播放状态。 */
  audioControls?: LyricsEditorAudioControls;
  /** 以下字段是 audioControls 的扁平兼容写法，便于接入已有播放器。 */
  currentTime?: number | null;
  playing?: boolean;
  isPlaying?: boolean;
  onPlay?: LyricsEditorAudioAction;
  onPause?: LyricsEditorAudioAction;
  onTogglePlay?: LyricsEditorAudioAction;
  onSeek?: (timeSeconds: number) => void | Promise<void>;
  /** 保存歌词到业务 API；成功返回后会清除对应本地草稿。 */
  onSave?: (payload: LyricsEditorSavePayload) => void | Promise<void>;
  /** 保存成功后是否清除当前歌曲的本地草稿；暂存到上传流程时可设为 false。 */
  clearDraftOnSave?: boolean;
  saving?: boolean;
  source?: LyricsEditorSaveSource;
  version?: number;
  className?: string;
}

export interface NativeAudioState {
  currentTime: number;
  duration: number | null;
  playing: boolean;
}

export interface LastMark {
  index: number;
  previousTimeMs: number | null;
}

export interface LyricsSourcePanelProps {
  sourceText: string;
  format: LyricsFormat;
  timing: LyricsTiming;
  inputError: string | null;
  parseError: string | null;
  onSourceChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSourcePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onApply: () => void;
  onCreateBlank: () => void;
}

export interface LyricsTimingPanelProps {
  lines: readonly LyricsLine[];
  selectedIndex: number;
  activePlaybackIndex: number;
  effectiveCurrentTime: number;
  effectiveDuration: number | null;
  effectivePlaying: boolean;
  canControlPlayback: boolean;
  canSeek: boolean;
  offsetMs: number;
  lastMark: LastMark | null;
  saving: boolean;
  validationVisible: boolean;
  validationIssues: readonly LyricsValidationIssue[];
  audioError: string | null;
  focusRequest: LyricsEditorFocusRequest | null;
  onPrevious: () => void;
  onNext: () => void;
  onMarkCurrentLine: () => void;
  onTogglePlayback: () => void;
  onUndoLastMark: () => void;
  onOffsetChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSeekLine: (index: number) => void;
  onSelectLine: (index: number) => void;
  onLineTextChange: (index: number, text: string) => void;
  onLineRoleChange: (index: number, role: LyricsEditorLineRole) => void;
  onClearLineTime: (index: number) => void;
  onRemoveLine: (index: number) => void;
  onAddLine: () => void;
}

export type LyricsEditorLineClickHandler = (event: MouseEvent<HTMLDivElement>, index: number) => void;
export type LyricsEditorLineKeyDownHandler = (event: KeyboardEvent<HTMLDivElement>, index: number) => void;
export type LyricsEditorComponent = FC<LyricsEditorProps>;
