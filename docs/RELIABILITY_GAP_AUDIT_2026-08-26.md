# JZone 可靠性收尾差距审计

审计日期：2026-08-26  
审计仓库：`G:\2026\webApp\JZone2\jzone-player`  
审计分支：`codex/next-stage-20260826`  
审计基线：`ccaffded8bcaf7a82d6cedecd76b481ebf0183cf`

## 结论摘要

本次只审阅当前 checkout 的源码、符号、配置和已有 smoke 脚本，不修改业务代码、旧文档、测试脚本或配置。

- 审计结论共 18 条：风险结论 13 条（P0 1 条、P1 10 条、P2 2 条），另有 1 条已实现基线、3 条明确占位、1 条过时文档说明。
- 最高风险为 `C06`（P0）：上传草稿使用全局单例存储，没有当前用户隔离；登出后换账号可能读到上一账号草稿。
- “页内保活”已成立，但“浏览器关闭后恢复上传任务”尚未成立。当前能恢复的是有限的文件/元数据草稿，不是正在运行的云端任务。
- 评论控制器有“保留旧内容、静默刷新”的局部 SWR 外观，但没有接入评论缓存键、TTL 或缓存读写，因此每歌曲短期 SWR 当前判定为未实现。
- 封面有确定性 fallback 生成和签名失败 fallback，但没有把 COS HTTP 404/403、过期签名、图片加载失败统一转成失效资源诊断和兜底流程。
- PWA 的安装提示、manifest 和基础 service worker 已存在；这不等于离线业务可用，也不等于鸿蒙 WebView 原生兼容。

状态枚举：`已实现`、`部分实现`、`未实现`、`文档过时`。下文每条结论均明确标注状态。

## 风险排序

### P0

#### C06：上传草稿没有当前用户隔离（状态：未实现）

证据：

- `uploadDraftStorage.ts:1-5,143-160` 只定义一个 `jzone-player-upload-draft` 数据库和 `audio`、`cover`、`meta` 三个固定 key，没有 user id、账号命名空间或任务 id。
- `components/upload/useUploadDraft.ts:217-291` 在初始化时直接恢复这三个全局 key；`App.tsx:25-29` 认证状态变化会卸载并重建应用树，重建后仍会读取同一组 key。
- `auth.tsx:20-50` 的认证事件处理只清理 API/media cache，没有清理或切换上传草稿命名空间。

真实边界：同一浏览器、同一 origin 下，登出后换账号仍可能看到并继续使用前一账号的草稿。当前无跨设备恢复证据，也没有把草稿与服务端上传身份绑定。

最小修复边界：草稿 key 至少按当前用户隔离；未登录时不恢复受保护草稿；账号切换时清晰丢弃、保留待确认或迁移旧草稿。不要借此扩展为跨设备云端草稿或后台上传队列。

建议 Luna 写入范围（后续获准实现时）：`uploadDraftStorage.ts`、`utils/uploadDraftMeta.ts`、`components/upload/useUploadDraft.ts`；需要明确旧 singleton key 的一次性迁移策略。当前审计不写入这些文件。

自动验收：同一 Playwright 浏览器上下文以账号 A 写入草稿，登出并以账号 B 登录；B 不得恢复 A 的文件、封面或元数据。账号 A 重新登录时，行为必须符合迁移/清理策略；IndexedDB 不可用时不得静默宣称可恢复。

实机验收：Android 浏览器和鸿蒙浏览器分别执行 A/B 账号切换、刷新、关闭后重开，检查文件名、封面、标题和关联元数据没有越权串读。

### P1

#### C02：关闭后只能恢复有限草稿，不能恢复完整上传状态（状态：部分实现）

证据：

- `components/upload/useUploadDraft.ts:211-299` 会恢复 `meta`、`audio`、`cover`；读取失败被 `.catch(() => null)` 吞掉，最终仍设置 `isDraftRestored`。
- `utils/uploadAudio.ts:341-345` 对大于 25 MiB 的音频直接 `Promise.resolve()`，不写入持久存储，且调用方无法从返回值区分“已保存”和“跳过保存”。
- `uploadDraftStorage.ts:77-93` 的元数据只有标题、艺人、专辑、类型、故事、可见性、流优化、裁切范围和时长，没有队列、阶段、进度、任务身份、用户身份、更新时间或过期时间。
- `components/upload/useUploadDraft.ts:301-319,468-484,486-531` 只保存编辑态文件和元数据，写入失败均被忽略；`resetDraft` 在 `328-362` 中也未等待清理完成。

真实边界：同源同设备内，小文件、封面和部分编辑元数据有机会在关闭后恢复；大文件、IndexedDB 失败、过期草稿和“上传中”阶段没有可靠恢复契约。当前 UI 的恢复不是任务恢复。

最小修复边界：明确草稿状态机、大小/存储不支持提示、更新时间和过期策略；至少把“可恢复编辑草稿”和“不可恢复的上传中任务”区分展示。不要伪装成关闭浏览器后可续传。

建议 Luna 写入范围（后续获准实现时）：`uploadDraftStorage.ts`、`utils/uploadDraftMeta.ts`、`components/upload/useUploadDraft.ts`，必要时只补 `UploadEditor.tsx` 的提示和重选入口。当前不改代码。

自动验收：分别覆盖小于 25 MiB、大于 25 MiB、无 IndexedDB、写入失败、过期草稿；刷新和关闭重开后，恢复结果与 UI 提示一致，不得把未保存大文件显示成可继续上传。

实机验收：Android/鸿蒙浏览器在选曲、裁切、填元数据后强制关闭再重开；记录大文件、低存储和系统回收页面时的实际行为。

#### C03：正在进行的上传没有可恢复任务身份或幂等边界（状态：未实现）

证据：

- `components/upload/useUploadSave.ts:36-107` 的保存阶段和进度只存在 React state；没有持久化 task id、阶段或重试游标。
- `services/supabase/songs.ts:72-76` 每次保存生成新的 `songId`，随后在 `80-123` 顺序上传音频、流媒体和封面，在 `125-167` 写数据库并尝试清理。
- `utils/uploadFlow.ts:11-64` 只做行映射和收藏夹关联，没有任务状态、补偿或幂等键。

真实边界：浏览器关闭、响应丢失或阶段性失败后再次点击保存，可能重新生成对象路径和数据库行；部分成功后的孤儿对象、重复歌曲或无法判断是否已入库都没有可靠客户端恢复依据。

最小修复边界：为一次保存建立稳定 task/song 身份和阶段记录；重试必须先查询/复用既有身份，再决定补传、补写或人工处理。不要在本任务中引入后台服务、跨设备队列或自动删除历史资源。

建议 Luna 写入范围（后续获准实现时）：`components/upload/useUploadSave.ts`、`services/supabase/songs.ts`、`utils/uploadFlow.ts` 及明确批准的最小任务存储文件。当前不改代码，也不执行远程回放。

自动验收：用本地可控 fixture 在音频、流媒体、封面、数据库写入各阶段中断；关闭后重开并重试，最终最多一条歌曲记录、对象路径可追踪，失败状态可见且可人工处理。

实机验收：移动网络切换、锁屏、系统回收浏览器和手动关闭页面后重开，验证不会以“保存成功”掩盖未完成任务。

#### C04：多文件队列只在当前 React 实例中存在，弹窗首曲成功会卸载队列（状态：未实现）

证据：

- `components/upload/UploadEditor.tsx:35-47,85-117` 把后续文件放入 `pendingFiles: File[]`，并在当前实例内逐曲推进。
- `components/UploadModal.tsx:40` 把 `onSaved` 绑定为 `onClose`；`pages/Library.tsx:559-562` 关闭弹窗即卸载编辑器。首曲保存后 `UploadEditor` 的 `handleSaved` 会触发关闭，队列没有持久化。
- 页面模式 `pages/Upload.tsx:65-79` 能保持队列的前提是页面实例仍在同一个 AppShell 中。

真实边界：页内同一实例可依次编辑；弹窗首曲成功、路由卸载或浏览器关闭都会丢失剩余队列。选择多首不是跨生命周期的可靠批处理。

最小修复边界：先明确 modal 的多文件产品语义；若要求继续处理，保存队列和当前索引，否则在关闭前明确剩余文件将丢失。不要默认扩展为后台批量上传。

建议 Luna 写入范围（后续获准实现时）：`components/upload/UploadEditor.tsx`、`components/UploadModal.tsx` 及经批准的队列草稿存储。当前不改代码。

自动验收：页面模式和弹窗模式各选择 3 个文件，首曲保存、切换主导航、刷新、关闭重开分别验证剩余队列；验收结果需明确“恢复”或“明确丢弃”。

实机验收：Android/鸿蒙浏览器多选文件后锁屏、返回、关闭弹窗和系统回收页面，确认用户不会误以为剩余曲目仍在上传。

#### C05：集合选择没有进入持久化元数据（状态：部分实现）

证据：

- `components/upload/useUploadDraft.ts:13-40,230-268` 的 draft state 有编辑字段，但恢复逻辑没有 `collectionSelection`。
- `uploadDraftStorage.ts:77-93` 的 `UploadDraftMeta` 也没有集合 id/选择模式字段。
- `utils/uploadFlow.ts:5-9` 只把当前选择解析成 album 标题；`components/upload/useUploadSave.ts:128-143` 在保存后才尝试按 album 同步集合。

真实边界：关闭后重开可恢复专辑文本，但不能证明原集合选择仍在；保存语义可能从“加入指定集合”退化为“按标题尝试匹配或不关联”。

最小修复边界：只持久化安全、可验证的集合选择（id、选择模式和必要显示文本），恢复时校验当前账号仍可见；失效选择必须显式提示，不得静默改投其他集合。

建议 Luna 写入范围（后续获准实现时）：`uploadDraftStorage.ts`、`utils/uploadDraftMeta.ts`、`components/upload/useUploadDraft.ts`、`utils/uploadFlow.ts`。当前不改代码。

自动验收：选择现有集合后关闭重开，保存结果仍关联同一集合；集合被删除或账号无权限时显示待处理状态，不自动匹配同名集合。

实机验收：移动端切换应用再回来、登录状态刷新后确认集合选择和保存提示一致。

#### C07：评论每歌曲短期 SWR 缓存当前不存在（状态：未实现）

证据：

- `hooks/useCommentsController.ts:69-118` 的 `loadComments` 每次直接调用 `supabaseApi.fetchCommentsPage`，没有先读缓存；`120-146` 在歌曲/排序变化、在线和可见性事件时直接重新请求。
- `services/supabase/cache.ts:21-65` 虽有通用 `cached`、in-flight 去重和若干 TTL，但 TTL 仅覆盖 profile、collection 和我的歌曲播放次数，没有评论 TTL 或评论 key。
- `services/supabase/interactions.ts:32-75` 的 `fetchCommentsPage` 直接查询 Supabase，未导入或调用 `cached`。
- 当前控制器在静默刷新时保留已有 React rows，并在失败时显示旧内容；这属于状态保留，不是可复用的每歌曲短期 SWR 缓存。

真实边界：返回同一歌曲/排序/页时没有跨控制器生命周期的短期缓存命中、TTL 过期判断或请求去重契约；刷新、切歌和重建组件仍依赖网络。

最小修复边界：按 user、song、sort、page/cursor、权限和 schema version 设计评论缓存 key；定义短 TTL、stale-first、静默刷新状态和失败保留旧值。不要做永久离线评论数据库。

建议 Luna 写入范围（后续获准实现时）：`services/supabase/cache.ts`、`services/supabase/interactions.ts`、`hooks/useCommentsController.ts`。评论分页、回复、删除、分享等已完成能力不重新实现。

自动验收：覆盖无缓存、TTL 内命中、TTL 过期先显旧值再刷新、刷新失败保留旧值、歌曲/排序/账号/权限切换隔离；检查网络请求次数和缓存 key。

实机验收：移动端切前后台、断网再联网、快速切歌和登录切换，确认旧歌曲评论不会短暂串到新歌曲。

#### C09：封面兜底是分层存在，但未覆盖所有展示面（状态：部分实现）

证据：

- `utils/cover.ts:19-26` 提供基于 seed 的确定性 SVG fallback。
- `store.tsx:254-305` 和 `pages/CollectionDetailPage.tsx:97-134` 在签名 URL 生成异常时保留或生成 fallback。
- `components/LibraryCanvas.tsx:251-264` 有图片 `onError`，但失败后展示通用图标；`CollectionBentoWall.tsx:207-219`、`PlayerBar.tsx:72-84`、`pages/PlayerView.tsx:293-313,362-373` 等展示面没有统一 `onError` fallback。

真实边界：签名函数抛错时部分入口能回退；已返回但 HTTP 404/403、过期签名、图片格式错误或加载网络失败时，入口间行为不一致，有的继续显示坏图，有的只显示通用图标。

最小修复边界：抽出统一的“有效封面 URL + 失效回退”展示契约，保留 canonical `cover_path` 以便诊断；不要用旧意见或假媒体填补缺失资源。

建议 Luna 写入范围（后续获准实现时）：`utils/cover.ts`、`services/supabase/storageApi.ts`，以及获批准的公共封面展示组件/入口。当前不改代码。

自动验收：对有效 URL、签名异常、404、403、过期 URL、格式错误和网络中断分别注入 fixture，所有主要展示面都出现确定性 fallback 或明确失效状态。

实机验收：移动网络弱网、缓存旧签名和图片加载中断时检查播放器、列表、集合 Bento 与沉浸页的一致性。

#### C10：COS 失效资源没有 HTTP 级检测和统一诊断（状态：未实现）

证据：

- `services/supabase/storageApi.ts:73-125` 只根据本地签名缓存和 path 形态返回 URL；创建签名 URL 前没有对对象做 HEAD/GET 存在性验证，也没有记录 404/403/签名过期分类。
- 根目录 `cosClient.ts:72-98` 定义了 `cosClient.objectExists`，但它只被同一文件中的 `uploadFileIfAbsent`（`cosClient.ts:134-147`）用于上传去重，不在读取/展示路径使用。
- `utils/mediaUrl.ts:1-11` 只升级特定 COS `http` URL 为 `https`，不检测资源有效性。

真实边界：数据库中的历史 COS path 即使已失效，也可能继续产生一个形式正确的 signed URL；客户端无法区分“对象不存在”“权限问题”“签名过期”和“图片加载异常”。

最小修复边界：建立只读的失效分类和 UI fallback；必要时仅清掉本地签名缓存并重新签名。任何 DB/COS 清理必须走扫描、预览、明确确认、小批量应用，不得由展示失败自动触发远程删除。

建议 Luna 写入范围（后续获准实现时）：`services/supabase/storageApi.ts`、`utils/mediaUrl.ts` 和统一封面加载入口；不把 `objectExists` 直接扩成无界面的全量扫描。当前不改代码、不远程调用。

自动验收：本地 mock 的 HEAD/图片请求分别返回 200、404、403、过期和网络错误，验证分类、重签名、fallback 和诊断字段；确认不产生删除请求。

实机验收：使用经过授权的测试对象覆盖旧 path、失效签名和无权限对象，检查用户提示与播放器/列表状态。

#### C12：PWA 安装链和基础 shell 已有，但缓存覆盖不足（状态：部分实现）

证据：

- `public/manifest.webmanifest:2-25` 定义了 name、scope、start_url、display 和图标。
- `utils/registerServiceWorker.ts:19-28` 在生产环境注册 `/sw.js`；`components/PwaInstallPrompt.tsx:30-74` 处理 `beforeinstallprompt`、安装、dismiss 和 `appinstalled`。
- `public/sw.js:5-12` 的 APP_SHELL 只缓存 `/`、manifest、favicon 和图标；`public/sw.js:67-82` 的 runtime 分支只覆盖 `/assets/`、`/icons/`、`/fonts/`、favicon。
- `index.html:23` 直接加载 `/index.css`，而 `/index.css` 不匹配上述缓存分支。该缺口是基于当前静态路径规则的推断，尚未做离线浏览器实测。

真实边界：安装提示和基础导航缓存已实现；新安装或缓存被清空时，离线打开根路由不等于样式、脚本、字体和业务数据都可用。Supabase/COS 远程请求也不在该 service worker 的同源缓存范围内。

最小修复边界：先形成明确的离线支持声明，再补齐构建产物/样式的可靠缓存和版本失效策略；不把远程媒体和业务写入伪装成离线成功。

建议 Luna 写入范围（后续获准实现时）：`public/sw.js`、`manifest.webmanifest`、`utils/registerServiceWorker.ts` 及与构建产物路径一致的最小配置。当前不改代码。

自动验收：生产预览环境安装、首次加载、刷新、清缓存后离线加载，验证 HTML、JS、CSS、字体和图标；检查 service worker 更新和旧 cache 清理。

实机验收：Android Chrome/Edge 执行安装、离线启动、更新后重启；记录安装提示、启动白屏、样式缺失和远程数据不可用状态。

#### C13：鸿蒙兼容目前是浏览器安装提示，不是 native/WebView 支持（状态：未实现）

证据：

- `components/PwaInstallPrompt.tsx:16-22,76-85` 仅通过 UA 识别 Harmony/鸿蒙，并提示用户从浏览器菜单添加到桌面或安装。
- 仓库没有 ArkTS/ArkWeb 容器、鸿蒙原生生命周期桥接或 WebView 文件/网络策略；`utils/registerServiceWorker.ts:1-28` 只按浏览器 service worker 能力注册。
- 当前边界不包含把鸿蒙 WebView 变成原生支持；该方向应单独决策和实机验收。

真实边界：可以记录鸿蒙浏览器的 PWA 提示行为，但不能据此宣称鸿蒙 WebView 兼容、后台上传、文件持久化或离线媒体可用。

最小修复边界：只补兼容性声明和设备矩阵；若要支持原生 WebView，另立项目范围，定义文件选择、存储、网络、service worker 和生命周期合同。

建议 Luna 写入范围：本轮无建议业务写入；后续应由 Sol 单独批准兼容性方案和文件白名单。

自动验收：在支持的鸿蒙浏览器上验证 manifest、安装提示、刷新和文件选择；不把浏览器结果映射为 native WebView 通过。

实机验收：指定鸿蒙系统/浏览器版本执行 PWA 安装、切后台、关闭重开、文件选择和弱网；native WebView 另行建最小宿主验收。

#### C14：现有 smoke 覆盖了功能回归，但没有覆盖本轮可靠性契约（状态：部分实现）

证据：

- `package.json` 已注册 `smoke:comments`、`smoke:cover`、`smoke:runtime`、`smoke:upload-metadata`、`smoke:media-delivery` 等脚本，但没有 upload close/reopen、upload task retry、comment SWR、COS 404 或 PWA offline smoke。
- `scripts/smoke-comments.mjs:92-139,141-204` 使用 mock comments，验证分页、回复、删除、分享和断网后旧内容保留；没有缓存命中、TTL、过期、每歌曲/账号隔离或 `visibilitychange` 真实链路。
- `scripts/smoke-upload-metadata.mjs:49-80` 验证 M4A 选择和 metadata 删除，不保存、不关闭重开、不验证队列、上传阶段或大文件持久化。
- `scripts/smoke-cover-fallback.mjs:17-44` 只阻断 Picsum 并看视觉结果，不注入 COS 404/403/过期签名或 `img onError`；`smoke-media-delivery` 只验证音频投递分析和封面 hash。
- `scripts/smoke-runtime-compat.mjs:11-34` 只覆盖缺少 `crypto.randomUUID` 的挂载；没有 manifest/service worker/Harmony 验收。各主要认证 smoke 会设置 `jzone.pwaInstallDismissedAt`，因此不会覆盖安装提示。
- `scripts/cos-history-audit.test.mjs` 及其依赖的 `scripts/cos-history-audit.mjs` 均已存在；离线 fixture 测试 `node scripts/cos-history-audit.test.mjs` 已通过。该测试只覆盖离线 fixture，不覆盖真实 COS/Supabase；目前未注册到 `package.json` 的 smoke 入口。

最小修复边界：新增隔离的 fixture smoke，分别覆盖草稿生命周期、SWR 生命周期、失效封面分类和生产 service worker；把“跳过（缺凭据/缺服务）”与“通过”分开。不要为了补 smoke 改业务行为。

建议 Luna 写入范围（后续获准实现时）：仅 `scripts/` 和经批准的 `package.json` smoke 入口；当前不改已有未跟踪测试或生成物。

自动验收：每个可靠性契约至少有无网络/可控 mock 的自动测试，并报告命中、失效、恢复、跳过和失败原因；不把截图存在当作逻辑通过。

实机验收：使用测试账号和实际移动浏览器执行 PWA、文件、前后台和网络切换矩阵；当前没有实机通过证据。

### P2

#### C08：评论的局部状态隔离存在，但缓存失效契约尚未形成（状态：部分实现）

证据：

- `hooks/useCommentsController.ts:53-67` 在 user id 变化时清空评论、重置分页和请求序号。
- `hooks/useCommentsController.ts:69-118,120-146` 以当前歌曲和排序加载，并用 request sequence 防止旧请求覆盖新状态；静默刷新失败时保留当前 rows。
- `hooks/useCommentsController.ts:163-272` 的新增、点赞、删除主要修改本地 React state并回滚；由于评论没有接入 `services/supabase/cache.ts`，不存在可执行的评论 cache invalidation。

真实边界：当前控制器不会把持久化评论缓存跨账号串读，但也没有在未来接入 SWR 后可复用的“评论新增/点赞/删除、切歌、权限变化”失效合同。

最小修复边界：与 `C07` 一起定义缓存 key 和 mutation invalidation；保留现有分页、回复、删除、分享行为，不重新实现这些已完成功能。

建议 Luna 写入范围（后续获准实现时）：`hooks/useCommentsController.ts`、`services/supabase/cache.ts`、`services/supabase/interactions.ts`。当前不改代码。

自动验收：缓存接入后执行本地 mutation fixture，验证当前歌曲、相关用户和权限维度精确失效，其他歌曲缓存不被清空或串改。

实机验收：切歌、快速点赞/删除、前后台切换和账号切换时观察旧行、计数和刷新状态。

#### C11：显式删除有保护边界，但失效封面不会触发数据清理（状态：部分实现）

证据：

- `services/supabase/songs.ts:237-253` 更新封面时只删除非 URL 且非共享的旧 path；`services/supabase/songs.ts:202-235` 删除歌曲时按同样原则删除对象。
- `services/supabase/collections.ts:356-370` 删除集合封面时也跳过 URL 和共享资源；`utils/sharedMedia.ts:1-32` 定义 `shared/covers/v1/` 共享前缀。
- `services/supabase/storageApi.ts:137-142` 的 `clearSignedUrlCache` 只清本地内存/localStorage 签名缓存，不删除 DB canonical path 或 COS 对象。

真实边界：显式删除流程对共享封面有保护；历史对象返回 404 时没有自动清理数据库 path 或 COS 对象。这是当前较安全但不完整的清理边界，不应被误报成“已自动修复历史数据”。

最小修复边界：维持展示失败不远程写入；未来若清理，必须是只读扫描、预览报告、明确确认、按批应用，并保留共享路径和证据。当前不执行扫描或删除。

建议 Luna 写入范围：本轮无运行时代码写入；若未来批准，只新增隔离审计/清理工具，不改 `Bento`、不把展示组件变成自动清理器。

自动验收：对共享、非共享、URL path 和 canonical path fixture 执行显式删除模拟，确认共享对象不删；失效读取只产生诊断/本地缓存处理，不产生远程删除。

实机验收：不以实机验证替代数据清理验收；经授权的小批测试对象验证报告、确认和回滚记录。

## 明确记录但不扩展实现

#### C01：主 AppShell 内的页面上传实例可跨主导航保活（状态：已实现）

证据：`components/layout/AppShell.tsx:63-86,256-296` 在访问上传 tab 后保持上传页挂载，仅通过 `hidden` 切换显示；`pages/Upload.tsx:65-79` 使用页面级 `UploadEditor`。因此同一 AppShell 生命周期内，当前编辑文件、React 状态和多文件队列可跨主导航保留。

这只证明页内保活，不证明浏览器关闭、AppShell 卸载、登出或跨设备恢复。该项不是本轮开发任务。

#### C15：关注/粉丝是展示字段，占位能力只记录（状态：部分实现）

证据：`components/ProfileHeader.tsx:184-193` 展示 `followingCount`/`followersCount`；`pages/Profile.tsx:309-310,349-350,475-491` 有字段映射和 0 默认值。当前源码检索未发现对应 follow/unfollow 交互或服务调用。

本轮不扩展关注/粉丝实现，不将其列入可靠性修复范围。

#### C16：登录诊断只覆盖 Supabase Auth health，不是完整登录链路诊断（状态：部分实现）

证据：`pages/Auth.tsx:29-61,126-145` 请求 `${supabaseUrl}/auth/v1/health` 并显示网络提示；它不验证实际登录、COS、service worker、文件存储或上传任务。

本轮只记录边界，不扩展诊断面。

#### C17：记忆卡片歌词片段仍是“即将开放”占位（状态：未实现）

证据：`components/MemoryCardModal.tsx:273-276` 明确显示“歌词片段 / 即将开放”。

本轮不扩展记忆卡片内容能力。

## 文档一致性

#### C18：旧的上传预览问题描述已不符合当前实现（状态：文档过时）

证据：`docs/KNOWN_ISSUES.md:17` 仍描述预览不会在 out 点自动停止；当前 `components/upload/useUploadDraft.ts:582-590` 在达到 `range[1]` 时会暂停并归零/更新状态。

本条只作为审计记录，未修改 `docs/KNOWN_ISSUES.md` 或其他旧文档。

## 不重新列为开发任务的已完成基线

当前证据未把下列内容重新列为差距：评论分页、回复、删除、分享；M4A 元数据读取/编辑；页面路由和主导航切换；这些能力只在本审计中作为依赖或 smoke 覆盖背景出现。

资料库 Bento 保持现状，不修改。正式 WebGL 液态玻璃材质分支 `codex/webgl-liquid-glass-app-integration` 不合并、不纳入本轮可靠性修复。

## 验证记录与未覆盖事项

已执行的轻量验证：

- `npm run typecheck`：通过。
- `node scripts/cos-history-audit.test.mjs`：通过；该测试只覆盖离线 fixture，不覆盖真实 COS/Supabase。

未执行：真实 COS/Supabase 云端扫描、需要测试账号或运行服务的 smoke、浏览器关闭/真实 COS 404/PWA 离线实测、Android/鸿蒙实机验收。原因是本轮只允许写入本审计文档，且用户明确要求不扩展范围、不运行耗时测试。

本次唯一写入：`docs/RELIABILITY_GAP_AUDIT_2026-08-26.md`。
