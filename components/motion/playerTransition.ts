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

export const PLAYER_SHELL_DURATION = 0.56;
export const PLAYER_SHELL_EXIT_DURATION = 0.38;
export const PLAYER_MINI_SETTLE_LEAD = 0.12;
export const PLAYER_SHELL_EASE = [0.22, 0.72, 0.18, 1] as const;

export const PLAYER_SETTLE_DURATION = 0.48;

// 临界阻尼的冲量响应：从终点连续带出一次低幅惯性，既不预压缩，也不持续振荡。
export const createPlayerSettleCurve = (peakScale: number, sampleCount = 24) => {
  const angularFrequency = 9.5;
  const response = (time: number) => {
    const phase = angularFrequency * time;
    return Math.E * phase * Math.exp(-phase);
  };
  const endResponse = response(PLAYER_SETTLE_DURATION);
  const raw = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const progress = index / sampleCount;
    const time = PLAYER_SETTLE_DURATION * progress;
    return Math.max(0, response(time) - progress * endResponse);
  });
  const normalization = Math.max(...raw, 1);
  const amplitude = Math.max(0, peakScale - 1);
  return {
    values: raw.map((value, index) => {
      if (index === 0 || index === sampleCount) return 1;
      return 1 + (value / normalization) * amplitude;
    }),
    times: raw.map((_, index) => index / sampleCount),
  };
};

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
