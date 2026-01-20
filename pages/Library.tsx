import React, { useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { LibraryCanvas } from '../components/LibraryCanvas';

export const Library: React.FC = () => {
  const { songs, playSong, playerState } = useStore();
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');

  return (
    <div className={`min-h-screen ${viewMode === 'list' ? 'pb-24 pt-12 px-6' : 'pt-0 pb-0'}`}>
       
       {/* Header with View Toggle */}
       <div className={`flex items-center ${viewMode === 'canvas' ? 'justify-end absolute top-12 right-6 z-30 pointer-events-none' : 'justify-between mb-6'}`}>
           {viewMode === 'list' && (
             <h1 className="text-3xl font-extrabold text-white tracking-tight pointer-events-auto drop-shadow-md">资料库</h1>
           )}
           
           <div className="bg-zinc-800/50 backdrop-blur-2xl rounded-full p-1 flex gap-1 border border-white/10 pointer-events-auto shadow-2xl transition-colors duration-300">
               <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
               >
                   <Icons.ListMusic size={18} />
               </button>
               <button 
                  onClick={() => setViewMode('canvas')}
                  className={`p-2 rounded-full transition-all ${viewMode === 'canvas' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
               >
                   <Icons.Search size={18} /> {/* Using Search icon as a metaphor for exploration */}
               </button>
           </div>
       </div>
       
       {viewMode === 'list' ? (
           <>
               {/* Filter Chips */}
               <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
                 {['全部', '收藏', '专辑', '艺人'].map((filter, i) => (
                     <button 
                        key={filter} 
                        className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${i === 0 ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                     >
                        {filter}
                     </button>
                 ))}
               </div>

               {/* List View */}
               <div className="space-y-1">
                 {songs.map((song, index) => (
                     <div 
                        key={song.id} 
                        onClick={() => playSong(song.id)}
                        className={`flex items-center p-3 rounded-xl cursor-pointer hover:bg-zinc-900 transition active:scale-[0.99] ${playerState.currentSongId === song.id ? 'bg-zinc-900' : ''}`}
                     >
                        <div className="w-6 mr-3 flex justify-center">
                            {playerState.currentSongId === song.id && playerState.isPlaying ? 
                                <div className="flex gap-[2px] justify-center items-end h-3">
                                     <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                                     <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3"></div>
                                     <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                                </div> 
                                : <span className="text-zinc-500 text-xs font-mono">{index + 1}</span>
                            }
                        </div>
                        
                        <img src={song.coverUrl} className="w-12 h-12 rounded-md object-cover mr-3 bg-zinc-800" alt="art" />
                        
                        <div className="flex-1 overflow-hidden border-b border-zinc-900 pb-3">
                            <h4 className={`text-sm font-medium truncate mb-0.5 ${playerState.currentSongId === song.id ? 'text-red-500' : 'text-zinc-200'}`}>{song.title}</h4>
                            <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                        </div>
                        
                        <div className="text-xs text-zinc-600 font-mono pb-3 border-b border-zinc-900">
                            <Icons.Play size={14} className="opacity-0" /> {/* Spacer */}
                        </div>
                     </div>
                 ))}
               </div>
           </>
       ) : (
           /* Canvas View */
           <LibraryCanvas 
               songs={songs} 
               onPlay={playSong} 
               currentSongId={playerState.currentSongId} 
               isPlaying={playerState.isPlaying}
           />
       )}
    </div>
  );
};