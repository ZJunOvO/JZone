import React, { useState } from 'react';
import { AppProvider, useStore } from './store';
import { Icons } from './components/Icons';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Upload } from './pages/Upload';
import { Profile } from './pages/Profile';
import { CollectionDetailPage } from './pages/CollectionDetailPage';
import { PlayerBar } from './components/PlayerBar';
import { PlayerView } from './pages/PlayerView';
import { AuthProvider, useAuth } from './auth';
import { Auth } from './pages/Auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BUILD_ID } from './buildInfo';
import { listenModalPresence } from './modalPresence';
import { motion } from 'framer-motion';

const Navigation = ({ currentTab, setTab }: { currentTab: string, setTab: (t: string) => void }) => {
  const tabs = [
    { id: 'home', icon: Icons.Play, label: '现在就听' }, 
    { id: 'library', icon: Icons.ListMusic, label: '资料库' },
    { id: 'upload', icon: Icons.PlusCircle, label: '创作' },
    { id: 'profile', icon: Icons.User, label: '我的' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-800/60 backdrop-blur-lg backdrop-saturate-150 border-t border-white/10 pb-safe px-6 flex justify-around items-center z-30 h-[72px]">
      {tabs.map(tab => {
        const isActive = currentTab === tab.id;
        return (
          <button 
            key={tab.id} 
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            title={tab.label}
            data-tab={tab.id}
            data-testid={`bottom-nav-${tab.id}`}
            onClick={() => setTab(tab.id)}
            className={`flex items-center justify-center w-16 h-full transition-all duration-300 group`}
          >
            <div className={`relative transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100 group-active:scale-90'}`}>
                <tab.icon 
                    size={28} 
                    strokeWidth={isActive ? 2.5 : 1.8} 
                    className={`transition-colors duration-300 ${isActive ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                    fill={isActive ? "currentColor" : "none"} 
                />
            </div>
            <span className="sr-only">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-500 text-sm font-bold tracking-widest uppercase">Loading</div>
      </div>
    );
  }

  if (status === 'signed_out' || status === 'misconfigured') {
    return <Auth />;
  }

  return <>{children}</>;
};

const MainLayout = () => {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('jzone.activeTab') || 'home';
    } catch {
      return 'home';
    }
  });
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [modalCount, setModalCount] = useState(0);

  const parseCollectionIdFromPath = () => {
    try {
      const path = window.location.pathname || '/';
      const match = path.match(/^\/collection\/([^/]+)$/i);
      if (!match) return null;
      const id = match[1];
      return id ? decodeURIComponent(id) : null;
    } catch {
      return null;
    }
  };

  const openCollection = (id: string, push: boolean) => {
    setCollectionId(id);
    setIsPlayerOpen(false);
    if (push) {
      try {
        window.history.pushState({ type: 'collection', id }, '', `/collection/${encodeURIComponent(id)}`);
      } catch {}
    }
  };

  const closeCollection = () => {
    const current = parseCollectionIdFromPath();
    setCollectionId(null);
    if (current) {
      try {
        window.history.back();
      } catch {}
    }
  };

  React.useEffect(() => {
    return listenModalPresence((delta) => {
      setModalCount((c) => Math.max(0, c + delta));
    });
  }, []);

  React.useEffect(() => {
    const initial = parseCollectionIdFromPath();
    if (initial) setCollectionId(initial);
    const onPop = () => {
      const id = parseCollectionIdFromPath();
      setCollectionId(id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { userId?: string } | undefined;
      setProfileUserId(detail?.userId);
      setActiveTab('profile');
      setIsPlayerOpen(false); // Close player view when navigating to profile
      setCollectionId(null); // Close collection detail modal
      try {
        localStorage.setItem('jzone.activeTab', 'profile');
      } catch {}
    };
    window.addEventListener('jzone:navigate-profile', handler as any);
    return () => window.removeEventListener('jzone:navigate-profile', handler as any);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { id?: string } | undefined;
      if (!detail?.id) return;
      openCollection(detail.id, true);
    };
    window.addEventListener('jzone:navigate-collection', handler as any);
    return () => window.removeEventListener('jzone:navigate-collection', handler as any);
  }, []);

  const isModalActive = modalCount > 0;

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <Home />;
      case 'library': return <Library />;
      case 'upload': return <Upload />;
      case 'profile': return <Profile userId={profileUserId} onBack={profileUserId ? () => setProfileUserId(undefined) : undefined} />;
      default: return <Home />;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-black h-screen overflow-hidden relative shadow-2xl flex flex-col">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-black">
        {renderContent()}
      </div>

      {collectionId && <CollectionDetailPage collectionId={collectionId} onClose={closeCollection} />}

      {/* Mini Player */}
      {!isPlayerOpen && (
        <motion.div
          initial={false}
          animate={
            isModalActive
              ? {
                  top: 'calc(env(safe-area-inset-top) + 12px)',
                  bottom: 'auto',
                  left: '50%',
                  right: 'auto',
                  x: '-50%',
                  width: 'min(320px, calc(100% - 24px))',
                }
              : {
                  top: 'auto',
                  bottom: '84px',
                  left: '12px',
                  right: '12px',
                  x: 0,
                  width: 'auto',
                }
          }
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="fixed z-[160]"
        >
          <PlayerBar onExpand={() => setIsPlayerOpen(true)} variant={isModalActive ? 'island' : 'dock'} />
        </motion.div>
      )}

      {/* Bottom Navigation */}
      <Navigation
        currentTab={activeTab}
        setTab={(t) => {
          setActiveTab(t);
          if (t === 'profile') setProfileUserId(undefined);
          try {
            localStorage.setItem('jzone.activeTab', t);
          } catch {}
        }}
      />

      {/* Full Screen Player Overlay */}
      {isPlayerOpen && (
        <PlayerView onClose={() => setIsPlayerOpen(false)} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  try {
    document.documentElement.dataset.buildId = BUILD_ID;
  } catch {}
  return (
    <AuthProvider>
      <AppProvider>
        <ErrorBoundary>
          <AuthGate>
            <MainLayout />
          </AuthGate>
        </ErrorBoundary>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
