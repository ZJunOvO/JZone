import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth';
import { Song } from '../types';

const RECENT_KEY = 'jzone_recent_song_ids_v1';

const FocusCard = ({
  song,
  label,
  active,
  onPlay,
}: {
  song: Song;
  label: string;
  active?: boolean;
  onPlay: (id: string) => void;
}) => (
  <button onClick={() => onPlay(song.id)} className="flex-none w-[85%] snap-start group cursor-pointer text-left">
    <div className="relative mb-2">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-semibold text-white mb-1 truncate tracking-tight">{song.title}</div>
      <div className="text-zinc-400 text-sm mb-3 truncate">{song.artist}</div>

      <div className="relative aspect-square rounded-[16px] overflow-hidden bg-zinc-800 shadow-xl border border-white/5">
        <img
          src={song.coverUrl}
          alt={song.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent pointer-events-none" />
        <div className={`absolute bottom-3 right-3 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active ? (
            <Icons.Pause fill="white" size={17} className="text-white" />
          ) : (
            <Icons.Play fill="white" size={16} className="text-white ml-0.5" />
          )}
        </div>
      </div>
    </div>
  </button>
);

const FocusRail = ({
  title,
  songs,
  label,
  empty,
  currentSongId,
  isPlaying,
  onPlay,
}: {
  title: string;
  songs: Song[];
  label: string;
  empty: string;
  currentSongId?: string | null;
  isPlaying?: boolean;
  onPlay: (id: string) => void;
}) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
      <Icons.ChevronRight className="text-zinc-500" size={20} />
    </div>

    {songs.length ? (
      <div className="flex overflow-x-auto gap-4 pb-4 -mx-6 px-6 scroll-pl-6 snap-x no-scrollbar">
        {songs.map((song) => (
          <FocusCard
            key={`${title}-${song.id}`}
            song={song}
            label={currentSongId === song.id && isPlaying ? '播放中' : label}
            active={currentSongId === song.id && isPlaying}
            onPlay={onPlay}
          />
        ))}
      </div>
    ) : (
      <div className="py-10 text-center text-sm text-zinc-600 bg-zinc-900/20 border border-white/5 rounded-[24px]">
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
  const heroSong = currentSong || recentSongs[0] || latestPublicSongs[0] || songs[0];
  const discoverySongs = latestPublicSongs.filter((song) => song.id !== heroSong?.id).slice(0, 6);

  return (
    <div className="relative pb-32 pt-14 px-6 space-y-9 bg-black min-h-screen overflow-hidden">
      {heroSong?.coverUrl && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[430px] overflow-hidden">
          <img
            src={heroSong.coverUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover opacity-35 blur-3xl scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/70 to-black" />
        </div>
      )}

      <div className="relative flex items-center justify-between mb-2">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">现在就听</h1>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border border-white/10">
          <Icons.User size={18} fill="currentColor" />
        </div>
      </div>

      {heroSong ? (
        <section className="relative space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">{currentSong ? '继续播放' : '为你打开'}</h2>
            <span className="text-sm text-red-500 font-medium">{playerState.isPlaying && currentSong?.id === heroSong.id ? '播放中' : '播放'}</span>
          </div>

          <button onClick={() => playSong(heroSong.id)} className="block w-full text-left group">
            <div className="relative mb-2">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                {currentSong ? 'CONTINUE' : recentSongs.length ? 'RECENTLY PLAYED' : 'LATEST RELEASE'}
              </div>
              <div className="text-2xl font-bold text-white mb-1 truncate tracking-tight">{heroSong.title}</div>
              <div className="text-zinc-400 text-sm mb-3 truncate">{heroSong.artist}</div>

              <div className="relative aspect-square rounded-[18px] overflow-hidden bg-zinc-800 shadow-2xl shadow-black/50 border border-white/10">
                <img
                  src={heroSong.coverUrl}
                  alt={heroSong.title}
                  loading="eager"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
                <div className="absolute left-4 bottom-4 flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur-xl">
                  <span className={`h-2 w-2 rounded-full ${playerState.isPlaying && currentSong?.id === heroSong.id ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]' : 'bg-white/45'}`} />
                  {playerState.isPlaying && currentSong?.id === heroSong.id ? '正在播放' : '点击继续'}
                </div>
                <div className="absolute bottom-3 right-3 w-11 h-11 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                  {playerState.isPlaying && currentSong?.id === heroSong.id ? (
                    <Icons.Pause fill="white" size={19} className="text-white" />
                  ) : (
                    <Icons.Play fill="white" size={18} className="text-white ml-0.5" />
                  )}
                </div>
              </div>
            </div>
          </button>
        </section>
      ) : null}

      <div className="relative space-y-9">
        <FocusRail title="最近播放" songs={recentSongs} label="最近播放" empty="还没有播放记录" currentSongId={playerState.currentSongId} isPlaying={playerState.isPlaying} onPlay={playSong} />
        <FocusRail title="最新公开" songs={discoverySongs.length ? discoverySongs : latestPublicSongs} label="最新发行" empty="暂无公开内容" currentSongId={playerState.currentSongId} isPlaying={playerState.isPlaying} onPlay={playSong} />
        <FocusRail title="我的最近上传" songs={myRecentUploads} label="我的收录" empty="还没有上传过音乐" currentSongId={playerState.currentSongId} isPlaying={playerState.isPlaying} onPlay={playSong} />
      </div>

      <div className="h-20"></div>
    </div>
  );
};
