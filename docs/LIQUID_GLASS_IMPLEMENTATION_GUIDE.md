# JZone 液态玻璃实现经验

## 1. 目的

本文记录资料库右上控件、底部 Tab、Mini 菜单和 Mini 播放器成功接入 F 液态玻璃的工程路径。以后新增液态玻璃组件时应直接复用本方案，不再复制实验室 CSS、叠加历史毛玻璃或单独维护参数。

## 2. 核心架构

### 2.1 材质组件

统一使用 `components/LiquidGlassSurface.tsx`：

- `material="shuding"`：使用 F 方案的 Shuding 圆角矩形位移轮廓。
- `material="settings"`：使用项目自适应位移轮廓。
- 两种轮廓都从 `utils/liquidGlassSettings.ts` 读取同一套高级设置。
- `LiquidGlassSurface` 只负责材质，必须作为交互内容的绝对定位底层。

```tsx
<div className="relative overflow-hidden rounded-full">
  <LiquidGlassSurface material="shuding" borderRadiusClass="rounded-full" />
  <button className="liquid-glass-interactive relative z-10">...</button>
</div>
```

### 2.2 参数单一来源

折射强度、边缘折射、模糊、饱和度、亮度、对比度、底色、高光和镜面强度只能来自 `liquidGlassSettings`。具体组件不能再次硬编码一套视觉参数。

材质轮廓和视觉参数是两个概念：

- `material="shuding"` 只决定位移图的几何算法。
- 高级设置决定这张位移图的强度和最终玻璃外观。

## 3. 移动端 SVG 兼容

原始 Shuding 方案通过 Canvas 生成位移图，再将 Data URL 写入 SVG `feImage`。部分旧 Chromium、Android WebView 和鸿蒙兼容层只读取 XLink 命名空间属性。

因此必须同时具备：

```ts
image.setAttributeNS(
  'http://www.w3.org/1999/xlink',
  'xlink:href',
  displacementMap,
);
```

以及普通 `href`。只在 JSX 中写 `xlinkHref` 不可靠，React 可能将其归一化为普通 `href`。

粗指针设备保留低成本毛玻璃 backstop。SVG 折射失败时仍能保持可读性，不能退化成纯透明控件。

## 4. Backdrop Root 规则

液态玻璃的祖先节点不能使用以下属性：

- `filter`，包括看似无效的 `filter: blur(0)`。
- 另一层 `backdrop-filter`。
- `will-change: opacity`。Chromium 会为它预建独立合成层和 Backdrop Root。
- 不必要的 mask、clip 或会建立独立合成背景的效果。

这些属性会建立新的 Backdrop Root，使液态玻璃只能采样透明祖先，表现为“有边框、没有背景折射”。需要页面背景模糊时，应放在玻璃组件的同级层，而不是祖先层。

同一页面的液态玻璃前景也禁止使用 `mix-blend-mode`。在 Chromium / Android WebView 中，混合模式会改变 SVG `backdrop-filter` 的合成顺序；项目实测结果是封面和背景折射同时消失，只剩透明底色与边缘高光。

## 5. 图标明暗自适应

液态玻璃控件外层标记 `data-liquid-control-root`，需要适配的中性图标或按钮标记 `data-liquid-adaptive="true"`。全局 `useLiquidGlassAdaptiveForeground` 会：

- 低频采样图标中心及周围的图片或背景亮度。
- 浅色背景设置深色前景，深色背景设置浅色前景。
- 使用双阈值迟滞避免临界亮度反复闪烁。
- 只过渡 `color`，不修改玻璃的 filter、backdrop-filter 或合成模式。
- 图片取样结果按 URL 缓存，滚动和拖动期间以 90ms 节流更新。

语义色图标，例如激活 Tab、删除、错误和警告，不使用 `data-liquid-adaptive`，继续保持主题红色或警告色。

## 6. 高光与层级

边缘高光来自 `.liquid-tab-f-glass`，由 `--lg-f-edge-alpha` 和 `--lg-f-specular-alpha` 控制。资料库、Mini 播放器和 Mini 菜单不得覆盖这层背景或 box-shadow，否则会再次与底部 Tab 产生视觉差异。

推荐层级：

1. 移动端兼容 backstop。
2. F 位移和玻璃底色。
3. 内容、文字和自适应图标。
4. 必要的操作状态，例如选中透镜。

## 7. 性能约束

- 一个组件只保留一个 SVG 位移材质层。
- 位移图只在尺寸或边缘折射参数变化时重建。
- 不在滚动、播放进度或 pointer move 中重新生成位移图。
- 同屏大量重复列表项不使用液态玻璃；只用于悬浮导航、播放器、菜单和关键控制组。
- 移动端不使用 DOM 截图模拟折射。

### 7.1 相邻悬浮材质的 Chromium 合成约束

两个使用 SVG URL 位移的 `backdrop-filter` 如果紧贴、重叠，或各自的滤镜采样边界相交，Chromium 可能把两个背景合成层错误复用。典型表现不是单个控件失真，而是页面封面、文字或整块背景在重绘后消失；触发一次普通重绘又可能暂时恢复。

项目对 Mini 播放器与底部 Tab 的稳定方案：

- 两者都保留独立且唯一的 `LiquidGlassSurface`。
- Mini 播放器的材质层不使用 `will-change: backdrop-filter` 预提升。
- 两个悬浮组件保持 `12-15px` 的 CSS 像素间隔；当前经三视口压力测试的基准值为 `12px`。
- 不使用 `contain: paint`、额外 `translateZ(0)` 或第二层毛玻璃强行隔离；实测这些属性会建立新的合成上下文并再次破坏背景采样。

这类故障必须通过连续切换页面、滚动和重绘压力测试验证，单张静态截图不足以证明稳定。

### 7.2 宽面板与 Q 弹动画

Shuding F 位移默认强调边缘。小圆形按钮几乎全部处于边缘区域，而 Mini 播放器和菜单中间面积较大，仅使用边缘位移会表现为“有高光、无折射”。宽面板应使用 `coverage="full"`：保留原始边缘折射，并增加平滑中心透镜。纵向菜单额外使用 `geometry="panel"` 与均衡 R/G 位移编码，按像素到矩形四边的真实距离计算边缘法线，避免长面板四角形成放射波浪。

缩放与模糊不能施加在 `LiquidGlassSurface` 或其祖先。统一使用 `LiquidGlassMotionContent`：

1. `LiquidGlassSurface` 保持静态并负责真实背景采样。
2. `data-liquid-motion-shell` 使用 `top/right/bottom/left` 插值改变整块玻璃边界，完成不会创建变换祖先的 Q 弹。
3. `liquid-glass-elastic-rim` 与内容兄弟层同步完成轮廓、`scale + blur + opacity` 动画。
4. 菜单关闭时先反向模糊和缩小，再由调用方卸载。

该结构既保留 iOS 风格的可见形变，也不会让动画层成为新的 Backdrop Root。

## 8. 新组件接入清单

- [ ] 外层具有明确尺寸、圆角和 `overflow-hidden`。
- [ ] 只挂载一个 `LiquidGlassSurface`。
- [ ] 内容使用 `relative z-10`。
- [ ] 外层标记 `data-liquid-control-root`，中性图标标记 `data-liquid-adaptive="true"`。
- [ ] 语义色图标排除自动反相。
- [ ] 页面不存在为图标适配而添加的 `mix-blend-mode`。
- [ ] 祖先不存在 `filter` 或第二层 `backdrop-filter`。
- [ ] 采样根不存在 `will-change: opacity`，位置动画只声明 `left, top`。
- [ ] 参数从高级设置同步变化。
- [ ] 与其他 SVG 液态玻璃悬浮层保持经压力测试验证的 `12-15px` 间隔。
- [ ] 安卓 / 鸿蒙至少能显示毛玻璃兜底。
- [ ] 桌面和移动尺寸完成截图与控制台检查。
