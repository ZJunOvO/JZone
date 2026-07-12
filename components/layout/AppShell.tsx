import React, { Suspense, lazy, useState } from 'react';
import { motion } from 'framer-motion';
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
import { runViewTransition } from '../../utils/viewTransition';

const Home = lazy(() => import('../../pages/Home').then((module) => ({ default: module.Home })));
const Library = lazy(() => import('../../pages/Library').then((module) => ({ default: module.Library })));
const Upload = lazy(() => import('../../pages/Upload').then((module) => ({ default: module.Upload })));
const Profile = lazy(() => import('../../pages/Profile').then((module) => ({ default: module.Profile })));
const loadCollectionDetail = () => import('../../pages/CollectionDetailPage').then((module) => ({ default: module.CollectionDetailPage }));
const CollectionDetailPage = lazy(loadCollectionDetail);
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
  const liquidGlassSettings = useLiquidGlassSettings();
  const liquidGlassCssVars = getLiquidGlassCssVars(liquidGlassSettings);
  const {
    activeTab,
    setActiveTab,
    profileUserId,
    setProfileUserId,
    collectionId,
    closeCollection,
  } = useAppRoute();
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isPlayerTransitioning, setIsPlayerTransitioning] = useState(false);
  const playerTransitionTimerRef = React.useRef<number | null>(null);
  const [modalCount, setModalCount] = useState(0);
  const [uploadMounted, setUploadMounted] = useState(activeTab === 'upload');
  const sharedSongHandledRef = React.useRef<string | null>(null);

  useAutoFullscreen();
  useLiquidGlassAdaptiveForeground();

  React.useEffect(() => {
    return listenModalPresence((delta) => {
      setModalCount((count) => Math.max(0, count + delta));
    });
  }, []);

  React.useEffect(() => {
    if (activeTab === 'upload') setUploadMounted(true);
  }, [activeTab]);

  React.useEffect(() => {
    if (songs.length > 0) void loadPlayerView();
  }, [songs.length]);

  React.useEffect(() => {
    if (activeTab === 'profile') void loadCollectionDetail();
  }, [activeTab]);

  React.useEffect(() => () => {
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
  }, []);

  const openPlayer = React.useCallback(() => {
    setIsPlayerTransitioning(true);
    setIsPlayerOpen(true);
    if (playerTransitionTimerRef.current) window.clearTimeout(playerTransitionTimerRef.current);
    playerTransitionTimerRef.current = window.setTimeout(() => setIsPlayerTransitioning(false), 520);
  }, []);

  const closePlayer = React.useCallback(() => {
    setIsPlayerOpen(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="mini-player"]')?.focus();
    });
  }, []);

  React.useEffect(() => {
    if (collectionId) setIsPlayerOpen(false);
  }, [collectionId]);

  React.useEffect(() => {
    if (profileUserId) setIsPlayerOpen(false);
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
    setIsPlayerOpen(true);
  }, [playContext, songs]);

  const isModalActive = modalCount > 0;

  return (
    <div className="jzone-app-shell max-w-md mx-auto bg-black h-screen overflow-hidden relative shadow-2xl flex flex-col" style={liquidGlassCssVars}>
      <SharedElementLayer>
      <div className="jzone-glass-source flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-black">
        <Suspense fallback={<PageFallback />}>
          {activeTab === 'home' && <Home />}
          {activeTab === 'library' && <Library />}
          {uploadMounted && (
            <div className={activeTab === 'upload' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'upload'}>
              <Upload />
            </div>
          )}
          {activeTab === 'profile' && (
            <Profile userId={profileUserId} onBack={profileUserId ? () => setProfileUserId(undefined) : undefined} />
          )}
        </Suspense>
      </div>

      {collectionId && (
        <Suspense fallback={null}>
          <CollectionDetailPage collectionId={collectionId} onClose={closeCollection} />
        </Suspense>
      )}

      {(!isPlayerOpen || isPlayerTransitioning) && (
        <motion.div
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
                  bottom: '92px',
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
        >
          <PlayerBar onExpand={openPlayer} variant={isModalActive ? 'island' : 'dock'} />
        </motion.div>
      )}

      <BottomNavigation
        currentTab={activeTab}
        setTab={(tab) => {
          runViewTransition(() => {
            setActiveTab(tab);
            if (tab === 'profile') setProfileUserId(undefined);
          });
        }}
      />

      {isPlayerOpen && (
        <Suspense fallback={null}>
          <PlayerView onClose={closePlayer} />
        </Suspense>
      )}
      <PwaInstallPrompt />
      </SharedElementLayer>
    </div>
  );
};
