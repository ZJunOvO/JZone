import React from 'react';
import { Icons } from '../Icons';
import { NarrativeReveal } from './NarrativeReveal';
import { Artwork } from './Artwork';
import { formatCount } from './formatters';
import type { RecapOwnedSounds, RecapSong } from './types';

interface OwnedSoundsProps {
  ownedSounds?: RecapOwnedSounds | null;
  onPlaySong: (songId: string) => void;
}

const OwnedSoundRow: React.FC<{ song: RecapSong; onPlaySong: (songId: string) => void }> = ({ song, onPlaySong }) => {
  const isPrivate = song.visibility === 'private';

  return (
    <button
      type="button"
      onClick={() => onPlaySong(song.id)}
      className="group flex min-h-20 w-full items-center gap-4 border-b border-white/10 py-4 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      data-testid={`listening-recap-owned-song-${song.id}`}
      aria-label={`${song.title}，${song.artist}${isPrivate ? '，私有，仅你可见' : ''}`}
    >
      <Artwork song={song} size="row" decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-extrabold text-white group-hover:text-red-100">{song.title}</span>
        <span className="mt-1 block truncate text-sm font-medium text-white/45">{song.artist}</span>
      </span>
      {isPrivate ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-white/45" title="仅你可见">
          <Icons.Lock size={13} aria-hidden="true" />
          <span>私有 · 仅你可见</span>
        </span>
      ) : null}
      <Icons.Play className="shrink-0 text-white/35 transition-colors group-hover:text-white" size={16} fill="currentColor" aria-hidden="true" />
    </button>
  );
};

export const OwnedSounds: React.FC<OwnedSoundsProps> = ({ ownedSounds, onPlaySong }) => {
  const songs = ownedSounds?.songs?.slice(0, 3) ?? [];
  if (!songs.length) return null;

  return (
    <NarrativeReveal className="border-t border-white/10 px-5 py-16 sm:px-8 sm:py-24" data-testid="listening-recap-owned-sounds">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">你留下的声音</p>
        <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          你拥有的声音，也在这段时间里出现了。
        </h2>
        <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-white/48">
          这段时间，你有效播放了 {formatCount(ownedSounds?.songCount)} 首自己拥有的歌曲。
        </p>

        <div className="mt-10 border-t border-white/10">
          {songs.map((song) => (
            <OwnedSoundRow key={song.id} song={song} onPlaySong={onPlaySong} />
          ))}
        </div>
      </div>
    </NarrativeReveal>
  );
};
