import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { Song } from '../types';
import { useStore } from '../store';
import { useModalPresence } from '../modalPresence';
import { supabaseApi, type SongArtistInput } from '../supabaseApi';
import { hasSupabaseConfig } from '../supabaseClient';
import { ArtistPicker } from './upload/ArtistPicker';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';
import { feedback } from './feedback';
import { CollectionCreatableSelect, type CollectionSelectValue } from './CollectionCreatableSelect';
import { attachUploadedSongToCollection } from '../utils/uploadFlow';
import { prepareImageForEditing } from '../imageProcessing';
import { ResilientCoverImage } from './media/ResilientCoverImage';

const SongLyricsEditorDialog = React.lazy(() => import('./lyrics/SongLyricsEditorDialog').then(({ SongLyricsEditorDialog: Component }) => ({
  default: Component,
})));
const SongVideoManagerDialog = React.lazy(() => import('./video/SongVideoManagerDialog').then(({ SongVideoManagerDialog: Component }) => ({ default: Component })));

interface EditSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song;
}

export const EditSongModal: React.FC<EditSongModalProps> = ({ isOpen, onClose, song }) => {
  useModalPresence(isOpen);
  const { playerState, updateSong, pausePlayback, getCurrentAudioSource } = useStore();
  const { profile: currentArtistProfile, displayName: currentArtistName } = useCurrentArtistProfile();
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [artistCredits, setArtistCredits] = useState<SongArtistInput[]>([]);
  const [collectionSelection, setCollectionSelection] = useState<CollectionSelectValue>(
    song.album ? { kind: 'create', type: 'album', title: song.album } : { kind: 'none' }
  );
  const [genre, setGenre] = useState(song.genre || '');
  const [story, setStory] = useState(song.story || '');
  const [recordedAt, setRecordedAt] = useState(song.recordedAt || '');
  const [coverUrl, setCoverUrl] = useState(song.coverUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLyricsEditorOpen, setIsLyricsEditorOpen] = useState(false);
  const [isVideoManagerOpen, setIsVideoManagerOpen] = useState(false);
  const [lyricsEditorAudioUrl, setLyricsEditorAudioUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(song.title);
      setArtist(song.artist);
      setArtistCredits([]);
      setCollectionSelection(song.album ? { kind: 'create', type: 'album', title: song.album } : { kind: 'none' });
      setGenre(song.genre || '');
      setStory(song.story || '');
      setRecordedAt(song.recordedAt || '');
      setCoverUrl(song.coverUrl);
      setCoverFile(null);
      setIsLyricsEditorOpen(false);
      setIsVideoManagerOpen(false);
    }
  }, [isOpen, song]);

  useEffect(() => {
    if (!isOpen || !song.album || !hasSupabaseConfig) return;
    let cancelled = false;
    supabaseApi.findMyCollectionByTitle(song.album, 'album')
      .then((collection) => {
        if (!cancelled && collection) {
          setCollectionSelection({ kind: 'existing', id: collection.id, title: collection.title, type: 'album' });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, song.album]);

  useEffect(() => {
    if (!isOpen || !hasSupabaseConfig) return;
    let cancelled = false;
    supabaseApi.fetchSongArtists(song.id)
      .then((rows) => {
        if (cancelled) return;
        setArtistCredits(rows.map((row) => ({
          profileId: row.profile_id,
          displayName: row.display_name,
          role: row.role,
          sortOrder: row.sort_order,
        })));
      })
      .catch(() => {
        if (!cancelled) setArtistCredits([{ displayName: song.artist, role: 'primary', sortOrder: 0 }]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, song.artist, song.id]);

  const handleCoverClick = () => {
    fileInputRef.current?.click();
  };

  const openLyricsEditor = () => {
    setLyricsEditorAudioUrl(
      playerState.currentSongId === song.id
        ? (getCurrentAudioSource() || song.audioUrl)
        : song.audioUrl,
    );
    pausePlayback();
    setIsLyricsEditorOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const sourceFile = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!sourceFile) return;
    try {
      const prepared = await prepareImageForEditing(sourceFile);
      const file = new File([prepared], 'cover.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      setCoverFile(file);
      setCoverUrl((previous) => {
        if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
        return URL.createObjectURL(file);
      });
    } catch (error) {
      feedback.error(error instanceof Error ? `封面读取失败：${error.message}` : '封面读取失败');
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    let uploadedCoverPath: string | null = null;
    try {
      let coverUpdates: Partial<Song> = {};
      if (coverFile && hasSupabaseConfig && song.ownerId) {
        const result = await supabaseApi.uploadSongCover(song.id, song.ownerId, coverFile, song.coverPath);
        uploadedCoverPath = result.path;
        coverUpdates = { coverPath: result.path, coverUrl: result.signedUrl };
      }

      const albumTitle = collectionSelection.kind !== 'none' && collectionSelection.type === 'album'
        ? collectionSelection.title
        : undefined;
      await updateSong(song.id, {
        title,
        artist,
        album: albumTitle || '',
        genre: genre || undefined,
        story: story || undefined,
        recordedAt: recordedAt || null,
        ...coverUpdates,
      }, { syncAlbumByTitle: false });
      if (hasSupabaseConfig) {
        await supabaseApi.syncSongAlbumByTitle(song.id, null);
        if (collectionSelection.kind !== 'none') {
          await attachUploadedSongToCollection(collectionSelection, song.id);
        }
      }
      if (hasSupabaseConfig && artistCredits.length) {
        await supabaseApi.upsertSongArtists(song.id, artistCredits, artist);
      }
      if (uploadedCoverPath && song.coverPath && song.coverPath !== uploadedCoverPath) {
        supabaseApi.deleteCoverIfUnreferenced(song.coverPath).catch((error) => {
          console.warn('旧封面清理失败，将由历史资源审计继续处理:', error);
        });
      }
      feedback.success('歌曲信息已更新');
      onClose();
    } catch (e) {
      if (uploadedCoverPath && uploadedCoverPath !== song.coverPath) {
        supabaseApi.deleteCoverIfUnreferenced(uploadedCoverPath).catch(() => {});
      }
      const msg = typeof (e as any)?.message === 'string' ? (e as any).message : '';
      console.error(e);
      feedback.error(msg || '保存失败，请检查存储配置后重试');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] sm:items-center sm:p-4">
        <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900 shadow-2xl animate-[scaleIn_0.3s_ease-out] sm:max-h-[88dvh]">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 [scrollbar-width:none] sm:p-6 [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">编辑歌曲信息</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition" aria-label="关闭编辑歌曲信息">
              <Icons.X size={20} className="text-zinc-400" />
            </button>
          </div>

          <div className="space-y-4">
             <div className="flex items-center gap-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                <div className="relative group cursor-pointer" onClick={handleCoverClick}>
                    <ResilientCoverImage src={coverUrl} coverPath={coverFile ? null : song.coverPath} fallbackSeed={song.id} decoding="async" className="w-16 h-16 rounded-xl object-cover bg-zinc-800 transition group-hover:opacity-50" alt="封面" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Icons.Camera size={20} className="text-white drop-shadow-md" />
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleFileChange}
                    />
                </div>
                <div>
                   <p className="text-sm font-bold text-white truncate">{title}</p>
                   <p className="text-xs text-zinc-500 font-bold">{artist}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">标题</label>
                      <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          className="min-h-12 w-full min-w-0 rounded-xl border border-white/5 bg-black/40 px-3 text-sm font-medium text-white outline-none transition focus:border-red-500/50"
                          data-testid="edit-song-title"
                      />
                    </div>
                    <ArtistPicker
                      value={artist}
                      currentArtist={currentArtistName}
                      currentProfile={currentArtistProfile}
                      onChange={setArtist}
                      credits={artistCredits}
                      onCreditsChange={setArtistCredits}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <CollectionCreatableSelect
                      label="专辑 / 歌单"
                      value={collectionSelection}
                      onChange={setCollectionSelection}
                      placeholder="搜索或创建…"
                    />
                    <div className="min-w-0 space-y-1.5">
                      <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">流派 / 标签</label>
                      <input
                          type="text"
                          value={genre}
                          onChange={e => setGenre(e.target.value)}
                          className="min-h-12 w-full min-w-0 rounded-xl border border-white/5 bg-black/40 px-3 text-sm font-medium text-white outline-none transition focus:border-red-500/50"
                          placeholder="Pop、R&B…"
                          data-testid="edit-song-genre"
                      />
                    </div>
                </div>

                <button
                  type="button"
                  onClick={openLyricsEditor}
                  disabled={isSaving}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-40"
                  data-testid="edit-song-lyrics"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/72">
                    <Icons.Music2 size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">歌词</span>
                    <span className="mt-0.5 block truncate text-xs text-white/40">添加、导入或重新对轴</span>
                  </span>
                  <Icons.ChevronRight size={17} className="shrink-0 text-white/30" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsVideoManagerOpen(true)}
                  disabled={isSaving || !song.ownerId}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06] disabled:opacity-40"
                  data-testid="edit-song-video"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/72"><Icons.Video size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">影像与 MV</span><span className="mt-0.5 block truncate text-xs text-white/40">完整作品或歌曲中的记忆片段</span></span>
                  <Icons.ChevronRight size={17} className="shrink-0 text-white/30" />
                </button>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">录制日期</label>
                    <span className="text-[10px] font-medium text-zinc-600">用于记忆卡片</span>
                  </div>
                  <input
                    type="date"
                    value={recordedAt}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setRecordedAt(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-white/5 bg-black/40 px-3 text-sm font-medium text-white outline-none transition focus:border-red-500/50 [color-scheme:dark]"
                    data-testid="edit-song-recorded-at"
                  />
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">灵感札记</label>
                    <textarea 
                        value={story}
                        onChange={e => setStory(e.target.value)}
                        className="w-full bg-black/40 text-white p-3 rounded-xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition min-h-[80px] resize-none"
                        placeholder="分享这首歌背后的故事..."
                    />
                </div>
             </div>
          </div>

          <div className="pt-2 flex gap-3">
             <button 
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-400 hover:bg-white/5 transition text-xs uppercase tracking-wider"
             >
                取消
             </button>
             <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 transition shadow-lg shadow-red-600/20 text-xs uppercase tracking-wider disabled:opacity-50"
             >
                {isSaving ? '保存中...' : '保存更改'}
             </button>
          </div>
          </div>
        </div>
      </div>
      {isLyricsEditorOpen ? (
        <React.Suspense fallback={null}>
          <SongLyricsEditorDialog
            isOpen
            song={{ ...song, title, artist }}
            audioUrl={lyricsEditorAudioUrl || song.audioUrl}
            onClose={() => setIsLyricsEditorOpen(false)}
          />
        </React.Suspense>
      ) : null}
      {isVideoManagerOpen ? (
        <React.Suspense fallback={null}><SongVideoManagerDialog song={song} onClose={() => setIsVideoManagerOpen(false)} /></React.Suspense>
      ) : null}
    </>
  );
};
