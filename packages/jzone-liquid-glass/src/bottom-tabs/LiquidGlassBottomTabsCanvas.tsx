import * as React from 'react';
import type { ElementInteraction } from '../context';
import { LiquidGlassCanvas } from '../context';
import type { GlassElementConfig, LiquidGlassRenderer, VectorIconSpec } from '../renderer';
import { DEFAULT_HIGHLIGHT, DEFAULT_SHADOW } from '../catalog/types';
import { makeGlassShape, makeTabDragInteractions, makeText } from '../catalog/helpers';

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

const DEFAULT_ACCENT_COLOR: Rgb = [239 / 255, 68 / 255, 68 / 255];
const DEFAULT_ICON_COLOR: Rgba = [1, 1, 1, 0.82];
const DEFAULT_CONTAINER_COLOR: Rgba = [0x12 / 255, 0x12 / 255, 0x12 / 255, 0.4];

export const LIQUID_BOTTOM_TAB_DEFAULTS = Object.freeze({
  containerHeight: 64,
  contentHeight: 56,
  innerPadding: 4,
  horizontalPadding: 36,
  bottomInset: 18,
  containerRefractionHeight: 24,
  containerRefractionAmount: -24,
  containerBlurRadius: 8,
  containerSaturation: 1.5,
  indicatorRefractionHeight: 10,
  indicatorRefractionAmount: -14,
  indicatorBlurRadius: 0,
  dpr: 1.25,
  blurTapCap: 17,
});

export interface LiquidGlassBottomTabItem {
  id: string;
  label: string;
  icon: Omit<VectorIconSpec, 'color'>;
  fillWhenActive?: boolean;
}

export interface LiquidGlassBottomTabsCanvasProps {
  items: LiquidGlassBottomTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  wallpaperSrc: string;
  className?: string;
  groupId?: string;
  horizontalPadding?: number;
  bottomInset?: number;
  accentColor?: Rgb;
  iconColor?: Rgba;
  containerColor?: Rgba;
  dpr?: number;
  blurTapCap?: number;
  cornerStyle?: 0 | 1;
}

interface BuiltTabs {
  elements: GlassElementConfig[];
  interactions: Record<string, ElementInteraction>;
}

const buildBottomTabs = ({
  width,
  height,
  items,
  activeIndex,
  onSelect,
  rendererRef,
  groupId,
  horizontalPadding,
  bottomInset,
  accentColor,
  iconColor,
  containerColor,
}: {
  width: number;
  height: number;
  items: LiquidGlassBottomTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  rendererRef: React.MutableRefObject<LiquidGlassRenderer | null>;
  groupId: string;
  horizontalPadding: number;
  bottomInset: number;
  accentColor: Rgb;
  iconColor: Rgba;
  containerColor: Rgba;
}): BuiltTabs => {
  const elements: GlassElementConfig[] = [];
  const interactions: Record<string, ElementInteraction> = {};
  if (!items.length) return { elements, interactions };

  const containerHeight = LIQUID_BOTTOM_TAB_DEFAULTS.containerHeight;
  const glassHeight = LIQUID_BOTTOM_TAB_DEFAULTS.contentHeight;
  const glassPadding = LIQUID_BOTTOM_TAB_DEFAULTS.innerPadding;
  const containerX = horizontalPadding;
  const containerY = Math.max(12, height - bottomInset - containerHeight);
  const containerWidth = Math.max(1, width - horizontalPadding * 2);
  const glassX = containerX + glassPadding;
  const glassY = containerY + glassPadding;
  const glassWidth = Math.max(1, containerWidth - glassPadding * 2);
  const tabWidth = glassWidth / items.length;

  const container = makeGlassShape(
    `${groupId}-container`,
    { x: containerX, y: containerY, w: containerWidth, h: containerHeight },
    {
      cornerRadius: containerHeight / 2,
      refractionHeight: LIQUID_BOTTOM_TAB_DEFAULTS.containerRefractionHeight,
      refractionAmount: LIQUID_BOTTOM_TAB_DEFAULTS.containerRefractionAmount,
      blurRadius: LIQUID_BOTTOM_TAB_DEFAULTS.containerBlurRadius,
      saturation: LIQUID_BOTTOM_TAB_DEFAULTS.containerSaturation,
      surfaceColor: containerColor,
      highlight: { ...DEFAULT_HIGHLIGHT, alpha: 1 },
      outerShadow: null,
      depthEffect: true,
    },
    false,
  );
  container.isBottomTabContainer = { groupId, tabsCount: items.length };
  elements.push(container);

  const drag = makeTabDragInteractions(groupId, tabWidth, items.length, onSelect, rendererRef);
  items.forEach((item, index) => {
    const id = `${groupId}-tab-${index}`;
    const content = makeText(
      id,
      { x: glassX + tabWidth * index, y: glassY, w: tabWidth, h: glassHeight },
      '',
      {
        color: iconColor,
        align: 'center',
        paddingPx: 0,
        halo: 'dark',
        icon: {
          ...item.icon,
          color: iconColor,
          size: item.icon.size ?? 28,
          layoutSize: item.icon.layoutSize ?? 30,
          fill: item.fillWhenActive ? index === activeIndex : item.icon.fill,
        },
      },
      false,
    );
    content.isBottomTabContent = {
      groupId,
      containerCenterX: containerX + containerWidth / 2,
      containerCenterY: containerY + containerHeight / 2,
      containerWidth,
    };
    elements.push(content);
    interactions[id] = {
      onTap: () => onSelect(index),
      onDragStart: drag.onDragStart,
      onDrag: drag.onDrag,
      onDragEnd: drag.onDragEnd,
    };
  });
  interactions[container.id] = drag;

  const indicator = makeGlassShape(
    `${groupId}-indicator`,
    { x: glassX, y: glassY, w: tabWidth, h: glassHeight },
    {
      cornerRadius: glassHeight / 2,
      refractionHeight: LIQUID_BOTTOM_TAB_DEFAULTS.indicatorRefractionHeight,
      refractionAmount: LIQUID_BOTTOM_TAB_DEFAULTS.indicatorRefractionAmount,
      blurRadius: LIQUID_BOTTOM_TAB_DEFAULTS.indicatorBlurRadius,
      saturation: 1,
      surfaceColor: [0, 0, 0, 0],
      highlight: { ...DEFAULT_HIGHLIGHT, alpha: 1 },
      outerShadow: { ...DEFAULT_SHADOW },
      innerShadow: { radius: 8, alpha: 0.15, offsetX: 0, offsetY: 8 },
      chromaticAberration: true,
    },
    false,
  );
  indicator.tintColor = [0, 0, 0, 0];
  indicator.isBottomTabIndicator = {
    groupId,
    dragWidth: tabWidth,
    dimColor: iconColor,
    accentColor,
    containerRect: { x: glassX, y: glassY, w: glassWidth, h: glassHeight },
    containerCenterX: containerX + containerWidth / 2,
    containerCenterY: containerY + containerHeight / 2,
    containerWidth,
    tabContentIds: items.map((_, index) => `${groupId}-tab-${index}`),
    tabContentRects: items.map((_, index) => ({
      x: glassX + tabWidth * index,
      y: glassY,
      w: tabWidth,
      h: glassHeight,
    })),
  };
  elements.push(indicator);

  return { elements, interactions };
};

const hiddenButtonStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function LiquidGlassBottomTabsCanvas({
  items,
  activeId,
  onChange,
  wallpaperSrc,
  className,
  groupId = 'jzone-bottom-tabs',
  horizontalPadding = LIQUID_BOTTOM_TAB_DEFAULTS.horizontalPadding,
  bottomInset = LIQUID_BOTTOM_TAB_DEFAULTS.bottomInset,
  accentColor = DEFAULT_ACCENT_COLOR,
  iconColor = DEFAULT_ICON_COLOR,
  containerColor = DEFAULT_CONTAINER_COLOR,
  dpr = LIQUID_BOTTOM_TAB_DEFAULTS.dpr,
  blurTapCap = LIQUID_BOTTOM_TAB_DEFAULTS.blurTapCap,
  cornerStyle = 1,
}: LiquidGlassBottomTabsCanvasProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const rendererRef = React.useRef<LiquidGlassRenderer | null>(null);
  const [size, setSize] = React.useState({ width: 390, height: 780 });
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const selectIndex = React.useCallback((index: number) => {
    const item = items[index];
    if (item) onChange(item.id);
  }, [items, onChange]);

  const built = React.useMemo(() => buildBottomTabs({
    width: size.width,
    height: size.height,
    items,
    activeIndex,
    onSelect: selectIndex,
    rendererRef,
    groupId,
    horizontalPadding,
    bottomInset,
    accentColor,
    iconColor,
    containerColor,
  }), [accentColor, activeIndex, bottomInset, containerColor, groupId, horizontalPadding, iconColor, items, selectIndex, size.height, size.width]);

  return (
    <div ref={hostRef} className={className} role="navigation" aria-label="主导航">
      <LiquidGlassCanvas
        wallpaperSrc={wallpaperSrc}
        elements={built.elements}
        interactions={built.interactions}
        tabTargets={{ [groupId]: { tabIndex: activeIndex, tabsCount: items.length } }}
        rendererRef={rendererRef}
        dpr={dpr}
        blurTapCap={blurTapCap}
        cornerStyle={cornerStyle}
        className="jzone-liquid-glass-canvas"
      />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === activeId ? 'page' : undefined}
          onClick={() => onChange(item.id)}
          style={hiddenButtonStyle}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
