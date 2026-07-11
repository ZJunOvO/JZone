import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CollectionType, supabaseApi } from '../supabaseApi';
import { Icons } from './Icons';
import { ImageCropperModal } from './ImageCropperModal';
import { useAuth } from '../auth';
import { prepareImageForEditing } from '../imageProcessing';

export const CreateCollectionModal: React.FC<{
  isOpen: boolean;
  type: CollectionType;
  onClose: () => void;
  onCreated?: (id: string) => void;
}> = ({ isOpen, type, onClose, onCreated }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cover Image
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const prepared = await prepareImageForEditing(file);
      if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
      setImageSrc(URL.createObjectURL(prepared));
      setCropperOpen(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '封面读取失败');
    }
  };

  const handleCropComplete = (blob: Blob) => {
    setCoverBlob(blob);
    if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
    setCoverPreview(URL.createObjectURL(blob));
    setCropperOpen(false);
  };

  useEffect(() => () => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
  }, [coverPreview, imageSrc]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      let coverUrl = null;
      if (coverBlob && user) {
        // Upload cover
        const file = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
        coverUrl = await supabaseApi.uploadCollectionCover(user.id, file);
      }

      const id = await supabaseApi.createCollection({
        type,
        title: t,
        description: description.trim() ? description.trim() : null,
        visibility: 'public',
        coverUrl,
        releaseYear: releaseYear.trim() ? parseInt(releaseYear.trim()) : new Date().getFullYear(),
        genre: genre.trim() ? genre.trim() : null,
      });
      onCreated?.(id);
      window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id } }));
      setTitle('');
      setDescription('');
      setGenre('');
      setReleaseYear('');
      setCoverBlob(null);
      setCoverPreview(null);
      onClose();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '创建失败';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-md bg-zinc-900/80 rounded-[28px] overflow-hidden shadow-2xl border border-white/10 flex flex-col"
            >
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-extrabold tracking-tight">{type === 'album' ? '新建专辑' : '新建歌单'}</div>
                <button onClick={onClose} className="p-2 rounded-full bg-white/5 text-zinc-300 active:scale-95 transition">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex justify-center">
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-32 h-32 rounded-[24px] bg-white/5 border border-white/10 overflow-hidden relative group active:scale-95 transition"
                    >
                        {coverPreview ? (
                            <img src={coverPreview} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2">
                                <Icons.Image size={24} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">上传封面</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <Icons.Edit size={24} className="text-white" />
                        </div>
                    </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">标题</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === 'album' ? '例如：冬日回声' : '例如：夜行收藏'}
                    className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">简介</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="可选"
                    className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700 min-h-[96px] resize-none"
                  />
                </div>

                {type === 'album' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">曲风</label>
                      <input
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        placeholder="例如：Pop"
                        className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">发行年份</label>
                      <input
                        type="number"
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        placeholder={new Date().getFullYear().toString()}
                        className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                      />
                    </div>
                  </div>
                )}

                {error ? <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">{error}</div> : null}

                <button
                  onClick={submit}
                  disabled={!title.trim() || saving || !supabaseApi.isEnabled()}
                  className={`w-full py-4 rounded-2xl font-extrabold transition active:scale-[0.99] ${
                    !title.trim() || saving || !supabaseApi.isEnabled()
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-red-600 text-white shadow-xl shadow-red-600/25'
                  }`}
                >
                  {saving ? '创建中…' : '创建'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImageCropperModal
        isOpen={cropperOpen}
        onClose={() => setCropperOpen(false)}
        imageSrc={imageSrc || ''}
        onCropComplete={handleCropComplete}
        mode="cover" 
        aspectOverride={1}
      />
    </>
  );
};
