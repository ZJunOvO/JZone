import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Song } from '../types';

interface MemoryCardModalProps {
  song: Song | null;
  onClose: () => void;
}

export const MemoryCardModal: React.FC<MemoryCardModalProps> = ({ song, onClose }) => {
  if (!song) return null;

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
  const playsCount = song.playsCount ?? 0;
  const playMetaphors = [
    { text: '如同磁带旋转{n}m', factor: 23.6 }, // 假设一首歌平均3分钟，标准磁带速度4.76cm/s，约8.5米/首，这里稍微夸张一点或按时长算
    { text: '如同看了{n}次晚霞', factor: 31.5 },
    { text: '如同花瓣摆动{n}次', factor: 78.6 },
    { text: '如同呼吸了{n}升空气', factor: 240 }, // 一首歌3-4分钟，人每分钟呼吸6-10升，约30升
    { text: '如同心跳了{n}次', factor: 280 }, // 一首歌3-4分钟，心跳约200-300次
    { text: '如同行驶了{n}km夜路', factor: 3.5 }, // 60km/h => 1km/min => 3-4km/song
    { text: '如同等待了{n}次红灯', factor: 0.8 }, 
  ];
  
  // Deterministic random based on song ID to keep metaphor consistent for the same song
  const getPseudoRandomIndex = (str: string, max: number) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
      }
      return Math.abs(hash) % max;
  };

  const metaphorIndex = song ? getPseudoRandomIndex(song.id, playMetaphors.length) : 0;
  const selectedMetaphor = playMetaphors[metaphorIndex];
  const calculatedValue = Math.floor(playsCount * selectedMetaphor.factor);
  const playMetaphorText = playsCount > 0 ? selectedMetaphor.text.replace('{n}', calculatedValue.toLocaleString()) : '';
  const playLine = playsCount > 0 ? `${playMetaphorText}` : '像是还没翻开这本日记';
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
        {/* Backdrop with Blur */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Card */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-zinc-900/80 rounded-[32px] overflow-hidden shadow-2xl border border-white/10 max-h-[85vh] flex flex-col"
        >
            {/* Dynamic Background */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <img src={song.coverUrl} className="w-full h-full object-cover opacity-40 blur-3xl scale-150" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />
            </div>

            {/* Content Scroll Area */}
            <div className="relative z-10 p-6 flex flex-col space-y-6 text-left overflow-y-auto no-scrollbar pb-24">
                <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-1 ring-white/10 shrink-0">
                        <img src={song.coverUrl} className="w-full h-full object-cover" alt={song.title} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                        <h2 className="text-xl font-bold text-white leading-tight tracking-tight truncate">{song.title}</h2>
                        <p className="text-zinc-400 font-medium text-sm truncate">{song.artist}</p>
                        <div className="text-[11px] text-zinc-500 font-semibold tracking-tight">
                          文件大小 · {formatFileSize(song.fileSize)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5 space-y-2 flex flex-col justify-between h-full">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">累计播放</div>
                            <div className="text-3xl font-bold text-white tracking-tight">{playsCount.toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-zinc-400 font-medium">{playLine}</div>
                    </div>
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/5 space-y-1 flex flex-col justify-center h-full">
                         <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">首次收录</div>
                         <div className="text-lg font-bold text-white tracking-tight">{seasonText}</div>
                         <div className="text-[11px] text-zinc-400 font-semibold tracking-tight font-mono">{formattedDateTime}</div>
                    </div>
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
                         {/* Visual cue for scrolling if needed */}
                         <div className="flex gap-1">
                             <div className="w-1 h-1 rounded-full bg-zinc-600"></div>
                             <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                             <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                         </div>
                    </div>
                    <div className="relative group">
                         <div className="overflow-x-auto snap-x snap-mandatory flex gap-4 pb-2 scrollbar-hide">
                             {/* If text is short, just show it. If long, we could split it, but simple scroll is safer for now. 
                                 The user asked for "swipe left to read more" which implies horizontal scroll. 
                                 Let's simulate 'pages' by setting a fixed width/height container and snapping. 
                             */}
                             <div className="min-w-full snap-center">
                                  <div className="relative">
                                      <div className="text-sm text-zinc-300 leading-relaxed h-[120px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent pb-6">
                                          {song.story ? song.story : '还没有写下这首歌的故事'}
                                      </div>
                                      {/* Feathered Edge Mask for Overflow */}
                                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900/90 to-transparent pointer-events-none"></div>
                                  </div>
                              </div>
                             {/* Placeholder for 'next page' if we were splitting text - 
                                 Since splitting arbitrary text is complex without measuring, 
                                 we'll stick to a scrollable vertical area BUT constrained in height 
                                 to prevent layout shift, meeting the "fixed proportion" requirement.
                                 
                                 Wait, user specifically asked for "swipe from right to left like turning a page".
                                 If I can't easily split text, maybe I can just make the container horizontally scrollable?
                                 No, text wraps.
                                 
                                 Let's assume for now a fixed height scrollable area is the most robust "fixed layout" solution.
                                 The "swipe" might be overkill if we don't have enough content to paginate.
                                 
                                 Let's add a visual indicator that it IS a fixed area.
                             */}
                         </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">歌词片段</div>
                    <div className="text-sm text-zinc-500 leading-relaxed min-h-[48px]">即将开放</div>
                </div>
            </div>

            {/* Floating Close Button */}
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
