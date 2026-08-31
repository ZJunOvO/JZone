import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from '../Icons';
import { useModalPresence } from '../../modalPresence';

interface AchievementCelebrationProps {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  onClose: () => void;
}

export const AchievementCelebration: React.FC<AchievementCelebrationProps> = ({ open, title, description, detail, onClose }) => {
  useModalPresence(open);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(onClose, reduceMotion ? 1800 : 4200);
    return () => window.clearTimeout(timer);
  }, [onClose, open, reduceMotion]);

  return createPortal((
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[310] grid place-items-center overflow-hidden bg-black/48 px-8 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.34 }}
          onClick={onClose}
          data-testid="achievement-celebration"
        >
          <motion.div
            className="relative flex max-w-sm flex-col items-center text-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72, y: 24 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -10 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 210, damping: 18, mass: 0.86 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative grid h-28 w-28 place-items-center" aria-hidden="true">
              {[0, 45, 90, 135].map((rotation) => (
                <motion.span
                  key={rotation}
                  className="absolute h-[2px] w-40 bg-gradient-to-r from-transparent via-red-200/70 to-transparent"
                  style={{ rotate: rotation }}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: [0, 1, 0.78], opacity: [0, 0.8, 0.28] }}
                  transition={{ duration: 0.72, delay: 0.08 }}
                />
              ))}
              <motion.span
                className="relative grid h-24 w-24 place-items-center rounded-full border border-white/25 bg-white/[0.11] text-red-100 shadow-[0_18px_70px_rgba(248,113,113,.28)] backdrop-blur-2xl"
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 0.74, 0.22, 1] }}
              ><Icons.Trophy size={39} strokeWidth={1.45} /></motion.span>
            </div>
            <p className="mt-7 text-[11px] font-black text-red-200/75">新成就</p>
            <h2 className="mt-2 text-3xl font-black text-white">{title}</h2>
            <p className="mt-3 text-sm font-bold leading-6 text-white/62">{description}</p>
            {detail ? <p className="mt-5 text-sm font-black tabular-nums text-white">{detail}</p> : null}
            <button type="button" onClick={onClose} className="mt-8 min-h-11 px-6 text-sm font-black text-white/72" aria-label="关闭成就演出">收下这一刻</button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  ), document.body);
};
