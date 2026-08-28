import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';
import {
  BOTTOM_DOCK_GEOMETRY,
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
  compactMode?: 'full' | 'home';
  compactDocked?: boolean;
  onCompactHomeClick?: () => void;
}

const JZONE_RED = { r: 239, g: 68, b: 68 };
const ICON_WHITE = { r: 255, g: 255, b: 255 };
const EMPTY_LENS_MAP: LiquidGlassDisplacementMap = { href: '', scale: 0 };

const smoothStep = (value: number) => value * value * (3 - 2 * value);

const getDragIconColor = (pointerX: number, tabCenterX: number, itemWidth: number) => {
  const radius = Math.max(32, itemWidth * 1.08);
  const normalizedDistance = Math.min(1, Math.abs(pointerX - tabCenterX) / radius);
  const proximity = 1 - smoothStep(normalizedDistance);
  const red = Math.round(ICON_WHITE.r + (JZONE_RED.r - ICON_WHITE.r) * proximity);
  const green = Math.round(ICON_WHITE.g + (JZONE_RED.g - ICON_WHITE.g) * proximity);
  const blue = Math.round(ICON_WHITE.b + (JZONE_RED.b - ICON_WHITE.b) * proximity);
  return `rgb(${red}, ${green}, ${blue})`;
};

const getInitialNavWidth = (bottomTabLayout: LiquidGlassLayoutMode) => {
  const maxWidth = bottomTabLayout === 'compact'
    ? BOTTOM_DOCK_GEOMETRY.compactMaxWidth
    : BOTTOM_DOCK_GEOMETRY.wideMaxWidth;
  if (typeof window === 'undefined') return maxWidth;
  return Math.min(maxWidth, Math.max(1, window.innerWidth - BOTTOM_DOCK_GEOMETRY.viewportGutter * 2));
};

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  setTab,
  profileAvatarUrl,
  compactMode = 'full',
  compactDocked = false,
  onCompactHomeClick,
}) => {
  const liquidGlassSettings = useLiquidGlassSettings();
  const { bottomTabLayout } = liquidGlassSettings;
  const isCompactLayout = bottomTabLayout === 'compact';
  const isCompactHomeOnly = isCompactLayout && compactMode === 'home';
  const effectiveNavGlass = liquidGlassSettings;
  const navGlassVars = getLiquidGlassCssVars(effectiveNavGlass);
  const navFilterId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [lensVisible, setLensVisible] = React.useState(false);
  const [isDraggingLens, setIsDraggingLens] = React.useState(false);
  const [dragVisual, setDragVisual] = React.useState<{ centerX: number; pointerX: number } | null>(null);
  const [navWidth, setNavWidth] = React.useState(() => getInitialNavWidth(bottomTabLayout));
  const [navMap, setNavMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const [lensMap, setLensMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const shellRef = React.useRef<HTMLDivElement>(null);
  const navRef = React.useRef<HTMLDivElement>(null);
  const navFeImageRef = React.useRef<SVGFEImageElement>(null);
  const lensFeImageRef = React.useRef<SVGFEImageElement>(null);
  const dragRef = React.useRef<{
    startX: number;
    startCenter: number;
    currentCenter: number;
    currentPointerX: number;
    navLeft: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const dragFrameRef = React.useRef<number | null>(null);
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
  const itemWidth = navTrackWidth / (isCompactHomeOnly ? 1 : tabs.length);
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
  const navHeight = BOTTOM_DOCK_GEOMETRY.navHeight;
  const roundedNavWidth = Math.max(1, Math.round(navWidth));
  const roundedLensWidth = Math.max(1, Math.round(renderedLensWidth));
  const roundedLensHeight = Math.max(1, Math.round(renderedLensHeight));
  const activeCenterX = navTrackPadding + activeIndex * itemWidth + itemWidth / 2;
  const renderedLensCenterX = dragVisual?.centerX ?? activeCenterX;
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

  const isCompactDrag = isCompactLayout && isDraggingLens && dragVisual !== null;

  React.useEffect(() => {
    setLensVisible(true);
    if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    hideLensTimerRef.current = window.setTimeout(() => setLensVisible(false), 460);
    return () => {
      if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    };
  }, [currentTab]);

  React.useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const stableWidth = isCompactLayout && compactDocked
        ? (isCompactHomeOnly ? BOTTOM_DOCK_GEOMETRY.compactCircleSize : BOTTOM_DOCK_GEOMETRY.compactMaxWidth)
        : rect.width;
      if (stableWidth > 0) setNavWidth(stableWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [compactDocked, isCompactHomeOnly, isCompactLayout]);

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
    if (isCompactLayout) {
      setLensMap(EMPTY_LENS_MAP);
      return;
    }
    setLensMap(
      createLiquidGlassDisplacementMap(roundedLensWidth, roundedLensHeight, {
        edgeScale: Math.min(1.18, effectiveNavGlass.edgeRefraction * 1.12),
        centerStrength: 0.24,
        sideVerticalDamp: 0.45,
        sideHorizontalBoost: 1.08,
        normalization: 0.68,
      }),
    );
  }, [effectiveNavGlass.edgeRefraction, isCompactLayout, roundedLensHeight, roundedLensWidth]);

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

  React.useEffect(() => () => {
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
  }, [compactMode]);

  const clampLensCenter = (value: number) => {
    const min = lensExpandedWidth / 2 + navTrackPadding;
    const max = Math.max(min, navWidth - lensExpandedWidth / 2 - navTrackPadding);
    return Math.min(max, Math.max(min, value));
  };

  const getPointerX = (clientX: number, navLeft: number) => {
    if (!Number.isFinite(clientX) || !Number.isFinite(navLeft)) return activeCenterX;
    return clientX - navLeft;
  };

  const getClosestTabIndex = (pointerX: number) => Math.min(
    tabs.length - 1,
    Math.max(0, Math.round((pointerX - navTrackPadding - itemWidth / 2) / itemWidth)),
  );

  const scheduleDragVisualUpdate = () => {
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const drag = dragRef.current;
      if (!drag) return;
      setDragVisual({ centerX: drag.currentCenter, pointerX: drag.currentPointerX });
    });
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
    if (isCompactHomeOnly) return;
    if (tabId !== currentTab) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
    const navLeft = navRef.current?.getBoundingClientRect().left ?? event.clientX - activeCenterX;
    const pointerX = getPointerX(event.clientX, navLeft);
    dragRef.current = {
      startX: event.clientX,
      startCenter: activeCenterX,
      currentCenter: activeCenterX,
      currentPointerX: pointerX,
      navLeft,
      pointerId: event.pointerId,
      moved: false,
    };
    setIsDraggingLens(true);
    setLensVisible(true);
    setDragVisual({ centerX: activeCenterX, pointerX });
  };

  const moveLensDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    drag.currentPointerX = getPointerX(event.clientX, drag.navLeft);
    drag.currentCenter = clampLensCenter(drag.startCenter + delta);
    scheduleDragVisualUpdate();
  };

  const endLensDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.type !== 'pointerup') {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      dragRef.current = null;
      setIsDraggingLens(false);
      setDragVisual(null);
      setLensVisible(true);
      if (hideLensTimerRef.current) window.clearTimeout(hideLensTimerRef.current);
      hideLensTimerRef.current = window.setTimeout(() => setLensVisible(false), 260);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }
    const pointerX = getPointerX(event.clientX, drag.navLeft);
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    drag.currentPointerX = pointerX;
    drag.currentCenter = clampLensCenter(drag.startCenter + delta);
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const finalPointerX = drag.currentPointerX;
    const nextIndex = getClosestTabIndex(finalPointerX);
    if (drag.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setIsDraggingLens(false);
    setDragVisual(null);
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
      ref={shellRef}
      className={`fixed z-30 h-[66px] transition-[width,left,bottom,transform] duration-300 ease-out ${compactDocked ? 'overflow-hidden' : 'overflow-visible'}`}
      style={{
        ...navDynamicVars,
        left: compactDocked
          ? `calc(50% - ${BOTTOM_DOCK_GEOMETRY.compactPairWidth / 2}px)`
          : '50%',
        transform: compactDocked ? 'none' : 'translateX(-50%)',
        width: isCompactHomeOnly
          ? `${BOTTOM_DOCK_GEOMETRY.compactCircleSize}px`
          : `min(${isCompactLayout ? BOTTOM_DOCK_GEOMETRY.compactMaxWidth : BOTTOM_DOCK_GEOMETRY.wideMaxWidth}px, calc(100vw - ${BOTTOM_DOCK_GEOMETRY.viewportGutter * 2}px))`,
        bottom: `calc(env(safe-area-inset-bottom) + ${isCompactLayout ? BOTTOM_DOCK_GEOMETRY.compactNavBottom : BOTTOM_DOCK_GEOMETRY.wideNavBottom}px)`,
      }}
      data-liquid-control-root
      data-layout-mode={bottomTabLayout}
      data-testid="bottom-nav-layer"
      data-dragging={isDraggingLens ? 'true' : 'false'}
      data-compact-presentation={isCompactHomeOnly ? 'home' : 'full'}
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
        {!isCompactLayout && (
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
        )}
      </svg>
      <div className="liquid-tab-surface absolute inset-0 pointer-events-none rounded-[30px]">
        <div className="liquid-tab-f-glass absolute inset-0 rounded-[30px]" />
      </div>
      <div
        ref={navRef}
        className="relative z-10 flex h-full shrink-0 items-center overflow-visible rounded-[30px] px-1.5"
        style={{ width: isCompactLayout && compactDocked ? `${BOTTOM_DOCK_GEOMETRY.compactMaxWidth}px` : '100%' }}
      >
        {!isCompactLayout && (
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
            aria-hidden="true"
            data-testid="bottom-nav-lens"
            data-lens-visual="visible"
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
        )}
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const isVisible = !isCompactHomeOnly || tab.id === 'home';
          const isHighlighted = isActive || (isCompactHomeOnly && tab.id === 'home');
          const tabIndex = tabs.findIndex((item) => item.id === tab.id);
          const tabCenterX = navTrackPadding + tabIndex * itemWidth + itemWidth / 2;
          const dragIconColor = isCompactDrag && dragVisual
            ? getDragIconColor(dragVisual.pointerX, tabCenterX, itemWidth)
            : undefined;
          return (
            <motion.button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              aria-hidden={!isVisible}
              tabIndex={isVisible ? 0 : -1}
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
                if (isCompactHomeOnly && tab.id === 'home') {
                  onCompactHomeClick?.();
                  return;
                }
                selectTab(tab.id);
              }}
              className={`liquid-glass-interactive relative z-20 flex h-[54px] min-w-0 shrink-0 items-center justify-center overflow-hidden rounded-[25px] group touch-none ${isVisible ? '' : 'pointer-events-none'}`}
              style={{
                ...(dragIconColor ? { color: dragIconColor } : {}),
                width: isCompactLayout && compactDocked
                  ? `${(BOTTOM_DOCK_GEOMETRY.compactMaxWidth - navTrackPadding * 2) / tabs.length}px`
                  : `${100 / tabs.length}%`,
              }}
              animate={{
                opacity: isVisible ? 1 : 0,
                scale: isVisible ? 1 : 0.72,
              }}
              transition={{ type: 'spring', stiffness: 430, damping: 38, mass: 0.72 }}
              data-liquid-adaptive={isDraggingLens || isHighlighted ? undefined : 'true'}
            >
              <div className={`relative z-10 transition-transform duration-300 ${isHighlighted ? 'scale-110' : 'scale-100 group-active:scale-90'}`}>
                <tab.icon
                   size={isCompactLayout ? 24 : 28}
                   strokeWidth={isHighlighted ? 2.5 : 1.8}
                   className={`${isCompactDrag ? 'transition-none' : 'transition-colors duration-300'} ${
                     isCompactDrag
                       ? 'drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]'
                       : isHighlighted
                       ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                       : 'text-white/65 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)] group-hover:text-white/85'
                   }`}
                   data-drag-proximity={isCompactDrag && dragVisual
                     ? String(Math.max(0, 1 - Math.min(1, Math.abs(dragVisual.pointerX - tabCenterX) / Math.max(32, itemWidth * 1.08))))
                     : undefined}
                   fill={isHighlighted && tab.fillOnActive ? 'currentColor' : 'none'}
                />
              </div>
              <span className="sr-only">{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
