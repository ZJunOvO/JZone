import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { Icons } from '../components/Icons';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';
import { supabaseApi } from '../supabaseApi';
import { useStore } from '../store';
import type { Song } from '../types';

const RECENT_KEY = 'jzone_recent_song_ids_v1';
const PLAY_STATS_CACHE_PREFIX = 'jzone_home_play_stats_v1:';
const PLAY_STATS_REFRESH_MS = 30 * 60 * 1000;

const formatReleaseDate = (timestamp: number) => {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '日期未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

type PlayStat = {
  song_id: string;
  plays_count: number;
  updated_at: string;
};

const readPlayStatsCache = (userId?: string) => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${PLAY_STATS_CACHE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) as { rows: PlayStat[]; updatedAt: number } : null;
  } catch {
    return null;
  }
};

const writePlayStatsCache = (userId: string, rows: PlayStat[]) => {
  try {
    localStorage.setItem(`${PLAY_STATS_CACHE_PREFIX}${userId}`, JSON.stringify({ rows, updatedAt: Date.now() }));
  } catch {}
};

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
  <button
    type="button"
    onClick={() => onPlay(song.id)}
    className="flex-none w-[85%] snap-start group cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[18px]"
    aria-label={`${active ? '暂停' : '播放'} ${song.title}，${song.artist}`}
  >
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
  songs,
  currentSongId,
  isPlaying,
  onPlay,
  onOpenLibrary,
}: {
  songs: Song[];
  currentSongId?: string | null;
  isPlaying?: boolean;
  onPlay: (id: string) => void;
  onOpenLibrary: () => void;
}) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold text-white tracking-tight">最新公开</h2>
      <button
        type="button"
        onClick={onOpenLibrary}
        className="w-11 h-11 -mr-3 flex items-center justify-center rounded-full text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label="在资料库查看全部公开内容"
      >
        <Icons.ChevronRight size={20} />
      </button>
    </div>

    {songs.length ? (
      <div className="flex overflow-x-auto gap-4 pb-4 -mx-6 px-6 scroll-pl-6 snap-x no-scrollbar">
        {songs.map((song) => (
          <FocusCard
            key={song.id}
            song={song}
            label={formatReleaseDate(song.addedAt)}
            active={currentSongId === song.id && isPlaying}
            onPlay={onPlay}
          />
        ))}
      </div>
    ) : (
      <div className="py-10 text-center text-sm text-zinc-600 bg-zinc-900/20 border border-white/5 rounded-[24px]">
        暂无公开内容
      </div>
    )}
  </section>
);

const ContinueListening = ({
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
  const rows = songs.slice(1, 4);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white tracking-tight">继续播放</h2>
      {primary ? (
        <div className="rounded-[24px] bg-white/[0.045] border border-white/5 overflow-hidden">
          <button
            type="button"
            onClick={() => onPlay(primary.id)}
            className="w-full flex items-center gap-4 p-4 text-left active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
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
                {currentSongId === primary.id && isPlaying ? '正在播放' : '上次听到'}
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

          {rows.length ? (
            <div className="px-3 pb-3 space-y-1" aria-label="最近播放">
              {rows.map((song) => {
                const active = currentSongId === song.id && isPlaying;
                return (
                  <button
                    type="button"
                    key={song.id}
                    onClick={() => onPlay(song.id)}
                    className="w-full flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/[0.055] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <img src={song.coverUrl} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover bg-zinc-800 border border-white/5" />
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
          播放一首歌后，这里会保留你的聆听位置
        </div>
      )}
    </section>
  );
};

const FrequentListening = ({
  items,
  currentSongId,
  isPlaying,
  onPlay,
}: {
  items: Array<{ song: Song; count: number }>;
  currentSongId?: string | null;
  isPlaying?: boolean;
  onPlay: (id: string) => void;
}) => {
  if (!items.length) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight">常听</h2>
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">全部时间</span>
      </div>
      <div className="rounded-[24px] bg-white/[0.045] border border-white/5 px-3 py-2">
        {items.slice(0, 5).map(({ song, count }, index) => {
          const active = currentSongId === song.id && isPlaying;
          return (
            <button
              type="button"
              key={song.id}
              onClick={() => onPlay(song.id)}
              className="w-full min-h-14 flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span className={`w-5 text-center text-sm font-semibold tabular-nums ${index < 3 ? 'text-white' : 'text-zinc-600'}`}>{index + 1}</span>
              <img src={song.coverUrl} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover bg-zinc-800" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${active ? 'text-red-400' : 'text-zinc-100'}`}>{song.title}</div>
                <div className="text-xs text-zinc-500 truncate">{song.artist}</div>
              </div>
              <span className="text-[11px] text-zinc-500 tabular-nums">{count.toLocaleString()} 次</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const Home: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    void import('./Profile');
  }, []);
  const { resolvedAvatarUrl } = useCurrentArtistProfile();
  const { songs, playContext, playerState } = useStore();
  const [recentSongIds, setRecentSongIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [playStats, setPlayStats] = useState<PlayStat[]>(() => readPlayStatsCache(user?.id)?.rows ?? []);

  useEffect(() => {
    const refreshRecent = () => {
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        setRecentSongIds(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setRecentSongIds([]);
      }
    };
    const incrementLocalStat = (event: Event) => {
      const songId = (event as CustomEvent<{ songId?: string }>).detail?.songId;
      if (!songId) return;
      setPlayStats((previous) => {
        const found = previous.find((item) => item.song_id === songId);
        const next = !found
          ? [{ song_id: songId, plays_count: 1, updated_at: new Date().toISOString() }, ...previous]
          : previous.map((item) => item.song_id === songId
          ? { ...item, plays_count: item.plays_count + 1, updated_at: new Date().toISOString() }
          : item);
        if (user?.id) writePlayStatsCache(user.id, next);
        return next;
      });
    };
    window.addEventListener('jzone:recent-played', refreshRecent);
    window.addEventListener('storage', refreshRecent);
    window.addEventListener('jzone:play-counted', incrementLocalStat);
    return () => {
      window.removeEventListener('jzone:recent-played', refreshRecent);
      window.removeEventListener('storage', refreshRecent);
      window.removeEventListener('jzone:play-counted', incrementLocalStat);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !supabaseApi.isEnabled()) {
      setPlayStats([]);
      return;
    }
    let cancelled = false;
    const cached = readPlayStatsCache(user.id);
    if (cached?.rows?.length) setPlayStats(cached.rows);

    const refresh = () => {
      supabaseApi.fetchMySongPlayStats(user.id)
        .then((rows) => {
          if (cancelled) return;
          setPlayStats(rows);
          writePlayStatsCache(user.id, rows);
        })
        .catch(() => {});
    };
    if (!cached || Date.now() - cached.updatedAt >= PLAY_STATS_REFRESH_MS) refresh();
    const timer = window.setInterval(refresh, PLAY_STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.id]);

  const backendRecentIds = useMemo(
    () => [...playStats].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).map((item) => item.song_id),
    [playStats]
  );
  const mergedRecentIds = useMemo(
    () => Array.from(new Set([playerState.currentSongId, ...recentSongIds, ...backendRecentIds].filter(Boolean) as string[])),
    [backendRecentIds, playerState.currentSongId, recentSongIds]
  );
  const recentSongs = useMemo(
    () => mergedRecentIds.map((id) => songs.find((song) => song.id === id)).filter((song): song is Song => Boolean(song)),
    [mergedRecentIds, songs]
  );
  const latestPublicSongs = useMemo(
    () => songs.filter((song) => song.isPublic !== false && song.visibility !== 'private').slice(0, 6),
    [songs]
  );
  const frequentItems = useMemo(
    () => [...playStats]
      .sort((a, b) => b.plays_count - a.plays_count)
      .map((item) => ({ song: songs.find((song) => song.id === item.song_id), count: item.plays_count }))
      .filter((item): item is { song: Song; count: number } => Boolean(item.song)),
    [playStats, songs]
  );

  const playRecent = (songId: string) => playContext(recentSongs.map((song) => song.id), songId);
  const playFrequent = (songId: string) => playContext(frequentItems.map((item) => item.song.id), songId);
  const playLatest = (songId: string) => playContext(latestPublicSongs.map((song) => song.id), songId);

  return (
    <div className="relative pb-24 pt-14 px-6 space-y-9 bg-black min-h-screen overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">现在就听</h1>
        <motion.button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            window.dispatchEvent(new CustomEvent('jzone:profile-avatar-transition', {
              detail: {
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                src: resolvedAvatarUrl,
              },
            }));
            // 先让共享头像覆盖层提交一帧，再切换较重的个人页内容。
            window.requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('jzone:navigate-profile'));
            });
          }}
          className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-white shadow-lg overflow-hidden border border-white/10 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="进入我的页面"
          data-shared-element="profile-avatar"
        >
          {resolvedAvatarUrl ? (
            <img src={resolvedAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icons.User size={18} fill="currentColor" />
          )}
        </motion.button>
      </div>

      <div className="flex overflow-x-auto gap-4 pb-2 -mx-6 px-6 scroll-pl-6 snap-x snap-mandatory no-scrollbar">
        <div className={`flex-none snap-start ${frequentItems.length ? 'w-[86%]' : 'w-full'}`}>
          <ContinueListening
            songs={recentSongs}
            currentSongId={playerState.currentSongId}
            isPlaying={playerState.isPlaying}
            onPlay={playRecent}
          />
        </div>

        {frequentItems.length ? (
          <div className="flex-none w-[86%] snap-start">
            <FrequentListening
              items={frequentItems}
              currentSongId={playerState.currentSongId}
              isPlaying={playerState.isPlaying}
              onPlay={playFrequent}
            />
          </div>
        ) : null}
      </div>

      <FocusRail
        songs={latestPublicSongs}
        currentSongId={playerState.currentSongId}
        isPlaying={playerState.isPlaying}
        onPlay={playLatest}
        onOpenLibrary={() => window.dispatchEvent(new CustomEvent('jzone:navigate-library'))}
      />
    </div>
  );
};
