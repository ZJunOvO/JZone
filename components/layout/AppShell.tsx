import React, { Suspense, lazy, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { PlayerBar } from '../PlayerBar';
import { PwaInstallPrompt } from '../PwaInstallPrompt';
import { listenModalPresence } from '../../modalPresence';
import { getLiquidGlassCssVars, useLiquidGlassSettings } from '../../utils/liquidGlassSettings';
import { useAutoFullscreen } from '../../hooks/useAutoFullscreen';
import { useAppRoute } from '../../hooks/useAppRoute';
import { BottomNavigation } from '../navigation/BottomNavigation';
import { useStore } from '../../store';
import { feedback } from '../feedback';
import { useLiquidGlassAdaptiveForeground } from '../../hooks/useLiquidGlassAdaptiveForeground';
import { SharedElementLayer } from '../motion/SharedElementLayer';
import { ProfileAvatarRouteTransition } from '../motion/ProfileAvatarRouteTransition';
import { useCurrentArtistProfile } from '../../hooks/useCurrentArtistProfile';
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
const ListeningRecapPage = lazy(() => import('../../pages/ListeningRecap').then((module) => ({ default: module.ListeningRecap })));
const loadPlayerView = () => import('../../pages/PlayerView').then((module) => ({ default: module.PlayerView }));
const PlayerView = lazy(loadPlayerView);

const PageFallback = () => (
  <div className="min-h-screen bg-black px-6 pt-16" aria-label="页面加载中">
    <div className="h-8 w-28 animate-pulse rounded-lg bg-white/8" />
    <div className="mt-8 h-40 animate-pulse rounded-3xl bg-white/[0.045]" />
  </div>
);

export const AppShell: React.FC = () => {
  const { songs, playContext } = useStore();
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
  const [playerTransitionPhase, setPlayerTransitionPhase] = useState<PlayerTransitionPhase>('open');
  const [playerTransitionOrigin, setPlayerTransitionOrigin] = useState<PlayerTransitionOrigin | null>(null);
  const [playerSharedOrigin, setPlayerSharedOrigin] = useState<PlayerSharedOrigin | null>(null);
  const playerTransitionTimerRef = React.useRef<number | null>(null);
  const [modalCount, setModalCount] = useState(0);
  const [uploadMounted, setUploadMounted] = useState(activeTab === 'upload');
  const [profileMounted, setProfileMounted] = useState(activeTab === 'profile');
  const sharedSongHandledRef = React.useRef<string | null>(null);
  const miniPlayerLayerRef = React.useRef<HTMLDivElement>(null);
  const profileRouteRef = React.useRef<HTMLDivElement>(null);
  const [miniSettlePulse, setMiniSettlePulse] = useState(0);
  const miniSettleTimerRef = React.useRef<number | null>(null);
  const miniSettleResetTimerRef = React.useRef<number | null>(null);
  const routeFallbackControls = useAnimationControls();
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
    const player = document.querySelector<HTMLElement>('[data-testid="mini-player"]');
    if (!player) return getDefaultPlayerOrigin();
    const rect = player.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      borderRadius: Number.parseFloat(getComputedStyle(player).borderRadius) || 18,
    };
  }, []);

  const capturePlayerSharedOrigin = React.useCallback((fallbackOrigin: PlayerTransitionOrigin): PlayerSharedOrigin => {
    const fallback = getDefaultPlayerSharedOrigin(fallbackOrigin);
    const readRect = (name: keyof PlayerSharedOrigin) => {
      const element = document.querySelector<HTMLElement>(`[data-player-shared-source="${name}"]`);
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

  React.useEffect(() => {
    if (collectionId) {
      setIsPlayerOpen(false);
      setPlayerTransitionPhase('open');
    }
  }, [collectionId]);

  React.useEffect(() => {
    if (profileUserId) {
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
    const origin = getDefaultPlayerOrigin();
    setPlayerTransitionOrigin(origin);
    setPlayerSharedOrigin(getDefaultPlayerSharedOrigin(origin));
    setPlayerTransitionPhase('opening');
    setIsPlayerOpen(true);
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
    playerTransitionTimerRef.current = window.setTimeout(
      () => setPlayerTransitionPhase('open'),
      PLAYER_SHELL_DURATION * 1000 + 80,
    );
  }, [playContext, songs]);

  const playListeningRecapSong = React.useCallback((songId: string) => {
    if (!songId) return;
    playContext([songId], songId);
  }, [playContext]);

  const playListeningRecapQueue = React.useCallback((songIds: string[], startSongId: string) => {
    if (!songIds.length || !startSongId) return;
    playContext(songIds, startSongId);
  }, [playContext]);

  const isModalActive = modalCount > 0;

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
        <Suspense fallback={<PageFallback />}>
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

      <motion.div
          ref={miniPlayerLayerRef}
          data-testid="mini-player-layer"
          aria-hidden={isPlayerOpen && playerTransitionPhase !== 'closing'}
          initial={false}
          animate={
            isModalActive
              ? {
                  top: 'calc(env(safe-area-inset-top) + 12px)',
                  bottom: 'auto',
                  left: '12px',
                  right: '12px',
                  width: 'min(320px, calc(100% - 24px))',
                  opacity: 1,
                }
              : {
                  top: 'auto',
                  // 当前导航顶部与播放器底部保持 12px，兼顾触达密度和 SVG 滤镜采样稳定性。
                  bottom: isListeningRecap
                    ? 'calc(env(safe-area-inset-bottom) + 14px)'
                    : isCompactBottomTabLayout
                      ? '111px'
                      : '92px',
                  left: '12px',
                  right: '12px',
                  width: 'min(400px, calc(100% - 24px))',
                  opacity: 1,
                }
          }
          transition={{
            top: { type: 'spring', damping: 26, stiffness: 320 },
            bottom: { type: 'spring', damping: 26, stiffness: 320 },
            width: { type: 'spring', damping: 26, stiffness: 320 },
            opacity: { duration: 0.12 },
          }}
          className="fixed z-[160] mx-auto"
          data-layout-mode={liquidGlassSettings.bottomTabLayout}
        >
        <PlayerBar onExpand={openPlayer} variant={isModalActive ? 'island' : 'dock'} settlePulse={miniSettlePulse} />
      </motion.div>

      {!isListeningRecap && (
        <BottomNavigation
          currentTab={activeTab}
          profileAvatarUrl={profileAvatarUrl}
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
          />
        </Suspense>
      )}
      <PwaInstallPrompt />
      <ProfileAvatarRouteTransition activeTab={activeTab} />
      </SharedElementLayer>
    </div>
  );
};
