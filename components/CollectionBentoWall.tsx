import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useDragControls, useMotionValue, useSpring } from 'framer-motion';
import { Song } from '../types';

interface CollectionBentoWallProps {
  songs: Song[];
}

const BASE_SIZE = 82;
const GAP = 10;
const COLS = 6;

type TileType = 'large' | 'small';

interface GridItem {
  song: Song;
  x: number;
  y: number;
  w: number;
  h: number;
  type: TileType;
}

const generateGrid = (songs: Song[]): { items: GridItem[]; totalHeight: number; totalWidth: number } => {
  const grid: number[] = [];
  const ensureRows = (rows: number) => {
    const need = rows * COLS;
    while (grid.length < need) grid.push(0);
  };

  const checkFit = (idx: number, size: number) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    if (col + size > COLS) return false;
    ensureRows(row + size + 1);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[(row + r) * COLS + (col + c)] === 1) return false;
      }
    }
    return true;
  };

  const placeItem = (idx: number, size: number) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    ensureRows(row + size + 1);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        grid[(row + r) * COLS + (col + c)] = 1;
      }
    }
  };

  const items: GridItem[] = [];
  let maxY = 0;

  songs.forEach((song, index) => {
    const isLarge = index === 0 || index % 13 === 0;
    const size = isLarge ? 2 : 1;

    let i = 0;
    while (!checkFit(i, size)) i++;
    placeItem(i, size);

    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const pixelSize = size * BASE_SIZE + (size - 1) * GAP;
    const xPos = col * (BASE_SIZE + GAP);
    const yPos = row * (BASE_SIZE + GAP);

    items.push({
      song,
      x: xPos,
      y: yPos,
      w: pixelSize,
      h: pixelSize,
      type: isLarge ? 'large' : 'small',
    });

    if (yPos + pixelSize > maxY) maxY = yPos + pixelSize;
  });

  return {
    items,
    totalHeight: maxY,
    totalWidth: COLS * (BASE_SIZE + GAP) - GAP,
  };
};

export const CollectionBentoWall: React.FC<CollectionBentoWallProps> = ({ songs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { items, totalHeight, totalWidth } = useMemo(() => generateGrid(songs), [songs]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const scaleSpring = useSpring(scale, { stiffness: 300, damping: 30 });
  const [constraints, setConstraints] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [scaleValue, setScaleValue] = useState(1);
  const initializedRef = useRef(false);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unsub = scale.on('change', (v) => setScaleValue(v));
    return () => unsub();
  }, [scale]);

  useEffect(() => {
    const { w: cw, h: ch } = containerSize;
    if (!cw || !ch) return;
    if (!initializedRef.current) {
      x.set(24);
      y.set(24);
      initializedRef.current = true;
    }

    const paddingX = 24;
    const paddingY = 24;
    const overscroll = Math.max(cw, ch) * 2 * Math.max(1, scaleValue);
    const scaledW = totalWidth * scaleValue;
    const scaledH = totalHeight * scaleValue;

    const right = paddingX + overscroll;
    const bottom = paddingY + overscroll;
    const left = Math.min(right, cw - scaledW - paddingX - overscroll);
    const top = Math.min(bottom, ch - scaledH - paddingY - overscroll);

    setConstraints({ top, bottom, left, right });
    x.set(clamp(x.get(), left, right));
    y.set(clamp(y.get(), top, bottom));
  }, [containerSize, scaleValue, totalHeight, totalWidth, x, y]);

  const lastDist = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < 10) {
        e.preventDefault();
        const currentScale = scale.get();
        const nextScale = currentScale - e.deltaY * 0.005;
        scale.set(Math.min(Math.max(nextScale, 0.5), 3));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      if (lastDist.current !== null) {
        const currentScale = scale.get();
        const delta = dist - lastDist.current;
        scale.set(Math.min(Math.max(currentScale + delta * 0.005, 0.5), 3));
      }
      lastDist.current = dist;
    };

    const handleTouchEnd = () => {
      lastDist.current = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scale]);

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => dragControls.start(e)}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={constraints}
        dragTransition={{ power: 0.2, timeConstant: 200 }}
        dragElastic={0.2}
        style={{ x, y, scale: scaleSpring }}
        className="absolute top-0 left-0 origin-top-left"
      >
        {items.map((item) => (
          <div
            key={item.song.id}
            className="absolute overflow-hidden"
            style={{
              width: item.w,
              height: item.h,
              transform: `translate(${item.x}px, ${item.y}px)`,
              borderRadius: item.type === 'large' ? 22 : 16,
            }}
          >
            <img src={item.song.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          </div>
        ))}
      </motion.div>
    </div>
  );
};

