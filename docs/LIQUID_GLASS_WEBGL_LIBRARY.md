# WebGL 液态玻璃组件库

## 结论

项目可以使用这套技术。当前 Lab 已直接使用本地完整渲染核心，而不是 CSS 近似效果。底部 Tab 保留 JZone 的四个图标，不显示路由名称，容器材质、活动透镜、拖动跟手、速度追踪和弹簧吸附均来自完整实现。

## 目录

- `packages/jzone-liquid-glass/src/context.tsx`：React Canvas 生命周期和指针事件桥接。
- `packages/jzone-liquid-glass/src/renderer`：WebGL 渲染、折射、模糊、高光、阴影和动画。
- `packages/jzone-liquid-glass/src/shaders`：着色器。
- `packages/jzone-liquid-glass/src/shapes`：连续圆角和 SDF。
- `packages/jzone-liquid-glass/src/catalog`：全部示例组件构建器。
- `packages/jzone-liquid-glass/src/bottom-tabs`：JZone 可直接使用的无文字底部 Tab。

## 接入规则

1. 一个视觉表面共享一个 `LiquidGlassCanvas`，把多个玻璃元素一次提交。
2. 折射背景必须与玻璃位于同一 WebGL 合成场景，或先作为纹理输入。
3. DOM 业务内容不能被 WebGL 自动读取。主应用实装时应选择“WebGL 绘制同源背景纹理”或建立受控纹理桥接，不能再叠一层 CSS 毛玻璃假装折射。
4. 移动端先使用默认 `dpr=1.25` 和 `blurTapCap=17`，实机稳定后再提高精度。
5. 保留 DOM 语义按钮作为无障碍与路由回退层，视觉由 Canvas 绘制。

## 原版 Bottom Tabs 默认值

| 项目 | 默认值 |
| --- | --- |
| 容器高度 / 圆角 | `64 / 32px` |
| 内层高度 / 圆角 | `56 / 28px` |
| 容器折射高度 / 强度 | `24 / -24px` |
| 容器模糊 / 饱和度 | `8px / 1.5` |
| 透镜折射高度 / 强度 | `10 / -14px` |
| 透镜模糊 | `0px` |
| 透镜按压缩放 | `78 / 56` |

## 正式项目迁移建议

先在 Lab 完成手机端视觉和帧率验收，再只替换主程序底部 Tab。Mini 播放器和菜单要分别建立同场景纹理方案，不能简单复制 Tab Canvas，否则会出现额外 WebGL 上下文、重复背景读取和掉帧。
