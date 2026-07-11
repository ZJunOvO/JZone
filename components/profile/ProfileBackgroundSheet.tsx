import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';
import { cosClient } from '../../cosClient';
import { ProfileRow, supabaseApi } from '../../supabaseApi';
import { feedback } from '../feedback';

interface ProfileBackgroundUser {
  coverUrl?: string;
  backgroundStyle: 'half' | 'full';
}

interface ProfileBackgroundSheetProps {
  displayUser: ProfileBackgroundUser;
  profileData: ProfileRow | null;
  targetUserId?: string;
  profileCachePrefix: string;
  previewHeightClass: string;
  blurPx: number;
  onClose: () => void;
  onPickFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileRow | null>>;
}

export const ProfileBackgroundSheet: React.FC<ProfileBackgroundSheetProps> = ({
  displayUser,
  profileData,
  targetUserId,
  profileCachePrefix,
  previewHeightClass,
  blurPx,
  onClose,
  onPickFile,
  setProfileData,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const updateBackgroundStyle = async (backgroundStyle: 'half' | 'full') => {
    if (!targetUserId) return;
    try {
      await supabaseApi.updateProfile(targetUserId, { background_style: backgroundStyle });
      setProfileData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, background_style: backgroundStyle } as ProfileRow;
        try {
          localStorage.setItem(`${profileCachePrefix}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      console.error(error);
      feedback.error('设置失败，请重试');
    }
  };

  const restoreDefaultBackground = async () => {
    if (!targetUserId) return;
    const raw = profileData?.cover_url;
    onClose();
    try {
      await supabaseApi.updateProfile(targetUserId, { cover_url: null });
      if (raw && cosClient.isEnabled && !/^https?:\/\//i.test(raw)) {
        await cosClient.deleteFiles([raw]).catch(() => {});
      }
      setProfileData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, cover_url: null } as ProfileRow;
        try {
          localStorage.setItem(`${profileCachePrefix}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      console.error(error);
      feedback.error('恢复默认失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">自定义背景</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <Icons.X size={20} />
          </button>
        </div>

        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onPickFile} />

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-zinc-400">背景风格</label>
            <span className="text-sm font-bold text-white">{displayUser.backgroundStyle === 'full' ? '全屏模糊' : '半屏沉浸'}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateBackgroundStyle('half')}
              className={`w-full flex items-center justify-center py-3 rounded-xl border transition-all ${
                displayUser.backgroundStyle !== 'full' ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 border-transparent hover:bg-white/10'
              }`}
            >
              <span className="text-sm font-bold">半屏沉浸</span>
            </button>
            <button
              onClick={() => updateBackgroundStyle('full')}
              className={`w-full flex items-center justify-center py-3 rounded-xl border transition-all ${
                displayUser.backgroundStyle === 'full' ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 border-transparent hover:bg-white/10'
              }`}
            >
              <span className="text-sm font-bold">全屏模糊</span>
            </button>
          </div>
        </div>

        <div
          className={`w-full ${previewHeightClass} rounded-2xl overflow-hidden bg-black/40 border border-white/10 cursor-pointer`}
          onClick={() => fileInputRef.current?.click()}
        >
          {displayUser.coverUrl ? (
            <img src={displayUser.coverUrl} className="w-full h-full object-cover" style={{ filter: `blur(${blurPx}px)` }} alt="Custom Background" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">暂无自定义背景，点击上传</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/15 transition"
          >
            上传新背景
          </button>
          <button
            disabled={!profileData?.cover_url}
            onClick={restoreDefaultBackground}
            className={`w-full flex items-center justify-center py-3 rounded-xl font-bold transition ${
              profileData?.cover_url ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/30'
            }`}
          >
            恢复默认
          </button>
        </div>
      </motion.div>
    </div>
  );
};
