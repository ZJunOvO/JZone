import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from '../Icons';
import {
  DEFAULT_LIQUID_GLASS_SETTINGS,
  getLiquidGlassCssVars,
  resetLiquidGlassSettings,
  saveLiquidGlassSettings,
  type LiquidGlassLayoutMode,
  type LiquidGlassSettings,
  useLiquidGlassSettings,
} from '../../utils/liquidGlassSettings';
import { createLiquidGlassDisplacementMap, type LiquidGlassDisplacementMap } from '../../utils/liquidGlassDisplacement';

interface ProfileSettingsSheetProps {
  backgroundBlur: number;
  onBlurChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onEditProfile: () => void;
  onOpenBackground: () => void;
  onSignOut: () => Promise<void>;
}

type LiquidGlassNumericSettingKey = Exclude<keyof LiquidGlassSettings, 'bottomTabLayout'>;

const liquidGlassControls: Array<{
  key: LiquidGlassNumericSettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  { key: 'strength', label: '折射强度', min: 0, max: 0.12, step: 0.001, format: (value) => value.toFixed(3) },
  { key: 'lensStrength', label: '透镜折射', min: 0.5, max: 2.2, step: 0.05, format: (value) => value.toFixed(2) },
  { key: 'edgeRefraction', label: '边缘折射', min: 0.3, max: 1.2, step: 0.01, format: (value) => value.toFixed(2) },
  { key: 'blur', label: '通透模糊', min: 0, max: 3, step: 0.05, format: (value) => `${value.toFixed(2)}px` },
  { key: 'saturation', label: '饱和度', min: 1, max: 2.2, step: 0.05, format: (value) => value.toFixed(2) },
  { key: 'brightness', label: '亮度', min: 0.82, max: 1.3, step: 0.01, format: (value) => value.toFixed(2) },
  { key: 'contrast', label: '对比度', min: 1, max: 1.6, step: 0.01, format: (value) => value.toFixed(2) },
  { key: 'tint', label: '玻璃底色', min: 0, max: 0.14, step: 0.005, format: (value) => value.toFixed(3) },
  { key: 'edgeHighlight', label: '边缘高光', min: 0, max: 1, step: 0.01, format: (value) => value.toFixed(2) },
  { key: 'specular', label: '镜面强度', min: 0, max: 2, step: 0.05, format: (value) => value.toFixed(2) },
];

const bottomTabLayoutModes: Array<{ value: LiquidGlassLayoutMode; label: string; description: string }> = [
  { value: 'wide', label: '宽屏', description: '默认' },
  { value: 'compact', label: '紧凑', description: '约 220px' },
];

const LiquidGlassPreview: React.FC<{ settings: LiquidGlassSettings }> = ({ settings }) => {
  const filterId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const dockRef = React.useRef<HTMLDivElement>(null);
  const lensRef = React.useRef<HTMLDivElement>(null);
  const [dockSize, setDockSize] = React.useState({ width: 320, height: 64 });
  const [lensSize, setLensSize] = React.useState({ width: 82, height: 48 });
  const [dockMap, setDockMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const [lensMap, setLensMap] = React.useState<LiquidGlassDisplacementMap>({ href: '', scale: 0 });
  const strengthRatio = Math.max(0, settings.strength / DEFAULT_LIQUID_GLASS_SETTINGS.strength);
  const dockFilterScale = Math.round((dockMap.scale || 34) * strengthRatio * 0.86);
  const lensFilterScale = Math.round((lensMap.scale || 24) * strengthRatio * settings.lensStrength);
  const previewVars = {
    ...getLiquidGlassCssVars(settings),
    '--profile-glass-filter': `url(#profile-liquid-preview-${filterId})`,
    '--profile-glass-lens-filter': `url(#profile-liquid-preview-${filterId}-lens)`,
  } as React.CSSProperties;

  React.useLayoutEffect(() => {
    const dock = dockRef.current;
    const lens = lensRef.current;
    if (!dock || !lens) return;

    const readSize = () => {
      const dockRect = dock.getBoundingClientRect();
      const lensRect = lens.getBoundingClientRect();
      const nextDock = { width: Math.max(1, Math.round(dockRect.width)), height: Math.max(1, Math.round(dockRect.height)) };
      const nextLens = { width: Math.max(1, Math.round(lensRect.width)), height: Math.max(1, Math.round(lensRect.height)) };
      setDockSize((current) => (current.width === nextDock.width && current.height === nextDock.height ? current : nextDock));
      setLensSize((current) => (current.width === nextLens.width && current.height === nextLens.height ? current : nextLens));
    };

    readSize();
    const observer = new ResizeObserver(readSize);
    observer.observe(dock);
    observer.observe(lens);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    setDockMap(
      createLiquidGlassDisplacementMap(dockSize.width, dockSize.height, {
        edgeScale: settings.edgeRefraction,
        centerStrength: 0.14,
        sideVerticalDamp: 0.34,
        sideHorizontalBoost: 1.12,
        normalization: 0.74,
      }),
    );
  }, [dockSize.height, dockSize.width, settings.edgeRefraction]);

  React.useEffect(() => {
    setLensMap(
      createLiquidGlassDisplacementMap(lensSize.width, lensSize.height, {
        edgeScale: Math.min(1.18, settings.edgeRefraction * 1.12),
        centerStrength: 0.24,
        sideVerticalDamp: 0.45,
        sideHorizontalBoost: 1.08,
        normalization: 0.68,
      }),
    );
  }, [lensSize.height, lensSize.width, settings.edgeRefraction]);

  return (
    <div className="profile-glass-preview relative overflow-hidden rounded-[26px]" style={previewVars}>
      <svg className="absolute h-0 w-0" aria-hidden focusable="false">
        <filter id={`profile-liquid-preview-${filterId}`} x="0" y="0" width={dockSize.width} height={dockSize.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={dockMap.href} width={dockSize.width} height={dockSize.height} result={`${filterId}-preview-map`} />
          <feDisplacementMap in="SourceGraphic" in2={`${filterId}-preview-map`} scale={dockFilterScale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`profile-liquid-preview-${filterId}-lens`} x="0" y="0" width={lensSize.width} height={lensSize.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={lensMap.href} width={lensSize.width} height={lensSize.height} result={`${filterId}-preview-lens-map`} />
          <feDisplacementMap in="SourceGraphic" in2={`${filterId}-preview-lens-map`} scale={lensFilterScale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="profile-glass-preview-bg absolute inset-0" aria-hidden>
        <div className="profile-glass-preview-orb profile-glass-preview-orb-a" />
        <div className="profile-glass-preview-orb profile-glass-preview-orb-b" />
        <div className="profile-glass-preview-card profile-glass-preview-card-a">
          <span>公园</span>
          <strong>纸菌live</strong>
        </div>
        <div className="profile-glass-preview-card profile-glass-preview-card-b">
          <span>彩虹</span>
          <strong>周杰伦</strong>
        </div>
      </div>

      <div ref={dockRef} className="profile-glass-preview-dock absolute left-4 right-4 bottom-4 h-[64px] rounded-[32px]">
        <div className="profile-glass-preview-effect absolute inset-0 rounded-[32px]" />
        <div ref={lensRef} className="profile-glass-preview-lens absolute top-2 bottom-2 left-[55%] w-[82px] -translate-x-1/2 rounded-[26px]" />
        <div className="relative z-10 grid h-full grid-cols-4 place-items-center text-white/75">
          <Icons.Play size={20} fill="currentColor" className="text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.45)]" />
          <Icons.ListMusic size={20} />
          <Icons.PlusCircle size={21} />
          <Icons.User size={20} />
        </div>
      </div>

      <div className="relative z-10 p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-white/55">实时预览</div>
        <div className="mt-1 text-lg font-black text-white">Liquid Glass</div>
        <div className="mt-1 text-xs font-semibold text-white/55">在有内容的背景上观察折射和通透度</div>
      </div>

      <div className="absolute left-4 right-4 bottom-[92px] z-10 grid grid-cols-3 gap-2 text-[10px] font-bold text-white/70">
        <div className="rounded-xl bg-black/18 px-2 py-1.5 backdrop-blur-md">折射 {dockFilterScale}</div>
        <div className="rounded-xl bg-black/18 px-2 py-1.5 backdrop-blur-md">模糊 {settings.blur.toFixed(2)}</div>
        <div className="rounded-xl bg-black/18 px-2 py-1.5 backdrop-blur-md">透镜 {settings.lensStrength.toFixed(2)}</div>
      </div>
    </div>
  );
};

export const ProfileSettingsSheet: React.FC<ProfileSettingsSheetProps> = ({
  backgroundBlur,
  onBlurChange,
  onClose,
  onEditProfile,
  onOpenBackground,
  onSignOut,
}) => {
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = React.useState(false);
  const [liquidGlassPanelOpen, setLiquidGlassPanelOpen] = React.useState(false);
  const liquidGlassSettings = useLiquidGlassSettings();

  const updateLiquidGlassSetting = <K extends keyof LiquidGlassSettings>(key: K, value: LiquidGlassSettings[K]) => {
    saveLiquidGlassSettings({ ...liquidGlassSettings, [key]: value });
  };

  const updateBottomTabLayout = (bottomTabLayout: LiquidGlassLayoutMode) => {
    saveLiquidGlassSettings({ ...liquidGlassSettings, bottomTabLayout });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        <h3 className="text-lg font-bold text-white text-center">设置</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-zinc-400">背景模糊度</label>
              <span className="text-sm font-bold text-white">{backgroundBlur}%</span>
            </div>
            <input type="range" min="0" max="100" value={backgroundBlur} onChange={onBlurChange} className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white" />
          </div>

          <div className="h-px bg-white/10" />

          <button onClick={onEditProfile} className="w-full flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl text-white font-medium hover:bg-zinc-800 transition">
            <span>编辑资料</span>
            <Icons.ChevronRight size={16} className="text-zinc-500" />
          </button>

          <button onClick={onOpenBackground} className="w-full flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl text-white font-medium hover:bg-zinc-800 transition">
            <span>更换背景</span>
            <div className="flex items-center gap-2">
              <Icons.ChevronRight size={16} className="text-zinc-500" />
            </div>
          </button>

          <div className="h-px bg-white/10" />

          <div className="space-y-3">
            <button
              type="button"
              aria-expanded={advancedSettingsOpen}
              onClick={() => setAdvancedSettingsOpen((value) => !value)}
              className="w-full flex items-center justify-between gap-4 p-4 bg-zinc-800/50 rounded-xl text-left hover:bg-zinc-800 transition"
            >
              <div>
                <h4 className="text-sm font-bold text-white">高级设置</h4>
                <p className="text-xs text-zinc-500 mt-1">实验性外观与调试选项</p>
              </div>
              <Icons.ChevronRight size={18} className={`shrink-0 text-zinc-500 transition-transform ${advancedSettingsOpen ? 'rotate-90' : ''}`} />
            </button>

            <AnimatePresence initial={false}>
              {advancedSettingsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="ml-2 border-l border-white/10 pl-3">
                    <div className="space-y-4 rounded-xl bg-white/[0.035] border border-white/10 p-4">
                      <div className="space-y-2" data-testid="bottom-tab-layout-settings">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-bold text-white">底部 Tab 宽度</h4>
                            <p className="mt-1 text-xs text-zinc-500">宽屏保留当前布局；紧凑模式收窄并上移底部导航。</p>
                          </div>
                          <span className="shrink-0 pt-0.5 text-xs font-bold text-zinc-400">
                            {liquidGlassSettings.bottomTabLayout === 'compact' ? '紧凑' : '宽屏'}
                          </span>
                        </div>
                        <div
                          role="group"
                          aria-label="底部 Tab 宽度模式"
                          data-layout-mode={liquidGlassSettings.bottomTabLayout}
                          className="grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1"
                        >
                          {bottomTabLayoutModes.map((mode) => {
                            const isSelected = liquidGlassSettings.bottomTabLayout === mode.value;
                            return (
                              <button
                                key={mode.value}
                                type="button"
                                aria-label={`${mode.label}底部 Tab 布局`}
                                aria-pressed={isSelected}
                                data-layout-mode-option={mode.value}
                                data-testid={`bottom-tab-layout-${mode.value}`}
                                onClick={() => updateBottomTabLayout(mode.value)}
                                className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                                  isSelected ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span>{mode.label}</span>
                                <span className={`mt-0.5 text-[10px] font-medium ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>{mode.description}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-expanded={liquidGlassPanelOpen}
                        onClick={() => setLiquidGlassPanelOpen((value) => !value)}
                        className="w-full flex items-center justify-between gap-4 text-left"
                      >
                        <div>
                          <h4 className="text-sm font-bold text-white">液态玻璃参数</h4>
                          <p className="text-xs text-zinc-500 mt-1">
                            折射 {liquidGlassSettings.strength.toFixed(3)} · 边缘 {liquidGlassSettings.edgeRefraction.toFixed(2)} · 透镜 {liquidGlassSettings.lensStrength.toFixed(2)}
                          </p>
                        </div>
                        <Icons.ChevronRight size={18} className={`shrink-0 text-zinc-500 transition-transform ${liquidGlassPanelOpen ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence initial={false}>
                        {liquidGlassPanelOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-4 pt-1">
                              <LiquidGlassPreview settings={liquidGlassSettings} />

                              <div className="flex justify-end">
                                <button type="button" onClick={resetLiquidGlassSettings} className="px-3 py-2 rounded-full bg-white/5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition">
                                  重置
                                </button>
                              </div>

                              {liquidGlassControls.map((control) => {
                                const value = liquidGlassSettings[control.key];
                                return (
                                  <div className="space-y-2" key={control.key}>
                                    <div className="flex justify-between items-center">
                                      <label className="text-xs font-medium text-zinc-400">{control.label}</label>
                                      <span className="text-xs font-bold text-white">{control.format(value)}</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={control.min}
                                      max={control.max}
                                      step={control.step}
                                      value={value}
                                      onChange={(event) => updateLiquidGlassSetting(control.key, Number(event.target.value))}
                                      className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={onSignOut} className="w-full flex items-center justify-center p-4 bg-red-500/10 text-red-500 rounded-xl font-bold hover:bg-red-500/20 transition active:scale-95">
            退出登录
          </button>
        </div>

        <button onClick={onClose} className="w-full py-3 text-zinc-500 font-medium text-sm hover:text-white transition">
          取消
        </button>
      </motion.div>
    </div>
  );
};
