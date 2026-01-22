## 现状结论（关键约束）
- 当前项目没有 URL 路由库；页面切换依赖 [App.tsx](file:///g:/2026/webApp/JZone2/jzone-player/App.tsx) 的状态分发与自定义事件。
- 数据库已存在 `public.albums`（旧设计）与 `songs.album_id`，但前端没用上（仍用 `songs.album` 文本）。

## 目标（按 Final Specification + 你的补充）
- 把 `albums` 升级为统一集合表（专辑+歌单），支持公开/私有。
- 新增 `album_songs` 关联表（排序、added_at）。
- 新增 `/collection/:id` 详情页（全屏呈现），按 `type` 分两种 Header（Playlist 无限 Bento / Album Apple Music）。
- 统一 Action Bar（播放全部 + 多选 + 添加歌曲入口）。
- 播放闭环：点列表任意歌 -> 把集合全量入队并从该歌开始。
- 上传页：专辑/歌单智能关联 Creatable Select（防抖/节流、可即时创建）。
- 资料库：右上角 + 改全局创建 Popover（上传/新建专辑/新建歌单）。
- 详情页“更多”菜单：新增公开/私有开关，并保持菜单结构向后兼容。

## 1) 数据库 SQL（新迁移文件）
新增迁移：`supabase/sql/012_collections.sql`（名称可调整）

### 1.1 扩展/统一 `public.albums`
- 新增 enum：
  - `collection_type` = ('album','playlist')
  - `collection_visibility` = ('private','public')
- `alter table public.albums`：
  - `add column type collection_type not null default 'album'`
  - `add column visibility collection_visibility not null default 'private'`
  - `add column description text`
  - `add column play_count bigint not null default 0`（仅 playlist 展示/统计）
  - `artist_id` 迁移为 `creator_id`（rename 或新增列+回填，选最安全方式）
  - 保留/对齐：`title, cover_url, release_year, genre, created_at`

### 1.2 新建 `public.album_songs`
- 字段：`album_id, song_id, added_at, sort_order`
- unique(album_id, song_id)
- 索引：按 `album_id, sort_order`

### 1.3 RLS 与可见性规则（你补充的“公开/私有 + 单曲可见性差异”）
- `albums` select：`visibility='public' OR creator_id=auth.uid()`
- `album_songs` select：仅当其 `album_id` 对当前用户可见（同上条件）
- insert/update/delete：仅创建者（`creator_id=auth.uid()`）

**单曲可见性差异**（重要）：
- `songs` 的 RLS 已经保证：非 owner 只能看到 public song。
- 因此：
  - 公开集合中允许包含私有单曲，但只有创建者本人在详情页里能看到；其他人打开同一个 `/collection/:id` 时，这些私有单曲会因 RLS 自动被过滤（不会泄露）。
  - 私有集合只对创建者可见（其他人连集合本身都看不到）。

### 1.4 RPC（DB 原子性）
- `create_collection(...) returns uuid`
- `add_songs_to_collection(p_album_id uuid, p_song_ids uuid[])`（自动追加 sort_order）
- `set_collection_visibility(p_album_id uuid, p_visibility collection_visibility)`（仅创建者可调）
- `increment_collection_play_count(p_album_id uuid)`（仅 type='playlist' 且集合对当前用户可见时才 +1）

## 2) 前端路由（最小 URL 路由层，不引入 react-router）
在 [App.tsx](file:///g:/2026/webApp/JZone2/jzone-player/App.tsx) 增加：
- 初始解析 + `popstate`：识别 `/collection/:id` 打开 CollectionDetailPage 覆盖层。
- 新增事件 `jzone:navigate-collection`：触发 `history.pushState('/collection/'+id)`。
- 关闭详情页：`history.back()`（保持浏览器返回语义）。

## 3) CollectionDetailPage（核心页面组件）
新增：`pages/CollectionDetailPage.tsx`
- 加载：`supabaseApi.fetchCollection(id)` → collection + 按 `sort_order` 的 songs
- 两种 Header：
  - Playlist：复用并改造 [LibraryCanvas.tsx](file:///g:/2026/webApp/JZone2/jzone-player/components/LibraryCanvas.tsx) 逻辑，做“第二无限画布”封面墙（不限制数量、可拖拽/缩放、全屏模糊背景+羽化遮罩）。
  - Album：单封面居中 + 封面主色弥散渐变背景（新增轻量取色 util）。
- Action Bar（统一布局）：
  - 播放全部（显示可见歌曲数量）
  - 多选（进入批量管理模式）
  - “+ 添加歌曲”（SongPickerModal）
- “更多”菜单（向后兼容的菜单结构）：
  - 设为公开/设为私有（创建者可见）
  - 编辑信息（创建者可见）
  - 删除集合（创建者可见）
  - 对于非创建者：仅显示可用的只读项（或不显示更多按钮）

**可见性提示**：
- 若当前用户不是创建者，且集合内存在被 RLS 过滤的歌曲：在列表顶部显示一行小提示“部分歌曲因隐私设置不可见”。

## 4) 播放逻辑闭环（队列上下文切换）
扩展 [store.tsx](file:///g:/2026/webApp/JZone2/jzone-player/store.tsx)：
- 新增 `playCollection(songIds, startSongId, context)`：
  - 覆盖 `playerState.queue` 为集合顺序
  - 从点击歌曲开始播放
- 若集合 type='playlist'：在触发播放上下文时调用 `increment_collection_play_count`。

## 5) Upload：智能关联 Creatable Select（防抖/节流）
新增 `components/CollectionCreatableSelect.tsx` 并接入：
- [Upload.tsx](file:///g:/2026/webApp/JZone2/jzone-player/pages/Upload.tsx) 与 [UploadModal.tsx](file:///g:/2026/webApp/JZone2/jzone-player/components/UploadModal.tsx)
- 250ms 防抖 + 过期响应丢弃；结果分组展示：[专辑]/[歌单]
- 保存上传时闭环：
  - 选“新建”：先 RPC `create_collection`，再 `add_songs_to_collection([songId])`
  - 选“已有”：直接 `add_songs_to_collection([songId])`

**关于“公开集合 vs 私有单曲”的交互**：
- 如果用户把“私有单曲”加入“公开集合”，在保存时给出一次轻提示（不阻断）：公开集合对外仍只会展示其中公开单曲。

## 6) 详情页添加歌曲入口：SongPickerModal
- Album：仅允许从“我的上传”选择
- Playlist：允许从当前可见歌曲全集选择
- 确认后调用 `add_songs_to_collection`

## 7) 资料库全局创建入口重构
在 [Library.tsx](file:///g:/2026/webApp/JZone2/jzone-player/pages/Library.tsx) 把右上角“+”改为毛玻璃 Popover：
- 上传音乐
- 新建专辑（CreateCollectionModal(type='album')）
- 新建歌单（CreateCollectionModal(type='playlist')）

## 8) 验证方式
- TS 编译 + `vite build`
- 手动验收路径：
  - 新建专辑/歌单（私有）→ 打开详情页
  - 切换公开/私有 → 用另一个账号访问 `/collection/:id` 验证可见性
  - 公开集合中混入私有单曲 → 非创建者仅看到公开部分
  - 点击单曲 → 队列切换为该集合顺序、从点击曲开始
  - 上传页 Creatable Select 创建/关联闭环

## 需要你确认的 4 个点（确认后立即开工）
1. 集合默认可见性：专辑/歌单默认都 `private` 吗？还是专辑默认 `public`？
2. `play_count` 计数规则：从该歌单上下文播放任意一首就 +1，还是仅“播放全部”+1？
3. 公开集合里是否允许“私有单曲”存在（我按“允许但对外不可见”实现，并给提示）是否 OK？
4. URL 是否只用 `/collection/:id`（我按该路径实现；可选兼容 `/album/:id` `/playlist/:id`）。

你回复“开工”并回答上面 4 点，我就开始输出 SQL + 实现 CollectionDetailPage 以及相关 UI/交互改动。