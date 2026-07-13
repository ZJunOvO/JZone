import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface PlayerArtworkTransitionProps {
  artworkKey: string;
  direction: -1 | 1;
  children: React.ReactNode;
  className?: string;
}

export const PlayerArtworkTransition: React.FC<PlayerArtworkTransitionProps> = ({
  artworkKey,
  direction,
  children,
  className = '',
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <div className={`relative h-full w-full overflow-hidden [perspective:900px] ${className}`} data-testid="player-artwork-stage">
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={artworkKey}
          custom={direction}
          className="absolute inset-0"
          data-testid="player-artwork-layer"
          variants={{
            enter: (move: number) => reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, x: `${move * 16}%`, scale: 0.94, rotateY: move * -7 },
            center: { opacity: 1, x: '0%', scale: 1, rotateY: 0 },
            exit: (move: number) => reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, x: `${move * -12}%`, scale: 0.95, rotateY: move * 6 },
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={reduceMotion
            ? { duration: 0.14, ease: 'easeOut' }
            : { duration: 0.42, ease: [0.22, 0.74, 0.22, 1] }}
          style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
