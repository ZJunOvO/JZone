import React from 'react';
import { Song, PlayerState } from '../../types';

interface SkinProps {
  song: Song;
  isPlaying: boolean;
}

export const VinylPlayer: React.FC<SkinProps> = ({ song, isPlaying }) => {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="relative w-72 h-72">
        {/* Arm */}
        <div className={`absolute -top-4 -right-4 w-24 h-40 origin-top-right transition-transform duration-700 z-10 ${isPlaying ? 'rotate-12' : 'rotate-0'}`}>
          <div className="w-1 h-24 bg-stone-400 absolute right-4 rounded-full"></div>
          <div className="w-6 h-12 bg-stone-700 absolute bottom-0 right-2 rounded"></div>
        </div>
        
        {/* Record */}
        <div className={`w-full h-full rounded-full bg-black shadow-2xl flex items-center justify-center border-4 border-stone-800 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
          {/* Grooves */}
          <div className="absolute inset-2 rounded-full border border-stone-800 opacity-50"></div>
          <div className="absolute inset-8 rounded-full border border-stone-800 opacity-50"></div>
          <div className="absolute inset-16 rounded-full border border-stone-800 opacity-50"></div>
          
          {/* Label */}
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-stone-900 relative">
             <img src={song.coverUrl} alt="Label" className="w-full h-full object-cover opacity-80" />
             <div className="absolute inset-0 flex items-center justify-center bg-black/20">
               <div className="w-2 h-2 bg-stone-300 rounded-full"></div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
