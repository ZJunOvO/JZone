import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FC,
  type SyntheticEvent,
} from 'react';
import {
  Clock3,
  Save,
} from 'lucide-react';
import { LyricsRenderer } from '../LyricsRenderer';
import { getActiveLyricsLineIndex } from '../../../utils/lyrics';
import type {
  LyricsFormat,
  LyricsLine,
} from '../../../utils/lyrics';
import {
  createParsedLyricsFromLines,
  serializeLyricsLines,
  useLyricsDraft,
  validateLyricsDraft,
} from '../../../hooks/useLyricsDraft';
import { LyricsSourcePanel } from './LyricsSourcePanel';
import { LyricsTimingPanel } from './LyricsTimingPanel';
import {
  applyLyricsOffset,
  clampSeconds,
  createEditorLine,
  createNormalizedContent,
  formatClock,
  formatOffset,
  toLineLevelLines,
  toSafeSeconds,
} from './lyricsEditorUtils';
import type {
  LastMark,
  NativeAudioState,
  LyricsEditorAudioAction,
  LyricsEditorFocusRequest,
  LyricsEditorLineRole,
  LyricsEditorProps,
  LyricsEditorSavePayload,
  LyricsEditorSaveSource,
} from './types';
import { Icons } from '../../Icons';

const toVisibleSourceText = (value: string): string => value
  .split(/\r?\n/)
  .filter((line) => !/^\s*\[jzone:role:\d+:(?:lead|duet|background)\]\s*$/i.test(line))
  .join('\n');

export const LyricsEditor: FC<LyricsEditorProps> = ({
  initialLyrics = null,
  initialOffsetMs = 0,
  songId,
  draftKey,
  duration,
  audioUrl,
  audioControls,
  currentTime,
  playing,
  isPlaying,
  onPlay,
  onPause,
  onTogglePlay,
  onSeek,
  onSave,
  clearDraftOnSave = true,
  saving = false,
  source: sourceProp,
  version = 1,
  className = '',
}) => {
  const {
    content,
    format,
    timing,
    offsetMs,
    lines,
    parsedLyrics,
    parseError,
    hasLocalDraft,
    isRestored,
    storageStatus,
    setContent,
    setLines,
    setOffsetMs,
    clearDraft,
  } = useLyricsDraft({ initialLyrics, initialOffsetMs, songId, draftKey });
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [sourceText, setSourceText] = useState(() => toVisibleSourceText(content));
  const [sourceKind, setSourceKind] = useState<LyricsEditorSaveSource>('editor');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusRequest, setFocusRequest] = useState<LyricsEditorFocusRequest | null>(null);
  const [lastMark, setLastMark] = useState<LastMark | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [nativeAudio, setNativeAudio] = useState<NativeAudioState>({
    currentTime: 0,
    duration: null,
    playing: false,
  });
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileReadSequenceRef = useRef(0);
  const focusRequestIdRef = useRef(0);

  const controlCurrentTime = audioControls?.currentTime ?? currentTime;
  const controlDuration = audioControls?.duration ?? duration;
  const controlPlaying = audioControls?.playing ?? isPlaying ?? playing;
  const controlOnPlay = audioControls?.onPlay ?? onPlay;
  const controlOnPause = audioControls?.onPause ?? onPause;
  const controlOnTogglePlay = audioControls?.onTogglePlay ?? onTogglePlay;
  const controlOnSeek = audioControls?.onSeek ?? onSeek;
  const explicitDuration = toSafeSeconds(controlDuration);
  const explicitCurrentTime = toSafeSeconds(controlCurrentTime);
  const effectiveDuration = explicitDuration ?? nativeAudio.duration;
  const effectiveCurrentTime = clampSeconds(
    explicitCurrentTime ?? nativeAudio.currentTime,
    effectiveDuration,
  );
  const effectivePlaying = typeof controlPlaying === 'boolean'
    ? controlPlaying
    : nativeAudio.playing;
  const canControlPlayback = Boolean(controlOnPlay || controlOnPause || controlOnTogglePlay || audioUrl);
  const canSeek = Boolean(controlOnSeek || audioUrl);

  useEffect(() => {
    setSourceText(toVisibleSourceText(content));
  }, [content]);

  useEffect(() => {
    setSelectedIndex((previous) => {
      if (lines.length === 0) return 0;
      return Math.min(previous, lines.length - 1);
    });
  }, [lines.length]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!audioUrl) return;
    setNativeAudio({ currentTime: 0, duration: null, playing: false });
    setAudioError(null);
    audioRef.current?.load();
  }, [audioUrl]);

  const displayLyrics = useMemo(
    () => applyLyricsOffset(parsedLyrics, offsetMs),
    [offsetMs, parsedLyrics],
  );
  const activePlaybackIndex = useMemo(() => {
    if (!displayLyrics || displayLyrics.timing === 'none') return -1;
    return getActiveLyricsLineIndex(displayLyrics.lines, Math.round(effectiveCurrentTime * 1_000));
  }, [displayLyrics, effectiveCurrentTime]);
  const validation = useMemo(
    () => validateLyricsDraft({
      content,
      lines,
      offsetMs,
      durationSeconds: effectiveDuration,
      parseError,
    }),
    [content, effectiveDuration, lines, offsetMs, parseError],
  );
  const validationVisible = submitted
    || Boolean(parseError)
    || validation.issues.some((issue) => issue.code !== 'empty');

  const setChangedMessage = useCallback(() => {
    setSubmitted(false);
    setSaveError(null);
    setSaveMessage(null);
    setIsDirty(true);
  }, []);

  const commitLines = useCallback((nextLines: readonly LyricsLine[], preferredFormat?: LyricsFormat) => {
    const lineLevelLines = toLineLevelLines(nextLines);
    const hasTiming = lineLevelLines.some((line) => line.startTimeMs !== null);
    setLines(lineLevelLines, {
      content: serializeLyricsLines(lineLevelLines),
      format: preferredFormat ?? (hasTiming ? 'lrc' : 'plain'),
      timing: hasTiming ? 'line' : 'none',
    });
    setChangedMessage();
  }, [setChangedMessage, setLines]);

  const invokeAudioAction = useCallback((action: LyricsEditorAudioAction | undefined, fallbackMessage: string) => {
    if (!action) return false;
    try {
      void Promise.resolve(action()).catch((error: unknown) => {
        setAudioError(error instanceof Error ? error.message : fallbackMessage);
      });
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : fallbackMessage);
    }
    return true;
  }, []);

  const pausePlayback = useCallback(() => {
    setAudioError(null);
    if (controlOnPause && invokeAudioAction(controlOnPause, '暂停试听失败。')) return;
    if (effectivePlaying && controlOnTogglePlay && invokeAudioAction(controlOnTogglePlay, '暂停试听失败。')) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setNativeAudio((previous) => ({ ...previous, playing: false }));
  }, [controlOnPause, controlOnTogglePlay, effectivePlaying, invokeAudioAction]);

  const resumePlayback = useCallback(() => {
    setAudioError(null);
    if (controlOnPlay && invokeAudioAction(controlOnPlay, '继续试听失败。')) return;
    if (!effectivePlaying && controlOnTogglePlay && invokeAudioAction(controlOnTogglePlay, '继续试听失败。')) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      void audio.play().catch((error: unknown) => {
        setAudioError(error instanceof Error ? error.message : '继续试听失败。');
      });
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : '继续试听失败。');
    }
  }, [controlOnPlay, controlOnTogglePlay, effectivePlaying, invokeAudioAction]);

  const selectAndFocusLine = useCallback((index: number) => {
    setSelectedIndex(index);
    setFocusRequest({ id: ++focusRequestIdRef.current, index });
  }, []);

  const seekTo = useCallback((timeSeconds: number) => {
    const nextTime = clampSeconds(timeSeconds, effectiveDuration);
    if (controlOnSeek) {
      try {
        void Promise.resolve(controlOnSeek(nextTime)).catch((error: unknown) => {
          setAudioError(error instanceof Error ? error.message : '跳转播放位置失败。');
        });
      } catch (error) {
        setAudioError(error instanceof Error ? error.message : '跳转播放位置失败。');
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = nextTime;
      setNativeAudio((previous) => ({ ...previous, currentTime: nextTime }));
    } catch {
      setAudioError('当前音频不支持跳转试听。');
    }
  }, [controlOnSeek, effectiveDuration]);

  const togglePlayback = useCallback(() => {
    setAudioError(null);
    if (controlOnTogglePlay && invokeAudioAction(controlOnTogglePlay, '切换播放状态失败。')) return;
    if (effectivePlaying) {
      if (controlOnPause && invokeAudioAction(controlOnPause, '暂停试听失败。')) return;
      if (audioRef.current) {
        audioRef.current.pause();
        return;
      }
    } else {
      if (controlOnPlay && invokeAudioAction(controlOnPlay, '开始试听失败。')) return;
      if (audioRef.current) {
        try {
          void audioRef.current.play().catch((error: unknown) => {
            setAudioError(error instanceof Error ? error.message : '开始试听失败。');
          });
        } catch (error) {
          setAudioError(error instanceof Error ? error.message : '开始试听失败。');
        }
        return;
      }
    }
    setAudioError('当前歌曲暂时无法试听。');
  }, [controlOnPause, controlOnPlay, controlOnTogglePlay, effectivePlaying, invokeAudioAction]);

  const restartPlayback = useCallback(() => {
    seekTo(0);
    if (!effectivePlaying) resumePlayback();
  }, [effectivePlaying, resumePlayback, seekTo]);

  const handleAudioTimeUpdate = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    setNativeAudio({
      currentTime: toSafeSeconds(audio.currentTime) ?? 0,
      duration: toSafeSeconds(audio.duration),
      playing: !audio.paused,
    });
  }, []);

  const handleAudioLoadedMetadata = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    setNativeAudio((previous) => ({
      ...previous,
      duration: toSafeSeconds(audio.duration),
    }));
  }, []);

  const handleAudioPlay = useCallback(() => {
    setNativeAudio((previous) => ({ ...previous, playing: true }));
  }, []);

  const handleAudioPause = useCallback(() => {
    setNativeAudio((previous) => ({ ...previous, playing: false }));
  }, []);

  const handleAudioError = useCallback(() => {
    setAudioError('音频无法加载，仍可继续编辑歌词。');
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const sequence = ++fileReadSequenceRef.current;
    setInputError(null);
    try {
      const text = await file.text();
      if (sequence !== fileReadSequenceRef.current) return;
      if (!text.trim()) {
        setInputError('歌词文件为空，请选择有内容的 .lrc、.txt 或 .ttml 文件。');
        return;
      }
      setSourceText(text);
      setSourceKind('upload');
      setContent(text);
      setLastMark(null);
      setSelectedIndex(0);
      setChangedMessage();
    } catch (error) {
      if (sequence !== fileReadSequenceRef.current) return;
      setInputError(error instanceof Error ? `歌词文件读取失败：${error.message}` : '歌词文件读取失败。');
    }
  }, [setChangedMessage, setContent]);

  const handleSourceChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setSourceText(event.target.value);
    setInputError(null);
  }, []);

  const handleSourcePaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;
    event.preventDefault();
    setSourceText(pastedText);
    setSourceKind('editor');
    setContent(pastedText);
    setLastMark(null);
    setSelectedIndex(0);
    setChangedMessage();
  }, [setChangedMessage, setContent]);

  const applySourceText = useCallback(() => {
    setInputError(null);
    setSourceKind('editor');
    setContent(sourceText);
    setLastMark(null);
    setSelectedIndex(0);
    setChangedMessage();
  }, [setChangedMessage, setContent, sourceText]);

  const updateLineText = useCallback((index: number, text: string) => {
    const nextLines = lines.map((line, lineIndex) => (
      lineIndex === index ? { ...line, text } : line
    ));
    commitLines(nextLines);
  }, [commitLines, lines]);

  const updateLineRole = useCallback((index: number, role: LyricsEditorLineRole) => {
    const nextLines = lines.map((line, lineIndex) => (
      lineIndex === index
        ? {
            ...line,
            isDuet: role === 'duet',
            isBackground: role === 'background',
          }
        : line
    ));
    setSelectedIndex(index);
    commitLines(nextLines);
  }, [commitLines, lines]);

  const removeLine = useCallback((index: number) => {
    const nextLines = lines.filter((_, lineIndex) => lineIndex !== index);
    setLastMark(null);
    setSelectedIndex((previous) => Math.min(previous, Math.max(0, nextLines.length - 1)));
    commitLines(nextLines);
  }, [commitLines, lines]);

  const markCurrentLine = useCallback(() => {
    const workingLines = lines.length > 0 ? [...lines] : [createEditorLine(0)];
    const index = Math.min(selectedIndex, workingLines.length - 1);
    const selectedLine = workingLines[index];
    const currentTimeMs = Math.round(effectiveCurrentTime * 1_000);
    const rawTimeMs = Math.max(0, currentTimeMs - offsetMs);
    const nextLines = workingLines.map((line, lineIndex) => (
      lineIndex === index
        ? { ...line, startTimeMs: rawTimeMs, endTimeMs: null }
        : line
    ));
    setSaveError(null);
    setLastMark({ index, previousTimeMs: selectedLine.startTimeMs });
    commitLines(nextLines, 'lrc');
    pausePlayback();
    selectAndFocusLine(index);
  }, [commitLines, effectiveCurrentTime, lines, offsetMs, pausePlayback, selectAndFocusLine, selectedIndex]);

  const completeLine = useCallback((index: number) => {
    const line = lines[index];
    if (!line?.text.trim()) {
      setSaveError(`请填写第 ${index + 1} 行歌词后再继续。`);
      selectAndFocusLine(index);
      return;
    }

    let nextLines = [...lines];
    const nextIndex = index + 1;
    if (nextIndex >= nextLines.length) {
      const nextLine = createEditorLine(nextLines.length);
      nextLines = [
        ...nextLines,
        {
          ...nextLine,
          isDuet: line.isDuet,
          isBackground: line.isBackground,
        },
      ];
    }
    setSaveError(null);
    commitLines(nextLines);
    selectAndFocusLine(nextIndex);
    resumePlayback();
  }, [commitLines, lines, resumePlayback, selectAndFocusLine]);

  const undoLastMark = useCallback(() => {
    if (!lastMark || !lines[lastMark.index]) return;
    const nextLines = lines.map((line, index) => (
      index === lastMark.index
        ? { ...line, startTimeMs: lastMark.previousTimeMs, endTimeMs: null }
        : line
    ));
    setSelectedIndex(lastMark.index);
    setLastMark(null);
    commitLines(nextLines);
  }, [commitLines, lastMark, lines]);

  const moveSelection = useCallback((direction: -1 | 1) => {
    if (lines.length === 0) return;
    const nextIndex = Math.max(0, Math.min(lines.length - 1, selectedIndex + direction));
    selectAndFocusLine(nextIndex);
  }, [lines.length, selectAndFocusLine, selectedIndex]);

  const seekLine = useCallback((index: number) => {
    const line = lines[index];
    setSelectedIndex(index);
    if (line?.startTimeMs !== null && line?.startTimeMs !== undefined) {
      seekTo((line.startTimeMs + offsetMs) / 1_000);
    }
  }, [lines, offsetMs, seekTo]);

  const saveLyrics = useCallback(async () => {
    setSubmitted(true);
    setSaveError(null);
    setSaveMessage(null);
    if (saving) return;
    if (!validation.valid) return;
    if (!onSave) {
      setSaveError('当前页面没有提供 onSave，歌词仍保留在本地草稿中。');
      return;
    }
    if (!parsedLyrics) {
      setSaveError('歌词还没有可保存的解析结果。');
      return;
    }
    const safeVersion = Number.isSafeInteger(version) && version > 0 ? version : 1;
    const payload: LyricsEditorSavePayload = {
      format,
      source: sourceProp ?? sourceKind,
      version: safeVersion,
      rawContent: content,
      content,
      normalizedContent: createNormalizedContent(lines, format, timing, offsetMs, safeVersion),
      offsetMs,
      lines: lines.map((line) => ({ ...line, words: line.words.map((word) => ({ ...word })) })),
      parsedLyrics: createParsedLyricsFromLines(lines, format, timing, content),
    };
    try {
      await onSave(payload);
      if (clearDraftOnSave) {
        clearDraft();
        setSaveMessage('歌词已保存。');
      } else {
        setSaveMessage('歌词已暂存，保存歌曲后会同步。');
      }
      setIsDirty(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '歌词保存失败，请稍后重试。');
    }
  }, [clearDraft, clearDraftOnSave, content, format, lines, offsetMs, onSave, parsedLyrics, saving, sourceKind, sourceProp, timing, validation.valid, version]);

  const handleOffsetChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextOffset = Number(event.target.value);
    setOffsetMs(Number.isFinite(nextOffset) ? nextOffset : 0);
    setChangedMessage();
  }, [setChangedMessage, setOffsetMs]);

  const rootClassName = ['w-full min-w-0 text-white', className].filter(Boolean).join(' ');
  const storageLabel = saving
    ? '正在保存到资料库'
    : saveMessage
      ? clearDraftOnSave ? '已保存到资料库' : '已暂存到歌曲'
    : isDirty && storageStatus === 'saved'
      ? '已自动暂存 · 待保存'
    : isDirty
      ? '正在自动暂存'
    : !isRestored
    ? '正在读取草稿'
    : hasLocalDraft
      ? storageStatus === 'error' ? '草稿保存失败' : '已恢复本地草稿'
      : storageStatus === 'saved' ? '草稿已自动保存' : '尚无本地草稿';

  return (
    <div className={rootClassName} data-testid="lyrics-editor" data-lyrics-format={format}>
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="sr-only"
          aria-label="歌词编辑器试听音频"
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          onEnded={handleAudioPause}
          onError={handleAudioError}
        />
      ) : null}

      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 px-1 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-black text-white">歌词制作</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">播放、标记，逐句完成。</p>
        </div>
        <div className="shrink-0 text-right text-xs text-white/45" aria-live="polite" data-testid="lyrics-editor-draft-status">
          <span className="block">{storageLabel}</span>
        </div>
      </header>

      <LyricsSourcePanel
        sourceText={sourceText}
        format={format}
        timing={timing}
        inputError={inputError}
        parseError={parseError}
        onSourceChange={handleSourceChange}
        onSourcePaste={handleSourcePaste}
        onFileChange={handleFileChange}
        onApply={applySourceText}
      />

      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-white/10 py-3" role="tablist" aria-label="歌词编辑视图">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white/60">
          <Clock3 size={16} aria-hidden="true" />
          {formatClock(effectiveCurrentTime)} / {formatClock(effectiveDuration)}
        </div>
        <div className="flex shrink-0 rounded-full border border-white/10 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'edit'}
            onClick={() => setViewMode('edit')}
            className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${viewMode === 'edit' ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
            data-testid="lyrics-editor-edit-tab"
          >
            编辑
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'preview'}
            onClick={() => setViewMode('preview')}
            className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${viewMode === 'preview' ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
            data-testid="lyrics-editor-preview-tab"
          >
            预览
          </button>
        </div>
      </div>

      {viewMode === 'edit' ? (
        <LyricsTimingPanel
          lines={lines}
          selectedIndex={selectedIndex}
          activePlaybackIndex={activePlaybackIndex}
          effectiveCurrentTime={effectiveCurrentTime}
          effectiveDuration={effectiveDuration}
          effectivePlaying={effectivePlaying}
          canControlPlayback={canControlPlayback}
          canSeek={canSeek}
          offsetMs={offsetMs}
          lastMark={lastMark}
          saving={saving}
          validationVisible={validationVisible}
          validationIssues={validation.issues}
          audioError={audioError}
          focusRequest={focusRequest}
          onPrevious={() => moveSelection(-1)}
          onNext={() => moveSelection(1)}
          onMarkCurrentLine={markCurrentLine}
          onTogglePlayback={togglePlayback}
          onRestartPlayback={restartPlayback}
          onSeekTime={seekTo}
          onUndoLastMark={undoLastMark}
          onOffsetChange={handleOffsetChange}
          onSeekLine={seekLine}
          onSelectLine={selectAndFocusLine}
          onLineTextChange={updateLineText}
          onCompleteLine={completeLine}
          onLineRoleChange={updateLineRole}
          onRemoveLine={removeLine}
        />
      ) : (
        <section className="border-b border-white/10 py-4" aria-labelledby="lyrics-editor-preview-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="lyrics-editor-preview-title" className="text-sm font-extrabold text-white">效果预览</h3>
              <p className="mt-1 text-xs leading-5 text-white/45">检查歌词排版与播放同步。</p>
            </div>
            <span className="shrink-0 text-xs font-bold text-white/45">{formatOffset(offsetMs)}</span>
          </div>
          <div className="mt-3 min-h-[320px] overflow-hidden border-y border-white/10 bg-black/20" data-testid="lyrics-editor-preview">
            <LyricsRenderer
              lyrics={displayLyrics}
              currentTime={effectiveCurrentTime}
              duration={effectiveDuration ?? undefined}
              playing={effectivePlaying}
              onSeek={canSeek ? seekTo : undefined}
              lowPerformance
              className="min-h-[320px]"
            />
          </div>
        </section>
      )}

      <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-zinc-950/90 px-1 py-3 backdrop-blur-xl">
        <div className="min-w-0 text-xs leading-5 text-white/45" aria-live="polite">
          {saveError ? <span className="block text-red-200" data-testid="lyrics-editor-save-error">{saveError}</span> : null}
          {saveMessage ? <span className="block text-emerald-200" data-testid="lyrics-editor-save-message">{saveMessage}</span> : null}
          {!saveError && !saveMessage ? <span>{isDirty ? '草稿已保留，点击保存后才会同步到资料库。' : hasLocalDraft ? '离开页面后可继续编辑。' : '歌词已与资料库同步。'}</span> : null}
        </div>
        <button
          type="button"
          data-testid="lyrics-editor-save"
          onClick={() => { void saveLyrics(); }}
          disabled={saving}
          className="inline-flex min-h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 active:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {saving ? <Icons.RotateCcw size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? '保存中…' : '保存歌词'}
        </button>
      </footer>
    </div>
  );
};

export type {
  LyricsEditorAudioAction,
  LyricsEditorAudioControls,
  LyricsEditorNormalizedContent,
  LyricsEditorNormalizedLine,
  LyricsEditorNormalizedWord,
  LyricsEditorProps,
  LyricsEditorSavePayload,
  LyricsEditorSaveSource,
} from './types';
