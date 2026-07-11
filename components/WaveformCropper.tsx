import React, { useMemo, useRef } from 'react';

interface WaveformCropperProps {
  duration: number;
  range: [number, number];
  setRange: (range: [number, number]) => void;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayFromStart?: () => void;
}

export const WaveformCropper: React.FC<WaveformCropperProps> = ({ duration, range, setRange, currentTime, onSeek, onPlayFromStart }) => {
  const bars = useMemo(
    () =>
      Array.from({ length: 50 }, (_, index) => {
        const wave = Math.sin(index * 1.7) * 0.5 + Math.sin(index * 0.47) * 0.35 + 0.5;
        return Math.max(20, Math.min(100, Math.round(35 + wave * 45)));
      }),
    []
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const startPct = (range[0] / safeDuration) * 100;
  const endPct = (range[1] / safeDuration) * 100;
  const playheadPct = (currentTime / safeDuration) * 100;

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedTime = (x / rect.width) * safeDuration;
    onSeek(clickedTime);
  };

  const handleDrag = (index: 0 | 1, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const newTime = (x / rect.width) * safeDuration;

      if (index === 0) {
        if (newTime < range[1] - 1) setRange([newTime, range[1]]);
      } else if (newTime > range[0] + 1) {
        setRange([range[0], newTime]);
      }
    };

    const stopMove = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stopMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', stopMove);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stopMove);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', stopMove);
  };

  return (
    <div
      ref={containerRef}
      className="h-32 bg-zinc-900 rounded-lg relative overflow-hidden flex items-center justify-between px-2 gap-[2px] select-none touch-none border border-zinc-800 cursor-crosshair"
      onClick={handleContainerClick}
    >
      {bars.map((height, index) => (
        <div key={index} className="flex-1 bg-zinc-700 rounded-full opacity-30" style={{ height: `${height}%` }} />
      ))}

      <div className="absolute top-0 bottom-0 bg-red-500/10 border-x border-red-500/30" style={{ left: `${startPct}%`, right: `${100 - endPct}%` }} />

      {onPlayFromStart ? (
        <button
          type="button"
          aria-label="从裁剪起点播放"
          className="absolute top-2 z-40 h-7 w-7 -translate-x-1/2 rounded-full bg-black/60 border border-white/10 flex items-center justify-center shadow-lg shadow-black/30 active:scale-95 transition"
          style={{ left: `${startPct}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onPlayFromStart();
          }}
        >
          <span className="block w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-400" />
        </button>
      ) : null}

      <div className="absolute top-0 bottom-0 w-[2px] bg-white z-20 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ left: `${playheadPct}%` }} />

      <div
        onMouseDown={(e) => handleDrag(0, e)}
        onTouchStart={(e) => handleDrag(0, e)}
        className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group"
        style={{ left: `${startPct}%` }}
      >
        <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50" />
      </div>
      <div
        onMouseDown={(e) => handleDrag(1, e)}
        onTouchStart={(e) => handleDrag(1, e)}
        className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group"
        style={{ left: `${endPct}%` }}
      >
        <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50" />
      </div>
    </div>
  );
};
