import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Song } from '../../types';
import type { CoverPuzzleRecordRow } from '../../supabaseApi';
import { supabaseApi } from '../../supabaseApi';
import { useModalPresence } from '../../modalPresence';
import { formatPuzzleTime, getCoverPuzzleIdentity } from '../../utils/coverPuzzle';
import { Icons } from '../Icons';
import { AchievementCelebration } from './AchievementCelebration';

const SOLVED_TILES = Array.from({ length: 9 }, (_, index) => index);

const shuffleTiles = () => {
  const next = [...SOLVED_TILES];
  do {
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
  } while (next.every((value, index) => value === index));
  return next;
};

interface CoverPuzzleModalProps {
  song: Song | null;
  onClose: () => void;
}

export const CoverPuzzleModal: React.FC<CoverPuzzleModalProps> = ({ song, onClose }) => {
  const open = Boolean(song);
  useModalPresence(open);
  const reduceMotion = useReducedMotion();
  const [tiles, setTiles] = React.useState<number[]>(SOLVED_TILES);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [coverKey, setCoverKey] = React.useState('');
  const [record, setRecord] = React.useState<CoverPuzzleRecordRow | null>(null);
  const [saveError, setSaveError] = React.useState('');
  const [completed, setCompleted] = React.useState(false);
  const [celebrating, setCelebrating] = React.useState(false);
  const completedRef = React.useRef(false);

  const reset = React.useCallback(() => {
    setTiles(shuffleTiles());
    setSelectedIndex(null);
    setStartedAt(null);
    setElapsedMs(0);
    setSaveError('');
    setCompleted(false);
    completedRef.current = false;
  }, []);

  React.useEffect(() => {
    if (!song) return;
    let cancelled = false;
    reset();
    setRecord(null);
    void getCoverPuzzleIdentity(song).then(async (key) => {
      if (cancelled) return;
      setCoverKey(key);
      try {
        const records = await supabaseApi.fetchCoverPuzzleRecords();
        if (!cancelled) setRecord(records.find((item) => item.cover_key === key) ?? null);
      } catch {}
    });
    return () => { cancelled = true; };
  }, [reset, song?.id, song?.coverPath, song?.coverUrl]);

  React.useEffect(() => {
    if (startedAt === null || completed) return undefined;
    const update = () => setElapsedMs(performance.now() - startedAt);
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [completed, startedAt]);

  const finish = React.useCallback(async (finalElapsed: number) => {
    if (!song || !coverKey || completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    setElapsedMs(finalElapsed);
    try {
      const nextRecord = await supabaseApi.recordCoverPuzzleResult({
        coverKey,
        coverPath: song.coverPath ?? null,
        albumTitle: song.album ?? null,
        elapsedMs: finalElapsed,
      });
      setRecord(nextRecord);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '成绩保存失败');
    } finally {
      setCelebrating(true);
    }
  }, [coverKey, song]);

  const selectTile = (index: number) => {
    if (completed) return;
    if (selectedIndex === null) {
      setSelectedIndex(index);
      return;
    }
    if (selectedIndex === index) {
      setSelectedIndex(null);
      return;
    }
    const beganAt = startedAt ?? performance.now();
    if (startedAt === null) setStartedAt(beganAt);
    const next = [...tiles];
    [next[selectedIndex], next[index]] = [next[index], next[selectedIndex]];
    setTiles(next);
    setSelectedIndex(null);
    if (next.every((value, tileIndex) => value === tileIndex)) {
      void finish(Math.max(100, performance.now() - beganAt));
    }
  };

  if (!song) return null;

  const currentElapsed = completed ? elapsedMs : startedAt === null ? 0 : elapsedMs;
  return createPortal((
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[290] flex flex-col overflow-hidden bg-[#070708] text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.28 }}
            data-testid="cover-puzzle-modal"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <img src={song.coverUrl} alt="" className="h-full w-full scale-125 object-cover opacity-20 blur-[72px] saturate-150" />
              <div className="absolute inset-0 bg-black/52" />
            </div>

            <header className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
              <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white/75 backdrop-blur-xl" aria-label="关闭记忆拼图"><Icons.X size={21} /></button>
              <div className="text-center"><p className="text-[11px] font-black text-white/42">记忆拼图</p><h2 className="mt-0.5 max-w-[220px] truncate text-base font-black">{song.album || song.title}</h2></div>
              <button type="button" onClick={reset} className="grid h-11 w-11 place-items-center rounded-full bg-black/25 text-white/75 backdrop-blur-xl" aria-label="重新打乱拼图"><Icons.RotateCcw size={19} /></button>
            </header>

            <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+22px)]">
              <div className="mb-5 flex items-end justify-between px-1">
                <div><p className="text-[11px] font-bold text-white/38">本次</p><p className="mt-1 text-2xl font-black tabular-nums" data-testid="cover-puzzle-elapsed">{startedAt === null ? '准备好了吗' : formatPuzzleTime(currentElapsed)}</p></div>
                <div className="text-right"><p className="text-[11px] font-bold text-white/38">个人最佳</p><p className="mt-1 text-sm font-black tabular-nums">{record ? formatPuzzleTime(record.best_time_ms) : '尚无记录'}</p></div>
              </div>

              <div className="relative aspect-square w-full overflow-hidden rounded-[8px] bg-black/30 shadow-[0_28px_80px_rgba(0,0,0,.45)]" data-testid="cover-puzzle-grid">
                <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-[2px] bg-black/70 p-[2px]">
                  {tiles.map((piece, index) => {
                    const row = Math.floor(piece / 3);
                    const column = piece % 3;
                    const selected = selectedIndex === index;
                    return (
                      <motion.button
                        layout
                        key={`${piece}-${index}`}
                        type="button"
                        onClick={() => selectTile(index)}
                        className={`relative overflow-hidden bg-black focus-visible:outline-none ${selected ? 'z-10 ring-2 ring-inset ring-white' : ''}`}
                        style={{
                          backgroundImage: `url("${song.coverUrl.replace(/"/g, '%22')}")`,
                          backgroundSize: '300% 300%',
                          backgroundPosition: `${column * 50}% ${row * 50}%`,
                        }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ layout: reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 } }}
                        aria-label={`拼图块 ${index + 1}${selected ? '，已选中' : ''}`}
                        data-testid={`cover-puzzle-tile-${index}`}
                      >
                        {selected ? <span className="absolute inset-0 bg-white/12" /> : null}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 min-h-12 px-1 text-center">
                {completed ? <p className="text-sm font-black text-red-100">已经拼回这一刻</p> : <p className="text-xs font-bold leading-5 text-white/45">点一块，再点它应该去的位置。第一次交换后开始计时。</p>}
                {saveError ? <p className="mt-1 text-xs font-bold text-red-200">{saveError}</p> : null}
                {completed ? <button type="button" onClick={reset} className="mt-3 min-h-11 px-5 text-sm font-black text-white/72">再拼一次</button> : null}
              </div>
            </main>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AchievementCelebration
        open={celebrating}
        title="拼回这一刻"
        description={song.album ? `“${song.album}”的封面重新完整了` : `“${song.title}”的封面重新完整了`}
        detail={`本次 ${formatPuzzleTime(elapsedMs)}${record ? ` · 最佳 ${formatPuzzleTime(record.best_time_ms)}` : ''}`}
        onClose={() => setCelebrating(false)}
      />
    </>
  ), document.body);
};
