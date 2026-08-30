import React from 'react';

export interface MemoryVideoLyricCue {
  time: number;
  text: string;
}

interface MemoryVideoRangeSelectorProps {
  min: number;
  max: number;
  start: number;
  end: number;
  maxSpan?: number;
  lyrics?: MemoryVideoLyricCue[];
  onChange: (start: number, end: number) => void;
}

type ActiveEdge = 'start' | 'end';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatTime = (seconds: number) => {
  const value = Math.max(0, seconds);
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
};

export const MemoryVideoRangeSelector: React.FC<MemoryVideoRangeSelectorProps> = ({
  min,
  max,
  start,
  end,
  maxSpan,
  lyrics = [],
  onChange,
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const activeEdgeRef = React.useRef<ActiveEdge | null>(null);
  const duration = Math.max(0.1, max - min);
  const startPct = clamp((start - min) / duration * 100, 0, 100);
  const endPct = clamp((end - min) / duration * 100, 0, 100);
  const effectiveMaxSpan = Math.max(1, Math.min(maxSpan ?? duration, duration));

  const commit = React.useCallback((edge: ActiveEdge, rawValue: number) => {
    const value = clamp(rawValue, min, max);
    const currentSpan = Math.max(1, Math.min(end - start, effectiveMaxSpan));
    if (edge === 'start') {
      if (value < end - effectiveMaxSpan) {
        const nextStart = clamp(value, min, max - currentSpan);
        onChange(nextStart, nextStart + currentSpan);
        return;
      }
      if (value >= end - 1) {
        const nextStart = clamp(value, min, max - currentSpan);
        onChange(nextStart, nextStart + currentSpan);
        return;
      }
      onChange(clamp(value, Math.max(min, end - effectiveMaxSpan), end - 1), end);
      return;
    }
    if (value > start + effectiveMaxSpan || value <= start + 1) {
      const nextEnd = clamp(value, min + currentSpan, max);
      onChange(nextEnd - currentSpan, nextEnd);
      return;
    }
    onChange(start, clamp(value, start + 1, Math.min(max, start + effectiveMaxSpan)));
  }, [effectiveMaxSpan, end, max, min, onChange, start]);

  const valueAtClientX = React.useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return start;
    return min + clamp((clientX - rect.left) / rect.width, 0, 1) * duration;
  }, [duration, min, start]);

  const updateFromPointer = React.useCallback((clientX: number, preferredEdge?: ActiveEdge) => {
    const value = valueAtClientX(clientX);
    const edge = preferredEdge ?? (Math.abs(value - start) <= Math.abs(value - end) ? 'start' : 'end');
    activeEdgeRef.current = edge;
    commit(edge, value);
  }, [commit, end, start, valueAtClientX]);

  const lyricAt = React.useCallback((time: number, direction: 'after' | 'before') => {
    if (!lyrics.length) return '';
    const candidates = direction === 'after'
      ? lyrics
      : [...lyrics].reverse();
    return candidates.find((cue) => direction === 'after' ? cue.time >= time - 0.15 : cue.time <= time + 0.15)?.text ?? '';
  }, [lyrics]);

  const handleKey = (edge: ActiveEdge, event: React.KeyboardEvent) => {
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : 0;
    if (!direction) return;
    event.preventDefault();
    commit(edge, (edge === 'start' ? start : end) + direction * (event.shiftKey ? 5 : 0.5));
  };

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-4" aria-label="选择记忆片段">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-white">选择歌曲中的记忆位置</p>
          <p className="mt-1 text-xs leading-relaxed text-white/42">拖动两端，视频会在高亮区间内出现</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/7 px-2.5 py-1 font-mono text-[11px] font-bold text-white/62">
          {formatTime(end - start)}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-16 touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !activeEdgeRef.current) return;
          updateFromPointer(event.clientX, activeEdgeRef.current);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          activeEdgeRef.current = null;
        }}
        onPointerCancel={() => { activeEdgeRef.current = null; }}
        data-testid="memory-video-range"
      >
        <div className="absolute inset-x-0 top-7 h-2 rounded-full bg-white/10 shadow-inner" />
        <div
          className="absolute top-7 h-2 rounded-full bg-gradient-to-r from-red-500 via-rose-400 to-orange-300 shadow-[0_0_18px_rgba(248,113,113,0.28)]"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        {lyrics.slice(0, 120).map((cue, index) => {
          const left = clamp((cue.time - min) / duration * 100, 0, 100);
          return (
            <button
              key={`${cue.time}-${index}`}
              type="button"
              className={`absolute top-[25px] h-3 w-px -translate-x-1/2 transition ${cue.time >= start && cue.time <= end ? 'bg-white/75' : 'bg-white/20'}`}
              style={{ left: `${left}%` }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => commit(Math.abs(cue.time - start) <= Math.abs(cue.time - end) ? 'start' : 'end', cue.time)}
              aria-label={`定位到歌词：${cue.text}`}
              title={cue.text}
            />
          );
        })}
        {(['start', 'end'] as ActiveEdge[]).map((edge) => {
          const value = edge === 'start' ? start : end;
          const left = edge === 'start' ? startPct : endPct;
          return (
            <button
              key={edge}
              type="button"
              role="slider"
              aria-label={edge === 'start' ? '记忆开始位置' : '记忆结束位置'}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value}
              className="absolute top-[18px] z-10 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-white/65 bg-white shadow-[0_5px_18px_rgba(0,0,0,0.38)] transition-transform active:scale-110"
              style={{ left: `${left}%` }}
              onPointerDown={(event) => {
                event.stopPropagation();
                trackRef.current?.setPointerCapture(event.pointerId);
                activeEdgeRef.current = edge;
              }}
              onKeyDown={(event) => handleKey(edge, event)}
            >
              <span className="h-3 w-1 rounded-full bg-black/55" />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 text-left">
          <p className="font-mono text-xs font-bold tabular-nums text-white/78">{formatTime(start)}</p>
          <p className="mt-1 truncate text-xs text-white/38">{lyricAt(start, 'after') || '记忆开始'}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="font-mono text-xs font-bold tabular-nums text-white/78">{formatTime(end)}</p>
          <p className="mt-1 truncate text-xs text-white/38">{lyricAt(end, 'before') || '记忆结束'}</p>
        </div>
      </div>
    </section>
  );
};
