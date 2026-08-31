import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { LyricsInput, ParsedLyrics } from '../../utils/lyrics';
import { Icons } from '../Icons';
import { LyricsRenderer } from '../lyrics/LyricsRenderer';

interface VideoLyricsOverlayProps {
  lyrics?: LyricsInput | ParsedLyrics | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  visible: boolean;
  onToggle: () => void;
}

export const VideoLyricsOverlay: React.FC<VideoLyricsOverlayProps> = ({ lyrics, currentTime, duration, playing, visible, onToggle }) => {
  const reduceMotion = useReducedMotion();
  if (!lyrics) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="video-lyrics-experience">
      <button
        type="button"
        onClick={onToggle}
        className={`pointer-events-auto absolute left-[max(18px,env(safe-area-inset-left))] top-[max(18px,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-xl transition-colors ${visible ? 'text-red-100' : 'text-white/72'}`}
        aria-label={visible ? '隐藏 MV 歌词' : '显示 MV 歌词'}
        aria-pressed={visible}
        data-testid="video-lyrics-toggle"
      ><Icons.Captions size={21} strokeWidth={1.7} /></button>

      <AnimatePresence>
        {visible ? (
          <motion.div
            className="absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] top-[18%] overflow-hidden px-5 [mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_86%,transparent_100%)] landscape:bottom-[6%] landscape:left-[48%] landscape:top-[8%] landscape:px-7"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(8px)' }}
            transition={{ duration: reduceMotion ? 0.12 : 0.34, ease: [0.22, 0.74, 0.22, 1] }}
            data-testid="video-lyrics-overlay"
          >
            <div className="h-full w-full rounded-[6px] bg-black/[0.08] text-left backdrop-blur-[2px]">
              <LyricsRenderer
                lyrics={lyrics}
                currentTime={currentTime}
                duration={duration}
                playing={playing}
                reducedMotion={Boolean(reduceMotion)}
                lowPerformance
                className="h-full w-full"
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
