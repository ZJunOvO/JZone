import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Song, PlayerState, PlayerSkin, Comment } from './types';
import { MOCK_SONGS, MOCK_COMMENTS } from './constants';

interface AppContextType {
  songs: Song[];
  comments: Comment[];
  playerState: PlayerState;
  // Actions
  playSong: (songId: string) => void;
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
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [songs, setSongs] = useState<Song[]>(MOCK_SONGS);
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentSongId: null,
    isPlaying: false,
    currentTime: 0,
    volume: 0.75,
    queue: MOCK_SONGS.map(s => s.id),
    skin: 'coverflow',
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  
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
    }
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime || 0 }));
      
      const { songs, playerState } = stateRef.current;
      const currentSong = songs.find(s => s.id === playerState.currentSongId);
      if (currentSong && audio.currentTime >= currentSong.trimEnd) {
           audio.currentTime = currentSong.trimStart;
           audio.play().catch(() => {}); // Ignore interruptions during loop
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
    audio.src = song.audioUrl;
    audio.currentTime = song.trimStart;
    
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      setPlayerState(prev => ({ ...prev, currentSongId: songId, isPlaying: true }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Expected when src changes rapidly
        console.debug("Playback interrupted by new load request");
      } else {
        console.error("Playback failed:", error);
      }
    }
  }, [togglePlay]);

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
      audioRef.current.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) {
      audioRef.current.volume = v;
      setPlayerState(prev => ({ ...prev, volume: v }));
    }
  }, []);

  const addSong = useCallback((song: Song) => {
    setSongs(prev => [song, ...prev]);
    setPlayerState(prev => ({...prev, queue: [song.id, ...prev.queue]}));
  }, []);

  const addComment = useCallback((comment: Comment) => {
    setComments(prev => [comment, ...prev]);
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

  return (
    <AppContext.Provider value={{ 
      songs, 
      comments,
      playerState, 
      playSong, 
      togglePlay, 
      nextSong, 
      prevSong, 
      seek, 
      setVolume,
      addSong,
      addComment,
      setSkin,
      getCurrentSong,
      removeFromQueue
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