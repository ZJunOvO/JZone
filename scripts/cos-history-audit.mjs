import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPORT_SCHEMA_VERSION = 2;
export const STREAM_COPY_BITRATE_KBPS = 160;
export const STREAM_COPY_THRESHOLD_KBPS = 256;

const LOSSLESS_EXTENSIONS = new Set(['aif', 'aiff', 'alac', 'flac', 'wav', 'wave']);
const AUDIO_EXTENSIONS = new Set([
  'aac', 'aif', 'aiff', 'alac', 'amr', 'flac', 'm4a', 'mp3', 'mp4', 'ogg', 'opus', 'wav', 'wave', 'webm', '3gp', '3gpp',
]);
const CANDIDATE_KINDS = new Map([
  ['high-bitrate-audio', 1],
  ['missing-resource', 2],
  ['duplicate-cover', 3],
  ['duplicate-audio', 4],
  ['abnormal-stream-copy', 5],
]);

const HELP_TEXT = `COS 历史资源只读审计工具（fixture-only v2）

用法：
  node scripts/cos-history-audit.mjs --help
  node scripts/cos-history-audit.mjs --fixture <fixture.json>
  node scripts/cos-history-audit.mjs --fixture <fixture.json> --output <report.json>

选项：
  --help             显示帮助，不读取文件或网络
  --fixture <json>   读取本地歌曲与 COS 对象快照，只做离线审计
  --output <json>    将报告写入本地 JSON 文件；省略时输出到标准输出，使用 - 也输出到标准输出

当前版本不接入生产 COS/Supabase 数据源，不读取环境变量，不访问网络。
没有 --fixture 时会以非零状态退出；报告中的所有 candidates 都只是待审查候选，绝不代表可迁移；未引用对象只做诊断，不生成迁移目标。
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

const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const booleanValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  if (value.trim().toLowerCase() === 'true') return true;
  if (value.trim().toLowerCase() === 'false') return false;
  return null;
};

const pickField = (record, snakeName, camelName) => {
  if (!record || typeof record !== 'object') return undefined;
  return record[snakeName] ?? record[camelName];
};

const pickValue = (record, names) => {
  if (!record || typeof record !== 'object') return undefined;
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
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

const normalizeAlbum = (rawAlbum) => {
  const album = rawAlbum && typeof rawAlbum === 'object' ? rawAlbum : {};
  return {
    id: normalizeIdentifier(pickValue(album, ['id', 'album_id', 'albumId', 'collection_id', 'collectionId'])),
    coverPath: normalizePath(pickValue(album, ['cover_path', 'coverPath', 'cover_url', 'coverUrl'])),
  };
};

const normalizeProfile = (rawProfile) => {
  const profile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  return {
    id: normalizeIdentifier(pickValue(profile, ['id', 'user_id', 'userId'])),
    avatarPath: normalizePath(pickValue(profile, ['avatar_path', 'avatarPath', 'avatar_url', 'avatarUrl'])),
    coverPath: normalizePath(pickValue(profile, [
      'cover_path',
      'coverPath',
      'cover_url',
      'coverUrl',
      'background_path',
      'backgroundPath',
      'background_url',
      'backgroundUrl',
    ])),
  };
};

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
    contentType: textValue(object.contentType ?? object.content_type ?? object.mimeType ?? object.mime_type)?.toLowerCase() ?? null,
  };
};

const objectSort = (left, right) => {
  const keyCompare = stableCompare(left.key, right.key);
  if (keyCompare !== 0) return keyCompare;
  const sizeCompare = stableCompare(left.size === null ? '1' : '0', right.size === null ? '1' : '0');
  if (sizeCompare !== 0) return sizeCompare;
  const hashCompare = stableCompare(left.hash ?? '', right.hash ?? '');
  if (hashCompare !== 0) return hashCompare;
  const kindCompare = stableCompare(left.kind ?? '', right.kind ?? '');
  if (kindCompare !== 0) return kindCompare;
  return stableCompare(left.contentType ?? '', right.contentType ?? '');
};

const normalizeTimestamp = (value) => {
  if (value === undefined || value === null) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const addResourceReference = (references, resourceType, path, ownerType, ownerId) => {
  if (!path) return;
  const key = `${resourceType}\u0000${path}`;
  let reference = references.get(key);
  if (!reference) {
    reference = {
      resourceType,
      path,
      songIds: new Set(),
      albumIds: new Set(),
      profileIds: new Set(),
    };
    references.set(key, reference);
  }
  if (ownerId && ownerType === 'song') reference.songIds.add(ownerId);
  if (ownerId && ownerType === 'album') reference.albumIds.add(ownerId);
  if (ownerId && ownerType === 'profile') reference.profileIds.add(ownerId);
};

const materializeSongIds = (songIds) => Array.from(songIds).sort(stableCompare);

const materializeReference = (reference) => ({
  resourceType: reference.resourceType,
  path: reference.path,
  songIds: materializeSongIds(reference.songIds),
  albumIds: materializeSongIds(reference.albumIds),
  profileIds: materializeSongIds(reference.profileIds),
});

const referenceDetailsForPath = (references, path) => {
  const songIds = new Set();
  const albumIds = new Set();
  const profileIds = new Set();
  const resourceTypes = new Set();
  for (const reference of references.values()) {
    if (reference.path !== path) continue;
    resourceTypes.add(reference.resourceType);
    reference.songIds.forEach((id) => songIds.add(id));
    reference.albumIds.forEach((id) => albumIds.add(id));
    reference.profileIds.forEach((id) => profileIds.add(id));
  }
  return {
    path,
    resourceTypes: sortedUnique(Array.from(resourceTypes)),
    songIds: materializeSongIds(songIds),
    albumIds: materializeSongIds(albumIds),
    profileIds: materializeSongIds(profileIds),
  };
};

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

const AUDIO_OBJECT_KINDS = new Set(['audio', 'original-audio', 'stream', 'stream-audio', 'audio-stream']);
const NON_AUDIO_OBJECT_KINDS = new Set(['cover', 'image', 'image-cover', 'document', 'text']);

const isAudioObject = (object, referencedAudioPaths) => {
  if (referencedAudioPaths.has(object.key)) return true;
  if (NON_AUDIO_OBJECT_KINDS.has(object.kind)) return false;
  return AUDIO_OBJECT_KINDS.has(object.kind) || AUDIO_EXTENSIONS.has(extensionFromPath(object.key));
};

const estimateBitrateKbps = (sizeBytes, durationSeconds) => (
  sizeBytes !== null && durationSeconds !== null && durationSeconds > 0
    ? Math.round((sizeBytes * 8) / durationSeconds / 1000)
    : null
);

const materializeObject = (object) => ({
  key: object.key,
  sizeBytes: object.size,
  kind: object.kind,
  hash: object.hash,
  hashBasis: object.hashBasis,
  contentType: object.contentType,
});

const candidateSort = (left, right) => {
  const kindCompare = stableCompare(CANDIDATE_KINDS.get(left.kind) ?? 99, CANDIDATE_KINDS.get(right.kind) ?? 99);
  if (kindCompare !== 0) return kindCompare;
  const leftKey = left.kind === 'duplicate-cover' || left.kind === 'duplicate-audio'
    ? left.canonicalPath ?? left.paths?.[0] ?? ''
    : left.path ?? left.sourcePath ?? '';
  const rightKey = right.kind === 'duplicate-cover' || right.kind === 'duplicate-audio'
    ? right.canonicalPath ?? right.paths?.[0] ?? ''
    : right.path ?? right.sourcePath ?? '';
  const pathCompare = stableCompare(leftKey, rightKey);
  if (pathCompare !== 0) return pathCompare;
  const songCompare = stableCompare((left.songIds ?? []).join('\u0000'), (right.songIds ?? []).join('\u0000'));
  if (songCompare !== 0) return songCompare;
  return stableCompare((left.profileIds ?? []).join('\u0000'), (right.profileIds ?? []).join('\u0000'));
};

const ROW_ARRAY_KEYS = ['rows', 'data', 'items', 'records', 'values'];

const rowsFromTableValue = (value) => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ROW_ARRAY_KEYS) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (Array.isArray(value.pages)) {
    return value.pages.flatMap((page) => rowsFromTableValue(page));
  }
  return [];
};

const tableValueFromContainer = (container, names) => {
  if (!isRecord(container)) return undefined;
  for (const name of names) {
    if (container[name] !== undefined) return container[name];
  }
  return undefined;
};

const readFixtureTable = (fixture, names) => {
  const containers = [fixture, fixture?.snapshot, fixture?.snapshots, fixture?.tables];
  for (const container of containers) {
    const value = tableValueFromContainer(container, names);
    if (value === undefined) continue;
    return {
      present: true,
      rows: rowsFromTableValue(value),
      metadata: isRecord(value) ? value : null,
    };
  }
  return { present: false, rows: [], metadata: null };
};

const fixtureLists = (fixture, warnings) => {
  const songsTable = readFixtureTable(fixture, ['songs']);
  const albumsTable = readFixtureTable(fixture, ['albums']);
  const profilesTable = readFixtureTable(fixture, ['profiles']);
  const objectsTable = readFixtureTable(fixture, ['objects', 'cosObjects', 'cos_objects']);

  if (!songsTable.present) warnings.add('fixture 缺少 songs 数组，按空歌曲集处理');
  if (!objectsTable.present) warnings.add('fixture 缺少 objects 数组，所有引用资源只能按缺失候选处理');

  const songs = songsTable.rows.map(normalizeSong).sort((left, right) => stableCompare(songSortKey(left), songSortKey(right)));
  const albums = albumsTable.rows
    .map(normalizeAlbum)
    .sort((left, right) => stableCompare([left.id ?? '', left.coverPath ?? ''].join('\u0000'), [right.id ?? '', right.coverPath ?? ''].join('\u0000')));
  const profiles = profilesTable.rows
    .map(normalizeProfile)
    .sort((left, right) => stableCompare([left.id ?? '', left.avatarPath ?? '', left.coverPath ?? ''].join('\u0000'), [right.id ?? '', right.avatarPath ?? '', right.coverPath ?? ''].join('\u0000')));
  const objects = objectsTable.rows.map(normalizeObject).filter(Boolean).sort(objectSort);
  return {
    songs,
    albums,
    profiles,
    objects,
    tables: { songs: songsTable, albums: albumsTable, profiles: profilesTable, objects: objectsTable },
  };
};

const numberFromFields = (record, names) => {
  if (!isRecord(record)) return null;
  for (const name of names) {
    const value = finiteNumber(record[name]);
    if (value !== null && value >= 0) return Math.floor(value);
  }
  return null;
};

const paginationMetadataFrom = (fixture, tableName, tableSource) => {
  const candidates = [
    tableSource?.metadata?.pagination,
    tableSource?.metadata?.pageInfo,
    tableSource?.metadata?.page_info,
    fixture?.pagination?.[tableName],
    fixture?.snapshot?.pagination?.[tableName],
    fixture?.snapshots?.pagination?.[tableName],
    fixture?.snapshotPagination?.[tableName],
    fixture?.snapshot_pagination?.[tableName],
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }

  const globalPagination = fixture?.pagination;
  if (
    isRecord(globalPagination)
    && ['complete', 'isComplete', 'exhausted', 'pageSize', 'page_size', 'pages', 'pageCount', 'page_count', 'totalRows', 'total_rows', 'total', 'hasMore', 'has_more']
      .some((key) => globalPagination[key] !== undefined)
  ) {
    return globalPagination;
  }
  return tableSource?.metadata ?? null;
};

const pageRows = (page) => {
  if (Array.isArray(page)) return page;
  if (!isRecord(page)) return [];
  for (const key of ROW_ARRAY_KEYS) {
    if (Array.isArray(page[key])) return page[key];
  }
  return [];
};

const normalizePage = (rawPage, index) => {
  if (Array.isArray(rawPage)) {
    return {
      page: index,
      offset: null,
      rowCount: rawPage.length,
      hasMore: null,
      next: null,
    };
  }
  const page = isRecord(rawPage) ? rawPage : {};
  const next = page.nextCursor ?? page.next_cursor ?? page.nextOffset ?? page.next_offset ?? page.next ?? null;
  const explicitHasMore = booleanValue(page.hasMore ?? page.has_more ?? page.more);
  return {
    page: numberFromFields(page, ['page', 'pageIndex', 'page_index', 'pageNumber', 'page_number']) ?? index,
    offset: numberFromFields(page, ['offset', 'from', 'start', 'startIndex', 'start_index']),
    rowCount: numberFromFields(page, ['rowCount', 'row_count', 'fetchedRows', 'fetched_rows', 'count']) ?? pageRows(page).length,
    hasMore: explicitHasMore ?? (next !== null && next !== '' ? true : null),
    next: next === '' ? null : next,
  };
};

const auditTablePagination = (tableName, tableSource, fixture, warnings) => {
  if (!tableSource.present) {
    return {
      status: 'not-provided',
      complete: null,
      pageSize: null,
      pageCount: null,
      fetchedRows: null,
      totalRows: null,
      hasMore: null,
      issues: [],
    };
  }

  const metadata = paginationMetadataFrom(fixture, tableName, tableSource);
  if (metadata === null || metadata === undefined) {
    warnings.add(`snapshot 缺少 ${tableName} 分页元数据，无法证明快照完整`);
    return {
      status: 'unknown',
      complete: null,
      pageSize: null,
      pageCount: null,
      fetchedRows: tableSource.rows.length,
      totalRows: null,
      hasMore: null,
      issues: ['pagination-metadata-missing'],
    };
  }

  const metadataRecord = isRecord(metadata) ? metadata : {};
  const pagesValue = Array.isArray(metadata)
    ? metadata
    : Array.isArray(metadataRecord.pages)
      ? metadataRecord.pages
      : Array.isArray(metadataRecord.pageDetails)
        ? metadataRecord.pageDetails
        : Array.isArray(metadataRecord.page_details)
          ? metadataRecord.page_details
          : [];
  const pages = pagesValue
    .map(normalizePage)
    .sort((left, right) => stableCompare(
      [String(left.page ?? ''), String(left.offset ?? ''), String(left.rowCount ?? '')].join('\u0000'),
      [String(right.page ?? ''), String(right.offset ?? ''), String(right.rowCount ?? '')].join('\u0000'),
    ));
  const pageSize = numberFromFields(metadataRecord, ['pageSize', 'page_size', 'limit', 'perPage', 'per_page']);
  const declaredPageCount = numberFromFields(metadataRecord, ['pageCount', 'page_count', 'pagesFetched', 'pages_fetched']);
  const pageCount = declaredPageCount ?? (pages.length > 0 ? pages.length : null);
  const totalRows = numberFromFields(metadataRecord, ['totalRows', 'total_rows', 'totalCount', 'total_count', 'expectedRows', 'expected_rows', 'total', 'count']);
  const explicitFetchedRows = numberFromFields(metadataRecord, ['fetchedRows', 'fetched_rows', 'rowCount', 'row_count']);
  const fetchedRows = explicitFetchedRows
    ?? (pages.length > 0 && pages.every((page) => page.rowCount !== null)
      ? pages.reduce((sum, page) => sum + page.rowCount, 0)
      : tableSource.rows.length);
  const explicitComplete = booleanValue(metadataRecord.complete ?? metadataRecord.isComplete ?? metadataRecord.exhausted ?? metadataRecord.fullyFetched);
  const metadataHasMore = booleanValue(metadataRecord.hasMore ?? metadataRecord.has_more ?? metadataRecord.more);
  const lastPage = pages.at(-1) ?? null;
  const lastHasMore = lastPage?.hasMore ?? metadataHasMore;
  const issues = new Set();

  if (explicitComplete === false) issues.add('explicit-incomplete');
  if (lastHasMore === true) issues.add('has-more');
  if (lastPage?.next !== null && lastPage?.next !== undefined) issues.add('next-page-token');

  const pageIndexes = pages.map((page) => page.page);
  if (pages.length > 1 && pageIndexes.every((page) => page !== null)) {
    const firstPage = pageIndexes[0];
    const hasPageGap = pageIndexes.some((page, index) => index > 0 && page !== firstPage + index);
    if (hasPageGap) issues.add('page-gap');
  }

  if (pages.length > 0 && pages.every((page) => page.offset !== null && page.rowCount !== null)) {
    const hasOffsetGap = pages.some((page, index) => index > 0 && page.offset !== pages[index - 1].offset + pages[index - 1].rowCount);
    if (hasOffsetGap) issues.add('offset-gap');
  }

  if (declaredPageCount !== null && pages.length > 0 && declaredPageCount !== pages.length) {
    issues.add('page-count-mismatch');
  }
  if (totalRows !== null && fetchedRows !== null && totalRows !== fetchedRows) {
    issues.add('row-count-mismatch');
  }
  if (totalRows !== null && pageSize !== null && pageSize > 0 && pageCount !== null) {
    const expectedPageCount = Math.ceil(totalRows / pageSize);
    if (expectedPageCount !== pageCount) issues.add('expected-page-count-mismatch');
  }

  const issueList = Array.from(issues).sort(stableCompare);
  const hasCompletenessProof = explicitComplete === true
    || (lastHasMore === false && totalRows !== null && fetchedRows === totalRows)
    || (totalRows !== null && fetchedRows === totalRows && pages.length === 0);
  const complete = issueList.length > 0
    ? false
    : hasCompletenessProof
      ? true
      : null;
  const status = complete === true ? 'complete' : complete === false ? 'incomplete' : 'unknown';

  if (status === 'incomplete') {
    warnings.add(`snapshot ${tableName} 分页存在未完成或行数不一致，候选只能按当前快照审查`);
  } else if (status === 'unknown') {
    warnings.add(`snapshot ${tableName} 分页信息不足，无法证明快照完整`);
  }

  return {
    status,
    complete,
    pageSize,
    pageCount,
    fetchedRows,
    totalRows,
    hasMore: lastHasMore,
    issues: issueList,
  };
};

const auditSnapshotPagination = (fixture, tables, warnings) => {
  const tableAudits = Object.fromEntries(
    Object.entries(tables).map(([tableName, tableSource]) => [tableName, auditTablePagination(tableName, tableSource, fixture, warnings)]),
  );
  const available = Object.values(tableAudits).filter((table) => table.status !== 'not-provided');
  const complete = available.length === 0
    ? null
    : available.some((table) => table.complete === false)
      ? false
      : available.every((table) => table.complete === true)
        ? true
        : null;
  return {
    status: complete === true ? 'complete' : complete === false ? 'incomplete' : 'unknown',
    complete,
    tables: tableAudits,
  };
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
  const { songs, albums, profiles, objects, tables } = fixtureLists(input, warnings);
  const objectIndex = buildObjectIndex(objects, warnings);
  const inventoryObjects = Array.from(objectIndex.values()).sort(objectSort);
  const snapshotPagination = auditSnapshotPagination(input, tables, warnings);
  const timestamp = normalizeTimestamp(options.generatedAt ?? input.generatedAt);
  if (!timestamp) warnings.add('generatedAt 无效，报告改用当前时间');
  const generatedAt = timestamp ?? new Date().toISOString();

  const originalAudioPaths = sortedUnique(songs.map((song) => song.audioPath));
  const existingStreamCopyPaths = sortedUnique(songs.map((song) => song.streamAudioPath));
  const songCoverPaths = sortedUnique(songs.map((song) => song.coverPath));
  const albumCoverPaths = sortedUnique(albums.map((album) => album.coverPath));
  const profileAvatarPaths = sortedUnique(profiles.map((profile) => profile.avatarPath));
  const profileCoverPaths = sortedUnique(profiles.map((profile) => profile.coverPath));
  const coverPaths = sortedUnique([...songCoverPaths, ...albumCoverPaths, ...profileCoverPaths]);
  const referencedCoverPaths = new Set(coverPaths);

  const references = new Map();
  for (const song of songs) {
    addResourceReference(references, 'audio', song.audioPath, 'song', song.id);
    addResourceReference(references, 'stream-audio', song.streamAudioPath, 'song', song.id);
    addResourceReference(references, 'cover', song.coverPath, 'song', song.id);
  }
  for (const album of albums) {
    addResourceReference(references, 'cover', album.coverPath, 'album', album.id);
  }
  for (const profile of profiles) {
    addResourceReference(references, 'avatar', profile.avatarPath, 'profile', profile.id);
    addResourceReference(references, 'cover', profile.coverPath, 'profile', profile.id);
  }

  const missingCandidates = Array.from(references.values())
    .filter((reference) => !objectIndex.has(reference.path))
    .map((reference) => makeReviewFields({
      kind: 'missing-resource',
      ...materializeReference(reference),
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
  for (const object of inventoryObjects) {
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
        ...referenceDetailsForPath(references, path),
        sizeBytes: groupObjects.find((object) => object.key === path)?.size ?? null,
      })),
      estimatedDuplicateCoverStorageBytesPotentiallyRemovable,
    }));
  }

  const referencedAudioPaths = new Set([...originalAudioPaths, ...existingStreamCopyPaths]);
  const audioGroups = new Map();
  for (const object of inventoryObjects) {
    if (!isAudioObject(object, referencedAudioPaths) || !object.hash) continue;
    let group = audioGroups.get(object.hash);
    if (!group) {
      group = { hash: object.hash, basis: object.hashBasis, objects: [] };
      audioGroups.set(object.hash, group);
    }
    group.objects.push(object);
  }

  const duplicateAudioCandidates = [];
  for (const group of audioGroups.values()) {
    const groupObjects = group.objects.slice().sort(objectSort);
    const paths = sortedUnique(groupObjects.map((object) => object.key));
    if (paths.length < 2) continue;
    duplicateAudioCandidates.push(makeReviewFields({
      kind: 'duplicate-audio',
      basis: group.basis,
      hash: group.hash,
      canonicalPath: paths[0],
      paths,
      references: paths.map((path) => ({
        ...referenceDetailsForPath(references, path),
        sizeBytes: groupObjects.find((object) => object.key === path)?.size ?? null,
      })),
      failureReason: 'multiple-audio-objects-share-content-hash',
    }));
  }

  const streamDiagnostics = [];
  const abnormalByPath = new Map();
  for (const song of songs) {
    if (!song.streamAudioPath) continue;
    const sourceObject = song.audioPath ? objectIndex.get(song.audioPath) : null;
    const streamObject = objectIndex.get(song.streamAudioPath);
    const sourceSizeBytes = sourceObject?.size ?? song.fileSize;
    const streamSizeBytes = streamObject?.size ?? song.streamFileSize;
    const estimatedStreamBitrateKbps = estimateBitrateKbps(streamObject?.size ?? null, song.duration);
    const reasonCodes = new Set();

    if (song.audioPath && song.audioPath === song.streamAudioPath) reasonCodes.add('stream-path-equals-source-path');
    if (sourceObject?.hash && streamObject?.hash && sourceObject.hash === streamObject.hash) {
      reasonCodes.add('stream-content-hash-equals-source');
    }
    if (song.streamBitrateKbps !== null && (song.streamBitrateKbps <= 0 || song.streamBitrateKbps > STREAM_COPY_THRESHOLD_KBPS)) {
      reasonCodes.add('declared-stream-bitrate-out-of-range');
    }
    if (estimatedStreamBitrateKbps !== null && estimatedStreamBitrateKbps > STREAM_COPY_THRESHOLD_KBPS) {
      reasonCodes.add('estimated-stream-bitrate-over-threshold');
    }
    if (sourceSizeBytes !== null && streamSizeBytes !== null && song.audioPath !== song.streamAudioPath && streamSizeBytes >= sourceSizeBytes) {
      reasonCodes.add('stream-object-not-smaller-than-source');
    }
    if (streamObject && song.streamFileSize !== null && streamObject.size !== null && song.streamFileSize !== streamObject.size) {
      reasonCodes.add('stream-size-metadata-mismatch');
    }
    if (streamObject && NON_AUDIO_OBJECT_KINDS.has(streamObject.kind)) {
      reasonCodes.add('stream-object-kind-not-audio');
    }

    const reasonList = Array.from(reasonCodes).sort(stableCompare);
    const status = reasonList.length > 0
      ? 'abnormal'
      : !streamObject
        ? 'missing-object'
        : sourceObject?.hash && streamObject.hash
          ? 'verified-by-snapshot'
          : 'unknown';
    streamDiagnostics.push({
      songId: song.id,
      sourcePath: song.audioPath,
      streamPath: song.streamAudioPath,
      status,
      reasonCodes: reasonList,
      sourceSizeBytes,
      streamSizeBytes,
      declaredStreamBitrateKbps: song.streamBitrateKbps,
      estimatedStreamBitrateKbps,
    });

    if (reasonList.length === 0) continue;
    let candidate = abnormalByPath.get(song.streamAudioPath);
    if (!candidate) {
      candidate = makeReviewFields({
        kind: 'abnormal-stream-copy',
        path: song.streamAudioPath,
        sourcePath: song.audioPath,
        sourcePaths: [],
        songIds: [],
        reasonCodes: [],
        failureReason: 'stream-copy-metadata-or-object-invariant-failed',
      });
      abnormalByPath.set(song.streamAudioPath, candidate);
    }
    if (song.id) candidate.songIds.push(song.id);
    if (song.audioPath) candidate.sourcePaths.push(song.audioPath);
    candidate.reasonCodes.push(...reasonList);
  }
  const abnormalStreamCandidates = Array.from(abnormalByPath.values()).map((candidate) => {
    const sourcePaths = sortedUnique(candidate.sourcePaths);
    return {
      ...candidate,
      sourcePath: sourcePaths[0] ?? null,
      sourcePaths,
      songIds: sortedUnique(candidate.songIds),
      reasonCodes: sortedUnique(candidate.reasonCodes),
    };
  });
  streamDiagnostics.sort((left, right) => stableCompare(
    [left.songId ?? '', left.streamPath ?? '', left.sourcePath ?? ''].join('\u0000'),
    [right.songId ?? '', right.streamPath ?? '', right.sourcePath ?? ''].join('\u0000'),
  ));

  const referencedPaths = new Set(Array.from(references.values()).map((reference) => reference.path));
  const unreferencedObjects = inventoryObjects
    .filter((object) => !referencedPaths.has(object.key))
    .map(materializeObject);
  const referencedObjectCount = inventoryObjects.filter((object) => referencedPaths.has(object.key)).length;

  const candidates = [
    ...highBitrateCandidates,
    ...missingCandidates,
    ...duplicateCoverCandidates,
    ...duplicateAudioCandidates,
    ...abnormalStreamCandidates,
  ].sort(candidateSort);
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
    snapshotPagination,
    unreferencedObjects,
    streamDiagnostics,
    summary: {
      songCount: songs.length,
      albumCount: albums.length,
      profileCount: profiles.length,
      originalAudioReferenceCount: songs.filter((song) => song.audioPath).length,
      originalAudioPathCount: originalAudioPaths.length,
      originalAudioPaths,
      existingStreamCopySongCount: songs.filter((song) => song.streamAudioPath).length,
      existingStreamCopyCount: existingStreamCopyPaths.length,
      existingStreamCopyPaths,
      songCoverPathCount: songCoverPaths.length,
      albumCoverReferenceCount: albums.filter((album) => album.coverPath).length,
      albumCoverPathCount: albumCoverPaths.length,
      albumCoverPaths,
      profileAvatarReferenceCount: profiles.filter((profile) => profile.avatarPath).length,
      profileAvatarPathCount: profileAvatarPaths.length,
      profileAvatarPaths,
      profileCoverReferenceCount: profiles.filter((profile) => profile.coverPath).length,
      profileCoverPathCount: profileCoverPaths.length,
      profileCoverPaths,
      estimatedHighBitrateCandidateCount: highBitrateCandidates.length,
      missingResourceCandidateCount: missingCandidates.length,
      coverPathCount: coverPaths.length,
      coverPaths,
      duplicateCoverHashCandidateCount: duplicateCoverCandidates.length,
      duplicateCoverCandidatePathCount: duplicateCoverCandidates.reduce((sum, candidate) => sum + candidate.paths.length, 0),
      duplicateAudioHashCandidateCount: duplicateAudioCandidates.length,
      duplicateAudioCandidatePathCount: duplicateAudioCandidates.reduce((sum, candidate) => sum + candidate.paths.length, 0),
      streamCopyAuditCount: streamDiagnostics.length,
      abnormalStreamCopyCandidateCount: abnormalStreamCandidates.length,
      objectCount: inventoryObjects.length,
      referencedObjectCount,
      unreferencedObjectCount: unreferencedObjects.length,
      unreferencedObjectPaths: unreferencedObjects.map((object) => object.key),
      snapshotPaginationStatus: snapshotPagination.status,
      snapshotPaginationComplete: snapshotPagination.complete,
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
