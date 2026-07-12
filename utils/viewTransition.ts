import { flushSync } from 'react-dom';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransition;
};

interface ViewTransition {
  finished: Promise<void>;
  skipTransition: () => void;
}

let activeTransition: ViewTransition | null = null;

const waitForLazyTarget = () => new Promise<void>((resolve) => window.setTimeout(resolve, 48));

export const runViewTransition = (update: () => void) => {
  const documentWithTransition = document as ViewTransitionDocument;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!documentWithTransition.startViewTransition || reduceMotion) {
    update();
    return;
  }

  try {
    if (activeTransition) {
      activeTransition.skipTransition();
      activeTransition = null;
      flushSync(update);
      return;
    }
    const transition = documentWithTransition.startViewTransition(async () => {
      flushSync(update);
      await waitForLazyTarget();
    });
    activeTransition = transition;
    void transition.finished.catch(() => undefined).finally(() => {
      if (activeTransition === transition) activeTransition = null;
    });
  } catch {
    update();
  }
};
