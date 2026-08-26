import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../Icons';
import { NarrativeReveal } from './NarrativeReveal';
import { formatCount } from './formatters';
import type { RecapQueue } from './types';

interface EndingProps {
  queue?: RecapQueue | null;
  onPlayQueue: (songIds: string[], startSongId: string) => void;
}

export const Ending: React.FC<EndingProps> = ({ queue, onPlayQueue }) => {
  const songIds = useMemo(() => Array.from(new Set(queue?.songIds ?? [])), [queue?.songIds]);
  const queueKey = songIds.join('|');
  const lockRef = useRef(false);
  const unlockTimerRef = useRef<number | null>(null);
  const [didStart, setDidStart] = useState(false);

  useEffect(() => {
    lockRef.current = false;
    setDidStart(false);
    if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);
    return () => {
      if (unlockTimerRef.current) window.clearTimeout(unlockTimerRef.current);
    };
  }, [queueKey]);

  const handlePlayQueue = () => {
    if (!songIds.length || lockRef.current) return;
    lockRef.current = true;
    setDidStart(true);
    try {
      onPlayQueue(songIds, songIds[0]);
    } catch {
      lockRef.current = false;
      setDidStart(false);
      return;
    }
    unlockTimerRef.current = window.setTimeout(() => {
      lockRef.current = false;
      setDidStart(false);
    }, 850);
  };

  return (
    <NarrativeReveal className="border-t border-white/10 px-5 pb-28 pt-20 sm:px-8 sm:pb-36 sm:pt-28" data-testid="listening-recap-ending">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">时间结尾</p>
        <h2 className="mt-5 max-w-2xl text-4xl font-black leading-[0.98] text-white sm:text-6xl">
          播放这段时间的声音
        </h2>
        {songIds.length ? (
          <>
            <p className="mt-5 text-sm font-medium leading-7 text-white/48">
              {queue?.truncated
                ? `本次播放前 ${formatCount(songIds.length)} 首。`
                : `从最早出现的声音开始，共 ${formatCount(songIds.length)} 首。`}
            </p>
            <button
              type="button"
              onClick={handlePlayQueue}
              className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-black shadow-[0_12px_34px_rgba(255,255,255,0.12)] transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/90 focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:cursor-default disabled:opacity-80"
              disabled={didStart}
              data-testid="listening-recap-play-queue"
              aria-label={didStart ? '这段时间的声音已开始播放' : '播放这段时间的声音'}
            >
              {didStart ? <Icons.Check size={18} strokeWidth={2.8} /> : <Icons.Play size={18} fill="currentColor" />}
              <span>{didStart ? '已开始播放' : '开始播放'}</span>
            </button>
          </>
        ) : (
          <p className="mt-5 max-w-xl text-sm font-medium leading-7 text-white/48">
            这段时间还没有可播放的已确认记录。
          </p>
        )}
      </div>
    </NarrativeReveal>
  );
};
