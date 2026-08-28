import React, { Suspense, lazy, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { PlayerBar } from '../PlayerBar';
import { PwaInstallPrompt } from '../PwaInstallPrompt';
import { listenModalPresence } from '../../modalPresence';
import {
  BOTTOM_DOCK_GEOMETRY,
  getBottomDockMiniBottom,
  getLiquidGlassCssVars,
  useLiquidGlassSettings,
} from '../../utils/liquidGlassSettings';
import { useAutoFullscreen } from '../../hooks/useAutoFullscreen';
import { useAppRoute } from '../../hooks/useAppRoute';
import { BottomNavigation } from '../navigation/BottomNavigation';
import { useStore } from '../../store';
import { feedback } from '../feedback';
import {
  PLAYER_LYRICS_REQUEST_EVENT,
  type PlayerLyricsRequestEvent,
} from '../../utils/lyrics/events';
import { useLiquidGlassAdaptiveForeground } from '../../hooks/useLiquidGlassAdaptiveForeground';
import { SharedElementLayer } from '../motion/SharedElementLayer';
import { ProfileAvatarRouteTransition } from '../motion/ProfileAvatarRouteTransition';
import { useCurrentArtistProfile } from '../../hooks/useCurrentArtistProfile';
import { Icons } from '../Icons';
import {
  getDefaultPlayerOrigin,
  getDefaultPlayerSharedOrigin,
  PLAYER_MINI_SETTLE_LEAD,
  PLAYER_SHELL_DURATION,
  PLAYER_SHELL_EXIT_DURATION,
  type PlayerTransitionOrigin,
  type PlayerTransitionPhase,
  type PlayerSharedOrigin,
} from '../motion/playerTransition';

const Home = lazy(() => import('../../pages/Home').then((module) => ({ default: module.Home })));
const Library = lazy(() => import('../../pages/Library').then((module) => ({ default: module.Library })));
const Upload = lazy(() => import('../../pages/Upload').then((module) => ({ default: module.Upload })));
const loadProfile = () => import('../../pages/Profile').then((module) => ({ default: module.Profile }));
const Profile = React.memo(lazy(loadProfile));
const loadCollectionDetail = () => import('../../pages/CollectionDetailPage').then((module) => ({ default: module.CollectionDetailPage }));
const CollectionDetailPage = lazy(loadCollectionDetail);
const loadListeningRecap = () => import('../../pages/ListeningRecap').then((module) => ({ default: module.ListeningRecap }));
const ListeningRecapPage = lazy(loadListeningRecap);
const loadPlayerView = () => import('../../pages/PlayerView').then((module) => ({ default: module.PlayerView }));
const PlayerView = lazy(loadPlayerView);

const PageFallback = () => (
  <div className="min-h-screen bg-black px-6 pt-16" aria-label="页面加载中">
    <div className="h-8 w-28 animate-pulse rounded-lg bg-white/8" />
    <div className="mt-8 h-40 animate-pulse rounded-3xl bg-white/[0.045]" />
  </div>
);

const ListeningRecapFallback: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div
    className="min-h-full bg-[#070709] text-white"
    role="status"
    aria-live="polite"
    aria-label="正在加载聆听回顾"
    data-testid="listening-recap-route-loading"
  >
    <header className="sticky top-0 z-30 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 -top-2 bottom-[-2.5rem] bg-[#070709]/78 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0%,black_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_54%,transparent_100%)]" />
      <div className="relative z-10 mx-auto flex min-h-11 max-w-4xl items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80"
          aria-label="返回"
        >
          <Icons.ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex h-11 items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] px-1.5 backdrop-blur-xl">
          <span className="h-8 w-12 rounded-full bg-white/[0.07]" aria-hidden="true" />
          <span className="h-8 w-12 rounded-full bg-red-300/15" aria-hidden="true" />
          <span className="h-8 w-12 rounded-full bg-white/[0.07]" aria-hidden="true" />
        </div>
      </div>
    </header>

    <main className="px-5 pb-28 pt-10 sm:px-8 sm:pt-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center gap-3 text-[10px] font-bold text-white/42">
          <span className="h-px w-9 bg-red-400/65" aria-hidden="true" />
          <span>聆听回顾</span>
        </div>
        <div className="relative mx-auto aspect-square w-[min(86vw,420px)] overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#211d27,#0b0b0d_68%)]">
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_28%_24%,rgba(251,113,133,0.16),transparent_38%),radial-gradient(circle_at_72%_76%,rgba(129,140,248,0.13),transparent_42%)] motion-reduce:animate-none" />
        </div>
        <div className="mt-14 max-w-2xl" aria-hidden="true">
          <div className="h-4 w-32 animate-pulse rounded-full bg-red-300/20 motion-reduce:animate-none" />
          <div className="mt-6 h-11 w-[82%] animate-pulse rounded-xl bg-white/[0.09] motion-reduce:animate-none" />
          <div className="mt-3 h-11 w-[56%] animate-pulse rounded-xl bg-white/[0.07] motion-reduce:animate-none" />
        </div>
        <div className="mt-8 flex items-center gap-3 text-sm font-semibold text-white/55">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300/50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-300/80" />
          </span>
          正在整理这段时间的声音…
        </div>
      </div>
    </main>
  </div>
);

export const AppShell: React.FC = () => {
  const { songs, playerState, playContext, togglePlay } = useStore();
  const { resolvedAvatarUrl: profileAvatarUrl } = useCurrentArtistProfile();
  const liquidGlassSettings = useLiquidGlassSettings();
  const isCompactBottomTabLayout = liquidGlassSettings.bottomTabLayout === 'compact';
  const liquidGlassCssVars = getLiquidGlassCssVars(liquidGlassSettings);
  const {
    activeTab,
    setActiveTab,
    profileUserId,
    setProfileUserId,
    collectionId,
    closeCollection,
    isListeningRecap,
    listeningRecapPeriod,
    closeListeningRecap,
    replaceListeningRecapPeriod,
  } = useAppRoute();
  const currentRoute = isListeningRecap ? 'listening-recap' : activeTab;
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerLyricsRequest, setPlayerLyricsRequest] = useState<{ songId: string; nonce: number } | null>(null);
  const [playerTransitionPhase, setPlayerTransitionPhase] = useState<PlayerTransitionPhase>('open');
  const [playerTransitionOrigin, setPlayerTransitionOrigin] = useState<PlayerTransitionOrigin | null>(null);
  const [playerSharedOrigin, setPlayerSharedOrigin] = useState<PlayerSharedOrigin | null>(null);
  const playerTransitionTimerRef = React.useRef<number | null>(null);
  const [modalCount, setModalCount] = useState(0);
  const [isCompactPlayerExpanded, setIsCompactPlayerExpanded] = useState(false);
  const [uploadMounted, setUploadMounted] = useState(activeTab === 'upload');
  const [profileMounted, setProfileMounted] = useState(activeTab === 'profile');
  const sharedSongHandledRef = React.useRef<string | null>(null);
  const playerLyricsRequestNonceRef = React.useRef(0);
  const miniPlayerLayerRef = React.useRef<HTMLDivElement>(null);
  const profileRouteRef = React.useRef<HTMLDivElement>(null);
  const [miniSettlePulse, setMiniSettlePulse] = useState(0);
  const miniSettleTimerRef = React.useRef<number | null>(null);
  const miniSettleResetTimerRef = React.useRef<number | null>(null);
  const routeFallbackControls = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const previousRouteRef = React.useRef(currentRoute);

  useAutoFullscreen();
  useLiquidGlassAdaptiveForeground();

  React.useEffect(() => {
    return listenModalPresence((delta) => {
      setModalCount((count) => Math.max(0, count + delta));
    });
  }, []);

  React.useEffect(() => {
    if (activeTab === 'upload') setUploadMounted(true);
    if (activeTab === 'profile') setProfileMounted(true);
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'home' || isListeningRecap) return;
    const timer = window.setTimeout(() => {
      void loadListeningRecap();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [activeTab, isListeningRecap]);

  React.useLayoutEffect(() => {
    if (previousRouteRef.current === currentRoute) return;
    previousRouteRef.current = currentRoute;
    routeFallbackControls.stop();
    if (activeTab === 'profile') {
      routeFallbackControls.set({ opacity: 1, x: 0, scale: 1 });
      return;
    }
    routeFallbackControls.set({ opacity: 0.82, x: 8, scale: 0.998 });
    const frame = window.requestAnimationFrame(() => {
      void routeFallbackControls.start({
        opacity: 1,
        x: 0,
        scale: 1,
        transition: { duration: 0.26, ease: [0.22, 0.74, 0.22, 1] },
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, currentRoute, routeFallbackControls]);

  React.useEffect(() => {
    if (songs.length > 0) void loadPlayerView();
  }, [songs.length]);

  React.useEffect(() => {
    if (activeTab === 'profile') void loadCollectionDetail();
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'home') return;
    let cancelled = false;
    // 后台完成组件挂载和缓存读取；display:none 会阻止高成本滤镜提前栅格化。
    void loadProfile().then(() => {
      if (cancelled) return;
      React.startTransition(() => setProfileMounted(true));
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  React.useEffect(() => () => {
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
    if (miniSettleTimerRef.current) window.clearTimeout(miniSettleTimerRef.current);
    if (miniSettleResetTimerRef.current) window.clearTimeout(miniSettleResetTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (!miniPlayerLayerRef.current) return;
    miniPlayerLayerRef.current.inert = isPlayerOpen && playerTransitionPhase !== 'closing';
  }, [isPlayerOpen, playerTransitionPhase]);

  React.useEffect(() => {
    if (!profileRouteRef.current) return;
    profileRouteRef.current.inert = activeTab !== 'profile';
  }, [activeTab, profileMounted]);

  const capturePlayerOrigin = React.useCallback((): PlayerTransitionOrigin => {
    const player = miniPlayerLayerRef.current?.querySelector<HTMLElement>('[data-testid="mini-player"]');
    if (!player) {
      const layerRect = miniPlayerLayerRef.current?.getBoundingClientRect();
      if (layerRect && layerRect.width > 0) {
        return {
          left: layerRect.left,
          top: Math.max(0, layerRect.bottom - BOTTOM_DOCK_GEOMETRY.miniHeight),
          width: layerRect.width,
          height: BOTTOM_DOCK_GEOMETRY.miniHeight,
          borderRadius: isCompactBottomTabLayout ? BOTTOM_DOCK_GEOMETRY.compactMiniRadius : 18,
        };
      }
      return getDefaultPlayerOrigin();
    }
    const rect = player.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      borderRadius: Number.parseFloat(getComputedStyle(player).borderRadius) || 18,
    };
  }, [isCompactBottomTabLayout]);

  const capturePlayerSharedOrigin = React.useCallback((fallbackOrigin: PlayerTransitionOrigin): PlayerSharedOrigin => {
    const fallback = getDefaultPlayerSharedOrigin(fallbackOrigin);
    const readRect = (name: keyof PlayerSharedOrigin) => {
      const element = miniPlayerLayerRef.current?.querySelector<HTMLElement>(`[data-player-shared-source="${name}"]`);
      if (!element) return fallback[name];
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    return { cover: readRect('cover'), title: readRect('title'), artist: readRect('artist') };
  }, []);

  const openPlayer = React.useCallback(() => {
    if (miniSettleTimerRef.current) window.clearTimeout(miniSettleTimerRef.current);
    if (miniSettleResetTimerRef.current) window.clearTimeout(miniSettleResetTimerRef.current);
    setMiniSettlePulse(0);
    if (isPlayerOpen) {
      if (playerTransitionPhase !== 'closing') return;
      if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
      setPlayerTransitionPhase('opening');
      playerTransitionTimerRef.current = window.setTimeout(
        () => setPlayerTransitionPhase('open'),
        PLAYER_SHELL_DURATION * 1000 + 80,
      );
      return;
    }
    const origin = capturePlayerOrigin();
    setPlayerTransitionOrigin(origin);
    setPlayerSharedOrigin(capturePlayerSharedOrigin(origin));
    setPlayerTransitionPhase('opening');
    setIsPlayerOpen(true);
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
    playerTransitionTimerRef.current = window.setTimeout(
      () => setPlayerTransitionPhase('open'),
      PLAYER_SHELL_DURATION * 1000 + 80,
    );
  }, [capturePlayerOrigin, capturePlayerSharedOrigin, isPlayerOpen, playerTransitionPhase]);

  const closePlayer = React.useCallback(() => {
    if (!isPlayerOpen || playerTransitionPhase === 'closing') return;
    setPlayerLyricsRequest(null);
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
    const origin = capturePlayerOrigin();
    setPlayerTransitionOrigin(origin);
    setPlayerSharedOrigin(capturePlayerSharedOrigin(origin));
    setPlayerTransitionPhase('closing');
    if (miniSettleTimerRef.current) window.clearTimeout(miniSettleTimerRef.current);
    if (miniSettleResetTimerRef.current) window.clearTimeout(miniSettleResetTimerRef.current);
    miniSettleTimerRef.current = window.setTimeout(() => {
      setMiniSettlePulse((pulse) => pulse + 1);
      miniSettleResetTimerRef.current = window.setTimeout(() => setMiniSettlePulse(0), 650);
    }, Math.max(0, (PLAYER_SHELL_EXIT_DURATION - PLAYER_MINI_SETTLE_LEAD) * 1000));
    playerTransitionTimerRef.current = window.setTimeout(() => {
      setIsPlayerOpen(false);
      setPlayerTransitionPhase('open');
      setPlayerTransitionOrigin(null);
      setPlayerSharedOrigin(null);
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="mini-player"]')?.focus());
    }, PLAYER_SHELL_EXIT_DURATION * 1000 + 20);
  }, [capturePlayerOrigin, capturePlayerSharedOrigin, isPlayerOpen, playerTransitionPhase]);

  const handlePlayerLyricsRequest = React.useCallback((event: Event) => {
    const detail = (event as PlayerLyricsRequestEvent).detail;
    if (!detail?.songId || detail.source !== 'song-menu') return;
    const targetSong = songs.find((item) => item.id === detail.songId);
    if (!targetSong) {
      feedback.error('这首歌曲不存在，或当前账号没有访问权限');
      return;
    }

    playerLyricsRequestNonceRef.current += 1;
    setPlayerLyricsRequest({ songId: targetSong.id, nonce: playerLyricsRequestNonceRef.current });
    if (playerState.currentSongId !== targetSong.id) {
      playContext([targetSong.id], targetSong.id);
    }
    openPlayer();
  }, [openPlayer, playerState.currentSongId, playContext, songs]);

  React.useEffect(() => {
    window.addEventListener(PLAYER_LYRICS_REQUEST_EVENT, handlePlayerLyricsRequest);
    return () => window.removeEventListener(PLAYER_LYRICS_REQUEST_EVENT, handlePlayerLyricsRequest);
  }, [handlePlayerLyricsRequest]);

  const handlePlayerLyricsRequestHandled = React.useCallback((nonce: number) => {
    setPlayerLyricsRequest((current) => current?.nonce === nonce ? null : current);
  }, []);

  React.useEffect(() => {
    if (collectionId) {
      setPlayerLyricsRequest(null);
      setIsPlayerOpen(false);
      setPlayerTransitionPhase('open');
    }
  }, [collectionId]);

  React.useEffect(() => {
    if (profileUserId) {
      setPlayerLyricsRequest(null);
      setIsPlayerOpen(false);
      setPlayerTransitionPhase('open');
    }
  }, [profileUserId]);

  React.useEffect(() => {
    if (!songs.length) return;
    const songId = new URL(window.location.href).searchParams.get('song');
    if (!songId || sharedSongHandledRef.current === songId) return;
    sharedSongHandledRef.current = songId;
    const song = songs.find((item) => item.id === songId);
    if (!song) {
      feedback.error('这首歌曲不存在，或当前账号没有访问权限');
      return;
    }
    playContext([song.id], song.id);
    const frame = window.requestAnimationFrame(() => {
      const origin = capturePlayerOrigin();
      setPlayerTransitionOrigin(origin);
      setPlayerSharedOrigin(capturePlayerSharedOrigin(origin));
      setPlayerTransitionPhase('opening');
      setIsPlayerOpen(true);
      if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
      playerTransitionTimerRef.current = window.setTimeout(
        () => setPlayerTransitionPhase('open'),
        PLAYER_SHELL_DURATION * 1000 + 80,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [capturePlayerOrigin, capturePlayerSharedOrigin, playContext, songs]);

  const playListeningRecapSong = React.useCallback((songId: string) => {
    if (!songId) return;
    playContext([songId], songId);
  }, [playContext]);

  const playListeningRecapQueue = React.useCallback((songIds: string[], startSongId: string) => {
    if (!songIds.length || !startSongId) return;
    playContext(songIds, startSongId);
  }, [playContext]);

  const isModalActive = modalCount > 0;
  const currentSong = songs.find((song) => song.id === playerState.currentSongId);
  const isCompactDockPair = isCompactBottomTabLayout
    && !isListeningRecap
    && !isModalActive
    && Boolean(currentSong);

  React.useEffect(() => {
    if (!isCompactDockPair) setIsCompactPlayerExpanded(false);
  }, [isCompactDockPair]);

  const expandCompactPlayer = React.useCallback(() => {
    if (!playerState.isPlaying) togglePlay();
    setIsCompactPlayerExpanded(true);
  }, [playerState.isPlaying, togglePlay]);

  const collapseCompactPlayerToHome = React.useCallback(() => {
    setActiveTab('home');
    setProfileUserId(undefined);
    setIsCompactPlayerExpanded(false);
  }, [setActiveTab, setProfileUserId]);

  const miniPlayerLayoutTarget = isModalActive
    ? {
        top: 'calc(env(safe-area-inset-top) + 12px)',
        bottom: 'auto',
        left: '12px',
        right: '12px',
        width: 'min(320px, calc(100% - 24px))',
        x: '0%',
        opacity: 1,
      }
    : isCompactDockPair
      ? {
          top: 'auto',
          bottom: `calc(env(safe-area-inset-bottom) + ${BOTTOM_DOCK_GEOMETRY.compactNavBottom + 1}px)`,
          left: '50%',
          right: 'auto',
          width: isCompactPlayerExpanded
            ? `${BOTTOM_DOCK_GEOMETRY.compactMaxWidth}px`
            : `${BOTTOM_DOCK_GEOMETRY.compactCircleSize}px`,
          x: isCompactPlayerExpanded
            ? -(BOTTOM_DOCK_GEOMETRY.compactPairWidth / 2 - BOTTOM_DOCK_GEOMETRY.compactCircleSize - BOTTOM_DOCK_GEOMETRY.compactPairGap)
            : BOTTOM_DOCK_GEOMETRY.compactPairWidth / 2 - BOTTOM_DOCK_GEOMETRY.compactCircleSize,
          opacity: 1,
        }
      : {
          top: 'auto',
          bottom: isListeningRecap
            ? `calc(env(safe-area-inset-bottom) + ${BOTTOM_DOCK_GEOMETRY.wideNavBottom}px)`
            : `calc(env(safe-area-inset-bottom) + ${getBottomDockMiniBottom(liquidGlassSettings.bottomTabLayout)}px)`,
          left: isCompactBottomTabLayout && !isListeningRecap ? '50%' : `${BOTTOM_DOCK_GEOMETRY.viewportGutter}px`,
          right: isCompactBottomTabLayout && !isListeningRecap ? 'auto' : `${BOTTOM_DOCK_GEOMETRY.viewportGutter}px`,
          width: isCompactBottomTabLayout && !isListeningRecap
            ? `min(${BOTTOM_DOCK_GEOMETRY.compactMaxWidth}px, calc(100% - ${BOTTOM_DOCK_GEOMETRY.viewportGutter * 2}px))`
            : `min(${BOTTOM_DOCK_GEOMETRY.wideMaxWidth}px, calc(100% - ${BOTTOM_DOCK_GEOMETRY.viewportGutter * 2}px))`,
          x: isCompactBottomTabLayout && !isListeningRecap ? '-50%' : '0%',
          opacity: 1,
        };

  return (
    <div className="jzone-app-shell max-w-md mx-auto bg-black h-screen overflow-hidden relative shadow-2xl flex flex-col" style={liquidGlassCssVars}>
      <SharedElementLayer>
      <div className="jzone-glass-source flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-black">
        <motion.div
          className="jzone-route-stage relative min-h-full"
          data-route={currentRoute}
          initial={false}
          animate={routeFallbackControls}
        >
        <Suspense fallback={isListeningRecap ? <ListeningRecapFallback onBack={closeListeningRecap} /> : <PageFallback />}>
          {isListeningRecap ? (
            <ListeningRecapPage
              period={listeningRecapPeriod ?? undefined}
              onBack={closeListeningRecap}
              onPeriodChange={replaceListeningRecapPeriod}
              onPlaySong={playListeningRecapSong}
              onPlayQueue={playListeningRecapQueue}
            />
          ) : (
            <>
              {activeTab === 'home' && <Home profileAvatarUrl={profileAvatarUrl} />}
              {activeTab === 'library' && <Library />}
              {uploadMounted && (
                <div className={activeTab === 'upload' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'upload'}>
                  <Upload />
                </div>
              )}
              {(profileMounted || activeTab === 'profile') && (
                <div
                  ref={profileRouteRef}
                  className={activeTab === 'profile'
                    ? 'absolute inset-x-0 top-0 min-h-full'
                    : activeTab === 'home'
                      ? 'invisible pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden'
                      : 'hidden'}
                  aria-hidden={activeTab !== 'profile'}
                  data-profile-route-shell="true"
                  style={activeTab === 'profile'
                    ? undefined
                    : { visibility: 'hidden', opacity: 0, transition: 'none' }}
                >
                  <Profile
                    userId={profileUserId}
                    onBack={profileUserId ? () => setProfileUserId(undefined) : undefined}
                  />
                </div>
              )}
            </>
          )}
        </Suspense>
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
      {collectionId && (
        <Suspense fallback={null}>
          <CollectionDetailPage key={collectionId} collectionId={collectionId} onClose={closeCollection} />
        </Suspense>
      )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {currentSong && (
      <motion.div
          ref={miniPlayerLayerRef}
          data-testid="mini-player-layer"
          aria-hidden={isPlayerOpen && playerTransitionPhase !== 'closing'}
          initial={reduceMotion ? miniPlayerLayoutTarget : { ...miniPlayerLayoutTarget, opacity: 0, scale: 0.94, filter: 'blur(8px)' }}
          animate={{ ...miniPlayerLayoutTarget, scale: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
          transition={{
            top: { type: 'spring', damping: 26, stiffness: 320 },
            bottom: { type: 'spring', damping: 26, stiffness: 320 },
            left: { type: 'spring', damping: 30, stiffness: 380, mass: 0.78 },
            width: { type: 'spring', damping: 26, stiffness: 320 },
            x: { type: 'spring', damping: 30, stiffness: 380, mass: 0.78 },
            opacity: { duration: 0.12 },
            scale: { type: 'spring', damping: 24, stiffness: 360, mass: 0.72 },
            filter: { duration: reduceMotion ? 0 : 0.24 },
          }}
          className="fixed z-[160] mx-auto"
          data-layout-mode={liquidGlassSettings.bottomTabLayout}
          data-compact-player-expanded={isCompactDockPair ? String(isCompactPlayerExpanded) : undefined}
          data-player-transition-origin={playerTransitionOrigin ? JSON.stringify(playerTransitionOrigin) : undefined}
          data-player-shared-origin={playerSharedOrigin ? JSON.stringify(playerSharedOrigin) : undefined}
        >
        <PlayerBar
          onExpand={isCompactDockPair && !isCompactPlayerExpanded ? expandCompactPlayer : openPlayer}
          variant={isModalActive ? 'island' : 'dock'}
          settlePulse={miniSettlePulse}
          compact={isCompactBottomTabLayout && !isListeningRecap}
          compactMode={isCompactDockPair ? (isCompactPlayerExpanded ? 'expanded' : 'circle') : undefined}
        />
      </motion.div>
      )}
      </AnimatePresence>

      {!isListeningRecap && (
        <BottomNavigation
          currentTab={activeTab}
          profileAvatarUrl={profileAvatarUrl}
          compactMode={isCompactDockPair && isCompactPlayerExpanded ? 'home' : 'full'}
          compactDocked={isCompactDockPair}
          onCompactHomeClick={collapseCompactPlayerToHome}
          setTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'profile') setProfileUserId(undefined);
          }}
        />
      )}

      {isPlayerOpen && (
        <Suspense fallback={null}>
          <PlayerView
            onClose={closePlayer}
            transitionPhase={playerTransitionPhase}
            transitionOrigin={playerTransitionOrigin ?? getDefaultPlayerOrigin()}
            sharedOrigin={playerSharedOrigin ?? getDefaultPlayerSharedOrigin(playerTransitionOrigin ?? getDefaultPlayerOrigin())}
            lyricsRequest={playerLyricsRequest}
            onLyricsRequestHandled={handlePlayerLyricsRequestHandled}
          />
        </Suspense>
      )}
      <PwaInstallPrompt />
      <ProfileAvatarRouteTransition activeTab={activeTab} />
      </SharedElementLayer>
    </div>
  );
};
