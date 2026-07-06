import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth';
import { Song } from '../types';

const RECENT_KEY = 'jzone_recent_song_ids_v1';

const SongTile = ({ song, onPlay }: { song: Song; onPlay: (id: string) => void }) => (
  <button onClick={() => onPlay(song.id)} className="flex-none w-36 snap-start cursor-pointer group text-left">
    <div className="aspect-square rounded-[12px] overflow-hidden bg-zinc-800 mb-2 shadow-lg border border-white/5">
      <img src={song.coverUrl} alt={song.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
    </div>
    <h4 className="text-xs font-medium text-white truncate pr-1">{song.title}</h4>
    <p className="text-[10px] text-zinc-500 truncate">{song.artist}</p>
  </button>
);

const Rail = ({ title, songs, onPlay, empty }: { title: string; songs: Song[]; onPlay: (id: string) => void; empty: string }) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
    </div>
    {songs.length ? (
      <div className="flex overflow-x-auto gap-4 -mx-6 px-6 scroll-pl-6 snap-x no-scrollbar">
        {songs.map((song) => (
          <SongTile key={`${title}-${song.id}`} song={song} onPlay={onPlay} />
        ))}
      </div>
    ) : (
      <div className="py-8 text-center text-sm text-zinc-600 bg-zinc-900/20 border border-white/5 rounded-[24px]">
        {empty}
      </div>
    )}
  </section>
);

export const Home: React.FC = () => {
  const { songs, playSong, playerState, getCurrentSong } = useStore();
  const { user } = useAuth();
  const [recentSongIds, setRecentSongIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        setRecentSongIds(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setRecentSongIds([]);
      }
    };
    window.addEventListener('jzone:recent-played', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('jzone:recent-played', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const currentSong = getCurrentSong();
  const recentSongs = useMemo(
    () => recentSongIds.map((id) => songs.find((song) => song.id === id)).filter((song): song is Song => Boolean(song)),
    [recentSongIds, songs]
  );
  const latestPublicSongs = useMemo(
    () => songs.filter((song) => song.isPublic !== false && song.visibility !== 'private').slice(0, 6),
    [songs]
  );
  const myRecentUploads = useMemo(
    () => songs.filter((song) => song.ownerId === user?.id || (!song.ownerId && song.uploadedBy === 'Me')).slice(0, 6),
    [songs, user?.id]
  );

  return (
    <div className="pb-32 pt-14 px-6 space-y-9 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">现在就听</h1>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border border-white/10">
          <Icons.User size={18} fill="currentColor" />
        </div>
      </div>

      {currentSong ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white tracking-tight">继续播放</h2>
          <button onClick={() => playSong(currentSong.id)} className="w-full flex items-center gap-4 p-3 rounded-[24px] bg-zinc-900/70 border border-white/5 text-left active:scale-[0.99] transition">
            <img src={currentSong.coverUrl} alt={currentSong.title} className="w-16 h-16 rounded-2xl object-cover bg-zinc-800" />
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold truncate">{currentSong.title}</div>
              <div className="text-xs text-zinc-500 truncate mt-1">{currentSong.artist}</div>
            </div>
            <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
              {playerState.isPlaying ? <Icons.Pause size={18} fill="currentColor" /> : <Icons.Play size={18} fill="currentColor" className="ml-0.5" />}
            </div>
          </button>
        </section>
      ) : null}

      <Rail title="最近播放" songs={recentSongs} onPlay={playSong} empty="还没有播放记录" />
      <Rail title="最新公开" songs={latestPublicSongs} onPlay={playSong} empty="暂无公开内容" />
      <Rail title="我的最近上传" songs={myRecentUploads} onPlay={playSong} empty="还没有上传过音乐" />

      <div className="h-20"></div>
    </div>
  );
};
