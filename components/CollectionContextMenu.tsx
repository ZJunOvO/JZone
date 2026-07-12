import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from './Icons';
import { CollectionRow, CollectionVisibility } from '../supabaseApi';
import { getAnchoredMenuPlacement } from '../utils/menuPlacement';
import { LiquidGlassMotionContent } from './LiquidGlassMotionContent';

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
  const closeTimerRef = useRef<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(onClose, 400);
  }, [isClosing, onClose]);

  useEffect(() => {
    if (isOpen) setIsClosing(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) requestClose();
    };
    if (isOpen && !isClosing) setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isClosing, isOpen, requestClose]);

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
              requestClose();
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
        requestClose();
      },
    },
    {
      key: 'edit',
      icon: Icons.Edit,
      label: `编辑${objectLabel}信息`,
      danger: false,
      onClick: () => {
        onEdit();
        requestClose();
      },
    },
    {
      key: 'visibility',
      icon: nextVis === 'public' ? Icons.Globe : Icons.Lock,
      label: nextVis === 'public' ? `设为公开${objectLabel}` : `设为私有${objectLabel}`,
      danger: false,
      onClick: () => {
        onToggleVisibility(nextVis);
        requestClose();
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
        requestClose();
      },
    },
  ];

  const placement = getAnchoredMenuPlacement(anchorPosition, menuEntries.filter((entry) => !('divider' in entry)).length);
  const style: React.CSSProperties = anchorPosition
    ? {
        position: 'fixed',
        zIndex: 260,
        left: placement?.left ?? 12,
        top: placement?.top ?? 12,
      }
    : {
        position: 'fixed',
        bottom: 24,
        left: 'calc(50% - 118px)',
        zIndex: 260,
      };
  const visibleEntries = placement?.opensUp ? [...menuEntries].reverse() : menuEntries;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className={`liquid-context-menu-panel relative w-[236px] rounded-2xl ${isClosing ? 'pointer-events-none' : 'pointer-events-auto'}`}
          style={style}
          data-liquid-control-root
          animate={anchorPosition ? { left: placement?.left ?? 12, top: placement?.top ?? 12 } : undefined}
          transition={{
            left: { type: 'spring', stiffness: 500, damping: 40, mass: 0.78 },
            top: { type: 'spring', stiffness: 500, damping: 40, mass: 0.78 },
          }}
        >
        <LiquidGlassMotionContent profile="menu" className="p-1.5" closing={isClosing}>
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
        </LiquidGlassMotionContent>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
