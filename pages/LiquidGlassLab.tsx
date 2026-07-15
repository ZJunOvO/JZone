import React from 'react';
import { ChevronLeft, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  LIQUID_BOTTOM_TAB_DEFAULTS,
  LiquidGlassBottomTabsCanvas,
  type LiquidGlassBottomTabItem,
} from '../packages/jzone-liquid-glass/src';
import '../styles/liquid-glass-webgl-lab.css';

const TAB_ITEMS: LiquidGlassBottomTabItem[] = [
  {
    id: 'home',
    label: '现在就听',
    fillWhenActive: true,
    icon: {
      size: 28,
      viewport: 24,
      strokeWidth: 1.8,
      nodes: [{ kind: 'polygon', points: [[5, 3], [19, 12], [5, 21], [5, 3]] }],
    },
  },
  {
    id: 'library',
    label: '资料库',
    icon: {
      size: 28,
      viewport: 24,
      strokeWidth: 1.8,
      nodes: [
        { kind: 'path', d: 'M21 15V6' },
        { kind: 'path', d: 'M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z' },
        { kind: 'path', d: 'M12 12H3' },
        { kind: 'path', d: 'M16 6H3' },
        { kind: 'path', d: 'M12 18H3' },
      ],
    },
  },
  {
    id: 'upload',
    label: '创作',
    icon: {
      size: 28,
      viewport: 24,
      strokeWidth: 1.8,
      nodes: [
        { kind: 'circle', cx: 12, cy: 12, r: 10 },
        { kind: 'path', d: 'M8 12h8' },
        { kind: 'path', d: 'M12 8v8' },
      ],
    },
  },
  {
    id: 'profile',
    label: '我的',
    icon: {
      size: 28,
      viewport: 24,
      strokeWidth: 1.8,
      nodes: [
        { kind: 'path', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' },
        { kind: 'circle', cx: 12, cy: 7, r: 4 },
      ],
    },
  },
];

const MATERIAL_ROWS = [
  ['容器', '64px · R32'],
  ['容器折射', `${LIQUID_BOTTOM_TAB_DEFAULTS.containerRefractionHeight} / ${LIQUID_BOTTOM_TAB_DEFAULTS.containerRefractionAmount}px`],
  ['容器模糊', `${LIQUID_BOTTOM_TAB_DEFAULTS.containerBlurRadius}px`],
  ['饱和度', `${LIQUID_BOTTOM_TAB_DEFAULTS.containerSaturation}`],
  ['透镜', '56px · R28'],
  ['透镜折射', `${LIQUID_BOTTOM_TAB_DEFAULTS.indicatorRefractionHeight} / ${LIQUID_BOTTOM_TAB_DEFAULTS.indicatorRefractionAmount}px`],
  ['透镜模糊', `${LIQUID_BOTTOM_TAB_DEFAULTS.indicatorBlurRadius}px`],
  ['渲染倍率', `${LIQUID_BOTTOM_TAB_DEFAULTS.dpr}x`],
] as const;

export const LiquidGlassLab: React.FC = () => {
  const [activeId, setActiveId] = React.useState('home');
  const [controlsOpen, setControlsOpen] = React.useState(false);

  return (
    <main className="webgl-lab-page">
      <section className="webgl-lab-workbench">
        <header className="webgl-lab-header">
          <a href="/" className="webgl-lab-icon-button" aria-label="返回主应用" title="返回主应用">
            <ChevronLeft size={22} />
          </a>
          <div>
            <strong>WebGL Glass Lab</strong>
            <span>原版组件 · Bottom Tabs</span>
          </div>
          <button
            type="button"
            className="webgl-lab-icon-button"
            aria-label="查看原版参数"
            title="查看原版参数"
            onClick={() => setControlsOpen(true)}
          >
            <SlidersHorizontal size={20} />
          </button>
        </header>

        <div className="webgl-lab-phone">
          <LiquidGlassBottomTabsCanvas
            items={TAB_ITEMS}
            activeId={activeId}
            onChange={setActiveId}
            wallpaperSrc="/liquid-glass-webgl/wallpaper/wallpaper_light.webp"
            className="webgl-glass-stage"
          />
        </div>
      </section>

      <aside className={`webgl-lab-controls ${controlsOpen ? 'is-open' : ''}`} aria-label="原版 WebGL 材质参数">
        <div className="webgl-lab-controls-head">
          <div>
            <strong>原版参数</strong>
            <span>来自 BottomTabs 组件默认配置</span>
          </div>
          <button type="button" className="webgl-lab-close" aria-label="关闭参数面板" onClick={() => setControlsOpen(false)}>
            关闭
          </button>
        </div>

        <div className="webgl-lab-material-grid">
          {MATERIAL_ROWS.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="webgl-lab-actions">
          <button type="button" onClick={() => setActiveId('home')}>
            <RotateCcw size={17} />
            复位透镜
          </button>
        </div>

        <p className="webgl-lab-implementation-note">
          图标只保留形状，不绘制路由名称。横向拖动当前透镜后松手，使用原版速度追踪与阻尼弹簧吸附到目标项。
        </p>
      </aside>
      {controlsOpen && <button className="webgl-lab-scrim" aria-label="关闭参数面板" onClick={() => setControlsOpen(false)} />}
    </main>
  );
};
