import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Song } from '../types';
import { Icons } from './Icons';
import { ResilientCoverImage } from './media/ResilientCoverImage';

export const SongPickerModal: React.FC<{
  isOpen: boolean;
  title: string;
  songs: Song[];
  onClose: () => void;
  onConfirm: (songIds: string[]) => void;
}> = ({ isOpen, title, songs, onClose, onConfirm }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => {
      const hay = `${s.title} ${s.artist} ${s.album ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, songs]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirm = () => {
    if (!selected.length) return;
    onConfirm(selected);
    setSelected([]);
    setQuery('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6">
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
            className="relative w-full max-w-md bg-zinc-900/80 rounded-[28px] overflow-hidden shadow-2xl border border-white/10 max-h-[85vh] flex flex-col"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold tracking-tight">{title}</div>
              <button onClick={onClose} className="p-2 rounded-full bg-white/5 text-zinc-300 active:scale-95 transition">
                <Icons.X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="bg-black/30 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Icons.Search size={16} className="text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索歌曲 / 艺人 / 专辑"
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
                />
                {query ? (
                  <button onClick={() => setQuery('')} className="text-zinc-500 text-xs font-bold">
                    清除
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-28">
              <div className="space-y-2">
                {filtered.map((s) => {
                  const isChecked = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition active:scale-[0.99] ${
                        isChecked ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isChecked ? 'border-white/40 bg-white/10' : 'border-white/15 bg-black/20'}`}>
                        {isChecked ? <Icons.Check size={14} className="text-white" /> : null}
                      </div>
                      <ResilientCoverImage src={s.coverUrl} coverPath={s.coverPath} fallbackSeed={s.id} className="w-11 h-11 rounded-xl object-cover bg-zinc-800" alt="" loading="lazy" decoding="async" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-bold text-white truncate">{s.title}</div>
                        <div className="text-xs text-zinc-500 font-medium truncate">{s.artist}</div>
                      </div>
                    </button>
                  );
                })}

                {!filtered.length && <div className="text-center text-zinc-500 text-sm py-10">没有匹配的歌曲</div>}
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="text-xs text-zinc-400 font-semibold flex-1">已选 {selected.length} 首</div>
                <button
                  onClick={confirm}
                  disabled={!selected.length}
                  className="px-5 py-3 rounded-2xl bg-white text-black font-extrabold active:scale-95 transition disabled:opacity-50 disabled:active:scale-100"
                >
                  添加
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
