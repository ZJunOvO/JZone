import React from 'react';

export interface LyricsEmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export const LyricsEmptyState: React.FC<LyricsEmptyStateProps> = ({
  title = '暂无歌词',
  description = '这首歌还没有可显示的歌词。',
  className = '',
}) => (
  <div
    className={`flex min-h-[240px] h-full w-full flex-col items-center justify-center px-6 text-center ${className}`.trim()}
    role="status"
    aria-live="polite"
    data-testid="lyrics-empty-state"
  >
    <p className="text-base font-semibold text-white/80">{title}</p>
    <p className="mt-2 max-w-[18rem] text-sm leading-6 text-white/45">{description}</p>
  </div>
);
