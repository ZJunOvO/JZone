# JZone Engineering Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce JZone's high-risk large-file coupling without changing visible product behavior.

**Architecture:** Split by responsibility, not by framework layer alone. Each task must keep public behavior stable and end with `npm run typecheck` plus `npm run build`.

**Tech Stack:** React 18, Vite, TypeScript, Supabase JS, Framer Motion, Tailwind CSS.

---

## File Structure

- `App.tsx`: keep provider composition only after extraction.
- `components/navigation/BottomNavigation.tsx`: extracted bottom tab UI, gesture state, liquid glass variables.
- `components/layout/AppShell.tsx`: extracted main layout, route state, mini player, overlays.
- `hooks/useAutoFullscreen.ts`: extracted fullscreen behavior.
- `hooks/useAppRoute.ts`: extracted tab, profile route, collection route, browser history events.
- `services/supabase/songsApi.ts`: song CRUD, signed audio/cover helpers related to songs.
- `services/supabase/collectionsApi.ts`: collection list, detail, create, update, add/remove songs.
- `services/supabase/commentsApi.ts`: comments and comment likes.
- `services/supabase/profilesApi.ts`: profile fetch/update and avatar/cover upload helpers.
- `services/supabase/storageApi.ts`: COS/Supabase URL extraction and signed URL cache.
- `services/supabase/index.ts`: compatibility export used by existing call sites during migration.
- `components/profile/ProfileSettingsSheet.tsx`: account/profile/settings modal logic from `pages/Profile.tsx`.
- `components/profile/ProfileCollections.tsx`: albums/playlists rendering from `pages/Profile.tsx`.
- `components/profile/ProfileUploads.tsx`: upload/favorite song lists from `pages/Profile.tsx`.
- `styles/glass.css`: frosted/liquid glass surfaces.
- `styles/navigation.css`: bottom tab and navigation-specific styles.
- `styles/auth.css`: auth page background/card styles.
- `styles/animations.css`: shared keyframes and motion classes.

## Guardrails

- Do not change bento view behavior.
- Do not refactor upload task flow in this phase.
- Do not change current bottom tab visual behavior except moving code.
- Keep `supabaseApi.ts` as a compatibility facade until all imports are migrated.
- Each task must keep the app compiling before continuing.

### Task 1: Extract App Shell Without Behavior Change

**Files:**
- Create: `hooks/useAutoFullscreen.ts`
- Create: `hooks/useAppRoute.ts`
- Create: `components/layout/AppShell.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Move fullscreen logic**

Move `useAutoFullscreen` and its helper logic from `App.tsx` into `hooks/useAutoFullscreen.ts`.

Expected public API:

```ts
export const useAutoFullscreen = () => {
  // existing implementation moved from App.tsx
};
```

- [ ] **Step 2: Move route state**

Create `hooks/useAppRoute.ts` with this public shape:

```ts
export interface AppRouteState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profileUserId?: string;
  setProfileUserId: (id?: string) => void;
  collectionId: string | null;
  openCollection: (id: string, push: boolean) => void;
  closeCollection: () => void;
}

export const useAppRoute = (): AppRouteState => {
  // move localStorage active tab, profile event, collection history, popstate handling here
};
```

- [ ] **Step 3: Move layout JSX**

Create `components/layout/AppShell.tsx` and move `MainLayout` JSX there. Keep prop-free usage:

```tsx
export const AppShell: React.FC = () => {
  // existing MainLayout behavior
};
```

- [ ] **Step 4: Reduce `App.tsx`**

Keep only provider composition and `AuthGate` in `App.tsx`.

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass.

### Task 2: Extract Bottom Navigation

**Files:**
- Create: `components/navigation/BottomNavigation.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Move `Navigation`**

Move the current `Navigation` component from `App.tsx` into `components/navigation/BottomNavigation.tsx`.

Public props:

```ts
interface BottomNavigationProps {
  currentTab: string;
  setTab: (tab: string) => void;
}
```

- [ ] **Step 2: Rename exported component**

Export:

```tsx
export const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentTab, setTab }) => {
  // existing Navigation implementation
};
```

- [ ] **Step 3: Update imports**

Use `BottomNavigation` in `AppShell`.

- [ ] **Step 4: Verify gestures**

Manual check after starting dev server:

```bash
npm run dev -- --host 0.0.0.0
```

Expected:

- Tapping tabs switches pages.
- Dragging from active icon still switches tab on release.
- Lens animation still appears and fades.

- [ ] **Step 5: Verify build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass.

### Task 3: Split Supabase Facade Internally

**Files:**
- Create: `services/supabase/storageApi.ts`
- Create: `services/supabase/collectionsApi.ts`
- Create: `services/supabase/songsApi.ts`
- Create: `services/supabase/commentsApi.ts`
- Create: `services/supabase/profilesApi.ts`
- Create: `services/supabase/cache.ts`
- Modify: `supabaseApi.ts`

- [ ] **Step 1: Move cache helpers**

Move `apiCache`, `apiInFlight`, `cached`, `invalidateApiCache`, TTL constants into `services/supabase/cache.ts`.

Export:

```ts
export const cached = async <T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {};
export const invalidateApiCache = (match: (key: string) => boolean) => {};
```

- [ ] **Step 2: Move storage helpers**

Move signed URL cache and URL extraction helpers into `services/supabase/storageApi.ts`.

Export:

```ts
export const createSignedAudioUrl = async (path: string, expiresInSeconds?: number) => {};
export const createSignedCoverUrl = async (path: string, expiresInSeconds?: number) => {};
export const createSignedAvatarUrl = async (path: string, expiresInSeconds?: number) => {};
```

- [ ] **Step 3: Move collection methods**

Move collection list/detail/create/update/delete/add/remove methods into `collectionsApi.ts`.

Keep method names identical:

```ts
fetchMyCollections;
fetchVisibleCollections;
fetchCollectionsByCreator;
createCollection;
addSongsToCollection;
removeSongsFromCollection;
syncSongAlbumByTitle;
fetchCollection;
```

- [ ] **Step 4: Move song methods**

Move song fetch/update/upload/delete/play-count methods into `songsApi.ts`.

Keep method names identical:

```ts
fetchSongs;
updateSong;
uploadAndCreateSong;
incrementSongPlay;
incrementUserSongPlay;
fetchMySongPlayCount;
deleteSong;
```

- [ ] **Step 5: Keep facade compatibility**

In `supabaseApi.ts`, re-export a single object:

```ts
export const supabaseApi = {
  isEnabled: () => hasSupabaseConfig,
  ...collectionsApi,
  ...songsApi,
  ...commentsApi,
  ...profilesApi,
  ...storageApi,
};
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass and no caller import needs to change yet.

### Task 4: Split Profile Page by Display Responsibility

**Files:**
- Create: `components/profile/ProfileUploads.tsx`
- Create: `components/profile/ProfileCollections.tsx`
- Create: `components/profile/ProfileSettingsSheet.tsx`
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Extract uploads section**

Move the upload/favorites list rendering from `pages/Profile.tsx` into `ProfileUploads`.

Props:

```ts
interface ProfileUploadsProps {
  songs: Song[];
  currentSongId: string | null;
  isPlaying: boolean;
  onPlay: (songId: string) => void;
  onOpenSongMenu: (song: Song, anchor: { x: number; y: number }) => void;
}
```

- [ ] **Step 2: Extract collections section**

Move album/playlist rendering into `ProfileCollections`.

Props:

```ts
interface ProfileCollectionsProps {
  collections: CollectionRow[];
  loading: boolean;
  viewerId?: string;
  onOpenCollection: (id: string) => void;
  onOpenCollectionMenu: (collection: CollectionRow, anchor: { x: number; y: number }) => void;
}
```

- [ ] **Step 3: Extract settings sheet**

Move background, avatar frame, status, appearance settings into `ProfileSettingsSheet`.

Keep behavior identical: no design changes in this task.

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass. `pages/Profile.tsx` should be under 850 lines after this task.

### Task 5: Split Global CSS by Ownership

**Files:**
- Create: `styles/glass.css`
- Create: `styles/navigation.css`
- Create: `styles/auth.css`
- Create: `styles/animations.css`
- Modify: `index.css`

- [ ] **Step 1: Move glass styles**

Move these selector groups into `styles/glass.css`:

```css
.frosted-glass-panel,
.frosted-glass-menu,
.frosted-glass-player,
.frosted-auth-card,
.liquid-context-menu-panel
```

- [ ] **Step 2: Move navigation styles**

Move these selector groups into `styles/navigation.css`:

```css
.liquid-tab-filter-defs,
.liquid-tab-surface,
.liquid-tab-f-glass,
.liquid-tab-lens
```

- [ ] **Step 3: Move auth styles**

Move auth background and card-only classes into `styles/auth.css`.

- [ ] **Step 4: Move animation keyframes**

Move shared `@keyframes` blocks into `styles/animations.css`.

- [ ] **Step 5: Import style modules**

At the top of `index.css`, add:

```css
@import './styles/animations.css';
@import './styles/glass.css';
@import './styles/navigation.css';
@import './styles/auth.css';
```

- [ ] **Step 6: Verify visual behavior**

Run dev server and manually check:

- Login card has background and blur.
- Bottom tab still renders correctly.
- Mini player/menu still has readable blur.
- Player page still opens.

- [ ] **Step 7: Verify build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands pass.

### Task 6: Add Regression Smoke Scripts for Refactor Safety

**Files:**
- Create: `scripts/smoke-collection-flow.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add collection smoke script**

Create `scripts/smoke-collection-flow.mjs` that logs in, opens Library, opens first collection if present, and verifies the detail page renders a title or empty state.

- [ ] **Step 2: Add npm script**

Add:

```json
"smoke:collection": "node scripts/smoke-collection-flow.mjs"
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run smoke:auth
npm run smoke:collection
```

Expected: both scripts complete without throwing.

## Completion Criteria

- `App.tsx` is provider/app entry only.
- `supabaseApi.ts` is a compatibility facade, not a 900-line implementation file.
- `Profile.tsx` is smaller and delegates major sections.
- `index.css` imports owned style files.
- No visible product behavior changes except bug fixes from the collaborator permission work.
- `npm run typecheck` and `npm run build` pass after every task.

