import React from 'react';
import { Song } from '../../types';

interface SkinProps {
  song: Song;
  isPlaying: boolean;
}

export const MinimalPlayer: React.FC<SkinProps> = ({ song }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 h-full">
      <div className="w-full space-y-2">
        <h2 className="text-4xl md:text-5xl font-black text-white leading-tight tracking-tighter">
          {song.title}
        </h2>
        <h3 className="text-2xl font-light text-slate-400">
          {song.artist}
        </h3>
        <p className="text-sm font-mono text-indigo-400 mt-4 uppercase tracking-widest">
            {song.album || "Single"}
        </p>
      </div>
      <div className="mt-12 w-full h-64 bg-slate-800/50 rounded-lg flex items-end justify-between p-2 gap-1 overflow-hidden">
         {/* Fake visualizer bars */}
         {Array.from({ length: 12 }).map((_, i) => (
             <div 
                key={i} 
                className="flex-1 bg-indigo-500 rounded-t-sm animate-pulse"
                style={{ 
                    height: `${Math.random() * 80 + 20}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.8s'
                }}
             ></div>
         ))}
      </div>
    </div>
  );
};
