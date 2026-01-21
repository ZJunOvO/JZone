import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';
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

interface UploadModalProps {
    onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ onClose }) => {
  const { addSong } = useStore();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [story, setStory] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
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

  const makePreviewBlob = (audioFile: File) => {
    const mime = audioFile.type || guessAudioMime(audioFile.name);
    if (!mime) return audioFile;
    if (audioFile.type === mime) return audioFile;
    return audioFile.slice(0, audioFile.size, mime);
  };

  const persistDraftAudio = (audioFile: File) => {
    const maxPersistBytes = 25 * 1024 * 1024;
    if (audioFile.size > maxPersistBytes) return;
    const fn = () => {
      uploadDraftStorage.setAudio(audioFile).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(fn, { timeout: 1500 });
      return;
    }
    window.setTimeout(fn, 0);
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

  // Restore draft logic...
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
        setGenre(draftMeta.genre ?? '');
        setStory(draftMeta.story ?? '');
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
        const url = URL.createObjectURL(makePreviewBlob(draftAudio));
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
    uploadDraftStorage.setMeta({ title, artist, album, genre, story, duration, range }).catch(() => {});
  }, [album, artist, duration, genre, range, story, title]);

  const resetDraft = () => {
    uploadDraftStorage.clearAll().catch(() => {});
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    setPreviewUrl('');
    setFile(null);
    setTitle('');
    setArtist('');
    setAlbum('');
    setGenre('');
    setStory('');
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
      const url = URL.createObjectURL(makePreviewBlob(selectedFile));
      setPreviewUrl(url);
      persistDraftAudio(selectedFile);
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
          genre: genre || undefined,
          story: story || undefined,
          fileSize: file.size,
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
          genre: row.genre ?? undefined,
          story: row.story ?? undefined,
          fileSize: typeof row.file_size === 'number' ? row.file_size : undefined,
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
        onClose(); // Close modal on success
        return;
      }

      const songId = Math.random().toString(36).substr(2, 9);
      const persistedMeta = {
        id: songId,
        title: title || '未命名',
        artist: artist || '未知艺人',
        album: album || '未知专辑',
        genre: genre || undefined,
        story: story || undefined,
        fileSize: file.size,
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
        genre: persistedMeta.genre,
        story: persistedMeta.story,
        fileSize: persistedMeta.fileSize,
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
      onClose(); // Close modal on success
    } catch (e: any) {
      setSaveError(e?.message || '保存失败（请确认已创建 songs 表、storage bucket 与 RLS 策略）');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl overflow-y-auto">
        <div className="min-h-screen px-6 py-12 pb-32 max-w-lg mx-auto relative">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-extrabold text-white tracking-tight">添加音乐</h2>
                <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition">
                    <Icons.X size={20} />
                </button>
            </div>

            {/* Content */}
            {step === 1 && (
                <div className="border-2 border-dashed border-zinc-800 rounded-[28px] p-8 flex flex-col items-center justify-center h-64 bg-zinc-900/30 hover:bg-zinc-900/50 transition group animate-in fade-in zoom-in duration-300">
                    <input 
                        type="file" 
                        accept="audio/*,.m4a,.mp4,.flac,.amr" 
                        onChange={handleFileChange} 
                        className="hidden" 
                        id="audio-upload-modal"
                    />
                    <label htmlFor="audio-upload-modal" className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                        <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
                            <Icons.Upload className="text-white" size={28} />
                        </div>
                        <span className="text-zinc-300 font-bold text-lg">点击选择音频文件</span>
                        <span className="text-zinc-500 text-xs mt-2 font-medium tracking-wide">MP3 / M4A / MP4 / WAV / FLAC / AMR</span>
                    </label>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300 bg-zinc-900/50 p-6 rounded-[28px] border border-white/5 shadow-2xl">
                    {/* Song Cover & File Info */}
                    <div className="flex items-center gap-6">
                        <div className="relative group shrink-0">
                            <img src={coverUrl} className="w-24 h-24 rounded-2xl object-cover bg-zinc-800 shadow-xl ring-1 ring-white/10" alt="Cover" />
                            <label htmlFor="cover-upload-modal" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-2xl cursor-pointer">
                                <Icons.PlusCircle size={20} className="text-white mb-1" />
                                <span className="text-[10px] text-white font-bold">更换封面</span>
                            </label>
                            <input type="file" id="cover-upload-modal" accept="image/*" onChange={handleCoverUpload} className="hidden" />
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
                        {/* TODO: 修复 M4A 文件在部分浏览器下的预览播放问题 (MediaError code 4) */}
                        <audio 
                            ref={audioPreviewRef} 
                            src={previewUrl || undefined}
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
                                setRange((prev) => {
                                  if (!Number.isFinite(prev[1]) || Math.abs(prev[1] - dur) > 1) {
                                    return [0, dur];
                                  }
                                  return prev;
                                });
                            }}
                        >
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
                            
                            <div className="rounded-2xl border border-white/5 bg-black/30">
                                <button
                                    type="button"
                                    onClick={() => setMoreOpen((prev) => !prev)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-zinc-300 font-bold text-xs uppercase tracking-widest"
                                >
                                    更多
                                    <span className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`}>
                                        <Icons.ChevronRight size={16} />
                                    </span>
                                </button>
                                {moreOpen && (
                                  <div className="px-4 pb-4 space-y-4">
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
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">标签</label>
                                        <input 
                                            type="text" 
                                            value={genre}
                                            onChange={e => setGenre(e.target.value)}
                                            className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                                            placeholder="例如：夜行, Lo-fi, 旧时光"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">灵感札记</label>
                                        <textarea 
                                            value={story}
                                            onChange={e => setStory(e.target.value)}
                                            className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700 min-h-[120px] resize-none"
                                            placeholder="写下这首歌的故事、情绪或一段记忆"
                                        />
                                    </div>
                                  </div>
                                )}
                            </div>
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
        </div>
    </div>
  );
};
