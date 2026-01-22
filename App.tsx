import React, { useState } from 'react';
import { AppProvider, useStore } from './store';
import { Icons } from './components/Icons';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Upload } from './pages/Upload';
import { PlayerBar } from './components/PlayerBar';
import { PlayerView } from './pages/PlayerView';

const Navigation = ({ currentTab, setTab }: { currentTab: string, setTab: (t: string) => void }) => {
  const tabs = [
    { id: 'home', icon: Icons.Play, label: '现在就听' }, 
    { id: 'library', icon: Icons.ListMusic, label: '资料库' },
    { id: 'upload', icon: Icons.PlusCircle, label: '上传' },
    { id: 'profile', icon: Icons.User, label: '我的' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/70 backdrop-blur-xl backdrop-saturate-150 border-t border-white/10 pb-safe pt-2 px-8 flex justify-between items-start z-30 h-[52px]">
      {tabs.map(tab => {
        const isActive = currentTab === tab.id;
        return (
          <button 
            key={tab.id} 
            onClick={() => setTab(tab.id)}
            className={`flex flex-col items-center justify-center w-12 transition-all duration-200`}
          >
            <div className={`${isActive ? 'text-red-500 scale-110' : 'text-zinc-500 hover:text-zinc-300 scale-100'}`}>
                <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} fill={isActive ? "currentColor" : "none"} />
            </div>
          </button>
        );
      })}
    </div>
  );
};

const Profile = () => {
  const { songs } = useStore();
  // Mocking stats for the demo
  const totalUploads = songs.length;
  const totalPlays = 1248; // Mock value

  return (
    <div className="bg-black min-h-screen pb-32">
      {/* Sticky Header with Glass Effect */}
      <div className="sticky top-0 z-20 bg-black/60 backdrop-blur-md px-6 pt-14 pb-4 border-b border-white/5">
        <h1 className="text-3xl font-bold text-white tracking-tight">我的</h1>
      </div>

      <div className="px-6 pt-6 space-y-8">
        {/* User Info Card - Material You style */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 p-6 shadow-2xl">
          <div className="relative z-10 flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-pink-600 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-xl border-2 border-white/20">
              J
            </div>
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">JZone 会员</h2>
              <p className="text-zinc-400 text-sm">尊享私密空间</p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-4">
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/5">
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest mb-1">上传总量</p>
              <p className="text-2xl font-black text-white">{totalUploads}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/5">
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest mb-1">累计播放</p>
              <p className="text-2xl font-black text-white">{totalPlays.toLocaleString()}</p>
            </div>
          </div>
          
          {/* Abstract decoration */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/20 blur-3xl rounded-full"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-red-500/20 blur-3xl rounded-full"></div>
        </div>

        {/* Action List */}
        <div className="space-y-2">
          <button className="w-full bg-zinc-900/50 p-4 rounded-2xl text-left text-zinc-200 flex justify-between items-center border border-white/5 transition active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                <Icons.Smartphone size={18} />
              </div>
              <span className="font-medium">账户设置</span>
            </div>
            <Icons.ChevronRight size={18} className="text-zinc-600" />
          </button>
          <button className="w-full bg-zinc-900/50 p-4 rounded-2xl text-left text-zinc-200 flex justify-between items-center border border-white/5 transition active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                <Icons.Music2 size={18} />
              </div>
              <span className="font-medium">已用空间</span>
            </div>
            <span className="text-zinc-500 text-sm font-mono">24%</span>
          </button>
          <button className="w-full bg-zinc-900/50 p-4 rounded-2xl text-left text-red-500 flex justify-between items-center border border-white/5 mt-4 transition active:scale-[0.98]">
            <span className="font-bold pl-1">退出登录</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const MainLayout = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <Home />;
      case 'library': return <Library />;
      case 'upload': return <Upload />;
      case 'profile': return <Profile />;
      default: return <Home />;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-black h-screen overflow-hidden relative shadow-2xl flex flex-col">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-black">
        {renderContent()}
      </div>

      {/* Mini Player */}
      {!isPlayerOpen && (
        <div className="max-w-md mx-auto w-full z-40">
            <PlayerBar onExpand={() => setIsPlayerOpen(true)} />
        </div>
      )}

      {/* Bottom Navigation */}
      <Navigation currentTab={activeTab} setTab={setActiveTab} />

      {/* Full Screen Player Overlay */}
      {isPlayerOpen && (
        <PlayerView onClose={() => setIsPlayerOpen(false)} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;
