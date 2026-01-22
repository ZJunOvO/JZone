I will optimize the UI of `CollectionDetailPage.tsx` to align with the project's unified design (Glassmorphism, Red Glow accents, and specific typography).

### 1. Header & Navigation (Glassmorphism)
- **Top Bar Buttons (Back / More):** Update from simple transparent buttons to the project's standard floating glass style:
  - `bg-zinc-800/50 backdrop-blur-2xl border border-white/10 shadow-2xl`
- **Background:** Refine the background blur and gradient overlay to be smoother and cleaner, ensuring text readability.

### 2. Main Content & Typography
- **Title:** Increase font size and weight to match `Library.tsx` (`text-3xl font-extrabold tracking-tight`).
- **Metadata:** Refine color palette for artist/year info to use standard `text-zinc-400` / `text-zinc-500`.
- **Album Art / Bento Grid:** Add consistent `shadow-2xl` and `border border-white/10` to the containers.

### 3. Song List (Visual Consistency)
- **List Items:** Remove the card-like background (`bg-white/5`) from individual items to match the cleaner `Library` list style.
  - Default: Transparent
  - Active/Hover: `bg-white/5` or `bg-zinc-900`
- **Playing Indicator:** Replicate the 3-bar animated equalizer (red bounce animation) from `Library.tsx` for the currently playing song.
- **Typography:** Match `SongList` text styles (Title: `text-zinc-200`, Artist: `text-zinc-500`).

### 4. Action Buttons (Brand Identity)
- **Play All Button:** Update to use the "Red Glow" brand style:
  - `bg-red-500` with `shadow-[0_4px_24px_rgba(239,68,68,0.4)]`.
- **Secondary Buttons (Add / Select):** Update to match the glass button style used in the top bar.

No changes to logic or backend; purely UI/CSS updates in `CollectionDetailPage.tsx`.