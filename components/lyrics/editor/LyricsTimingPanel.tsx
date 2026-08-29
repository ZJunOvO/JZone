import {
  AlertCircle,
} from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Icons } from '../../Icons';
import { formatLyricsTime } from '../../../hooks/useLyricsDraft';
import { formatClock, formatOffset } from './lyricsEditorUtils';
import type { LyricsEditorLineRole, LyricsTimingPanelProps } from './types';

const roleOptions: ReadonlyArray<{ value: LyricsEditorLineRole; label: string }> = [
  { value: 'lead', label: '主唱' },
  { value: 'duet', label: '对唱' },
  { value: 'background', label: '和声' },
];

export const LyricsTimingPanel = ({
  lines,
  activeRangeStart,
  activeRangeEnd,
  selectedIndex,
  activePlaybackIndex,
  effectiveCurrentTime,
  effectiveDuration,
  effectivePlaying,
  canControlPlayback,
  canSeek,
  offsetMs,
  lastMark,
  saving,
  validationVisible,
  validationIssues,
  audioError,
  focusRequest,
  onPrevious,
  onNext,
  onMarkCurrentLine,
  onMarkLine,
  onTogglePlayback,
  onRestartPlayback,
  onSeekTime,
  onUndoLastMark,
  onOffsetChange,
  onSeekLine,
  onSelectLine,
  onLineTextChange,
  onCompleteLine,
  onLineRoleChange,
  onInsertLine,
  onRemoveLine,
}: LyricsTimingPanelProps) => {
  const selectedLineNumber = lines.length > 0 ? Math.min(selectedIndex, lines.length - 1) + 1 : 0;
  const lineInputRefs = useRef(new Map<number, HTMLTextAreaElement>());

  useEffect(() => {
    if (!focusRequest) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const input = lineInputRefs.current.get(focusRequest.index);
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, lines.length]);

  const handleLineClick = (event: MouseEvent<HTMLDivElement>, index: number) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, textarea, input')) return;
    onSeekLine(index);
  };

  const handleLineKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, textarea, input')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSeekLine(index);
    }
  };

  return (
    <section className="border-b border-white/10 py-4" aria-labelledby="lyrics-editor-timing-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="lyrics-editor-timing-title" className="text-sm font-extrabold text-white">逐行标记</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">听到开口时打点，写完按回车继续。</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-white/45">第 {selectedLineNumber || '--'} 行</span>
      </div>

      <div className="mt-3 flex items-center gap-3" data-testid="lyrics-editor-timeline">
        <button
          type="button"
          aria-label="从头开始试听"
          title="从头开始试听"
          onClick={onRestartPlayback}
          disabled={!canSeek || saving}
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="lyrics-editor-restart"
        >
          <Icons.RotateCcw size={17} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min="0"
            max={Math.max(0.1, effectiveDuration ?? effectiveCurrentTime ?? 0.1)}
            step="0.05"
            value={Math.min(effectiveCurrentTime, Math.max(0.1, effectiveDuration ?? effectiveCurrentTime ?? 0.1))}
            onChange={(event) => onSeekTime(Number(event.target.value))}
            disabled={!canSeek || saving}
            aria-label="歌词制作播放进度"
            className="h-11 w-full cursor-pointer accent-red-300 disabled:cursor-not-allowed disabled:opacity-35"
            data-testid="lyrics-editor-seek"
          />
          <div className="-mt-2 flex justify-between text-[11px] font-bold tabular-nums text-white/40">
            <span>{formatClock(effectiveCurrentTime)}</span>
            <span>{formatClock(effectiveDuration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          aria-label="上一行"
          disabled={selectedIndex <= 0 || lines.length === 0}
          onClick={onPrevious}
          className="grid min-h-12 min-w-12 cursor-pointer place-items-center rounded-xl border border-white/15 text-white/80 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="lyrics-editor-previous"
        >
          <Icons.SkipBack size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMarkCurrentLine}
          disabled={saving}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-400 px-3 text-sm font-black text-black shadow-[0_0_24px_rgba(248,113,113,0.2)] transition-colors hover:bg-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/80 active:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="lyrics-editor-mark"
        >
          <Icons.Check size={17} aria-hidden="true" />
          标记当前行
        </button>
        <button
          type="button"
          aria-label="下一行"
          disabled={selectedIndex >= lines.length - 1 || lines.length === 0}
          onClick={onNext}
          className="grid min-h-12 min-w-12 cursor-pointer place-items-center rounded-xl border border-white/15 text-white/80 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="lyrics-editor-next"
        >
          <Icons.SkipForward size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={effectivePlaying ? '暂停试听' : '播放试听'}
          onClick={onTogglePlayback}
          disabled={saving}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 text-sm font-bold text-white/80 transition-colors hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="lyrics-editor-play-toggle"
        >
          {effectivePlaying ? <Icons.Pause size={16} aria-hidden="true" /> : <Icons.Play size={16} aria-hidden="true" />}
          {effectivePlaying ? '暂停试听' : '播放试听'}
        </button>
        <button
          type="button"
          disabled={!lastMark || saving}
          onClick={onUndoLastMark}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 text-sm font-bold text-white/65 transition-colors hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="lyrics-editor-undo"
        >
          <Icons.RotateCcw size={16} aria-hidden="true" />
          撤销上次打点
        </button>
      </div>

      <details className="group mt-3 border-t border-white/10 pt-2" data-testid="lyrics-editor-advanced-timing">
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl px-2 text-sm font-bold text-white/55 outline-none transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-red-300/60 [&::-webkit-details-marker]:hidden">
          更多校时选项
          <span className="ml-auto text-xs text-white/35">{formatOffset(offsetMs)}</span>
        </summary>
        <div className="mt-2 flex items-center gap-3 px-1">
          <label htmlFor="lyrics-editor-offset" className="shrink-0 text-sm font-bold text-white/65">歌词偏移</label>
          <input
            id="lyrics-editor-offset"
            data-testid="lyrics-editor-offset"
            type="number"
            step="10"
            value={offsetMs}
            onChange={onOffsetChange}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-base text-white outline-none transition-colors focus:border-red-300/70 focus:ring-2 focus:ring-red-300/20"
            aria-describedby="lyrics-editor-offset-help"
          />
        </div>
        <p id="lyrics-editor-offset-help" className="mt-2 px-1 text-xs leading-5 text-white/40">正数延后，负数提前。</p>
      </details>

      {audioError ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-amber-200" role="alert" data-testid="lyrics-editor-audio-error">
          <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
          {audioError}
        </p>
      ) : !canControlPlayback ? (
        <p className="mt-3 text-xs leading-5 text-white/40">当前歌曲暂时无法试听，仍可继续编辑。</p>
      ) : null}

      {validationVisible && validationIssues.length > 0 ? (
        <div className="mt-4 border-y border-red-300/20 bg-red-300/[0.06] px-3 py-3" role="alert" data-testid="lyrics-editor-error">
          <p className="flex items-start gap-2 text-sm font-bold text-red-100">
            <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
            请修正以下问题后再保存：
          </p>
          <ul className="mt-2 space-y-1 pl-6 text-sm leading-6 text-red-100/75">
            {validationIssues.map((issue, index) => <li key={`${issue.code}-${issue.lineIndex ?? 'all'}-${index}`}>{issue.message}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-4" role="list" aria-label="歌词行">
        {lines.length === 0 ? (
          <div className="border-y border-dashed border-white/15 py-8 text-center" data-testid="lyrics-editor-empty-lines">
            <p className="text-sm font-bold text-white/65">还没有歌词行</p>
            <p className="mt-1 text-xs leading-5 text-white/40">播放歌曲，在开口时点击“标记当前行”。</p>
          </div>
        ) : lines.map((line, index) => {
          const isSelected = index === selectedIndex;
          const isPlaybackActive = index === activePlaybackIndex;
          const lineRole: LyricsEditorLineRole = line.isBackground ? 'background' : line.isDuet ? 'duet' : 'lead';
          const effectiveLineTime = line.startTimeMs === null ? null : line.startTimeMs + offsetMs;
          const isComplete = line.startTimeMs !== null && Boolean(line.text.trim());
          const isCollapsed = isComplete && !isSelected;
          const isOutsideActiveRange = index < activeRangeStart || index > activeRangeEnd;

          if (isCollapsed) {
            return (
              <div
                key={line.id}
                role="listitem"
                data-testid={`lyrics-editor-line-${index}`}
                data-lyrics-line-index={index}
                data-selected="false"
                data-line-state="complete"
                className={`grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-t px-1 py-2 transition-colors ${isOutsideActiveRange ? 'opacity-35' : ''} ${isPlaybackActive ? 'border-cyan-200/40 bg-cyan-200/[0.04]' : 'border-emerald-200/15 bg-emerald-200/[0.025]'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectLine(index)}
                  className="min-h-12 min-w-0 cursor-text rounded-xl px-3 text-left text-base font-bold leading-6 text-white/82 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
                  aria-label={`编辑第 ${index + 1} 行：${line.text}`}
                  data-testid={`lyrics-editor-line-summary-${index}`}
                >
                  <span className="block truncate">{line.text}</span>
                  {isOutsideActiveRange ? <span className="mt-1 block text-[10px] font-bold text-white/38">录音范围外</span> : null}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onRemoveLine(index)}
                  className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-white/32 transition-colors hover:bg-red-300/[0.12] hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label={`删除第 ${index + 1} 行`}
                  title="删除本行"
                >
                  <Icons.Trash size={16} aria-hidden="true" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={line.id}
              role="listitem"
              data-testid={`lyrics-editor-line-${index}`}
              data-lyrics-line-index={index}
              data-selected={isSelected ? 'true' : 'false'}
              data-playback-active={isPlaybackActive ? 'true' : 'false'}
              data-line-state={isComplete ? 'editing-complete' : 'editing'}
              tabIndex={0}
              onClick={(event) => handleLineClick(event, index)}
              onKeyDown={(event) => handleLineKeyDown(event, index)}
              className={`grid grid-cols-[56px_minmax(0,1fr)] gap-2 border-t px-1 py-3 outline-none transition-colors focus-within:border-red-300/50 focus-visible:border-red-300/50 focus-visible:ring-2 focus-visible:ring-red-300/30 ${isOutsideActiveRange ? 'opacity-45' : ''} ${isSelected ? 'border-red-300/60 bg-red-300/[0.06]' : isPlaybackActive ? 'border-cyan-200/40 bg-cyan-200/[0.04]' : 'border-white/10'}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isComplete) onSeekLine(index);
                  else onMarkLine(index);
                }}
                disabled={saving || (isComplete && (!canSeek || line.startTimeMs === null))}
                className={`flex min-h-11 min-w-0 cursor-pointer flex-col items-start justify-center rounded-lg px-1 text-left text-xs font-bold transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-default disabled:opacity-50 ${isComplete ? 'text-white/50' : 'text-red-200/75'}`}
                aria-label={isComplete ? `跳转到第 ${index + 1} 行，${formatClock(effectiveLineTime / 1_000)}` : `在当前位置标记第 ${index + 1} 行`}
                title={isComplete ? '跳转到本行' : '标记当前行'}
                data-testid={`lyrics-editor-line-time-${index}`}
              >
                <span>{line.startTimeMs === null ? '--:--.--' : formatLyricsTime(line.startTimeMs)}</span>
                <span className="mt-1 text-[10px] font-semibold text-white/35">{isComplete ? (isPlaybackActive ? '播放中' : isSelected ? '待编辑' : `第 ${index + 1} 行`) : '点击打标'}</span>
              </button>
              <div className="min-w-0">
                <label className="block min-w-0">
                  <span className="sr-only">第 {index + 1} 行歌词</span>
                  <textarea
                    ref={(element) => {
                      if (element) lineInputRefs.current.set(index, element);
                      else lineInputRefs.current.delete(index);
                    }}
                    value={line.text}
                    rows={1}
                    data-testid={`lyrics-editor-line-input-${index}`}
                    onChange={(event) => onLineTextChange(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      onCompleteLine(index);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={() => {
                      onSelectLine(index);
                    }}
                    className="min-h-11 w-full scroll-mb-[42dvh] resize-y rounded-lg border border-transparent bg-transparent px-2 py-2 text-base leading-7 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/20 focus:bg-white/[0.04]"
                    placeholder="输入这一行歌词"
                  />
                </label>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-white/55">
                    <span className="sr-only">第 {index + 1} 行演唱角色</span>
                    <select
                      value={lineRole}
                      onChange={(event) => onLineRoleChange(index, event.target.value as LyricsEditorLineRole)}
                      onClick={(event) => event.stopPropagation()}
                      className="cursor-pointer appearance-none bg-transparent pr-2 text-xs font-extrabold text-white outline-none"
                      data-testid={`lyrics-editor-line-role-${index}`}
                      aria-label={`第 ${index + 1} 行演唱角色`}
                    >
                      {roleOptions.map((option) => <option key={option.value} value={option.value} className="bg-zinc-900">{option.label}</option>)}
                    </select>
                    <Icons.ChevronDown size={13} aria-hidden="true" />
                  </label>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInsertLine(index, 'before');
                      }}
                      className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-lg text-white/42 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-25"
                      aria-label={`在第 ${index + 1} 行前插入歌词`}
                      title="在上方插入"
                      data-testid={`lyrics-editor-line-insert-before-${index}`}
                    >
                      <span className="relative block h-5 w-5" aria-hidden="true">
                        <Icons.Plus size={14} className="absolute left-0.5 top-0" />
                        <Icons.ChevronDown size={12} className="absolute bottom-0 right-0 rotate-180" />
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInsertLine(index, 'after');
                      }}
                      className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-lg text-white/42 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-25"
                      aria-label={`在第 ${index + 1} 行后插入歌词`}
                      title="在下方插入"
                      data-testid={`lyrics-editor-line-insert-after-${index}`}
                    >
                      <span className="relative block h-5 w-5" aria-hidden="true">
                        <Icons.Plus size={14} className="absolute bottom-0.5 left-0.5" />
                        <Icons.ChevronDown size={12} className="absolute right-0 top-0" />
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={saving || !line.text.trim() || line.startTimeMs === null}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCompleteLine(index);
                      }}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-35"
                      data-testid={`lyrics-editor-line-complete-${index}`}
                    >
                      <Icons.Check size={15} aria-hidden="true" />
                      完成本行
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveLine(index);
                      }}
                      className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-lg text-white/35 transition-colors hover:bg-red-300/[0.12] hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-25"
                      aria-label={`删除第 ${index + 1} 行`}
                      title="删除本行"
                    >
                      <Icons.Trash size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
