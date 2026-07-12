export type PlayerTransitionPhase = 'opening' | 'open' | 'closing';

export interface PlayerTransitionOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

export const PLAYER_SHELL_DURATION = 0.62;
export const PLAYER_SHELL_EXIT_DURATION = 0.48;
export const PLAYER_SHELL_EASE = [0.32, 0.05, 0.18, 1] as const;

export const PLAYER_SHARED_TRANSITION = {
  duration: PLAYER_SHELL_DURATION,
  ease: PLAYER_SHELL_EASE,
};

export const getPlayerOriginClipPath = (origin: PlayerTransitionOrigin) => {
  const right = Math.max(0, window.innerWidth - origin.left - origin.width);
  const bottom = Math.max(0, window.innerHeight - origin.top - origin.height);
  return `inset(${Math.max(0, origin.top)}px ${right}px ${bottom}px ${Math.max(0, origin.left)}px round ${origin.borderRadius}px)`;
};

export const getPlayerMidClipPath = (origin: PlayerTransitionOrigin) => {
  const right = Math.max(0, window.innerWidth - origin.left - origin.width);
  const bottom = Math.max(0, window.innerHeight - origin.top - origin.height);
  return `inset(${Math.max(0, origin.top * 0.48)}px ${right * 0.38}px ${bottom * 0.08}px ${Math.max(0, origin.left * 0.38)}px round ${Math.max(8, origin.borderRadius * 0.62)}px)`;
};

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
