import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from './Icons';
import { Song } from '../types';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { EditSongModal } from './EditSongModal';
import { AddSongToCollectionDialog } from './AddSongToCollectionDialog';
import { getAnchoredMenuPlacement } from '../utils/menuPlacement';
import { feedback } from './feedback';
import { LiquidGlassMotionContent } from './LiquidGlassMotionContent';

interface UniversalContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorPosition?: { x: number; y: number };
  item: Song;
  type: 'song';
}

export const UniversalContextMenu: React.FC<UniversalContextMenuProps> = ({ isOpen, onClose, anchorPosition, item, type }) => {
  const { user } = useAuth();
  const { updateSong, deleteSong, isFavorite, toggleFavorite, playNext, playLater } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(isOpen);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false);

  // Check permissions
  const isOwner = user && item.ownerId === user.id;
  const isPinned = !!item.pinnedAt;
  const isPublic = item.isPublic !== false; // Default true if undefined

  const requestClose = useCallback(() => {
    setIsVisible(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(onClose, 580);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) setIsVisible(true);
    else setIsVisible(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If modal is open, don't close menu (though menu is hidden/replaced)
      if (showEditModal) return;
      
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        requestClose();
      }
    };
    if (isVisible) {
        // Use timeout to prevent immediate close if triggered by click
        setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, requestClose, showEditModal]);

  if (showCollectionDialog) {
      return (
        <AddSongToCollectionDialog
            isOpen={true}
            song={item}
            onClose={() => {
                setShowCollectionDialog(false);
                onClose();
            }}
        />
      );
  }

  // If editing, show modal instead of menu (or on top)
  if (showEditModal) {
      return (
        <EditSongModal 
            isOpen={true} 
            onClose={() => { 
                setShowEditModal(false); 
                onClose(); 
            }} 
            song={item} 
        />
      );
  }

  const handleAction = async (action: () => Promise<void> | void) => {
    try {
      await action();
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') {
        console.error('Menu action failed:', e);
        feedback.error('操作失败，请稍后重试');
      }
    } finally {
      requestClose();
    }
  };

  const shareSong = async () => {
    const shareText = `${item.title} - ${item.artist}`;
    const shareTarget = new URL(window.location.origin);
    shareTarget.searchParams.set('song', item.id);
    const shareUrl = shareTarget.toString();
    const shareData = {
      title: item.title,
      text: `我正在听 ${shareText}`,
      url: shareUrl,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    const fallbackText = `${shareData.text}\n${shareUrl}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(fallbackText);
      feedback.success('已复制歌曲分享内容');
      return;
    }

    feedback.info(fallbackText, { duration: 8000 });
  };

  const menuItems = [
    {
      label: '下一首播放',
      icon: Icons.SkipForward,
      onClick: () => handleAction(() => {
        playNext(item.id);
        feedback.success(`接下来播放「${item.title}」`);
      }),
      danger: false,
    },
    {
      label: '稍后播放',
      icon: Icons.ListMusic,
      onClick: () => handleAction(() => {
        playLater(item.id);
        feedback.success(`已将「${item.title}」加入待播末尾`);
      }),
      danger: false,
    },
    {
      label: '分享此歌曲',
      icon: Icons.Share2,
      onClick: () => handleAction(shareSong),
      danger: false,
    },
    {
      label: '加入歌单或专辑',
      icon: Icons.PlusCircle,
      onClick: () => setShowCollectionDialog(true),
      danger: false,
    },
    {
        label: isFavorite(item.id) ? '取消收藏此歌曲' : '收藏此歌曲',
        icon: Icons.Heart,
        onClick: () => handleAction(() => toggleFavorite(item.id)),
        danger: false,
    },
    {
      label: isOwner ? '编辑歌曲信息' : null,
      icon: Icons.Edit2,
      onClick: () => setShowEditModal(true),
      danger: false,
    },
    {
        label: isOwner ? (isPublic ? '设为私有歌曲' : '设为公开歌曲') : null,
        icon: isPublic ? Icons.Lock : Icons.Globe,
        onClick: () => handleAction(() => updateSong(item.id, { isPublic: !isPublic })),
        danger: false,
    },
    {
        label: isOwner ? (isPinned ? '取消置顶此歌曲' : '置顶此歌曲') : null,
        icon: Icons.Pin,
        onClick: () => handleAction(() => updateSong(item.id, { pinnedAt: isPinned ? null : new Date().toISOString() })),
        danger: false,
    },
    {
        label: isOwner ? '删除此歌曲' : null,
        icon: Icons.Trash,
        onClick: () => {
            if (window.confirm('确定要删除这首歌吗？此操作无法撤销。')) {
                handleAction(() => deleteSong(item.id));
            }
        },
        danger: true,
    },
  ].filter(i => i.label);

  if (menuItems.length === 0) return null;

  const placement = getAnchoredMenuPlacement(anchorPosition, menuItems.length);
  const style: React.CSSProperties = anchorPosition ? {
      position: 'fixed',
      zIndex: 260,
      left: placement?.left ?? 12,
      top: placement?.top ?? 12,
  } : {
      position: 'fixed',
      bottom: 24,
      left: 'calc(50% - 118px)',
      zIndex: 260,
  };
  const visibleMenuItems = placement?.opensUp ? [...menuItems].reverse() : menuItems;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={menuRef}
          className="liquid-context-menu-panel relative w-[236px] overflow-hidden rounded-2xl pointer-events-auto"
          style={style}
          data-liquid-control-root
          initial={anchorPosition ? { opacity: 0, left: placement?.left ?? 12, top: placement?.top ?? 12 } : { opacity: 0 }}
          animate={anchorPosition ? { opacity: 1, left: placement?.left ?? 12, top: placement?.top ?? 12 } : { opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.46, ease: [0.22, 0.74, 0.22, 1] },
            left: { type: 'spring', stiffness: 500, damping: 40, mass: 0.78 },
            top: { type: 'spring', stiffness: 500, damping: 40, mass: 0.78 },
          }}
        >
            <LiquidGlassMotionContent profile="menu" className="p-1.5">
                {visibleMenuItems.map((menuItem, idx) => (
                    <button
                        key={`${menuItem.label}-${idx}`}
                        onClick={(e) => { e.stopPropagation(); menuItem.onClick(); }}
                        className={`liquid-glass-interactive ${menuItem.danger ? 'liquid-glass-semantic' : ''} w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors ${
                            menuItem.danger 
                            ? 'text-red-500 hover:bg-red-500/10' 
                            : 'text-zinc-300 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {menuItem.icon && <menuItem.icon size={16} data-liquid-adaptive={menuItem.danger ? undefined : 'true'} />}
                        {menuItem.label}
                    </button>
                ))}
            </LiquidGlassMotionContent>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
