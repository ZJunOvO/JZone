import {
  AlertCircle,
} from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Icons } from '../../Icons';
import { formatLyricsTime } from '../../../hooks/useLyricsDraft';
import { formatClock, formatOffset } from './lyricsEditorUtils';
import type { LyricsTimingPanelProps } from './types';

export const LyricsTimingPanel = ({
  lines,
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
  onPrevious,
  onNext,
  onMarkCurrentLine,
  onTogglePlayback,
  onUndoLastMark,
  onOffsetChange,
  onSeekLine,
  onSelectLine,
  onLineTextChange,
  onClearLineTime,
  onRemoveLine,
  onAddLine,
}: LyricsTimingPanelProps) => {
  const selectedLineNumber = lines.length > 0 ? Math.min(selectedIndex, lines.length - 1) + 1 : 0;

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
          <h3 id="lyrics-editor-timing-title" className="text-sm font-extrabold text-white">行级校时</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">选择一行，播放到合适位置后标记；普通 LRC 不会生成逐字时间。</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-white/45">第 {selectedLineNumber || '--'} 行</span>
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
          disabled={saving || lines.length === 0}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-400 px-3 text-sm font-black text-black shadow-[0_0_24px_rgba(248,113,113,0.2)] transition-colors hover:bg-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/80 active:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="lyrics-editor-mark"
        >
          {effectivePlaying ? <Icons.Pause size={17} aria-hidden="true" /> : <Icons.Play size={17} aria-hidden="true" />}
          标记当前行 · {formatClock(effectiveCurrentTime)}
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

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
        <label htmlFor="lyrics-editor-offset" className="shrink-0 text-sm font-bold text-white/65">全局偏移</label>
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
        <span className="shrink-0 text-xs font-bold text-white/45">{formatOffset(offsetMs)}</span>
      </div>
      <p id="lyrics-editor-offset-help" className="mt-2 text-xs leading-5 text-white/40">正数让歌词延后，负数让歌词提前；保存时会作为独立偏移量提交。</p>

      {audioError ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-amber-200" role="alert" data-testid="lyrics-editor-audio-error">
          <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
          {audioError}
        </p>
      ) : !canControlPlayback ? (
        <p className="mt-3 text-xs leading-5 text-white/40">传入 audioUrl 或 audioControls 后即可播放、暂停和打点。</p>
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
            <p className="mt-1 text-xs leading-5 text-white/40">从上方导入歌词，或点击“新增一行”开始制作。</p>
          </div>
        ) : lines.map((line, index) => {
          const isSelected = index === selectedIndex;
          const isPlaybackActive = index === activePlaybackIndex;
          const effectiveLineTime = line.startTimeMs === null ? null : line.startTimeMs + offsetMs;
          return (
            <div
              key={line.id}
              role="listitem"
              data-testid={`lyrics-editor-line-${index}`}
              data-lyrics-line-index={index}
              data-selected={isSelected ? 'true' : 'false'}
              data-playback-active={isPlaybackActive ? 'true' : 'false'}
              tabIndex={0}
              onClick={(event) => handleLineClick(event, index)}
              onKeyDown={(event) => handleLineKeyDown(event, index)}
              className={`grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2 border-t px-1 py-3 outline-none transition-colors focus-within:border-red-300/50 focus-visible:border-red-300/50 focus-visible:ring-2 focus-visible:ring-red-300/30 ${isSelected ? 'border-red-300/60 bg-red-300/[0.06]' : isPlaybackActive ? 'border-cyan-200/40 bg-cyan-200/[0.04]' : 'border-white/10'}`}
            >
              <button
                type="button"
                onClick={() => onSeekLine(index)}
                disabled={!canSeek || line.startTimeMs === null}
                className="flex min-h-11 min-w-0 cursor-pointer flex-col items-start justify-center rounded-lg px-1 text-left text-xs font-bold text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-default disabled:opacity-50"
                aria-label={line.startTimeMs === null ? `第 ${index + 1} 行，未标记时间` : `跳转到第 ${index + 1} 行，${formatClock(effectiveLineTime / 1_000)}`}
              >
                <span>{line.startTimeMs === null ? '--:--.--' : formatLyricsTime(line.startTimeMs)}</span>
                <span className="mt-1 text-[10px] font-semibold text-white/30">{isPlaybackActive ? '播放中' : isSelected ? '待编辑' : `第 ${index + 1} 行`}</span>
              </button>
              <label className="min-w-0">
                <span className="sr-only">第 {index + 1} 行歌词</span>
                <textarea
                  value={line.text}
                  rows={1}
                  onChange={(event) => onLineTextChange(index, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onFocus={() => onSelectLine(index)}
                  className="min-h-11 w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-2 text-base leading-7 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/20 focus:bg-white/[0.04]"
                  placeholder="输入这一行歌词"
                />
              </label>
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  disabled={line.startTimeMs === null || saving}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClearLineTime(index);
                  }}
                  className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label={`清除第 ${index + 1} 行时间`}
                  title="清除本行时间"
                >
                  <Icons.X size={16} aria-hidden="true" />
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
          );
        })}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={onAddLine}
        className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-sm font-bold text-white/60 transition-colors hover:border-white/40 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="lyrics-editor-add-line"
      >
        <Icons.Plus size={17} aria-hidden="true" />
        新增一行
      </button>
    </section>
  );
};
