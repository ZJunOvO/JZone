import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from './Icons';
import { useCosUsage } from '../hooks/useCosUsage';
import { EditProfileModal } from './EditProfileModal';
import { AvatarWithFrame } from './AvatarWithFrame';

// TODO Interfaces for future implementation
export interface AvatarFrameProps {
  url?: string;
}

export interface UserTitleProps {
  text?: string;
  icon?: React.ReactNode;
}

export interface UserStatusProps {
  status?: 'online' | 'offline' | 'mood';
  text?: string;
}

export interface ProfileHeaderProps {
  user: {
    id: string;
    nickname?: string;
    avatarUrl?: string;
    coverUrl?: string;
    signature?: string;
    followersCount?: number;
    followingCount?: number;
    backgroundStyle?: 'half' | 'full';
    backgroundBlur?: number;
    avatarFrameId?: string | null;
    titleText?: string;
    titleStyle?: string;
    statusText?: string | null;
    statusEmoji?: string | null;
  };
  isCurrentUser: boolean;
  onBack?: () => void;
  onSettings?: () => void;
  onEditProfile?: (data: { nickname: string; signature: string; avatarBlob?: Blob }) => void;
  onAvatarFrameOpen?: () => void;
  onStatusClick?: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, isCurrentUser, onBack, onSettings, onEditProfile, onAvatarFrameOpen, onStatusClick }) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showStorageTooltip, setShowStorageTooltip] = useState(false);
  const cosUsage = useCosUsage(10, { enabled: showStorageTooltip, cacheTtlMs: 6 * 60 * 60 * 1000 });
  const blurPx = Math.round(((user.backgroundBlur ?? 0) as number) * 40);

  const UserTitle = ({ text, style = 'default' }: { text?: string; style?: string }) => {
    if (!text) return null;
    
    // Default style
    let className = "px-2.5 py-0.5 bg-white/10 backdrop-blur-md text-white/90 text-[10px] font-bold rounded-full border border-white/10 shadow-sm";
    
    // Custom styles
    if (style === 'gold_black' || text === '首席听众') {
      className = "px-2.5 py-0.5 bg-gradient-to-r from-zinc-900 to-zinc-800 text-[#FFD700] text-[10px] font-bold rounded-full border border-[#FFD700]/30 shadow-[0_2px_8px_rgba(0,0,0,0.3)]";
    } else if (style === 'pink_nebula') {
      className = "px-2.5 py-0.5 bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-200 text-[10px] font-bold rounded-full border border-pink-500/20 shadow-[0_0_10px_rgba(236,72,153,0.2)]";
    }

    return <span className={className}>{text}</span>;
  };

  const UserStatus = ({ text }: UserStatusProps) => (
    text ? <div className="flex items-center gap-1 text-xs text-zinc-500"><div className="w-2 h-2 bg-green-500 rounded-full"></div>{text}</div> : null
  );

  return (
    <>
      {/* Background Image Container - Only visible in Half Mode */}
      {user.backgroundStyle !== 'full' && (
          <div className="relative h-[360px] w-full overflow-hidden group">
            <div className="absolute inset-0">
                {(!user.coverUrl && blurPx === 0) ? (
                    <div className="w-full h-full bg-black" />
                ) : (
                    <img 
                        src={user.coverUrl || user.avatarUrl || "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=2670&auto=format&fit=crop"} 
                        className="w-full h-full object-cover"
                        alt="Profile Background"
                    />
                )}
                <div
                    className="absolute inset-0 brightness-[0.6]"
                    style={{ backdropFilter: `blur(${blurPx}px)` }}
                />
                
                {/* Gradient Mask for Smooth Transition */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-black pointer-events-none"></div>
            </div>
          </div>
      )}

      {/* Header Content Wrapper - Adjust padding/position based on mode */}
      <div className={`relative w-full ${user.backgroundStyle === 'full' ? 'pt-[120px] pb-6' : 'mt-[-360px] h-[360px] flex flex-col justify-end'}`}>
        
        {/* Navigation - Back Button for non-current user */}
        {!isCurrentUser && onBack && (
            <div className="absolute top-0 left-0 p-6 z-20 pt-[calc(env(safe-area-inset-top)+24px)]">
                <button 
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-95 transition-transform"
                >
                    <Icons.ChevronLeft size={24} />
                </button>
            </div>
        )}

        {/* Settings & Edit Buttons Row */}
        {isCurrentUser && (
            <div className="absolute top-0 right-0 p-6 z-20 pt-[calc(env(safe-area-inset-top)+24px)] flex gap-3">
                <button 
                    id="trigger-edit-profile"
                    onClick={() => setIsEditModalOpen(true)}
                    className="h-9 px-4 rounded-full border border-white/30 backdrop-blur-md flex items-center justify-center text-white text-xs font-medium active:scale-95 transition-transform bg-transparent hover:bg-white/10"
                >
                    编辑
                </button>
                <button 
                    onClick={onSettings}
                    aria-label="打开个人设置"
                    data-testid="profile-settings-button"
                    className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-95 transition-transform"
                >
                    <Icons.Settings size={18} />
                </button>
            </div>
        )}

        {/* Content Area */}
        <div className="px-6 pb-6 z-10 flex flex-col items-center gap-6 w-full max-w-md mx-auto">
            
            <div className="flex flex-col items-center gap-5">
                {/* Avatar */}
                <div className="relative group">
                    <button
                        type="button"
                        onClick={onStatusClick}
                        className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white/90 text-[11px] font-medium flex items-center gap-1.5 shadow-lg active:scale-95 transition-transform z-20 whitespace-nowrap group-hover:border-white/30"
                    >
                        {user.statusEmoji ? (
                           <>
                             <span className="text-sm">{user.statusEmoji}</span>
                             <span>{user.statusText}</span>
                           </>
                        ) : (
                           <span className="opacity-80">+ 添加状态</span>
                        )}
                    </button>
                    
                    <button
                        type="button"
                        onClick={onAvatarFrameOpen}
                        className={`w-24 h-24 rounded-full bg-zinc-800 shadow-2xl relative active:scale-95 transition-transform ${user.avatarFrameId ? '' : 'ring-4 ring-white/10'}`}
                    >
                        <AvatarWithFrame
                            src={user.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=JZone"}
                            frameId={user.avatarFrameId}
                            alt={user.nickname}
                        />
                    </button>
                </div>
                
                {/* Basic Info */}
                <div className="flex flex-col items-center space-y-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-lg">{user.nickname || "JZone 用户"}</h1>
                        <UserTitle text={user.titleText} style={user.titleStyle} />
                    </div>
                    <div className="flex items-center gap-2">
                            <p className="text-zinc-200 font-medium text-sm line-clamp-1 max-w-[240px] drop-shadow-md opacity-90 text-center">{user.signature || "暂无个性签名"}</p>
                    </div>
                </div>
            </div>

            {/* Stats Data - Centered Row */}
            <div className="flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-white font-bold text-lg drop-shadow-md">{user.followingCount || 0}</span>
                    <span className="text-zinc-400 text-xs font-medium drop-shadow-sm">关注</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-white font-bold text-lg drop-shadow-md">{user.followersCount || 0}</span>
                    <span className="text-zinc-400 text-xs font-medium drop-shadow-sm">粉丝</span>
                </div>
                
                {/* Storage Usage - Minimal Text UI */}
                <div className="flex flex-col items-center gap-0.5 relative group cursor-pointer" onClick={() => setShowStorageTooltip(!showStorageTooltip)}>
                    <span className="text-white font-bold text-lg drop-shadow-md flex items-center gap-1">
                        <Icons.Cloud size={16} className="text-zinc-200" />
                    </span>
                    <span className="text-zinc-400 text-xs font-medium drop-shadow-sm">
                        {cosUsage.usedFormatted}
                    </span>
                    
                    <AnimatePresence>
                        {showStorageTooltip && (
                            <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                transition={{ duration: 0.16, ease: 'easeOut' }}
                                className="absolute top-full left-1/2 -translate-x-[60%] mt-4 w-[min(320px,calc(100vw-32px))] bg-zinc-900/92 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl z-[120]"
                            >
                                <div className="flex items-center justify-between">
                                  <div className="text-[11px] font-semibold text-zinc-400">云盘空间</div>
                                  <div className="text-[11px] font-semibold text-zinc-500">{cosUsage.percent.toFixed(0)}%</div>
                                </div>
                                <div className="text-sm font-bold text-white mt-1">{cosUsage.usedFormatted} / 10 GB</div>
                                <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-white/50" style={{ width: `${Math.max(0, Math.min(100, cosUsage.percent))}%` }} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

        </div>
      </div>

      <EditProfileModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        currentUser={{
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            signature: user.signature
        }}
        onSave={onEditProfile}
      />
    </>
  );
};
