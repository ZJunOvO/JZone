import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPORT_SCHEMA_VERSION = 1;
export const STREAM_COPY_BITRATE_KBPS = 160;
export const STREAM_COPY_THRESHOLD_KBPS = 256;

const LOSSLESS_EXTENSIONS = new Set(['aif', 'aiff', 'alac', 'flac', 'wav', 'wave']);
const CANDIDATE_KINDS = new Map([
  ['high-bitrate-audio', 1],
  ['missing-resource', 2],
  ['duplicate-cover', 3],
]);

const HELP_TEXT = `COS 历史资源只读审计工具（fixture-only v1）

用法：
  node scripts/cos-history-audit.mjs --help
  node scripts/cos-history-audit.mjs --fixture <fixture.json>
  node scripts/cos-history-audit.mjs --fixture <fixture.json> --output <report.json>

选项：
  --help             显示帮助，不读取文件或网络
  --fixture <json>   读取本地歌曲与 COS 对象快照，只做离线审计
  --output <json>    将报告写入本地 JSON 文件；省略时输出到标准输出，使用 - 也输出到标准输出

当前版本不接入生产 COS/Supabase 数据源，不读取环境变量，不访问网络。
没有 --fixture 时会以非零状态退出；报告中的所有 candidates 都只是待审查候选，绝不代表可迁移。
`;

class CliError extends Error {}

const textValue = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

const stableCompare = (left, right) => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const sortedUnique = (values) => Array.from(new Set(values.filter(Boolean))).sort(stableCompare);

const pickField = (record, snakeName, camelName) => {
  if (!record || typeof record !== 'object') return undefined;
  return record[snakeName] ?? record[camelName];
};

const finiteNumber = (value) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const byteValue = (value) => {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
};

const decodePathPart = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePath = (value) => {
  const raw = textValue(value);
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const pathname = decodePathPart(parsed.pathname).replace(/^\/+/, '');
      const supabaseMatch = pathname.match(/^storage\/v1\/object\/public\/[^/]+\/(.+)$/i);
      return (supabaseMatch ? supabaseMatch[1] : pathname) || null;
    } catch {
      // 无法解析的 URL 继续按普通 object key 处理，并剥离查询与片段。
    }
  }

  const withoutQuery = raw.split(/[?#]/, 1)[0];
  return decodePathPart(withoutQuery).replace(/^\/+/, '') || null;
};

const normalizeIdentifier = (value) => {
  const normalized = textValue(value)?.split(/[?#]/, 1)[0] ?? null;
  if (!normalized || !/^[A-Za-z0-9._:-]{1,128}$/.test(normalized)) return null;
  return normalized;
};

const normalizeHash = (value) => {
  const raw = textValue(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/^sha256:/i, '')
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
  return /^[a-f0-9]{16,128}$/.test(normalized) ? normalized : null;
};

const hashFromSharedCoverPath = (path) => {
  const match = path.match(/^shared\/covers\/v1\/([a-f0-9]{64})\.jpg$/i);
  return match ? match[1].toLowerCase() : null;
};

const extensionFromPath = (path) => {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
};

const isCoverLikePath = (path) => /(^|\/)(?:cover|covers)(?:\/|[._-])/i.test(path) || /^shared\/covers\//i.test(path);

const normalizeSong = (rawSong) => {
  const song = rawSong && typeof rawSong === 'object' ? rawSong : {};
  return {
    id: normalizeIdentifier(song.id ?? song.songId),
    audioPath: normalizePath(pickField(song, 'audio_path', 'audioPath')),
    fileSize: byteValue(pickField(song, 'file_size', 'fileSize')),
    duration: finiteNumber(song.duration),
    streamAudioPath: normalizePath(pickField(song, 'stream_audio_path', 'streamAudioPath')),
    streamFileSize: byteValue(pickField(song, 'stream_file_size', 'streamFileSize')),
    streamBitrateKbps: finiteNumber(pickField(song, 'stream_bitrate_kbps', 'streamBitrateKbps')),
    coverPath: normalizePath(pickField(song, 'cover_path', 'coverPath')),
  };
};

const songSortKey = (song) => [song.id ?? '', song.audioPath ?? '', song.coverPath ?? '', String(song.duration ?? '')].join('\u0000');

const normalizeObject = (rawObject) => {
  const object = rawObject && typeof rawObject === 'object' ? rawObject : {};
  const key = normalizePath(object.key ?? object.path ?? object.objectKey ?? object.object_key);
  if (!key || object.exists === false) return null;

  const hashFields = [
    ['sha256', object.sha256],
    ['contentHash', object.contentHash],
    ['content_hash', object.content_hash],
    ['hash', object.hash],
  ];
  const suppliedHash = hashFields.find(([, value]) => normalizeHash(value));
  const hash = normalizeHash(suppliedHash?.[1]) ?? hashFromSharedCoverPath(key);

  return {
    key,
    size: byteValue(object.size ?? object.sizeBytes ?? object.size_bytes),
    kind: textValue(object.kind)?.toLowerCase() ?? null,
    hash,
    hashBasis: suppliedHash ? suppliedHash[0] : hash ? 'path-hash' : null,
  };
};

const objectSort = (left, right) => {
  const keyCompare = stableCompare(left.key, right.key);
  if (keyCompare !== 0) return keyCompare;
  const sizeCompare = stableCompare(left.size === null ? '1' : '0', right.size === null ? '1' : '0');
  if (sizeCompare !== 0) return sizeCompare;
  const hashCompare = stableCompare(left.hash ?? '', right.hash ?? '');
  if (hashCompare !== 0) return hashCompare;
  return stableCompare(left.kind ?? '', right.kind ?? '');
};

const normalizeTimestamp = (value) => {
  if (value === undefined || value === null) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const addResourceReference = (references, resourceType, path, songId) => {
  if (!path) return;
  const key = `${resourceType}\u0000${path}`;
  let reference = references.get(key);
  if (!reference) {
    reference = { resourceType, path, songIds: new Set() };
    references.set(key, reference);
  }
  if (songId) reference.songIds.add(songId);
};

const materializeSongIds = (songIds) => Array.from(songIds).sort(stableCompare);

const makeReviewFields = (extra) => ({
  candidateOnly: true,
  migrationReady: false,
  status: 'needs-review',
  proposedDatabaseFields: [],
  rollback: '本版本未执行远程操作，无需回滚',
  ...extra,
});

const estimateAudioCandidate = (song, object) => {
  if (!song.audioPath || song.streamAudioPath || !object) return null;

  const sourceSize = object.size ?? song.fileSize;
  const duration = song.duration !== null && song.duration > 0 ? song.duration : null;
  const estimatedBitrateKbps = sourceSize !== null && duration !== null
    ? Math.round((sourceSize * 8) / duration / 1000)
    : null;
  const extension = extensionFromPath(song.audioPath);
  const isLosslessContainer = LOSSLESS_EXTENSIONS.has(extension);
  const isHighBitrate = isLosslessContainer || (estimatedBitrateKbps !== null && estimatedBitrateKbps > STREAM_COPY_THRESHOLD_KBPS);
  if (!isHighBitrate) return null;

  const estimatedCopySizeBytes = duration === null
    ? null
    : Math.ceil(duration * STREAM_COPY_BITRATE_KBPS * 1000 / 8);
  const estimatedPlaybackEgressBytesSavedPerFullPlay = sourceSize !== null && estimatedCopySizeBytes !== null
    ? Math.max(0, sourceSize - estimatedCopySizeBytes)
    : 0;
  const estimatedSavingsPercent = sourceSize > 0 && estimatedCopySizeBytes !== null
    ? Math.max(0, Math.min(100, Math.round((estimatedPlaybackEgressBytesSavedPerFullPlay / sourceSize) * 100)))
    : 0;

  return {
    sourcePath: song.audioPath,
    sourceSizeBytes: sourceSize,
    sourceExtension: extension || null,
    durationSeconds: duration,
    estimatedBitrateKbps,
    targetBitrateKbps: STREAM_COPY_BITRATE_KBPS,
    estimatedCopySizeBytes,
    estimatedSavingsPercent,
    estimatedPlaybackEgressBytesSavedPerFullPlay,
    savingsGate: sourceSize === null
      ? 'unknown-source-size'
      : estimatedCopySizeBytes === null
        ? 'unknown-duration'
        : estimatedCopySizeBytes <= sourceSize * 0.9
          ? 'at-least-10-percent'
          : 'below-10-percent',
    reason: isLosslessContainer ? 'lossless-container' : 'estimated-bitrate-over-256-kbps',
  };
};

const isCoverObject = (object, referencedCoverPaths) => (
  referencedCoverPaths.has(object.key)
  || object.kind === 'cover'
  || object.kind === 'image-cover'
  || isCoverLikePath(object.key)
);

const hashInfoForCover = (object) => {
  if (object.hash) return { hash: object.hash, basis: object.hashBasis };
  const pathHash = hashFromSharedCoverPath(object.key);
  return pathHash ? { hash: pathHash, basis: 'path-hash' } : null;
};

const candidateSort = (left, right) => {
  const kindCompare = stableCompare(CANDIDATE_KINDS.get(left.kind) ?? 99, CANDIDATE_KINDS.get(right.kind) ?? 99);
  if (kindCompare !== 0) return kindCompare;
  const leftKey = left.kind === 'duplicate-cover'
    ? left.canonicalPath ?? ''
    : left.path ?? left.sourcePath ?? '';
  const rightKey = right.kind === 'duplicate-cover'
    ? right.canonicalPath ?? ''
    : right.path ?? right.sourcePath ?? '';
  const pathCompare = stableCompare(leftKey, rightKey);
  if (pathCompare !== 0) return pathCompare;
  return stableCompare((left.songIds ?? []).join('\u0000'), (right.songIds ?? []).join('\u0000'));
};

const fixtureLists = (fixture, warnings) => {
  const songsValue = Array.isArray(fixture?.songs) ? fixture.songs : [];
  const objectsValue = Array.isArray(fixture?.objects)
    ? fixture.objects
    : Array.isArray(fixture?.cosObjects)
      ? fixture.cosObjects
      : Array.isArray(fixture?.cos_objects)
        ? fixture.cos_objects
        : [];

  if (!Array.isArray(fixture?.songs)) warnings.add('fixture 缺少 songs 数组，按空歌曲集处理');
  if (!Array.isArray(fixture?.objects) && !Array.isArray(fixture?.cosObjects) && !Array.isArray(fixture?.cos_objects)) {
    warnings.add('fixture 缺少 objects 数组，所有引用资源只能按缺失候选处理');
  }

  const songs = songsValue.map(normalizeSong).sort((left, right) => stableCompare(songSortKey(left), songSortKey(right)));
  const objects = objectsValue.map(normalizeObject).filter(Boolean).sort(objectSort);
  return { songs, objects };
};

const buildObjectIndex = (objects, warnings) => {
  const index = new Map();
  for (const object of objects) {
    if (index.has(object.key)) {
      warnings.add('对象快照存在重复 key，已按稳定元数据选择一条记录');
      continue;
    }
    index.set(object.key, object);
  }
  return index;
};

export const buildAuditReport = (input, options = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CliError('fixture 须为 JSON 对象');
  }

  const warnings = new Set([
    '候选仅供只读审查，不代表可迁移',
    'fixture 模式只使用提供的歌曲与对象快照，不访问网络',
    '生产只读数据源与凭据映射尚未实现',
  ]);
  const { songs, objects } = fixtureLists(input, warnings);
  const objectIndex = buildObjectIndex(objects, warnings);
  const timestamp = normalizeTimestamp(options.generatedAt ?? input.generatedAt);
  if (!timestamp) warnings.add('generatedAt 无效，报告改用当前时间');
  const generatedAt = timestamp ?? new Date().toISOString();

  const originalAudioPaths = sortedUnique(songs.map((song) => song.audioPath));
  const existingStreamCopyPaths = sortedUnique(songs.map((song) => song.streamAudioPath));
  const coverPaths = sortedUnique(songs.map((song) => song.coverPath));
  const referencedCoverPaths = new Set(coverPaths);

  const references = new Map();
  for (const song of songs) {
    addResourceReference(references, 'audio', song.audioPath, song.id);
    addResourceReference(references, 'stream-audio', song.streamAudioPath, song.id);
    addResourceReference(references, 'cover', song.coverPath, song.id);
  }

  const missingCandidates = Array.from(references.values())
    .filter((reference) => !objectIndex.has(reference.path))
    .map((reference) => makeReviewFields({
      kind: 'missing-resource',
      resourceType: reference.resourceType,
      path: reference.path,
      songIds: materializeSongIds(reference.songIds),
      failureReason: 'referenced-path-not-in-fixture-object-inventory',
    }));

  const highByPath = new Map();
  for (const song of songs) {
    const analysis = estimateAudioCandidate(song, objectIndex.get(song.audioPath));
    if (!analysis) continue;
    const existing = highByPath.get(analysis.sourcePath);
    if (existing) {
      if (song.id) existing.songIds.push(song.id);
      continue;
    }
    highByPath.set(analysis.sourcePath, makeReviewFields({
      kind: 'high-bitrate-audio',
      songIds: song.id ? [song.id] : [],
      ...analysis,
    }));
  }
  const highBitrateCandidates = Array.from(highByPath.values()).map((candidate) => ({
    ...candidate,
    songIds: sortedUnique(candidate.songIds),
  }));

  const coverGroups = new Map();
  for (const object of objects) {
    if (!isCoverObject(object, referencedCoverPaths)) continue;
    const hashInfo = hashInfoForCover(object);
    if (!hashInfo) continue;
    let group = coverGroups.get(hashInfo.hash);
    if (!group) {
      group = { hash: hashInfo.hash, basis: hashInfo.basis, objects: [] };
      coverGroups.set(hashInfo.hash, group);
    }
    group.objects.push(object);
  }

  const duplicateCoverCandidates = [];
  for (const group of coverGroups.values()) {
    const groupObjects = group.objects.slice().sort(objectSort);
    const paths = sortedUnique(groupObjects.map((object) => object.key));
    if (paths.length < 2) continue;

    const referencesByPath = new Map();
    for (const reference of references.values()) {
      if (reference.resourceType !== 'cover' || !paths.includes(reference.path)) continue;
      referencesByPath.set(reference.path, materializeSongIds(reference.songIds));
    }

    const allSizesKnown = groupObjects.every((object) => object.size !== null);
    const canonicalPath = paths[0];
    const estimatedDuplicateCoverStorageBytesPotentiallyRemovable = allSizesKnown
      ? groupObjects
        .filter((object) => object.key !== canonicalPath)
        .reduce((sum, object) => sum + object.size, 0)
      : 0;
    if (!allSizesKnown) warnings.add('重复封面对象缺少完整大小，节省字节估算保守记为 0');

    duplicateCoverCandidates.push(makeReviewFields({
      kind: 'duplicate-cover',
      basis: group.basis,
      hash: group.hash,
      canonicalPath,
      paths,
      references: paths.map((path) => ({
        path,
        songIds: referencesByPath.get(path) ?? [],
        sizeBytes: groupObjects.find((object) => object.key === path)?.size ?? null,
      })),
      estimatedDuplicateCoverStorageBytesPotentiallyRemovable,
    }));
  }

  const candidates = [...highBitrateCandidates, ...missingCandidates, ...duplicateCoverCandidates].sort(candidateSort);
  const estimatedPlaybackEgressBytesSavedPerFullPlay = highBitrateCandidates
    .reduce((sum, candidate) => sum + candidate.estimatedPlaybackEgressBytesSavedPerFullPlay, 0);
  const estimatedDuplicateCoverStorageBytesPotentiallyRemovable = duplicateCoverCandidates
    .reduce((sum, candidate) => sum + candidate.estimatedDuplicateCoverStorageBytesPotentiallyRemovable, 0);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    mode: 'fixture',
    readOnly: true,
    candidateSemantics: 'candidates 仅表示待审查对象，不等于可迁移对象；本版本不执行远程操作',
    warnings: Array.from(warnings).sort(stableCompare),
    summary: {
      songCount: songs.length,
      originalAudioReferenceCount: songs.filter((song) => song.audioPath).length,
      originalAudioPathCount: originalAudioPaths.length,
      originalAudioPaths,
      existingStreamCopySongCount: songs.filter((song) => song.streamAudioPath).length,
      existingStreamCopyCount: existingStreamCopyPaths.length,
      existingStreamCopyPaths,
      estimatedHighBitrateCandidateCount: highBitrateCandidates.length,
      missingResourceCandidateCount: missingCandidates.length,
      coverPathCount: coverPaths.length,
      coverPaths,
      duplicateCoverHashCandidateCount: duplicateCoverCandidates.length,
      duplicateCoverCandidatePathCount: duplicateCoverCandidates.reduce((sum, candidate) => sum + candidate.paths.length, 0),
      estimatedPlaybackEgressBytesSavedPerFullPlay,
      estimatedDuplicateCoverStorageBytesPotentiallyRemovable,
      candidateCount: candidates.length,
    },
    candidates,
  };
};

const isEnvFileName = (filePath) => {
  const name = basename(filePath).toLowerCase();
  return name === '.env' || name.startsWith('.env.');
};

const assertSafeLocalPath = (filePath) => {
  if (isEnvFileName(filePath)) {
    throw new CliError('为避免泄露凭据，禁止将 .env 文件作为 fixture 或输出目标');
  }
};

export const parseCliArgs = (args) => {
  const parsed = { help: false, fixturePath: null, outputPath: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      parsed.help = true;
      continue;
    }
    if (argument === '--fixture' || argument === '--output') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new CliError(`${argument} 需要一个路径参数`);
      if (argument === '--fixture') parsed.fixturePath = value;
      else parsed.outputPath = value;
      index += 1;
      continue;
    }
    throw new CliError('不支持的参数；请使用 --help 查看受支持选项');
  }
  return parsed;
};

const writeReport = async (report, outputPath, io) => {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (!outputPath || outputPath === '-') {
    io.log(serialized.trimEnd());
    return;
  }
  assertSafeLocalPath(outputPath);
  await writeFile(resolve(outputPath), serialized, 'utf8');
  io.log('只读审计报告已写入本地 JSON 文件');
};

export const main = async (args = process.argv.slice(2), io = console) => {
  try {
    const parsed = parseCliArgs(args);
    if (parsed.help) {
      io.log(HELP_TEXT.trimEnd());
      return 0;
    }
    if (!parsed.fixturePath) {
      throw new CliError('第一版未接入生产只读数据源；请提供 --fixture <json>。本次未访问网络，也未读取环境变量');
    }

    assertSafeLocalPath(parsed.fixturePath);
    const fixtureText = await readFile(resolve(parsed.fixturePath), 'utf8');
    let fixture;
    try {
      fixture = JSON.parse(fixtureText);
    } catch {
      throw new CliError('fixture 不是有效 JSON');
    }
    const report = buildAuditReport(fixture);
    await writeReport(report, parsed.outputPath, io);
    return 0;
  } catch (error) {
    io.error(error instanceof CliError ? error.message : '审计失败：无法读取 fixture 或写入本地报告');
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exitCode = await main();
  if (exitCode !== 0) process.exitCode = exitCode;
}
