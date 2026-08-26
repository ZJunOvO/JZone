import React from 'react';
import { Icons } from '../Icons';
import { NarrativeReveal } from './NarrativeReveal';
import { Artwork } from './Artwork';
import { formatCount } from './formatters';
import type { RecapLongestCompanion, RecapSong } from './types';

interface LongestCompanionProps {
  companion?: RecapLongestCompanion | null;
  onPlaySong: (songId: string) => void;
}

const CompanionRow: React.FC<{ song: RecapSong; onPlaySong: (songId: string) => void }> = ({ song, onPlaySong }) => (
  <button
    type="button"
    onClick={() => onPlaySong(song.id)}
    className="group flex min-h-20 w-full items-center gap-4 border-b border-white/10 py-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    data-testid={`listening-recap-longest-song-${song.id}`}
  >
    <Artwork song={song} size="feature" decorative />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-lg font-extrabold text-white group-hover:text-red-100">{song.title}</span>
      <span className="mt-1 block truncate text-sm font-medium text-white/45">{song.artist}</span>
    </span>
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition-colors group-hover:border-red-300/40 group-hover:text-white" aria-hidden="true">
      <Icons.Play size={17} fill="currentColor" />
    </span>
  </button>
);

export const LongestCompanion: React.FC<LongestCompanionProps> = ({ companion, onPlaySong }) => {
  const songs = companion?.songs?.slice(0, 2) ?? [];
  if (!songs.length) return null;

  const isTie = Boolean(companion?.isTie && songs.length > 1);

  return (
    <NarrativeReveal className="border-t border-white/10 px-5 py-16 sm:px-8 sm:py-24" data-testid="listening-recap-longest-companion">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">陪伴最久</p>
        <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          {isTie ? '这段时间，以下声音并列最多。' : `这段时间，${songs[0].title}陪伴你最久。`}
        </h2>
        <p className="mt-4 text-sm font-medium leading-7 text-white/48">
          本期按已确认的有效播放次数计算，不代表偏好或喜欢程度。
        </p>

        <div className="mt-10 border-t border-white/10">
          {songs.map((song) => (
            <CompanionRow key={song.id} song={song} onPlaySong={onPlaySong} />
          ))}
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-white/35">
          {isTie ? '并列最多' : `本期 ${formatCount(companion?.validPlayCount)} 次有效播放`}
        </p>
      </div>
    </NarrativeReveal>
  );
};
