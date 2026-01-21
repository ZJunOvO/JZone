import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { Song } from '../types';
import { uploadDraftStorage } from '../uploadDraftStorage';
import { localLibraryStorage } from '../localLibraryStorage';
import { useAuth } from '../auth';
import { hasSupabaseConfig } from '../supabaseClient';
import { supabaseApi } from '../supabaseApi';

const WaveformCropper = ({ 
    duration, 
    range, 
    setRange, 
    currentTime, 
    onSeek 
}: { 
    duration: number, 
    range: [number, number], 
    setRange: (r: [number, number]) => void,
    currentTime: number,
    onSeek: (t: number) => void
}) => {
    const bars = 50;
    const containerRef = useRef<HTMLDivElement>(null);
    
    const startPct = (range[0] / duration) * 100;
    const endPct = (range[1] / duration) * 100;
    const playheadPct = (currentTime / duration) * 100;

    const handleContainerClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedTime = (x / rect.width) * duration;
        onSeek(clickedTime);
    };

    const handleDrag = (index: 0 | 1, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const newTime = (x / rect.width) * duration;

            if (index === 0) {
                if (newTime < range[1] - 1) setRange([newTime, range[1]]);
            } else {
                if (newTime > range[0] + 1) setRange([range[0], newTime]);
            }
        };

        const stopMove = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', stopMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', stopMove);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', stopMove);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', stopMove);
    };
    
    return (
        <div 
            ref={containerRef}
            className="h-32 bg-zinc-900 rounded-lg relative overflow-hidden flex items-center justify-between px-2 gap-[2px] select-none touch-none border border-zinc-800 cursor-crosshair"
            onClick={handleContainerClick}
        >
            {/* Waveform Bars */}
            {Array.from({length: bars}).map((_, i) => (
                <div 
                    key={i} 
                    className="flex-1 bg-zinc-700 rounded-full opacity-30" 
                    style={{ height: `${Math.random() * 80 + 20}%` }}
                ></div>
            ))}

            {/* Selected Range Overlay */}
            <div 
                className="absolute top-0 bottom-0 bg-red-500/10 border-x border-red-500/30"
                style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
            ></div>

            {/* Playhead Line */}
            <div 
                className="absolute top-0 bottom-0 w-[2px] bg-white z-20 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                style={{ left: `${playheadPct}%` }}
            ></div>

            {/* Drag Handles */}
            <div 
                onMouseDown={(e) => handleDrag(0, e)}
                onTouchStart={(e) => handleDrag(0, e)}
                className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group" 
                style={{ left: `${startPct}%` }}
            >
                <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50"></div>
            </div>
            <div 
                onMouseDown={(e) => handleDrag(1, e)}
                onTouchStart={(e) => handleDrag(1, e)}
                className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group" 
                style={{ left: `${endPct}%` }}
            >
                <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50"></div>
            </div>
        </div>
    );
};

export const Upload: React.FC = () => {
  const { addSong, songs, playSong, playerState } = useStore();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewMime, setPreviewMime] = useState<string>('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [coverUrl, setCoverUrl] = useState(`https://picsum.photos/seed/${Math.random()}/400/400`);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(240);
  const [range, setRange] = useState<[number, number]>([0, 240]);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string>('');
  const coverUrlRef = useRef<string>('');

  const myUploads = songs.filter((s) => (s.ownerId ? s.ownerId === user?.id : s.uploadedBy === 'Me'));

  const guessAudioMime = (filename: string) => {
    const idx = filename.lastIndexOf('.');
    const ext = idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'amr') return 'audio/amr';
    return '';
  };

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    
    const updateTime = () => {
      setCurrentPreviewTime(audio.currentTime);
      if (step === 2 && !audio.paused && Number.isFinite(range[1]) && audio.currentTime >= range[1]) {
        audio.pause();
      }
    };
    audio.addEventListener('timeupdate', updateTime);
    return () => audio.removeEventListener('timeupdate', updateTime);
  }, [range, step]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    if (!previewUrl) return;
    audio.load();
  }, [previewUrl]);

  useEffect(() => {
    coverUrlRef.current = coverUrl;
  }, [coverUrl]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const [draftMeta, draftAudio, draftCover] = await Promise.all([
        uploadDraftStorage.getMeta().catch(() => null),
        uploadDraftStorage.getAudio().catch(() => null),
        uploadDraftStorage.getCover().catch(() => null),
      ]);

      if (cancelled) return;

      if (draftMeta) {
        setTitle(draftMeta.title ?? '');
        setArtist(draftMeta.artist ?? '');
        setAlbum(draftMeta.album ?? '');
        if (typeof draftMeta.duration === 'number' && Number.isFinite(draftMeta.duration) && draftMeta.duration > 0) {
          setDuration(draftMeta.duration);
        }
        if (
          draftMeta.range &&
          Array.isArray(draftMeta.range) &&
          draftMeta.range.length === 2 &&
          Number.isFinite(draftMeta.range[0]) &&
          Number.isFinite(draftMeta.range[1])
        ) {
          setRange(draftMeta.range as [number, number]);
        }
      }

      if (draftAudio) {
        setFile(draftAudio);
        const url = URL.createObjectURL(draftAudio);
        setPreviewUrl(url);
        setStep(2);
      }

      if (draftCover) {
        setCoverFile(draftCover);
        const url = URL.createObjectURL(draftCover);
        setCoverUrl(url);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    uploadDraftStorage.setMeta({ title, artist, album, duration, range }).catch(() => {});
  }, [album, artist, duration, range, title]);

  const resetDraft = () => {
    uploadDraftStorage.clearAll().catch(() => {});
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    setPreviewUrl('');
    setPreviewMime('');
    setFile(null);
    setTitle('');
    setArtist('');
    setAlbum('');
    setDuration(240);
    setRange([0, 240]);
    setCurrentPreviewTime(0);
    setCoverFile(null);
    setCoverUrl(`https://picsum.photos/seed/${Math.random()}/400/400`);
    setStep(1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setPreviewError(null);
      setFile(selectedFile);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const mime = selectedFile.type || guessAudioMime(selectedFile.name);
      setPreviewMime(mime);
      const previewBlob = mime ? selectedFile.slice(0, selectedFile.size, mime) : selectedFile;
      const url = URL.createObjectURL(previewBlob);
      setPreviewUrl(url);
      uploadDraftStorage.setAudio(selectedFile).catch(() => {});
      setStep(2);

      // Auto-extract metadata from filename
      const nameParts = selectedFile.name.replace(/\.[^/.]+$/, "").split('-');
      if (nameParts.length > 1) {
          setArtist(nameParts[0].trim());
          setTitle(nameParts[1].trim());
      } else {
          setTitle(nameParts[0]);
      }
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
        const url = URL.createObjectURL(file);
        setCoverUrl(url);
        setCoverFile(file);
        uploadDraftStorage.setCover(file).catch(() => {});
    }
  };

  const playPreviewSection = () => {
    if (audioPreviewRef.current) {
        const audio = audioPreviewRef.current;
        setPreviewError(null);
        const startTime = range[0];

        const start = async () => {
          if (audio.readyState === 0) audio.load();
          await new Promise<void>((resolve) => {
            if (audio.readyState >= 1) return resolve();
            const onLoaded = () => {
              audio.removeEventListener('loadedmetadata', onLoaded);
              resolve();
            };
            audio.addEventListener('loadedmetadata', onLoaded);
          });
          audio.currentTime = Number.isFinite(startTime) ? startTime : 0;
          await audio.play();
        };

        start().catch((e) => {
          const detail =
            typeof e?.message === 'string'
              ? e.message
              : audio.error?.code
                ? `MediaError(${audio.error.code})`
                : '未知错误';
          setPreviewError(`无法播放预览：${detail}`);
        });
    }
  };

  const handleSeek = (time: number) => {
      if (audioPreviewRef.current) {
          audioPreviewRef.current.currentTime = time;
          setCurrentPreviewTime(time);
      }
  };

  const handleSave = async () => {
    if (!file) return;
    if (isSaving) return;
    setPreviewError(null);
    setSaveError(null);
    setIsSaving(true);

    try {
      if (hasSupabaseConfig && user) {
        const row = await supabaseApi.uploadAndCreateSong({
          userId: user.id,
          title: title || '未命名',
          artist: artist || '未知艺人',
          album: album || '未知专辑',
          duration: duration,
          trimStart: range[0],
          trimEnd: range[1],
          audioFile: file,
          coverFile: coverFile ?? undefined,
          visibility: 'private',
        });

        let signedCoverUrl = coverUrl;
        if (row.cover_path) {
          try {
            signedCoverUrl = await supabaseApi.createSignedCoverUrl(row.cover_path);
          } catch {}
        }

        const newSong: Song = {
          id: row.id,
          title: row.title,
          artist: row.artist,
          album: row.album ?? undefined,
          coverUrl: signedCoverUrl,
          audioUrl: '',
          audioPath: row.audio_path,
          coverPath: row.cover_path ?? undefined,
          ownerId: row.owner_id,
          visibility: row.visibility,
          duration: row.duration,
          trimStart: row.trim_start,
          trimEnd: row.trim_end,
          uploadedBy: 'Me',
          addedAt: new Date(row.created_at).getTime(),
        };

        addSong(newSong);
        alert('歌曲已成功保存！');
        resetDraft();
        setIsSaving(false);
        return;
      }

      const songId = Math.random().toString(36).substr(2, 9);
      const persistedMeta = {
        id: songId,
        title: title || '未命名',
        artist: artist || '未知艺人',
        album: album || '未知专辑',
        duration: duration,
        trimStart: range[0],
        trimEnd: range[1],
        uploadedBy: 'Me',
        addedAt: Date.now(),
        coverUrl: coverFile ? undefined : coverUrl,
      };

      localLibraryStorage.saveSong({ meta: persistedMeta, audioFile: file, coverFile: coverFile ?? undefined }).catch(() => {});

      const songAudioUrl = URL.createObjectURL(file);
      const songCoverUrl = coverFile ? URL.createObjectURL(coverFile) : coverUrl;

      const newSong: Song = {
        id: songId,
        title: persistedMeta.title,
        artist: persistedMeta.artist,
        album: persistedMeta.album,
        coverUrl: songCoverUrl,
        audioUrl: songAudioUrl,
        duration: duration,
        trimStart: range[0],
        trimEnd: range[1],
        uploadedBy: 'Me',
        addedAt: persistedMeta.addedAt,
      };
      addSong(newSong);
      alert('歌曲已成功保存！');
      resetDraft();
    } catch (e: any) {
      setSaveError(e?.message || '保存失败（请确认已创建 songs 表、storage bucket 与 RLS 策略）');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pb-32 pt-14 px-6 space-y-10 min-h-screen">
      <div>
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">上传音乐</h1>
      </div>

      {step === 1 && (
        <div className="border-2 border-dashed border-zinc-800 rounded-[28px] p-8 flex flex-col items-center justify-center h-56 bg-zinc-900/30 hover:bg-zinc-900/50 transition group">
            <input 
                type="file" 
                accept="audio/*,.m4a,.mp4,.flac,.amr" 
                onChange={handleFileChange} 
                className="hidden" 
                id="audio-upload"
            />
            <label htmlFor="audio-upload" className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
                    <Icons.Upload className="text-white" size={24} />
                </div>
                <span className="text-zinc-300 font-bold">点击选择音频文件</span>
                <span className="text-zinc-500 text-[11px] mt-2 font-medium tracking-wide">MP3 / M4A / MP4 / WAV / FLAC / AMR</span>
            </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8 animate-[fadeIn_0.3s_ease-out] bg-zinc-900/50 p-6 rounded-[28px] border border-white/5 shadow-2xl">
            {/* Song Cover & File Info */}
            <div className="flex items-center gap-6">
                <div className="relative group shrink-0">
                    <img src={coverUrl} className="w-24 h-24 rounded-2xl object-cover bg-zinc-800 shadow-xl ring-1 ring-white/10" alt="Cover" />
                    <label htmlFor="cover-upload" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-2xl cursor-pointer">
                        <Icons.PlusCircle size={20} className="text-white mb-1" />
                        <span className="text-[10px] text-white font-bold">更换封面</span>
                    </label>
                    <input type="file" id="cover-upload" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </div>
                <div className="overflow-hidden space-y-1">
                    <p className="text-xs font-bold text-red-500 uppercase tracking-widest">正在编辑</p>
                    <p className="text-base font-bold text-white truncate">{file?.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{(file ? file.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
                </div>
            </div>

            {/* Cropper Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">裁剪选段</label>
                    <button onClick={playPreviewSection} className="text-[11px] font-bold text-red-500 flex items-center gap-1.5 px-3 py-1 bg-red-500/10 rounded-full active:scale-95 transition">
                        <Icons.Play size={12} fill="currentColor" /> 播放选段
                    </button>
                </div>
                <WaveformCropper 
                    duration={duration} 
                    range={range} 
                    setRange={setRange} 
                    currentTime={currentPreviewTime}
                    onSeek={handleSeek}
                />
                <div className="grid grid-cols-3 text-[10px] text-zinc-500 font-mono font-bold tracking-tight">
                    <div className="text-left">IN: {range[0].toFixed(1)}s</div>
                    <div className="text-center text-red-500/80">LENGTH: {(range[1] - range[0]).toFixed(1)}s</div>
                    <div className="text-right">OUT: {range[1].toFixed(1)}s</div>
                </div>
                <audio 
                    ref={audioPreviewRef} 
                    preload="metadata"
                    playsInline
                    onError={(e) => {
                      const a = e.currentTarget;
                      const code = a.error?.code ? `MediaError(${a.error.code})` : 'unknown';
                      setPreviewError(`音频加载失败：${code}`);
                    }}
                    onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        setDuration(dur);
                        setRange([0, dur]);
                    }}
                >
                  <source src={previewUrl} type={previewMime || undefined} />
                </audio>
            </div>

            {/* Metadata Forms */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">歌曲标题</label>
                        <input 
                            type="text" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)}
                            className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                            placeholder="例如：My New Song"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">艺人</label>
                            <input 
                                type="text" 
                                value={artist}
                                onChange={e => setArtist(e.target.value)}
                                className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                                placeholder="艺术家名称"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">专辑</label>
                            <input 
                                type="text" 
                                value={album}
                                onChange={e => setAlbum(e.target.value)}
                                className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                                placeholder="所属专辑"
                            />
                        </div>
                    </div>
                    {/* TODO: Add Genre, Year, Lyrics tags for future compatibility */}
                </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
                {previewError && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                    {previewError}
                  </div>
                )}
                {saveError && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                    {saveError}
                  </div>
                )}
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all ${
                      isSaving ? 'bg-zinc-800 text-zinc-500 shadow-none' : 'bg-red-600 shadow-red-600/20'
                    }`}
                >
                    {isSaving ? '上传中...' : '确认保存至资料库'}
                </button>
                <button 
                    onClick={resetDraft}
                    className="w-full text-zinc-500 text-[11px] font-bold py-2 hover:text-white transition uppercase tracking-widest"
                >
                    弃置并重新选择
                </button>
            </div>
        </div>
      )}

      {/* "My Uploads" Media List */}
      <section className="space-y-5">
          <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-white tracking-tight">我的上传</h2>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{myUploads.length} TRACKS</span>
          </div>

          <div className="space-y-2">
              {myUploads.length === 0 ? (
                  <div className="py-12 text-center bg-zinc-900/20 rounded-[28px] border border-white/5 border-dashed">
                      <p className="text-zinc-600 text-sm italic">快去上传你的第一份创作吧</p>
                  </div>
              ) : (
                  myUploads.map((song) => (
                      <div 
                          key={song.id} 
                          onClick={() => playSong(song.id)}
                          className={`flex items-center p-3 rounded-2xl cursor-pointer hover:bg-zinc-900 transition-all active:scale-[0.98] group ${playerState.currentSongId === song.id ? 'bg-zinc-900/80 ring-1 ring-white/5 shadow-xl shadow-black/40' : ''}`}
                      >
                          <div className="relative w-12 h-12 shrink-0 mr-4">
                              <img src={song.coverUrl} className="w-full h-full rounded-lg object-cover bg-zinc-800 shadow-md border border-white/5" alt="art" />
                              {playerState.currentSongId === song.id && playerState.isPlaying && (
                                  <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                                      <div className="flex gap-[2.5px] items-end h-3">
                                          <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                                          <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
                                          <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                                      </div>
                                  </div>
                              )}
                          </div>
                          
                          <div className="flex-1 overflow-hidden">
                              <h4 className={`text-sm font-bold truncate tracking-tight ${playerState.currentSongId === song.id ? 'text-red-500' : 'text-zinc-100'}`}>
                                  {song.title}
                              </h4>
                              <p className="text-[11px] text-zinc-500 truncate font-bold mt-0.5 opacity-80">{song.artist} • {song.album}</p>
                          </div>
                          
                          <div className="text-right ml-4 px-2">
                              <p className="text-[9px] text-zinc-600 font-black uppercase tracking-tighter mb-0.5">PLAYS</p>
                              <p className="text-[13px] font-mono text-zinc-400 font-bold tracking-tighter">{(song.playsCount ?? 0).toLocaleString()}</p>
                          </div>
                      </div>
                  ))
              )}
          </div>
      </section>
    </div>
  );
};
