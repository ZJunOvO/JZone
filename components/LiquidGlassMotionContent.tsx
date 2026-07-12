import React from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { LiquidGlassSurface } from './LiquidGlassSurface';

type LiquidGlassMotionProfile = 'menu' | 'player';

interface LiquidGlassMotionContentProps {
  children: React.ReactNode;
  className?: string;
  borderRadiusClass?: string;
  profile?: LiquidGlassMotionProfile;
  closing?: boolean;
  animateOnMount?: boolean;
  settlePulse?: number;
}

const motionProfiles = {
  menu: {
    duration: 0.84,
    exitDuration: 0.36,
    initialScale: 0.88,
    overshootScale: 1.028,
    initialBlur: 18,
    exitScale: 0.9,
    exitBlur: 14,
    verticalInset: 16,
    horizontalInset: 12,
  },
  player: {
    duration: 0.72,
    exitDuration: 0.58,
    initialScale: 0.92,
    overshootScale: 1.018,
    initialBlur: 14,
    exitScale: 0.93,
    exitBlur: 11,
    verticalInset: 5,
    horizontalInset: 12,
  },
} as const;

export const LiquidGlassMotionContent: React.FC<LiquidGlassMotionContentProps> = ({
  children,
  className = '',
  borderRadiusClass = 'rounded-2xl',
  profile = 'menu',
  closing = false,
  animateOnMount = true,
  settlePulse = 0,
}) => {
  const reduceMotion = useReducedMotion();
  const contentControls = useAnimationControls();
  const previousClosingRef = React.useRef(closing);
  const previousSettlePulseRef = React.useRef(settlePulse);
  const config = motionProfiles[profile];
  const animation = React.useMemo(() => {
    const enterTransition = reduceMotion
      ? { duration: 0.14, ease: 'easeOut' as const }
      : {
          duration: config.duration,
          times: [0, 0.34, 0.78, 1],
          ease: [0.22, 0.74, 0.22, 1] as [number, number, number, number],
        };
    const exitTransition = reduceMotion
      ? { duration: 0.14, ease: 'easeOut' as const }
      : { duration: config.exitDuration, ease: [0.32, 0, 0.24, 1] as [number, number, number, number] };
    return {
      enterTransition,
      exitTransition,
      shellInitial: reduceMotion
        ? { top: 0, right: 0, bottom: 0, left: 0, opacity: 1 }
        : {
            top: config.verticalInset,
            right: config.horizontalInset,
            bottom: config.verticalInset,
            left: config.horizontalInset,
            opacity: 0.58,
          },
      shellEnter: reduceMotion
        ? { top: 0, right: 0, bottom: 0, left: 0, opacity: 1 }
        : {
            top: [config.verticalInset, 6, -2, 0],
            right: [config.horizontalInset, 5, -2, 0],
            bottom: [config.verticalInset, 6, -2, 0],
            left: [config.horizontalInset, 5, -2, 0],
            opacity: [0.58, 0.86, 1, 1],
          },
      shellClose: reduceMotion
        ? { top: 0, right: 0, bottom: 0, left: 0, opacity: 0 }
        : {
            top: config.verticalInset * 0.72,
            right: config.horizontalInset * 0.72,
            bottom: config.verticalInset * 0.72,
            left: config.horizontalInset * 0.72,
            opacity: 0,
          },
      contentInitial: reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: config.initialScale, filter: `blur(${config.initialBlur}px)` },
      contentAnimate: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: [0, 0.58, 0.94, 1],
            scale: [config.initialScale, 0.97, config.overshootScale, 1],
            filter: [`blur(${config.initialBlur}px)`, `blur(${config.initialBlur * 0.58}px)`, 'blur(1.5px)', 'blur(0px)'],
          },
      contentClose: reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: config.exitScale, filter: `blur(${config.exitBlur}px)` },
    };
  }, [config, reduceMotion]);
  const isSettling = settlePulse > 0 && !closing && !reduceMotion;
  const settleTransition = {
    duration: 0.28,
    times: [0, 0.38, 0.7, 1],
    ease: [0.22, 0.72, 0.18, 1] as [number, number, number, number],
  };

  React.useEffect(() => {
    const wasClosing = previousClosingRef.current;
    const wasSettling = previousSettlePulseRef.current > 0;
    previousClosingRef.current = closing;
    previousSettlePulseRef.current = settlePulse;
    if (closing) {
      void contentControls.start({ ...animation.contentClose, transition: animation.exitTransition });
      return;
    }
    if (isSettling) {
      void contentControls.start(
        { opacity: 1, scale: [1, 1.026, 0.994, 1], filter: 'blur(0px)', transition: settleTransition },
      );
      return;
    }
    if (wasClosing || wasSettling) {
      contentControls.set({ opacity: 1, scale: 1, filter: 'blur(0px)' });
      return;
    }
    if (animateOnMount) {
      void contentControls.start({ ...animation.contentAnimate, transition: animation.enterTransition });
    } else {
      contentControls.set({ opacity: 1, scale: 1, filter: 'blur(0px)' });
    }
  }, [animateOnMount, animation, closing, contentControls, isSettling, settlePulse]);

  return (
    <>
      <motion.div
        aria-hidden
        className={`liquid-glass-motion-shell pointer-events-none absolute z-[2] overflow-hidden ${borderRadiusClass}`}
        data-liquid-motion-shell
        initial={animateOnMount ? animation.shellInitial : false}
        animate={closing
          ? animation.shellClose
          : animateOnMount
            ? animation.shellEnter
            : { top: 0, right: 0, bottom: 0, left: 0, opacity: 1 }}
        transition={closing ? animation.exitTransition : animation.enterTransition}
      >
        <LiquidGlassSurface
          material="shuding"
          coverage="full"
          geometry={profile === 'menu' ? 'panel' : 'standard'}
          eagerMap
          borderRadiusClass={borderRadiusClass}
        />
        <div className={`liquid-glass-elastic-rim pointer-events-none absolute inset-0 z-[2] ${borderRadiusClass}`} />
      </motion.div>
      {isSettling && (
        <motion.div
          key={`settle-rim-${settlePulse}`}
          aria-hidden
          className={`liquid-glass-elastic-rim pointer-events-none absolute z-[3] ${borderRadiusClass}`}
          initial={{ top: 0, right: 0, bottom: 0, left: 0, opacity: 0.35 }}
          animate={{
            top: [0, -2.4, 1, 0],
            right: [0, -2.4, 1, 0],
            bottom: [0, -2.4, 1, 0],
            left: [0, -2.4, 1, 0],
            opacity: [0.35, 1, 0.55, 0],
          }}
          transition={settleTransition}
          data-liquid-settle-rim
        />
      )}
      <motion.div
        className={`relative z-10 overflow-hidden ${borderRadiusClass} ${className}`}
        initial={animateOnMount ? animation.contentInitial : false}
        animate={contentControls}
        data-liquid-settle-content
      >
        {children}
      </motion.div>
    </>
  );
};
