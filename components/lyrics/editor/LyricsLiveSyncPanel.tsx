import { useMemo } from 'react';
import { Icons } from '../../Icons';
import { formatClock, formatOffset } from './lyricsEditorUtils';
import type { LyricsLine } from '../../../utils/lyrics';

interface LyricsLiveSyncPanelProps {
  lines: readonly LyricsLine[];
  selectedIndex: number;
  effectiveCurrentTime: number;
  effectiveDuration: number | null;
  effectivePlaying: boolean;
  canSeek: boolean;
  saving: boolean;
  offsetMs: number;
  lastMarkAvailable: boolean;
  manualMarkedCount: number;
  hasReferenceTimeline: boolean;
  alignmentStartIndex: number | null;
  alignmentApplied: boolean;
  audioError: string | null;
  onSelectLine: (index: number) => void;
  onMark: () => void;
  onTogglePlayback: () => void;
  onRestartPlayback: () => void;
  onSeekTime: (seconds: number) => void;
  onUndo: () => void;
  onSkipLine: () => void;
  onResetTiming: () => void;
  onAlignFromCurrentLine: () => void;
  onStretchToCurrentLine: () => void;
  onFinishAtLastMarkedLine: () => void;
  onNudgeOffset: (deltaMs: number) => void;
}

export const LyricsLiveSyncPanel = ({
  lines,
  selectedIndex,
  effectiveCurrentTime,
  effectiveDuration,
  effectivePlaying,
  canSeek,
  saving,
  offsetMs,
  lastMarkAvailable,
  manualMarkedCount,
  hasReferenceTimeline,
  alignmentStartIndex,
  alignmentApplied,
  audioError,
  onSelectLine,
  onMark,
  onTogglePlayback,
  onRestartPlayback,
  onSeekTime,
  onUndo,
  onSkipLine,
  onResetTiming,
  onAlignFromCurrentLine,
  onStretchToCurrentLine,
  onFinishAtLastMarkedLine,
  onNudgeOffset,
}: LyricsLiveSyncPanelProps) => {
  const markedCount = useMemo(() => lines.filter((line) => line.startTimeMs !== null).length, [lines]);
  const allMarked = lines.length > 0 && (manualMarkedCount === lines.length || alignmentApplied);
  const progressLabel = hasReferenceTimeline
    ? alignmentApplied ? '已整体对齐' : `原轴 ${lines.length} 句`
    : `${manualMarkedCount} / ${lines.length}`;
  const selectedLine = lines[selectedIndex] ?? null;
  const previousLine = selectedIndex > 0 ? lines[selectedIndex - 1] : null;
  const nextLine = selectedIndex + 1 < lines.length ? lines[selectedIndex + 1] : null;
  const sliderMax = Math.max(0.1, effectiveDuration ?? effectiveCurrentTime ?? 0.1);

  return (
    <section className="border-b border-white/10 py-4" aria-labelledby="lyrics-live-sync-title" data-testid="lyrics-live-sync-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="lyrics-live-sync-title" className="text-sm font-extrabold text-white">Live 对轴</h3>
          <p className="mt-1 text-xs leading-5 text-white/42">已有 LRC 可整体对齐，纯文本可连续打点。</p>
        </div>
        <span className="shrink-0 text-xs font-black tabular-nums text-white/45">{progressLabel}</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onRestartPlayback}
          disabled={!canSeek || saving}
          aria-label="从头开始"
          title="从头开始"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-30"
          data-testid="lyrics-live-restart"
        >
          <Icons.RotateCcw size={17} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min="0"
            max={sliderMax}
            step="0.05"
            value={Math.min(effectiveCurrentTime, sliderMax)}
            onChange={(event) => onSeekTime(Number(event.target.value))}
            disabled={!canSeek || saving}
            aria-label="Live 对轴播放进度"
            className="h-10 w-full cursor-pointer accent-red-300 disabled:opacity-35"
            data-testid="lyrics-live-seek"
          />
          <div className="-mt-1 flex justify-between text-[11px] font-bold tabular-nums text-white/35">
            <span>{formatClock(effectiveCurrentTime)}</span>
            <span>{formatClock(effectiveDuration)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={saving}
          aria-label={effectivePlaying ? '暂停' : '播放'}
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-black transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:opacity-40"
          data-testid="lyrics-live-play-toggle"
        >
          {effectivePlaying ? <Icons.Pause size={18} aria-hidden="true" /> : <Icons.Play size={18} aria-hidden="true" />}
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="mt-5 border-y border-dashed border-white/12 py-10 text-center">
          <p className="text-sm font-bold text-white/65">先导入或粘贴歌词</p>
          <p className="mt-1 text-xs text-white/38">准备好歌词顺序后，再完整听一遍完成对轴。</p>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden border-y border-white/10 py-5 text-center" aria-live="polite">
            <p className="min-h-6 truncate px-4 text-sm font-bold text-white/28">{previousLine?.text || ' '}</p>
            <button
              type="button"
              onClick={() => onSelectLine(selectedIndex)}
              className="my-4 w-full cursor-pointer px-4 text-center text-[clamp(1.45rem,7vw,2.15rem)] font-black leading-tight text-white outline-none transition-colors hover:text-red-100 focus-visible:ring-2 focus-visible:ring-red-300/60"
              data-testid="lyrics-live-current-line"
            >
              {selectedLine?.text || '当前行为空'}
            </button>
            <p className="min-h-6 truncate px-4 text-sm font-bold text-white/42">{nextLine?.text || (allMarked ? '对轴完成' : '最后一句')}</p>
          </div>

          <button
            type="button"
            disabled={saving || !selectedLine}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              event.preventDefault();
              onMark();
            }}
            onClick={(event) => {
              if (event.detail === 0) onMark();
            }}
            className="mt-4 flex min-h-[68px] w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-red-400 px-5 text-base font-black text-black shadow-[0_14px_36px_rgba(248,113,113,0.16)] transition-[transform,background-color] active:scale-[0.985] active:bg-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/80 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
            data-testid="lyrics-live-mark"
          >
            <Icons.Check size={20} aria-hidden="true" />
            {allMarked ? `重新标记第 ${selectedIndex + 1} 句` : `标记第 ${selectedIndex + 1} 句`}
          </button>

          {hasReferenceTimeline ? (
            <div className="mt-3 rounded-2xl bg-white/[0.04] p-2" data-testid="lyrics-live-align-tools">
              <button
                type="button"
                onClick={alignmentStartIndex === null ? onAlignFromCurrentLine : onStretchToCurrentLine}
                disabled={saving || !selectedLine}
                className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition-transform active:scale-[0.985] disabled:opacity-35"
                data-testid={alignmentStartIndex === null ? 'lyrics-live-align-start' : 'lyrics-live-align-end'}
              >
                <Icons.Repeat size={17} aria-hidden="true" />
                {alignmentStartIndex === null ? '以当前句整体对齐' : '再标一处，校正整体速度'}
              </button>
              <p className="mt-2 px-1 text-center text-[11px] leading-5 text-white/40">
                {alignmentStartIndex === null
                  ? '把播放条停在这句开口处，保留原歌词间隔。'
                  : `已标记第 ${alignmentStartIndex + 1} 句；选择后面的歌词并停在实际开口处。`}
              </p>
            </div>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={!lastMarkAvailable || saving}
              className="min-h-11 cursor-pointer rounded-xl text-xs font-bold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
              data-testid="lyrics-live-undo"
            >
              撤销
            </button>
            <button
              type="button"
              onClick={onSkipLine}
              disabled={saving || !selectedLine}
              className="min-h-11 cursor-pointer rounded-xl text-xs font-bold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-25"
              data-testid="lyrics-live-skip"
            >
              跳过此句
            </button>
          </div>

          {manualMarkedCount > 0 && manualMarkedCount < lines.length ? (
            <button
              type="button"
              onClick={onFinishAtLastMarkedLine}
              disabled={saving}
              className="mt-1 min-h-11 w-full cursor-pointer rounded-xl text-xs font-bold text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-25"
              data-testid="lyrics-live-finish-here"
            >
              录音到此结束
            </button>
          ) : null}

          {allMarked ? (
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-white/[0.035] p-1" aria-label="整体歌词偏移校正">
              <button
                type="button"
                onClick={() => onNudgeOffset(-50)}
                disabled={saving}
                className="min-h-10 cursor-pointer rounded-lg text-xs font-bold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                data-testid="lyrics-live-offset-earlier"
              >
                提前 50ms
              </button>
              <span className="px-2 text-[11px] font-black tabular-nums text-white/42" data-testid="lyrics-live-offset-value">{formatOffset(offsetMs)}</span>
              <button
                type="button"
                onClick={() => onNudgeOffset(50)}
                disabled={saving}
                className="min-h-10 cursor-pointer rounded-lg text-xs font-bold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                data-testid="lyrics-live-offset-later"
              >
                延后 50ms
              </button>
            </div>
          ) : null}

          <details className="mt-3 border-t border-white/8 pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-1 text-sm font-bold text-white/45 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-red-300/60 [&::-webkit-details-marker]:hidden" data-testid="lyrics-live-line-list-toggle">
              查看歌词顺序
              <Icons.ChevronDown size={15} className="ml-auto" aria-hidden="true" />
            </summary>
            <div className="max-h-56 overflow-y-auto overscroll-contain border-y border-white/8">
              {lines.map((line, index) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => onSelectLine(index)}
                  className={`flex min-h-11 w-full cursor-pointer items-center gap-3 border-t border-white/5 px-2 text-left text-sm transition-colors first:border-t-0 ${index === selectedIndex ? 'bg-red-300/[0.08] text-white' : 'text-white/48 hover:bg-white/[0.04] hover:text-white/75'}`}
                  data-testid={`lyrics-live-line-${index}`}
                >
                  <span className="w-7 shrink-0 text-right text-[11px] font-bold tabular-nums text-white/28">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{line.text || '空白歌词'}</span>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${line.startTimeMs === null ? 'bg-white/15' : 'bg-emerald-300/80'}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </details>

          <details className="mt-1 border-t border-white/8 pt-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-1 text-xs font-bold text-white/32 outline-none hover:text-white/60 focus-visible:ring-2 focus-visible:ring-red-300/60 [&::-webkit-details-marker]:hidden">
              高级操作
              <Icons.ChevronDown size={14} className="ml-auto" aria-hidden="true" />
            </summary>
            <button
              type="button"
              onClick={onResetTiming}
              disabled={saving || markedCount === 0}
              className="min-h-11 w-full cursor-pointer rounded-xl px-3 text-left text-xs font-bold text-red-200/65 transition-colors hover:bg-red-300/[0.06] hover:text-red-100 disabled:opacity-25"
              data-testid="lyrics-live-reset"
            >
              清除全部时间，重新打点
            </button>
          </details>
        </>
      )}

      {audioError ? <p className="mt-3 text-sm leading-6 text-amber-200" role="alert">{audioError}</p> : null}
    </section>
  );
};
