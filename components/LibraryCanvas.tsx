import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, useDragControls } from 'framer-motion';
import { Song } from '../types';

interface LibraryCanvasProps {
  songs: Song[];
  onPlay: (id: string) => void;
  currentSongId: string | null;
  isPlaying: boolean;
}

// --- Configuration ---
const BASE_SIZE = 110; // Slightly smaller base to fit more on mobile screens
const GAP = 12;        // Unified gap
const COLS = 4;        // Fixed logic columns

type TileType = 'large' | 'small';

interface GridItem {
  song: Song;
  x: number;
  y: number;
  w: number;
  h: number;
  type: TileType;
}

// --- Packing Algorithm (Strict 1:1 Aspect Ratio) ---
const generateGrid = (songs: Song[]): { items: GridItem[], totalHeight: number, totalWidth: number } => {
  const grid: number[] = new Array(COLS * 200).fill(0); 
  const items: GridItem[] = [];
  let maxY = 0;

  const checkFit = (idx: number, size: number) => {
    const row = Math.floor(idx / COLS);
    const col = idx % COLS;
    if (col + size > COLS) return false;

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
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        grid[(row + r) * COLS + (col + c)] = 1;
      }
    }
  };

  songs.forEach((song, index) => {
    // Strategy: First item is always Large (Hero), others are Small
    // Logic can be expanded later to make every 10th item Large, etc.
    const isLarge = index === 0; 
    const size = isLarge ? 2 : 1; 
    
    let i = 0;
    while (!checkFit(i, size)) {
      i++;
    }

    placeItem(i, size);

    const row = Math.floor(i / COLS);
    const col = i % COLS;

    // Strict Square Calculation
    const pixelSize = size * BASE_SIZE + (size - 1) * GAP;
    const xPos = col * (BASE_SIZE + GAP);
    const yPos = row * (BASE_SIZE + GAP);

    items.push({
      song,
      x: xPos,
      y: yPos,
      w: pixelSize,
      h: pixelSize, // H == W (Strict Square)
      type: isLarge ? 'large' : 'small'
    });

    if (yPos + pixelSize > maxY) maxY = yPos + pixelSize;
  });

  return { 
    items, 
    totalHeight: maxY, 
    totalWidth: COLS * (BASE_SIZE + GAP) - GAP 
  };
};

// --- Memoized Tile Component for Performance ---
const Tile = React.memo(({ item, isPlaying, isCurrent, onPlay }: { item: GridItem, isPlaying: boolean, isCurrent: boolean, onPlay: (id: string) => void }) => {
    // Dynamic border radius based on size for that polished look
    const borderRadius = item.type === 'large' ? 28 : 16;
    
    return (
        <motion.div
            className={`absolute bg-zinc-900 overflow-hidden group
                ${isCurrent 
                    ? 'z-30 shadow-[0_0_40px_rgba(255,255,255,0.25)] border border-white/40' // Bright white glow & light border
                    : item.type === 'large' 
                        ? 'z-10 shadow-2xl border border-white/5' 
                        : 'z-0 shadow-xl border border-white/5'
                }
            `}
            style={{
                width: item.w,
                height: item.h,
                x: item.x,
                y: item.y,
                borderRadius: borderRadius,
            }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onPlay(item.song.id)}
        >
            <div className="w-full h-full relative">
                {/* 1. Image Layer - Strict Cover */}
                <img 
                    src={item.song.coverUrl} 
                    alt=""
                    className="w-full h-full object-cover pointer-events-none select-none"
                    loading="lazy"
                />

                {/* 2. Playing Indicator - Win10 Magnet Style (White Glow) */}
                {isCurrent && (
                    <div className="absolute inset-0 z-20 pointer-events-none">
                         {/* Soft inner white wash */}
                         <div className="absolute inset-0 bg-white/10 mix-blend-overlay"></div>
                         
                         {/* Elegant inset ring with white pulse */}
                         <motion.div 
                            className="absolute inset-0 border-[3px] border-white/50 shadow-[inset_0_0_20px_rgba(255,255,255,0.3)]"
                            style={{ borderRadius: borderRadius }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                         />
                         
                         {/* Minimal white active dot in top-right */}
                         <div className="absolute top-3 right-3 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse"></div>
                    </div>
                )}

                {/* 3. Adaptive Disclosure - Show text for Large tiles OR Current Playing tile */}
                {(item.type === 'large' || isCurrent) && (
                    <div className="absolute inset-x-0 bottom-0 pt-16 pb-4 px-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none">
                        <motion.h3 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`text-white font-semibold leading-tight tracking-tight truncate drop-shadow-md
                                ${item.type === 'large' ? 'text-[15px]' : 'text-[12px]'}
                            `}
                        >
                            {item.song.title}
                        </motion.h3>
                    </div>
                )}
            </div>
        </motion.div>
    );
}, (prev, next) => {
    return prev.isCurrent === next.isCurrent && prev.isPlaying === next.isPlaying && prev.item.song.id === next.item.song.id;
});


export const LibraryCanvas: React.FC<LibraryCanvasProps> = ({ songs, onPlay, currentSongId, isPlaying }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { items, totalHeight, totalWidth } = useMemo(() => generateGrid(songs), [songs]);

  // Physics Motion Values
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  
  const scaleSpring = useSpring(scale, { stiffness: 300, damping: 30 });

  const [constraints, setConstraints] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  useEffect(() => {
    if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        
        // --- 3. Initial Positioning Logic ---
        // Requirement: Focus on first Large tile with ~24px padding.
        // Assuming first item is at 0,0.
        const initialX = 24; 
        const initialY = 24 + 50; // Extra top padding to clear header visually
        
        x.set(initialX);
        y.set(initialY);

        // Calculate drag constraints to allow full panning
        // We want to be able to drag until the edge of content hits the center or edge of screen
        setConstraints({
            top: -totalHeight + ch / 2,
            bottom: ch / 2,
            left: -totalWidth + cw / 2,
            right: cw / 2
        });
    }
  }, [totalWidth, totalHeight]);

  // --- Pinch to Zoom Logic (Keep existing logic) ---
  const lastDist = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < 10) { 
        e.preventDefault();
        const currentScale = scale.get();
        const newScale = currentScale - e.deltaY * 0.005;
        scale.set(Math.min(Math.max(newScale, 0.5), 3));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2) {
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
        }
    };

    const handleTouchEnd = () => { lastDist.current = null; };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div 
        ref={containerRef}
        onPointerDown={(e) => dragControls.start(e)}
        className="relative w-full h-[calc(100vh-140px)] overflow-hidden bg-black cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
    >
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false} 
        dragConstraints={constraints}
        // --- 4. Physics & Damping ---
        dragTransition={{ power: 0.2, timeConstant: 200 }} 
        dragElastic={0.2}
        style={{ x, y, scale: scaleSpring }}
        className="absolute top-0 left-0 origin-top-left z-10"
      >
        {items.map((item) => (
            <Tile 
                key={item.song.id} 
                item={item} 
                isPlaying={isPlaying} 
                isCurrent={currentSongId === item.song.id}
                onPlay={onPlay}
            />
        ))}
      </motion.div>
    </div>
  );
};
