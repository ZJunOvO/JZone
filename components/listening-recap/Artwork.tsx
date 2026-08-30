import React from 'react';
import { Icons } from '../Icons';
import { ResilientCoverImage } from '../media/ResilientCoverImage';
import type { RecapSong } from './types';

type ArtworkSize = 'hero' | 'feature' | 'row';

interface ArtworkProps {
  song?: RecapSong | null;
  size: ArtworkSize;
  decorative?: boolean;
}

const artworkClasses: Record<ArtworkSize, string> = {
  hero: 'aspect-square w-full rounded-[30px]',
  feature: 'h-36 w-36 rounded-[24px] sm:h-44 sm:w-44 sm:rounded-[28px]',
  row: 'h-14 w-14 rounded-2xl',
};

export const Artwork: React.FC<ArtworkProps> = ({ song, size, decorative = false }) => {
  const coverUrl = typeof song?.coverUrl === 'string' && song.coverUrl.trim() ? song.coverUrl : null;
  const showCover = Boolean(coverUrl || song?.coverPath);
  const label = song?.title ? `${song.title}封面` : '抽象声音封面';

  return (
    <div
      className={`relative isolate flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-[#17151c] shadow-[0_22px_56px_rgba(0,0,0,0.34)] ${artworkClasses[size]}`}
      aria-hidden={decorative || undefined}
      aria-label={!decorative ? label : undefined}
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.2),transparent_27%),radial-gradient(circle_at_78%_76%,rgba(239,68,68,0.5),transparent_35%),linear-gradient(135deg,#24212f_0%,#111116_56%,#42151e_100%)]"
        aria-hidden="true"
      />
      {showCover ? (
        <ResilientCoverImage
          src={coverUrl ?? undefined}
          coverPath={song?.coverPath}
          fallbackSeed={song?.id || 'listening-recap'}
          alt={decorative ? '' : label}
          className="relative z-10 h-full w-full object-cover"
          loading={size === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        <Icons.Music2
          aria-hidden="true"
          className="relative z-10 text-white/35"
          size={size === 'hero' ? 58 : size === 'feature' ? 34 : 20}
          strokeWidth={1.35}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/30 via-transparent to-white/[0.08]" aria-hidden="true" />
    </div>
  );
};
