import React from 'react';
import {
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'framer-motion';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import { PLAYER_SETTLE_SPRING, PLAYER_SETTLE_VELOCITY } from './motion/playerTransition';

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
  const settleScale = useMotionValue(1);
  const settleAnimationRef = React.useRef<AnimationPlaybackControls | null>(null);
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
  const settleInset = useTransform(settleScale, (value) => Math.min(1, Math.max(-2, (1 - value) * 150)));
  const settleRimOpacity = useTransform(settleScale, (value) => Math.min(1, Math.abs(value - 1) * 90));

  React.useEffect(() => {
    const wasClosing = previousClosingRef.current;
    const wasSettling = previousSettlePulseRef.current > 0;
    previousClosingRef.current = closing;
    previousSettlePulseRef.current = settlePulse;
    if (closing) {
      settleAnimationRef.current?.stop();
      settleScale.set(1);
      void contentControls.start({ ...animation.contentClose, transition: animation.exitTransition });
      return;
    }
    if (isSettling) {
      contentControls.set({ opacity: 1, scale: 1, filter: 'blur(0px)' });
      settleAnimationRef.current?.stop();
      settleScale.set(1);
      settleAnimationRef.current = animate(settleScale, 1, {
        ...PLAYER_SETTLE_SPRING,
        velocity: PLAYER_SETTLE_VELOCITY * 1.15,
      });
      return;
    }
    if (wasClosing || wasSettling) {
      settleAnimationRef.current?.stop();
      settleScale.set(1);
      contentControls.set({ opacity: 1, scale: 1, filter: 'blur(0px)' });
      return;
    }
    if (animateOnMount) {
      void contentControls.start({ ...animation.contentAnimate, transition: animation.enterTransition });
    } else {
      contentControls.set({ opacity: 1, scale: 1, filter: 'blur(0px)' });
    }
  }, [animateOnMount, animation, closing, contentControls, isSettling, settlePulse, settleScale]);

  React.useEffect(() => () => settleAnimationRef.current?.stop(), []);

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
          style={{
            top: settleInset,
            right: settleInset,
            bottom: settleInset,
            left: settleInset,
            opacity: settleRimOpacity,
          }}
          data-liquid-settle-rim
        />
      )}
      <motion.div
        className={`relative z-10 overflow-hidden ${borderRadiusClass} ${className}`}
        initial={animateOnMount ? animation.contentInitial : false}
        animate={contentControls}
      >
        <motion.div
          className="h-full w-full"
          style={{ scale: settleScale, transformOrigin: '50% 50%' }}
          data-liquid-settle-content
        >
          {children}
        </motion.div>
      </motion.div>
    </>
  );
};
