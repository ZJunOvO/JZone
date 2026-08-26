# COS 历史资源只读审计工具 v1

本工具用于把歌曲数据库快照和 COS 对象元数据快照整理成可复查的历史资源报告。第一版是 `fixture-only`：不访问网络、不读取环境变量、不导入业务 COS 客户端或 Supabase API，也不执行任何远程对象或数据库变更。

## 安全边界

- 工具的唯一审计模式是本地 `fixture` 模式，默认没有 fixture 时会以非零状态退出。
- `--output` 只写用户指定的本地 JSON 报告；它不代表 COS 写入。
- 工具不会读取 `.env`、`.env.*` 或回显未知参数；报告中的 URL 会去掉查询串和片段。
- 报告中的每一条 `candidate` 都是“待审查候选”，候选不等于可迁移。报告生成本身不改变远程对象、数据库行或客户端播放行为。
- 原始音频始终视为保留资源；重复封面只形成审查候选，不形成清理动作。

## 用法

```text
node scripts/cos-history-audit.mjs --help
node scripts/cos-history-audit.mjs --fixture path/to/cos-history-fixture.json
node scripts/cos-history-audit.mjs --fixture path/to/cos-history-fixture.json --output path/to/cos-history-report.json
```

省略 `--output` 或将其设为 `-` 时，报告输出到标准输出。命令行没有 `--fixture` 时不会尝试猜测生产凭据，也不会发起网络请求，而是明确提示第一版尚未接入生产数据源。

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
  ]
}
```

字段规则：

- `songs` 使用现有 `songs` 表字段名；工具同时接受对应的 camelCase 字段。`audio_path`、`stream_audio_path` 和 `cover_path` 会被规范化为 object key。
- `objects` 是 COS 对象列表快照；`key`、`size`、可选的 `kind` 和 `sha256`/`contentHash`/`hash` 会被读取。也接受 `cosObjects` 或 `cos_objects` 作为列表名称。
- `generatedAt` 可固定报告时间，以便复跑比较；省略时使用当前 UTC 时间。候选和数组排序不依赖输入顺序。
- 对 Supabase public URL、COS URL 或带签名参数的路径，报告只保留路径部分，不保留 `?` 后的查询串。
- fixture 只应包含审计所需的路径、大小、时长、哈希和歌曲 ID，不要放入艺人、用户资料、令牌或其他隐私字段。

## 候选规则与估算

工具依据 `utils/audioDelivery.ts` 和 COS 指南中的现有约定进行离线估算：

1. 高码率音频：源对象存在、歌曲没有 `stream_audio_path`，且扩展名是无损容器（`aif`、`aiff`、`alac`、`flac`、`wav`、`wave`），或按对象大小与歌曲时长估算出的码率严格大于 `256 kbps`。目标码率按 `160 kbps` 估算。
2. 普通 M4A/MP3：扩展名本身不会使歌曲进入高码率候选；只有估算码率超过阈值才会进入。已有播放副本的歌曲不会再次进入高码率候选，即使其原音频看起来是高码率。
3. 缺失资源：歌曲引用的原音频、播放副本或封面路径不在对象快照中时，形成 `missing-resource` 候选。它只表示快照不完整或资源不可见，不能据此猜测远程对象状态。
4. 重复封面：两个或更多不同封面路径具有相同的受支持内容哈希时，形成 `duplicate-cover` 候选，并保留路径、哈希、引用歌曲和可用对象大小。相同路径被多首歌曲复用属于正常共享，不会被误报为不同对象的重复。
5. `estimatedPlaybackEgressBytesSavedPerFullPlay` 按“一次完整播放的源对象大小 - `160 kbps` 目标大小”估算；`estimatedDuplicateCoverStorageBytesPotentiallyRemovable` 按保留字典序最小路径后潜在可移除的其他对象大小估算。两个数字分别对应播放下行和一次性存储，时间维度与计费维度不同，禁止相加。费用评估必须结合实际播放次数与存储计费周期；缺少大小或时长时保守记为 `0`，这不是腾讯云账单金额或存储实账。

## 报告结构

输出固定包含：

```text
schemaVersion       报告契约版本，当前为 1
generatedAt         报告生成时间
mode                当前为 fixture
readOnly            固定为 true
candidateSemantics  候选仅供审查的明确声明
warnings            数据完整性、估算限制和模式边界
summary             计数、路径列表和节省字节估算
candidates          稳定排序的候选数组
```

`summary` 至少包含：歌曲数、原音频引用数和唯一路径、已有播放副本歌曲数和唯一路径、高码率候选数、缺失资源候选数、封面路径数和路径列表、重复封面哈希候选数、重复候选路径数、`estimatedPlaybackEgressBytesSavedPerFullPlay`、`estimatedDuplicateCoverStorageBytesPotentiallyRemovable` 以及候选总数。报告不提供两种口径的合计字段。

候选会带有 `candidateOnly: true`、`migrationReady: false`、`status: "needs-review"`、来源路径或路径组、引用歌曲 ID、哈希/元数据、对应口径的 `estimatedPlaybackEgressBytesSavedPerFullPlay` 或 `estimatedDuplicateCoverStorageBytesPotentiallyRemovable` 和空的 `proposedDatabaseFields`。本版本不生成目标 key，不写回 `stream_*` 字段，也不把估算状态伪装成已验证状态。

## 必须遵守的后续流程

历史 COS 资源必须按以下顺序推进：

1. **只读扫描**：使用本工具或未来等价的只读快照适配器生成报告。
2. **Sol 审查报告**：检查候选规则、引用关系、哈希/元数据、缺失项、成本口径和稳定复跑结果。
3. **用户批准**：由用户明确批准精确候选范围、批次上限、成本上限、源文件保留策略、有效期和回滚方案。
4. **未来另一个小批迁移任务**：必须获得新的边界清晰 handoff，在独立白名单和批准门内实施；先验证副本，再按批准方案处理可空字段。

本任务和本工具只停在第 1 步，绝不迁移。客户端启动、登录、播放或页面打开也不得触发历史资源处理。

## 生产支持状态

第一版尚未支持生产只读模式，因此没有生产 COS 或 Supabase 凭据映射，也不会读取 `VITE_*` 或其他环境变量。后续若要接入生产，只能在单独批准任务中确定：COS 只读对象清单与元数据权限、Supabase 只读歌曲快照权限、凭据/STS 来源、快照一致性、审计日志脱敏和请求成本；在这些映射明确前不得联网扫描。

本地验证命令：

```text
node scripts/cos-history-audit.test.mjs
node scripts/cos-history-audit.mjs --help
```
