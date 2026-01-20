import React from 'react';
import { Song } from '../../types';

interface SkinProps {
  song: Song;
  isPlaying: boolean;
}

export const CoverFlowPlayer: React.FC<SkinProps> = ({ song, isPlaying }) => {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-4">
      <div className={`relative w-full aspect-square max-w-[320px] rounded-2xl shadow-2xl overflow-hidden transition-transform duration-500 ${isPlaying ? 'scale-100' : 'scale-90 opacity-90'}`}>
        <img src={song.coverUrl} alt="Cover" className="w-full h-full object-cover" />
        {/* Glass reflection effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
      </div>
      {/* Reflection shadow */}
      <div className="w-[80%] h-4 bg-black/40 blur-xl rounded-full mt-4"></div>
    </div>
  );
};
