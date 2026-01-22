import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Song } from '../types';
import { useAuth } from '../auth';
import { supabaseApi, ProfileRow } from '../supabaseApi';
import { hasSupabaseConfig } from '../supabaseClient';

interface MemoryCardModalProps {
  song: Song | null;
  onClose: () => void;
  openNonce?: number;
}

const lastMetaphorIndexBySongId = new Map<string, number>();

export const MemoryCardModal: React.FC<MemoryCardModalProps> = ({ song, onClose, openNonce }) => {
  if (!song) return null;

  const { user } = useAuth();
  const pad = (value: number) => value.toString().padStart(2, '0');
  const addedDate = new Date(song.addedAt);
  const formattedDateTime = `${addedDate.getFullYear()}.${pad(addedDate.getMonth() + 1)}.${pad(addedDate.getDate())} ${pad(addedDate.getHours())}:${pad(addedDate.getMinutes())}`;
  const month = addedDate.getMonth() + 1;
  const seasonIndex =
    month <= 2 ? 3 :
    month <= 5 ? 0 :
    month <= 8 ? 1 : 2;
  const seasonLabel = ['春', '夏', '秋', '冬'][seasonIndex];
  const seasonPart =
    month === 3 || month === 6 || month === 9 || month === 12 ? '初' :
    month === 4 || month === 7 || month === 10 || month === 1 ? '仲' : '末';
  const hour = addedDate.getHours();
  const dayPeriod =
    hour <= 4 ? '深夜' :
    hour <= 7 ? '清晨' :
    hour <= 10 ? '上午' :
    hour <= 13 ? '正午' :
    hour <= 17 ? '下午' :
    hour <= 19 ? '傍晚' : '夜晚';
  const seasonText = `${seasonPart}${seasonLabel}的${dayPeriod}`;
  const globalPlaysCount = song.playsCount ?? 0;
  const [myPlaysCount, setMyPlaysCount] = useState<number | null>(null);
  const [collectorProfile, setCollectorProfile] = useState<ProfileRow | null>(null);
  const playsCount = myPlaysCount ?? globalPlaysCount;

  const formatInt = (value: number) => Math.max(0, Math.floor(value)).toLocaleString();
  const formatDistanceMeters = (meters: number) => {
    const m = Math.max(0, Math.floor(meters));
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${m} m`;
  };

  const playLine = useMemo(() => {
    if (!playsCount) return '像是还没翻开这本日记';
    const duration = Number.isFinite(song.duration) ? song.duration : 180;
    const totalSeconds = Math.max(0, Math.floor(playsCount * duration));
    const totalMinutes = Math.max(1, Math.floor(totalSeconds / 60));

    const metaphors: Array<() => string> = [
      () => `如同磁带旋转了${formatDistanceMeters(totalSeconds * 0.0476 * 8)}`,
      () => `如同看过${formatInt(totalMinutes * 9)}次晚霞`,
      () => `如同花瓣摆动${formatInt(totalSeconds * 2.4)}次`,
      () => `如同雨滴敲窗${formatInt(totalSeconds * 1.6)}下`,
      () => `如同心跳回响${formatInt(totalMinutes * 78)}次`,
      () => `如同呼吸过${formatInt(totalMinutes * 14)}次安静`,
      () => `如同翻过${formatInt(totalSeconds / 3)}页书`,
      () => `如同在夜色里走了${formatDistanceMeters(totalSeconds * 1.3)}`,
      () => `如同路灯亮起${formatInt(playsCount * 7)}次`,
      () => `如同咖啡降温${formatInt(playsCount * 2)}次`,
      () => `如同风穿过树叶${formatInt(totalSeconds * 1.2)}次`,
      () => `如同海浪拍岸${formatInt(totalSeconds * 0.9)}次`,
      () => `如同把一段记忆温热了${formatInt(playsCount)}次`,
      () => `如同在耳边点亮${formatInt(totalSeconds * 3.5)}颗微光`,
      () => `如同把城市的噪声折叠${formatInt(totalMinutes)}次`,
      () => `如同把一封旧信又读了${formatInt(playsCount)}遍`,
      () => `如同让霓虹闪烁${formatInt(totalSeconds * 2.1)}次`,
      () => `如同把影子拉长${formatInt(totalMinutes * 4)}次`,
      () => `如同把碎片拼回完整${formatInt(playsCount)}次`,
      () => `如同把一场梦续写${formatInt(playsCount)}次`,
      () => `如同让雪落下${formatInt(totalSeconds * 4.2)}片`,
      () => `如同把指尖的温度留在玻璃上${formatInt(totalMinutes * 3)}次`,
      () => `如同把沉默按下播放${formatInt(playsCount)}次`,
      () => `如同把黄昏收藏进抽屉${formatInt(totalMinutes * 2)}次`,
    ];

    const prev = lastMetaphorIndexBySongId.get(song.id);
    let idx = Math.floor(Math.random() * metaphors.length);
    if (typeof prev === 'number' && metaphors.length > 1) {
      let guard = 0;
      while (idx === prev && guard < 5) {
        idx = Math.floor(Math.random() * metaphors.length);
        guard += 1;
      }
    }
    lastMetaphorIndexBySongId.set(song.id, idx);
    return metaphors[idx]();
  }, [openNonce, playsCount, song.duration, song.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!hasSupabaseConfig) {
        setMyPlaysCount(null);
        return;
      }
      if (!user) return;
      try {
        const count = await supabaseApi.fetchMySongPlayCount(song.id, user.id);
        if (cancelled) return;
        setMyPlaysCount(count);
      } catch {
        if (cancelled) return;
        setMyPlaysCount(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [song.id, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!hasSupabaseConfig) return;
      const ownerId = song.ownerId;
      if (!ownerId) return;
      try {
        const profile = await supabaseApi.fetchProfile(ownerId);
        if (cancelled) return;
        setCollectorProfile(profile);
      } catch {
        if (cancelled) return;
        setCollectorProfile(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [song.ownerId]);

  const collectorId = song.ownerId;
  const collectorName =
    (collectorProfile?.nickname && collectorProfile.nickname.trim()) ||
    (song.uploadedBy && song.uploadedBy.trim()) ||
    (collectorId ? `${collectorId.slice(0, 6)}…${collectorId.slice(-4)}` : '未知');

  const handleOpenCollector = () => {
    if (!collectorId) return;
    window.dispatchEvent(new CustomEvent('jzone:navigate-profile', { detail: { userId: collectorId } }));
    onClose();
  };

  const formatFileSize = (value?: number) => {
    if (!value || value <= 0) return '未知大小';
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-zinc-900/80 rounded-[32px] overflow-hidden shadow-2xl border border-white/10 max-h-[85vh] flex flex-col"
        >
            <div className="absolute inset-0 z-0 pointer-events-none">
                <img src={song.coverUrl} decoding="async" className="w-full h-full object-cover opacity-40 blur-3xl scale-150" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />
            </div>

            <div className="relative z-10 p-6 flex flex-col space-y-6 text-left overflow-y-auto no-scrollbar pb-24">
                <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-1 ring-white/10 shrink-0">
                        <img src={song.coverUrl} decoding="async" className="w-full h-full object-cover" alt={song.title} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                        <h2 className="text-xl font-bold text-white leading-tight tracking-tight truncate">{song.title}</h2>
                        <p className="text-zinc-400 font-medium text-sm truncate">{song.artist}</p>
                        {song.album ? (
                          <div className="text-[11px] text-zinc-500 font-semibold tracking-tight truncate">
                            专辑 · {song.album}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-zinc-500 font-semibold tracking-tight">
                          文件大小 · {formatFileSize(song.fileSize)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5 space-y-2 flex flex-col justify-between h-full">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">你的累计播放</div>
                            <div className="text-3xl font-bold text-white tracking-tight">{playsCount.toLocaleString()}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-zinc-400 font-medium">{playLine}</div>
                          <div className="text-[11px] text-zinc-500 font-semibold tracking-tight">全站 · {globalPlaysCount.toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5 space-y-1 flex flex-col justify-center h-full">
                         <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">首次收录</div>
                         <div className="text-lg font-bold text-white tracking-tight">{seasonText}</div>
                         <div className="text-[11px] text-zinc-400 font-semibold tracking-tight font-mono">{formattedDateTime}</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">收录</div>
                    <button
                      type="button"
                      onClick={handleOpenCollector}
                      disabled={!collectorId}
                      className="w-full text-left bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5 active:scale-[0.99] transition disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold text-white truncate">@{collectorName}</div>
                        <div className="text-[11px] font-semibold text-zinc-500">查看主页</div>
                      </div>
                    </button>
                </div>

                <div className="w-full space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">标签</div>
                    <div className="flex flex-wrap gap-2">
                        {song.genre ? (
                            song.genre.split(',').map((tag, i) => (
                                <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium text-zinc-300 border border-white/5">
                                    {tag.trim()}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-zinc-600 italic">暂无标签</span>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                         <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">灵感札记</div>
                         <div className="text-[10px] text-zinc-500 font-semibold tracking-tight">滑动阅读</div>
                    </div>
                    <div className="relative rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm overflow-hidden">
                         <div 
                            className="text-sm text-zinc-300 leading-relaxed min-h-[80px] max-h-[240px] overflow-y-auto px-4 py-4 scrollbar-none"
                            style={{
                                maskImage: 'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)',
                                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)'
                            }}
                         >
                              {song.story ? song.story : '还没有写下这首歌的故事'}
                         </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">歌词片段</div>
                    <div className="text-sm text-zinc-500 leading-relaxed min-h-[48px]">即将开放</div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
                <button 
                    onClick={onClose}
                    className="w-full py-3.5 bg-white text-black font-bold rounded-xl active:scale-95 transition-transform shadow-lg"
                >
                    关闭
                </button>
            </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
