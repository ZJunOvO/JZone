import React from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'framer-motion';
import {
  createPlayerSettleCurve,
  PLAYER_SHARED_TRANSITION,
  PLAYER_SETTLE_DURATION,
  PLAYER_SHELL_EXIT_DURATION,
  type PlayerElementRect,
  type PlayerTransitionPhase,
} from './playerTransition';

interface PlayerSharedElementProps {
  children: React.ReactNode;
  className?: string;
  sourceRect: PlayerElementRect;
  phase: PlayerTransitionPhase;
  name: 'cover' | 'title' | 'artist';
}

const IDENTITY = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
const SHARED_EASE = [...PLAYER_SHARED_TRANSITION.ease] as [number, number, number, number];
const COVER_SETTLE_CURVE = createPlayerSettleCurve(1.0055);

export const PlayerSharedElement: React.FC<PlayerSharedElementProps> = ({
  children,
  className = '',
  sourceRect,
  phase,
  name,
}) => {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const sourceRectRef = React.useRef(sourceRect);
  const sourceTransformRef = React.useRef(IDENTITY);
  const initialPhaseRef = React.useRef(phase);
  const lastPhaseRef = React.useRef<PlayerTransitionPhase | null>(null);
  const animationRef = React.useRef<AnimationPlaybackControls | null>(null);
  const animationSequenceRef = React.useRef(0);
  const settleStartedRef = React.useRef(false);
  const settleAnimationRef = React.useRef<AnimationPlaybackControls | null>(null);
  const progress = useMotionValue(phase === 'opening' && !reduceMotion ? 0 : 1);
  const settleScale = useMotionValue(1);
  sourceRectRef.current = sourceRect;

  const x = useTransform(progress, (value) => sourceTransformRef.current.x * (1 - value));
  const y = useTransform(progress, (value) => sourceTransformRef.current.y * (1 - value));
  const scaleX = useTransform(progress, (value) => sourceTransformRef.current.scaleX + (1 - sourceTransformRef.current.scaleX) * value);
  const scaleY = useTransform(progress, (value) => sourceTransformRef.current.scaleY + (1 - sourceTransformRef.current.scaleY) * value);
  const opacity = useTransform(progress, [0, 0.16, 0.36], [0, 1, 1]);

  const stopAnimation = React.useCallback(() => {
    animationSequenceRef.current += 1;
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const stopSettleAnimation = React.useCallback(() => {
    settleAnimationRef.current?.stop();
    settleAnimationRef.current = null;
    settleScale.set(1);
    settleStartedRef.current = false;
  }, [settleScale]);

  const startSettleAnimation = React.useCallback(() => {
    if (name !== 'cover' || reduceMotion) return;
    if (settleStartedRef.current) return;
    settleStartedRef.current = true;
    settleAnimationRef.current?.stop();
    settleScale.set(1);
    settleAnimationRef.current = animate(settleScale, COVER_SETTLE_CURVE.values, {
      duration: PLAYER_SETTLE_DURATION,
      times: COVER_SETTLE_CURVE.times,
      ease: 'linear',
    });
  }, [name, reduceMotion, settleScale]);

  const animateTo = React.useCallback((target: 0 | 1, duration: number) => {
    stopAnimation();
    const sequence = animationSequenceRef.current;
    const controls = animate(progress, target, { duration, ease: SHARED_EASE });
    animationRef.current = controls;
    void controls.then(() => {
      if (animationSequenceRef.current !== sequence || target !== 1) return;
      animationRef.current = null;
      startSettleAnimation();
    });
  }, [progress, startSettleAnimation, stopAnimation]);

  const measure = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return false;
    const target = anchor.getBoundingClientRect();
    if (target.width <= 0 || target.height <= 0) return false;
    const source = sourceRectRef.current;
    const uniformScale = source.height / target.height;
    sourceTransformRef.current = {
      x: source.left - target.left,
      y: source.top - target.top,
      scaleX: uniformScale,
      scaleY: uniformScale,
    };
    return true;
  }, []);

  React.useLayoutEffect(() => {
    if (!measure()) return;
    const initialPhase = initialPhaseRef.current;
    lastPhaseRef.current = initialPhase;
    if (initialPhase === 'opening' && !reduceMotion) {
      progress.set(0);
    } else {
      progress.set(initialPhase === 'closing' && !reduceMotion ? 0 : 1);
    }

    const anchor = anchorRef.current;
    if (!anchor || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [animateTo, measure, progress, reduceMotion]);

  React.useEffect(() => {
    if (initialPhaseRef.current === 'opening' && !reduceMotion) {
      animateTo(1, PLAYER_SHARED_TRANSITION.duration);
    }
    return stopAnimation;
  }, [animateTo, reduceMotion, stopAnimation]);

  React.useLayoutEffect(() => {
    if (lastPhaseRef.current === phase) return;
    lastPhaseRef.current = phase;
    if (phase === 'closing') {
      measure();
      stopSettleAnimation();
    }
    if (reduceMotion) {
      stopAnimation();
      stopSettleAnimation();
      progress.set(1);
      return;
    }
    if (phase === 'open') {
      stopAnimation();
      progress.set(1);
      startSettleAnimation();
      return;
    }
    animateTo(phase === 'closing' ? 0 : 1, phase === 'closing' ? PLAYER_SHELL_EXIT_DURATION : PLAYER_SHARED_TRANSITION.duration);
  }, [animateTo, measure, phase, progress, reduceMotion, startSettleAnimation, stopAnimation, stopSettleAnimation]);

  React.useEffect(() => () => {
    stopAnimation();
    stopSettleAnimation();
  }, [stopAnimation, stopSettleAnimation]);

  return (
    <div ref={anchorRef} className={className} data-player-shared-target={name}>
      <motion.div
        className="h-full w-full origin-top-left"
        style={{ x, y, scaleX, scaleY, opacity, willChange: 'transform, opacity' }}
        data-shared-element={`song-${name}`}
      >
        <motion.div
          className="h-full w-full"
          style={{ scale: settleScale, transformOrigin: '50% 50%' }}
          data-player-shared-settle={name}
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
};
