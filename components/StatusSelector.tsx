import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './Icons';

interface StatusOption {
  emoji: string;
  text: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { emoji: "🟢", text: "在线" },
  { emoji: "😶", text: "Emo了" },
  { emoji: "🤩", text: "超开心" },
  { emoji: "🌠", text: "许个愿" },
  { emoji: "😴", text: "补觉中" },
  { emoji: "👨‍🦲", text: "头秃" },
  { emoji: "😫", text: "失眠" },
  { emoji: "💪", text: "加油" },
];

interface StatusSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus?: { emoji?: string; text?: string };
  onSelect: (status: StatusOption) => void;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({
  isOpen,
  onClose,
  currentStatus,
  onSelect,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-10 h-1 bg-zinc-700 rounded-full" />
          </div>
          <div className="px-6 pb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">状态设置</h3>
            <button onClick={onClose} className="p-2 -mr-2 text-zinc-400 hover:text-white">
               <Icons.X size={20} />
            </button>
          </div>

          {/* Grid */}
          <div className="p-6 grid grid-cols-4 gap-4 pb-12">
            {STATUS_OPTIONS.map((option) => {
              const isActive = currentStatus?.text === option.text && currentStatus?.emoji === option.emoji;
              return (
                <button
                  key={option.text}
                  onClick={() => onSelect(option)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-white/10 ring-1 ring-white/20 scale-105' 
                      : 'hover:bg-white/5 active:scale-95'
                  }`}
                >
                  <span className="text-3xl">{option.emoji}</span>
                  <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                    {option.text}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
