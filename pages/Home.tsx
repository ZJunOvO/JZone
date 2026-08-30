import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { Icons } from '../components/Icons';
import { navigateWithProfileAvatarTransition } from '../components/motion/profileAvatarTransition';
import { useListeningRecapPreview } from '../hooks/useListeningRecap';
import { supabaseApi } from '../supabaseApi';
import { useStore } from '../store';
import type { ListeningRecapPeriod, ListeningRecapResponse } from '../services/supabase/listeningRecapTypes';
import type { Song } from '../types';
import { ResilientCoverImage } from '../components/media/ResilientCoverImage';

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

const getCurrentRecapPeriod = (): ListeningRecapPeriod => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (year && month) return { type: 'month', id: `${year}-${month}` };
  } catch {}
  const now = new Date();
  return {
    type: 'month',
    id: `${String(now.getUTCFullYear()).padStart(4, '0')}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
  };
};

const formatRecapPeriodTitle = (period?: ListeningRecapPeriod | null) => {
  const current = period ?? getCurrentRecapPeriod();
  if (current.type === 'year') return `${current.id} 年的声音`;
  const [year, month] = current.id.split('-');
  const monthNumber = Number(month);
  return /^\d{4}$/.test(year) && monthNumber >= 1 && monthNumber <= 12
    ? `${year} 年 ${monthNumber} 月的声音`
    : '本期的声音';
};

const getRecapEntryCopy = (response: ListeningRecapResponse | null) => {
  if (!response) return '查看本期回顾';
  if (response.error || response.coverage?.status === 'error') return '回顾暂时不可用';
  if (response.coverage?.status === 'legacy_only') return '历史累计尚不能组成这段回顾';
  if (response.coverage?.status === 'no_event') return '本期还没有可回顾的有效播放';
  if (response.summary && (response.coverage?.status === 'event_complete' || response.coverage?.status === 'event_partial')) {
    if (response.summary.validPlayCount === 0 && response.coverage.status === 'event_complete') {
      return '本期还没有可回顾的有效播放';
    }
    const prefix = response.coverage.status === 'event_partial' ? '覆盖段已确认' : '已确认';
    return `${prefix} ${response.summary.listeningDayCount} 天 · ${response.summary.validPlayCount} 次有效播放`;
  }
  return '查看本期回顾';
};

const ListeningRecapEntry = ({
  preview,
  onOpen,
}: {
  preview: ListeningRecapResponse | null;
  onOpen: (period?: ListeningRecapPeriod) => void;
}) => {
  const period = preview?.period ?? null;
  const coverUrl = preview?.coverage?.status === 'event_complete' || preview?.coverage?.status === 'event_partial'
    ? preview.opening?.coverSong?.coverUrl
    : null;
  const coverSong = preview?.opening?.coverSong ?? null;

  return (
    <section className="space-y-3" aria-label="聆听回顾入口">
      <button
        type="button"
        onClick={() => onOpen(period ?? undefined)}
        className="group relative min-h-[136px] w-full cursor-pointer overflow-hidden text-left transition-opacity duration-200 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 motion-reduce:transition-none"
        data-testid="listening-recap-entry"
        aria-label={`${formatRecapPeriodTitle(period)}，${getRecapEntryCopy(preview)}`}
      >
        {coverUrl || coverSong?.coverPath ? (
          <ResilientCoverImage
            src={coverUrl}
            coverPath={coverSong?.coverPath}
            fallbackSeed={coverSong?.id || 'listening-recap'}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-y-0 right-0 h-full w-[74%] object-cover opacity-55"
            style={{
              WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.24) 28%, #000 68%, #000 100%)',
              maskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.24) 28%, #000 68%, #000 100%)',
            }}
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[74%] bg-[linear-gradient(112deg,rgba(239,68,68,0.13),rgba(37,99,235,0.1),transparent_84%)] blur-2xl"
            aria-hidden="true"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/25" />
        <div className="relative flex min-h-[136px] items-center justify-between gap-5 px-1 py-5">
          <div className="min-w-0 max-w-[78%]">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-normal text-red-300/65">聆听回顾</div>
            <h2 className="truncate text-[1.65rem] font-extrabold tracking-normal text-white">{preview?.opening?.title ?? formatRecapPeriodTitle(period)}</h2>
            <p className="mt-2 truncate text-sm text-white/55">{getRecapEntryCopy(preview)}</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors group-hover:text-white motion-reduce:transition-none">
            <Icons.ChevronRight size={20} />
          </span>
        </div>
      </button>
    </section>
  );
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
      <div className="text-xl font-semibold text-white mb-1 truncate">{song.title}</div>
      <div className="text-zinc-400 text-sm mb-3 truncate">{song.artist}</div>

      <div className="relative aspect-square rounded-[16px] overflow-hidden bg-zinc-800 shadow-xl border border-white/5">
        <ResilientCoverImage
          src={song.coverUrl}
          coverPath={song.coverPath}
          fallbackSeed={song.id}
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
      <h2 className="text-xl font-bold text-white">最新公开</h2>
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
      <h2 className="text-xl font-bold text-white">继续播放</h2>
      {primary ? (
        <div className="rounded-[24px] bg-white/[0.045] border border-white/5 overflow-hidden">
          <button
            type="button"
            onClick={() => onPlay(primary.id)}
            className="w-full flex items-center gap-4 p-4 text-left active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
          >
            <div className="relative w-[104px] h-[78px] shrink-0">
              {songs.slice(0, 3).map((song, index) => (
                <ResilientCoverImage
                  key={song.id}
                  src={song.coverUrl}
                  coverPath={song.coverPath}
                  fallbackSeed={song.id}
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
              <div className="text-lg font-extrabold text-white truncate">{primary.title}</div>
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
                    <ResilientCoverImage src={song.coverUrl} coverPath={song.coverPath} fallbackSeed={song.id} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover bg-zinc-800 border border-white/5" />
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
        <h2 className="text-xl font-bold text-white">常听</h2>
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
              <ResilientCoverImage src={song.coverUrl} coverPath={song.coverPath} fallbackSeed={song.id} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover bg-zinc-800" />
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

interface HomeProps {
  profileAvatarUrl?: string;
}

export const Home: React.FC<HomeProps> = ({ profileAvatarUrl }) => {
  const { user } = useAuth();
  const listeningRecapPreview = useListeningRecapPreview();

  useEffect(() => {
    void import('./Profile');
  }, []);
  const resolvedAvatarUrl = profileAvatarUrl;
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
        <h1 className="text-3xl font-extrabold text-white">现在就听</h1>
        <motion.button
          type="button"
          onClick={(event) => {
            navigateWithProfileAvatarTransition(event.currentTarget, resolvedAvatarUrl, () => {
              window.dispatchEvent(new CustomEvent('jzone:navigate-profile'));
            });
          }}
          className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-white shadow-lg overflow-hidden border border-white/10 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="进入我的页面"
          data-shared-element="profile-avatar"
          data-profile-avatar-source="true"
          data-profile-home-avatar-source="true"
          data-profile-home-avatar-target="true"
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

      <ListeningRecapEntry
        preview={listeningRecapPreview.response}
        onOpen={(period) => {
          window.dispatchEvent(new CustomEvent('jzone:navigate-listening-recap', {
            detail: period ? { period } : undefined,
          }));
        }}
      />
    </div>
  );
};
