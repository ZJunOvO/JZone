import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Song, PlayerState, PlayerSkin, PlaybackMode, Comment, CommentLoadStatus, CommentSort } from './types';
import { MOCK_SONGS } from './constants';
import { localLibraryStorage } from './localLibraryStorage';
import { hasSupabaseConfig } from './supabaseClient';
import { useAuth } from './auth';
import { supabaseApi } from './supabaseApi';
import { feedback } from './components/feedback';
import { useCommentsController } from './hooks/useCommentsController';
import { getSongCoverFallback } from './utils/cover';

interface AppContextType {
  songs: Song[];
  comments: Comment[];
  commentsLoading: boolean;
  commentsStatus: CommentLoadStatus;
  commentsError: string | null;
  commentsHasMore: boolean;
  commentsLoadingMore: boolean;
  commentSort: CommentSort;
  commentsSchemaReady: boolean;
  playerState: PlayerState;
  favoriteSongIds: string[];
  // Actions
  playSong: (songId: string) => void;
  playContext: (songIds: string[], startSongId: string, context?: { collectionId?: string; collectionType?: 'album' | 'playlist' }) => void;
  playCollection: (songIds: string[], startSongId: string, context?: { collectionId?: string; collectionType?: 'album' | 'playlist' }) => void;
  playNext: (songId: string) => void;
  playLater: (songId: string) => void;
  moveQueueItem: (songId: string, targetIndex: number) => void;
  reorderQueue: (songIds: string[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  cyclePlaybackMode: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  addSong: (song: Song) => void;
  patchSongs: (songIds: string[], updates: Partial<Song>) => void;
  addComment: (comment: Comment) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  retryComments: () => void;
  loadMoreComments: () => Promise<void>;
  setCommentSort: (sort: CommentSort) => void;
  setSkin: (skin: PlayerSkin) => void;
  getCurrentSong: () => Song | undefined;
  removeFromQueue: (songId: string) => void;
  deleteSong: (songId: string) => Promise<void>;
  updateSong: (songId: string, updates: Partial<Song>, options?: { syncAlbumByTitle?: boolean }) => Promise<void>;
  toggleFavorite: (songId: string) => Promise<void>;
  isFavorite: (songId: string) => boolean;
  toggleCommentLike: (commentId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);
const PLAYBACK_MODE_SEQUENCE: PlaybackMode[] = ['sequence', 'repeat-one', 'shuffle'];
const QUALIFYING_PLAY_RATIO = 0.2;
const SONGS_REFRESH_MS = 5 * 60 * 1000;

const getQualifyingPlaySeconds = (song: Song, mediaDuration: number) => {
  const start = Number.isFinite(song.trimStart) ? Math.max(0, song.trimStart) : 0;
  const rawEnd = Number.isFinite(song.trimEnd)
    ? song.trimEnd
    : Number.isFinite(song.duration) && song.duration > 0
      ? song.duration
      : mediaDuration;
  const playableDuration = Math.max(0, rawEnd - start);
  return Math.max(1, playableDuration * QUALIFYING_PLAY_RATIO);
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const [songs, setSongs] = useState<Song[]>(hasSupabaseConfig ? [] : MOCK_SONGS);
  const [favoriteSongIds, setFavoriteSongIds] = useState<string[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentSongId: null,
    isPlaying: false,
    isAudioLoading: false,
    currentTime: 0,
    volume: 0.75,
    queue: hasSupabaseConfig ? [] : MOCK_SONGS.map(s => s.id),
    skin: 'coverflow',
    playbackMode: 'sequence',
  });
  const {
    comments,
    commentsLoading,
    commentsStatus,
    commentsError,
    commentsHasMore,
    commentsLoadingMore,
    commentSort,
    commentsSchemaReady,
    setCommentSort,
    retryComments,
    loadMoreComments,
    addComment,
    toggleCommentLike,
    deleteComment,
  } = useCommentsController({ currentSongId: playerState.currentSongId, authStatus: status, user });
  const loadedSongsForUserRef = useRef<string | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const lastSongsFetchAtRef = useRef(0);
  const SONGS_CACHE_PREFIX = 'jzone_songs_cache_v1:';
  const FAVORITES_CACHE_PREFIX = 'jzone_favorites_cache_v1:';
  const LOCAL_FAVORITES_KEY = 'jzone_favorites_local_v1';

  useEffect(() => {
    let cancelled = false;
    if (!hasSupabaseConfig) {
      localLibraryStorage
        .getAllSongs()
        .then((localSongs) => {
          if (cancelled) return;
          if (!localSongs.length) return;

          setSongs((prev) => {
            const byId = new Map<string, Song>();
            for (const s of prev) byId.set(s.id, s);
            for (const item of localSongs) {
              byId.set(item.meta.id, {
                id: item.meta.id,
                title: item.meta.title,
                artist: item.meta.artist,
                album: item.meta.album,
                genre: item.meta.genre,
                story: item.meta.story,
                fileSize: item.meta.fileSize,
                coverUrl: item.coverUrl,
                audioUrl: item.audioUrl,
                duration: item.meta.duration,
                trimStart: item.meta.trimStart,
                trimEnd: item.meta.trimEnd,
                uploadedBy: item.meta.uploadedBy,
                addedAt: item.meta.addedAt,
              });
            }
            return Array.from(byId.values()).sort((a, b) => b.addedAt - a.addedAt);
          });

          setPlayerState((prev) => {
            const nextQueue = [...prev.queue];
            for (const item of localSongs) {
              if (!nextQueue.includes(item.meta.id)) nextQueue.unshift(item.meta.id);
            }
            return { ...prev, queue: nextQueue };
          });
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    const nextUserId = status === 'signed_in' && user ? user.id : null;
    if (activeUserIdRef.current === nextUserId) return;

    activeUserIdRef.current = nextUserId;
    loadedSongsForUserRef.current = null;
    lastSongsFetchAtRef.current = 0;
    setSongs([]);
    setFavoriteSongIds([]);
    setPlayerState((prev) => ({
      ...prev,
      currentSongId: null,
      isPlaying: false,
      isAudioLoading: false,
      currentTime: 0,
      queue: [],
    }));
  }, [status, user?.id]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;
    if (songs.length) return;

    try {
      const raw = localStorage.getItem(`${SONGS_CACHE_PREFIX}${user.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { songs?: Song[]; fetchedAt?: number };
      if (!parsed?.songs?.length) return;
      lastSongsFetchAtRef.current = parsed.fetchedAt ?? 0;
      setSongs(parsed.songs);
      setPlayerState((prev) => ({ ...prev, queue: parsed.songs!.map((s) => s.id) }));
    } catch {}
  }, [songs.length, status, user]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;
    if (!songs.length) return;
    try {
      localStorage.setItem(`${SONGS_CACHE_PREFIX}${user.id}`, JSON.stringify({
        songs,
        fetchedAt: lastSongsFetchAtRef.current || Date.now(),
      }));
    } catch {}
  }, [songs, status, user]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      try {
        const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setFavoriteSongIds(parsed);
      } catch {}
      return;
    }
    if (status !== 'signed_in' || !user) return;
    try {
      const raw = localStorage.getItem(`${FAVORITES_CACHE_PREFIX}${user.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) setFavoriteSongIds(parsed);
    } catch {}
  }, [status, user]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;
    let cancelled = false;
    supabaseApi
      .fetchFavorites(user.id)
      .then((rows) => {
        if (cancelled) return;
        setFavoriteSongIds(rows.map((r) => r.song_id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  useEffect(() => {
    if (hasSupabaseConfig) {
      if (status !== 'signed_in' || !user) return;
      try {
        localStorage.setItem(`${FAVORITES_CACHE_PREFIX}${user.id}`, JSON.stringify(favoriteSongIds));
      } catch {}
    } else {
      try {
        localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favoriteSongIds));
      } catch {}
    }
  }, [favoriteSongIds, status, user]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;

    let cancelled = false;

    const load = async () => {
      const rows = await supabaseApi.fetchSongs();
      if (cancelled) return;

      const prevById = new Map(stateRef.current.songs.map((s) => [s.id, s] as const));
      const mapped: Song[] = await Promise.all(
        rows.map(async (r) => {
          const prev = prevById.get(r.id);
          let coverUrl = getSongCoverFallback(r.id);
          
          if (r.cover_path) {
            try {
               coverUrl = await supabaseApi.createSignedCoverUrl(r.cover_path);
            } catch {}
          }
          const isPublic = typeof r.is_public === 'boolean' ? r.is_public : r.visibility !== 'private';

          return {
            id: r.id,
            title: r.title,
            artist: r.artist,
            album: r.album ?? undefined,
            genre: r.genre ?? undefined,
            story: r.story ?? undefined,
            fileSize: typeof r.file_size === 'number' ? r.file_size : undefined,
            coverUrl,
            audioUrl: '',
            audioPath: r.stream_audio_path ?? r.audio_path,
            sourceAudioPath: r.audio_path,
            streamAudioPath: r.stream_audio_path ?? undefined,
            streamFileSize: typeof r.stream_file_size === 'number' ? r.stream_file_size : undefined,
            streamBitrateKbps: typeof r.stream_bitrate_kbps === 'number' ? r.stream_bitrate_kbps : undefined,
            coverPath: r.cover_path ?? undefined,
            visibility: isPublic ? 'public' : 'private',
            isPublic,
            pinnedAt: r.pinned_at ?? null,
            ownerId: r.owner_id,
            playsCount: typeof r.plays_count === 'number' ? r.plays_count : 0,
            duration: r.duration,
            trimStart: r.trim_start,
            trimEnd: r.trim_end,
            uploadedBy: r.owner_id === user.id ? 'Me' : 'Member',
            addedAt: new Date(r.created_at).getTime(),
          };
        })
      );

      setSongs(mapped);
      setPlayerState((prev) => ({ ...prev, queue: mapped.map((s) => s.id) }));
      loadedSongsForUserRef.current = user.id;
      lastSongsFetchAtRef.current = Date.now();
    };

    const refresh = () => load().catch(() => {});
    const cacheIsFresh = stateRef.current.songs.length > 0
      && Date.now() - lastSongsFetchAtRef.current < SONGS_REFRESH_MS;
    if (!cacheIsFresh) refresh();
    const timer = window.setInterval(refresh, SONGS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, user?.id]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const playSeqRef = useRef(0);
  const playbackSessionRef = useRef({
    songId: null as string | null,
    listenedSeconds: 0,
    lastTickAt: 0,
    lastMediaTime: 0,
    counted: false,
  });
  
  // Refs for event handlers to avoid dependency cycles while keeping latest state access
  const stateRef = useRef({ songs, playerState });
  const favoriteSongIdsRef = useRef(favoriteSongIds);
  
  useEffect(() => {
    stateRef.current = { songs, playerState };
  }, [songs, playerState]);

  useEffect(() => {
    favoriteSongIdsRef.current = favoriteSongIds;
  }, [favoriteSongIds]);

  // Initialize Audio Logic
  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 0.75;
        audioRef.current.preload = 'metadata';
    }
    const audio = audioRef.current;

    const beginPlaybackSession = (songId: string | null) => {
      playbackSessionRef.current = {
        songId,
        listenedSeconds: 0,
        lastTickAt: Date.now(),
        lastMediaTime: audio.currentTime || 0,
        counted: false,
      };
    };

    const recordQualifiedPlay = (songId: string) => {
      if (!hasSupabaseConfig) return;
      supabaseApi.incrementSongPlay(songId).catch(() => {});
      supabaseApi.incrementUserSongPlay(songId).catch(() => {});
      setSongs((prev) => prev.map((song) => (
        song.id === songId ? { ...song, playsCount: (song.playsCount ?? 0) + 1 } : song
      )));
      window.dispatchEvent(new CustomEvent('jzone:play-counted', { detail: { songId } }));
    };

    const samplePlaybackSession = () => {
      const { songs, playerState } = stateRef.current;
      const currentSong = songs.find(s => s.id === playerState.currentSongId);
      if (!currentSong) return;

      const now = Date.now();
      const session = playbackSessionRef.current;
      if (session.songId !== currentSong.id) {
        beginPlaybackSession(currentSong.id);
        return;
      }

      const currentMediaTime = audio.currentTime || 0;
      if (playerState.isPlaying && !audio.paused && !audio.seeking && !audio.ended && audio.readyState >= 2) {
        const wallDelta = Math.max(0, (now - session.lastTickAt) / 1000);
        const mediaDelta = Math.max(0, currentMediaTime - session.lastMediaTime);
        // seek 会让媒体时间跳跃，但不会超过真实经过时间，因此无法通过拖动进度刷次数。
        const sampledDelta = mediaDelta > 0.01
          ? Math.min(wallDelta, mediaDelta + 0.2)
          : Math.min(wallDelta, 0.75);
        session.listenedSeconds += sampledDelta;
        const qualifyingSeconds = getQualifyingPlaySeconds(currentSong, audio.duration);
        if (!session.counted && session.listenedSeconds >= qualifyingSeconds) {
          session.counted = true;
          recordQualifiedPlay(currentSong.id);
        }
      }
      session.lastTickAt = now;
      session.lastMediaTime = currentMediaTime;
    };

    const handleTimeUpdate = () => {
      setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime || 0 }));

      const { songs, playerState } = stateRef.current;
      const currentSong = songs.find(s => s.id === playerState.currentSongId);
      if (!currentSong) return;

      if (Number.isFinite(currentSong.trimStart) && audio.currentTime < currentSong.trimStart - 0.05) {
        audio.currentTime = currentSong.trimStart;
      }

      if (Number.isFinite(currentSong.trimEnd) && audio.currentTime >= currentSong.trimEnd) {
        audio.currentTime = currentSong.trimStart;
        if (playerState.playbackMode === 'repeat-one') {
          beginPlaybackSession(currentSong.id);
          audio.play().catch(() => {});
        } else if (playerState.isPlaying && nextSongRef.current) {
          nextSongRef.current();
        }
      }
    };

    const handleEnded = () => {
       beginPlaybackSession(null);
       if (nextSongRef.current) {
           nextSongRef.current();
       }
    };

    const playbackSampler = window.setInterval(samplePlaybackSession, 500);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      window.clearInterval(playbackSampler);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (stateRef.current.playerState.isPlaying) {
      audio.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    } else {
      const { songs, playerState } = stateRef.current;
      const currentSong = songs.find((s) => s.id === playerState.currentSongId);
      if (currentSong && Number.isFinite(currentSong.trimStart) && audio.currentTime < currentSong.trimStart - 0.05) {
        audio.currentTime = currentSong.trimStart;
      }
      try {
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
        playbackSessionRef.current.lastTickAt = Date.now();
        playbackSessionRef.current.lastMediaTime = audio.currentTime || 0;
        setPlayerState(prev => ({ ...prev, isPlaying: true }));
      } catch (e) {
        console.warn("Toggle play interrupted or failed:", e);
      }
    }
  }, []);

  const playSong = useCallback(async (songId: string) => {
    const seq = ++playSeqRef.current;
    const { songs, playerState } = stateRef.current;
    const song = songs.find(s => s.id === songId);
    const audio = audioRef.current;
    
    if (!song || !audio) return;

    // 刷新后只会恢复歌曲 ID，Audio 实例并没有对应音源；此时必须重新装载。
    const hasLoadedSource = Boolean(audio.currentSrc || audio.getAttribute('src'));
    if (playerState.currentSongId === songId && hasLoadedSource) {
      togglePlay();
      return;
    }

    // Resetting src cancels any pending play()
    audio.pause();
    playbackSessionRef.current = {
      songId,
      listenedSeconds: 0,
      lastTickAt: Date.now(),
      lastMediaTime: song.trimStart || 0,
      counted: false,
    };
    setPlayerState(prev => ({ ...prev, currentSongId: songId, isPlaying: false, isAudioLoading: true, currentTime: song.trimStart || 0 }));

    const sources: string[] = [];
    if (hasSupabaseConfig) {
      const remotePaths = Array.from(new Set([song.audioPath, song.sourceAudioPath].filter(Boolean))) as string[];
      for (const path of remotePaths) {
        try {
          sources.push(await supabaseApi.createSignedAudioUrl(path));
        } catch (error) {
          console.warn('音频签名地址生成失败，尝试下一音源:', path, error);
        }
      }
    }
    if (song.audioUrl && !sources.includes(song.audioUrl)) sources.push(song.audioUrl);

    const loadAudioSource = (src: string) => new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          audio.removeEventListener('error', onError);
          reject(audio.error ?? new Error('音频加载失败'));
        };
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('error', onError);
        // 先绑定事件再加载；命中本地缓存时 metadata 可能在极短时间内完成。
        audio.src = src;
        audio.load();
      });

    let loadError: any = null;
    let sourceLoaded = false;
    for (const source of sources) {
      try {
        await loadAudioSource(source);
        sourceLoaded = true;
        break;
      } catch (error) {
        loadError = error;
        if (seq !== playSeqRef.current) return;
        console.warn('音源加载失败，尝试回退音源:', error);
      }
    }
    setPlayerState(prev => ({ ...prev, isAudioLoading: false }));

    if (!sourceLoaded) {
      const code = audio.error?.code ? `MediaError(${audio.error.code})` : 'unknown';
      const detail = typeof loadError?.message === 'string' ? loadError.message : code;
      feedback.error(`音频加载失败：${detail}`);
      return;
    }

    if (seq !== playSeqRef.current) return;

    audio.currentTime = song.trimStart || 0;
    
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      if (seq !== playSeqRef.current) return;
      setPlayerState(prev => ({ ...prev, currentSongId: songId, isPlaying: true }));
      try {
        const key = 'jzone_recent_song_ids_v1';
        const raw = localStorage.getItem(key);
        const previous = raw ? (JSON.parse(raw) as string[]) : [];
        const next = [songId, ...previous.filter((id) => id !== songId)].slice(0, 24);
        localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('jzone:recent-played', { detail: { songId } }));
      } catch {}
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Expected when src changes rapidly
        console.debug("Playback interrupted by new load request");
      } else {
        console.error("Playback failed:", error);
      }
    }
  }, [togglePlay]);

  const playContext = useCallback(
    (songIds: string[], startSongId: string, context?: { collectionId?: string; collectionType?: 'album' | 'playlist' }) => {
      const knownSongIds = new Set(stateRef.current.songs.map((song) => song.id));
      const nextQueue = Array.from(new Set(songIds.filter((id) => id && knownSongIds.has(id))));
      if (!nextQueue.includes(startSongId) && knownSongIds.has(startSongId)) nextQueue.unshift(startSongId);
      stateRef.current = { ...stateRef.current, playerState: { ...stateRef.current.playerState, queue: nextQueue } };
      setPlayerState((prev) => ({ ...prev, queue: nextQueue }));
      if (hasSupabaseConfig && context?.collectionType === 'playlist' && context.collectionId) {
        supabaseApi.incrementCollectionPlayCount(context.collectionId).catch(() => {});
      }
      playSong(startSongId);
    },
    [playSong]
  );

  const playCollection = playContext;

  const playNext = useCallback((songId: string) => {
    setPlayerState((prev) => {
      const withoutSong = prev.queue.filter((id) => id !== songId);
      const currentIndex = withoutSong.indexOf(prev.currentSongId ?? '');
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
      const queue = [...withoutSong];
      queue.splice(insertAt, 0, songId);
      return { ...prev, queue };
    });
  }, []);

  const playLater = useCallback((songId: string) => {
    setPlayerState((prev) => ({
      ...prev,
      queue: [...prev.queue.filter((id) => id !== songId), songId],
    }));
  }, []);

  const moveQueueItem = useCallback((songId: string, targetIndex: number) => {
    setPlayerState((prev) => {
      const sourceIndex = prev.queue.indexOf(songId);
      if (sourceIndex < 0) return prev;
      const queue = [...prev.queue];
      queue.splice(sourceIndex, 1);
      queue.splice(Math.max(0, Math.min(queue.length, targetIndex)), 0, songId);
      return { ...prev, queue };
    });
  }, []);

  const reorderQueue = useCallback((songIds: string[]) => {
    const knownIds = new Set(stateRef.current.songs.map((song) => song.id));
    setPlayerState((prev) => {
      const queue = Array.from(new Set(songIds.filter((id) => knownIds.has(id))));
      return queue.length === prev.queue.length ? { ...prev, queue } : prev;
    });
  }, []);

  const nextSong = useCallback(() => {
    const { queue, currentSongId, playbackMode } = stateRef.current.playerState;
    if (queue.length === 0) return;

    if (playbackMode === 'repeat-one' && currentSongId) {
      playSong(currentSongId);
      return;
    }

    if (playbackMode === 'shuffle' && queue.length > 1) {
      const candidates = queue.filter((id) => id !== currentSongId);
      const nextId = candidates[Math.floor(Math.random() * candidates.length)];
      playSong(nextId);
      return;
    }

    const currentIndex = queue.indexOf(currentSongId || '');
    const nextIndex = (currentIndex + 1) % queue.length;
    playSong(queue[nextIndex]);
  }, [playSong]);

  const nextSongRef = useRef(nextSong);
  useEffect(() => { nextSongRef.current = nextSong; }, [nextSong]);

  const prevSong = useCallback(() => {
    const { queue, currentSongId, playbackMode } = stateRef.current.playerState;
    if (queue.length === 0) return;

    if (playbackMode === 'repeat-one' && currentSongId) {
      playSong(currentSongId);
      return;
    }

    if (playbackMode === 'shuffle' && queue.length > 1) {
      const candidates = queue.filter((id) => id !== currentSongId);
      const prevId = candidates[Math.floor(Math.random() * candidates.length)];
      playSong(prevId);
      return;
    }

    const currentIndex = queue.indexOf(currentSongId || '');
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    playSong(queue[prevIndex]);
  }, [playSong]);

  const cyclePlaybackMode = useCallback(() => {
    setPlayerState((prev) => {
      const currentIndex = PLAYBACK_MODE_SEQUENCE.indexOf(prev.playbackMode);
      const nextMode = PLAYBACK_MODE_SEQUENCE[(currentIndex + 1) % PLAYBACK_MODE_SEQUENCE.length];
      return { ...prev, playbackMode: nextMode };
    });
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      const audio = audioRef.current;
      const { songs, playerState } = stateRef.current;
      const currentSong = songs.find((s) => s.id === playerState.currentSongId);
      const min = currentSong?.trimStart ?? 0;
      const max = currentSong?.trimEnd ?? Number.POSITIVE_INFINITY;
      const clamped = Math.max(min, Math.min(max, time));
      audio.currentTime = clamped;
      setPlayerState(prev => ({ ...prev, currentTime: clamped }));
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) {
      audioRef.current.volume = v;
      setPlayerState(prev => ({ ...prev, volume: v }));
    }
  }, []);

  const toggleFavorite = useCallback(async (songId: string) => {
    const previous = favoriteSongIdsRef.current;
    const exists = previous.includes(songId);
    const next = exists ? previous.filter((id) => id !== songId) : [songId, ...previous];

    favoriteSongIdsRef.current = next;
    setFavoriteSongIds(next);

    if (!hasSupabaseConfig || !user) return;

    try {
      if (exists) {
        await supabaseApi.removeFavorite(user.id, songId);
      } else {
        await supabaseApi.addFavorite(user.id, songId);
      }
    } catch (e) {
      console.error('Favorite update failed:', e);
      favoriteSongIdsRef.current = previous;
      setFavoriteSongIds(previous);
      feedback.error('收藏状态同步失败，已恢复原状态');
    }
  }, [user]);

  const isFavorite = useCallback((songId: string) => favoriteSongIds.includes(songId), [favoriteSongIds]);

  const addSong = useCallback((song: Song) => {
    setSongs(prev => {
      const next = [song, ...prev];
      return next.sort((a, b) => {
        const pinA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
        const pinB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
        if (pinA !== pinB) return pinB - pinA;
        return b.addedAt - a.addedAt;
      });
    });
    setPlayerState(prev => ({...prev, queue: [song.id, ...prev.queue]}));
  }, []);

  const patchSongs = useCallback((songIds: string[], updates: Partial<Song>) => {
    if (!songIds.length) return;
    const ids = new Set(songIds);
    setSongs((prev) => prev.map((song) => (ids.has(song.id) ? { ...song, ...updates } : song)));
  }, []);

  const setSkin = useCallback((skin: PlayerSkin) => {
    setPlayerState(prev => ({ ...prev, skin }));
  }, []);

  const removeFromQueue = useCallback((songId: string) => {
    setPlayerState(prev => ({
      ...prev,
      queue: prev.queue.filter(id => id !== songId)
    }));
  }, []);

  const getCurrentSong = useCallback(() => songs.find(s => s.id === playerState.currentSongId), [songs, playerState.currentSongId]);

  const updateSong = useCallback(async (songId: string, updates: Partial<Song>, options?: { syncAlbumByTitle?: boolean }) => {
    const normalizedUpdates: Partial<Song> =
      updates.isPublic !== undefined && updates.visibility === undefined
        ? { ...updates, visibility: updates.isPublic ? 'public' : 'private' }
        : updates;
    const previousSongs = stateRef.current.songs;
    const previousSong = previousSongs.find((song) => song.id === songId);
    // Optimistic update
    setSongs(prev => {
        const next = prev.map(s => s.id === songId ? { ...s, ...normalizedUpdates } : s);
        // Re-sort if pinnedAt changed
        if (normalizedUpdates.pinnedAt !== undefined) {
            return next.sort((a, b) => {
                const pinA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
                const pinB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
                if (pinA !== pinB) return pinB - pinA;
                return b.addedAt - a.addedAt;
            });
        }
        return next;
    });

    if (hasSupabaseConfig) {
      const toRowUpdates = (songUpdates: Partial<Song>) => {
        const rowUpdates: any = {};
        if (songUpdates.title !== undefined) rowUpdates.title = songUpdates.title;
        if (songUpdates.artist !== undefined) rowUpdates.artist = songUpdates.artist;
        if (songUpdates.album !== undefined) rowUpdates.album = songUpdates.album;
        if (songUpdates.genre !== undefined) rowUpdates.genre = songUpdates.genre;
        if (songUpdates.story !== undefined) rowUpdates.story = songUpdates.story;
        if (songUpdates.coverPath !== undefined) rowUpdates.cover_path = songUpdates.coverPath;
        if (songUpdates.isPublic !== undefined) {
          rowUpdates.is_public = songUpdates.isPublic;
          rowUpdates.visibility = songUpdates.isPublic ? 'public' : 'private';
        }
        if (songUpdates.pinnedAt !== undefined) rowUpdates.pinned_at = songUpdates.pinnedAt;
        return rowUpdates;
      };

      const rowUpdates = toRowUpdates(normalizedUpdates);

      try {
        if (Object.keys(rowUpdates).length > 0) {
          await supabaseApi.updateSong(songId, rowUpdates);
        }
        if (options?.syncAlbumByTitle !== false && Object.prototype.hasOwnProperty.call(normalizedUpdates, 'album')) {
          await supabaseApi.syncSongAlbumByTitle(songId, normalizedUpdates.album ?? null);
        }
      } catch (error) {
        setSongs(previousSongs);
        if (previousSong) {
          const rollback: Partial<Song> = {};
          if (normalizedUpdates.title !== undefined) rollback.title = previousSong.title;
          if (normalizedUpdates.artist !== undefined) rollback.artist = previousSong.artist;
          if (normalizedUpdates.album !== undefined) rollback.album = previousSong.album;
          if (normalizedUpdates.genre !== undefined) rollback.genre = previousSong.genre;
          if (normalizedUpdates.story !== undefined) rollback.story = previousSong.story;
          if (normalizedUpdates.coverPath !== undefined) rollback.coverPath = previousSong.coverPath;
          if (normalizedUpdates.isPublic !== undefined) rollback.isPublic = previousSong.isPublic;
          if (normalizedUpdates.pinnedAt !== undefined) rollback.pinnedAt = previousSong.pinnedAt;

          const rollbackRowUpdates = toRowUpdates(rollback);
          if (Object.keys(rollbackRowUpdates).length > 0) {
            await supabaseApi.updateSong(songId, rollbackRowUpdates).catch(() => {});
          }
          if (options?.syncAlbumByTitle !== false && Object.prototype.hasOwnProperty.call(normalizedUpdates, 'album')) {
            await supabaseApi.syncSongAlbumByTitle(songId, previousSong.album ?? null).catch(() => {});
          }
        }
        throw error;
      }
    }
  }, []);

  const deleteSong = useCallback(async (songId: string) => {
    if (!user) return;
    const previousSongs = stateRef.current.songs;
    const previousPlayerState = stateRef.current.playerState;
    const previousFavorites = favoriteSongIds;

    try {
      // Optimistic update
      setSongs(prev => prev.filter(s => s.id !== songId));
      setFavoriteSongIds(prev => prev.filter(id => id !== songId));
      setPlayerState(prev => ({
        ...prev,
        queue: prev.queue.filter(id => id !== songId),
        // Stop if deleting current song
        ...(prev.currentSongId === songId ? { currentSongId: null, isPlaying: false, isAudioLoading: false } : {})
      }));

      // Call API
      if (hasSupabaseConfig) {
        await supabaseApi.deleteSong(songId, user.id);
      } else {
        await localLibraryStorage.removeSong(songId);
      }
    } catch (e) {
      console.error("Delete failed:", e);
      setSongs(previousSongs);
      setFavoriteSongIds(previousFavorites);
      setPlayerState(previousPlayerState);
      feedback.error('删除失败，已恢复本地列表');
    }
  }, [favoriteSongIds, user]);

  return (
    <AppContext.Provider value={{ 
      songs, 
      comments,
      commentsLoading,
      commentsStatus,
      commentsError,
      commentsHasMore,
      commentsLoadingMore,
      commentSort,
      commentsSchemaReady,
      favoriteSongIds,
      playerState, 
      playSong, 
      playContext,
      playCollection,
      playNext,
      playLater,
      moveQueueItem,
      reorderQueue,
      togglePlay, 
      nextSong, 
      prevSong, 
      cyclePlaybackMode,
      seek, 
      setVolume,
      addSong,
      patchSongs,
      addComment,
      deleteComment,
      retryComments,
      loadMoreComments,
      setCommentSort,
      setSkin,
      getCurrentSong,
      removeFromQueue,
      deleteSong,
      updateSong,
      toggleFavorite,
      isFavorite,
      toggleCommentLike
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useStore must be used within AppProvider");
  return context;
};
