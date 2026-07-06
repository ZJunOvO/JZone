import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Icons } from '../Icons';
import { Song } from '../../types';
import { uploadDraftStorage } from '../../uploadDraftStorage';
import { localLibraryStorage } from '../../localLibraryStorage';
import { useAuth } from '../../auth';
import { hasSupabaseConfig } from '../../supabaseClient';
import { supabaseApi } from '../../supabaseApi';
import { CollectionCreatableSelect, CollectionSelectValue } from '../CollectionCreatableSelect';
import { attachUploadedSongToCollection, createUploadedSongFromRow, resolveUploadAlbum } from '../../utils/uploadFlow';
import { WaveformCropper } from '../WaveformCropper';
import { createUploadDraftMeta, normalizeUploadDraftMeta } from '../../utils/uploadDraftMeta';
import { adjustRangeForDuration, decodeAudioDuration, makePreviewBlob, persistDraftAudio } from '../../utils/uploadAudio';

type UploadEditorVariant = 'page' | 'modal';

interface UploadEditorProps {
  variant?: UploadEditorVariant;
  defaultArtist?: string;
  onSaved?: () => void;
}

const randomCover = () => `https://picsum.photos/seed/${Math.random()}/400/400`;

export const UploadEditor: React.FC<UploadEditorProps> = ({ variant = 'page', defaultArtist, onSaved }) => {
  const { addSong } = useStore();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [collectionSelection, setCollectionSelection] = useState<CollectionSelectValue>({ kind: 'none' });
  const [genre, setGenre] = useState('');
  const [story, setStory] = useState('');
  const [moreOpen, setMoreOpen] = useState(variant === 'page');
  const [songVisibility, setSongVisibility] = useState<'public' | 'private'>('public');
  const [coverUrl, setCoverUrl] = useState(randomCover);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(240);
  const [range, setRange] = useState<[number, number]>([0, 240]);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewSupported, setIsPreviewSupported] = useState(true);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef('');
  const coverUrlRef = useRef('');
  const durationJobRef = useRef(0);
  const inputSuffix = variant === 'modal' ? 'modal' : 'page';
  const frameClass =
    variant === 'page'
      ? 'space-y-8 animate-[fadeIn_0.3s_ease-out]'
      : 'space-y-8 animate-in slide-in-from-bottom-4 duration-300 bg-zinc-900/50 p-6 rounded-[28px] border border-white/5 shadow-2xl';

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
    if (!audio || !previewUrl) return;
    audio.load();
  }, [previewUrl]);

  useEffect(() => {
    coverUrlRef.current = coverUrl;
  }, [coverUrl]);

  useEffect(() => {
    if (!file) return;
    const job = ++durationJobRef.current;
    (async () => {
      try {
        const dur = await decodeAudioDuration(file);
        if (job !== durationJobRef.current) return;
        if (dur === null) return;
        setDuration(dur);
        setRange((prev) => adjustRangeForDuration(prev, dur));
      } catch {}
    })();
  }, [file]);

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
        const normalizedMeta = normalizeUploadDraftMeta(draftMeta);
        setTitle(normalizedMeta.title);
        setArtist(normalizedMeta.artist);
        setAlbum(normalizedMeta.album);
        setGenre(normalizedMeta.genre);
        setStory(normalizedMeta.story);
        setSongVisibility(normalizedMeta.visibility);
        if (normalizedMeta.duration !== null) setDuration(normalizedMeta.duration);
        if (normalizedMeta.range) setRange(normalizedMeta.range);
      }

      if (draftAudio) {
        setFile(draftAudio);
        setPreviewUrl(URL.createObjectURL(makePreviewBlob(draftAudio)));
        setStep(2);
      }

      if (draftCover) {
        setCoverFile(draftCover);
        setCoverUrl(URL.createObjectURL(draftCover));
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    uploadDraftStorage
      .setMeta(createUploadDraftMeta({ title, artist, album, genre, story, visibility: songVisibility, duration, range }))
      .catch(() => {});
  }, [album, artist, duration, genre, range, songVisibility, story, title]);

  const resetDraft = () => {
    uploadDraftStorage.clearAll().catch(() => {});
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    setPreviewUrl('');
    setFile(null);
    setTitle('');
    setArtist('');
    setAlbum('');
    setCollectionSelection({ kind: 'none' });
    setGenre('');
    setStory('');
    setSongVisibility('public');
    setDuration(240);
    setRange([0, 240]);
    setCurrentPreviewTime(0);
    setCoverFile(null);
    setCoverUrl(randomCover());
    setStep(1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const selectedFile = e.target.files[0];
    setPreviewError(null);
    setIsPreviewSupported(true);
    setFile(selectedFile);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setPreviewUrl(URL.createObjectURL(makePreviewBlob(selectedFile)));
    persistDraftAudio(selectedFile);
    setStep(2);

    const nameParts = selectedFile.name.replace(/\.[^/.]+$/, '').split('-');
    if (nameParts.length > 1) {
      setArtist(nameParts[0].trim());
      setTitle(nameParts.slice(1).join('-').trim());
    } else {
      setTitle(nameParts[0]);
      if (!artist && defaultArtist) setArtist(defaultArtist);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const nextFile = e.target.files[0];
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    const url = URL.createObjectURL(nextFile);
    setCoverUrl(url);
    setCoverFile(nextFile);
    uploadDraftStorage.setCover(nextFile).catch(() => {});
  };

  const playPreviewSection = () => {
    if (!audioPreviewRef.current) return;
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
      const detail = typeof e?.message === 'string' ? e.message : audio.error?.code ? `MediaError(${audio.error.code})` : '未知错误';
      setPreviewError(`无法播放预览：${detail}`);
    });
  };

  const handleSeek = (time: number) => {
    if (!audioPreviewRef.current) return;
    audioPreviewRef.current.currentTime = time;
    setCurrentPreviewTime(time);
  };

  const handleSave = async () => {
    if (!file || isSaving) return;
    setPreviewError(null);
    setSaveError(null);
    setIsSaving(true);

    try {
      if (hasSupabaseConfig && user) {
        const albumForSong = resolveUploadAlbum(collectionSelection, album);
        const row = await supabaseApi.uploadAndCreateSong({
          userId: user.id,
          title: title || '未命名',
          artist: artist || defaultArtist || '未知艺人',
          album: albumForSong || '未知专辑',
          genre: genre || undefined,
          story: story || undefined,
          fileSize: file.size,
          duration,
          trimStart: range[0],
          trimEnd: range[1],
          audioFile: file,
          coverFile: coverFile ?? undefined,
          visibility: songVisibility,
        });

        let signedCoverUrl = coverUrl;
        if (row.cover_path) {
          try {
            signedCoverUrl = await supabaseApi.createSignedCoverUrl(row.cover_path);
          } catch {}
        }

        addSong(createUploadedSongFromRow({ row, coverUrl: signedCoverUrl, visibility: songVisibility }));

        try {
          await attachUploadedSongToCollection(collectionSelection, row.id);
        } catch (e) {
          console.warn('歌曲已上传，但加入合集失败:', e);
          alert('歌曲已上传成功，但加入合集失败。你可以稍后在合集里手动添加。');
        }

        alert('歌曲已成功保存！');
        resetDraft();
        onSaved?.();
        return;
      }

      const songId = Math.random().toString(36).substr(2, 9);
      const persistedMeta = {
        id: songId,
        title: title || '未命名',
        artist: artist || defaultArtist || '未知艺人',
        album: album || '未知专辑',
        genre: genre || undefined,
        story: story || undefined,
        fileSize: file.size,
        duration,
        trimStart: range[0],
        trimEnd: range[1],
        uploadedBy: 'Me',
        addedAt: Date.now(),
        coverUrl: coverFile ? undefined : coverUrl,
      };

      localLibraryStorage.saveSong({ meta: persistedMeta, audioFile: file, coverFile: coverFile ?? undefined }).catch(() => {});

      const newSong: Song = {
        id: songId,
        title: persistedMeta.title,
        artist: persistedMeta.artist,
        album: persistedMeta.album,
        genre: persistedMeta.genre,
        story: persistedMeta.story,
        fileSize: persistedMeta.fileSize,
        coverUrl: coverFile ? URL.createObjectURL(coverFile) : coverUrl,
        audioUrl: URL.createObjectURL(file),
        duration,
        trimStart: range[0],
        trimEnd: range[1],
        uploadedBy: 'Me',
        addedAt: persistedMeta.addedAt,
      };
      addSong(newSong);
      alert('歌曲已成功保存！');
      resetDraft();
      onSaved?.();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      setSaveError(msg || '上传失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 1) {
    return (
      <div className="border-2 border-dashed border-zinc-800 rounded-[28px] p-8 flex flex-col items-center justify-center h-56 bg-zinc-900/30 hover:bg-zinc-900/50 transition group">
        <input type="file" accept="audio/*,.m4a,.mp4,.flac,.amr" onChange={handleFileChange} className="hidden" id={`audio-upload-${inputSuffix}`} />
        <label htmlFor={`audio-upload-${inputSuffix}`} className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
          <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
            <Icons.Upload className="text-white" size={24} />
          </div>
          <span className="text-zinc-300 font-bold">点击选择音频文件</span>
          <span className="text-zinc-500 text-[11px] mt-2 font-medium tracking-wide">MP3 / M4A / MP4 / WAV / FLAC / AMR</span>
        </label>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <div className="flex items-center gap-6">
        <div className="relative group shrink-0">
          <img src={coverUrl} className="w-24 h-24 rounded-2xl object-cover bg-zinc-800 shadow-xl ring-1 ring-white/10" alt="Cover" />
          <label htmlFor={`cover-upload-${inputSuffix}`} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-2xl cursor-pointer">
            <Icons.PlusCircle size={20} className="text-white mb-1" />
            <span className="text-[10px] text-white font-bold">更换封面</span>
          </label>
          <input type="file" id={`cover-upload-${inputSuffix}`} accept="image/*" onChange={handleCoverUpload} className="hidden" />
        </div>
        <div className="overflow-hidden space-y-1">
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">正在编辑</p>
          <p className="text-base font-bold text-white truncate">{file?.name}</p>
          <p className="text-[10px] text-zinc-500 font-mono">{(file ? file.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">裁剪选段</label>
          <button disabled={!isPreviewSupported} onClick={playPreviewSection} className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1 rounded-full active:scale-95 transition ${isPreviewSupported ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 bg-white/5'}`}>
            <Icons.Play size={12} fill="currentColor" /> 播放选段
          </button>
        </div>
        <WaveformCropper duration={duration} range={range} setRange={setRange} currentTime={currentPreviewTime} onSeek={handleSeek} />
        <div className="grid grid-cols-3 text-[10px] text-zinc-500 font-mono font-bold tracking-tight">
          <div className="text-left">IN: {range[0].toFixed(1)}s</div>
          <div className="text-center text-red-500/80">LENGTH: {(range[1] - range[0]).toFixed(1)}s</div>
          <div className="text-right">OUT: {range[1].toFixed(1)}s</div>
        </div>
        <audio
          ref={audioPreviewRef}
          src={previewUrl || undefined}
          preload="metadata"
          playsInline
          onError={(e) => {
            const a = e.currentTarget;
            const code = a.error?.code ? `MediaError(${a.error.code})` : 'unknown';
            setIsPreviewSupported(false);
            setDuration((d) => (Number.isFinite(d) && d > 0 ? d : 240));
            setRange((r) => (Number.isFinite(r[1]) && r[1] > 0 ? r : [0, 240]));
            setCurrentPreviewTime(0);
            setPreviewError(code === 'MediaError(4)' ? '音频预览失败：当前浏览器不支持该 M4A/MP4 编码，仍可直接上传' : `音频加载失败：${code}`);
          }}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (!Number.isFinite(dur) || dur <= 0) {
              setIsPreviewSupported(false);
              setDuration((d) => (Number.isFinite(d) && d > 0 ? d : 240));
              setRange((r) => (Number.isFinite(r[1]) && r[1] > 0 ? r : [0, 240]));
              setCurrentPreviewTime(0);
              setPreviewError('音频预览失败：无法读取时长，仍可直接上传');
              return;
            }
            setDuration(dur);
            setRange((prev) => {
              if (!Number.isFinite(prev[1]) || Math.abs(prev[1] - dur) > 1) return [0, dur];
              return prev;
            });
          }}
        />
        {previewError ? <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{previewError}</div> : null}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">歌曲标题</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700" placeholder="例如：My New Song" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">艺人</label>
            <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700" placeholder={defaultArtist || '艺术家名称'} />
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/30">
            <button type="button" onClick={() => setMoreOpen((prev) => !prev)} className="w-full flex items-center justify-between px-4 py-3 text-zinc-300 font-bold text-xs uppercase tracking-widest">
              更多
              <span className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`}>
                <Icons.ChevronRight size={16} />
              </span>
            </button>
            {moreOpen && (
              <div className="px-4 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">可见性</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setSongVisibility('public')} className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border transition ${songVisibility === 'public' ? 'bg-white text-black border-white' : 'bg-black/40 text-zinc-300 border-white/5 hover:bg-black/30'}`}>
                      <Icons.Globe size={16} />公开
                    </button>
                    <button type="button" onClick={() => setSongVisibility('private')} className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border transition ${songVisibility === 'private' ? 'bg-white text-black border-white' : 'bg-black/40 text-zinc-300 border-white/5 hover:bg-black/30'}`}>
                      <Icons.Lock size={16} />私有
                    </button>
                  </div>
                </div>
                <CollectionCreatableSelect
                  label="专辑 / 歌单"
                  value={collectionSelection}
                  onChange={(v) => {
                    setCollectionSelection(v);
                    if (v.kind === 'none') setAlbum('');
                    else if (v.type === 'album') setAlbum(v.title);
                    else setAlbum('');
                  }}
                  placeholder="搜索或创建…"
                />
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">标签</label>
                  <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700" placeholder="例如：夜行, Lo-fi, 旧时光" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">灵感札记</label>
                  <textarea value={story} onChange={(e) => setStory(e.target.value)} className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700 min-h-[120px] resize-none" placeholder="写下这首歌的故事、情绪或一段记忆" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4">
        {saveError ? <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">{saveError}</div> : null}
        <button onClick={handleSave} disabled={isSaving} className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all ${isSaving ? 'bg-zinc-800 text-zinc-500 shadow-none' : 'bg-red-600 shadow-red-600/20'}`}>
          {isSaving ? '上传中...' : '确认保存至资料库'}
        </button>
        <button onClick={resetDraft} className="w-full text-zinc-500 text-[11px] font-bold py-2 hover:text-white transition uppercase tracking-widest">
          弃置并重新选择
        </button>
      </div>
    </div>
  );
};
