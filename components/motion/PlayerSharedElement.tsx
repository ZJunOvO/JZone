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
  PLAYER_SHARED_TRANSITION,
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
  const progress = useMotionValue(phase === 'opening' && !reduceMotion ? 0 : 1);
  sourceRectRef.current = sourceRect;

  const x = useTransform(progress, (value) => sourceTransformRef.current.x * (1 - value));
  const y = useTransform(progress, (value) => sourceTransformRef.current.y * (1 - value));
  const scaleX = useTransform(progress, (value) => sourceTransformRef.current.scaleX + (1 - sourceTransformRef.current.scaleX) * value);
  const scaleY = useTransform(progress, (value) => sourceTransformRef.current.scaleY + (1 - sourceTransformRef.current.scaleY) * value);

  const stopAnimation = React.useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const animateTo = React.useCallback((target: 0 | 1, duration: number) => {
    stopAnimation();
    animationRef.current = animate(progress, target, { duration, ease: SHARED_EASE });
  }, [progress, stopAnimation]);

  const measure = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return false;
    const target = anchor.getBoundingClientRect();
    if (target.width <= 0 || target.height <= 0) return false;
    const source = sourceRectRef.current;
    sourceTransformRef.current = {
      x: source.left - target.left,
      y: source.top - target.top,
      scaleX: source.width / target.width,
      scaleY: source.height / target.height,
    };
    return true;
  }, []);

  React.useLayoutEffect(() => {
    if (!measure()) return;
    const initialPhase = initialPhaseRef.current;
    lastPhaseRef.current = initialPhase;
    if (initialPhase === 'opening' && !reduceMotion) {
      progress.set(0);
      requestAnimationFrame(() => animateTo(1, PLAYER_SHARED_TRANSITION.duration));
    } else {
      progress.set(initialPhase === 'closing' && !reduceMotion ? 0 : 1);
    }

    const anchor = anchorRef.current;
    if (!anchor || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [animateTo, measure, progress, reduceMotion]);

  React.useLayoutEffect(() => {
    if (lastPhaseRef.current === phase) return;
    lastPhaseRef.current = phase;
    if (phase === 'closing') measure();
    if (reduceMotion || phase === 'open') {
      stopAnimation();
      progress.set(1);
      return;
    }
    animateTo(phase === 'closing' ? 0 : 1, phase === 'closing' ? PLAYER_SHELL_EXIT_DURATION : PLAYER_SHARED_TRANSITION.duration);
  }, [animateTo, measure, phase, progress, reduceMotion, stopAnimation]);

  React.useEffect(() => stopAnimation, [stopAnimation]);

  return (
    <div ref={anchorRef} className={className} data-player-shared-target={name}>
      <motion.div
        className="h-full w-full origin-top-left"
        style={{ x, y, scaleX, scaleY, willChange: 'transform' }}
        data-shared-element={`song-${name}`}
      >
        {children}
      </motion.div>
    </div>
  );
};
