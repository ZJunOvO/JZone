import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { Song } from '../types';
import { useStore } from '../store';
import { useModalPresence } from '../modalPresence';
import { supabaseApi } from '../supabaseApi';
import { hasSupabaseConfig } from '../supabaseClient';

interface EditSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song;
}

export const EditSongModal: React.FC<EditSongModalProps> = ({ isOpen, onClose, song }) => {
  useModalPresence(isOpen);
  const { updateSong } = useStore();
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album || '');
  const [genre, setGenre] = useState(song.genre || '');
  const [story, setStory] = useState(song.story || '');
  const [coverUrl, setCoverUrl] = useState(song.coverUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(song.title);
      setArtist(song.artist);
      setAlbum(song.album || '');
      setGenre(song.genre || '');
      setStory(song.story || '');
      setCoverUrl(song.coverUrl);
      setCoverFile(null);
    }
  }, [isOpen, song]);

  const handleCoverClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let coverUpdates: Partial<Song> = {};
      if (coverFile && hasSupabaseConfig && song.ownerId) {
        const result = await supabaseApi.uploadSongCover(song.id, song.ownerId, coverFile, song.coverPath);
        coverUpdates = { coverPath: result.path, coverUrl: result.signedUrl };
      }

      await updateSong(song.id, {
        title,
        artist,
        album: album || undefined,
        genre: genre || undefined,
        story: story || undefined,
        ...coverUpdates,
      });
      onClose();
    } catch (e) {
      const msg = typeof (e as any)?.message === 'string' ? (e as any).message : '';
      console.error(e);
      alert(msg || '保存失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-zinc-900 border border-white/10 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">编辑歌曲信息</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition">
              <Icons.X size={20} className="text-zinc-400" />
            </button>
          </div>

          <div className="space-y-4">
             <div className="flex items-center gap-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                <div className="relative group cursor-pointer" onClick={handleCoverClick}>
                    <img src={coverUrl} decoding="async" className="w-16 h-16 rounded-xl object-cover bg-zinc-800 transition group-hover:opacity-50" alt="Cover" />
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
                <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">标题</label>
                    <input 
                        type="text" 
                        value={title} 
                        onChange={e => setTitle(e.target.value)}
                        className="w-full bg-black/40 text-white p-3 rounded-xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">艺人</label>
                        <input 
                            type="text" 
                            value={artist}
                            onChange={e => setArtist(e.target.value)}
                            className="w-full bg-black/40 text-white p-3 rounded-xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">专辑</label>
                        <input 
                            type="text" 
                            value={album}
                            onChange={e => setAlbum(e.target.value)}
                            className="w-full bg-black/40 text-white p-3 rounded-xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">流派 / 标签</label>
                    <input 
                        type="text" 
                        value={genre}
                        onChange={e => setGenre(e.target.value)}
                        className="w-full bg-black/40 text-white p-3 rounded-xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition"
                        placeholder="Pop, R&B, Electronic..."
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
  );
};
