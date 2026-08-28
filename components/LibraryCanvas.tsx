import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, type PanInfo, useDragControls, useMotionValue, useSpring } from 'framer-motion';
import { Icons } from './Icons';

export type LibraryBentoKind = 'song' | 'album' | 'playlist';

export interface LibraryBentoItem {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  kind: LibraryBentoKind;
  pinned?: boolean;
}

interface LibraryCanvasProps {
  items: LibraryBentoItem[];
  onOpen: (id: string) => void;
  onLongPress?: (id: string) => void;
  currentItemId?: string | null;
  selectedItemId?: string | null;
  isPlaying?: boolean;
  layoutKey: string;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}

const BASE_SIZE = 110;
const GAP = 12;
const COLS = 4;

interface GridItem {
  item: LibraryBentoItem;
  x: number;
  y: number;
  w: number;
  h: number;
  isLarge: boolean;
}

interface SavedLayout {
  order: string[];
  largeIds: string[];
}

interface LayoutState {
  identity: string;
  value: SavedLayout;
}

const defaultLarge = (index: number) => index === 0 || index % 7 === 5 || index % 11 === 8;
const storageKey = (key: string) => `jzone.library.bento.v2:${key}`;

const createDefaultLayout = (items: LibraryBentoItem[]): SavedLayout => ({
  order: items.map((item) => item.id),
  largeIds: items.filter((_, index) => defaultLarge(index)).map((item) => item.id),
});

const normalizeLayout = (items: LibraryBentoItem[], saved?: Partial<SavedLayout> | null): SavedLayout => {
  const ids = items.map((item) => item.id);
  const validIds = new Set(ids);
  const savedOrder = (saved?.order ?? []).filter((id) => validIds.has(id));
  const newIds = ids.filter((id) => !savedOrder.includes(id));
  const order = [...savedOrder, ...newIds];
  const defaultLargeIds = new Set(createDefaultLayout(items).largeIds);
  const savedLargeIds = new Set((saved?.largeIds ?? []).filter((id) => validIds.has(id)));
  newIds.forEach((id) => {
    if (defaultLargeIds.has(id)) savedLargeIds.add(id);
  });
  return {
    order,
    largeIds: saved?.largeIds ? Array.from(savedLargeIds) : Array.from(defaultLargeIds),
  };
};

const readSavedLayout = (items: LibraryBentoItem[], key: string): SavedLayout => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(key)) || 'null') as Partial<SavedLayout> | null;
    return normalizeLayout(items, saved);
  } catch {
    return createDefaultLayout(items);
  }
};

const generateGrid = (items: LibraryBentoItem[], largeIds: Set<string>) => {
  const occupied: number[] = [];
  const ensureRows = (rows: number) => {
    while (occupied.length < rows * COLS) occupied.push(0);
  };
  const fits = (index: number, size: number) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    if (col + size > COLS) return false;
    ensureRows(row + size + 1);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (occupied[(row + y) * COLS + col + x]) return false;
      }
    }
    return true;
  };
  const occupy = (index: number, size: number) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) occupied[(row + y) * COLS + col + x] = 1;
    }
  };

  const gridItems: GridItem[] = [];
  let maxY = 0;
  items.forEach((item) => {
    const isLarge = largeIds.has(item.id);
    const size = isLarge ? 2 : 1;
    let index = 0;
    while (!fits(index, size)) index += 1;
    occupy(index, size);
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const pixelSize = size * BASE_SIZE + (size - 1) * GAP;
    const x = col * (BASE_SIZE + GAP);
    const y = row * (BASE_SIZE + GAP);
    gridItems.push({ item, x, y, w: pixelSize, h: pixelSize, isLarge });
    maxY = Math.max(maxY, y + pixelSize);
  });

  return {
    items: gridItems,
    totalHeight: maxY,
    totalWidth: COLS * (BASE_SIZE + GAP) - GAP,
  };
};

const Tile: React.FC<{
  gridItem: GridItem;
  allItems: GridItem[];
  isCurrent: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  isEditing: boolean;
  layoutAnimationReady: boolean;
  suppressLongPress: boolean;
  gestureSuppressedRef: React.MutableRefObject<boolean>;
  scale: number;
  onOpen: (id: string) => void;
  onLongPress?: (id: string) => void;
  onMove: (sourceId: string, targetId: string) => void;
  onDropTargetChange: (id: string | null) => void;
  onToggleSize: (id: string) => void;
}> = ({ gridItem, allItems, isCurrent, isSelected, isDropTarget, isEditing, layoutAnimationReady, suppressLongPress, gestureSuppressedRef, scale, onOpen, onLongPress, onMove, onDropTargetChange, onToggleSize }) => {
  const tileRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const ItemIcon = gridItem.item.kind === 'album' ? Icons.Disc : gridItem.item.kind === 'playlist' ? Icons.ListMusic : Icons.Music2;

  useEffect(() => setImageFailed(false), [gridItem.item.coverUrl]);
  useEffect(() => {
    if (!suppressLongPress) return;
    clearTimer();
    pointerStartRef.current = null;
  }, [suppressLongPress]);

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const resolveDropTarget = (info: PanInfo) => {
    const canvas = tileRef.current?.parentElement;
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const centerX = (info.point.x - canvasRect.left) / Math.max(0.5, scale);
    const centerY = (info.point.y - canvasRect.top) / Math.max(0.5, scale);
    const target = allItems.reduce((best, candidate) => {
      const distance = Math.hypot(centerX - (candidate.x + candidate.w / 2), centerY - (candidate.y + candidate.h / 2));
      return !best || distance < best.distance ? { id: candidate.item.id, distance } : best;
    }, null as { id: string; distance: number } | null);
    return target?.id && target.id !== gridItem.item.id ? target.id : null;
  };

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDropTargetChange(resolveDropTarget(info));
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const targetId = resolveDropTarget(info);
    onDropTargetChange(null);
    if (targetId) onMove(gridItem.item.id, targetId);
    animate(dragX, 0, { type: 'spring', stiffness: 560, damping: 42, mass: 0.7 });
    animate(dragY, 0, { type: 'spring', stiffness: 560, damping: 42, mass: 0.7 });
  };

  return (
    <motion.div
      ref={tileRef}
      layout={!isEditing && layoutAnimationReady}
      data-bento-item={gridItem.item.id}
      data-bento-kind={gridItem.item.kind}
      data-bento-size={gridItem.isLarge ? 'large' : 'small'}
      drag={isEditing}
      dragMomentum={false}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      className={`absolute overflow-hidden bg-zinc-900 ${
        isDropTarget
          ? 'z-50 ring-2 ring-sky-300 shadow-[0_0_0_6px_rgba(125,211,252,0.18),0_0_36px_rgba(125,211,252,0.38)]'
          : isSelected
          ? 'z-40 ring-2 ring-white/75 shadow-[0_0_34px_rgba(255,255,255,0.24)]'
          : isCurrent
            ? 'z-30 ring-1 ring-white/45 shadow-[0_0_34px_rgba(255,255,255,0.2)]'
            : gridItem.isLarge
              ? 'z-10 border border-white/8 shadow-2xl'
              : 'z-0 border border-white/5 shadow-xl'
      }`}
      style={{
        width: gridItem.w,
        height: gridItem.h,
        left: gridItem.x,
        top: gridItem.y,
        x: dragX,
        y: dragY,
        borderRadius: gridItem.isLarge ? 26 : 16,
      }}
      whileTap={{ scale: isEditing ? 1.02 : 0.96 }}
      onPointerDown={(event) => {
        if (isEditing || gestureSuppressedRef.current) return;
        longPressedRef.current = false;
        pointerStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        timerRef.current = window.setTimeout(() => {
          if (gestureSuppressedRef.current) return;
          longPressedRef.current = true;
          navigator.vibrate?.(35);
          onLongPress?.(gridItem.item.id);
        }, 560);
      }}
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) clearTimer();
      }}
      onPointerUp={() => { clearTimer(); pointerStartRef.current = null; }}
      onPointerCancel={() => { clearTimer(); pointerStartRef.current = null; }}
      onPointerLeave={() => { clearTimer(); pointerStartRef.current = null; }}
      onClick={(event) => {
        if (isEditing || longPressedRef.current) {
          event.stopPropagation();
          return;
        }
        onOpen(gridItem.item.id);
      }}
    >
      {gridItem.item.coverUrl && !imageFailed ? (
        <img
          src={gridItem.item.coverUrl}
          alt=""
          className="h-full w-full select-none object-cover pointer-events-none"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-white/35">
          <ItemIcon size={gridItem.isLarge ? 54 : 30} />
        </div>
      )}

      {(gridItem.isLarge || isCurrent) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/38 to-transparent px-3 pb-4 pt-16">
          <div className={`${gridItem.isLarge ? 'text-[15px]' : 'text-xs'} truncate font-semibold text-white drop-shadow-md`}>{gridItem.item.title}</div>
          {gridItem.isLarge && gridItem.item.subtitle ? <div className="mt-0.5 truncate text-[11px] text-white/62">{gridItem.item.subtitle}</div> : null}
        </div>
      )}

      {isEditing && (
        <div className="absolute inset-0 z-20 bg-black/18 ring-2 ring-inset ring-white/30">
          <button
            type="button"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/58 text-white backdrop-blur-lg"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSize(gridItem.item.id);
            }}
            aria-label={gridItem.isLarge ? `缩小 ${gridItem.item.title}` : `放大 ${gridItem.item.title}`}
            title={gridItem.isLarge ? '缩小封面' : '放大封面'}
          >
            {gridItem.isLarge ? <Icons.Minimize2 size={17} /> : <Icons.Maximize2 size={17} />}
          </button>
          <Icons.GripVertical className="absolute bottom-2 left-2 text-white/75 drop-shadow" size={18} />
        </div>
      )}
    </motion.div>
  );
};

export const LibraryCanvas: React.FC<LibraryCanvasProps> = ({
  items,
  onOpen,
  onLongPress,
  currentItemId,
  selectedItemId,
  isPlaying = false,
  layoutKey,
  isEditing,
  onEditingChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const scaleSpring = useSpring(scale, { stiffness: 300, damping: 30 });
  const itemSignature = items.map((item) => item.id).join('|');
  const layoutIdentity = `${layoutKey}\u0000${itemSignature}`;
  const [scaleValue, setScaleValue] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [constraints, setConstraints] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [suppressLongPress, setSuppressLongPress] = useState(false);
  const [layoutAnimationIdentity, setLayoutAnimationIdentity] = useState<string | null>(null);
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    identity: layoutIdentity,
    value: readSavedLayout(items, layoutKey),
  }));
  const initializedRef = useRef(false);
  const gestureSuppressedRef = useRef(false);
  const gestureReleaseTimerRef = useRef<number | null>(null);

  // key 或条目变化时在提交前切换到对应保存布局，不能让旧/默认布局先绘制一帧。
  let currentLayoutState = layoutState;
  if (layoutState.identity !== layoutIdentity) {
    currentLayoutState = {
      identity: layoutIdentity,
      value: readSavedLayout(items, layoutKey),
    };
    setLayoutState(currentLayoutState);
  }
  const layout = currentLayoutState.value;
  const layoutAnimationReady = layoutAnimationIdentity === layoutIdentity;
  const setLayout = (next: React.SetStateAction<SavedLayout>) => {
    setLayoutState((previous) => {
      const current = previous.identity === layoutIdentity
        ? previous.value
        : readSavedLayout(items, layoutKey);
      return {
        identity: layoutIdentity,
        value: typeof next === 'function' ? next(current) : next,
      };
    });
  };

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setLayoutAnimationIdentity(layoutIdentity));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [layoutIdentity]);

  useEffect(() => {
    onEditingChange(false);
    setDropTargetId(null);
  }, [layoutIdentity, onEditingChange]);

  useEffect(() => {
    if (!items.length || !layout.order.length || currentLayoutState.identity !== layoutIdentity) return;
    try {
      localStorage.setItem(storageKey(layoutKey), JSON.stringify(layout));
    } catch {}
  }, [currentLayoutState.identity, items.length, layout, layoutIdentity, layoutKey]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const orderedItems = useMemo(
    () => layout.order.map((id) => itemById.get(id)).filter((item): item is LibraryBentoItem => Boolean(item)),
    [itemById, layout.order],
  );
  const grid = useMemo(() => generateGrid(orderedItems, new Set(layout.largeIds)), [layout.largeIds, orderedItems]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerSize((previous) => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      return previous.width === next.width && previous.height === next.height ? previous : next;
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => scale.on('change', setScaleValue), [scale]);

  useLayoutEffect(() => {
    if (!containerSize.width || !containerSize.height) return;
    if (!initializedRef.current) {
      const horizontalMargin = 18;
      const fitScale = Math.max(
        0.58,
        Math.min(0.74, (containerSize.width - horizontalMargin * 2) / grid.totalWidth),
      );
      scale.jump(fitScale);
      scaleSpring.jump(fitScale);
      x.jump((containerSize.width - grid.totalWidth * fitScale) / 2);
      y.jump(74);
      setScaleValue(fitScale);
      initializedRef.current = true;
    }
    const overscroll = Math.max(containerSize.width, containerSize.height) * 2.5 * Math.max(1, scaleValue);
    const right = 24 + overscroll;
    const bottom = 74 + overscroll;
    const left = Math.min(right, containerSize.width - grid.totalWidth * scaleValue - 24 - overscroll);
    const top = Math.min(bottom, containerSize.height - grid.totalHeight * scaleValue - 24 - overscroll);
    setConstraints({ top, bottom, left, right });
  }, [containerSize, grid.totalHeight, grid.totalWidth, scale, scaleSpring, scaleValue, x, y]);

  const lastDistanceRef = useRef<number | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (isEditing || (!event.ctrlKey && Math.abs(event.deltaY) >= 10)) return;
      event.preventDefault();
      scale.set(Math.min(3, Math.max(0.5, scale.get() - event.deltaY * 0.005)));
    };
    const onTouchMove = (event: TouchEvent) => {
      if (isEditing || event.touches.length !== 2) return;
      event.preventDefault();
      gestureSuppressedRef.current = true;
      setSuppressLongPress(true);
      const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
      if (lastDistanceRef.current !== null) scale.set(Math.min(3, Math.max(0.5, scale.get() + (distance - lastDistanceRef.current) * 0.005)));
      lastDistanceRef.current = distance;
    };
    const onTouchEnd = (event: TouchEvent) => {
      lastDistanceRef.current = null;
      if (event.touches.length > 0) return;
      if (gestureReleaseTimerRef.current) window.clearTimeout(gestureReleaseTimerRef.current);
      gestureReleaseTimerRef.current = window.setTimeout(() => {
        gestureSuppressedRef.current = false;
        setSuppressLongPress(false);
      }, 180);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      if (gestureReleaseTimerRef.current) window.clearTimeout(gestureReleaseTimerRef.current);
    };
  }, [isEditing, scale]);

  const moveItem = (sourceId: string, targetId: string) => {
    setLayout((previous) => {
      const order = [...previous.order];
      const sourceIndex = order.indexOf(sourceId);
      const targetIndex = order.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return previous;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, sourceId);
      return { ...previous, order };
    });
  };

  return (
    <div
      ref={containerRef}
      data-bento-canvas
      data-bento-scale={scaleValue.toFixed(3)}
      data-bento-grid-width={grid.totalWidth}
      data-bento-layout-key={layoutKey}
      data-bento-layout-ready={layoutAnimationReady ? 'true' : 'false'}
      onPointerDown={(event) => { if (!isEditing) dragControls.start(event); }}
      onTouchStart={(event) => {
        if (event.touches.length >= 2) {
          gestureSuppressedRef.current = true;
          setSuppressLongPress(true);
        }
      }}
      className={`relative h-[100dvh] min-h-screen w-full overflow-hidden bg-black ${isEditing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ touchAction: 'none' }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.12),transparent_24%)]" />

      {!grid.items.length ? <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600">当前条件下没有内容</div> : null}

      <motion.div
        drag={!isEditing}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={constraints}
        dragTransition={{ power: 0.2, timeConstant: 200 }}
        dragElastic={0.2}
        style={{ x, y, scale: scaleSpring }}
        className="absolute left-0 top-0 z-10 origin-top-left"
      >
        {grid.items.map((gridItem) => (
          <Tile
            key={gridItem.item.id}
            gridItem={gridItem}
            allItems={grid.items}
            isCurrent={currentItemId === gridItem.item.id && isPlaying}
            isSelected={selectedItemId === gridItem.item.id}
            isDropTarget={dropTargetId === gridItem.item.id}
            isEditing={isEditing}
            layoutAnimationReady={layoutAnimationReady}
            suppressLongPress={suppressLongPress}
            gestureSuppressedRef={gestureSuppressedRef}
            scale={scaleValue}
            onOpen={onOpen}
            onLongPress={onLongPress}
            onMove={moveItem}
            onDropTargetChange={setDropTargetId}
            onToggleSize={(id) => setLayout((previous) => ({
              ...previous,
              largeIds: previous.largeIds.includes(id)
                ? previous.largeIds.filter((itemId) => itemId !== id)
                : [...previous.largeIds, id],
            }))}
          />
        ))}
      </motion.div>
    </div>
  );
};
