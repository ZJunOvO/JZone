# JZone 本地优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不优先处理安全架构重构的前提下，修复当前本地最新版项目里的类型检查、文件一致性、核心流程可靠性、导航可访问性、性能和日常体验问题。

**Architecture:** 先恢复工程健康度，让 `typecheck` 成为稳定基线；再把上传、删除、导航、缓存这几个高频路径做成可验证的小改动；最后处理包体积、外链资源和大型组件拆分。安全问题单独排到后置阶段，避免当前优化被 COS/RLS 后端改造拖住。

**Tech Stack:** React 18、TypeScript 5、Vite 6、Tailwind CSS、Supabase JS、腾讯云 COS SDK、Playwright 手工烟测。

---

## 执行原则

- 每个 Task 单独完成、单独验证、单独提交。
- 不执行 `pull` / `push`，除非用户明确要求。
- 当前计划优先处理个人小范围使用体验，不把商业化、多租户运营、复杂权限后台作为当前目标。
- 安全项只记录为后续阶段：COS 永久密钥、RLS policy、服务端删除代理、RPC execute 权限不在第一批执行。

## 文件结构映射

- Modify: `package.json`，补充 `typecheck` / `check` 脚本。
- Create: `vite-env.d.ts`，声明 Vite 环境变量类型。
- Modify: `components/ErrorBoundary.tsx`，修复 React class 组件 props 类型。
- Rename: `components/editsongmodal.tsx` -> `components/EditSongModal.tsx`。
- Rename: `components/universalcontextmenu.tsx` -> `components/UniversalContextMenu.tsx`。
- Modify: `App.tsx`，底部导航补充语义标签和稳定测试属性。
- Modify: `pages/Upload.tsx`、`components/UploadModal.tsx`，修复 idle callback 类型问题，并逐步抽共享上传逻辑。
- Create: `hooks/useUploadFlow.ts`，沉淀上传页面和上传弹窗的共享状态与保存流程。
- Modify: `store.tsx`，修复跨账号缓存、删除失败回滚、收藏失败反馈。
- Modify: `components/LibraryCanvas.tsx`，移除 404 外链噪点图，收紧 memo 比较。
- Modify: `vite.config.ts`，移除不必要的浏览器侧 `GEMINI_API_KEY` 注入，增加合理 chunk 拆分。
- Create: `docs/TESTING_LOCAL.md`，记录本地测试账号使用方式、烟测路径和注意事项；不写入明文密码。

---

### Task 1: 建立工程健康基线

**Files:**
- Modify: `package.json`
- Create: `vite-env.d.ts`
- Modify: `components/ErrorBoundary.tsx`

- [ ] **Step 1: 给 `package.json` 增加检查脚本**

把 scripts 改成：

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "check": "npm run typecheck && npm run build"
}
```

- [ ] **Step 2: 创建 Vite 环境变量类型文件**

Create `vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_COS_SECRET_ID?: string;
  readonly VITE_COS_SECRET_KEY?: string;
  readonly VITE_COS_BUCKET?: string;
  readonly VITE_COS_REGION?: string;
  readonly VITE_ENABLE_SIGNUP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: 修复 ErrorBoundary props 类型**

把 `components/ErrorBoundary.tsx` class 定义改成显式 Props：

```tsx
type ErrorBoundaryProps = {
  children: React.ReactNode;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
```

- [ ] **Step 4: 验证类型检查剩余错误**

Run:

```bash
npm run typecheck
```

Expected:

```text
仍可能失败，但 import.meta.env 和 ErrorBoundary props 错误应消失。
```

- [ ] **Step 5: Commit**

```bash
git add package.json vite-env.d.ts components/ErrorBoundary.tsx
git commit -m "chore: add typecheck baseline"
```

---

### Task 2: 修复 Windows/Linux 文件大小写一致性

**Files:**
- Rename: `components/editsongmodal.tsx` -> `components/EditSongModal.tsx`
- Rename: `components/universalcontextmenu.tsx` -> `components/UniversalContextMenu.tsx`
- Modify: imports that reference these files

- [ ] **Step 1: 用 git mv 做两次大小写安全重命名**

Run:

```bash
git mv components/editsongmodal.tsx components/EditSongModal.tmp.tsx
git mv components/EditSongModal.tmp.tsx components/EditSongModal.tsx
git mv components/universalcontextmenu.tsx components/UniversalContextMenu.tmp.tsx
git mv components/UniversalContextMenu.tmp.tsx components/UniversalContextMenu.tsx
```

- [ ] **Step 2: 更新引用路径**

Run:

```bash
rg -n "editsongmodal|EditSongModal|universalcontextmenu|UniversalContextMenu" .
```

Expected import shape:

```ts
import { EditSongModal } from './EditSongModal';
import { UniversalContextMenu } from './UniversalContextMenu';
```

- [ ] **Step 3: 验证大小写问题已消失**

Run:

```bash
npm run typecheck
```

Expected:

```text
不再出现 TS1261 already included file name differs only in casing。
```

- [ ] **Step 4: Commit**

```bash
git add components/EditSongModal.tsx components/UniversalContextMenu.tsx
git add -u components
git commit -m "fix: normalize component filename casing"
```

---

### Task 3: 修复 idle callback 类型窄化

**Files:**
- Modify: `pages/Upload.tsx`
- Modify: `components/UploadModal.tsx`

- [ ] **Step 1: 在两个文件中替换 idle helper**

把当前这类代码：

```ts
if ('requestIdleCallback' in window) {
  (window as any).requestIdleCallback(fn, { timeout: 1500 });
  return;
}
window.setTimeout(fn, 0);
```

替换为：

```ts
const runWhenIdle = (fn: () => void) => {
  const requestIdleCallback = window.requestIdleCallback;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1500 });
    return;
  }
  window.setTimeout(fn, 0);
};
```

- [ ] **Step 2: 确认调用点仍使用 `runWhenIdle(fn)`**

Run:

```bash
rg -n "runWhenIdle|requestIdleCallback|window.setTimeout\\(fn" pages/Upload.tsx components/UploadModal.tsx
```

Expected:

```text
两个文件各保留一个 runWhenIdle 定义；不再出现 window.setTimeout(fn, 0) 的 never 类型错误位置。
```

- [ ] **Step 3: 验证类型检查**

Run:

```bash
npm run typecheck
```

Expected:

```text
Task 1-3 相关 TypeScript 错误全部消失。
```

- [ ] **Step 4: Commit**

```bash
git add pages/Upload.tsx components/UploadModal.tsx
git commit -m "fix: type idle upload scheduling"
```

---

### Task 4: 给底部导航补充语义和稳定选择器

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: 更新 Navigation button 属性**

在 `App.tsx` 的底部导航按钮上加入：

```tsx
aria-label={tab.label}
aria-current={isActive ? 'page' : undefined}
title={tab.label}
data-tab={tab.id}
data-testid={`bottom-nav-${tab.id}`}
type="button"
```

完整 button 形态：

```tsx
<button
  key={tab.id}
  type="button"
  aria-label={tab.label}
  aria-current={isActive ? 'page' : undefined}
  title={tab.label}
  data-tab={tab.id}
  data-testid={`bottom-nav-${tab.id}`}
  onClick={() => setTab(tab.id)}
  className="flex items-center justify-center w-16 h-full transition-all duration-300 group"
>
```

- [ ] **Step 2: 增加屏幕阅读器文本**

在 icon 后增加：

```tsx
<span className="sr-only">{tab.label}</span>
```

- [ ] **Step 3: 验证构建**

Run:

```bash
npm run check
```

Expected:

```text
typecheck 和 build 均通过。
```

- [ ] **Step 4: 用浏览器烟测导航**

用测试账号登录后验证：

```text
点击 bottom-nav-home 显示“现在就听”
点击 bottom-nav-library 显示“资料库”
点击 bottom-nav-upload 显示“上传音乐”
点击 bottom-nav-profile 显示“纸菌live”或个人资料区域
```

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "fix: label bottom navigation"
```

---

### Task 5: 修复跨账号缓存和删除失败回滚

**Files:**
- Modify: `store.tsx`

- [ ] **Step 1: 登录用户变化时清理状态**

在 `AppProvider` 中增加 effect：

```tsx
useEffect(() => {
  if (!hasSupabaseConfig) return;
  if (status !== 'signed_in' || !user) {
    loadedSongsForUserRef.current = null;
    lastSongsFetchAtRef.current = 0;
    setSongs([]);
    setFavoriteSongIds([]);
    setComments([]);
    setPlayerState((prev) => ({
      ...prev,
      currentSongId: null,
      isPlaying: false,
      currentTime: 0,
      queue: [],
    }));
    return;
  }
}, [status, user?.id]);
```

- [ ] **Step 2: 收紧跳过拉取条件**

把：

```ts
if (loadedSongsForUserRef.current === user.id && stateRef.current.songs.length) return;
if (stateRef.current.songs.length && Date.now() - lastSongsFetchAtRef.current < 60_000) return;
```

改成：

```ts
if (loadedSongsForUserRef.current === user.id && stateRef.current.songs.length) return;
if (
  loadedSongsForUserRef.current === user.id &&
  stateRef.current.songs.length &&
  Date.now() - lastSongsFetchAtRef.current < 60_000
) {
  return;
}
```

- [ ] **Step 3: 给 deleteSong 增加失败回滚快照**

在 `deleteSong` 开头保存快照：

```ts
const previousSongs = stateRef.current.songs;
const previousPlayerState = stateRef.current.playerState;
const previousFavorites = favoriteSongIds;
```

在 catch 中回滚：

```ts
setSongs(previousSongs);
setFavoriteSongIds(previousFavorites);
setPlayerState(previousPlayerState);
alert('删除失败，已恢复本地列表，请稍后重试');
```

- [ ] **Step 4: 验证**

Run:

```bash
npm run check
```

Manual expected:

```text
切换账号或退出后不会继续看到上一个账号的歌曲缓存。
删除失败时歌曲不会从界面永久消失。
```

- [ ] **Step 5: Commit**

```bash
git add store.tsx
git commit -m "fix: isolate user cache and rollback deletion"
```

---

### Task 6: 统一上传页面和上传弹窗的核心流程

**Files:**
- Create: `hooks/useUploadFlow.ts`
- Modify: `pages/Upload.tsx`
- Modify: `components/UploadModal.tsx`
- Modify: `uploadDraftStorage.ts`

- [ ] **Step 1: 创建共享 hook 的类型骨架**

Create `hooks/useUploadFlow.ts`:

```ts
import { useCallback, useMemo, useState } from 'react';
import { Song } from '../types';

export type UploadVisibility = 'public' | 'private';

export type UploadDraft = {
  title: string;
  artist: string;
  album: string;
  genre: string;
  story: string;
  visibility: UploadVisibility;
  collectionId?: string;
};

export type UploadFlowState = UploadDraft & {
  audioFile: File | null;
  coverFile: File | null;
  isSaving: boolean;
  errorMessage: string | null;
};

const initialDraft: UploadDraft = {
  title: '',
  artist: '',
  album: '',
  genre: '',
  story: '',
  visibility: 'public',
};

export const useUploadFlow = () => {
  const [state, setState] = useState<UploadFlowState>({
    ...initialDraft,
    audioFile: null,
    coverFile: null,
    isSaving: false,
    errorMessage: null,
  });

  const canSave = useMemo(
    () => Boolean(state.audioFile && state.title.trim() && state.artist.trim() && !state.isSaving),
    [state.audioFile, state.title, state.artist, state.isSaving]
  );

  const updateDraft = useCallback((updates: Partial<UploadFlowState>) => {
    setState((prev) => ({ ...prev, ...updates, errorMessage: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      ...initialDraft,
      audioFile: null,
      coverFile: null,
      isSaving: false,
      errorMessage: null,
    });
  }, []);

  return {
    state,
    canSave,
    updateDraft,
    reset,
  };
};
```

- [ ] **Step 2: 先只替换重复状态，不移动上传 API 调用**

在 `pages/Upload.tsx` 和 `components/UploadModal.tsx` 中用 `useUploadFlow()` 管理：

```ts
const uploadFlow = useUploadFlow();
const { state, canSave, updateDraft, reset } = uploadFlow;
```

字段读取改为：

```ts
state.title
state.artist
state.album
state.genre
state.story
state.visibility
state.audioFile
state.coverFile
state.isSaving
state.errorMessage
```

字段写入改为：

```ts
updateDraft({ title: e.target.value });
updateDraft({ artist: e.target.value });
updateDraft({ audioFile: file });
updateDraft({ coverFile: file });
```

- [ ] **Step 3: 上传成功但加入合集失败时给出明确反馈**

把空 `catch {}` 替换成：

```ts
} catch (e) {
  console.warn('歌曲已上传，但加入合集失败:', e);
  alert('歌曲已上传成功，但加入合集失败。你可以稍后在合集里手动添加。');
}
```

- [ ] **Step 4: 验证**

Run:

```bash
npm run check
```

Manual expected:

```text
上传页和上传弹窗字段行为一致。
失败提示不再静默吞掉。
上传成功后 reset 能清空字段。
```

- [ ] **Step 5: Commit**

```bash
git add hooks/useUploadFlow.ts pages/Upload.tsx components/UploadModal.tsx uploadDraftStorage.ts
git commit -m "refactor: share upload flow state"
```

---

### Task 7: 移除 404 外链资源并修正 LibraryCanvas 更新条件

**Files:**
- Modify: `components/LibraryCanvas.tsx`

- [ ] **Step 1: 删除外链噪点背景**

把：

```tsx
<div className="absolute inset-0 opacity-10 pointer-events-none z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
```

替换为本地 CSS 质感：

```tsx
<div className="absolute inset-0 opacity-10 pointer-events-none z-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.12),transparent_24%)]" />
```

- [ ] **Step 2: 修正 memo 比较字段**

如果当前 `React.memo` 只比较 `id/isCurrent/isPlaying`，补充：

```ts
prev.song.title === next.song.title &&
prev.song.artist === next.song.artist &&
prev.song.coverUrl === next.song.coverUrl &&
prev.song.pinnedAt === next.song.pinnedAt
```

- [ ] **Step 3: 验证**

Run:

```bash
npm run check
```

Manual expected:

```text
登录后资料库页面 Network 不再出现 grainy-gradients 404。
编辑歌曲标题、封面、置顶状态后，资料库卡片能正确刷新。
```

- [ ] **Step 4: Commit**

```bash
git add components/LibraryCanvas.tsx
git commit -m "fix: remove broken library background asset"
```

---

### Task 8: 优化 Vite 包体积和环境变量注入

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 移除 GEMINI 浏览器注入**

把：

```ts
define: {
  'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
},
```

替换为：

```ts
define: {},
```

如果后续确认项目仍需要 Gemini，再单独做后端代理或明确的 `VITE_` 客户端开关。

- [ ] **Step 2: 增加 manualChunks**

在 config 中加入：

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        react: ['react', 'react-dom'],
        supabase: ['@supabase/supabase-js'],
        motion: ['framer-motion'],
        icons: ['lucide-react'],
      },
    },
  },
},
```

- [ ] **Step 3: 验证构建体积变化**

Run:

```bash
npm run build
```

Expected:

```text
构建成功。
主业务 chunk 比当前 843 kB 更小。
如仍有 chunk 警告，记录最大 chunk 名称，进入 Task 9。
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: split vendor chunks"
```

---

### Task 9: 做已登录核心路径烟测脚本化

**Files:**
- Create: `docs/TESTING_LOCAL.md`
- Optional Create: `scripts/smoke-auth-tabs.mjs`
- Modify: `package.json`

- [ ] **Step 1: 创建本地测试文档**

Create `docs/TESTING_LOCAL.md`:

```md
# JZone 本地测试说明

## 测试账号

测试账号由项目维护者在本机会话中提供。不要把明文密码写入仓库。

## 手工烟测路径

1. 启动：`npm run dev`
2. 打开：`http://localhost:3000`
3. 登录测试账号
4. 验证首页显示“现在就听”
5. 验证资料库显示“资料库”
6. 验证上传页显示“上传音乐”
7. 验证个人页显示用户资料

## 每次提交前检查

```bash
npm run check
```
```

- [ ] **Step 2: 如果需要脚本化，再创建 smoke 脚本**

Create `scripts/smoke-auth-tabs.mjs`:

```js
import { chromium } from 'playwright';

const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';

if (!email || !password) {
  throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/邮箱|email/i).fill(email);
await page.getByPlaceholder(/密码|password/i).fill(password);
await page.getByRole('button', { name: /登录|登入|sign in/i }).click();
await page.getByText('现在就听').waitFor({ timeout: 15000 });

await page.getByTestId('bottom-nav-library').click();
await page.getByText('资料库').waitFor({ timeout: 10000 });

await page.getByTestId('bottom-nav-upload').click();
await page.getByText('上传音乐').waitFor({ timeout: 10000 });

await page.getByTestId('bottom-nav-profile').click();
await page.locator('body').getByText(/创作|收藏|收录|专辑|歌单/).first().waitFor({ timeout: 10000 });

await browser.close();
```

- [ ] **Step 3: 增加 smoke 脚本入口**

在 `package.json` scripts 增加：

```json
"smoke:auth": "node scripts/smoke-auth-tabs.mjs"
```

- [ ] **Step 4: 验证**

Run:

```bash
$env:JZONE_TEST_EMAIL="由维护者本地设置"
$env:JZONE_TEST_PASSWORD="由维护者本地设置"
npm run smoke:auth
```

Expected:

```text
脚本完成且 exit code 为 0。
```

- [ ] **Step 5: Commit**

```bash
git add docs/TESTING_LOCAL.md scripts/smoke-auth-tabs.mjs package.json
git commit -m "test: document authenticated smoke path"
```

---

### Task 10: 后续安全阶段，不在当前第一批执行

**Files:**
- Modify: `cosClient.ts`
- Modify: `supabaseApi.ts`
- Modify: `supabase/sql/*.sql`
- Optional Create: backend function / Supabase Edge Function

- [ ] **Step 1: 轮换已暴露 COS 密钥**

Expected:

```text
旧 SecretId/SecretKey 作废，新密钥不进入 Vite 客户端 bundle。
```

- [ ] **Step 2: 上传改为后端签发临时 STS 或后端代理**

Expected:

```text
浏览器只拿到短时、限定路径、限定动作的上传凭据。
```

- [ ] **Step 3: 删除改为后端校验后执行**

Expected:

```text
删除歌曲时先校验 owner_id，再删除 DB 与 COS 对象。
```

- [ ] **Step 4: 清理 Supabase policy 冲突**

Expected:

```text
collections 只保留 visibility 单一语义，不再同时依赖 is_public。
```

- [ ] **Step 5: 审计 RPC execute 权限**

Expected:

```text
匿名用户不能执行不该暴露的 security definer 函数。
```

---

## 推荐执行顺序

1. Task 1-3：先让 `npm run typecheck` 可以作为可靠检查。
2. Task 4：补导航语义，为后续烟测脚本打基础。
3. Task 5：修复状态缓存和删除失败体验。
4. Task 6：统一上传流程，减少后续维护成本。
5. Task 7-8：处理外链 404 和包体积。
6. Task 9：沉淀可重复的登录烟测。
7. Task 10：用户确认后单独开安全改造批次。

## 验收标准

- `npm run check` 通过。
- 登录后首页、资料库、上传、个人页均可正常打开。
- 资料库页面不再请求 404 外链资源。
- 底部导航可通过 `aria-label` 或 `data-testid` 稳定定位。
- 上传页面和上传弹窗字段行为一致。
- 删除失败后界面状态能回滚。
- 不在仓库中记录测试账号明文密码。

