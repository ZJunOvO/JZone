import React from 'react';

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative overflow-hidden bg-white/[0.07] ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
  </div>
);

export const CoverSkeleton: React.FC<{ className?: string }> = ({ className = 'rounded-[24px]' }) => (
  <SkeletonBlock className={`aspect-square ${className}`} />
);

export const SongRowSkeleton: React.FC<{ showIndex?: boolean }> = ({ showIndex = true }) => (
  <div className="w-full flex items-center gap-4 p-3 rounded-2xl">
    {showIndex ? <SkeletonBlock className="w-6 h-3 rounded-full shrink-0" /> : null}
    <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <SkeletonBlock className="h-3.5 w-2/3 rounded-full" />
      <SkeletonBlock className="h-3 w-1/3 rounded-full" />
    </div>
    <SkeletonBlock className="w-5 h-5 rounded-full shrink-0" />
  </div>
);

export const CollectionHeaderSkeleton: React.FC<{ variant?: 'album' | 'playlist' }> = ({ variant = 'album' }) => (
  <div className={variant === 'playlist' ? 'px-6' : 'px-6'}>
    {variant === 'playlist' ? (
      <SkeletonBlock className="h-[46vh] rounded-[28px] border border-white/10" />
    ) : (
      <div className="mt-6 flex flex-col items-center">
        <div className="w-[70%] max-w-[320px]">
          <CoverSkeleton className="rounded-[24px] border border-white/10" />
        </div>
      </div>
    )}
    <div className="mt-8 flex flex-col items-center space-y-3">
      <SkeletonBlock className="h-7 w-48 rounded-full" />
      <SkeletonBlock className="h-4 w-28 rounded-full" />
      <SkeletonBlock className="h-3 w-40 rounded-full" />
    </div>
  </div>
);

export const CommentRowSkeleton: React.FC = () => (
  <div className="flex gap-3">
    <SkeletonBlock className="w-9 h-9 rounded-full shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-3.5 w-24 rounded-full" />
        <SkeletonBlock className="h-3 w-12 rounded-full" />
      </div>
      <SkeletonBlock className="h-4 w-full rounded-full" />
      <SkeletonBlock className="h-4 w-2/3 rounded-full" />
      <SkeletonBlock className="h-5 w-16 rounded-full" />
    </div>
  </div>
);

