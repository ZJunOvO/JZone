import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ProfileAvatarTransitionDetail } from './profileAvatarTransition';

type ActiveTransition = ProfileAvatarTransitionDetail & {
  target: { left: number; top: number; width: number; height: number };
  phase: 'waiting' | 'moving';
};

const getDestinationSelector = (destination: ProfileAvatarTransitionDetail['destination']) => (
  destination === 'home'
    ? '[data-profile-home-avatar-target="true"]'
    : '[data-profile-avatar-target="true"]'
);

export const ProfileAvatarRouteTransition: React.FC<{ activeTab: string }> = ({ activeTab }) => {
  const reduceMotion = useReducedMotion();
  const hiddenTargetRef = React.useRef<HTMLElement | null>(null);
  const [pending, setPending] = React.useState<ProfileAvatarTransitionDetail | null>(null);
  const [transition, setTransition] = React.useState<ActiveTransition | null>(null);

  const revealTarget = React.useCallback(() => {
    if (hiddenTargetRef.current) hiddenTargetRef.current.style.visibility = '';
    hiddenTargetRef.current = null;
    delete document.documentElement.dataset.profileAvatarTransition;
  }, []);

  const finishTransition = React.useCallback(() => {
    revealTarget();
  }, [revealTarget]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const rawDetail = (event as CustomEvent<ProfileAvatarTransitionDetail>).detail;
      const detail = { ...rawDetail, destination: rawDetail.destination ?? 'profile' };
      document.documentElement.dataset.profileAvatarTransition = 'pending';
      setPending(detail);
      // 先冻结源头像，避免个人页懒加载期间共享元素短暂消失。
      setTransition({ ...detail, target: detail.rect, phase: 'waiting' });
    };
    window.addEventListener('jzone:profile-avatar-transition', handler);
    return () => {
      window.removeEventListener('jzone:profile-avatar-transition', handler);
      finishTransition();
    };
  }, [finishTransition]);

  React.useLayoutEffect(() => {
    if (!pending || activeTab !== pending.destination) return;
    let frame = 0;
    let attempts = 0;
    const locateTarget = () => {
      const target = document.querySelector<HTMLElement>(getDestinationSelector(pending.destination));
      if (!target || target.getBoundingClientRect().width <= 0) {
        attempts += 1;
        if (attempts < 60) frame = window.requestAnimationFrame(locateTarget);
        else {
          setPending(null);
          finishTransition();
        }
        return;
      }
      const rect = target.getBoundingClientRect();
      const request = pending;
      setPending(null);
      target.style.visibility = 'hidden';
      hiddenTargetRef.current = target;
      setTransition((current) => ({
        ...(current ?? request),
        target: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        phase: 'moving',
      }));
    };
    locateTarget();
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, finishTransition, pending]);

  React.useEffect(() => {
    const destination = pending?.destination ?? transition?.destination;
    if (destination && activeTab === destination) return;
    if (pending || transition) return;
    setPending(null);
    setTransition(null);
    finishTransition();
  }, [activeTab, finishTransition, pending, transition]);

  return (
    <AnimatePresence initial={false}>
      {transition ? (
        <motion.div
          key="profile-avatar-route-transition"
          className="pointer-events-none fixed z-[190] overflow-hidden rounded-full bg-zinc-800 shadow-2xl ring-1 ring-white/15"
          data-testid="profile-avatar-route-transition"
          aria-hidden="true"
          style={{
            left: transition.rect.left,
            top: transition.rect.top,
            width: transition.rect.width,
            height: transition.rect.height,
            transformOrigin: '0 0',
            willChange: 'transform, opacity',
            contain: 'layout paint style',
          }}
          initial={{
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
          }}
          animate={{
            x: transition.target.left - transition.rect.left,
            y: transition.target.top - transition.rect.top,
            scaleX: transition.target.width / transition.rect.width,
            scaleY: transition.target.height / transition.rect.height,
            opacity: 1,
          }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
          transition={transition.phase === 'waiting'
            ? { duration: 0 }
            : reduceMotion
              ? { duration: 0.12, ease: 'easeOut' }
              : { duration: 0.52, ease: [0.22, 0.74, 0.22, 1] }}
          onAnimationComplete={() => {
            if (transition.phase !== 'moving') return;
            // 先显示真实目标，再淡出完全重合的覆盖层，避免终点出现空白闪帧。
            revealTarget();
            setTransition(null);
          }}
        >
          {transition.src ? (
            <img src={transition.src} alt="" className="h-full w-full object-cover" decoding="async" />
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
