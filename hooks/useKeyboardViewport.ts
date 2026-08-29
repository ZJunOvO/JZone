import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

interface KeyboardViewportResult {
  scrollRef: RefObject<HTMLDivElement | null>;
  overlayStyle: CSSProperties | undefined;
  panelMaxHeight: number | null;
}

export const useKeyboardViewport = (active: boolean): KeyboardViewportResult => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initialWindowScrollRef = useRef(0);
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setViewport(null);
      return undefined;
    }

    initialWindowScrollRef.current = window.scrollY;
    const visualViewport = window.visualViewport;
    const timers = new Set<number>();

    const revealFocusedInput = () => {
      const scroller = scrollRef.current;
      const activeElement = document.activeElement;
      if (!scroller || !(activeElement instanceof HTMLTextAreaElement) || !scroller.contains(activeElement)) return;
      const visibleTop = visualViewport?.offsetTop ?? 0;
      const visibleHeight = visualViewport?.height ?? window.innerHeight;
      const desiredTop = visibleTop + Math.min(112, visibleHeight * 0.22);
      const desiredBottom = visibleTop + visibleHeight - 28;
      const rect = activeElement.getBoundingClientRect();
      if (rect.top < desiredTop) {
        scroller.scrollBy({ top: rect.top - desiredTop, behavior: 'smooth' });
      } else if (rect.bottom > desiredBottom) {
        scroller.scrollBy({ top: rect.bottom - desiredBottom, behavior: 'smooth' });
      }
    };

    const scheduleReveal = () => {
      [0, 120, 280, 480].forEach((delay) => {
        const timer = window.setTimeout(revealFocusedInput, delay);
        timers.add(timer);
      });
    };

    const updateViewport = () => {
      if (visualViewport) {
        setViewport({
          height: Math.round(visualViewport.height),
          offsetTop: Math.round(visualViewport.offsetTop),
        });
        if (visualViewport.height >= window.innerHeight - 8 && visualViewport.offsetTop <= 1) {
          window.scrollTo({ top: initialWindowScrollRef.current, left: 0, behavior: 'auto' });
        }
      } else {
        setViewport(null);
      }
      scheduleReveal();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLTextAreaElement) || !scrollRef.current?.contains(event.target)) return;
      scheduleReveal();
    };
    const restoreWindowPosition = () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: initialWindowScrollRef.current, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = initialWindowScrollRef.current;
      document.body.scrollTop = initialWindowScrollRef.current;
    };

    updateViewport();
    document.addEventListener('focusin', handleFocusIn);
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('focusin', handleFocusIn);
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.requestAnimationFrame(restoreWindowPosition);
    };
  }, [active]);

  return {
    scrollRef,
    overlayStyle: viewport
      ? { top: `${viewport.offsetTop}px`, bottom: 'auto', height: `${viewport.height}px` }
      : undefined,
    panelMaxHeight: viewport ? Math.max(220, viewport.height - 24) : null,
  };
};
