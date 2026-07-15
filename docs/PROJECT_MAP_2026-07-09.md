# JZone 项目地图（2026-07-09）

本文档用于帮助后续维护者快速理解当前工程拆分状态。它不是需求清单，而是代码入口和模块边界地图。

## 应用入口

- `index.tsx`：React 挂载入口，负责注册应用到 DOM。
- `App.tsx`：轻量入口，只负责挂载 `AuthProvider`、`AppProvider`、`ErrorBoundary`、`AuthGate` 和 `AppShell`。
- `components/layout/AppShell.tsx`：登录后的应用外壳，负责核心页面切换、mini player、全屏播放器、PWA 安装提示。
- `hooks/useAppRoute.ts`：应用内路由状态，处理首页、资料库、创作、个人页、集合详情页的切换。
- `hooks/useAutoFullscreen.ts`：进入页面后的自动全屏策略。
- `components/navigation/BottomNavigation.tsx`：底部 tab、手势切换、液态玻璃导航材质。

## 四个核心页面

- `pages/Home.tsx`：现在就听。
- `pages/Library.tsx`：资料库；注意 bento 视图暂时不要改动。
- `pages/Upload.tsx`：创作/上传工作台。
- `pages/Profile.tsx`：个人页容器，当前只保留个人页状态编排、资料加载、模态框挂载。

## 个人页拆分

- `components/ProfileHeader.tsx`：个人页头图、头像、状态、身份信息和头部操作。
- `components/EditProfileModal.tsx`：编辑资料。
- `components/profile/ProfileContent.tsx`：创作/收藏内容区，包含收录、专辑、歌单、收藏列表。
- `components/profile/ProfileBackgroundSheet.tsx`：自定义背景 Bottom Sheet，包含背景风格、上传背景、恢复默认。
- `components/profile/ProfileSettingsSheet.tsx`：设置 Bottom Sheet，包含背景模糊度、液态玻璃参数预览/调节、编辑资料、切换背景、退出登录。

## Supabase 访问层

- `supabaseApi.ts`：兼容入口，只 re-export `services/supabase`，旧 import 仍然可用。
- `services/supabase/index.ts`：Supabase 服务层统一导出。
- `services/supabase/client.ts`：Supabase 是否启用判断和 client ensure。
- `services/supabase/supabaseApiImpl.ts`：兼容组合入口，只组合各业务域、代理签名 URL、统一清理缓存。
- `services/supabase/collections.ts`：集合业务域，包含专辑/歌单列表、创建、歌曲关联、详情、封面上传、更新、删除。
- `services/supabase/songs.ts`：歌曲业务域，包含歌曲列表、上传建档、歌曲更新、播放计数、删歌、歌曲封面上传。
- `services/supabase/interactions.ts`：互动业务域，包含评论列表、评论点赞、收藏/取消收藏、发表评论。
- `services/supabase/profiles.ts`：个人资料业务域，包含资料读取、艺人资料列表、头像/封面上传、资料更新。
- `services/supabase/types.ts`：数据库行类型和可见性类型。
- `services/supabase/cache.ts`：前端 API 缓存、请求去重、集合变更事件。
- `services/supabase/storageApi.ts`：COS 签名 URL、Supabase public URL/COS URL 路径归一化。

## 上传与转码

- `components/upload/UploadEditor.tsx`：上传后的编辑流程 UI。
- `components/upload/useUploadDraft.ts`：上传草稿、文件读取、草稿保活相关逻辑。
- `components/upload/useUploadSave.ts`：保存上传歌曲。
- `components/upload/ArtistPicker.tsx`：艺人选择/自定义输入。
- `utils/uploadAudio.ts`：上传音频文件类型、扩展名和音频辅助逻辑。
- `utils/audioTranscode.ts`：浏览器端音频转码辅助。
- `public/ffmpeg-core/`：本地 FFmpeg WASM 资源。

## 集合与关系

- `pages/CollectionDetailPage.tsx`：专辑/歌单详情页。
- `components/AddSongToCollectionDialog.tsx`：把歌曲加入歌单/专辑。
- `components/CollectionContextMenu.tsx`：集合更多菜单。
- `components/CollectionCreatableSelect.tsx`：集合选择/创建输入。
- `components/CreateCollectionModal.tsx`：新建专辑/歌单。
- `components/EditCollectionModal.tsx`：编辑专辑/歌单。
- `supabase/sql/016_collection_collaborator_permissions.sql`：集合协作者权限迁移，已于 2026-07-10 远程应用并确认权限 RPC、增删 RPC 与协作者策略存在。

## 视觉与材质

- `index.css`：全局样式入口，保留 Tailwind、安全区工具类和暂未拆出的页面/实验样式。
- `styles/auth.css`：登录页流光背景、登录卡片外层光效。
- `styles/liquid-navigation.css`：底部导航液态玻璃材质、tab 透镜样式。
- `styles/profile-glass-preview.css`：个人页设置里的液态玻璃实时预览。
- `styles/glass-materials.css`：Mini 播放器、Mini 菜单等共用 F 材质外壳与 Q 弹动画；菜单采样根禁止 `will-change: opacity`。
- `utils/liquidGlassSettings.ts`：液态玻璃默认参数、存储、事件同步、CSS 变量。
- `utils/liquidGlassDisplacement.ts`：SVG displacement map 生成逻辑，含宽播放器和纵向菜单 `panel` 几何。
- `components/LiquidGlassMotionContent.tsx`：保持采样层静态，以 inset 几何驱动整块玻璃 Q 弹；液态材质、折射和高光从首帧持续可见，文字图标独立执行模糊入场。
- `components/motion/sharedElementRegistry.ts`：合集封面的稳定共享对象 ID 与弹簧参数。
- `components/motion/SharedElementLayer.tsx`：全局 Framer Motion `LayoutGroup` 与减少动态效果策略。
- `components/motion/playerTransition.ts`：播放器容器三段展开/收拢曲线、来源边界和封面/文字共享时间轴。
- `components/motion/ProfileAvatarRouteTransition.tsx`：现在就听与个人页头像之间的双向单覆盖层 FLIP 转场；进入个人页时放大到个人头像，返回现在就听时缩小到右上角头像，终点均以真实头像和覆盖层交叉淡出避免闪帧。
- `components/motion/profileAvatarTransition.ts`：统一采集头像源边界、声明转场目的地、提交覆盖层并延后一帧导航；共享动画严格限定于 Home 右上角头像与个人页头像之间，资料库和创作进入个人页只执行普通路由切换。
- `components/motion/PlayerArtworkTransition.tsx`：全屏播放器切歌时的新旧封面交接层，连续切歌后主动清理旧节点。
- `pages/PlayerView.tsx`：全屏播放器和共享转场目标；打开时使用单个小面积模糊幕布覆盖进度与控制区，结束后 `display:none`，不保留透明合成层。
- `components/PlayerBar.tsx`：mini player。
- `components/UniversalContextMenu.tsx`：歌曲 mini 菜单。

## PWA

- `public/manifest.webmanifest`：PWA manifest。
- `public/sw.js`：Service Worker。
- `utils/registerServiceWorker.ts`：注册 Service Worker。
- `components/PwaInstallPrompt.tsx`：安装引导。
- `vite.config.ts`：PWA/构建相关配置。

## 自动化回归

- `npm run check`：执行 `tsc --noEmit` 和 `vite build`。
- `npm run smoke:auth`：登录并切换四个底部核心 tab。
- `npm run smoke:collection`：登录后从个人页打开第一个专辑/歌单详情并返回；如果当前账号没有集合，会明确输出 skipped。
- `npm run smoke:glass`：验证播放器/菜单 SVG 折射、`panel` 几何、Backdrop Root、12px 间距和三视口稳定性。
- `npm run smoke:shared`：验证头像、播放器、合集共享过渡、焦点恢复及播放器连续往返 10 次无残留。
- `npm run smoke:player-transition`：采样展开、收拢和交接区，验证裁剪边界、进度绑定背景透明度、文字等比矩阵，以及封面和 Mini 的弹簧峰值/最终收敛；另连续快速反向 5 轮，检查方向无闪跳、Mini SVG 折射不中断、关闭后焦点恢复，并用独立探针记录帧预算。

## 当前工程任务状态

- 已完成：App Shell 抽离、BottomNavigation 抽离、Supabase client/cache/storage/types/collections/songs/interactions/profiles 拆分、Profile 页面拆分、全局 CSS 拆分、集合详情 smoke 测试补充。
- 进行中：大拆分后的回归审查。
- 待执行：完整回归审查中发现的问题修复。

## 维护注意事项

- 不要直接删除旧入口 `supabaseApi.ts`，它是兼容层。
- 不要在资料库 bento 视图上做顺手改动。
- 不要把未执行到远程 Supabase 的 SQL 当成线上已生效。
- 修改上传链路后必须手动走“选择文件 -> 编辑信息 -> 预览 -> 保存 -> 播放”的完整流程。
- 修改导航、Mini 播放器、Mini 菜单时，要同时检查 `styles/glass-materials.css`、`utils/liquidGlassSettings.ts` 和 `LiquidGlassSurface` 参数同步；禁止在采样根增加 transform、filter 或 `will-change: opacity`。
