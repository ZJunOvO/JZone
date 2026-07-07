import React, { useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { CollectionRow, CollectionVisibility } from '../supabaseApi';

export const CollectionContextMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  anchorPosition?: { x: number; y: number };
  collection: CollectionRow;
  isOwner: boolean;
  onToggleVisibility: (next: CollectionVisibility) => void;
  onEdit: () => void;
  onSearch?: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}> = ({ isOpen, onClose, anchorPosition, collection, isOwner, onToggleVisibility, onEdit, onSearch, onDelete, onTogglePin }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    if (isOpen) setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (!isOwner) return null;

  const nextVis: CollectionVisibility = collection.visibility === 'public' ? 'private' : 'public';
  const objectLabel = collection.type === 'album' ? '专辑' : '歌单';

  const style: React.CSSProperties = anchorPosition
    ? {
        position: 'absolute',
        left: Math.min(anchorPosition.x, window.innerWidth - 220),
        top: Math.min(anchorPosition.y, window.innerHeight - 160),
        zIndex: 100,
      }
    : {
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
      };

  return (
    <div className="fixed inset-0 z-[260]" style={{ pointerEvents: 'none' }}>
      <div
        ref={menuRef}
        className="bg-zinc-800/60 backdrop-blur-xl backdrop-saturate-150 border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[200px] pointer-events-auto animate-[scaleIn_0.1s_ease-out]"
        style={style}
      >
        <div className="p-1.5">
          {onSearch && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSearch();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
            >
              <Icons.Search size={16} />
              搜索此{objectLabel}
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
          >
            <Icons.Pin size={16} />
            {collection.pinned_at ? `取消置顶此${objectLabel}` : `置顶此${objectLabel}`}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
          >
            <Icons.Edit size={16} />
            编辑{objectLabel}信息
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(nextVis);
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
          >
            {nextVis === 'public' ? <Icons.Globe size={16} /> : <Icons.Lock size={16} />}
            {nextVis === 'public' ? `设为公开${objectLabel}` : `设为私有${objectLabel}`}
          </button>

          <div className="h-px bg-white/5 my-1" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-red-500 hover:bg-red-500/10"
          >
            <Icons.Trash size={16} />
            删除此{objectLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
