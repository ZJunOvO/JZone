# JZone Liquid Glass WebGL

项目内可复制的 React WebGL 液态玻璃组件包。它保留完整的折射、分离模糊、连续圆角、高光、阴影、弹簧、速度追踪和拖动手势实现。

## 使用底部 Tab

```tsx
import {
  LiquidGlassBottomTabsCanvas,
  type LiquidGlassBottomTabItem,
} from './packages/jzone-liquid-glass/src';

const items: LiquidGlassBottomTabItem[] = [
  { id: 'home', label: '首页', icon: playIcon },
  { id: 'library', label: '资料库', icon: listIcon },
];

<LiquidGlassBottomTabsCanvas
  items={items}
  activeId={activeId}
  onChange={setActiveId}
  wallpaperSrc="/liquid-glass-webgl/wallpaper/wallpaper_light.webp"
/>
```

默认材质与组件展示页一致：容器高度 `64px`、内层与透镜高度 `56px`、容器折射 `24/-24`、模糊 `8px`、饱和度 `1.5`；透镜折射 `10/-14`，默认不额外模糊。

## 使用完整组件目录

`src/catalog.tsx` 暴露完整展示目录，包含 Buttons、Toggle、Slider、Bottom Tabs、Dialog、Lock Screen、Control Center、Magnifier、Progressive Blur、Scroll Container 和 Settings。底层配置可以直接组合 `GlassElementConfig[]` 后交给 `LiquidGlassCanvas`。

```tsx
import { LiquidGlassCanvas, buildButtons } from './packages/jzone-liquid-glass/src';

const result = buildButtons(width, height, onBack, palette);

<LiquidGlassCanvas
  wallpaperSrc={wallpaperSrc}
  elements={result.elements}
  interactions={result.interactions}
/>
```

公开 API 分为三层：

- 成品组件：`LiquidGlassBottomTabsCanvas`。
- 页面构建器：`buildButtons`、`buildToggle`、`buildSlider`、`buildDialog`、`buildMagnifier` 等。
- 材质工厂：`makeGlassShape`、`makeButton`、`makeLiquidSlider`、`makeText`。

新组件优先由材质工厂组合，避免复制着色器或自行叠加 CSS 毛玻璃层。需要复刻完整示例时再使用页面构建器。

## 重要边界

- 这是 Canvas/WebGL 合成器，不是 CSS `backdrop-filter`。折射对象必须存在于同一 WebGL 场景或作为纹理输入。
- 不要为每个列表项创建独立 WebGL 上下文。页面应共享一个 Canvas，并批量提交玻璃元素。
- 默认 DPR 上限和模糊采样上限用于移动端性能控制；需要更高画质时再显式提高。
- `public/liquid-glass-webgl/clock_sdf.webp` 是完整组件目录中时钟演示的 SDF 资源。
- 页面卸载时由 `LiquidGlassCanvas` 统一销毁 WebGL 资源；不要绕过组件直接持有裸上下文。
