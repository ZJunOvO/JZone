import React from 'react';

const isStandaloneDisplay = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
};

const requestDocumentFullscreen = async () => {
  if (isStandaloneDisplay()) return;
  if (document.fullscreenElement) return;
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen ?? root.msRequestFullscreen;
  if (!request) return;
  await request.call(root);
};

const isNativeFilePickerGesture = (event: Event) => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    if (target instanceof HTMLInputElement && target.type === 'file') return true;
    if (target instanceof HTMLLabelElement) {
      const input = target.htmlFor ? document.getElementById(target.htmlFor) : target.querySelector('input[type="file"]');
      if (input instanceof HTMLInputElement && input.type === 'file') return true;
    }
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const label = target.closest('label');
  if (!label) return false;
  const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input[type="file"]');
  return input instanceof HTMLInputElement && input.type === 'file';
};

export const useAutoFullscreen = () => {
  React.useEffect(() => {
    let disposed = false;
    let armed = true;

    const tryEnterFullscreen = () => {
      if (disposed || !armed) return;
      requestDocumentFullscreen()
        .then(() => {
          armed = false;
        })
        .catch(() => {
          // 多数浏览器要求用户手势，下面的一次性监听负责兜底。
        });
    };

    const onFirstGesture = (event: Event) => {
      if (isNativeFilePickerGesture(event)) {
        window.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true });
        window.addEventListener('touchend', onFirstGesture, { once: true, capture: true });
        return;
      }
      tryEnterFullscreen();
    };

    window.setTimeout(tryEnterFullscreen, 120);
    window.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true });
    window.addEventListener('touchend', onFirstGesture, { once: true, capture: true });
    window.addEventListener('keydown', onFirstGesture, { once: true, capture: true });

    return () => {
      disposed = true;
      window.removeEventListener('pointerdown', onFirstGesture, { capture: true } as any);
      window.removeEventListener('touchend', onFirstGesture, { capture: true } as any);
      window.removeEventListener('keydown', onFirstGesture, { capture: true } as any);
    };
  }, []);
};
