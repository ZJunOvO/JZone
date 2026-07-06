import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Song, PlayerState, PlayerSkin, Comment } from './types';
import { MOCK_SONGS, MOCK_COMMENTS } from './constants';
import { localLibraryStorage } from './localLibraryStorage';
import { hasSupabaseConfig } from './supabaseClient';
import { useAuth } from './auth';
import { supabaseApi } from './supabaseApi';

interface AppContextType {
  songs: Song[];
  comments: Comment[];
  playerState: PlayerState;
  favoriteSongIds: string[];
  // Actions
  playSong: (songId: string) => void;
  playCollection: (songIds: string[], startSongId: string, context?: { collectionId?: string; collectionType?: 'album' | 'playlist' }) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  addSong: (song: Song) => void;
  addComment: (comment: Comment) => void;
  setSkin: (skin: PlayerSkin) => void;
  getCurrentSong: () => Song | undefined;
  removeFromQueue: (songId: string) => void;
  deleteSong: (songId: string) => Promise<void>;
  updateSong: (songId: string, updates: Partial<Song>) => Promise<void>;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const [songs, setSongs] = useState<Song[]>(hasSupabaseConfig ? [] : MOCK_SONGS);
  const [comments, setComments] = useState<Comment[]>(hasSupabaseConfig ? [] : MOCK_COMMENTS);
  const [favoriteSongIds, setFavoriteSongIds] = useState<string[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentSongId: null,
    isPlaying: false,
    currentTime: 0,
    volume: 0.75,
    queue: hasSupabaseConfig ? [] : MOCK_SONGS.map(s => s.id),
    skin: 'coverflow',
  });
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
    setComments([]);
    setPlayerState((prev) => ({
      ...prev,
      currentSongId: null,
      isPlaying: false,
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
      const parsed = JSON.parse(raw) as { songs?: Song[] };
      if (!parsed?.songs?.length) return;
      setSongs(parsed.songs);
      setPlayerState((prev) => ({ ...prev, queue: parsed.songs!.map((s) => s.id) }));
    } catch {}
  }, [songs.length, status, user]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;
    if (!songs.length) return;
    try {
      localStorage.setItem(`${SONGS_CACHE_PREFIX}${user.id}`, JSON.stringify({ songs }));
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
    if (loadedSongsForUserRef.current === user.id && stateRef.current.songs.length) return;
    if (
      loadedSongsForUserRef.current === user.id &&
      stateRef.current.songs.length &&
      Date.now() - lastSongsFetchAtRef.current < 60_000
    ) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      const rows = await supabaseApi.fetchSongs();
      if (cancelled) return;

      const prevById = new Map(stateRef.current.songs.map((s) => [s.id, s] as const));
      const mapped: Song[] = await Promise.all(
        rows.map(async (r) => {
          const prev = prevById.get(r.id);
          let coverUrl = `https://picsum.photos/seed/${r.id}/400/400`;
          
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
            audioPath: r.audio_path,
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
      setComments([]);
      loadedSongsForUserRef.current = user.id;
      lastSongsFetchAtRef.current = Date.now();
    };

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const playSeqRef = useRef(0);
  
  // Refs for event handlers to avoid dependency cycles while keeping latest state access
  const stateRef = useRef({ songs, playerState });
  
  useEffect(() => {
    stateRef.current = { songs, playerState };
  }, [songs, playerState]);

  // Initialize Audio Logic
  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.volume = 0.75;
        audioRef.current.preload = 'metadata';
    }
    const audio = audioRef.current;

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
        audio.play().catch(() => {});
      }
    };

    const handleEnded = () => {
       if (nextSongRef.current) {
           nextSongRef.current();
       }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
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

    // If same song, just toggle
    if (playerState.currentSongId === songId) {
        togglePlay();
        return;
    }

    // Resetting src cancels any pending play()
    audio.pause();
    setPlayerState(prev => ({ ...prev, currentSongId: songId, isPlaying: false, currentTime: song.trimStart || 0 }));

    let src = song.audioUrl;
    if (hasSupabaseConfig && song.audioPath) {
      try {
        src = await supabaseApi.createSignedAudioUrl(song.audioPath);
      } catch {
        if (!src) {
          alert('音频加载失败：请检查 Storage bucket 名称与读取策略（SELECT）。');
          return;
        }
      }
    }

    audio.src = src;
    audio.load();

    try {
      await new Promise<void>((resolve, reject) => {
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
      });
    } catch (e: any) {
      const code = audio.error?.code ? `MediaError(${audio.error.code})` : 'unknown';
      const detail = typeof e?.message === 'string' ? e.message : code;
      alert(`音频加载失败：${detail}`);
      return;
    }

    if (seq !== playSeqRef.current) return;

    audio.currentTime = song.trimStart || 0;
    
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      if (seq !== playSeqRef.current) return;
      setPlayerState(prev => ({ ...prev, currentSongId: songId, isPlaying: true }));
      if (hasSupabaseConfig) {
        supabaseApi.incrementSongPlay(songId).catch(() => {});
        supabaseApi.incrementUserSongPlay(songId).catch(() => {});
        setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, playsCount: (s.playsCount ?? 0) + 1 } : s)));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Expected when src changes rapidly
        console.debug("Playback interrupted by new load request");
      } else {
        console.error("Playback failed:", error);
      }
    }
  }, [togglePlay]);

  const playCollection = useCallback(
    (songIds: string[], startSongId: string, context?: { collectionId?: string; collectionType?: 'album' | 'playlist' }) => {
      const nextQueue = songIds.filter(Boolean);
      stateRef.current = { ...stateRef.current, playerState: { ...stateRef.current.playerState, queue: nextQueue } };
      setPlayerState((prev) => ({ ...prev, queue: nextQueue }));
      if (hasSupabaseConfig && context?.collectionType === 'playlist' && context.collectionId) {
        supabaseApi.incrementCollectionPlayCount(context.collectionId).catch(() => {});
      }
      playSong(startSongId);
    },
    [playSong]
  );

  const nextSong = useCallback(() => {
    const { queue, currentSongId } = stateRef.current.playerState;
    if (queue.length === 0) return;
    const currentIndex = queue.indexOf(currentSongId || '');
    const nextIndex = (currentIndex + 1) % queue.length;
    playSong(queue[nextIndex]);
  }, [playSong]);

  const nextSongRef = useRef(nextSong);
  useEffect(() => { nextSongRef.current = nextSong; }, [nextSong]);

  const prevSong = useCallback(() => {
    const { queue, currentSongId } = stateRef.current.playerState;
    if (queue.length === 0) return;
    const currentIndex = queue.indexOf(currentSongId || '');
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    playSong(queue[prevIndex]);
  }, [playSong]);

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

  const toggleFavorite = useCallback((songId: string) => {
    setFavoriteSongIds((prev) => {
      const exists = prev.includes(songId);
      const next = exists ? prev.filter((id) => id !== songId) : [songId, ...prev];
      if (hasSupabaseConfig && user) {
        if (exists) {
          supabaseApi.removeFavorite(user.id, songId).catch(() => {});
        } else {
          supabaseApi.addFavorite(user.id, songId).catch(() => {});
        }
      }
      return next;
    });
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

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    if (status !== 'signed_in' || !user) return;
    if (!playerState.currentSongId) return;

    let cancelled = false;
    supabaseApi
      .fetchComments(playerState.currentSongId)
      .then((rows) => {
        if (cancelled) return;
        setComments(
          rows.map((r) => ({
            id: r.id,
            songId: r.song_id,
            userId: r.user_id,
            username: r.username,
            avatarUrl: r.avatar_url,
            text: r.text,
            timestamp: new Date(r.created_at).getTime(),
            playbackTime: r.playback_time,
            likes: 0,
          }))
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [playerState.currentSongId, status, user]);

  const addComment = useCallback((comment: Comment) => {
    setComments(prev => [comment, ...prev]);

    if (!hasSupabaseConfig) return;
    if (!user) return;

    supabaseApi
      .insertComment({
        songId: comment.songId,
        userId: user.id,
        username: user.email || 'Member',
        avatarUrl: comment.avatarUrl,
        text: comment.text,
        playbackTime: comment.playbackTime,
      })
      .then((row) => {
        setComments((prev) => {
          const next: Comment[] = prev.filter((c) => c.id !== comment.id);
          next.unshift({
            id: row.id,
            songId: row.song_id,
            userId: row.user_id,
            username: row.username,
            avatarUrl: row.avatar_url,
            text: row.text,
            timestamp: new Date(row.created_at).getTime(),
            playbackTime: row.playback_time,
            likes: 0,
          });
          return next;
        });
      })
      .catch(() => {});
  }, [user]);

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

  const updateSong = useCallback(async (songId: string, updates: Partial<Song>) => {
    const normalizedUpdates: Partial<Song> =
      updates.isPublic !== undefined && updates.visibility === undefined
        ? { ...updates, visibility: updates.isPublic ? 'public' : 'private' }
        : updates;
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
       const rowUpdates: any = {};
       if (normalizedUpdates.title !== undefined) rowUpdates.title = normalizedUpdates.title;
       if (normalizedUpdates.artist !== undefined) rowUpdates.artist = normalizedUpdates.artist;
       if (normalizedUpdates.album !== undefined) rowUpdates.album = normalizedUpdates.album;
       if (normalizedUpdates.genre !== undefined) rowUpdates.genre = normalizedUpdates.genre;
       if (normalizedUpdates.story !== undefined) rowUpdates.story = normalizedUpdates.story;
       if (normalizedUpdates.coverPath !== undefined) rowUpdates.cover_path = normalizedUpdates.coverPath;
       if (normalizedUpdates.isPublic !== undefined) {
         rowUpdates.is_public = normalizedUpdates.isPublic;
         rowUpdates.visibility = normalizedUpdates.isPublic ? 'public' : 'private';
       }
       if (normalizedUpdates.pinnedAt !== undefined) rowUpdates.pinned_at = normalizedUpdates.pinnedAt;
       
       if (Object.keys(rowUpdates).length > 0) {
           await supabaseApi.updateSong(songId, rowUpdates);
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
        ...(prev.currentSongId === songId ? { currentSongId: null, isPlaying: false } : {})
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
      alert('删除失败，已恢复本地列表，请稍后重试');
    }
  }, [favoriteSongIds, user]);

  return (
    <AppContext.Provider value={{ 
      songs, 
      comments,
      favoriteSongIds,
      playerState, 
      playSong, 
      playCollection,
      togglePlay, 
      nextSong, 
      prevSong, 
      seek, 
      setVolume,
      addSong,
      addComment,
      setSkin,
      getCurrentSong,
      removeFromQueue,
      deleteSong,
      updateSong,
      toggleFavorite,
      isFavorite
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
