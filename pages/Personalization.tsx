import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { AvatarWithFrame } from '../components/AvatarWithFrame';
import { feedback } from '../components/feedback';
import { AVATAR_FRAMES } from '../config/avatarFrames';
import {
  ACHIEVEMENTS,
  PLAYER_SKINS,
  type PersonalizationProgress,
  type PersonalizationSection,
} from '../config/personalization';
import { usePersonalization } from '../hooks/usePersonalization';
import { useCoverAccentColor } from '../hooks/useCoverAccentColor';
import { supabaseApi } from '../supabaseApi';
import type { CoverPuzzleRecordRow } from '../supabaseApi';
import { formatPuzzleTime } from '../utils/coverPuzzle';
import { AchievementCelebration } from '../components/personalization/AchievementCelebration';
import type { PlayerSkin } from '../types';

interface PersonalizationProps {
  initialSection?: PersonalizationSection;
  onBack: () => void;
}

const EMPTY_PROGRESS: PersonalizationProgress = { uploads: 0, lyrics: 0, videos: 0, qualifiedPlays: 0, puzzles: 0 };

const sections: Array<{ id: PersonalizationSection; label: string; Icon: typeof Icons.Disc }> = [
  { id: 'player', label: '播放器', Icon: Icons.Disc },
  { id: 'avatar', label: '头像框', Icon: Icons.Frame },
  { id: 'achievements', label: '成就', Icon: Icons.Trophy },
];

const PreviewArtwork: React.FC<{ coverUrl?: string; className?: string }> = ({ coverUrl, className = '' }) => (
  coverUrl
    ? <img src={coverUrl} alt="" className={`h-full w-full object-cover ${className}`} />
    : <div className={`h-full w-full bg-[linear-gradient(145deg,#3169b8,#df5e79_52%,#e7a55d)] ${className}`} />
);

const PreviewControls = () => (
  <div className="space-y-2 px-3 pb-3" aria-hidden="true">
    <span className="block h-1 w-full rounded-full bg-white/16"><span className="block h-full w-[42%] rounded-full bg-white/64" /></span>
    <div className="flex items-center justify-center gap-3"><span className="h-2 w-5 rounded-full bg-white/18" /><span className="h-6 w-6 rounded-full bg-white/72" /><span className="h-2 w-5 rounded-full bg-white/18" /></div>
  </div>
);

const SkinPreview: React.FC<{ skinId: PlayerSkin; coverUrl?: string; active: boolean; accent: { css: string; darkCss: string; glowCss: string } }> = ({ skinId, coverUrl, active, accent }) => {
  if (skinId === 'vinyl') {
    return (
      <div className="flex h-full flex-col justify-between overflow-hidden bg-[#0d0d0f] pt-4">
        <div className={`relative mx-auto aspect-square w-[78%] rounded-full bg-[#09090a] shadow-[0_18px_40px_rgba(0,0,0,.55)] ${active ? 'animate-[spin_18s_linear_infinite]' : ''}`}>
          <span className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,rgba(255,255,255,.055)_0_1px,transparent_2px_5px)]" />
          <span className="absolute inset-[3%] rounded-full bg-[conic-gradient(from_210deg,transparent_0_18%,rgba(255,255,255,.16)_24%,transparent_31%_72%,rgba(255,255,255,.08)_78%,transparent_86%)] opacity-75" />
          <span className="absolute inset-[13%] overflow-hidden rounded-full border border-white/12"><PreviewArtwork coverUrl={coverUrl} /></span>
          <span className="absolute left-1/2 top-1/2 h-[8%] w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b0b0c] ring-2 ring-white/55" />
        </div>
        <PreviewControls />
      </div>
    );
  }
  if (skinId === 'immersive') {
    return (
      <div className="relative flex h-full flex-col justify-end overflow-hidden" style={{ background: accent.darkCss }}>
        <div className="absolute inset-x-0 top-0 h-[72%]" style={{ maskImage: 'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)' }}><PreviewArtwork coverUrl={coverUrl} /></div>
        <div className="relative mb-2 px-3"><span className="block h-2 w-[58%] rounded-full bg-white/70" /><span className="mt-2 block h-1.5 w-[36%] rounded-full bg-white/28" /></div>
        <PreviewControls />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-[#111113] pt-4">
      <div className="mx-auto aspect-square w-[76%] overflow-hidden rounded-[12px] border border-white/10 shadow-xl"><PreviewArtwork coverUrl={coverUrl} /></div>
      <PreviewControls />
    </div>
  );
};

export const Personalization: React.FC<PersonalizationProps> = ({ initialSection = 'player', onBack }) => {
  const { songs, getCurrentSong } = useStore();
  const {
    userId,
    profile,
    displayName,
    resolvedAvatarUrl,
    playerSkinId,
    avatarFrameId,
    savingKey,
    savePlayerSkin,
    saveAvatarFrame,
  } = usePersonalization();
  const [section, setSection] = React.useState<PersonalizationSection>(initialSection);
  const [selectedFrameId, setSelectedFrameId] = React.useState<string | null>(avatarFrameId);
  const [progress, setProgress] = React.useState<PersonalizationProgress>(EMPTY_PROGRESS);
  const [puzzleRecords, setPuzzleRecords] = React.useState<CoverPuzzleRecordRow[]>([]);
  const [progressLoading, setProgressLoading] = React.useState(true);
  const [testAchievementOpen, setTestAchievementOpen] = React.useState(false);
  const currentSong = getCurrentSong() ?? songs.find((song) => song.ownerId === userId) ?? songs[0];
  const coverAccent = useCoverAccentColor(currentSong?.coverUrl);

  React.useEffect(() => setSection(initialSection), [initialSection]);
  React.useEffect(() => setSelectedFrameId(avatarFrameId), [avatarFrameId]);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const ownedSongIds = songs.filter((song) => song.ownerId === userId || (!song.ownerId && song.uploadedBy === 'Me')).map((song) => song.id);
    setProgressLoading(true);
    void Promise.all([
      supabaseApi.fetchPersonalizationProgress(userId, ownedSongIds),
      supabaseApi.fetchCoverPuzzleRecords(userId),
    ])
      .then(([next, records]) => { if (!cancelled) { setProgress(next); setPuzzleRecords(records); } })
      .catch(() => { if (!cancelled) setProgress({ ...EMPTY_PROGRESS, uploads: ownedSongIds.length }); })
      .finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [songs, userId]);

  const selectSkin = async (skinId: PlayerSkin) => {
    if (skinId === playerSkinId || savingKey) return;
    try {
      await savePlayerSkin(skinId);
      feedback.success('播放器样式已更新');
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const selectFrame = async (frameId: string | null) => {
    if (frameId === selectedFrameId || savingKey) return;
    const previous = selectedFrameId;
    setSelectedFrameId(frameId);
    try {
      await saveAvatarFrame(frameId);
      feedback.success(frameId ? '头像框已佩戴' : '已恢复默认头像');
    } catch (error) {
      setSelectedFrameId(previous);
      feedback.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  return (
    <div className="min-h-screen bg-[#050506] pb-36 text-white" data-testid="personalization-page">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-black/72 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-2xl">
        <div className="relative mx-auto flex h-11 max-w-3xl items-center justify-center">
          <button type="button" onClick={onBack} className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-white/72 hover:bg-white/[0.07] hover:text-white" aria-label="返回个人页">
            <Icons.ChevronLeft size={21} />
          </button>
          <h1 className="text-[17px] font-black">个性空间</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <section className="relative overflow-hidden px-6 pb-8 pt-10">
          {currentSong?.coverUrl ? <img src={currentSong.coverUrl} alt="" className="pointer-events-none absolute -right-14 -top-20 h-72 w-72 rounded-full object-cover opacity-20 blur-[64px]" /> : null}
          <div className="relative flex items-center gap-5">
            <div className="h-24 w-24 shrink-0"><AvatarWithFrame src={resolvedAvatarUrl} frameId={selectedFrameId} alt={displayName || '我的头像'} /></div>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-white/38">我的表达</p>
              <h2 className="mt-1 truncate text-3xl font-black">{displayName || profile?.nickname || 'JZone 用户'}</h2>
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-white/48"><span>{PLAYER_SKINS.find((skin) => skin.id === playerSkinId)?.name}</span><span className="h-0.5 w-0.5 rounded-full bg-white/35" /><span>{selectedFrameId ? '已佩戴头像框' : '默认头像'}</span></div>
            </div>
          </div>
        </section>

        <nav className="sticky top-[calc(env(safe-area-inset-top)+64px)] z-30 border-y border-white/[0.06] bg-[#080809]/86 px-5 backdrop-blur-2xl" aria-label="个性空间分类">
          <div className="mx-auto flex max-w-md items-center justify-center gap-8">
            {sections.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setSection(id)} className={`relative flex min-h-14 items-center gap-1.5 text-sm font-bold transition-colors ${section === id ? 'text-white' : 'text-white/38 hover:text-white/68'}`} aria-current={section === id ? 'page' : undefined}>
                <Icon size={15} strokeWidth={1.8} /><span>{label}</span>
                {section === id ? <motion.span layoutId="personalization-section" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" /> : null}
              </button>
            ))}
          </div>
        </nav>

        <div className="px-5 pt-7">
          {section === 'player' ? (
            <section aria-labelledby="player-skins-title">
              <div className="mb-5 flex items-end justify-between"><div><p className="text-[11px] font-black text-red-300/75">播放器</p><h2 id="player-skins-title" className="mt-1 text-2xl font-black">选择声音的样子</h2></div><span className="text-xs font-bold text-white/32">{PLAYER_SKINS.length} 款</span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PLAYER_SKINS.map((skin) => {
                  const active = playerSkinId === skin.id;
                  return (
                    <button key={skin.id} type="button" onClick={() => void selectSkin(skin.id)} className={`overflow-hidden rounded-lg border text-left transition-[border-color,transform,background-color] active:scale-[0.985] ${active ? 'border-white/55 bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20'}`} aria-pressed={active} data-testid={`player-skin-${skin.id}`}>
                      <div className="aspect-[3/4] overflow-hidden"><SkinPreview skinId={skin.id} coverUrl={currentSong?.coverUrl} active={active} accent={coverAccent} /></div>
                      <div className="flex min-h-[66px] items-center gap-2 px-3 py-3"><span className="min-w-0 flex-1"><span className="block text-sm font-black">{skin.name}</span><span className="mt-0.5 block line-clamp-2 text-[10px] leading-relaxed font-medium text-white/38">{skin.description}</span></span>{active ? <Icons.Check size={17} className="shrink-0 text-red-300" /> : null}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex min-h-14 items-center gap-4 border-y border-white/[0.06] py-3 text-white/42"><Icons.Layers3 size={18} /><span className="flex-1 text-sm font-bold">记忆拼图</span><span className="text-xs font-bold">下一阶段</span></div>
            </section>
          ) : null}

          {section === 'avatar' ? (
            <section aria-labelledby="avatar-frames-title">
              <div className="mb-5"><p className="text-[11px] font-black text-red-300/75">头像框</p><h2 id="avatar-frames-title" className="mt-1 text-2xl font-black">留下一点辨识度</h2></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => void selectFrame(null)} className={`relative flex aspect-[4/3] items-center justify-center rounded-lg border ${selectedFrameId === null ? 'border-white/55 bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.025]'}`} aria-pressed={selectedFrameId === null} data-testid="avatar-frame-default">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06] text-white/35"><Icons.User size={28} /></span><span className="absolute bottom-3 left-3 text-xs font-black">默认</span>{selectedFrameId === null ? <Icons.Check size={17} className="absolute right-3 top-3 text-red-300" /> : null}
                </button>
                {Object.values(AVATAR_FRAMES).map((frame) => {
                  const active = selectedFrameId === frame.id;
                  return (
                    <button key={frame.id} type="button" onClick={() => void selectFrame(frame.id)} className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border ${active ? 'border-white/55 bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.025]'}`} aria-pressed={active} data-testid={`avatar-frame-${frame.id}`}>
                      <img src={frame.imageUrl} loading="lazy" decoding="async" className="h-20 w-20 object-contain" alt="" /><span className="absolute bottom-3 left-3 text-xs font-black">{frame.name}</span>{active ? <Icons.Check size={17} className="absolute right-3 top-3 text-red-300" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {section === 'achievements' ? (
            <section aria-labelledby="achievements-title">
              <div className="mb-5 flex items-end justify-between"><div><p className="text-[11px] font-black text-red-300/75">成就</p><h2 id="achievements-title" className="mt-1 text-2xl font-black">声音留下的痕迹</h2></div><span className="text-xs font-bold text-white/32">{ACHIEVEMENTS.filter((item) => progress[item.metric] >= item.target).length}/{ACHIEVEMENTS.length}</span></div>
              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {ACHIEVEMENTS.map((achievement) => {
                  const value = progress[achievement.metric];
                  const unlocked = value >= achievement.target;
                  const ratio = Math.min(1, value / achievement.target);
                  return (
                    <div key={achievement.id} className="flex min-h-[92px] items-center gap-4 py-4">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${unlocked ? 'bg-red-300/16 text-red-200' : 'bg-white/[0.045] text-white/22'}`}><Icons.Trophy size={21} strokeWidth={1.7} /></span>
                      <span className="min-w-0 flex-1"><span className={`block text-sm font-black ${unlocked ? 'text-white' : 'text-white/48'}`}>{achievement.name}</span><span className="mt-1 block text-xs font-medium text-white/32">{achievement.description}</span><span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.span className={`block h-full rounded-full ${unlocked ? 'bg-red-300/80' : 'bg-white/25'}`} initial={false} animate={{ width: `${ratio * 100}%` }} /></span></span>
                      <span className={`text-right text-xs font-black tabular-nums ${unlocked ? 'text-red-200' : 'text-white/28'}`}>{progressLoading ? '…' : achievement.metric === 'puzzles' && puzzleRecords[0] ? <><span className="block">已达成</span><span className="mt-1 block text-[10px] text-white/35">最佳 {formatPuzzleTime(puzzleRecords[0].best_time_ms)}</span></> : unlocked ? '已达成' : `${value}/${achievement.target}`}</span>
                    </div>
                  );
                })}
                <div className="flex min-h-[92px] items-center gap-4 py-4" data-testid="achievement-test-row">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.045] text-white/24"><Icons.Trophy size={21} strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-black text-white/48">未完成的成就</span><span className="mt-1 block text-xs font-medium text-white/32">仅测试完成弹窗，不保存记录</span><span className="mt-2 block h-1 rounded-full bg-white/[0.06]" /></span>
                  <button type="button" onClick={() => setTestAchievementOpen(true)} className="min-h-11 px-2 text-xs font-black text-red-200" data-testid="achievement-test-trigger">测试演出</button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <AchievementCelebration open={testAchievementOpen} title="未完成的成就" description="这是一次演出测试，不会写入你的真实记录" detail="完成效果预览" onClose={() => setTestAchievementOpen(false)} />
    </div>
  );
};
