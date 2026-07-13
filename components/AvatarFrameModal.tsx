import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './Icons';
import { AVATAR_FRAMES } from '../config/avatarFrames';
import { AvatarWithFrame } from './AvatarWithFrame';
import { useModalPresence } from '../modalPresence';

interface AvatarFrameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id?: string;
    avatarUrl?: string;
    nickname?: string;
    avatarFrameId?: string | null;
  };
  onSave: (frameId: string | null) => Promise<void>;
}

export const AvatarFrameModal: React.FC<AvatarFrameModalProps> = ({ 
  isOpen, 
  onClose, 
  currentUser,
  onSave 
}) => {
  useModalPresence(isOpen);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(currentUser.avatarFrameId || null);
  const [isSaving, setIsSaving] = useState(false);
  const wornStorageKey = `jzone_avatar_frame_worn_v1:${currentUser.id || 'current'}`;
  const [wornFrameIds, setWornFrameIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(wornStorageKey) || '[]') as string[];
      if (currentUser.avatarFrameId) stored.push(currentUser.avatarFrameId);
      return new Set(stored);
    } catch {
      return new Set(currentUser.avatarFrameId ? [currentUser.avatarFrameId] : []);
    }
  });

  const framesList = Object.values(AVATAR_FRAMES);
  const selectedFrame = selectedFrameId ? AVATAR_FRAMES[selectedFrameId] : null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedFrameId);
      if (selectedFrameId) {
        setWornFrameIds((previous) => {
          const next = new Set(previous).add(selectedFrameId);
          try {
            localStorage.setItem(wornStorageKey, JSON.stringify([...next]));
          } catch {}
          return next;
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedFrameId(currentUser.avatarFrameId ?? null);
    try {
      const stored = JSON.parse(localStorage.getItem(wornStorageKey) || '[]') as string[];
      if (currentUser.avatarFrameId) stored.push(currentUser.avatarFrameId);
      setWornFrameIds(new Set(stored));
    } catch {
      setWornFrameIds(new Set(currentUser.avatarFrameId ? [currentUser.avatarFrameId] : []));
    }
  }, [currentUser.avatarFrameId, isOpen, wornStorageKey]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
      <motion.div
        className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center"
        data-testid="avatar-frame-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.74, 0.22, 1] }}
      >
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div 
          initial={{ y: 48, scale: 0.97, opacity: 0, filter: 'blur(10px)' }}
          animate={{ y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: 36, scale: 0.975, opacity: 0, filter: 'blur(8px)' }}
          transition={{ type: 'spring', damping: 28, stiffness: 270, mass: 0.86 }}
          className="relative w-full max-w-md bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[min(74dvh,640px)]"
          data-testid="avatar-frame-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-zinc-700 rounded-full" />
          </div>

          <div className="flex flex-col items-center pt-4 pb-6 px-6 bg-zinc-900 z-10">
             <div className="w-28 h-28 mb-3">
                <AvatarWithFrame 
                   src={currentUser.avatarUrl} 
                   frameId={selectedFrameId} 
                   size="100%"
                />
             </div>
             <h3 className="text-lg font-bold text-white">{currentUser.nickname || '用户'}</h3>
             <p className="text-xs text-zinc-500 mt-1">
                {selectedFrame ? '正在预览头像挂件' : '未佩戴头像挂件'}
             </p>
          </div>

          {selectedFrame && (
              <div className="px-6 pb-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{selectedFrame.name}</span>
                          {selectedFrame.tags?.map(tag => (
                              <span key={tag} className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-md border border-red-500/20">
                                  {tag}
                              </span>
                          ))}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                          {selectedFrame.description}
                      </p>
                  </div>
              </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 pb-40 min-h-0">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">我的挂件</h4>
            <div className="grid grid-cols-3 gap-4">
                <button 
                    onClick={() => setSelectedFrameId(null)}
                    className={`aspect-[4/5] rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${selectedFrameId === null ? 'bg-white/10 border-red-500 ring-1 ring-red-500' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                        <Icons.X size={20} className="text-zinc-500" />
                    </div>
                    <span className="text-xs font-medium text-zinc-400">默认</span>
                </button>

                {framesList.map(frame => (
                    <button 
                        key={frame.id}
                        onClick={() => setSelectedFrameId(frame.id)}
                        className={`aspect-[4/5] rounded-xl border flex flex-col items-center justify-center gap-2 transition-all relative overflow-hidden ${selectedFrameId === frame.id ? 'bg-white/10 border-red-500 ring-1 ring-red-500' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}
                    >
                        <div className="w-16 h-16 relative">
                            <img src={frame.imageUrl} loading="lazy" decoding="async" className="w-full h-full object-contain scale-110" alt={frame.name} />
                        </div>
                        <span className="text-xs font-medium text-zinc-300">{frame.name}</span>
                        {!wornFrameIds.has(frame.id) && (
                            <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                        )}
                    </button>
                ))}
            </div>
          </div>

          <div className="p-6 bg-gradient-to-t from-zinc-900 via-zinc-900 to-transparent pt-8 pb-[calc(env(safe-area-inset-bottom)+18px)]">
            <button 
                onClick={handleSave}
                disabled={isSaving || (selectedFrameId === currentUser.avatarFrameId && !currentUser.nickname?.includes('用户'))}
                className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all ${
                    isSaving ? 'bg-zinc-700 text-zinc-500' : 
                    (selectedFrameId === currentUser.avatarFrameId && !currentUser.nickname?.includes('用户')) ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black'
                }`}
            >
                {isSaving ? '保存中...' : (selectedFrameId === currentUser.avatarFrameId && !currentUser.nickname?.includes('用户')) ? '当前佩戴中' : '立即佩戴'}
            </button>
          </div>

        </motion.div>
      </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
