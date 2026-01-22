import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './Icons';
import { ImageCropperModal } from './ImageCropperModal';
import { useModalPresence } from '../modalPresence';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    avatarUrl?: string;
    nickname?: string;
    signature?: string;
  };
  onSave?: (data: { nickname: string; signature: string; avatarBlob?: Blob }) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, currentUser, onSave }) => {
  useModalPresence(isOpen);
  const nicknameRef = React.useRef<HTMLInputElement>(null);
  const signatureRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [cropperState, setCropperState] = useState<{ isOpen: boolean; imageSrc: string | null }>({
    isOpen: false,
    imageSrc: null,
  });
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setCropperState({ isOpen: true, imageSrc: reader.result as string });
      });
      reader.readAsDataURL(file);
      // Reset input so same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropperState({ isOpen: false, imageSrc: null });
    setPendingAvatarBlob(blob);
    setPreviewAvatarUrl(URL.createObjectURL(blob));
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        nickname: nicknameRef.current?.value || '',
        signature: signatureRef.current?.value || '',
        avatarBlob: pendingAvatarBlob || undefined,
      });
    }
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div
            key="edit-profile-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl scrollbar-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h3 className="text-lg font-bold text-white">编辑资料</h3>
                <button 
                  onClick={onClose}
                  className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
                >
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleFileChange}
                    />
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-white/30 transition-colors">
                      <img 
                        src={previewAvatarUrl || currentUser.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=JZone"} 
                        alt="Avatar" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icons.Camera size={24} className="text-white" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 right-0 bg-zinc-800 rounded-full p-1.5 border border-black shadow-lg">
                        <Icons.Edit2 size={12} className="text-white" />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">点击更换头像</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">昵称</label>
                    <input 
                      ref={nicknameRef}
                      type="text" 
                      defaultValue={currentUser.nickname || "JZone 会员"}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="设置你的昵称"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">个性签名</label>
                    <textarea 
                      ref={signatureRef}
                      defaultValue={currentUser.signature || "在音乐的宇宙里漫游..."}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors min-h-[100px] resize-none"
                      placeholder="写点什么..."
                    />
                  </div>

                </div>
              </div>

              <div className="p-6 pt-2">
                <button 
                    onClick={handleSave}
                    className="w-full bg-white text-black font-bold py-3.5 rounded-xl active:scale-95 transition-transform"
                >
                  保存修改
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ImageCropperModal
        isOpen={cropperState.isOpen}
        onClose={() => setCropperState({ isOpen: false, imageSrc: null })}
        imageSrc={cropperState.imageSrc || ''}
        onCropComplete={handleCropComplete}
        mode="avatar"
      />
    </>
  );
};
