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
import { getActiveLyricsLineIndex, parseLyrics } from '../../../utils/lyrics';
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
import { LyricsLiveSyncPanel } from './LyricsLiveSyncPanel';
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

const readLrcReferenceTimes = (value: string): Array<number | null> | null => {
  try {
    const imported = parseLyrics(value);
    return imported.format === 'lrc' ? imported.lines.map((line) => line.startTimeMs) : null;
  } catch {
    return null;
  }
};

export const LyricsEditor: FC<LyricsEditorProps> = ({
  initialLyrics = null,
  initialActiveRange = null,
  initialOffsetMs = 0,
  songId,
  songTitle,
  songArtist,
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
  const [viewMode, setViewMode] = useState<'compose' | 'sync' | 'preview'>('compose');
  const [sourceText, setSourceText] = useState(() => toVisibleSourceText(content));
  const [sourceKind, setSourceKind] = useState<LyricsEditorSaveSource>('editor');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusRequest, setFocusRequest] = useState<LyricsEditorFocusRequest | null>(null);
  const [lastMark, setLastMark] = useState<LastMark | null>(null);
  const [lastSkipped, setLastSkipped] = useState<{
    index: number;
    line: LyricsLine;
    referenceTime: number | null;
    wasManuallyMarked: boolean;
  } | null>(null);
  const [referenceTimes, setReferenceTimes] = useState<Array<number | null> | null>(null);
  const [alignmentStart, setAlignmentStart] = useState<{ index: number; targetTimeMs: number } | null>(null);
  const [alignmentApplied, setAlignmentApplied] = useState(false);
  const [liveMarkedIndices, setLiveMarkedIndices] = useState<Set<number>>(() => new Set());
  const [lyricsRange, setLyricsRange] = useState<{
    startIndex: number;
    endIndex: number;
    manual: boolean;
  } | null>(() => initialActiveRange ? { ...initialActiveRange, manual: true } : null);
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

  useEffect(() => {
    if (!isRestored || isDirty || referenceTimes || format !== 'lrc' || lines.length === 0) return;
    if (lines.every((line) => line.startTimeMs !== null)) {
      setReferenceTimes(lines.map((line) => line.startTimeMs));
    }
  }, [format, isDirty, isRestored, lines, referenceTimes]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!audioUrl) return;
    setNativeAudio({ currentTime: 0, duration: null, playing: false });
    setAudioError(null);
    audioRef.current?.load();
  }, [audioUrl]);

  const suggestedLyricsRange = useMemo(() => {
    const fallback = { startIndex: 0, endIndex: Math.max(0, lines.length - 1) };
    if (!effectiveDuration || lines.length === 0 || !lines.every((line) => line.startTimeMs !== null)) return fallback;
    const durationMs = Math.round(effectiveDuration * 1_000);
    const includedIndices = lines.flatMap((line, index) => {
      const timeMs = (line.startTimeMs ?? 0) + offsetMs;
      return timeMs >= 0 && timeMs <= durationMs ? [index] : [];
    });
    if (includedIndices.length === 0) return fallback;
    return {
      startIndex: includedIndices[0],
      endIndex: includedIndices[includedIndices.length - 1],
    };
  }, [effectiveDuration, lines, offsetMs]);
  const activeLyricsRange = useMemo(() => {
    const maximumIndex = Math.max(0, lines.length - 1);
    const source = lyricsRange ?? { ...suggestedLyricsRange, manual: false };
    const startIndex = Math.max(0, Math.min(maximumIndex, source.startIndex));
    const endIndex = Math.max(startIndex, Math.min(maximumIndex, source.endIndex));
    return { startIndex, endIndex, manual: source.manual };
  }, [lines.length, lyricsRange, suggestedLyricsRange]);
  const activeLines = useMemo(
    () => lines.slice(activeLyricsRange.startIndex, activeLyricsRange.endIndex + 1),
    [activeLyricsRange.endIndex, activeLyricsRange.startIndex, lines],
  );
  const activeContent = useMemo(() => serializeLyricsLines(activeLines), [activeLines]);
  const activeParsedLyrics = useMemo(() => {
    if (!parsedLyrics || activeLines.length === 0) return null;
    return createParsedLyricsFromLines(activeLines, format, timing, activeContent);
  }, [activeContent, activeLines, format, parsedLyrics, timing]);
  const displayLyrics = useMemo(
    () => applyLyricsOffset(activeParsedLyrics, offsetMs),
    [activeParsedLyrics, offsetMs],
  );
  const activePlaybackIndex = useMemo(() => {
    if (!displayLyrics || displayLyrics.timing === 'none') return -1;
    const relativeIndex = getActiveLyricsLineIndex(displayLyrics.lines, Math.round(effectiveCurrentTime * 1_000));
    return relativeIndex < 0 ? -1 : relativeIndex + activeLyricsRange.startIndex;
  }, [activeLyricsRange.startIndex, displayLyrics, effectiveCurrentTime]);
  const validation = useMemo(
    () => validateLyricsDraft({
      content: activeContent,
      lines: activeLines,
      offsetMs,
      durationSeconds: effectiveDuration,
      parseError,
    }),
    [activeContent, activeLines, effectiveDuration, offsetMs, parseError],
  );

  useEffect(() => {
    if (lyricsRange?.manual) return;
    setLyricsRange({ ...suggestedLyricsRange, manual: false });
  }, [lyricsRange?.manual, suggestedLyricsRange]);

  useEffect(() => {
    if (!initialActiveRange) return;
    setLyricsRange({ ...initialActiveRange, manual: true });
  }, [initialActiveRange?.endIndex, initialActiveRange?.startIndex]);
  const validationVisible = submitted
    || Boolean(parseError)
    || validation.issues.some((issue) => issue.code !== 'empty');

  const setChangedMessage = useCallback(() => {
    setSubmitted(false);
    setSaveError(null);
    setSaveMessage(null);
    setIsDirty(true);
  }, []);

  const switchViewMode = useCallback((nextMode: 'compose' | 'sync' | 'preview') => {
    if (nextMode === 'preview' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setViewMode(nextMode);
  }, []);

  const updateLyricsRange = useCallback((startIndex: number, endIndex: number) => {
    const maximumIndex = Math.max(0, lines.length - 1);
    const safeStart = Math.max(0, Math.min(maximumIndex, startIndex));
    const safeEnd = Math.max(safeStart, Math.min(maximumIndex, endIndex));
    setLyricsRange({ startIndex: safeStart, endIndex: safeEnd, manual: true });
    setChangedMessage();
  }, [lines.length, setChangedMessage]);

  const restoreAutomaticLyricsRange = useCallback(() => {
    setLyricsRange({ ...suggestedLyricsRange, manual: false });
    setChangedMessage();
  }, [setChangedMessage, suggestedLyricsRange]);

  const includeInsertedLineInRange = useCallback((insertIndex: number) => {
    const shiftedStart = activeLyricsRange.startIndex >= insertIndex
      ? activeLyricsRange.startIndex + 1
      : activeLyricsRange.startIndex;
    const shiftedEnd = activeLyricsRange.endIndex >= insertIndex
      ? activeLyricsRange.endIndex + 1
      : activeLyricsRange.endIndex;
    setLyricsRange({
      startIndex: Math.min(shiftedStart, insertIndex),
      endIndex: Math.max(shiftedEnd, insertIndex),
      manual: true,
    });
  }, [activeLyricsRange.endIndex, activeLyricsRange.startIndex]);

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
      setReferenceTimes(readLrcReferenceTimes(text));
      setAlignmentStart(null);
      setAlignmentApplied(false);
      setLiveMarkedIndices(new Set());
      setLyricsRange(null);
      setLastMark(null);
      setLastSkipped(null);
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
    setReferenceTimes(readLrcReferenceTimes(pastedText));
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLiveMarkedIndices(new Set());
    setLyricsRange(null);
    setLastMark(null);
    setLastSkipped(null);
    setSelectedIndex(0);
    setChangedMessage();
  }, [setChangedMessage, setContent]);

  const applySourceText = useCallback(() => {
    setInputError(null);
    setSourceKind('editor');
    setContent(sourceText);
    setReferenceTimes(readLrcReferenceTimes(sourceText));
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLiveMarkedIndices(new Set());
    setLyricsRange(null);
    setLastMark(null);
    setLastSkipped(null);
    setSelectedIndex(0);
    setChangedMessage();
  }, [setChangedMessage, setContent, sourceText]);

  const applyOnlineLyrics = useCallback((onlineContent: string, hasTiming: boolean) => {
    setInputError(null);
    setSourceText(onlineContent);
    setSourceKind('editor');
    setContent(onlineContent, hasTiming ? 'lrc' : 'plain');
    if (hasTiming) {
      const imported = parseLyrics(onlineContent, 'lrc');
      setReferenceTimes(imported.lines.map((line) => line.startTimeMs));
    } else {
      setReferenceTimes(null);
    }
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLiveMarkedIndices(new Set());
    setLyricsRange(null);
    setLastMark(null);
    setLastSkipped(null);
    setSelectedIndex(0);
    setViewMode('sync');
    setChangedMessage();
  }, [setChangedMessage, setContent]);

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

  const insertLine = useCallback((index: number, position: 'before' | 'after') => {
    const insertIndex = Math.max(0, Math.min(lines.length, index + (position === 'after' ? 1 : 0)));
    const referenceLine = lines[index];
    const previousTimeMs = lines[insertIndex - 1]?.startTimeMs ?? null;
    const nextTimeMs = lines[insertIndex]?.startTimeMs ?? null;
    const inferredTimeMs = previousTimeMs !== null && nextTimeMs !== null
      ? Math.round((previousTimeMs + nextTimeMs) / 2)
      : previousTimeMs !== null
        ? previousTimeMs + 1_000
        : nextTimeMs !== null
          ? Math.max(0, nextTimeMs - 1_000)
          : null;
    const nextLine = {
      ...createEditorLine(insertIndex),
      startTimeMs: inferredTimeMs,
      isDuet: Boolean(referenceLine?.isDuet),
      isBackground: Boolean(referenceLine?.isBackground),
    };
    const nextLines = [...lines];
    nextLines.splice(insertIndex, 0, nextLine);
    setReferenceTimes((previous) => {
      if (!previous) return null;
      const next = [...previous];
      next.splice(insertIndex, 0, null);
      return next;
    });
    setLiveMarkedIndices((previous) => new Set(
      [...previous].map((lineIndex) => lineIndex >= insertIndex ? lineIndex + 1 : lineIndex),
    ));
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLastMark(null);
    includeInsertedLineInRange(insertIndex);
    commitLines(nextLines);
    selectAndFocusLine(insertIndex);
  }, [commitLines, includeInsertedLineInRange, lines, selectAndFocusLine]);

  const removeLine = useCallback((index: number) => {
    const nextLines = lines.filter((_, lineIndex) => lineIndex !== index);
    setReferenceTimes((previous) => previous?.filter((_, lineIndex) => lineIndex !== index) ?? null);
    setLiveMarkedIndices((previous) => new Set(
      [...previous]
        .filter((lineIndex) => lineIndex !== index)
        .map((lineIndex) => lineIndex > index ? lineIndex - 1 : lineIndex),
    ));
    if (nextLines.length === 0) {
      setLyricsRange(null);
    } else {
      let startIndex = activeLyricsRange.startIndex;
      let endIndex = activeLyricsRange.endIndex;
      if (index < startIndex) {
        startIndex -= 1;
        endIndex -= 1;
      } else if (index <= endIndex) {
        endIndex -= 1;
      }
      startIndex = Math.max(0, Math.min(nextLines.length - 1, startIndex));
      endIndex = Math.max(startIndex, Math.min(nextLines.length - 1, endIndex));
      setLyricsRange({ startIndex, endIndex, manual: activeLyricsRange.manual });
    }
    setLastMark(null);
    setSelectedIndex((previous) => Math.min(previous, Math.max(0, nextLines.length - 1)));
    commitLines(nextLines);
  }, [activeLyricsRange, commitLines, lines]);

  const markLine = useCallback((targetIndex: number) => {
    const workingLines = lines.length > 0 ? [...lines] : [createEditorLine(0)];
    const index = Math.max(0, Math.min(targetIndex, workingLines.length - 1));
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
  }, [commitLines, effectiveCurrentTime, lines, offsetMs, pausePlayback, selectAndFocusLine]);

  const markCurrentLine = useCallback(() => {
    markLine(selectedIndex);
  }, [markLine, selectedIndex]);

  const markLiveCurrentLine = useCallback(() => {
    if (!lines[selectedIndex]) return;
    const currentTimeMs = Math.round(effectiveCurrentTime * 1_000);
    const rawTimeMs = Math.max(0, currentTimeMs - offsetMs);
    const selectedLine = lines[selectedIndex];
    const nextLines = lines.map((line, index) => (
      index === selectedIndex ? { ...line, startTimeMs: rawTimeMs, endTimeMs: null } : line
    ));
    setSaveError(null);
    setLastMark({ index: selectedIndex, previousTimeMs: selectedLine.startTimeMs });
    setLastSkipped(null);
    setLiveMarkedIndices((previous) => new Set(previous).add(selectedIndex));
    setAlignmentApplied(false);
    commitLines(nextLines, 'lrc');
    if (selectedIndex >= nextLines.length - 1) {
      pausePlayback();
      return;
    }
    setSelectedIndex(selectedIndex + 1);
  }, [commitLines, effectiveCurrentTime, lines, offsetMs, pausePlayback, selectedIndex]);

  const resetLiveTiming = useCallback(() => {
    if (!window.confirm('清除全部歌词时间并从头重新打点？歌词文字会保留。')) return;
    const nextLines = lines.map((line) => ({ ...line, startTimeMs: null, endTimeMs: null, words: [] }));
    setReferenceTimes(null);
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLiveMarkedIndices(new Set());
    setLastMark(null);
    setLastSkipped(null);
    setSelectedIndex(0);
    setLyricsRange(null);
    commitLines(nextLines, 'plain');
    seekTo(0);
  }, [commitLines, lines, seekTo]);

  const alignLiveFromCurrentLine = useCallback(() => {
    const sourceTimeMs = referenceTimes?.[selectedIndex];
    if (sourceTimeMs === null || sourceTimeMs === undefined) {
      setSaveError('当前歌词没有可用于整体对齐的原始时间。');
      return;
    }
    const targetTimeMs = Math.round(effectiveCurrentTime * 1_000);
    setOffsetMs(targetTimeMs - sourceTimeMs);
    setAlignmentStart({ index: selectedIndex, targetTimeMs });
    setAlignmentApplied(true);
    setLastMark(null);
    setLastSkipped(null);
    setChangedMessage();
  }, [effectiveCurrentTime, referenceTimes, selectedIndex, setChangedMessage, setOffsetMs]);

  const stretchLiveToCurrentLine = useCallback(() => {
    if (!alignmentStart || !referenceTimes) return;
    const sourceStartMs = referenceTimes[alignmentStart.index];
    const sourceEndMs = referenceTimes[selectedIndex];
    const targetEndMs = Math.round(effectiveCurrentTime * 1_000);
    if (sourceStartMs === null || sourceStartMs === undefined || sourceEndMs === null || sourceEndMs === undefined) return;
    if (sourceEndMs <= sourceStartMs || targetEndMs <= alignmentStart.targetTimeMs) {
      setSaveError('结尾锚点必须位于开头锚点之后。');
      return;
    }
    const ratio = (targetEndMs - alignmentStart.targetTimeMs) / (sourceEndMs - sourceStartMs);
    if (ratio < 0.5 || ratio > 2) {
      setSaveError('两次标记的跨度差异过大，请检查选中的歌词和播放位置。');
      return;
    }
    const nextLines = lines.map((line, index) => {
      const sourceTime = referenceTimes[index];
      if (sourceTime === null || sourceTime === undefined) return line;
      return {
        ...line,
        startTimeMs: Math.max(0, Math.round(alignmentStart.targetTimeMs + ((sourceTime - sourceStartMs) * ratio))),
        endTimeMs: null,
        words: [],
      };
    });
    setOffsetMs(0);
    setAlignmentApplied(true);
    setSaveError(null);
    commitLines(nextLines, 'lrc');
  }, [alignmentStart, commitLines, effectiveCurrentTime, lines, referenceTimes, selectedIndex, setOffsetMs]);

  const finishLiveAtLastMarkedLine = useCallback(() => {
    const lastMarkedIndex = Math.max(-1, ...liveMarkedIndices);
    if (lastMarkedIndex < 0 || lastMarkedIndex >= lines.length - 1) return;
    setLyricsRange({
      startIndex: Math.min(activeLyricsRange.startIndex, lastMarkedIndex),
      endIndex: lastMarkedIndex,
      manual: true,
    });
    setSelectedIndex(lastMarkedIndex);
    setChangedMessage();
  }, [activeLyricsRange.startIndex, lines.length, liveMarkedIndices, setChangedMessage]);

  const selectLiveLine = useCallback((index: number) => {
    const line = lines[index];
    setSelectedIndex(index);
    if (line?.startTimeMs !== null && line?.startTimeMs !== undefined) {
      seekTo((line.startTimeMs + offsetMs) / 1_000);
    }
  }, [lines, offsetMs, seekTo]);

  const nudgeLiveOffset = useCallback((deltaMs: number) => {
    setOffsetMs(offsetMs + deltaMs);
    setChangedMessage();
  }, [offsetMs, setChangedMessage, setOffsetMs]);

  const skipLiveLine = useCallback(() => {
    const skippedLine = lines[selectedIndex];
    if (!skippedLine) return;
    const nextLines = lines.filter((_, index) => index !== selectedIndex);
    setLastSkipped({
      index: selectedIndex,
      line: skippedLine,
      referenceTime: referenceTimes?.[selectedIndex] ?? null,
      wasManuallyMarked: liveMarkedIndices.has(selectedIndex),
    });
    setReferenceTimes((previous) => previous?.filter((_, index) => index !== selectedIndex) ?? null);
    setLiveMarkedIndices((previous) => new Set(
      [...previous]
        .filter((index) => index !== selectedIndex)
        .map((index) => (index > selectedIndex ? index - 1 : index)),
    ));
    setAlignmentStart(null);
    setAlignmentApplied(false);
    setLastMark(null);
    setSelectedIndex(Math.min(selectedIndex, Math.max(0, nextLines.length - 1)));
    commitLines(nextLines);
  }, [commitLines, lines, liveMarkedIndices, referenceTimes, selectedIndex]);

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
      includeInsertedLineInRange(nextIndex);
    }
    setSaveError(null);
    commitLines(nextLines);
    selectAndFocusLine(nextIndex);
    resumePlayback();
  }, [commitLines, includeInsertedLineInRange, lines, resumePlayback, selectAndFocusLine]);

  const undoLastMark = useCallback(() => {
    if (!lastMark || !lines[lastMark.index]) return;
    const nextLines = lines.map((line, index) => (
      index === lastMark.index
        ? { ...line, startTimeMs: lastMark.previousTimeMs, endTimeMs: null }
        : line
    ));
    setSelectedIndex(lastMark.index);
    setLiveMarkedIndices((previous) => {
      const next = new Set(previous);
      next.delete(lastMark.index);
      return next;
    });
    setLastMark(null);
    commitLines(nextLines);
  }, [commitLines, lastMark, lines]);

  const undoLiveAction = useCallback(() => {
    if (!lastSkipped) {
      undoLastMark();
      return;
    }
    const nextLines = [...lines];
    nextLines.splice(Math.min(lastSkipped.index, nextLines.length), 0, lastSkipped.line);
    setReferenceTimes((previous) => {
      if (!previous) return null;
      const next = [...previous];
      next.splice(Math.min(lastSkipped.index, next.length), 0, lastSkipped.referenceTime);
      return next;
    });
    setLiveMarkedIndices((previous) => {
      const next = new Set<number>();
      previous.forEach((index) => next.add(index >= lastSkipped.index ? index + 1 : index));
      if (lastSkipped.wasManuallyMarked) next.add(lastSkipped.index);
      return next;
    });
    setSelectedIndex(lastSkipped.index);
    setLastSkipped(null);
    commitLines(nextLines);
  }, [commitLines, lastSkipped, lines, undoLastMark]);

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
      normalizedContent: createNormalizedContent(lines, format, timing, offsetMs, safeVersion, {
        startIndex: activeLyricsRange.startIndex,
        endIndex: activeLyricsRange.endIndex,
      }),
      offsetMs,
      lines: lines.map((line) => ({ ...line, words: line.words.map((word) => ({ ...word })) })),
      parsedLyrics: createParsedLyricsFromLines(activeLines, format, timing, activeContent),
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
  }, [activeContent, activeLines, activeLyricsRange.endIndex, activeLyricsRange.startIndex, clearDraft, clearDraftOnSave, content, format, lines, offsetMs, onSave, parsedLyrics, saving, sourceKind, sourceProp, timing, validation.valid, version]);

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
          loop
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
          <p className="mt-1 text-sm leading-6 text-white/50">{viewMode === 'sync' ? '复用 LRC 或文本，为 Live 录音快速对轴。' : '原创歌词，从零打点并填写内容。'}</p>
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
        songTitle={songTitle}
        songArtist={songArtist}
        disabled={saving}
        onSourceChange={handleSourceChange}
        onSourcePaste={handleSourcePaste}
        onFileChange={handleFileChange}
        onApply={applySourceText}
        onOnlineSelect={applyOnlineLyrics}
      />

      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-white/10 py-3" role="tablist" aria-label="歌词编辑视图">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white/60">
          <Clock3 size={16} aria-hidden="true" />
          {formatClock(effectiveCurrentTime)} / {formatClock(effectiveDuration)}
        </div>
        <div className="grid shrink-0 grid-cols-3 rounded-full border border-white/10 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'compose'}
            onClick={() => switchViewMode('compose')}
            className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${viewMode === 'compose' ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
            data-testid="lyrics-editor-edit-tab"
          >
            制作
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'sync'}
            onClick={() => switchViewMode('sync')}
            className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${viewMode === 'sync' ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
            data-testid="lyrics-editor-sync-tab"
          >
            Live 对轴
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'preview'}
            onClick={() => switchViewMode('preview')}
            className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${viewMode === 'preview' ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}
            data-testid="lyrics-editor-preview-tab"
          >
            预览
          </button>
        </div>
      </div>

      {viewMode === 'compose' ? (
        <LyricsTimingPanel
          lines={lines}
          activeRangeStart={activeLyricsRange.startIndex}
          activeRangeEnd={activeLyricsRange.endIndex}
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
          onMarkLine={markLine}
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
          onInsertLine={insertLine}
          onRemoveLine={removeLine}
        />
      ) : viewMode === 'sync' ? (
        <LyricsLiveSyncPanel
          lines={lines}
          selectedIndex={selectedIndex}
          effectiveCurrentTime={effectiveCurrentTime}
          effectiveDuration={effectiveDuration}
          effectivePlaying={effectivePlaying}
          canSeek={canSeek}
          saving={saving}
          offsetMs={offsetMs}
          lastMarkAvailable={Boolean(lastMark || lastSkipped)}
          manualMarkedCount={liveMarkedIndices.size}
          hasReferenceTimeline={Boolean(referenceTimes?.some((time) => time !== null))}
          alignmentStartIndex={alignmentStart?.index ?? null}
          alignmentApplied={alignmentApplied}
          activeRangeStart={activeLyricsRange.startIndex}
          activeRangeEnd={activeLyricsRange.endIndex}
          suggestedRangeStart={suggestedLyricsRange.startIndex}
          suggestedRangeEnd={suggestedLyricsRange.endIndex}
          rangeIsManual={activeLyricsRange.manual}
          audioError={audioError}
          onSelectLine={selectLiveLine}
          onMark={markLiveCurrentLine}
          onTogglePlayback={togglePlayback}
          onRestartPlayback={restartPlayback}
          onSeekTime={seekTo}
          onUndo={undoLiveAction}
          onSkipLine={skipLiveLine}
          onResetTiming={resetLiveTiming}
          onAlignFromCurrentLine={alignLiveFromCurrentLine}
          onStretchToCurrentLine={stretchLiveToCurrentLine}
          onFinishAtLastMarkedLine={finishLiveAtLastMarkedLine}
          onRangeChange={updateLyricsRange}
          onRestoreAutomaticRange={restoreAutomaticLyricsRange}
          onNudgeOffset={nudgeLiveOffset}
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
          <div className="mt-3 h-[min(52dvh,420px)] min-h-[280px] w-full overflow-hidden border-y border-white/10 bg-black/20" data-testid="lyrics-editor-preview">
            <LyricsRenderer
              lyrics={displayLyrics}
              currentTime={effectiveCurrentTime}
              duration={effectiveDuration ?? undefined}
              playing={effectivePlaying}
              onSeek={canSeek ? seekTo : undefined}
              lowPerformance
              className="h-full w-full"
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
