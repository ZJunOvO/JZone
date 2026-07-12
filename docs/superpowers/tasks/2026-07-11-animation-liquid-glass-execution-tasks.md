# JZone Animation And Liquid Glass Execution Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏 Chromium 背景采样的前提下实现可见的 iOS 26 风格缩放、模糊与 Q 弹动效，并按 PRD 逐批补齐共享元素、导航、操作反馈和播放沉浸体验。

**Architecture:** F 材质固定在无 `transform`、`filter`、`will-change: opacity` 的采样根中；整块玻璃以 inset 几何插值 Q 弹，缩放和模糊只作用于兄弟内容层。所有悬浮玻璃继续使用 `LiquidGlassSurface(material="shuding")` 和统一高级参数，Mini 播放器与底部 Tab 的最终间距为 12px。

**Tech Stack:** React 18、TypeScript、Framer Motion 10、CSS/SVG backdrop-filter、Vite、Playwright。

---

## Task 0：冻结当前官方版本

**Files:**
- Verify: entire repository

- [x] **Step 1: 运行生产检查**

Run: `npm run check`

Expected: TypeScript 和 Vite production build 均通过。

- [x] **Step 2: 排除生成物与敏感测试数据**

Run: `git diff --check`，并搜索测试账号、密码、Service Role 与私钥标记。

Expected: 无 diff 格式错误，正式源码中无测试凭据和私钥。

- [x] **Step 3: 创建官方快照并推送**

Run: `git push -u origin codex/official-snapshot-20260711`

Expected: 远端分支指向提交 `dcb85f6`，后续开发不修改该分支。

## Task 1：合成安全的弹性玻璃内容层

**Files:**
- Create: `components/LiquidGlassMotionContent.tsx`
- Modify: `styles/glass-materials.css`
- Modify: `docs/LIQUID_GLASS_IMPLEMENTATION_GUIDE.md`

- [x] **Step 1: 建立共享动效组件**

组件必须把 `LiquidGlassSurface`、弹性轮廓和内容分成兄弟层；仅内容与轮廓使用 `scale` / `filter`，材质层及其祖先不使用这些属性。菜单采用约 520ms 的 `0.84 → 1.035 → 1` 视觉节奏，播放器采用约 440ms 的 `0.92 → 1.02 → 1` 节奏。

- [x] **Step 2: 增加减少动态效果降级**

`prefers-reduced-motion: reduce` 下关闭缩放和模糊，只保留 140ms 透明度过渡。

- [x] **Step 3: 验证材质和内容层边界**

Run: `rg -n "LiquidGlassMotionContent|liquid-glass-elastic-rim" components styles`

Expected: 共享组件只有一个材质层，弹性层不包含第二个 `backdrop-filter`。

## Task 2：Mini 播放器真实 F 折射

**Files:**
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/PlayerBar.tsx`
- Modify: `styles/liquid-navigation.css`

- [x] **Step 1: 移除播放器玻璃的变换祖先**

`AppShell` 使用 `left: 12px; right: 12px; margin-inline: auto; max-width` 居中，删除 `x: -50%`、`transform-gpu` 和 `willChange: transform`。位置变化只动画 `top`、`bottom`、`width` 和 `opacity`。

- [x] **Step 2: 接入共享 Q 弹层**

`PlayerBar` 保持唯一 `LiquidGlassSurface(material="shuding")`，封面、文字、控制和进度条放入 `LiquidGlassMotionContent`，入场有可见缩放与模糊消散。

- [x] **Step 3: 调整播放器与 Tab 间距**

最终使用 12px，对应当前导航尺寸下播放器 `bottom: 92px`；已通过 390×844、430×932 和 1440×900 三视口压力测试。

- [x] **Step 4: 检查实际背景采样**

浏览器中读取 `.liquid-mini-player .liquid-tab-f-glass` 的 `backdrop-filter`，必须同时包含 SVG URL、blur、contrast、brightness 和 saturate，截图中下方封面边界必须发生折射而不是仅有高光。

## Task 3：Mini 菜单真实 F 折射与慢速 Q 弹

**Files:**
- Modify: `components/UniversalContextMenu.tsx`
- Modify: `components/CollectionContextMenu.tsx`
- Modify: `pages/Library.tsx`
- Modify: `styles/glass-materials.css`

- [x] **Step 1: 删除菜单材质根的 transform 动画**

移除 `liquid-context-menu-panel--enter` 对面板根的缩放；菜单位置切换只使用 `left/top` 弹簧。实测并移除会建立 Backdrop Root 的 `will-change: opacity`，采样根只保留 `will-change: left, top`。

- [x] **Step 2: 三类菜单接入共享 Q 弹层**

通用歌曲菜单、合集菜单和资料库新建菜单全部复用 `LiquidGlassMotionContent`。整块材质壳使用 inset 几何执行约 840ms 的 Q 弹，内容从模糊 18px、缩放状态过渡到清晰状态；关闭约 680ms 并按相反顺序完成。菜单使用 `panel` 几何消除长面板角落放射波纹。

- [x] **Step 3: 保留锚点连续性**

从一首歌曲长按切换到另一首时只平移到新锚点，不重新卸载材质；上下边缘继续使用菜单项反转和目标歌曲高亮说明归属。

- [x] **Step 4: 验证没有全屏模糊**

浏览器断言 `.mini-modal-backdrop` 数量为 0，固定全屏容器自身的 `backdrop-filter` 与 `filter` 均为 `none`，只有菜单内容层在动画期间出现 blur。

## Task 4：共享元素第一批

**Files:**
- Create: `components/motion/SharedElementLayer.tsx`
- Create: `components/motion/sharedElementRegistry.ts`
- Modify: `pages/Home.tsx`
- Modify: `pages/Profile.tsx`
- Modify: `components/PlayerBar.tsx`
- Modify: `pages/PlayerView.tsx`
- Modify: `pages/CollectionDetailPage.tsx`

- [x] **Step 1: 建立共享对象注册表**

以稳定对象 ID 注册头像、歌曲封面和合集封面的来源/目标 DOMRect，不使用数组下标或显示名称作为身份。

- [x] **Step 2: 完成头像与播放器两条路径**

先实现现在就听头像 ↔ 个人页头像、Mini 播放器 ↔ 全屏播放页；返回时沿原路径逆向收拢，目标离屏时退化为 180ms 淡入淡出。

- [x] **Step 3: 完成封面与合集路径**

实现 Mini 播放器封面 ↔ 播放页以及歌单/专辑封面 ↔ 合集详情页。歌曲列表点击仍遵循“先开始播放并进入 Mini 播放器”的产品路径，不强制打开全屏页；播放页与合集详情代码在来源页提前预加载，避免首次懒加载错过共享窗口。

- [x] **Step 4: 回归快速往返**

连续前进/返回 10 次，Expected: 无残留克隆层、无历史页面闪回、焦点回到触发元素。

## Task 5：导航、布局和操作反馈

**Files:**
- Create: `components/motion/PageTransition.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/LibraryCanvas.tsx`
- Modify: `components/AddSongToCollectionDialog.tsx`
- Modify: `components/upload/UploadEditor.tsx`
- Modify: `components/UniversalContextMenu.tsx`

- [ ] **Step 1: 统一四核心页面转场**

使用 280ms、最大 16px 的低位移淡入；切换可中断且不依赖动画结束才能更新业务状态。

- [ ] **Step 2: 统一列表/Bento 容器转换**

只过渡容器和已存在对象，不修改 Bento 内部拖拽、缩放和布局缓存逻辑。

- [ ] **Step 3: 增加操作占位反馈**

加入歌单/专辑和上传队列按提交歌曲数插入等量骨架项；远程成功后真实内容接管位置，失败时原位恢复并显示统一反馈。

- [ ] **Step 4: 完成原位状态反馈**

收藏、公开/私有和置顶只更新当前操作点，不触发整页重新拉取或滚动位置变化。

## Task 6：播放沉浸动效

**Files:**
- Modify: `components/PlayerBar.tsx`
- Modify: `pages/PlayerView.tsx`
- Modify: `components/WaveformCropper.tsx`
- Modify: `store.tsx`

- [ ] **Step 1: 播放/暂停轮廓转换**

在固定 24px 图标框内交叉变形，控制按钮尺寸和点击区域不发生布局偏移。

- [ ] **Step 2: 同步 Mini 与全屏状态**

封面、主题背景和播放状态使用同一时间戳驱动，页面展开期间播放进度不得跳变。

- [ ] **Step 3: 进度条实时跟手**

拖动只更新本地预览时间，松手调用一次 seek；取消拖动恢复真实播放位置。

- [ ] **Step 4: 保持歌词阶段独立**

本批不引入歌词解析或逐行动画，避免扩大播放内核改动范围。

## Task 7：自动化与实机回归

**Files:**
- Create: `scripts/smoke-liquid-glass.mjs`
- Modify: `package.json`
- Modify: `docs/ANIMATION_AND_LIQUID_GLASS_PRD.md`
- Modify: `docs/PROJECT_MAP_2026-07-09.md`

- [x] **Step 1: 建立玻璃合成冒烟脚本**

脚本从 `JZONE_TEST_EMAIL`、`JZONE_TEST_PASSWORD` 和 `JZONE_BASE_URL` 读取环境变量，播放一首歌曲后连续切换四个 Tab 三轮，检查 Mini 播放器、底部 Tab 和菜单的 SVG backdrop URL、12px 间距、`panel` 几何、Backdrop Root、安全可见图片数量和控制台错误。

另建 `smoke:shared` 验证头像、播放器和合集封面共享过渡、返回焦点及播放器连续往返 10 次无残留节点。

- [ ] **Step 2: 运行完整自动回归**

Run: `npm run check && npm run smoke:auth && npm run smoke:collection && npm run smoke:glass`

Expected: 全部 exit 0，无 console error、HTTP 4xx/5xx 或页面内容消失。

当前结果：`check`、`smoke:auth`、`smoke:glass` 已通过；`smoke:collection` 的进入与返回流程通过，但发现一条历史 COS 专辑封面返回 404，因此本步骤保留未完成，后续清理失效资源后复测。

- [x] **Step 3: 完成桌面和移动截图**

至少验证 390×844、430×932 和 1440×900；截图必须显示 Mini 播放器、底部 Tab、菜单及其背后的高对比封面区域。

- [ ] **Step 4: 完成实机矩阵**

安卓 Edge 验证 SVG 折射与 60 FPS 体感；鸿蒙兼容层验证折射或清晰毛玻璃降级；iOS Safari 验证安全区和降级，不允许纯透明不可读状态。

- [ ] **Step 5: 更新工程地图**

记录共享动效组件、材质边界、测试入口和浏览器降级规则，确保后续开发者不再把动画 transform 放到玻璃采样祖先。
