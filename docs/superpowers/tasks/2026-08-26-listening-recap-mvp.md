# 聆听回顾一期 MVP：Luna 并行执行任务

> 工作目录：`G:\2026\webApp\JZone2\jzone-player`
> 目标分支：`codex/next-stage-20260826`
> 依据：已批准的 [`docs/LISTENING_RECAP_PRD.md`](../../LISTENING_RECAP_PRD.md)
> 本执行单只描述后续一期实现，不把计划、夹具或预期结果写成已通过证据。

## 1. 执行边界与已批准默认

本单只允许拆给多个 Luna 并行执行。每个任务只能写自己的白名单文件；需要触碰其他任务文件、已有用户/代理变更、远程数据库或远程数据时，立即停止并上报 Sol，不自行扩大范围、不回退、不覆盖。

用户已批准 PRD 第 15 节四项推荐默认：

1. **一期章节**：时间开场、真实摘要、陪伴最久、条件式“你留下的声音”、时间结尾/去重播放队列；“重新遇见”“声音与时间”“属于某一天”延后到 1.1。
2. **离线归属**：客户端离线时只保留待同步事件；重连后按服务端 `accepted_at` 入窗，客户端 `observed_at` 仅作诊断，不参与周期查询。
3. **导航**：使用 `/listening-recap` 二级路由，周期参数为 `?period=YYYY-MM` 或 `?period=YYYY`；保留 Mini 播放器，回顾页隐藏底部一级 Tab，不新增一级 Tab。
4. **1.1 证据门槛**：重逢必须跨两个 `Asia/Shanghai` 自然日且来自两个会话；主时段至少 3 个事件且占比至少 50%；“属于某一天”至少同日 2 个事件。低于门槛就隐藏，不用自由文案补齐。

一期最小价值链固定为：

```text
首页最底部入口 → /listening-recap → 周期选择 → 真实摘要
→ 陪伴最久 →（有条件才显示）你留下的声音
→ 播放这段时间的声音
```

一期不做公共统计、创作者表现、情绪/记忆自由文案、原始事件时间线、无限历史或跨用户比较。事件可以保存完整 `accepted_at`，但一期读取响应不得实现三个 1.1 高级章节。

## 2. 当前基线与远端只读事实

### 2.1 仓库基线

- 当前分支为 `codex/next-stage-20260826`；执行前后都必须检查 `git status --short`，保留已有变更。
- 现有 D1 有效播放口径是 `max(1 秒, 裁剪后有效播放区间 × 20%)`；有效区间短于主门槛时，播放到有效结尾是兜底；暂停/继续沿用会话，seek 不贡献有效时长，同一页面会话已有 `counted` 去重。
- 现有 `store.tsx` 在达到门槛后会触发歌曲总计、个人累计和 `jzone:play-counted`；旧 `user_song_plays` 仍服务首页“常听”，不得被改造成月份假数据。
- 现有路由不依赖 `react-router`；`hooks/useAppRoute.ts`、`components/layout/AppShell.tsx` 和 `pages/Home.tsx` 是 D 任务的唯一既有写集。

### 2.2 远端只读快照

以下事实由当前任务输入提供，作为迁移前的只读基线记录；Luna 不需要、也不得自行重新查询或写入远端：

| 项目 | 当前事实 |
| --- | --- |
| Supabase project ref | `crlbemhdwsbyhsqlbqbq` |
| `songs` | 13 行 |
| `user_song_plays` | 21 行 |
| `profiles` | 2 行 |
| `comments` | 3 行 |
| 现有歌曲总计 RPC | `increment_song_play(p_song_id uuid)` |
| 现有个人累计 RPC | `increment_user_song_play(p_song_id uuid)` |

本文件、SQL、日志、fixture 和验收证据均不得包含 Supabase URL、anon/service key、JWT、密码或任何其他密钥。project ref 不是密钥，但不得据此推导或记录凭据。

## 3. 共同数据与接口契约

以下契约是 A–F 的并行对齐面。若实现发现契约不足，先停在本任务边界内向 Sol 报告；不能在各自分支中私自改字段名、RPC 名或状态语义。

### 3.1 时间、窗口与覆盖

- 统计时区固定为 `Asia/Shanghai`；数据库时间为 UTC `timestamptz`，接口的 `start`、`end`、`asOf` 为 ISO 时间字符串。
- 所有窗口是半开区间 `[start, end)`：当前月/今年的 `end` 为服务端 `asOf`，完整的上个月/往年为下一个自然边界。
- URL：`/listening-recap` 默认服务端当前自然月；`?period=YYYY-MM` 为月；`?period=YYYY` 为年。非法参数、空参数或没有可用覆盖信息回到当前自然月，不使用 `all`。
- 客户端不以设备本地时区计算窗口，不用 `updated_at`、上传时间、最近播放 ID、歌曲标题或旧累计推导事件时间。
- `accepted_at` 是唯一入窗时间。离线待同步事件不携带客户端指定的 `accepted_at`；服务端接收时生成它。
- 覆盖状态必须能区分：
  - `event_complete`：事件源覆盖整个选择窗口，摘要数字只来自有效事件；可以是 0 条，但 UI 对 0 条显示无事件文案。
  - `event_partial`：事件源从已知 `coverageStart` 后才覆盖，所有数字附带覆盖段说明。
  - `legacy_only`：窗口只有旧 `user_song_plays` 聚合，不能生成窗口数字、日期、时段、重逢或队列。
  - `no_event`：服务端确认事件源在所选覆盖范围内没有有效事件；可以如实显示 0，但不能把请求失败当成 0。
  - `error`：查询/权限/网络失败；保留已有确认值并标记 stale 或显示重试，不清空为 0。

### 3.2 推荐应用层 JSON 响应

`get_listening_recap` 的 JSON 与 B 暴露给页面的 `ListeningRecapResponse` 应同构；数据库列仍可使用 snake_case，但不得让 C 自行猜字段。以下是有事件的推荐示例，`coverUrl` 可为 `null`：

```json
{
  "schemaVersion": "listening-recap.v1",
  "coverageVersion": "events-v1",
  "period": {
    "type": "month",
    "id": "2026-08",
    "timezone": "Asia/Shanghai",
    "start": "2026-07-31T16:00:00.000Z",
    "end": "2026-08-26T07:30:00.000Z",
    "asOf": "2026-08-26T07:30:00.000Z"
  },
  "coverage": {
    "status": "event_complete",
    "source": "listening_play_events",
    "coverageStart": "2026-07-31T16:00:00.000Z",
    "messageKey": null
  },
  "summary": {
    "validPlayCount": 12,
    "songCount": 4,
    "listeningDayCount": 7
  },
  "opening": {
    "title": "2026 年 8 月的声音",
    "coverSong": {
      "id": "00000000-0000-0000-0000-000000000001",
      "title": "本期歌曲",
      "artist": "作者",
      "coverUrl": null,
      "visibility": "public",
      "validPlayCount": 5,
      "firstAcceptedAt": "2026-08-02T02:00:00.000Z",
      "lastAcceptedAt": "2026-08-20T03:00:00.000Z"
    }
  },
  "longestCompanion": {
    "songs": [],
    "validPlayCount": 5,
    "isTie": false
  },
  "ownedSounds": {
    "songCount": 1,
    "songs": []
  },
  "queue": {
    "songIds": [
      "00000000-0000-0000-0000-000000000001"
    ],
    "totalCount": 1,
    "truncated": false,
    "order": "first_accepted_at_asc_song_id_asc"
  },
  "generatedAt": "2026-08-26T07:30:01.000Z",
  "error": null
}
```

字段和行为约束：

- `summary.validPlayCount` 是窗口内服务端接受的唯一有效事件数；`songCount` 是当前用户可见且至少有一个有效事件的歌曲数；`listeningDayCount` 是 `accepted_at` 转 `Asia/Shanghai` 后的去重自然日数。
- `longestCompanion.songs` 最多 2 首，按窗口有效事件数降序；平局按最后一次 `accepted_at` 降序，再按 `songId` 稳定排序。它只表达“本期有效播放数最高”，不表达喜欢程度。
- `ownedSounds` 只在服务端确认 `owner_id = auth.uid()` 且本期有事件时返回；本人拥有的公开与私有歌曲都允许进入，最多展示 3 首。`visibility` 只用于私有标签，不得被解释为媒体类型。
- `queue.songIds` 是当前用户当前可见歌曲的去重结果，按最早有效事件稳定排序，一期最多 50 个；超出时 `truncated=true` 且 UI 明确“本次播放前 50 首”。不使用最近播放 ID 或旧累计补齐。
- `opening.coverSong` 只能来自本期有效事件歌曲，优先陪伴最久、其次最早事件；没有封面时保留歌曲事实但 `coverUrl=null`，没有事件时不能拿旧周期封面填空。
- `legacy_only` 时 `summary` 为 `null`、章节候选为 `null`、`queue.songIds=[]`，并返回覆盖说明；不能说“本月 0 次”。
- `no_event` 时 `summary` 可为 `{ "validPlayCount": 0, "songCount": 0, "listeningDayCount": 0 }`，`longestCompanion`、`ownedSounds` 和队列为空，文案为“本期还没有可回顾的有效播放”。
- `error` 时 `error` 至少含 `code`、`retryable`；不要通过一个空成功响应伪装错误。已有缓存响应可由 hook 保留并在 hook 状态上标记 `stale`。
- 响应不返回原始事件列表、音频内容、IP、设备指纹、评论或公共聚合；歌曲元数据只返回当前用户可见记录。公共统计不属于一期。

### 3.3 TypeScript 与缓存接口

B 必须提供以下稳定的类型/方法，C、D、E 只依赖这些名字，不直接调用 Supabase client：

```ts
type ListeningRecapPeriodType = 'month' | 'year';

interface ListeningRecapPeriod {
  type: ListeningRecapPeriodType;
  id: string; // month: YYYY-MM; year: YYYY
}

interface ListeningRecapRecordEventInput {
  eventId: string;
  playSessionId: string;
  songId: string;
  metric: 'qualified_play';
  policyVersion: 'd1-20pct-v1';
  observedAt?: string | null;
  qualifyingSeconds?: number | null;
  listenedSeconds?: number | null;
}

interface ListeningRecapRecordEventResult {
  status: 'accepted' | 'duplicate';
  isNew: boolean;
  eventId: string;
  playSessionId: string;
  songId: string;
  metric: 'qualified_play';
  policyVersion: 'd1-20pct-v1';
  acceptedAt: string;
  userSongPlayCount: number;
}

// 只从登录会话取得用户身份；调用方不传 userId。
fetchListeningRecap(period?: ListeningRecapPeriod): Promise<ListeningRecapResponse>;
recordListeningPlayEvent(input: ListeningRecapRecordEventInput): Promise<ListeningRecapRecordEventResult>;
```

`useListeningRecap(period)` 返回 `loading | ready | stale | error` 状态、响应、`retry` 和当前请求周期；切换周期后旧响应不能覆盖新周期。`useListeningRecapPreview()` 只读当前用户、当前月的轻量缓存，供首页入口使用；冷启动不得为了入口拉原始事件或完整歌曲列表，缓存未命中时只显示中性“查看本期回顾”，不得猜测本期有/无播放。

回顾缓存键固定为：

```text
jzone_listening_recap_v1:{userId}:{periodType}:{periodId}:{coverageVersion}
```

缓存 5 分钟；账号切换、退出登录和授权变化清掉旧用户的回顾内存/本地缓存；请求失败保留旧确认值并标 stale，不清零；禁止无用户前缀或跨用户共享回顾缓存。B 不得修改通用 `services/supabase/cache.ts` 来影响其他页面，除非 Sol 另行批准；优先使用回顾专用缓存模块。

### 3.4 `record_listening_play_event` RPC 输入/输出

这是 A 实现、B 调用、E 生成输入的唯一记录 RPC。函数名、参数名和返回字段必须保持一致：

```text
public.record_listening_play_event(
  p_event_id uuid,
  p_play_session_id uuid,
  p_song_id uuid,
  p_metric text,
  p_policy_version text,
  p_observed_at timestamptz default null,
  p_qualifying_seconds double precision default null,
  p_listened_seconds double precision default null
) returns jsonb
```

输入约束：

- 不接受 `p_user_id` 或客户端 `p_accepted_at`；用户由 `auth.uid()` 取得，`accepted_at` 由数据库 `now()` 生成。
- 一期固定 `p_metric = 'qualified_play'`、`p_policy_version = 'd1-20pct-v1'`；未知指标/策略拒绝，不静默混算。
- `p_event_id`、`p_play_session_id`、`p_song_id` 必须为有效 UUID；诊断秒数只能是有限非负数，不能改变服务端入窗时间。
- 服务端确认歌曲存在且当前用户可见：公开歌曲或 `owner_id = auth.uid()`；私有歌曲只对拥有者可接收，不能靠客户端过滤。

成功或幂等重复的返回 JSON：

```json
{
  "status": "accepted",
  "isNew": true,
  "eventId": "00000000-0000-0000-0000-000000000010",
  "playSessionId": "00000000-0000-0000-0000-000000000011",
  "songId": "00000000-0000-0000-0000-000000000001",
  "metric": "qualified_play",
  "policyVersion": "d1-20pct-v1",
  "acceptedAt": "2026-08-26T07:30:00.000Z",
  "userSongPlayCount": 22
}
```

- 首次接收返回 `status=accepted,isNew=true`，在同一事务内写事件并增加 `user_song_plays` 聚合。
- 同一 `(user_id,event_id)` 重试返回第一次的事件和 `acceptedAt`，`isNew=false`，不重复聚合。
- 同一 `(user_id,play_session_id,metric)` 使用新 event ID 重试时返回已存在的规范事件、`status=duplicate,isNew=false`，不新增第二次有效播放；不同主动会话可以分别计数。
- 事件写入、个人累计更新和覆盖记录必须原子完成；`songs.plays_count` 是兼容旁路，不能阻塞事件确认。现有两个旧 RPC 保留给旧客户端，迁移不得重写其签名。
- 建议错误码固定为 `not_authenticated`、`song_not_allowed`、`invalid_input`、`invalid_metric`、`invalid_policy`、`event_conflict`；网络/5xx 才可重试，权限/冲突/参数错误不得无限重试。

### 3.5 查询 RPC 与隐私

A 建议提供下列安全函数，B 只用登录会话调用：

```text
public.get_listening_recap(
  p_period_type text,
  p_period_id text default null
) returns jsonb
```

`p_period_type` 只能是 `month` 或 `year`；`p_period_id=null` 表示由服务端当前时刻解析当前自然月。函数返回第 3.2 节 JSON，聚合只在服务端完成，不向浏览器下发全量事件。所有歌曲 join 都要同时遵守公开可见或 `owner_id = auth.uid()`；本人私有歌曲可以出现在本人响应，不能出现在另一账号响应、公共聚合、日志、错误页或无用户缓存。

## 4. 并行 ownership 总表

| 任务 | 唯一写集 | 可以读取 | 明确不写 |
| --- | --- | --- | --- |
| A 数据迁移/RLS/RPC/fixture | 新增 `supabase/sql/021_listening_recap_mvp.sql`、`supabase/fixtures/listening-recap-mvp.sql`、`supabase/fixtures/listening-recap-response-fixtures.json` | 现有 SQL、PRD、本单契约 | 既有 SQL、TypeScript、远端、依赖、文档 |
| B TypeScript API/types/cache hook | 新增 `services/supabase/listeningRecapTypes.ts`、`services/supabase/listeningRecap.ts`、`services/supabase/listeningRecapCache.ts`、`hooks/useListeningRecap.ts`；修改 `services/supabase/supabaseApiImpl.ts`、`services/supabase/index.ts` | A 契约、现有 client/storage helper | 页面、路由、`store.tsx`、通用 cache、SQL、远端 |
| C 页面与章节纯 UI | 新增 `pages/ListeningRecap.tsx`、`components/listening-recap/**` | B 导出的类型/hook、A 的响应 fixture | 既有页面、路由、AppShell、播放器、全局 CSS、Supabase 查询 |
| D 路由/AppShell/首页入口 | 修改 `hooks/useAppRoute.ts`、`components/layout/AppShell.tsx`、`pages/Home.tsx` | B preview hook、C 页面 props、现有播放器/路由 | `App.tsx`、`store.tsx`、底部导航组件、PlayerView、Library/Bento |
| E 播放器事件写入/向后兼容 | 修改 `store.tsx`；新增 `utils/listeningRecapEventOutbox.ts` | B 的 record API、A RPC 契约、现有 D1 代码 | D1 公式和 seek 逻辑、API 文件、旧 SQL、页面/路由 |
| F smoke/构建/双账号/手机验收 | 新增 `scripts/smoke-listening-recap.mjs`、`artifacts/listening-recap/**` 证据 | 全部任务产物、Sol 远端迁移交接 | 任意业务源文件、SQL、远端数据库、package/依赖 |

**写集规则**：`components/listening-recap/**` 只属于 C；不能让 C、D、F 在其中放测试或修复。`services/supabase/supabaseApiImpl.ts` 和 `services/supabase/index.ts` 只属于 B。F 不得把“修复”写回源文件；失败就报告给对应 owner。

## 5. 任务 A：数据迁移、RLS、RPC 与本地 fixture

### 目标

在本地/隔离数据库中交付一期事件源、覆盖起点、RLS、幂等记录 RPC、回顾查询 RPC 和可重复 fixture，为 Sol 审查后执行远端迁移准备单一 SQL 变更。不要改旧累计表的定义或把旧累计回填成事件。

### 允许文件

- 新增 `supabase/sql/021_listening_recap_mvp.sql`。
- 新增 `supabase/fixtures/listening-recap-mvp.sql`，只用于本地/隔离验证。
- 新增 `supabase/fixtures/listening-recap-response-fixtures.json`，提供 `event_complete`、`event_partial`、`legacy_only`、`no_event`、`error` 的脱敏响应样例，供 B/C/F 对齐。

### 禁止文件与操作

- 禁止修改 `001_init.sql`、`003_plays.sql`、`011_user_song_plays.sql` 或任何既有 SQL。
- 禁止修改 TypeScript、页面、路由、依赖、package 文件和任何其他文档。
- 禁止调用 Supabase connector、SQL Editor、CLI、REST/RPC 远端写接口，禁止插入/删除/清理远端 fixture。
- 禁止建立公共聚合、创作者表现、媒体类型字段、历史回填或 1.1 章节查询。

### 输入/输出契约

输入：第 3 节契约、现有 `songs`/`user_song_plays` 结构、D1 policy version `d1-20pct-v1`。

输出至少包含：

- 新事件表：`event_id`、`user_id`、`play_session_id`、`song_id`、`metric`、`policy_version`、`accepted_at`、可选诊断字段；外键和索引适合按用户/时间/歌曲聚合。
- 覆盖起点/版本记录，能区分窗口在事件启用前、跨启用点和启用点之后；不回填历史。
- RLS：事件只能由本人读取；客户端不能直接插入/更新/删除，记录由安全 RPC 完成；安全函数固定 `search_path`，不依赖客户端 `user_id`。
- `record_listening_play_event` 与 `get_listening_recap` 的签名、错误语义和第 3.2/3.4/3.5 节一致。
- 事件、个人累计和覆盖标记同事务；旧 `increment_song_play(uuid)` 与 `increment_user_song_play(uuid)` 保持可执行和原签名。
- fixture 覆盖：两个账号、本人公开/私有歌曲、他人公开歌曲、重复 event ID、同会话不同 event ID、不同会话、UTC/Asia/Shanghai 月边界、无事件/旧累计、元数据不可见。fixture 不含真实 project key 或真实用户凭据。

### 依赖

- 只依赖已批准 PRD、本执行单契约和本地现有 SQL。
- 不依赖远端迁移；如本地环境缺少 Supabase CLI，交付可审查 SQL 与明确的未覆盖项，不自行安装依赖或转向远端。
- B/E 可依据本单契约并行写 mock/调用；A 不等待它们修改源文件。

### 验证

1. 在隔离本地数据库执行新 SQL 和 fixture；检查创建对象、唯一约束、索引、RLS、grant 和安全函数。
2. 以账号 A/B 分别验证：A 能读自己的事件和私有歌曲；B 读不到 A 的事件、私有歌曲标题/封面/次数；客户端传入伪造用户 ID 不改变归属。
3. 重复提交同一事件返回同一 `acceptedAt` 且聚合只加一次；同会话换 event ID 也不能产生第二事件；新会话可产生新事件。
4. 固定 UTC 边界验证 `Asia/Shanghai` 自然月与 `[start,end)`；`accepted_at` 跨月时只归入服务端接受的窗口。
5. 对所有 fixture 生成脱敏结果或快照，让 B/C/F 能逐状态断言。把 SQL diff、验证命令和失败原因交给 Sol 审查。

### 停止条件

- 必须修改旧迁移、改变旧 RPC 签名、直接开放事件表写权限、依赖客户端过滤隐私或无法证明幂等/原子性。
- SQL 需要远端连接、密钥、人工清库、不可逆删除、历史回填或公共聚合才能验证。
- 任何窗口把 `updated_at`/上传时间当事件时间，或 `legacy_only` 被生成窗口数字。

### 远端批准门

A 只交付本地 SQL 和 fixture，并等待 Sol 审查。**先本地 SQL 文件与隔离验证，后由 Sol 使用 Supabase 连接器执行远端迁移**；Luna 不得自行远端操作。Sol 执行前必须确认迁移文件、对象列表、RLS 矩阵、回滚/停用方案和只读基线；执行后只由 Sol 记录函数签名、迁移结果和必要的只读事实，不在本任务中写密钥。

## 6. 任务 B：TypeScript API、types、cache hook

### 目标

提供单一回顾读取 API、记录事件 API、严格 TypeScript 类型和用户/周期隔离缓存 hook，让 C/D/E 不直接接触 Supabase client、RPC 细节或原始事件。

### 允许文件

- 新增 `services/supabase/listeningRecapTypes.ts`。
- 新增 `services/supabase/listeningRecap.ts`。
- 新增 `services/supabase/listeningRecapCache.ts`。
- 新增 `hooks/useListeningRecap.ts`。
- 修改 `services/supabase/supabaseApiImpl.ts` 以挂载回顾 API。
- 修改 `services/supabase/index.ts` 以导出回顾类型/API。

### 禁止文件与操作

- 禁止修改 `services/supabase/interactions.ts`、`services/supabase/songs.ts`、`services/supabase/cache.ts`、`storageApi.ts` 和 `supabaseClient.ts`。
- 禁止修改 `store.tsx`、任何页面/组件/路由、SQL、fixture、package 或依赖。
- 禁止传入或信任 `userId` 参数，禁止客户端拉全量事件后聚合，禁止直接远端 SQL/RPC 操作或远端 fixture 写入。
- 禁止为私有封面改 COS、上传或签名机制；如需封面 URL，只复用现有 helper，失败返回 `null`。

### 输入/输出契约

- 实现第 3.3 节的 `ListeningRecapPeriod`、`ListeningRecapResponse`、`ListeningRecapRecordEventInput/Result`，字段名和状态不漂移。
- `fetchListeningRecap(period?)` 只调用 `get_listening_recap`；无 period 时允许服务端解析当前月并把规范 period 回传给页面。
- `recordListeningPlayEvent(input)` 只调用 `record_listening_play_event`；不带用户 ID/客户端 `acceptedAt`，原样保留服务端 `acceptedAt` 和 `isNew`。
- `useListeningRecap(period)` 实现 5 分钟用户隔离缓存、同用户同周期并发合并、周期切换取消/忽略旧响应、后台刷新、stale 保留和 retry。
- `useListeningRecapPreview()` 只读用户隔离的当前月缓存，不能冷启动请求完整响应；账号切换/退出时清除旧用户状态。
- API 错误映射为稳定 code/retryable；`legacy_only`、`no_event`、`error` 不得互相伪装。

### 依赖

- 依赖第 3 节契约和 A 的本地 RPC/JSON fixture；远端迁移未执行时用本地 mock/fixture 检查字段，不等待 Luna 远端操作。
- C 依赖 hook 和类型；D 依赖 preview hook；E 依赖 `recordListeningPlayEvent`。这三个消费者可以并行先写调用方。

### 验证

1. 用 A 的五类脱敏 JSON fixture 做类型解析/映射，确认无事件、旧累计、错误不返回伪造窗口数字。
2. 静态检查请求 payload 不含 `userId`，缓存键严格包含用户、周期和版本；同一 key 合并请求，切账号不会命中旧用户。
3. 模拟缓存命中、过期后台刷新、刷新失败和周期快速切换；确认旧确认内容只标 stale，不被失败响应覆盖。
4. 检查响应中仅存在当前用户可见歌曲字段，没有原始事件列表、评论、IP、设备信息或公共聚合。
5. 运行 `npm run typecheck`；若其他任务尚未接入导致失败，只报告依赖缺口，不修改非白名单文件。

### 停止条件

- 必须修改共享 cache 语义、修改旧 API、把 `userId` 作为授权依据、让客户端聚合原始事件、用旧累计补当前窗口或让请求失败清零。
- 为签名封面/音频需要改 COS、上传、液态玻璃或依赖；或需要直接连接远端 Supabase 才能完成验证。

## 7. 任务 C：页面与章节纯 UI

### 目标

新增一个只消费 B 响应的连续叙事页面和一期章节组件。页面负责展示状态、顺序、周期选择回调和播放回调，不查询原始事件、不承担路由历史、不复制播放器/底部导航。

### 允许文件

- 新增 `pages/ListeningRecap.tsx`。
- 新增 `components/listening-recap/**` 下的章节组件和仅供这些组件使用的本地类型/辅助函数。

推荐组件拆分：`Opening`、`Summary`、`LongestCompanion`、`OwnedSounds`、`Ending`、`Status`；文件名可在该目录内调整，但不能移出 C 的写集。

### 禁止文件与操作

- 禁止修改 `Home.tsx`、`AppShell.tsx`、`useAppRoute.ts`、`store.tsx`、`PlayerView`、`PlayerBar`、全局 CSS、Library/Bento、上传、评论、液态玻璃 WebGL、SQL 或 API。
- 禁止直接导入 Supabase client、调用 `fetch`/RPC、读取 localStorage 原始回顾键、拉歌曲列表或自行计算窗口/统计。
- 禁止实现或展示“重新遇见”“声音与时间”“属于某一天”三个 1.1 章节；不留下空卡片占位。

### 输入/输出契约

页面接收并只调用以下 props：

```ts
interface ListeningRecapPageProps {
  period?: ListeningRecapPeriod;
  onBack: () => void;
  onPeriodChange: (period: ListeningRecapPeriod) => void;
  onPlaySong: (songId: string) => void;
  onPlayQueue: (songIds: string[], startSongId: string) => void;
}
```

- 页面按固定顺序渲染：开场 → 摘要 → 陪伴最久 →（条件式）你留下的声音 → 结尾队列。
- `event_complete`/`event_partial` 显示真实摘要；`legacy_only` 显示覆盖不足说明；`no_event` 显示明确无事件文案；`error` 显示错误码/重试，不显示 0。
- `longestCompanion` 空则整章隐藏；平局最多展示两首并写“并列最多”；不回退 `songs.plays_count` 或 `user_song_plays`。
- `ownedSounds` 只渲染服务端返回的本人拥有歌曲；公开/私有视觉质量一致，私有只显示本人可见标签，不推断“私人录音”等媒体类型。
- 结尾仅把 `queue.songIds` 去重后交给 `onPlayQueue`，从第一首开始；没有队列时按钮隐藏/禁用；重复点击在请求中幂等；不直接写播放统计。
- 支持 390×844、连续滚动、键盘/屏幕阅读器、`prefers-reduced-motion`；大封面/大文字/留白成立，不做 KPI 卡片墙、饼图或持续高成本 WebGL。

### 依赖

- 依赖 B 的类型/hook 和 A 的响应 fixture；D 提供路由与播放回调。C 可以用 fixture 独立完成 UI，不等待远端迁移。
- 不依赖 E 的具体实现；`onPlaySong/onPlayQueue` 是唯一播放边界。

### 验证

1. 用 A 的五种状态逐一渲染，确认空/错误/旧累计不生成虚构章节和数字。
2. 断言章节顺序、`longestCompanion` 平局、owned 章节私有标签、队列上限提示和按钮回调参数。
3. 浏览器检查 390×844 连续滚动、回顾页返回、减少动效；确认没有第二个 Mini 播放器或底部导航。
4. 静态搜索 C 写集，确认无 Supabase client、原始事件字段读取、日期计算和其他任务文件修改。

### 停止条件

- UI 需要自行猜统计、依赖旧累计填空、展示 1.1 章节、把错误渲染成 0、通过客户端过滤私有内容或需要修改全局样式/播放器。
- 路由历史、AppShell 层级或队列业务必须在 C 文件中实现；应交回 D/Sol，而不是跨边界修补。

## 8. 任务 D：路由、AppShell 与首页入口

### 目标

接入 `/listening-recap` 二级路由，保留 Mini 播放器、隐藏底部一级 Tab，并在首页 `FocusRail` 后增加唯一的动态编辑式入口；不改变首页“常听”、其他一级 Tab 或资料库。

### 允许文件

- 修改 `hooks/useAppRoute.ts`。
- 修改 `components/layout/AppShell.tsx`。
- 修改 `pages/Home.tsx`。

### 禁止文件与操作

- 禁止修改 `App.tsx`、`components/navigation/BottomNavigation.tsx`、`store.tsx`、`PlayerView`/`PlayerBar`、`pages/Library.tsx`、`components/CollectionBentoWall.tsx`、上传、评论、液态玻璃 WebGL、SQL、API、package 或依赖。
- 禁止引入路由依赖、把回顾伪装成一级 Tab、移动/重排“常听”、改写 Home 现有个人累计/最近播放缓存或读取原始事件。
- 禁止用设备本地时区给服务端窗口定界；不得因入口预览冷启动拉全量事件/歌曲。

### 输入/输出契约

`useAppRoute` 增加等价于以下能力，命名可保持项目风格但语义不能改变：

```ts
isListeningRecap: boolean;
listeningRecapPeriod: ListeningRecapPeriod | null;
openListeningRecap: (period?: ListeningRecapPeriod, push?: boolean) => void;
closeListeningRecap: () => void;
replaceListeningRecapPeriod: (period: ListeningRecapPeriod) => void;
```

- 解析 `/listening-recap` 和 period；无/非法参数默认为当前自然月，支持直接 URL、刷新、前进/后退。周期切换更新 URL，不丢正在播放的歌曲/队列。
- 通过 C 的 `ListeningRecapPage` 接入 B hook，播放回调绑定现有 `playContext`；结尾只传事件歌曲 ID，不写统计。
- AppShell 在回顾路由隐藏 `BottomNavigation`，但保持现有 Mini `PlayerBar`、展开 PlayerView、音频、队列和转场；不得复制任何播放器或导航。
- Home 只在当前 `FocusRail` 之后、安全区留白之前追加入口；入口只读 B 的 cache-only preview。缓存命中可展示本期真实摘要/封面状态；缓存未命中只展示周期标题和进入动作，不编造有/无播放。
- 回顾直接访问或刷新不能导致 `activeTab`、资料库 Bento、上传、评论和 Profile 行为变化；返回首页后现有一级 Tab 继续工作。

### 依赖

- 依赖 B 的 `useListeningRecapPreview` 和类型、C 的页面 props；可先用稳定接口和静态占位并行开发。
- 依赖现有 AppShell/route 结构，不依赖 `App.tsx` 改动，不等待远端迁移。

### 验证

1. 浏览器操作：点击首页底部入口、直接输入 URL、刷新、切换月/年、前进/后退、回首页；检查 URL 和周期响应一致。
2. 在已有音频播放中进入/退出/切周期，确认音频不中断、队列不重置、Mini 只有一个、底部一级 Tab 在回顾页不可见。
3. 检查入口在 `FocusRail` 后且不在“常听”内部；确认“常听”前 5 首、全部时间标签和快速播放行为未变。
4. 用 Home cache miss/hit/错误旧缓存验证入口不拉原始事件、不显示伪造 0、不串账号。
5. 运行现有 route/player/Library smoke；任何失败交给对应 owner，不在 D 白名单外修复。

### 停止条件

- 必须修改 App.tsx、底部导航组件、播放器、Library/Bento、依赖或共享全局状态才能完成；或回顾路由导致播放暂停/重置、一级 Tab 回归、缓存串账号。
- 只能用客户端时钟/旧累计补窗口，或入口需要网络拉全量事件；应停止并报告契约/后端缺口。

## 9. 任务 E：播放器事件写入替换与向后兼容

### 目标

在不改变 D1、暂停/继续、seek 和播放器连续性的前提下，把当前达到门槛的写入替换为幂等事件记录；离线可重试，服务端 `accepted_at` 决定窗口；保留旧客户端/旧首页依赖的兼容路径。

### 允许文件

- 修改 `store.tsx`，仅限播放会话标识、事件生成/发送、确认/重试和现有兼容通知的最小改动。
- 新增 `utils/listeningRecapEventOutbox.ts`，只负责当前登录用户的待同步事件序列化、去重、重试和清理。

### 禁止文件与操作

- 禁止修改 D1 计算、有效区间、短录音结尾兜底、seek 处理、`playContext` 队列语义、PlayerView/PlayerBar、页面、路由、API、SQL、package 或依赖。
- 禁止调用远端 Supabase connector/SQL/管理 API，禁止在事件 outbox 中保存密钥、音频、标题、封面或客户端伪造 `accepted_at`。
- 禁止把 `increment_user_song_play` 与新记录 RPC 在同一成功路径各调用一次；禁止因为重试再增加一次个人累计。

### 输入/输出契约

- 每次主动加载歌曲/新会话生成新的 `playSessionId`；暂停/继续沿用；达到 D1 门槛时生成一个 `eventId`，同一会话只生成/提交一次。
- 事件请求使用 B 的 `recordListeningPlayEvent`，固定 `metric=qualified_play`、`policyVersion=d1-20pct-v1`；不传客户端 `acceptedAt`，可传 `observedAt` 和诊断秒数。
- RPC 首次 `isNew=true`：服务端已原子更新 `user_song_plays`；客户端最多再 best-effort 调用现有 `increment_song_play` 兼容歌曲总计。RPC `isNew=false`：视为已同步，不再调用任何累计 RPC。
- 新 RPC 成功路径不调用旧 `increment_user_song_play`；旧函数和旧 `increment_song_play` 保留，供旧客户端或明确的兼容回退使用。
- 只有确定的“新 RPC 不存在/后端尚未迁移”错误才允许按旧行为调用旧的两个 RPC，且该路径不得声称产生了回顾事件；不确定的网络超时不能盲目 fallback，以免服务端已接受后重复计数。
- 客户端只有收到 `accepted`/`duplicate` 响应后才从 outbox 移除；网络失败保留按用户命名空间的待同步记录，在重连/`online`/应用启动时重试。`accepted_at` 由下一次服务端接收生成，因此离线跨月按接收月归属。
- 继续保留现有 `jzone:play-counted` 和本地歌曲显示所需兼容通知，但该乐观通知不是回顾证据，B 不得把它当事件；如增加 `confirmed` 字段必须向后兼容现有监听器。
- 退出登录、账号切换或歌曲不再可见时，不得以新身份发送旧 outbox；旧记录隔离/清理并记录非敏感失败码。

### 依赖

- 依赖 B 的 record API 类型和 A 的 RPC 语义；可用假 client/本地失败注入先验证，不需要远端操作。
- 依赖现有 `store.tsx` D1 基线；E 必须先读取其他代理当前改动，再做最小补丁。

### 验证

1. 播放裁剪歌曲、短录音、暂停/继续、重复点击和 seek：分别确认 20%/最低 1 秒、短结尾兜底、同会话一次、seek 不补时长。
2. 首次响应、重复响应、响应丢失后重试、网络离线/恢复和旧 RPC 不存在四类场景，检查事件表/个人累计不会重复增加。
3. 确认现有 Home `jzone:play-counted` 仍能更新旧 UI，但回顾读取只认服务端已接受事件；歌曲总计失败不阻塞播放或事件确认。
4. 双账号/退出后检查 outbox 隔离，不发送前一账号的 song/event ID；不记录私有标题、封面和原始时间线。
5. 运行 `npm run typecheck` 和现有 player transition/runtime smoke；发现 D1 口径变化立即停止。

### 停止条件

- 需要重写采样器、改变 D1/seek/结尾兜底、为远端缺迁移偷偷写 SQL、无法区分 RPC 超时与函数不存在、重复更新个人累计或跨账号发送 outbox。
- 新链路不能在保留旧客户端和旧首页统计的同时让回顾只消费确认事件；停止并交 Sol 决策。

## 10. 任务 F：smoke、构建、双账号与手机验收

### 目标

只做验证和证据收集，不修业务源文件。覆盖本地 SQL/契约、真实浏览器路径、路由/播放器连续性、双账号隐私、缓存错误态、390×844 手机和构建质量，给 Sol 一份可复核的通过/失败报告。

### 允许文件

- 新增 `scripts/smoke-listening-recap.mjs`；脚本不得依赖 service role key、管理 API 或直接写远端数据库。
- 新增 `artifacts/listening-recap/**` 作为截图、脱敏响应、命令输出和验收报告目录；不得把密钥、JWT、密码或私有媒体 URL 写入证据。

### 禁止文件与操作

- 禁止修改任何业务源文件、SQL、fixture、package/package-lock、依赖、其他 smoke 脚本或文档。
- 禁止使用 Supabase connector/SQL Editor/CLI 对远端迁移、插入、删除、清理、重置或改 RLS；远端迁移和数据准备由 Sol 完成。
- 只能使用 Sol 提供的已准备环境/账号做应用层验收；需要远端写入、造数或恢复时停止并上报，不自行操作。

### 输入/输出契约

输入：A 的本地 SQL/fixture 与 Sol 的远端迁移交接、B/C/D/E 产物、现有 baseline smoke。

脚本/报告至少输出：

- `git diff --name-only` 的 allowlist 检查；不得出现 A–F 白名单外源文件变化，也不得覆盖执行前已有 `.playwright-cli/` 等用户变更。
- `npm run typecheck`、`npm run build` 结果；必要时运行相关现有 player/route/comment/upload/glass smoke 作为回归，但 F 不改它们。
- `/listening-recap` 默认当前月、月/年参数、非法参数回落、刷新、前进/后退和返回；回顾页底部一级 Tab 隐藏、Mini 保留且播放不中断。
- 有事件、少量、无事件、`legacy_only`、`event_partial`、`error` 的 DOM/响应断言；错误不显示 0，旧累计不变成窗口数字。
- 双账号 A/B：A 的公开/私有拥有歌曲可进入“你留下的声音”；A 聆听他人歌曲不进入该章；B 不读到 A 的章节、私有标题/封面/次数/事件时间；退出后旧缓存和 outbox 失效。
- 队列 1/多首/重复/超过 50/当前不可见歌曲；去重、稳定顺序、上限文案和点击播放正确，不额外写 D1。
- 390×844 与 `prefers-reduced-motion` 截图/断言：连续滚动、大封面/文字/留白、无 KPI 卡片墙/饼图/卡片套卡片；资料库 Bento、上传、评论、液态玻璃 WebGL 无差异。

### 依赖

- 必须在 A 本地 SQL/fixture 通过 Sol 审查、Sol 使用 Supabase 连接器完成远端迁移并交接结果后，才可声称远端链路验收；F 不代替该批准门。
- 必须等待 B、C、D、E 完成各自自检；F 可以并行准备静态脚本和本地 fixture 检查，但最终手机/双账号/实机证据在集成后执行。

### 验证

推荐顺序：

1. `git status --short` 记录基线；运行 SQL/响应 fixture 的静态和隔离检查。
2. 运行 `npm run typecheck`、`npm run build`，再运行 `node scripts/smoke-listening-recap.mjs`。
3. 用真实浏览器完成入口、路由、缓存、播放器连续性、双账号和 390×844 检查；网络响应只保存脱敏摘要。
4. 对照 PRD 第 13 节逐项记录“通过/失败/未覆盖”和证据路径，不把未执行的 1.1 高级章节写成一期通过。
5. 最后再次运行 `git diff --check` 和目标文件范围检查，把失败归还对应任务 owner；F 不自行修源文件。

### 停止条件

- typecheck/build/smoke 失败、远端需要 Luna 写入、存在跨账号/私有泄露、错误被显示为 0、事件重复计数、seek 被计入、播放器被暂停/重置、底部导航/Mini 重复、Bento/上传/评论/液态玻璃回归或性能超过 PRD 预算。
- 任何证据缺少账号/周期/覆盖上下文，或包含密钥、JWT、密码、私有媒体 URL；停止发布证据并清理输出前先向 Sol 报告。

## 11. 并行依赖、合并与远端执行顺序

```text
共同契约（本单）
   ├─ A：本地迁移/RLS/RPC/fixture ── Sol 审查 ── Sol 使用 Supabase 连接器远端执行
   ├─ B：API/types/cache hook ──┬─ C：页面/章节纯 UI
   │                            └─ D：路由/AppShell/Home 入口
   └─ E：播放器事件/outbox
                                      ↓
                         F：集成 smoke/构建/双账号/手机验收
```

1. 所有 Luna 先读取 PRD 和本单契约，检查自己写集与当前工作树；A、B、C、D、E 可按契约并行。C/D 在后端未就绪时使用 A 的脱敏 response fixture，E 使用 B 的类型接口或假 client。
2. A 先完成本地 SQL、隔离 fixture、RLS/RPC 结果和审查包；Sol 审查通过后，**只有 Sol 使用 Supabase 连接器执行远端迁移**。Luna 不执行任何远端迁移、远端 SQL、远端 fixture 或管理 API 操作。
3. B/E 先合入各自 API/播放器写集，C/D 再接入真实导出；若必须改别的任务文件，停止并把所需变更列为新的 Sol 子任务。
4. F 在所有任务自检和 Sol 远端迁移交接后执行，不以“页面能渲染”代替真实事件、隐私、缓存、播放器和移动端证据。
5. Sol 最终审阅每个 Luna 的实际 diff、验证输出和未覆盖项；任何回滚只关闭入口/读取并保留旧功能，不直接删除新事件或回填历史。

## 12. 全局禁止触碰范围与完成定义

一期及本执行单明确不改：

- 资料库 Bento：`pages/Library.tsx`、`components/CollectionBentoWall.tsx` 及相关布局/数据职责。
- 液态玻璃 WebGL：实验页、背景采样、滤镜、WebGL context 和相关视觉基础设施。
- 上传/COS：上传页、草稿、COS 客户端、媒体上传/签名流程。
- 评论：评论 UI、评论查询/分页/点赞/线程和既有评论 smoke。
- 旧播放兼容：`user_song_plays` 旧读取语义、旧 RPC 签名、首页“常听”职责。
- 1.1 高级章节、公共统计、创作者表现、媒体类型细分、历史回填和依赖引入。

完成一期的必要证据是：新事件按 D1 口径被服务端幂等接收，并能在正确的 Asia/Shanghai 窗口产生可解释 JSON；入口、二级路由、真实摘要、条件章节、去重队列、缓存/错误态、双账号隐私、Mini 连续性和移动端表现均通过或明确记录未覆盖。代码已写但缺少这些证据，不算完成。

本轮本文件的交付边界：只新增本文件；不执行 SQL、远端迁移、远端数据写入、代码修改或依赖安装。
