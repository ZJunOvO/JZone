import React from 'react';
import {
  DEFAULT_LIQUID_GLASS_SETTINGS,
  getLiquidGlassCssVars,
  useLiquidGlassSettings,
} from '../utils/liquidGlassSettings';
import {
  createLiquidGlassDisplacementMap,
  type LiquidGlassDisplacementMap,
  type LiquidGlassDisplacementOptions,
} from '../utils/liquidGlassDisplacement';

const displacementMapCache = new Map<string, LiquidGlassDisplacementMap>();
const MAX_DISPLACEMENT_MAP_CACHE_SIZE = 32;

const getCachedDisplacementMap = (width: number, height: number, options: LiquidGlassDisplacementOptions) => {
  const key = JSON.stringify([Math.round(width), Math.round(height), options]);
  const cached = displacementMapCache.get(key);
  if (cached) {
    displacementMapCache.delete(key);
    displacementMapCache.set(key, cached);
    return cached;
  }
  const generated = createLiquidGlassDisplacementMap(width, height, options);
  if (generated.href) {
    if (displacementMapCache.size >= MAX_DISPLACEMENT_MAP_CACHE_SIZE) {
      displacementMapCache.delete(displacementMapCache.keys().next().value as string);
    }
    displacementMapCache.set(key, generated);
  }
  return generated;
};

export const LiquidGlassSurface: React.FC<{
  borderRadiusClass?: string;
  className?: string;
  style?: React.CSSProperties;
  material?: 'settings' | 'shuding';
  coverage?: 'edge' | 'full';
  geometry?: 'standard' | 'panel';
  eagerMap?: boolean;
  initialSize?: { width: number; height: number };
  lockInitialSize?: boolean;
}> = ({ borderRadiusClass = 'rounded-2xl', className = '', style: customStyle, material = 'settings', coverage = 'edge', geometry = 'standard', eagerMap = false, initialSize, lockInitialSize = false }) => {
  const settings = useLiquidGlassSettings();
  const filterId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const initialWidth = Math.max(1, Math.round(initialSize?.width ?? 236));
  const initialHeight = Math.max(1, Math.round(initialSize?.height ?? 240));
  const [size, setSize] = React.useState({ width: initialWidth, height: initialHeight });
  const mapOptions = React.useMemo<LiquidGlassDisplacementOptions>(() => {
    const useFullCoverage = material === 'shuding' && coverage === 'full';
    const usePanelGeometry = material === 'shuding' && geometry === 'panel';
    return {
      profile: usePanelGeometry ? 'panel' : material === 'shuding' ? 'shuding' : 'adaptive',
      edgeScale: settings.edgeRefraction,
      centerStrength: material === 'shuding' ? 0 : 0.14,
      centerLensStrength: usePanelGeometry ? 0.46 : useFullCoverage ? 0.58 : undefined,
      centerWaveStrength: usePanelGeometry ? 0.08 : useFullCoverage ? 0.16 : undefined,
      sideVerticalDamp: material === 'shuding' ? 1 : 0.34,
      sideHorizontalBoost: material === 'shuding' ? 1 : 1.12,
      normalization: usePanelGeometry ? 1 : useFullCoverage ? 0.56 : material === 'shuding' ? 0.5 : 0.74,
      balancedEncoding: usePanelGeometry,
    };
  }, [coverage, geometry, material, settings.edgeRefraction]);
  const [map, setMap] = React.useState<LiquidGlassDisplacementMap>(() => (
    eagerMap ? getCachedDisplacementMap(initialWidth, initialHeight, mapOptions) : { href: '', scale: 0 }
  ));

  React.useLayoutEffect(() => {
    if (!lockInitialSize) return;
    setSize((previous) => previous.width === initialWidth && previous.height === initialHeight
      ? previous
      : { width: initialWidth, height: initialHeight });
  }, [initialHeight, initialWidth, lockInitialSize]);

  React.useLayoutEffect(() => {
    if (lockInitialSize) return;
    const element = surfaceRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [lockInitialSize]);

  React.useLayoutEffect(() => {
    if (!eagerMap) return;
    setMap(getCachedDisplacementMap(size.width, size.height, mapOptions));
  }, [eagerMap, mapOptions, size.height, size.width]);

  React.useEffect(() => {
    if (eagerMap) return;
    setMap(getCachedDisplacementMap(size.width, size.height, mapOptions));
  }, [eagerMap, mapOptions, size.height, size.width]);

  const strengthRatio = Math.max(0, settings.strength / DEFAULT_LIQUID_GLASS_SETTINGS.strength);
  const filterScale = Math.round(
    (map.scale || 34) * strengthRatio * (material === 'shuding' ? 1 : 0.86) * 1000,
  ) / 1000;
  const style = {
    ...getLiquidGlassCssVars(settings),
    '--liquid-tab-filter': map.href ? `url(#liquid-shared-${filterId})` : 'none',
    ...customStyle,
  } as React.CSSProperties;

  return (
    <div
      ref={surfaceRef}
      className={`pointer-events-none absolute inset-0 ${material === 'shuding' ? 'liquid-glass-shuding' : ''} ${borderRadiusClass} ${className}`}
      style={style}
      aria-hidden
      data-liquid-material={material}
      data-liquid-coverage={coverage}
      data-liquid-geometry={geometry}
    >
      <svg className="liquid-tab-filter-defs" focusable="false">
        <filter
          id={`liquid-shared-${filterId}`}
          x="0"
          y="0"
          width={size.width}
          height={size.height}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={map.href}
            xlinkHref={map.href}
            preserveAspectRatio="none"
            width={size.width}
            height={size.height}
            result={`${filterId}-map`}
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2={`${filterId}-map`}
            scale={filterScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <div className={`liquid-glass-mobile-backstop absolute inset-0 ${borderRadiusClass}`} />
      <div className={`liquid-tab-surface absolute inset-0 ${borderRadiusClass}`}>
        <div className={`liquid-tab-f-glass absolute inset-0 ${borderRadiusClass}`} />
      </div>
    </div>
  );
};
