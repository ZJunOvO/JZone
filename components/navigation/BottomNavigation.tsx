import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';
import {
  DEFAULT_LIQUID_GLASS_SETTINGS,
  getLiquidGlassCssVars,
  type LiquidGlassLayoutMode,
  useLiquidGlassSettings,
} from '../../utils/liquidGlassSettings';
import { createLiquidGlassDisplacementMap, type LiquidGlassDisplacementMap } from '../../utils/liquidGlassDisplacement';
import { navigateWithProfileAvatarTransition } from '../motion/profileAvatarTransition';

interface BottomNavigationProps {
  currentTab: string;
  setTab: (tab: string) => void;
  profileAvatarUrl?: string;
}

const WIDE_NAV_MAX_WIDTH = 400;
const COMPACT_NAV_WIDTH = 220;
const NAV_VIEWPORT_GUTTER = 12;

const getInitialNavWidth = (bottomTabLayout: LiquidGlassLayoutMode) => {
  const maxWidth = bottomTabLayout === 'compact' ? COMPACT_NAV_WIDTH : WIDE_NAV_MAX_WIDTH;
  if (typeof window === 'undefined') return maxWidth;
  return Math.min(maxWidth, Math.max(1, window.innerWidth - NAV_VIEWPORT_GUTTER * 2));
};

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentTab, setTab, profileAvatarUrl }) => {
  const liquidGlassSettings = useLiquidGlassSettings();
  const { bottomTabLayout } = liquidGlassSettings;
  const isCompactLayout = bottomTabLayout === 'compact';
  const effectiveNavGlass = liquidGlassSettings;
  const navGlassVars = getLiquidGlassCssVars(effectiveNavGlass);
  const navFilterId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [lensVisible, setLensVisible] = React.useState(false);
  const [isDraggingLens, setIsDraggingLens] = React.useState(false);
  const [dragCenterX, setDragCenterX] = React.useState<number | null>(null);
  const [navWidth, setNavWidth] = React.useState(() => getInitialNavWidth(bottomTabLayout));
  const [navMap, setNavMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const [lensMap, setLensMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const navRef = React.useRef<HTMLDivElement>(null);
  const navFeImageRef = React.useRef<SVGFEImageElement>(null);
  const lensFeImageRef = React.useRef<SVGFEImageElement>(null);
  const dragRef = React.useRef<{ startX: number; startCenter: number; currentCenter: number; pointerId: number; moved: boolean } | null>(null);
  const hideLensTimerRef = React.useRef<number | null>(null);
  const suppressClickRef = React.useRef(false);
  const tabs = [
    { id: 'home', icon: Icons.Play, label: '现在就听', fillOnActive: true },
    { id: 'library', icon: Icons.ListMusic, label: '资料库', fillOnActive: false },
    { id: 'upload', icon: Icons.PlusCircle, label: '创作', fillOnActive: false },
    { id: 'profile', icon: Icons.User, label: '我的', fillOnActive: false },
  ];
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === currentTab));
  const navTrackPadding = 6;
  const navTrackWidth = Math.max(1, navWidth - navTrackPadding * 2);
  const itemWidth = navTrackWidth / tabs.length;
  const maxLensWidth = Math.max(1, navTrackWidth - navTrackPadding * 2);
  const lensWidth = isCompactLayout
    ? Math.min(Math.max(44, itemWidth - 6), maxLensWidth)
    : Math.min(Math.max(72, itemWidth - 6), maxLensWidth);
  const lensExpandedWidth = isCompactLayout
    ? Math.min(lensWidth + 6, itemWidth, maxLensWidth)
    : Math.min(lensWidth + 8, itemWidth + 8, maxLensWidth);
  const lensCompactWidth = isCompactLayout
    ? Math.min(Math.max(42, itemWidth - 8), Math.max(1, itemWidth - 2), maxLensWidth)
    : Math.min(Math.max(76, itemWidth - 8), Math.max(1, itemWidth - 2), maxLensWidth);
  const isLensExpanded = isDraggingLens || lensVisible;
  const renderedLensWidth = isLensExpanded ? lensExpandedWidth : lensCompactWidth;
  const renderedLensHeight = isLensExpanded ? 72 : 62;
  const renderedLensTop = isLensExpanded ? -3 : 2;
  const navHeight = 66;
  const roundedNavWidth = Math.max(1, Math.round(navWidth));
  const roundedLensWidth = Math.max(1, Math.round(renderedLensWidth));
  const roundedLensHeight = Math.max(1, Math.round(renderedLensHeight));
  const activeCenterX = navTrackPadding + activeIndex * itemWidth + itemWidth / 2;
  const renderedLensCenterX = dragCenterX ?? activeCenterX;
  const minLensLeft = navTrackPadding;
  const maxLensLeft = Math.max(minLensLeft, navWidth - renderedLensWidth - navTrackPadding);
  const renderedLensLeft = Math.min(maxLensLeft, Math.max(minLensLeft, renderedLensCenterX - renderedLensWidth / 2));
  const navStrengthRatio = Math.max(0, effectiveNavGlass.strength / DEFAULT_LIQUID_GLASS_SETTINGS.strength);
  const navFilterScale = Math.round((navMap.scale || 34) * navStrengthRatio * 0.86);
  const lensMotionBoost = isDraggingLens ? 1.38 : lensVisible ? 1.18 : 1;
  const lensFilterScale = Math.round((lensMap.scale || 24) * navStrengthRatio * effectiveNavGlass.lensStrength * lensMotionBoost);
  const navDynamicVars = {
    ...navGlassVars,
    '--liquid-tab-x': `${renderedLensCenterX}px`,
    '--liquid-tab-lens-width': `${lensWidth}px`,
    '--liquid-tab-filter': `url(#liquid-tab-${navFilterId})`,
    '--liquid-tab-lens-filter': `url(#liquid-tab-${navFilterId}-lens)`,
  } as React.CSSProperties;

  React.useEffect(() => {
    setLensVisible(true);
    if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    hideLensTimerRef.current = window.setTimeout(() => setLensVisible(false), 460);
    return () => {
      if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    };
  }, [currentTab]);

  React.useLayoutEffect(() => {
    const element = navRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) setNavWidth(rect.width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    setNavMap(
      createLiquidGlassDisplacementMap(roundedNavWidth, navHeight, {
        edgeScale: effectiveNavGlass.edgeRefraction,
        centerStrength: 0.14,
        sideVerticalDamp: 0.34,
        sideHorizontalBoost: 1.12,
        normalization: 0.74,
      }),
    );
  }, [effectiveNavGlass.edgeRefraction, roundedNavWidth]);

  React.useEffect(() => {
    setLensMap(
      createLiquidGlassDisplacementMap(roundedLensWidth, roundedLensHeight, {
        edgeScale: Math.min(1.18, effectiveNavGlass.edgeRefraction * 1.12),
        centerStrength: 0.24,
        sideVerticalDamp: 0.45,
        sideHorizontalBoost: 1.08,
        normalization: 0.68,
      }),
    );
  }, [effectiveNavGlass.edgeRefraction, roundedLensHeight, roundedLensWidth]);

  React.useEffect(() => {
    if (navFeImageRef.current && navMap.href) {
      navFeImageRef.current.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', navMap.href);
    }
  }, [navMap.href]);

  React.useEffect(() => {
    if (lensFeImageRef.current && lensMap.href) {
      lensFeImageRef.current.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', lensMap.href);
    }
  }, [lensMap.href]);

  const clampLensCenter = (value: number) => {
    const min = lensExpandedWidth / 2 + navTrackPadding;
    const max = Math.max(min, navWidth - lensExpandedWidth / 2 - navTrackPadding);
    return Math.min(max, Math.max(min, value));
  };

  const selectTab = React.useCallback((tabId: string) => {
    if (tabId === 'profile' && currentTab === 'home') {
      const homeAvatar = document.querySelector('[data-profile-home-avatar-source="true"]');
      if (homeAvatar && homeAvatar.getBoundingClientRect().width > 0) {
        navigateWithProfileAvatarTransition(homeAvatar, profileAvatarUrl, () => setTab(tabId));
        return;
      }
    }
    if (tabId === 'home' && currentTab === 'profile') {
      const profileAvatar = document.querySelector('[data-profile-avatar-target="true"]');
      if (profileAvatar && profileAvatar.getBoundingClientRect().width > 0) {
        navigateWithProfileAvatarTransition(profileAvatar, profileAvatarUrl, () => setTab(tabId), 'home');
        return;
      }
    }
    setTab(tabId);
  }, [currentTab, profileAvatarUrl, setTab]);

  const startLensDrag = (event: React.PointerEvent<HTMLButtonElement>, tabId: string) => {
    if (tabId !== currentTab) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    dragRef.current = {
      startX: event.clientX,
      startCenter: activeCenterX,
      currentCenter: activeCenterX,
      pointerId: event.pointerId,
      moved: false,
    };
    setIsDraggingLens(true);
    setLensVisible(true);
    setDragCenterX(activeCenterX);
  };

  const moveLensDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    drag.currentCenter = clampLensCenter(drag.startCenter + delta);
    setDragCenterX(drag.currentCenter);
  };

  const endLensDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finalCenter = drag.currentCenter;
    const nextIndex = Math.min(tabs.length - 1, Math.max(0, Math.round((finalCenter - navTrackPadding - itemWidth / 2) / itemWidth)));
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setIsDraggingLens(false);
    setDragCenterX(null);
    setLensVisible(true);
    if (tabs[nextIndex]?.id && tabs[nextIndex].id !== currentTab) {
      const tabId = tabs[nextIndex].id;
      selectTab(tabId);
    } else {
      if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
      hideLensTimerRef.current = window.setTimeout(() => setLensVisible(false), 260);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  return (
    <div
      className={`fixed left-1/2 z-30 h-[66px] -translate-x-1/2 transition-[width,bottom] duration-300 ease-out ${
        isCompactLayout ? 'w-[min(220px,calc(100vw-24px))]' : 'w-[min(400px,calc(100vw-24px))]'
      }`}
      style={{ ...navDynamicVars, bottom: `calc(env(safe-area-inset-bottom) + ${isCompactLayout ? 24 : 14}px)` }}
      data-liquid-control-root
      data-layout-mode={bottomTabLayout}
      data-testid="bottom-nav-layer"
    >
      <svg className="liquid-tab-filter-defs" aria-hidden focusable="false">
        <filter
          id={`liquid-tab-${navFilterId}`}
          x="0"
          y="0"
          width={roundedNavWidth}
          height={navHeight}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage ref={navFeImageRef} href={navMap.href} xlinkHref={navMap.href} preserveAspectRatio="none" width={roundedNavWidth} height={navHeight} result={`${navFilterId}-dock-map`} />
          <feDisplacementMap
            in="SourceGraphic"
            in2={`${navFilterId}-dock-map`}
            scale={navFilterScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id={`liquid-tab-${navFilterId}-lens`}
          x="0"
          y="0"
          width={roundedLensWidth}
          height={roundedLensHeight}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage ref={lensFeImageRef} href={lensMap.href} xlinkHref={lensMap.href} preserveAspectRatio="none" width={roundedLensWidth} height={roundedLensHeight} result={`${navFilterId}-lens-map`} />
          <feDisplacementMap
            in="SourceGraphic"
            in2={`${navFilterId}-lens-map`}
            scale={lensFilterScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <div className="liquid-tab-surface absolute inset-0 pointer-events-none rounded-[30px]">
        <div className="liquid-tab-f-glass absolute inset-0 rounded-[30px]" />
      </div>
      <div ref={navRef} className="relative z-10 grid h-full grid-cols-4 items-center overflow-visible rounded-[30px] px-1.5">
        <motion.div
          className="absolute z-30 overflow-hidden rounded-[34px] pointer-events-none transform-gpu"
          style={{ willChange: 'transform, opacity, width, height' }}
          animate={{
            x: renderedLensLeft,
            y: renderedLensTop,
            width: renderedLensWidth,
            height: renderedLensHeight,
            opacity: isDraggingLens ? 0.94 : lensVisible ? 0.84 : 0.52,
            scale: isDraggingLens ? 1.1 : lensVisible ? 1.05 : 1,
          }}
          transition={
            isDraggingLens
              ? { duration: 0 }
              : {
                  x: { type: 'spring', stiffness: 820, damping: 46, mass: 0.66 },
                  y: { type: 'spring', stiffness: 820, damping: 46, mass: 0.66 },
                  width: { type: 'spring', stiffness: 820, damping: 46, mass: 0.66 },
                  height: { type: 'spring', stiffness: 820, damping: 46, mass: 0.66 },
                  opacity: { duration: lensVisible ? 0.07 : 0.13 },
                  scale: { duration: lensVisible ? 0.13 : 0.1, ease: [0.22, 1, 0.36, 1] },
                }
          }
        >
          <div className="liquid-tab-lens absolute inset-0 rounded-[34px]" />
        </motion.div>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              title={tab.label}
              data-tab={tab.id}
              data-testid={`bottom-nav-${tab.id}`}
              onPointerDown={(event) => startLensDrag(event, tab.id)}
              onPointerMove={moveLensDrag}
              onPointerUp={endLensDrag}
              onPointerCancel={endLensDrag}
              onClick={(event) => {
                if (suppressClickRef.current) {
                  event.preventDefault();
                  return;
                }
                selectTab(tab.id);
              }}
              className="liquid-glass-interactive relative z-20 flex h-[54px] items-center justify-center rounded-[25px] transition-all duration-300 group touch-none"
              data-liquid-adaptive={isActive ? undefined : 'true'}
            >
              <div className={`relative z-10 transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100 group-active:scale-90'}`}>
                <tab.icon
                   size={isCompactLayout ? 24 : 28}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={`transition-colors duration-300 ${
                    isActive
                      ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                      : 'text-white/65 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)] group-hover:text-white/85'
                  }`}
                  fill={isActive && tab.fillOnActive ? 'currentColor' : 'none'}
                />
              </div>
              <span className="sr-only">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
