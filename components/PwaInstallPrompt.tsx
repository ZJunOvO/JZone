import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from './Icons';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'jzone.pwaInstallDismissedAt';
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
};

const getPlatformHint = () => {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/harmony|openharmony|huawei/.test(ua)) return 'harmony';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const platform = useMemo(getPlatformHint, []);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;
    } catch {}

    const showTimer = window.setTimeout(() => setVisible(true), 1600);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const installed = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) {
      setShowGuide(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    setDeferredPrompt(null);
    if (choice?.outcome === 'accepted') {
      setVisible(false);
      return;
    }
    setShowGuide(true);
  };

  if (!visible) return null;

  const guide =
    platform === 'ios'
      ? 'iPhone/iPad：在 Safari 打开站点，点击分享按钮，然后选择“添加到主屏幕”。'
      : platform === 'harmony'
        ? '鸿蒙：在浏览器菜单中选择“添加到桌面”或“安装应用”；建议用系统浏览器或 Edge/Chrome 内核浏览器打开。'
        : platform === 'android'
          ? '安卓：点击安装按钮；如果没有弹窗，打开浏览器菜单并选择“安装应用”或“添加到主屏幕”。'
          : '桌面浏览器：点击地址栏右侧的安装图标，或在浏览器菜单中选择“安装 JZone”。';

  return (
    <div data-testid="pwa-install-prompt" className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+14px)] z-[240] w-[min(390px,calc(100%-28px))] -translate-x-1/2">
      <div className="rounded-[24px] border border-white/10 bg-zinc-950/82 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
            <Icons.Smartphone size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-white">安装 JZone 到桌面</div>
            <div className="mt-1 text-xs font-medium leading-relaxed text-zinc-300">
              独立窗口打开，隐藏浏览器地址栏，更接近桌面应用体验。
            </div>
            {showGuide ? <div className="mt-2 text-[11px] font-semibold leading-relaxed text-zinc-400">{guide}</div> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={install}
                className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-black active:scale-95 transition"
              >
                {deferredPrompt ? '安装应用' : '查看步骤'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                data-testid="pwa-install-later"
                className="rounded-full bg-white/8 px-4 py-2 text-xs font-bold text-zinc-300 active:scale-95 transition"
              >
                稍后
              </button>
            </div>
          </div>
          <button type="button" onClick={dismiss} data-testid="pwa-install-close" className="rounded-full p-2 text-zinc-500 hover:text-white active:scale-95 transition">
            <Icons.X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
