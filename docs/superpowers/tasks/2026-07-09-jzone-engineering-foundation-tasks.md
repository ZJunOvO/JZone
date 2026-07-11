# JZone 工程地基整理 Tasks

来源计划：`docs/superpowers/plans/2026-07-09-jzone-engineering-foundation.md`

## 执行原则

- 每批只做一种边界拆分，避免视觉、数据、路由同时变化。
- 保持向后兼容：旧入口、旧 API、旧 CSS 类名在迁移期继续可用。
- 每个 Task 完成后必须执行 `npm run typecheck` 和 `npm run build`。
- 未完成远程数据库迁移前，不把依赖新 SQL 的前端行为标记为线上完成。

## 当前批次

### Task 1：抽离 App Shell，不改变行为

- 状态：已完成
- 目标：把 `App.tsx` 中的全屏策略、路由状态、主布局拆到独立文件。
- 文件：
  - `hooks/useAutoFullscreen.ts`
  - `hooks/useAppRoute.ts`
  - `components/layout/AppShell.tsx`
  - `App.tsx`
- 验证：
  - [x] `npm run typecheck`
  - [x] `npm run build`

### Task 2：抽离 BottomNavigation

- 状态：已完成
- 目标：把底部 tab 手势和液态玻璃导航从应用入口中拆出去。
- 验证：
  - [x] `npm run typecheck`
  - [x] `npm run build`
  - [x] `npm run smoke:auth`
  - [ ] 手动验证 tab 拖动切换

### Task 3：拆分 Supabase facade 内部实现

- 状态：完成
- 目标：保留 `supabaseApi` 兼容入口，把实现拆到 `services/supabase/*`。
- 进度：
  - [x] 第一刀：根目录 `supabaseApi.ts` 已变为兼容 facade。
  - [x] 第一刀：原实现已迁入 `services/supabase/supabaseApiImpl.ts`。
  - [x] 第二刀：缓存、请求去重、集合变更事件已拆到 `services/supabase/cache.ts`。
  - [x] 第二刀：COS 签名 URL 与路径归一化已拆到 `services/supabase/storageApi.ts`。
  - [x] 第三刀：Supabase 行类型已拆到 `services/supabase/types.ts`，根入口继续导出兼容。
  - [x] 第三刀：集合业务已拆到 `services/supabase/collections.ts`。
  - [x] 第三刀：Supabase 配置检查与 client ensure 已拆到 `services/supabase/client.ts`。
  - [x] 第三刀：歌曲业务已拆到 `services/supabase/songs.ts`。
  - [x] 第三刀：评论、评论点赞、收藏等互动业务已拆到 `services/supabase/interactions.ts`。
  - [x] 第三刀：个人资料业务已拆到 `services/supabase/profiles.ts`。
- 验证：
  - [x] `npm run typecheck`
  - [x] `npm run build`
  - [x] `npm run smoke:auth`
  - [x] `npm run smoke:collection`

### Task 4：拆分 Profile 页面

- 状态：已完成
- 目标：把个人页的作品、合集、设置拆成组件，降低单文件复杂度。
- 进度：
  - [x] 创作/收藏内容区已拆到 `components/profile/ProfileContent.tsx`。
  - [x] 自定义背景 Bottom Sheet 已拆到 `components/profile/ProfileBackgroundSheet.tsx`。
  - [x] 设置 Bottom Sheet 与液态玻璃预览已拆到 `components/profile/ProfileSettingsSheet.tsx`。
  - [x] `pages/Profile.tsx` 主体已压缩到约 693 行。
- 验证：
  - [x] `npm run typecheck`
  - [x] `npm run build`

### Task 5：拆分全局 CSS

- 状态：已完成
- 目标：把玻璃材质、导航、登录、动画样式从 `index.css` 拆分。
- 文件：
  - `styles/auth.css`
  - `styles/liquid-navigation.css`
  - `styles/profile-glass-preview.css`
  - `styles/glass-materials.css`
- 验证：
  - [x] `npm run typecheck`
  - [x] `npm run build`
  - [x] `npm run smoke:auth`
  - [x] 临时 Playwright 验证个人页设置、液态玻璃面板、背景面板

### Task 6：补充重构安全 smoke 测试

- 状态：已完成
- 目标：补集合详情流程 smoke，避免后续拆分破坏导航/详情页。
- 文件：
  - `scripts/smoke-collection-detail.mjs`
  - `package.json` 新增 `smoke:collection`
- 验证：
  - [x] `npm run check`
  - [x] `npm run smoke:auth`
  - [x] `npm run smoke:collection`
