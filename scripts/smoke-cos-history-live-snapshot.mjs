import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  listCosObjects,
  main,
  paginateSupabaseTable,
  runLiveSnapshot,
} from './cos-history-live-snapshot.mjs';

const cosState = {
  constructorOptions: null,
  calls: [],
  forbiddenCalls: [],
};

const cosPages = [
  {
    Contents: [
      { Key: 'media/song-1.mp3', Size: '1000000', ETag: '"etag-song-1"', LastModified: '2026-08-27T00:00:00.000Z' },
      { Key: 'covers/song-1.jpg', Size: '1000', ETag: '"etag-cover-1"', LastModified: '2026-08-27T00:00:01.000Z' },
    ],
    IsTruncated: true,
    NextMarker: 'marker-1',
  },
  {
    Contents: [
      { Key: 'media/song-2.mp3', Size: '1100000', ETag: '"etag-song-2"', LastModified: '2026-08-27T00:00:02.000Z' },
      { Key: 'media/song-3.mp3', Size: '1200000', ETag: '"etag-song-3"', LastModified: '2026-08-27T00:00:03.000Z' },
    ],
    IsTruncated: true,
    NextMarker: 'marker-2',
  },
  {
    Contents: [
      { Key: 'covers/song-3.jpg', Size: '1200', ETag: '"etag-cover-3"', LastModified: '2026-08-27T00:00:04.000Z' },
      { Key: 'albums/album-1.jpg', Size: '1300', ETag: '"etag-album-1"', LastModified: '2026-08-27T00:00:05.000Z' },
    ],
    IsTruncated: true,
    NextMarker: 'marker-3',
  },
  {
    Contents: [
      { Key: 'profiles/user-1/avatar.jpg', Size: '1400', ETag: '"etag-avatar-1"', LastModified: '2026-08-27T00:00:06.000Z' },
      { Key: 'profiles/user-1/cover.jpg', Size: '1500', ETag: '"etag-profile-cover-1"', LastModified: '2026-08-27T00:00:07.000Z' },
    ],
    IsTruncated: false,
  },
];

class MockCosSdk {
  constructor(options) {
    cosState.constructorOptions = options;
    this.pageIndex = 0;
  }

  getBucket(params, callback) {
    cosState.calls.push(params);
    callback(null, cosPages[this.pageIndex++] ?? { Contents: [], IsTruncated: false });
  }

  headObject() {
    cosState.forbiddenCalls.push('headObject');
    throw new Error('smoke 不允许 headObject');
  }

  getObject() {
    cosState.forbiddenCalls.push('getObject');
    throw new Error('smoke 不允许 getObject');
  }

  putObject() {
    cosState.forbiddenCalls.push('putObject');
    throw new Error('smoke 不允许 putObject');
  }

  deleteMultipleObject() {
    cosState.forbiddenCalls.push('deleteMultipleObject');
    throw new Error('smoke 不允许 deleteMultipleObject');
  }
}

const tableRows = {
  songs: [
    {
      id: 'song-1',
      owner_id: 'owner-secret-1',
      nickname: '不应输出的昵称',
      email: 'hidden@example.invalid',
      title: '不应输出的标题',
      audio_path: 'media/song-1.mp3?sign=TOP_SECRET_QUERY',
      file_size: '1000000',
      duration: '120',
      stream_audio_path: null,
      stream_file_size: null,
      stream_bitrate_kbps: null,
      cover_path: 'covers/song-1.jpg?token=TOP_SECRET_TOKEN',
    },
    {
      id: 'song-2',
      owner_id: 'owner-secret-2',
      audio_path: 'media/song-2.mp3',
      file_size: 1100000,
      duration: 121,
      stream_audio_path: null,
      stream_file_size: null,
      stream_bitrate_kbps: null,
      cover_path: null,
    },
    {
      id: 'song-3',
      owner_id: 'owner-secret-3',
      audio_path: 'media/song-3.mp3',
      file_size: 1200000,
      duration: 122,
      stream_audio_path: null,
      stream_file_size: null,
      stream_bitrate_kbps: null,
      cover_path: 'covers/song-3.jpg',
    },
  ],
  albums: [
    {
      id: 'album-1',
      nickname: '不应输出的专辑昵称',
      cover_url: 'albums/album-1.jpg?signature=TOP_SECRET_SIGNATURE',
    },
  ],
  profiles: [
    {
      id: 'user-1',
      nickname: '不应输出的用户昵称',
      email: 'profile@example.invalid',
      avatar_url: 'profiles/user-1/avatar.jpg?token=TOP_SECRET_TOKEN',
      cover_url: 'profiles/user-1/cover.jpg',
    },
  ],
};

const supabaseState = {
  authCalls: [],
  operations: [],
  forbiddenCalls: [],
};

const mockSupabase = {
  auth: {
    async signInWithPassword(credentials) {
      supabaseState.authCalls.push({ hasEmail: Boolean(credentials?.email), hasPassword: Boolean(credentials?.password) });
      return {
        data: { session: { access_token: 'mock-token-not-for-output' }, user: { id: 'user-1' } },
        error: null,
      };
    },
  },
  from(table) {
    const builder = {
      select(fields, options) {
        supabaseState.operations.push({ operation: 'select', table, fields, options });
        return builder;
      },
      order(field, options) {
        supabaseState.operations.push({ operation: 'order', table, field, options });
        return builder;
      },
      range(from, to) {
        supabaseState.operations.push({ operation: 'range', table, from, to });
        const rows = tableRows[table] ?? [];
        return Promise.resolve({ data: rows.slice(from, to + 1), count: rows.length, error: null });
      },
      insert() {
        supabaseState.forbiddenCalls.push('insert');
        throw new Error('smoke 不允许 insert');
      },
      update() {
        supabaseState.forbiddenCalls.push('update');
        throw new Error('smoke 不允许 update');
      },
      upsert() {
        supabaseState.forbiddenCalls.push('upsert');
        throw new Error('smoke 不允许 upsert');
      },
      delete() {
        supabaseState.forbiddenCalls.push('delete');
        throw new Error('smoke 不允许 delete');
      },
      rpc() {
        supabaseState.forbiddenCalls.push('rpc');
        throw new Error('smoke 不允许 rpc');
      },
    };
    return builder;
  },
};

const mockEnv = {
  JZONE_SUPABASE_URL: 'https://supabase.example.invalid',
  JZONE_SUPABASE_ANON_KEY: 'mock-anon-key-not-for-output',
  JZONE_TEST_EMAIL: 'smoke@example.invalid',
  JZONE_TEST_PASSWORD: 'mock-password-not-for-output',
  JZONE_COS_SECRET_ID: 'mock-cos-id-not-for-output',
  JZONE_COS_SECRET_KEY: 'mock-cos-key-not-for-output',
  JZONE_COS_BUCKET: 'mock-bucket',
  JZONE_COS_REGION: 'ap-test-1',
};

const config = loadConfig(mockEnv);
assert.deepEqual(config, {
  supabaseUrl: mockEnv.JZONE_SUPABASE_URL,
  supabaseAnonKey: mockEnv.JZONE_SUPABASE_ANON_KEY,
  testEmail: mockEnv.JZONE_TEST_EMAIL,
  testPassword: mockEnv.JZONE_TEST_PASSWORD,
  cosSecretId: mockEnv.JZONE_COS_SECRET_ID,
  cosSecretKey: mockEnv.JZONE_COS_SECRET_KEY,
  cosBucket: mockEnv.JZONE_COS_BUCKET,
  cosRegion: mockEnv.JZONE_COS_REGION,
});

const outputDir = await mkdtemp(join(tmpdir(), 'jzone-cos-history-live-smoke-'));
try {
  const result = await runLiveSnapshot({
    env: mockEnv,
    cosConstructor: MockCosSdk,
    supabaseClient: mockSupabase,
    outputDir,
    pageSize: 2,
    generatedAt: '2026-08-27T08:00:00.000Z',
  });

  assert.deepEqual(cosState.constructorOptions, {
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });
  assert.equal(cosState.calls.length, 4, 'COS 应分页读取全部对象');
  assert.deepEqual(cosState.calls.map((call) => call.Marker ?? null), [null, 'marker-1', 'marker-2', 'marker-3']);
  assert.ok(cosState.calls.every((call) => call.Bucket === config.cosBucket && call.Region === config.cosRegion && call.MaxKeys === 2));
  assert.deepEqual(cosState.forbiddenCalls, [], 'COS 不得调用下载、HEAD、写入或删除接口');

  assert.deepEqual(supabaseState.authCalls, [{ hasEmail: true, hasPassword: true }]);
  assert.deepEqual(
    supabaseState.operations.filter((operation) => operation.operation === 'range').map(({ table, from, to }) => ({ table, from, to })),
    [
      { table: 'songs', from: 0, to: 1 },
      { table: 'songs', from: 2, to: 3 },
      { table: 'albums', from: 0, to: 1 },
      { table: 'profiles', from: 0, to: 1 },
    ],
  );
  assert.deepEqual(
    supabaseState.operations.filter((operation) => operation.operation === 'select').map(({ table, fields, options }) => ({ table, fields, options })),
    [
      { table: 'songs', fields: 'id,audio_path,file_size,duration,stream_audio_path,stream_file_size,stream_bitrate_kbps,cover_path', options: { count: 'exact' } },
      { table: 'songs', fields: 'id,audio_path,file_size,duration,stream_audio_path,stream_file_size,stream_bitrate_kbps,cover_path', options: { count: 'exact' } },
      { table: 'albums', fields: 'id,cover_url', options: { count: 'exact' } },
      { table: 'profiles', fields: 'id,avatar_url,cover_url', options: { count: 'exact' } },
    ],
  );
  assert.deepEqual(supabaseState.forbiddenCalls, [], 'Supabase 只读快照不得调用数据变更方法');

  const missingFieldClient = {
    from() {
      const builder = {
        select() {
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return Promise.resolve({ data: null, count: null, error: { code: '42703' } });
        },
      };
      return builder;
    },
  };
  await assert.rejects(
    () => paginateSupabaseTable({
      client: missingFieldClient,
      table: 'profiles',
      fields: 'id,avatar_url,cover_url',
      pageSize: 2,
    }),
    /Supabase profiles 只读查询失败/,
    'Supabase 字段不存在时必须明确失败，不得伪造空表 complete',
  );

  assert.equal(result.fixture.readOnly, true);
  assert.equal(result.fixture.snapshotScope.database, 'current-authenticated-account-visible-under-RLS');
  assert.equal(result.fixture.snapshotScope.databaseIsFullDatabase, false);
  assert.equal(result.fixture.pagination.objects.complete, true);
  assert.equal(result.fixture.pagination.objects.status, 'complete');
  assert.equal(result.fixture.pagination.objects.fetchedRows, 8);
  assert.equal(result.fixture.objects[0].etag, 'etag-song-1');
  assert.equal(result.fixture.objects[0].lastModified, '2026-08-27T00:00:00.000Z');
  assert.equal(result.fixture.songs[0].audio_path, 'media/song-1.mp3');
  assert.equal(result.fixture.albums[0].cover_url, 'albums/album-1.jpg');
  assert.equal(result.fixture.profiles[0].avatar_url, 'profiles/user-1/avatar.jpg');

  const fixtureText = await readFile(result.fixturePath, 'utf8');
  const reportText = await readFile(result.reportPath, 'utf8');
  for (const text of [fixtureText, reportText]) {
    assert.doesNotMatch(text, /TOP_SECRET|mock-token-not-for-output|mock-password-not-for-output|mock-cos-key-not-for-output/);
    assert.doesNotMatch(text, /hidden@example\.invalid|profile@example\.invalid|不应输出/);
    assert.doesNotMatch(text, /owner_id|nickname|email|access_token|[?&](?:token|sign|signature)=/i);
  }

  assert.equal(result.report.sourceMode, 'live-read-only');
  assert.equal(result.report.mode, 'fixture');
  assert.equal(result.report.readOnly, true);
  assert.equal(result.report.snapshotScope.databaseIsFullDatabase, false);
  assert.equal(result.report.snapshotPagination.status, 'complete');
  assert.equal(result.report.snapshotPagination.complete, true);
  assert.equal(result.report.sourcePagination.tables.songs.status, 'complete');

  const incomplete = await listCosObjects({
    lister: { listBucketPage: async () => cosPages[0] },
    bucket: 'mock-bucket',
    region: 'ap-test-1',
    pageSize: 2,
    maxPages: 1,
  });
  assert.equal(incomplete.pagination.complete, false);
  assert.equal(incomplete.pagination.status, 'incomplete');
  assert.equal(incomplete.pagination.pages[0].hasMore, true);

  const errors = [];
  const exitCode = await main([], { log: () => {}, error: (message) => errors.push(message) }, { env: {} });
  assert.equal(exitCode, 1, '缺少凭据时必须失败');
  assert.match(errors[0], /JZONE_TEST_EMAIL/);

  console.log('smoke-cos-history-live-snapshot.mjs: 通过');
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
