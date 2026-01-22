import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { Song } from '../types';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { EditSongModal } from './EditSongModal';

interface UniversalContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorPosition?: { x: number; y: number };
  item: Song;
  type: 'song';
}

export const UniversalContextMenu: React.FC<UniversalContextMenuProps> = ({ isOpen, onClose, anchorPosition, item, type }) => {
  const { user } = useAuth();
  const { updateSong, deleteSong, isFavorite, toggleFavorite } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Check permissions
  const isOwner = user && item.ownerId === user.id;
  const isPinned = !!item.pinnedAt;
  const isPublic = item.isPublic !== false; // Default true if undefined

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If modal is open, don't close menu (though menu is hidden/replaced)
      if (showEditModal) return;
      
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
        // Use timeout to prevent immediate close if triggered by click
        setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, showEditModal]);

  if (!isOpen) return null;

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
    await action();
    onClose();
  };

  const menuItems = [
    {
      label: isOwner ? '编辑信息' : null,
      icon: Icons.Edit2,
      onClick: () => setShowEditModal(true),
      danger: false,
    },
    {
        label: isOwner ? (isPublic ? '设为私有' : '设为公开') : null,
        icon: isPublic ? Icons.Lock : Icons.Globe,
        onClick: () => handleAction(() => updateSong(item.id, { isPublic: !isPublic })),
        danger: false,
    },
    {
        label: isOwner ? (isPinned ? '取消置顶' : '置顶') : null,
        icon: Icons.Pin,
        onClick: () => handleAction(() => updateSong(item.id, { pinnedAt: isPinned ? null : new Date().toISOString() })),
        danger: false,
    },
    {
        label: isOwner ? '删除' : null,
        icon: Icons.Trash,
        onClick: () => {
            if (window.confirm('确定要删除这首歌吗？此操作无法撤销。')) {
                handleAction(() => deleteSong(item.id));
            }
        },
        danger: true,
    },
    {
        label: !isOwner ? (isFavorite(item.id) ? '取消收藏' : '收藏') : null,
        icon: Icons.Heart,
        onClick: () => handleAction(() => toggleFavorite(item.id)),
        danger: false,
    }
  ].filter(i => i.label);

  if (menuItems.length === 0) return null;

  const style: React.CSSProperties = anchorPosition ? {
      position: 'absolute',
      left: Math.min(anchorPosition.x, window.innerWidth - 220), // Prevent overflow right
      top: Math.min(anchorPosition.y, window.innerHeight - (menuItems.length * 50) - 20), // Prevent overflow bottom
      zIndex: 100,
  } : {
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: 'none' }}>
        {/* Backdrop for click outside - handled by useEffect, but visual dimming can be added here if needed */}
        {/* <div className="absolute inset-0 bg-black/20 pointer-events-auto" onMouseDown={onClose} /> */}
        
        <div 
            ref={menuRef}
            className="bg-zinc-800/60 backdrop-blur-xl backdrop-saturate-150 border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[200px] pointer-events-auto animate-[scaleIn_0.1s_ease-out]"
            style={style}
        >
            <div className="p-1.5">
                {menuItems.map((menuItem, idx) => (
                    <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); menuItem.onClick(); }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors ${
                            menuItem.danger 
                            ? 'text-red-500 hover:bg-red-500/10' 
                            : 'text-zinc-300 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {menuItem.icon && <menuItem.icon size={16} />}
                        {menuItem.label}
                    </button>
                ))}
            </div>
        </div>
    </div>
  );
};
