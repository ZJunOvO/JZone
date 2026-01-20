import React from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';

export const Home: React.FC = () => {
  const { songs, playSong } = useStore();
  
  const featuredSongs = [...songs, ...songs]; 
  const recentSongs = [...songs].reverse();

  return (
    <div className="pb-32 pt-14 px-6 space-y-9 bg-black min-h-screen">
      {/* Header Area - Removed any potential border/divider */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">现在就听</h1>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border border-white/10">
            <Icons.User size={18} fill="currentColor" />
        </div>
      </div>

      {/* Featured Section (Horizontal Scroll) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
           <h2 className="text-xl font-bold text-white tracking-tight">精选推荐</h2>
           <Icons.ChevronRight className="text-zinc-500" size={20} />
        </div>
        
        {/* Scroll Container */}
        <div className="flex overflow-x-auto gap-4 pb-4 -mx-6 px-6 scroll-pl-6 snap-x no-scrollbar">
          {featuredSongs.map((song, idx) => (
            <div 
                key={`${song.id}-feat-${idx}`}
                onClick={() => playSong(song.id)}
                className="flex-none w-[85%] snap-start group cursor-pointer"
            >
                <div className="relative mb-2">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">最新发行</div>
                    <div className="text-lg font-medium text-white mb-1 truncate">{song.title}</div>
                    <div className="text-zinc-400 text-sm mb-3 truncate">{song.artist}</div>
                    
                    <div className="relative aspect-square rounded-[16px] overflow-hidden bg-zinc-800 shadow-xl border border-white/5">
                        <img 
                            src={song.coverUrl} 
                            alt={song.title} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                         {/* Play Overlay */}
                         <div className="absolute bottom-3 right-3 w-9 h-9 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icons.Play fill="white" size={16} className="text-white ml-0.5" />
                        </div>
                    </div>
                </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently Played */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
             <h2 className="text-xl font-bold text-white tracking-tight">最近播放</h2>
             <span className="text-sm text-red-500 font-medium">查看全部</span>
        </div>

        <div className="flex overflow-x-auto gap-4 -mx-6 px-6 scroll-pl-6 snap-x no-scrollbar">
            {recentSongs.map((song, idx) => (
                <div 
                    key={`${song.id}-recent-${idx}`} 
                    onClick={() => playSong(song.id)}
                    className="flex-none w-36 snap-start cursor-pointer group"
                >
                    <div className="aspect-square rounded-[12px] overflow-hidden bg-zinc-800 mb-2 shadow-lg border border-white/5">
                         <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    </div>
                    <h4 className="text-xs font-medium text-white truncate pr-1">{song.title}</h4>
                    <p className="text-[10px] text-zinc-500 truncate">{song.artist}</p>
                </div>
            ))}
        </div>
      </section>
      
      <div className="h-20"></div>
    </div>
  );
};