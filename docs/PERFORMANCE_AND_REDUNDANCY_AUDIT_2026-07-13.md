# 性能与冗余审查（2026-07-13）

## 审查范围

- 现在就听头像到个人页头像的共享元素连续性与帧率。
- 液态玻璃前景自适应、SVG 位移图缓存和播放器动画热点。
- 未引用文件、导出与依赖；仅删除有静态引用和运行时加载证据支持的项目。

## 已完成优化

1. 首页头像转场改为单覆盖层 FLIP，只动画 `transform/opacity`。覆盖层先提交一帧再导航；个人页目标在运动期间隐藏，完成后恢复。
2. 个人页模块和不可见 DOM 在首页后台准备，激活前后使用同一坐标系；隐藏态设置 `inert`，不会进入键盘焦点或响应指针。
3. 头像转场期间暂停个人页与常驻液态玻璃的高成本背景采样，避免全屏模糊和多个 SVG `backdrop-filter` 同帧栅格化。
4. 液态玻璃前景采样不再监听 Framer Motion 每帧写入的 `style/class`，移除 900ms 轮询；仅在结构、图片、滚动、尺寸和真实拖动变化后合并刷新，并禁止异步采样重入。
5. 图片亮度缓存限制为 48 项，SVG 位移图缓存限制为 32 项，避免签名 URL 和尺寸变化长期占用内存。
6. 全屏播放器的六组控制区和换曲封面不再逐帧插值 `filter: blur()`，保留位移、透明度、缩放与旋转。

## 冗余清理

- 删除已无入口和引用的 `CoverFlowPlayer`、`MinimalPlayer`、`VinylPlayer` 三套旧皮肤组件。
- 删除已被独立 FLIP/播放器时间轴替代的 `utils/viewTransition.ts`。
- 删除未使用的反馈 Context Hook、共享元素 ID、转码预加载导出及其他无引用导出。
- 移除未被源码或运行时 URL 使用的 `@ffmpeg/core` npm 依赖；继续保留实际使用的 `@ffmpeg/ffmpeg`、`@ffmpeg/util` 和自托管核心文件。

## 明确保留

- `public/sw.js` 由浏览器 Service Worker 注册路径加载，不能按静态 import 结果删除。
- `public/ffmpeg-core/ffmpeg-core.js` 由转码器运行时 URL 加载，不能按 Knip 报告删除。
- 播放器 `skin` 数据字段继续保留，用于旧数据向后兼容；只移除无入口的旧 UI 实现。

## 验证结果

- `npm run check`：TypeScript 与生产构建通过。
- `npm run smoke:shared`：头像无重复、无空档，目标在过渡中隐藏，P95 帧间隔 33.3ms；播放器连续开关 10 次无残留。
- `npm run smoke:glass`：Mini 播放器、Mini 菜单位移图和自适应前景通过。
- `npm run smoke:player-transition`：完整打开、关闭、换曲、暂停阴影和五轮快速反向通过；优化后普通打开 P95 从约 49.9ms 降至 33.3ms。
- `npm run smoke:comments`：分页、回复、删除、排序、长评论、分享图和静默刷新通过。
- `npm run smoke:upload-metadata`：真实 5.95MB M4A 和录制日期标签通过。
- Knip 仅报告上述两个运行时公开资源，没有其他未引用文件、导出或依赖。

## 残余风险

- Headless Chromium 在五轮快速反向播放器压力测试中仍有极少量约 50ms 帧，但未形成连续长帧，也没有状态、节点或折射残留。真机应继续观察低性能鸿蒙设备；不要为追求单次实验数字恢复大面积 `will-change` 或复制常驻层。
