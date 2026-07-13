import { type CSSProperties, useEffect, useState } from 'react';

export type LiquidGlassSettings = {
  strength: number;
  blur: number;
  saturation: number;
  brightness: number;
  contrast: number;
  tint: number;
  lensStrength: number;
  edgeRefraction: number;
  chromaticAberration: number;
  depth: number;
  curvature: number;
  glow: number;
  edgeHighlight: number;
  specular: number;
  quality: number;
};

const STORAGE_KEY = 'jzone.liquidGlassSettings.v6';
const CHANGE_EVENT = 'jzone:liquid-glass-settings-changed';

export const DEFAULT_LIQUID_GLASS_SETTINGS: LiquidGlassSettings = {
  strength: 0.005,
  blur: 3,
  saturation: 1.6,
  brightness: 1.05,
  contrast: 1,
  tint: 0.035,
  lensStrength: 2.2,
  edgeRefraction: 1.2,
  chromaticAberration: 0.48,
  depth: 18,
  curvature: 0.82,
  glow: 0.28,
  edgeHighlight: 1,
  specular: 2,
  quality: 384,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const normalizeLiquidGlassSettings = (value: unknown): LiquidGlassSettings => {
  const raw = value && typeof value === 'object' ? (value as Partial<LiquidGlassSettings>) : {};
  return {
    strength: clamp(raw.strength, 0, 0.12, DEFAULT_LIQUID_GLASS_SETTINGS.strength),
    blur: clamp(raw.blur, 0, 3, DEFAULT_LIQUID_GLASS_SETTINGS.blur),
    saturation: clamp(raw.saturation, 1, 2.2, DEFAULT_LIQUID_GLASS_SETTINGS.saturation),
    brightness: clamp(raw.brightness, 0.82, 1.3, DEFAULT_LIQUID_GLASS_SETTINGS.brightness),
    contrast: clamp(raw.contrast, 1, 1.6, DEFAULT_LIQUID_GLASS_SETTINGS.contrast),
    tint: clamp(raw.tint, 0, 0.14, DEFAULT_LIQUID_GLASS_SETTINGS.tint),
    lensStrength: clamp(raw.lensStrength, 0.5, 2.2, DEFAULT_LIQUID_GLASS_SETTINGS.lensStrength),
    edgeRefraction: clamp(raw.edgeRefraction, 0.3, 1.2, DEFAULT_LIQUID_GLASS_SETTINGS.edgeRefraction),
    chromaticAberration: clamp(raw.chromaticAberration, 0, 1, DEFAULT_LIQUID_GLASS_SETTINGS.chromaticAberration),
    depth: clamp(raw.depth, 4, 60, DEFAULT_LIQUID_GLASS_SETTINGS.depth),
    curvature: clamp(raw.curvature, 0, 1, DEFAULT_LIQUID_GLASS_SETTINGS.curvature),
    glow: clamp(raw.glow, 0, 1, DEFAULT_LIQUID_GLASS_SETTINGS.glow),
    edgeHighlight: clamp(raw.edgeHighlight, 0, 1, DEFAULT_LIQUID_GLASS_SETTINGS.edgeHighlight),
    specular: clamp(raw.specular, 0, 2, DEFAULT_LIQUID_GLASS_SETTINGS.specular),
    quality: Math.round(clamp(raw.quality, 128, 768, DEFAULT_LIQUID_GLASS_SETTINGS.quality)),
  };
};

export const getLiquidGlassCssVars = (settings: LiquidGlassSettings): CSSProperties => {
  const normalized = normalizeLiquidGlassSettings(settings);
  const fBlur = Math.max(0, normalized.blur);
  const fLensBlur = Math.max(0, normalized.blur);
  const fEdgeAlpha = Math.min(0.62, 0.12 + normalized.edgeHighlight * 0.38);

  return {
    '--lg-f-blur': `${fBlur.toFixed(2)}px`,
    '--lg-f-lens-blur': `${fLensBlur.toFixed(2)}px`,
    '--lg-f-saturation': normalized.saturation.toFixed(2),
    '--lg-f-brightness': normalized.brightness.toFixed(2),
    '--lg-f-contrast': normalized.contrast.toFixed(2),
    '--lg-f-tint-alpha': normalized.tint.toFixed(3),
    '--lg-f-lens-tint-alpha': Math.min(0.12, normalized.tint * 0.82 + 0.006).toFixed(3),
    '--lg-f-edge-alpha': fEdgeAlpha.toFixed(3),
    '--lg-f-edge-refraction': normalized.edgeRefraction.toFixed(3),
    '--lg-f-specular-alpha': Math.min(0.7, 0.14 + normalized.specular * 0.18).toFixed(3),
    '--lg-f-shadow-alpha': Math.min(0.5, 0.22 + normalized.contrast * 0.08).toFixed(3),
  } as CSSProperties;
};

const loadLiquidGlassSettings = (): LiquidGlassSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LIQUID_GLASS_SETTINGS;
    return normalizeLiquidGlassSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_LIQUID_GLASS_SETTINGS;
  }
};

export const saveLiquidGlassSettings = (settings: LiquidGlassSettings) => {
  const next = normalizeLiquidGlassSettings(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
};

export const resetLiquidGlassSettings = () => {
  saveLiquidGlassSettings(DEFAULT_LIQUID_GLASS_SETTINGS);
};

export const useLiquidGlassSettings = () => {
  const [settings, setSettings] = useState<LiquidGlassSettings>(() => loadLiquidGlassSettings());

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<LiquidGlassSettings>).detail;
      setSettings(normalizeLiquidGlassSettings(detail ?? loadLiquidGlassSettings()));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setSettings(loadLiquidGlassSettings());
    };

    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return settings;
};
