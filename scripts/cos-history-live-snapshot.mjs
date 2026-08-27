import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import COS from 'cos-nodejs-sdk-v5';
import { createClient } from '@supabase/supabase-js';
import { main as runFixtureAudit } from './cos-history-audit.mjs';

export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_OUTPUT_DIR = resolve('output/cos-history');
export const LIVE_SNAPSHOT_SCHEMA_VERSION = 1;

export const SUPABASE_SELECT_FIELDS = Object.freeze({
  songs: 'id,audio_path,file_size,duration,stream_audio_path,stream_file_size,stream_bitrate_kbps,cover_path',
  albums: 'id,cover_url',
  profiles: 'id,avatar_url,cover_url',
});

export const SNAPSHOT_SCOPE = Object.freeze({
  database: 'current-authenticated-account-visible-under-RLS',
  databaseIsFullDatabase: false,
  cos: 'configured-bucket-object-list',
  readOnly: true,
});

const LIVE_FIXTURE_WARNING = '生产只读数据源与凭据映射尚未实现';

export class LiveSnapshotError extends Error {}

const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const textValue = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

const firstText = (...values) => {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return null;
};

const finiteNumber = (value) => {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(number) ? number : null;
};

const nonNegativeInteger = (value) => {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
};

const positiveInteger = (value, name) => {
  const number = finiteNumber(value);
  if (number === null || number < 1 || !Number.isInteger(number)) {
    throw new LiveSnapshotError(`${name} 必须是正整数`);
  }
  return number;
};

const booleanValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
};

const safeErrorCode = (error) => {
  const code = firstText(error?.Code, error?.code);
  const status = finiteNumber(error?.statusCode ?? error?.status);
  return [code ? `code=${code}` : '', status !== null ? `status=${status}` : ''].filter(Boolean).join(' ');
};

const safeOperationError = (prefix, error) => {
  const details = safeErrorCode(error);
  return new LiveSnapshotError(`${prefix}${details ? `：${details}` : ''}`);
};

const pick = (record, names) => {
  if (!isRecord(record)) return undefined;
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
};

const decodePath = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeResourcePath = (value) => {
  const raw = textValue(value);
  if (!raw) return null;

  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      path = parsed.pathname;
      const publicStorageMatch = path.match(/^\/?storage\/v1\/object\/public\/[^/]+\/(.+)$/i);
      if (publicStorageMatch) path = publicStorageMatch[1];
    } catch {
      path = raw.split(/[?#]/, 1)[0];
    }
  } else {
    path = raw.split(/[?#]/, 1)[0];
  }

  const normalized = decodePath(path).replace(/^\/+/, '');
  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
};

const normalizeCosKey = (value) => {
  const key = textValue(value);
  if (!key || /^https?:\/\//i.test(key) || /[\u0000-\u001F\u007F]/.test(key)) {
    throw new LiveSnapshotError('COS 对象清单包含无效或不安全的对象 key');
  }
  return key;
};

const normalizeId = (value) => {
  const id = textValue(value);
  return id && /^[A-Za-z0-9._:-]{1,128}$/.test(id) ? id : null;
};

const requiredId = (value, tableName) => {
  const id = normalizeId(value);
  if (!id) throw new LiveSnapshotError(`${tableName} 返回了缺失或不安全的 id`);
  return id;
};

const normalizeDate = (value) => {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeEtag = (value) => {
  const etag = textValue(value);
  if (!etag) return null;
  return etag.replace(/^"|"$/g, '');
};

const normalizeMaxPages = (value, name) => (
  value === Number.POSITIVE_INFINITY ? value : positiveInteger(value, name)
);

const envValue = (env, names) => {
  for (const name of names) {
    const value = textValue(env?.[name]);
    if (value) return value;
  }
  return null;
};

export const loadConfig = (env = process.env) => {
  const definitions = [
    ['supabaseUrl', ['JZONE_SUPABASE_URL', 'VITE_SUPABASE_URL']],
    ['supabaseAnonKey', ['JZONE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']],
    ['testEmail', ['JZONE_TEST_EMAIL']],
    ['testPassword', ['JZONE_TEST_PASSWORD']],
    ['cosSecretId', ['JZONE_COS_SECRET_ID', 'COS_SECRET_ID']],
    ['cosSecretKey', ['JZONE_COS_SECRET_KEY', 'COS_SECRET_KEY']],
    ['cosBucket', ['JZONE_COS_BUCKET', 'COS_BUCKET']],
    ['cosRegion', ['JZONE_COS_REGION', 'COS_REGION']],
  ];

  const config = Object.fromEntries(definitions.map(([key, names]) => [key, envValue(env, names)]));
  const missing = definitions
    .filter(([key]) => !config[key])
    .map(([, names]) => names[0]);

  if (missing.length > 0) {
    throw new LiveSnapshotError(
      `缺少必要环境变量：${missing.join('、')}。适配器默认只读，未执行远程操作`,
    );
  }

  return config;
};

export const createCosReadOnlyLister = ({ cosSecretId, cosSecretKey, CosConstructor = COS }) => {
  if (!textValue(cosSecretId) || !textValue(cosSecretKey)) {
    throw new LiveSnapshotError('COS 只读扫描缺少 SecretId 或 SecretKey');
  }

  const sdk = new CosConstructor({ SecretId: cosSecretId, SecretKey: cosSecretKey });
  if (!sdk || typeof sdk.getBucket !== 'function') {
    throw new LiveSnapshotError('COS SDK 不支持对象清单读取');
  }

  return {
    async listBucketPage({ bucket, region, marker, maxKeys }) {
      const params = {
        Bucket: bucket,
        Region: region,
        MaxKeys: maxKeys,
        ...(marker ? { Marker: marker } : {}),
      };

      return new Promise((resolvePage, rejectPage) => {
        sdk.getBucket(params, (error, data) => {
          if (error) {
            rejectPage(safeOperationError('COS 对象清单读取失败', error));
            return;
          }
          resolvePage(data ?? {});
        });
      });
    },
  };
};

export const createSupabaseReadOnlyClient = ({ supabaseUrl, supabaseAnonKey }) => {
  if (!textValue(supabaseUrl) || !textValue(supabaseAnonKey)) {
    throw new LiveSnapshotError('Supabase 只读扫描缺少 URL 或 anon key');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

export const signInForReadOnly = async (supabaseClient, { email, password }) => {
  if (!supabaseClient?.auth || typeof supabaseClient.auth.signInWithPassword !== 'function') {
    throw new LiveSnapshotError('Supabase client 不支持密码登录');
  }

  let result;
  try {
    result = await supabaseClient.auth.signInWithPassword({ email, password });
  } catch (error) {
    throw safeOperationError('Supabase 登录失败', error);
  }

  if (result?.error) throw safeOperationError('Supabase 登录失败', result.error);
  if (!result?.data?.session || !result?.data?.user) {
    throw new LiveSnapshotError('Supabase 登录未返回有效认证会话');
  }

  return { authenticated: true };
};

const normalizeCosObject = (rawObject) => {
  const object = {
    key: normalizeCosKey(pick(rawObject, ['Key', 'key'])),
    size: nonNegativeInteger(pick(rawObject, ['Size', 'size'])),
    etag: normalizeEtag(pick(rawObject, ['ETag', 'etag'])),
    lastModified: normalizeDate(pick(rawObject, ['LastModified', 'lastModified'])),
  };
  if (object.size === null || !object.etag || !object.lastModified) {
    throw new LiveSnapshotError('COS 对象清单缺少有效的 size、etag 或 lastModified');
  }
  return object;
};

export const listCosObjects = async ({
  lister,
  bucket,
  region,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = Number.POSITIVE_INFINITY,
}) => {
  const normalizedPageSize = positiveInteger(pageSize, 'COS pageSize');
  const normalizedMaxPages = normalizeMaxPages(maxPages, 'COS maxPages');
  if (normalizedPageSize > DEFAULT_PAGE_SIZE) {
    throw new LiveSnapshotError(`COS pageSize 不能超过 ${DEFAULT_PAGE_SIZE}`);
  }
  if (!lister || typeof lister.listBucketPage !== 'function') {
    throw new LiveSnapshotError('缺少 COS 对象清单读取器');
  }

  const objects = [];
  const pages = [];
  const seenMarkers = new Set();
  let marker = null;
  let complete = true;

  while (true) {
    if (pages.length >= normalizedMaxPages) {
      complete = false;
      break;
    }

    let response;
    try {
      response = await lister.listBucketPage({
        bucket,
        region,
        marker,
        maxKeys: normalizedPageSize,
      });
    } catch (error) {
      if (error instanceof LiveSnapshotError) throw error;
      throw safeOperationError('COS 对象清单读取失败', error);
    }

    const contents = Array.isArray(response?.Contents)
      ? response.Contents
      : Array.isArray(response?.contents)
        ? response.contents
        : [];
    const pageObjects = contents.map(normalizeCosObject);
    const offset = objects.length;
    objects.push(...pageObjects);

    const truncated = booleanValue(response?.IsTruncated ?? response?.isTruncated);
    const nextMarker = firstText(response?.NextMarker, response?.nextMarker);
    const contradictoryMarker = truncated === false && Boolean(nextMarker);
    const paginationSignalMissing = truncated === null && !nextMarker;
    const hasMore = truncated === true || (truncated === null && Boolean(nextMarker));
    pages.push({
      page: pages.length,
      offset,
      rowCount: pageObjects.length,
      hasMore: contradictoryMarker ? true : paginationSignalMissing ? null : hasMore,
    });

    if (contradictoryMarker) {
      complete = false;
      break;
    }
    if (paginationSignalMissing) {
      complete = false;
      break;
    }
    if (!hasMore) break;
    if (!nextMarker || seenMarkers.has(nextMarker) || nextMarker === marker) {
      complete = false;
      break;
    }

    seenMarkers.add(nextMarker);
    marker = nextMarker;
  }

  return {
    rows: objects,
    pagination: {
      pageSize: normalizedPageSize,
      pages,
      totalRows: complete ? objects.length : null,
      fetchedRows: objects.length,
      complete,
      status: complete ? 'complete' : 'incomplete',
    },
  };
};

const querySupabasePage = async ({ client, table, fields, offset, pageSize }) => {
  if (!client || typeof client.from !== 'function') {
    throw new LiveSnapshotError('缺少 Supabase 只读查询 client');
  }

  let query;
  try {
    query = client
      .from(table)
      .select(fields, { count: 'exact' })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    return await query;
  } catch (error) {
    throw safeOperationError(`Supabase ${table} 只读查询失败`, error);
  }
};

export const paginateSupabaseTable = async ({
  client,
  table,
  fields,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = Number.POSITIVE_INFINITY,
}) => {
  const normalizedPageSize = positiveInteger(pageSize, `${table} pageSize`);
  const normalizedMaxPages = normalizeMaxPages(maxPages, `${table} maxPages`);
  if (normalizedPageSize > DEFAULT_PAGE_SIZE) {
    throw new LiveSnapshotError(`${table} pageSize 不能超过 ${DEFAULT_PAGE_SIZE}`);
  }

  const rows = [];
  const pages = [];
  let offset = 0;
  let totalRows = null;
  let complete = true;
  let countMismatch = false;

  while (true) {
    if (pages.length >= normalizedMaxPages) {
      complete = false;
      break;
    }

    const result = await querySupabasePage({ client, table, fields, offset, pageSize: normalizedPageSize });
    if (!isRecord(result) || !Object.prototype.hasOwnProperty.call(result, 'data')) {
      throw new LiveSnapshotError(`Supabase ${table} 返回了无效的只读查询响应`);
    }
    if (result?.error) throw safeOperationError(`Supabase ${table} 只读查询失败`, result.error);

    const pageRows = Array.isArray(result?.data) ? result.data : [];
    const pageCount = nonNegativeInteger(result?.count);
    if (pageCount !== null) {
      if (totalRows === null) totalRows = pageCount;
      else if (totalRows !== pageCount) countMismatch = true;
    }

    if (pageRows.length === 0) {
      if (totalRows !== null && rows.length !== totalRows) complete = false;
      if (pages.length > 0) pages.at(-1).hasMore = false;
      break;
    }

    rows.push(...pageRows);
    const hasMore = totalRows !== null
      ? rows.length < totalRows
      : pageRows.length === normalizedPageSize;
    pages.push({
      page: pages.length,
      offset,
      rowCount: pageRows.length,
      hasMore,
    });

    if (!hasMore) break;
    offset += pageRows.length;
  }

  if (totalRows !== null && rows.length !== totalRows) complete = false;
  if (countMismatch) complete = false;

  return {
    rows,
    pagination: {
      pageSize: normalizedPageSize,
      pages,
      totalRows,
      fetchedRows: rows.length,
      complete,
      status: complete ? 'complete' : 'incomplete',
    },
  };
};

const sanitizeSongRow = (row) => ({
  id: requiredId(pick(row, ['id']), 'songs'),
  audio_path: normalizeResourcePath(pick(row, ['audio_path', 'audioPath'])),
  file_size: nonNegativeInteger(pick(row, ['file_size', 'fileSize'])),
  duration: finiteNumber(pick(row, ['duration'])),
  stream_audio_path: normalizeResourcePath(pick(row, ['stream_audio_path', 'streamAudioPath'])),
  stream_file_size: nonNegativeInteger(pick(row, ['stream_file_size', 'streamFileSize'])),
  stream_bitrate_kbps: finiteNumber(pick(row, ['stream_bitrate_kbps', 'streamBitrateKbps'])),
  cover_path: normalizeResourcePath(pick(row, ['cover_path', 'coverPath'])),
});

const sanitizeAlbumRow = (row) => ({
  id: requiredId(pick(row, ['id']), 'albums'),
  cover_url: normalizeResourcePath(pick(row, ['cover_url', 'coverUrl', 'cover_path', 'coverPath'])),
});

const sanitizeProfileRow = (row) => ({
  id: requiredId(pick(row, ['id']), 'profiles'),
  avatar_url: normalizeResourcePath(pick(row, ['avatar_url', 'avatarUrl', 'avatar_path', 'avatarPath'])),
  cover_url: normalizeResourcePath(pick(row, ['cover_url', 'coverUrl', 'cover_path', 'coverPath'])),
});

const sensitiveKeyPattern = /(?:^|_)(?:email|nickname|password|secret|token|authorization|signed.?url|access.?key)(?:$|_)/i;
const sensitiveValuePatterns = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i,
  /(?:^|[?&])(?:token|sign|signature|expires|x-cos-security-token|x-amz-[^=]+)=/i,
  /(?:^|\s)Bearer\s+eyJ[\w-]+\.[\w-]+\.[\w-]+/i,
];

export const assertNoSensitiveContent = (value, path = '$') => {
  if (typeof value === 'string') {
    if (sensitiveValuePatterns.some((pattern) => pattern.test(value))) {
      throw new LiveSnapshotError(`脱敏校验失败：输出字段 ${path} 含有受禁止的敏感值`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveContent(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key)) {
      throw new LiveSnapshotError(`脱敏校验失败：输出字段 ${path}.${key} 不在允许范围内`);
    }
    assertNoSensitiveContent(child, `${path}.${key}`);
  }
};

const normalizeGeneratedAt = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const buildLiveFixture = ({ generatedAt, songs, albums, profiles, objects, pagination }) => {
  const fixture = {
    schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: normalizeGeneratedAt(generatedAt),
    mode: 'live-read-only-snapshot',
    readOnly: true,
    snapshotScope: SNAPSHOT_SCOPE,
    redaction: {
      applied: true,
      strategy: 'allow-list-only',
    },
    songs: songs.map(sanitizeSongRow),
    albums: albums.map(sanitizeAlbumRow),
    profiles: profiles.map(sanitizeProfileRow),
    objects: objects.map(normalizeCosObject),
    pagination: {
      songs: pagination.songs,
      albums: pagination.albums,
      profiles: pagination.profiles,
      objects: pagination.objects,
    },
  };

  assertNoSensitiveContent(fixture);
  return fixture;
};

const sortStrings = (values) => Array.from(new Set(values)).sort();

export const decorateLiveReport = (report, fixture) => {
  const warnings = new Set((Array.isArray(report?.warnings) ? report.warnings : []).filter((warning) => warning !== LIVE_FIXTURE_WARNING));
  warnings.add('数据库快照只包含当前认证账号在 RLS 下可见的 songs、albums、profiles 行，不代表数据库全库');
  warnings.add('COS 快照只执行对象清单读取；未下载对象、未逐对象读取元数据、未执行远程写入或删除');

  const decorated = {
    ...report,
    sourceMode: 'live-read-only',
    snapshotScope: fixture.snapshotScope,
    sourcePagination: {
      status: report?.snapshotPagination?.status ?? 'unknown',
      complete: report?.snapshotPagination?.complete ?? null,
      tables: report?.snapshotPagination?.tables ?? {},
    },
    readOnlyControls: {
      cosObjectListingOnly: true,
      objectBodiesFetched: false,
      perObjectMetadataRequests: false,
      remoteWrites: false,
      remoteDeletes: false,
      supabaseDataMutations: false,
    },
    warnings: sortStrings(Array.from(warnings)),
  };

  assertNoSensitiveContent(decorated);
  return decorated;
};

const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const runLiveSnapshot = async ({
  env = process.env,
  config = null,
  cosLister = null,
  cosConstructor = COS,
  supabaseClient = null,
  auditMain = runFixtureAudit,
  outputDir = DEFAULT_OUTPUT_DIR,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = Number.POSITIVE_INFINITY,
  generatedAt = undefined,
} = {}) => {
  const resolvedConfig = config ?? loadConfig(env);
  const normalizedPageSize = positiveInteger(pageSize, 'pageSize');
  if (normalizedPageSize > DEFAULT_PAGE_SIZE) {
    throw new LiveSnapshotError(`pageSize 不能超过 ${DEFAULT_PAGE_SIZE}`);
  }

  const resolvedCosLister = cosLister ?? createCosReadOnlyLister({
    ...resolvedConfig,
    CosConstructor: cosConstructor,
  });
  const resolvedSupabaseClient = supabaseClient ?? createSupabaseReadOnlyClient(resolvedConfig);
  await signInForReadOnly(resolvedSupabaseClient, {
    email: resolvedConfig.testEmail,
    password: resolvedConfig.testPassword,
  });

  const songPage = await paginateSupabaseTable({
    client: resolvedSupabaseClient,
    table: 'songs',
    fields: SUPABASE_SELECT_FIELDS.songs,
    pageSize: normalizedPageSize,
    maxPages,
  });
  const albumPage = await paginateSupabaseTable({
    client: resolvedSupabaseClient,
    table: 'albums',
    fields: SUPABASE_SELECT_FIELDS.albums,
    pageSize: normalizedPageSize,
    maxPages,
  });
  const profilePage = await paginateSupabaseTable({
    client: resolvedSupabaseClient,
    table: 'profiles',
    fields: SUPABASE_SELECT_FIELDS.profiles,
    pageSize: normalizedPageSize,
    maxPages,
  });
  const cosPage = await listCosObjects({
    lister: resolvedCosLister,
    bucket: resolvedConfig.cosBucket,
    region: resolvedConfig.cosRegion,
    pageSize: normalizedPageSize,
    maxPages,
  });

  const fixture = buildLiveFixture({
    generatedAt,
    songs: songPage.rows,
    albums: albumPage.rows,
    profiles: profilePage.rows,
    objects: cosPage.rows,
    pagination: {
      songs: songPage.pagination,
      albums: albumPage.pagination,
      profiles: profilePage.pagination,
      objects: cosPage.pagination,
    },
  });

  const resolvedOutputDir = resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const fixturePath = join(resolvedOutputDir, 'cos-history-live-snapshot.json');
  const reportPath = join(resolvedOutputDir, 'cos-history-live-report.json');
  await writeJson(fixturePath, fixture);

  let auditError = null;
  const auditCode = await auditMain(
    ['--fixture', fixturePath, '--output', reportPath],
    {
      log: () => {},
      error: (message) => {
        auditError = textValue(message) ?? 'fixture-only 审计失败';
      },
    },
  );
  if (auditCode !== 0) {
    throw new LiveSnapshotError(auditError ? `fixture-only 审计失败：${auditError}` : 'fixture-only 审计失败');
  }

  let report;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    throw new LiveSnapshotError('fixture-only 审计未生成有效报告');
  }
  report = decorateLiveReport(report, fixture);
  await writeJson(reportPath, report);

  return { fixturePath, reportPath, fixture, report };
};

const parseCliInteger = (argument, value, maximum = Number.POSITIVE_INFINITY) => {
  const number = positiveInteger(value, argument);
  if (number > maximum) throw new LiveSnapshotError(`${argument} 不能大于 ${maximum}`);
  return number;
};

export const parseCliArgs = (args) => {
  const parsed = {
    help: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    pageSize: DEFAULT_PAGE_SIZE,
    maxPages: Number.POSITIVE_INFINITY,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      parsed.help = true;
      continue;
    }
    if (argument === '--output-dir' || argument === '--page-size' || argument === '--max-pages') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new LiveSnapshotError(`${argument} 需要一个参数`);
      if (argument === '--output-dir') parsed.outputDir = value;
      if (argument === '--page-size') parsed.pageSize = parseCliInteger(argument, value, DEFAULT_PAGE_SIZE);
      if (argument === '--max-pages') parsed.maxPages = parseCliInteger(argument, value);
      index += 1;
      continue;
    }
    throw new LiveSnapshotError('不支持的参数；请使用 --help 查看用法');
  }

  return parsed;
};

const HELP_TEXT = `COS 历史资源只读实盘快照适配器

用法：
  node scripts/cos-history-live-snapshot.mjs
  node scripts/cos-history-live-snapshot.mjs --output-dir output/cos-history --page-size 1000

必需环境变量：
  JZONE_SUPABASE_URL 或 VITE_SUPABASE_URL
  JZONE_SUPABASE_ANON_KEY 或 VITE_SUPABASE_ANON_KEY
  JZONE_TEST_EMAIL、JZONE_TEST_PASSWORD
  JZONE_COS_SECRET_ID、JZONE_COS_SECRET_KEY、JZONE_COS_BUCKET、JZONE_COS_REGION

边界：
  默认只读；COS 仅调用对象清单接口，不下载对象、不逐对象读取元数据、不写入或删除。
  Supabase 登录后只在 RLS 会话下分页读取 songs、albums、profiles 的审计字段。
  --max-pages 仅用于受控不完整快照验证；输出会明确标记 incomplete。
  输出：<output-dir>/cos-history-live-snapshot.json 与 cos-history-live-report.json。
`;

export const main = async (args = process.argv.slice(2), io = console, dependencies = {}) => {
  try {
    const parsed = parseCliArgs(args);
    if (parsed.help) {
      io.log(HELP_TEXT.trimEnd());
      return 0;
    }

    const result = await runLiveSnapshot({
      env: dependencies.env ?? process.env,
      config: dependencies.config ?? null,
      cosLister: dependencies.cosLister ?? null,
      cosConstructor: dependencies.cosConstructor ?? COS,
      supabaseClient: dependencies.supabaseClient ?? null,
      auditMain: dependencies.auditMain ?? runFixtureAudit,
      outputDir: parsed.outputDir,
      pageSize: parsed.pageSize,
      maxPages: parsed.maxPages,
      generatedAt: dependencies.generatedAt,
    });
    io.log(`只读快照已写入：${result.fixturePath}`);
    io.log(`只读审计报告已写入：${result.reportPath}`);
    return 0;
  } catch (error) {
    const message = error instanceof LiveSnapshotError
      ? error.message
      : '只读实盘快照失败；未确认输出内容，未继续执行其他远程操作';
    io.error(message);
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exitCode = await main();
  if (exitCode !== 0) process.exitCode = exitCode;
}
