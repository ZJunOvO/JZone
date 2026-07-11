import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LiquidGlassSurface } from './LiquidGlassSurface';

type LiquidGlassMotionProfile = 'menu' | 'player';

interface LiquidGlassMotionContentProps {
  children: React.ReactNode;
  className?: string;
  borderRadiusClass?: string;
  profile?: LiquidGlassMotionProfile;
}

const motionProfiles = {
  menu: {
    duration: 0.56,
    initialScale: 0.84,
    overshootScale: 1.035,
    initialBlur: 14,
    exitScale: 0.88,
    exitBlur: 10,
  },
  player: {
    duration: 0.46,
    initialScale: 0.92,
    overshootScale: 1.02,
    initialBlur: 9,
    exitScale: 0.94,
    exitBlur: 7,
  },
} as const;

export const LiquidGlassMotionContent: React.FC<LiquidGlassMotionContentProps> = ({
  children,
  className = '',
  borderRadiusClass = 'rounded-2xl',
  profile = 'menu',
}) => {
  const reduceMotion = useReducedMotion();
  const config = motionProfiles[profile];
  const animation = React.useMemo(() => {
    const transition = reduceMotion
      ? { duration: 0.14, ease: 'easeOut' as const }
      : {
          duration: config.duration,
          times: [0, 0.72, 1],
          ease: [0.22, 0.74, 0.22, 1] as [number, number, number, number],
        };
    return {
      transition,
      rimInitial: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: config.initialScale },
      rimAnimate: reduceMotion
        ? { opacity: 1 }
        : { opacity: [0, 0.92, 1], scale: [config.initialScale, config.overshootScale, 1] },
      rimExit: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: config.exitScale },
      contentInitial: reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: config.initialScale, filter: `blur(${config.initialBlur}px)` },
      contentAnimate: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: [0, 0.9, 1],
            scale: [config.initialScale, config.overshootScale, 1],
            filter: [`blur(${config.initialBlur}px)`, 'blur(1.5px)', 'blur(0px)'],
          },
      contentExit: reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: config.exitScale, filter: `blur(${config.exitBlur}px)` },
    };
  }, [config, reduceMotion]);

  return (
    <>
      <LiquidGlassSurface material="shuding" coverage="full" borderRadiusClass={borderRadiusClass} />
      <motion.div
        aria-hidden
        className={`liquid-glass-elastic-rim pointer-events-none absolute inset-0 z-[2] ${borderRadiusClass}`}
        initial={animation.rimInitial}
        animate={animation.rimAnimate}
        exit={animation.rimExit}
        transition={animation.transition}
      />
      <motion.div
        className={`relative z-10 ${className}`}
        initial={animation.contentInitial}
        animate={animation.contentAnimate}
        exit={animation.contentExit}
        transition={animation.transition}
      >
        {children}
      </motion.div>
    </>
  );
};
