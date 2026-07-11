import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from './Icons';
import { CollectionRow, CollectionVisibility } from '../supabaseApi';
import { getAnchoredMenuPlacement } from '../utils/menuPlacement';
import { LiquidGlassSurface } from './LiquidGlassSurface';

export const CollectionContextMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  anchorPosition?: { x: number; y: number };
  collection: CollectionRow;
  canManageCollection: boolean;
  onToggleVisibility: (next: CollectionVisibility) => void;
  onEdit: () => void;
  onSearch?: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}> = ({ isOpen, onClose, anchorPosition, collection, canManageCollection, onToggleVisibility, onEdit, onSearch, onDelete, onTogglePin }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    if (isOpen) setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!canManageCollection) return null;

  const nextVis: CollectionVisibility = collection.visibility === 'public' ? 'private' : 'public';
  const objectLabel = collection.type === 'album' ? '专辑' : '歌单';
  const menuEntries = [
    ...(onSearch
      ? [
          {
            key: 'search',
            icon: Icons.Search,
            label: `搜索此${objectLabel}`,
            danger: false,
            onClick: () => {
              onSearch();
              onClose();
            },
          },
        ]
      : []),
    {
      key: 'pin',
      icon: Icons.Pin,
      label: collection.pinned_at ? `取消置顶此${objectLabel}` : `置顶此${objectLabel}`,
      danger: false,
      onClick: () => {
        onTogglePin();
        onClose();
      },
    },
    {
      key: 'edit',
      icon: Icons.Edit,
      label: `编辑${objectLabel}信息`,
      danger: false,
      onClick: () => {
        onEdit();
        onClose();
      },
    },
    {
      key: 'visibility',
      icon: nextVis === 'public' ? Icons.Globe : Icons.Lock,
      label: nextVis === 'public' ? `设为公开${objectLabel}` : `设为私有${objectLabel}`,
      danger: false,
      onClick: () => {
        onToggleVisibility(nextVis);
        onClose();
      },
    },
    { key: 'divider', divider: true },
    {
      key: 'delete',
      icon: Icons.Trash,
      label: `删除此${objectLabel}`,
      danger: true,
      onClick: () => {
        onDelete();
        onClose();
      },
    },
  ];

  const placement = getAnchoredMenuPlacement(anchorPosition, menuEntries.filter((entry) => !('divider' in entry)).length);
  const style: React.CSSProperties = anchorPosition
    ? {
        position: 'absolute',
        zIndex: 100,
        left: placement?.left ?? 12,
        top: placement?.top ?? 12,
      }
    : {
        position: 'fixed',
        bottom: 24,
        left: '50%',
        zIndex: 100,
      };
  const visibleEntries = placement?.opensUp ? [...menuEntries].reverse() : menuEntries;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[260]"
          style={{ pointerEvents: 'none' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
      <motion.div
        ref={menuRef}
        className={`liquid-context-menu-panel liquid-context-menu-panel--enter ${
          anchorPosition ? (placement?.opensUp ? 'liquid-context-menu-panel--up' : '') : 'liquid-context-menu-panel--centered'
        } relative rounded-2xl w-[236px] pointer-events-auto`}
        style={style}
        data-liquid-control-root
        initial={anchorPosition ? { opacity: 0, left: placement?.left ?? 12, top: placement?.top ?? 12 } : { opacity: 0 }}
        animate={anchorPosition ? { opacity: 1, left: placement?.left ?? 12, top: placement?.top ?? 12 } : { opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          opacity: { duration: 0.34, ease: [0.22, 0.74, 0.22, 1] },
          left: { type: 'spring', stiffness: 560, damping: 42, mass: 0.72 },
          top: { type: 'spring', stiffness: 560, damping: 42, mass: 0.72 },
        }}
      >
        <LiquidGlassSurface material="shuding" />
        <motion.div
          className="relative z-10 p-1.5"
          initial={{ opacity: 0, filter: 'blur(14px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(8px)' }}
          transition={{ duration: 0.46, delay: 0.04, ease: [0.22, 0.74, 0.22, 1] }}
        >
          {visibleEntries.map((entry) => {
            if ('divider' in entry) return <div key={entry.key} className="h-px bg-white/5 my-1" />;
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                onClick={(e) => {
                  e.stopPropagation();
                  entry.onClick();
                }}
                className={`liquid-glass-interactive ${entry.danger ? 'liquid-glass-semantic' : ''} w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors ${
                  entry.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-zinc-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={16} data-liquid-adaptive={entry.danger ? undefined : 'true'} />
                {entry.label}
              </button>
            );
          })}
        </motion.div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};
