import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';

interface PersonalizationEntryProps {
  onOpen: () => void;
}

export const PersonalizationEntry: React.FC<PersonalizationEntryProps> = ({ onOpen }) => (
  <motion.button
    type="button"
    onClick={onOpen}
    className="group flex min-h-16 w-full items-center gap-4 border-y border-white/[0.07] px-6 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
    whileTap={{ scale: 0.992 }}
    data-testid="profile-personalization-entry"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/85">
      <Icons.Sparkles size={18} strokeWidth={1.7} aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-bold text-white">个性空间</span>
      <span className="mt-0.5 block truncate text-xs font-medium text-white/42">播放器 · 头像框 · 成就</span>
    </span>
    <span className="flex items-center -space-x-1.5 text-white/42" aria-hidden="true">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/40 bg-[#26262a]"><Icons.Disc size={13} /></span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/40 bg-[#303036]"><Icons.Frame size={13} /></span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/40 bg-[#3a3033]"><Icons.Trophy size={13} /></span>
    </span>
    <Icons.ChevronRight size={17} className="text-white/28 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55" aria-hidden="true" />
  </motion.button>
);
