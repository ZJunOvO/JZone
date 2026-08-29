export type LiquidGlassDisplacementMap = {
  href: string;
  scale: number;
};

export type LiquidGlassDisplacementOptions = {
  profile?: 'adaptive' | 'shuding' | 'panel' | 'perimeter';
  edgeScale?: number;
  centerStrength?: number;
  centerLensStrength?: number;
  centerWaveStrength?: number;
  sideVerticalDamp?: number;
  sideHorizontalBoost?: number;
  normalization?: number;
  balancedEncoding?: boolean;
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

const getRoundedRectEdge = (
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
) => {
  const coreX = Math.max(0, halfWidth - radius);
  const coreY = Math.max(0, halfHeight - radius);
  const qx = Math.abs(x) - coreX;
  const qy = Math.abs(y) - coreY;
  const outsideX = Math.max(qx, 0);
  const outsideY = Math.max(qy, 0);
  const outsideLength = distance(outsideX, outsideY);
  const signedDistance = Math.min(Math.max(qx, qy), 0) + outsideLength - radius;

  if (outsideLength > 0.0001) {
    return {
      signedDistance,
      normalX: Math.sign(x || 1) * outsideX / outsideLength,
      normalY: Math.sign(y || 1) * outsideY / outsideLength,
    };
  }

  if (qx > qy) {
    return { signedDistance, normalX: Math.sign(x || 1), normalY: 0 };
  }
  return { signedDistance, normalX: 0, normalY: Math.sign(y || 1) };
};

export const createLiquidGlassDisplacementMap = (
  width: number,
  height: number,
  options: LiquidGlassDisplacementOptions = {},
): LiquidGlassDisplacementMap => {
  const resolvedWidth = Math.max(1, Math.round(width));
  const resolvedHeight = Math.max(1, Math.round(height));
  const isShudingProfile = options.profile === 'shuding';
  const isPanelProfile = options.profile === 'panel';
  const isPerimeterProfile = options.profile === 'perimeter';
  const edgeScale = Math.max(0, Math.min(1.4, options.edgeScale ?? 1));
  const centerStrength = Math.max(0, Math.min(0.8, options.centerStrength ?? 0));
  const centerLensStrength = Math.max(0, Math.min(0.8, options.centerLensStrength ?? centerStrength));
  const centerWaveStrength = Math.max(0, Math.min(0.8, options.centerWaveStrength ?? centerStrength));
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
    let dx: number;
    let dy: number;
    if (isPerimeterProfile) {
      const halfWidth = resolvedWidth / 2;
      const halfHeight = resolvedHeight / 2;
      const radius = Math.max(1, Math.min(halfWidth, halfHeight) - 1);
      const localX = x + 0.5 - halfWidth;
      const localY = y + 0.5 - halfHeight;
      const edge = getRoundedRectEdge(localX, localY, halfWidth, halfHeight, radius);
      const insideDistance = Math.max(0, -edge.signedDistance);
      const edgeBand = Math.max(8, Math.min(radius * 0.72, 24));
      const edgeWeight = 1 - smoothStep(0, edgeBand, insideDistance);
      const opticalCurve = Math.sin(edgeWeight * Math.PI * 0.5);
      const edgeAmount = edgeBand * 0.42 * edgeScale * opticalCurve;
      const centerFalloff = Math.max(0, 1 - distance(ix * 1.25, iy * 2));
      const centerAmount = Math.min(resolvedWidth, resolvedHeight) * 0.018
        * centerFalloff * centerLensStrength;

      dx = -edge.normalX * edgeAmount + ix * centerAmount;
      dy = -edge.normalY * edgeAmount + iy * centerAmount;
    } else if (isPanelProfile) {
      const shortSide = Math.min(resolvedWidth, resolvedHeight);
      const edgeBand = Math.min(38, Math.max(16, shortSide * 0.16));
      const edgeX = Math.min(x, resolvedWidth - 1 - x);
      const edgeY = Math.min(y, resolvedHeight - 1 - y);
      const edgeWeightX = 1 - smoothStep(0, edgeBand, edgeX);
      const edgeWeightY = 1 - smoothStep(0, edgeBand, edgeY);
      const directionX = x < resolvedWidth / 2 ? 1 : -1;
      const directionY = y < resolvedHeight / 2 ? 1 : -1;
      const normalizedDistance = distance(ix * 2, iy * 2);
      const centerFalloff = Math.max(0, 1 - normalizedDistance);
      const centerLensX = ix * shortSide * 0.032 * centerFalloff * centerLensStrength;
      const centerLensY = iy * shortSide * 0.026 * centerFalloff * centerLensStrength;
      const centerWaveX = Math.sin((uvY * Math.PI * 1.35) + 0.4) * shortSide * 0.004 * centerFalloff * centerWaveStrength;
      const centerWaveY = Math.sin((uvX * Math.PI * 1.45) + 1.1) * shortSide * 0.003 * centerFalloff * centerWaveStrength;
      dx = directionX * edgeWeightX * edgeBand * 0.34 * edgeScale + centerLensX + centerWaveX;
      dy = directionY * edgeWeightY * edgeBand * 0.22 * edgeScale + centerLensY + centerWaveY;
    } else {
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
      const centerWaveX = Math.sin((uvY * Math.PI * 2.1) + 0.4) * resolvedWidth * 0.012 * centerFalloff * centerWaveStrength;
      const centerWaveY = Math.sin((uvX * Math.PI * 2.3) + 1.1) * resolvedHeight * 0.01 * centerFalloff * centerWaveStrength;
      const centerLensX = ix * resolvedWidth * 0.035 * centerFalloff * centerLensStrength;
      const centerLensY = iy * resolvedHeight * 0.03 * centerFalloff * centerLensStrength;
      const sidePresence = smoothStep(0.18, 0.46, Math.abs(ix));
      const verticalScale = 1 - sidePresence * (1 - sideVerticalDamp);
      const horizontalScale = 1 + sidePresence * (sideHorizontalBoost - 1);
      dx = (posX * resolvedWidth - x) * edgeScale * horizontalScale + centerLensX + centerWaveX;
      dy = (posY * resolvedHeight - y) * edgeScale * verticalScale + centerLensY + centerWaveY;
    }
    maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    rawValues.push(dx, dy);
  }

  if (options.balancedEncoding) {
    const denominator = maxScale || 1;
    let index = 0;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, (rawValues[index++] / (2 * denominator) + 0.5) * 255));
      data[i + 1] = Math.max(0, Math.min(255, (rawValues[index++] / (2 * denominator) + 0.5) * 255));
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    context.putImageData(new ImageData(data, resolvedWidth, resolvedHeight), 0, 0);
    return { href: canvas.toDataURL(), scale: maxScale * 2 };
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
