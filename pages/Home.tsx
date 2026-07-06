import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
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

const RecentPlayback = ({
  songs,
  currentSongId,
  isPlaying,
  onPlay,
}: {
  songs: Song[];
  currentSongId?: string | null;
  isPlaying?: boolean;
  onPlay: (id: string) => void;
}) => {
  const primary = songs[0];
  const rows = songs.slice(0, 4);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight">最近播放</h2>
        {songs.length > 4 ? <span className="text-sm text-red-500 font-medium">查看全部</span> : null}
      </div>

      {primary ? (
        <div className="rounded-[28px] bg-white/[0.055] border border-white/10 overflow-hidden">
          <button
            onClick={() => onPlay(primary.id)}
            className="w-full flex items-center gap-4 p-4 text-left active:scale-[0.99] transition"
          >
            <div className="relative w-[104px] h-[78px] shrink-0">
              {songs.slice(0, 3).map((song, index) => (
                <img
                  key={song.id}
                  src={song.coverUrl}
                  alt={song.title}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="absolute top-0 h-[78px] w-[78px] rounded-[18px] object-cover border border-white/10 shadow-xl bg-zinc-800"
                  style={{ left: index * 13, zIndex: 3 - index, opacity: 1 - index * 0.18 }}
                />
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                {currentSongId === primary.id && isPlaying ? 'PLAYING NOW' : 'CONTINUE'}
              </div>
              <div className="text-lg font-extrabold text-white truncate tracking-tight">{primary.title}</div>
              <div className="text-sm text-zinc-400 truncate mt-0.5">{primary.artist}</div>
            </div>

            <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0">
              {currentSongId === primary.id && isPlaying ? (
                <Icons.Pause size={18} fill="currentColor" />
              ) : (
                <Icons.Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </div>
          </button>

          {rows.length > 1 ? (
            <div className="px-3 pb-3 space-y-1">
              {rows.slice(1).map((song) => {
                const active = currentSongId === song.id && isPlaying;
                return (
                  <button
                    key={song.id}
                    onClick={() => onPlay(song.id)}
                    className="w-full flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/[0.055] active:scale-[0.99] transition"
                  >
                    <img src={song.coverUrl} alt={song.title} loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover bg-zinc-800 border border-white/5" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold truncate ${active ? 'text-red-400' : 'text-zinc-100'}`}>{song.title}</div>
                      <div className="text-xs text-zinc-500 truncate">{song.artist}</div>
                    </div>
                    {active ? <Icons.Radio size={16} className="text-red-400 shrink-0" /> : <Icons.Play size={14} className="text-zinc-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="py-10 text-center text-sm text-zinc-600 bg-zinc-900/20 border border-white/5 rounded-[24px]">
          播放一首歌后，这里会显示最近播放
        </div>
      )}
    </section>
  );
};

export const Home: React.FC = () => {
  const { songs, playSong, playerState } = useStore();
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

  const recentSongs = useMemo(
    () => recentSongIds.map((id) => songs.find((song) => song.id === id)).filter((song): song is Song => Boolean(song)),
    [recentSongIds, songs]
  );
  const latestPublicSongs = useMemo(
    () => songs.filter((song) => song.isPublic !== false && song.visibility !== 'private').slice(0, 6),
    [songs]
  );

  return (
    <div className="relative pb-32 pt-14 px-6 space-y-9 bg-black min-h-screen overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">现在就听</h1>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border border-white/10">
          <Icons.User size={18} fill="currentColor" />
        </div>
      </div>

      <RecentPlayback
        songs={recentSongs}
        currentSongId={playerState.currentSongId}
        isPlaying={playerState.isPlaying}
        onPlay={playSong}
      />

      <FocusRail title="最新公开" songs={latestPublicSongs} label="最新发行" empty="暂无公开内容" currentSongId={playerState.currentSongId} isPlaying={playerState.isPlaying} onPlay={playSong} />

      <div className="h-20"></div>
    </div>
  );
};
