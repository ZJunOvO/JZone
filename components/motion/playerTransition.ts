export type PlayerTransitionPhase = 'opening' | 'open' | 'closing';

export interface PlayerTransitionOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

export interface PlayerElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlayerSharedOrigin {
  cover: PlayerElementRect;
  title: PlayerElementRect;
  artist: PlayerElementRect;
}

export interface PlayerClipInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
  radius: number;
}

export const PLAYER_SHELL_DURATION = 0.46;
export const PLAYER_SHELL_EXIT_DURATION = 0.36;
export const PLAYER_SHELL_EASE = [0.22, 0.72, 0.18, 1] as const;

export const PLAYER_SHARED_TRANSITION = {
  duration: PLAYER_SHELL_DURATION,
  ease: PLAYER_SHELL_EASE,
};

export const getPlayerOriginInsets = (origin: PlayerTransitionOrigin): PlayerClipInsets => ({
  top: Math.max(0, origin.top),
  right: Math.max(0, window.innerWidth - origin.left - origin.width),
  bottom: Math.max(0, window.innerHeight - origin.top - origin.height),
  left: Math.max(0, origin.left),
  radius: origin.borderRadius,
});

export const getDefaultPlayerOrigin = (): PlayerTransitionOrigin => {
  const width = Math.min(400, Math.max(0, window.innerWidth - 24));
  const height = 56;
  return {
    left: Math.max(12, (window.innerWidth - width) / 2),
    top: Math.max(0, window.innerHeight - 92 - height),
    width,
    height,
    borderRadius: 18,
  };
};

export const getDefaultPlayerSharedOrigin = (origin: PlayerTransitionOrigin): PlayerSharedOrigin => ({
  cover: { left: origin.left, top: origin.top, width: origin.height, height: origin.height },
  title: { left: origin.left + 64, top: origin.top + 11, width: Math.max(80, origin.width - 164), height: 18 },
  artist: { left: origin.left + 64, top: origin.top + 30, width: Math.max(80, origin.width - 164), height: 18 },
});
