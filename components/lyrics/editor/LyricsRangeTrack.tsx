import { useEffect, useRef, useState } from 'react';
import type { LyricsLine } from '../../../utils/lyrics';
import { Icons } from '../../Icons';

interface LyricsRangeTrackProps {
  lines: readonly LyricsLine[];
  selectedIndex: number;
  activeRangeStart: number;
  activeRangeEnd: number;
  suggestedRangeStart: number;
  suggestedRangeEnd: number;
  rangeIsManual: boolean;
  onSelectLine: (index: number) => void;
  onRangeChange: (startIndex: number, endIndex: number) => void;
  onRestoreAutomaticRange: () => void;
}

type BoundaryKind = 'start' | 'end';

export const LyricsRangeTrack = ({
  lines,
  selectedIndex,
  activeRangeStart,
  activeRangeEnd,
  suggestedRangeStart,
  suggestedRangeEnd,
  rangeIsManual,
  onSelectLine,
  onRangeChange,
  onRestoreAutomaticRange,
}: LyricsRangeTrackProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [draggingBoundary, setDraggingBoundary] = useState<BoundaryKind | null>(null);

  useEffect(() => {
    if (draggingBoundary) return;
    const scroller = scrollRef.current;
    const row = scroller?.querySelector<HTMLElement>(`[data-range-row-index="${selectedIndex}"]`);
    if (!scroller || !row) return;
    const targetTop = row.offsetTop - ((scroller.clientHeight - row.offsetHeight) / 2);
    scroller.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [draggingBoundary, selectedIndex]);

  useEffect(() => {
    if (!draggingBoundary) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      event.preventDefault();
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + 36) scroller.scrollBy({ top: -18 });
      if (event.clientY > bounds.bottom - 36) scroller.scrollBy({ top: 18 });

      const rows = [...scroller.querySelectorAll<HTMLElement>('[data-range-row-index]')];
      if (rows.length === 0) return;
      const nearest = rows.reduce((best, row) => {
        const rect = row.getBoundingClientRect();
        const distance = Math.abs(event.clientY - (rect.top + (rect.height / 2)));
        return distance < best.distance
          ? { index: Number(row.dataset.rangeRowIndex), distance }
          : best;
      }, { index: selectedIndex, distance: Number.POSITIVE_INFINITY });

      if (draggingBoundary === 'start') {
        onRangeChange(Math.min(nearest.index, activeRangeEnd), activeRangeEnd);
      } else {
        onRangeChange(activeRangeStart, Math.max(nearest.index, activeRangeStart));
      }
    };
    const handlePointerUp = () => setDraggingBoundary(null);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activeRangeEnd, activeRangeStart, draggingBoundary, onRangeChange, selectedIndex]);

  const renderBoundary = (kind: BoundaryKind) => (
    <button
      key={`range-boundary-${kind}`}
      type="button"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        setDraggingBoundary(kind);
      }}
      className={`flex h-8 w-full touch-none cursor-ns-resize items-center gap-2 px-2 text-[10px] font-black tracking-[0.12em] transition-colors ${draggingBoundary === kind ? 'text-red-200' : 'text-white/48'}`}
      aria-label={`拖动调整歌词${kind === 'start' ? '开始' : '结束'}截止线`}
      data-testid={`lyrics-live-range-${kind}-boundary`}
    >
      <span className="h-px min-w-0 flex-1 bg-gradient-to-r from-transparent via-red-200/75 to-red-200/35" />
      <Icons.GripVertical size={14} className="rotate-90" aria-hidden="true" />
      <span>{kind === 'start' ? '开始' : '结束'}</span>
      <span className="h-px min-w-0 flex-1 bg-gradient-to-l from-transparent via-red-200/75 to-red-200/35" />
    </button>
  );

  const canRestore = rangeIsManual
    && (activeRangeStart !== suggestedRangeStart || activeRangeEnd !== suggestedRangeEnd);

  return (
    <div className="mt-5" data-testid="lyrics-live-range-track">
      <div className="mb-2 flex min-h-9 items-center justify-between gap-3 px-1">
        <span className="text-xs font-bold text-white/38">滑动歌词，拖动截止线选择录音范围</span>
        {canRestore ? (
          <button
            type="button"
            onClick={onRestoreAutomaticRange}
            className="shrink-0 cursor-pointer rounded-full px-2 py-1 text-[11px] font-bold text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white"
            data-testid="lyrics-live-range-auto"
          >
            按时长恢复
          </button>
        ) : null}
      </div>
      <div className="relative overflow-hidden border-y border-white/10">
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto overscroll-contain py-2 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {lines.map((line, index) => {
            const isSelected = index === selectedIndex;
            const isOutside = index < activeRangeStart || index > activeRangeEnd;
            return (
              <div key={line.id}>
                {index === activeRangeStart ? renderBoundary('start') : null}
                <button
                  type="button"
                  onClick={() => onSelectLine(index)}
                  data-range-row-index={index}
                  data-testid={`lyrics-live-line-${index}`}
                  className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 text-left transition-[opacity,background-color,color,font-size] duration-200 ${isOutside ? 'opacity-25' : 'opacity-100'} ${isSelected ? 'bg-white/[0.045] text-[1.35rem] font-black leading-tight text-white' : 'text-sm font-bold text-white/48 hover:bg-white/[0.025] hover:text-white/72'}`}
                >
                  <span className="w-7 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/25">{index + 1}</span>
                  <span className="min-w-0 flex-1 break-words">{line.text || '空白歌词'}</span>
                </button>
                {index === activeRangeEnd ? renderBoundary('end') : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
