import React from 'react';

const FALLBACK_ACCENT = { r: 58, g: 35, b: 45 };
const accentCache = new Map<string, { r: number; g: number; b: number }>();

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const useCoverAccentColor = (src?: string | null) => {
  const [accent, setAccent] = React.useState(() => (src && accentCache.get(src)) || FALLBACK_ACCENT);

  React.useEffect(() => {
    if (!src) {
      setAccent(FALLBACK_ACCENT);
      return;
    }
    const cached = accentCache.get(src);
    if (cached) {
      setAccent(cached);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weightSum = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index + 3] < 128) continue;
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max <= 0 ? 0 : (max - min) / max;
          const luminance = (r + g + b) / (255 * 3);
          const weight = (0.7 + saturation * 0.7) * (luminance < 0.08 || luminance > 0.94 ? 0.35 : 1);
          red += r * weight;
          green += g * weight;
          blue += b * weight;
          weightSum += weight;
        }
        if (weightSum <= 0) return;
        const next = {
          r: clampChannel((red / weightSum) * 0.9),
          g: clampChannel((green / weightSum) * 0.9),
          b: clampChannel((blue / weightSum) * 0.9),
        };
        accentCache.set(src, next);
        setAccent(next);
      } catch {
        setAccent(FALLBACK_ACCENT);
      }
    };
    image.onerror = () => {
      if (!cancelled) setAccent(FALLBACK_ACCENT);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const css = `rgb(${accent.r} ${accent.g} ${accent.b})`;
  const darkCss = `rgb(${clampChannel(accent.r * 0.42)} ${clampChannel(accent.g * 0.42)} ${clampChannel(accent.b * 0.42)})`;
  const panelCss = `rgb(${clampChannel(accent.r * 0.54)} ${clampChannel(accent.g * 0.54)} ${clampChannel(accent.b * 0.54)})`;
  const glowCss = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.48)`;
  return { ...accent, css, darkCss, panelCss, glowCss };
};
