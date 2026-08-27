# COS 历史资源只读审计工具 v2

本工具用于把歌曲、专辑、资料库用户引用快照和 COS 对象元数据快照整理成可复查的历史资源报告。工具是 `fixture-only`：不访问网络、不读取环境变量、不导入业务 COS 客户端或 Supabase API，也不执行任何远程对象或数据库变更。

## 安全边界

- 工具的唯一审计模式是本地 `fixture` 模式，默认没有 fixture 时会以非零状态退出。
- `--output` 只写用户指定的本地 JSON 报告；它不代表 COS 写入。
- 工具不会读取 `.env`、`.env.*` 或回显未知参数；报告中的 URL 会去掉查询串和片段。
- 报告中的每一条 `candidate` 都是“待审查候选”，候选不等于可迁移。报告生成本身不改变远程对象、数据库行或客户端播放行为。
- 原始音频始终视为保留资源；重复封面、重复音频和异常播放副本只形成审查候选，不形成清理动作。
- `unreferencedObjects` 只是当前快照中的未引用对象诊断，不会被自动归入迁移候选；快照不完整时也不能据此判断对象是孤儿。
- 快照分页未被证明完整时，报告会保留当前可见数据并明确标记 `unknown`/`incomplete`，不会把部分快照当成全量事实。

## 用法

```text
node scripts/cos-history-audit.mjs --help
node scripts/cos-history-audit.mjs --fixture path/to/cos-history-fixture.json
node scripts/cos-history-audit.mjs --fixture path/to/cos-history-fixture.json --output path/to/cos-history-report.json
```

省略 `--output` 或将其设为 `-` 时，报告输出到标准输出。命令行没有 `--fixture` 时不会尝试猜测生产凭据，也不会发起网络请求，而是明确提示当前版本尚未接入生产数据源。

## Fixture 契约

fixture 是事先准备好的只读快照，最小结构如下：

```json
{
  "generatedAt": "2026-08-26T00:00:00.000Z",
  "songs": [
    {
      "id": "song-001",
      "audio_path": "user/song-001/audio.m4a",
      "file_size": 4000000,
      "duration": 200,
      "stream_audio_path": null,
      "stream_file_size": null,
      "stream_bitrate_kbps": null,
      "cover_path": "legacy/covers/cover-001.jpg"
    }
  ],
  "albums": [
    {
      "id": "album-001",
      "cover_url": "albums/album-001.jpg"
    }
  ],
  "profiles": [
    {
      "id": "user-001",
      "avatar_url": "users/user-001/avatars/v1/avatar.jpg",
      "cover_url": "users/user-001/covers/v1/background.jpg"
    }
  ],
  "objects": [
    {
      "key": "user/song-001/audio.m4a",
      "size": 4000000,
      "kind": "audio"
    },
    {
      "key": "legacy/covers/cover-001.jpg",
      "size": 120000,
      "kind": "cover",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "pagination": {
    "songs": {
      "pageSize": 1000,
      "pages": [{ "page": 0, "offset": 0, "rowCount": 1, "hasMore": false }],
      "totalRows": 1,
      "complete": true
    },
    "albums": { "pageSize": 1000, "totalRows": 1, "fetchedRows": 1, "complete": true },
    "profiles": { "pageSize": 1000, "totalRows": 1, "fetchedRows": 1, "complete": true },
    "objects": { "pageSize": 1000, "totalRows": 2, "fetchedRows": 2, "complete": true }
  }
}
```

字段规则：

- `songs` 使用现有 `songs` 表字段名；工具同时接受对应的 camelCase 字段。`audio_path`、`stream_audio_path` 和 `cover_path` 会被规范化为 object key。
- `albums` 和 `profiles` 是可选的只读数据库快照。`albums` 读取 `id` 与 `cover_path`/`cover_url`；`profiles` 读取 `id` 与 `avatar_path`/`avatar_url`、`cover_path`/`cover_url`，也接受背景字段别名。它们的引用会参与缺失资源、封面重复和未引用对象判断。
- `objects` 是 COS 对象列表快照；`key`、`size`、可选的 `kind` 和 `sha256`/`contentHash`/`hash` 会被读取。也接受 `cosObjects` 或 `cos_objects` 作为列表名称。
- 表数组也可以放在 `snapshot`/`tables` 容器中，或使用 `{ "rows": [...] }` 包装；这只改变本地 fixture 形状，不会触发数据读取。
- `pagination` 是按表记录的快照完整性声明；也接受 `snapshot.pagination`、`snapshotPagination` 和表包装对象中的 `pagination`。推荐同时提供 `pageSize`、`pages`（含 `page`、`offset`、`rowCount`、`hasMore`）、`totalRows` 和 `complete`。`complete: true` 只有在没有下一页、没有页码/offset 间隙且行数一致时才会被接受。
- `generatedAt` 可固定报告时间，以便复跑比较；省略时使用当前 UTC 时间。候选和数组排序不依赖输入顺序。
- 对 Supabase public URL、COS URL 或带签名参数的路径，报告只保留路径部分，不保留 `?` 后的查询串。
- fixture 只应包含审计所需的路径、大小、时长、哈希、歌曲/专辑/用户 ID 和分页元数据，不要放入艺人资料、令牌或其他隐私字段。

## 候选规则与估算

工具依据 `utils/audioDelivery.ts` 和 COS 指南中的现有约定进行离线估算：

1. 高码率音频：源对象存在、歌曲没有 `stream_audio_path`，且扩展名是无损容器（`aif`、`aiff`、`alac`、`flac`、`wav`、`wave`），或按对象大小与歌曲时长估算出的码率严格大于 `256 kbps`。目标码率按 `160 kbps` 估算。
2. 普通 M4A/MP3：扩展名本身不会使歌曲进入高码率候选；只有估算码率超过阈值才会进入。已有播放副本的歌曲不会再次进入高码率候选，即使其原音频看起来是高码率。
3. 缺失资源：歌曲引用的原音频、播放副本或封面路径不在对象快照中时，形成 `missing-resource` 候选。它只表示快照不完整或资源不可见，不能据此猜测远程对象状态。
4. 重复封面：两个或更多不同封面路径具有相同的受支持内容哈希时，形成 `duplicate-cover` 候选，并保留路径、哈希、歌曲/专辑/用户引用和可用对象大小。相同路径被多条记录复用属于正常共享，不会被误报为不同对象的重复。
5. 重复音频：两个或更多不同、可识别为音频的对象具有相同内容哈希时，形成 `duplicate-audio` 候选；没有内容哈希时不按大小或文件名猜测重复。
6. 异常 stream 副本：已引用的 `stream_audio_path` 出现路径等于源音频、源/副本内容哈希相同、声明码率不为正或超过 `256 kbps`、副本不小于源对象、数据库大小与对象大小不一致、或对象类型明显不是音频时，形成 `abnormal-stream-copy` 候选。缺失对象仍由 `missing-resource` 表示；证据不足只在 `streamDiagnostics` 标记 `unknown`，不强行判定异常。
7. 未引用对象：对象 key 不在歌曲、专辑或资料库用户的所有音频/播放副本/头像/封面引用并集时，写入 `unreferencedObjects` 和对应摘要路径。该列表是诊断输出，不是迁移或删除清单。
8. `estimatedPlaybackEgressBytesSavedPerFullPlay` 按“一次完整播放的源对象大小 - `160 kbps` 目标大小”估算；`estimatedDuplicateCoverStorageBytesPotentiallyRemovable` 按保留字典序最小路径后潜在可移除的其他对象大小估算。两个数字分别对应播放下行和一次性存储，时间维度与计费维度不同，禁止相加。费用评估必须结合实际播放次数与存储计费周期；缺少大小或时长时保守记为 `0`，这不是腾讯云账单金额或存储实账。

## 报告结构

输出固定包含：

```text
schemaVersion       报告契约版本，当前为 2
generatedAt         报告生成时间
mode                当前为 fixture
readOnly            固定为 true
candidateSemantics  候选仅供审查的明确声明
warnings            数据完整性、估算限制和模式边界
summary             计数、路径列表和节省字节估算
candidates          稳定排序的候选数组
snapshotPagination  按表的分页完整性审计结果
unreferencedObjects 未引用对象诊断列表，不是迁移清单
streamDiagnostics   已存在播放副本的逐条诊断结果
```

`summary` 至少包含：歌曲、专辑、资料库用户数量；原音频引用数和唯一路径；已有播放副本歌曲数和唯一路径；歌曲/专辑/用户头像与背景封面引用路径；高码率、缺失资源、重复封面、重复音频和异常 stream 候选数；对象总数、已引用对象数、未引用对象数和路径；分页整体状态；`estimatedPlaybackEgressBytesSavedPerFullPlay`、`estimatedDuplicateCoverStorageBytesPotentiallyRemovable` 以及候选总数。报告不提供两种费用口径的合计字段。

候选会带有 `candidateOnly: true`、`migrationReady: false`、`status: "needs-review"`、来源路径或路径组、引用歌曲/专辑/用户 ID、哈希/元数据、对应口径的估算字段和空的 `proposedDatabaseFields`。本版本不生成 `targetPath`，不写回 `stream_*` 字段，也不把估算状态伪装成已验证状态。

`snapshotPagination.status` 和每张表的 `status` 取 `complete`、`incomplete` 或 `unknown`；缺少分页元数据时是 `unknown`，显式未完成、存在下一页、页码/offset 间隙或行数不一致时是 `incomplete`。`complete: true` 只表示提供的本地快照满足一致性声明，不表示远端此刻没有变化。

## 前向止损：头像和背景上传

`services/supabase/profiles.ts` 的未来头像/背景 key 使用以下内容寻址形式：

```text
<userId>/<avatars|covers>/v1/<contentHash>.<ext>
```

上传使用现有 `cosClient.uploadFileIfAbsent`，同一用户、类型和字节内容会复用同一个对象，不再使用时间戳或随机数制造新路径。历史随机对象不会被扫描代码或上传代码删除；旧 profile 行也不会被批量改写。

COS 客户端对图片使用长时 `private, max-age=2592000, immutable` 缓存，签名 URL 缓存按对象 key 区分。内容寻址使“内容变化”同时表现为新 key，因而不需要给 immutable URL 追加随机查询参数；`pages/Profile.tsx` 的本地媒体缓存仍以原始 key 匹配并在上传后替换头像/背景的签名结果。旧 key 继续按现有签名/回落逻辑读取，不做删除或覆盖。

## 必须遵守的后续流程

历史 COS 资源必须按以下顺序推进：

1. **只读扫描**：使用本工具或未来等价的只读快照适配器生成报告。
2. **Sol 审查报告**：检查候选规则、引用关系、哈希/元数据、缺失项、成本口径和稳定复跑结果。
3. **用户批准**：由用户明确批准精确候选范围、批次上限、成本上限、源文件保留策略、有效期和回滚方案。
4. **未来另一个小批迁移任务**：必须获得新的边界清晰 handoff，在独立白名单和批准门内实施；先验证副本，再按批准方案处理可空字段。

本任务和本工具只停在第 1 步，绝不迁移。客户端启动、登录、播放或页面打开也不得触发历史资源处理。

## 只读实盘快照适配器

`scripts/cos-history-live-snapshot.mjs` 是与 fixture-only 审计算法隔离的实盘快照适配器。它先用测试账号登录 Supabase，再读取当前认证会话在 RLS 下可见的三张表，随后用 `cos-nodejs-sdk-v5` 只分页调用 COS 对象清单接口，写出脱敏 fixture，最后调用本文件前述的 `scripts/cos-history-audit.mjs` 生成报告。适配器不会修改审计算法或应用运行时代码。

### 运行方式

Node 脚本不会自动加载 `.env` 文件；请在命令外部显式注入环境变量。首选变量如下：

```text
JZONE_SUPABASE_URL
JZONE_SUPABASE_ANON_KEY
JZONE_TEST_EMAIL
JZONE_TEST_PASSWORD
JZONE_COS_SECRET_ID
JZONE_COS_SECRET_KEY
JZONE_COS_BUCKET
JZONE_COS_REGION
```

Supabase URL 和 anon key 也兼容仓库已有的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`；COS 凭据不复用 `VITE_COS_*`。缺少任意必要变量时命令以非零状态退出，并明确列出缺少的变量名，不发起远程扫描。

```text
npm run audit:cos-history-live
npm run smoke:cos-history-live-snapshot
```

默认输出：

```text
output/cos-history/cos-history-live-snapshot.json
output/cos-history/cos-history-live-report.json
```

可以用 `--output-dir` 指定本地输出目录，用 `--page-size` 指定 1 到 1000 的分页大小。`--max-pages` 只用于受控验证或成本受限的扫描；一旦提前停止，fixture 和报告都会标记 `incomplete`，不能当作全量事实。

### 只读与脱敏边界

- COS 只调用 `getBucket` 对象清单接口，分页参数使用 `Marker` 和 `MaxKeys`，fixture 保留每个对象的 `key`、`size`、`etag`、`lastModified`。不下载对象，不逐对象发起 HEAD，不写入或删除对象。
- Supabase 只调用 `signInWithPassword` 建立内存认证会话，然后对 `songs`、`albums`、`profiles` 使用 `select`、`order`、`range` 分页读取。查询字段为：`songs.id,audio_path,file_size,duration,stream_audio_path,stream_file_size,stream_bitrate_kbps,cover_path`、`albums.id,cover_url`、`profiles.id,avatar_url,cover_url`。
- 数据库结果采用 allow-list 重新组装，不输出 `owner_id`、标题、艺人、昵称、邮箱、令牌或其他未列入审计契约的字段；URL 查询串和签名参数会在写文件前去除，敏感值检查失败时不会继续生成报告。
- fixture 的 `snapshotScope.database` 固定标注为 `current-authenticated-account-visible-under-RLS`，并以 `databaseIsFullDatabase: false` 明确它不是数据库全库。COS 范围是配置 bucket 的对象清单，不把数据库可见行冒充全库。
- 报告保留既有审计的 `mode: "fixture"`，并增加 `sourceMode: "live-read-only"`、`snapshotScope`、`sourcePagination` 和 `readOnlyControls`；报告中的候选仍然只是待审查候选，不产生迁移目标。

分页元数据同时写入四张表的 `pagination`。每张表都包含 `pageSize`、`pages`、`fetchedRows`、`totalRows`、`complete` 和 `status`；`status` 只能是 `complete` 或 `incomplete`。默认完成整段分页后才会写 `complete: true`；COS marker 缺失/重复、Supabase 行数不一致或显式页数上限都会写 `incomplete`。审计报告会将它们汇总到 `snapshotPagination`，并在不完整时保留警告。

本仓库只对本地 schema 和类型做字段契约确认：`supabase/sql/005_add_albums.sql`、`supabase/sql/006_profiles.sql` 与 `services/supabase/types.ts` 定义了上述字段。适配器不绕过 RLS 读取服务端全库；若目标 Supabase 实例缺少这些字段，Supabase 查询错误会使命令失败，而不是生成假 `complete` 快照。

本地验证命令：

```text
node scripts/cos-history-audit.test.mjs
node scripts/cos-history-audit.mjs --help
node --check scripts/cos-history-live-snapshot.mjs
node --check scripts/smoke-cos-history-live-snapshot.mjs
npm run audit:cos-history-live -- --help
npm run smoke:cos-history-live-snapshot
```
