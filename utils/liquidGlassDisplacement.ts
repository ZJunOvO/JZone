export type LiquidGlassDisplacementMap = {
  href: string;
  scale: number;
};

export type LiquidGlassDisplacementOptions = {
  profile?: 'adaptive' | 'shuding';
  edgeScale?: number;
  centerStrength?: number;
  sideVerticalDamp?: number;
  sideHorizontalBoost?: number;
  normalization?: number;
};

const smoothStep = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const distance = (x: number, y: number) => Math.sqrt(x * x + y * y);

const roundedRectSdf = (x: number, y: number, width: number, height: number, radius: number) => {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + distance(Math.max(qx, 0), Math.max(qy, 0)) - radius;
};

export const createLiquidGlassDisplacementMap = (
  width: number,
  height: number,
  options: LiquidGlassDisplacementOptions = {},
): LiquidGlassDisplacementMap => {
  const resolvedWidth = Math.max(1, Math.round(width));
  const resolvedHeight = Math.max(1, Math.round(height));
  const isShudingProfile = options.profile === 'shuding';
  const edgeScale = Math.max(0, Math.min(1.4, options.edgeScale ?? 1));
  const centerStrength = Math.max(0, Math.min(0.35, options.centerStrength ?? 0));
  const sideVerticalDamp = Math.max(0, Math.min(1, options.sideVerticalDamp ?? 1));
  const sideHorizontalBoost = Math.max(0.75, Math.min(1.4, options.sideHorizontalBoost ?? 1));
  const normalization = Math.max(0.45, Math.min(1.2, options.normalization ?? 0.5));

  if (typeof document === 'undefined' || typeof ImageData === 'undefined') {
    return { href: '', scale: 0 };
  }

  const canvas = document.createElement('canvas');
  canvas.width = resolvedWidth;
  canvas.height = resolvedHeight;
  const context = canvas.getContext('2d');
  if (!context) return { href: '', scale: 0 };

  const data = new Uint8ClampedArray(resolvedWidth * resolvedHeight * 4);
  const rawValues: number[] = [];
  let maxScale = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pixel = i / 4;
    const x = pixel % resolvedWidth;
    const y = Math.floor(pixel / resolvedWidth);
    const uvX = x / resolvedWidth;
    const uvY = y / resolvedHeight;
    const ix = uvX - 0.5;
    const iy = uvY - 0.5;
    const distanceToEdge = roundedRectSdf(
      ix,
      iy,
      isShudingProfile ? 0.3 : 0.34,
      isShudingProfile ? 0.2 : 0.22,
      isShudingProfile ? 0.6 : 0.62,
    );
    const displacement = smoothStep(
      isShudingProfile ? 0.8 : 0.78,
      0,
      distanceToEdge - (isShudingProfile ? 0.15 : 0.16),
    );
    const scaled = smoothStep(0, 1, displacement);
    const posX = ix * scaled + 0.5;
    const posY = iy * scaled + 0.5;
    const centerFalloff = Math.max(0, 1 - distance(ix, iy) / 0.58);
    const centerWaveX = Math.sin((uvY * Math.PI * 2.1) + 0.4) * resolvedWidth * 0.012 * centerFalloff * centerStrength;
    const centerWaveY = Math.sin((uvX * Math.PI * 2.3) + 1.1) * resolvedHeight * 0.01 * centerFalloff * centerStrength;
    const centerLensX = ix * resolvedWidth * 0.035 * centerFalloff * centerStrength;
    const centerLensY = iy * resolvedHeight * 0.03 * centerFalloff * centerStrength;
    const sidePresence = smoothStep(0.18, 0.46, Math.abs(ix));
    const verticalScale = 1 - sidePresence * (1 - sideVerticalDamp);
    const horizontalScale = 1 + sidePresence * (sideHorizontalBoost - 1);
    const dx = (posX * resolvedWidth - x) * edgeScale * horizontalScale + centerLensX + centerWaveX;
    const dy = (posY * resolvedHeight - y) * edgeScale * verticalScale + centerLensY + centerWaveY;
    maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    rawValues.push(dx, dy);
  }

  maxScale *= normalization;
  const denominator = maxScale || 1;
  let index = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = rawValues[index++] / denominator + 0.5;
    const g = rawValues[index++] / denominator + 0.5;
    data[i] = Math.max(0, Math.min(255, r * 255));
    data[i + 1] = Math.max(0, Math.min(255, g * 255));
    data[i + 2] = 0;
    data[i + 3] = 255;
  }

  context.putImageData(new ImageData(data, resolvedWidth, resolvedHeight), 0, 0);
  return { href: canvas.toDataURL(), scale: maxScale };
};
