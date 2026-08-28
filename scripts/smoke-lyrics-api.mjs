import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

const readProjectFile = (relativePath) => fs.readFile(
  path.join(projectRoot, relativePath),
  'utf8',
);

const transpile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    verbatimModuleSyntax: false,
  },
}).outputText;

const toDataUrl = (source) => (
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`
);

const loadLyricsApi = async () => {
  const source = await readProjectFile('services/supabase/lyrics.ts');
  const cacheUrl = toDataUrl(`
    const values = new Map();
    export const cached = async (key, _ttlMs, loader) => {
      if (values.has(key)) return values.get(key);
      const value = await loader();
      values.set(key, value);
      return value;
    };
    export const invalidateApiCache = (match) => {
      for (const key of values.keys()) {
        if (match(key)) values.delete(key);
      }
    };
  `);
  const clientUrl = toDataUrl(`
    let activeClient;
    export const setSupabaseClient = (client) => { activeClient = client; };
    export const ensureSupabase = () => {
      if (!activeClient) throw new Error('smoke 未设置 Supabase 客户端');
      return activeClient;
    };
  `);
  const javascript = transpile(source, 'lyrics.ts')
    .replaceAll("from './cache'", `from '${cacheUrl}'`)
    .replaceAll("from './client'", `from '${clientUrl}'`);
  const api = await import(toDataUrl(javascript));
  const clientModule = await import(clientUrl);
  return { ...api, setSupabaseClient: clientModule.setSupabaseClient };
};

const createMockSupabase = () => {
  const rows = new Map();
  const songOwners = new Map([['song-1', 'owner-1']]);
  const publicSongs = new Set();
  const calls = {
    auth: 0,
    selects: 0,
    upserts: [],
    deletes: 0,
  };
  let viewerId = 'owner-1';

  const setViewer = (nextViewerId) => {
    viewerId = nextViewerId;
  };

  const execute = (state) => {
    const songId = state.songId;
    if (state.mode === 'upsert') {
      calls.upserts.push({ payload: { ...state.payload }, options: { ...state.options } });
      if (songOwners.get(songId) !== viewerId) {
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      }
      const previous = rows.get(songId);
      const row = {
        ...state.payload,
        created_at: previous?.created_at ?? '2026-08-27T00:00:00.000Z',
        updated_at: '2026-08-27T00:00:01.000Z',
      };
      rows.set(songId, row);
      return { data: { ...row }, error: null };
    }

    if (state.mode === 'delete') {
      calls.deletes += 1;
      if (songOwners.get(songId) !== viewerId) {
        return { error: { code: '42501', message: 'permission denied' } };
      }
      rows.delete(songId);
      return { error: null };
    }

    calls.selects += 1;
    const row = rows.get(songId);
    const canRead = publicSongs.has(songId) || songOwners.get(songId) === viewerId;
    return { data: canRead && row ? { ...row } : null, error: null };
  };

  const from = (tableName) => {
    assert.equal(tableName, 'song_lyrics', '歌词 API 只能访问 song_lyrics');
    const state = {
      mode: 'select',
      payload: null,
      options: null,
      songId: null,
    };
    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        assert.equal(column, 'song_id');
        state.songId = value;
        if (state.mode === 'delete') return Promise.resolve(execute(state));
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(execute(state));
      },
      upsert(payload, options) {
        state.mode = 'upsert';
        state.payload = payload;
        state.options = options;
        state.songId = payload.song_id;
        return builder;
      },
      single() {
        return Promise.resolve(execute(state));
      },
      delete() {
        state.mode = 'delete';
        return builder;
      },
    };
    return builder;
  };

  return {
    client: {
      auth: {
        async getUser() {
          calls.auth += 1;
          return { data: { user: { id: viewerId } }, error: null };
        },
      },
      from,
    },
    calls,
    rows,
    setViewer,
  };
};

const run = async () => {
  const migration = await readProjectFile('supabase/sql/023_song_lyrics.sql');
  assert.match(migration, /create table if not exists public\.song_lyrics/i);
  assert.match(migration, /song_id uuid primary key references public\.songs\(id\) on delete cascade/i);
  assert.match(migration, /format in \('plain', 'lrc', 'ttml'\)/i);
  assert.match(migration, /source in \('upload', 'embedded', 'editor'\)/i);
  assert.match(migration, /normalized_content jsonb/i);
  assert.match(migration, /offset_ms integer not null default 0/i);
  assert.match(migration, /checksum text not null/i);
  assert.match(migration, /version integer not null default 1/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/i);
  assert.match(migration, /create trigger song_lyrics_set_updated_at/i);
  assert.match(migration, /coalesce\(s\.is_public, s\.visibility = 'public'\)/i);
  assert.match(migration, /song_lyrics_select_song_visible/i);
  assert.match(migration, /song_lyrics_insert_song_owner/i);
  assert.match(migration, /song_lyrics_update_song_owner/i);
  assert.match(migration, /song_lyrics_delete_song_owner/i);

  const lyricsSource = await readProjectFile('services/supabase/lyrics.ts');
  assert.doesNotMatch(lyricsSource, /cosClient|COS|storageApi/i, '歌词 API 不得依赖 COS');
  const apiImplSource = await readProjectFile('services/supabase/supabaseApiImpl.ts');
  assert.match(apiImplSource, /createSongLyricsApi/);
  assert.match(apiImplSource, /\.\.\.songLyricsApi/);
  const indexSource = await readProjectFile('services/supabase/index.ts');
  assert.match(indexSource, /export \* from '\.\/lyrics';/);

  const {
    createSongLyricsApi,
    createLyricsApi,
    setSupabaseClient,
  } = await loadLyricsApi();
  assert.equal(createLyricsApi, createSongLyricsApi, '歌词 API 工厂别名必须保持一致');

  const mock = createMockSupabase();
  setSupabaseClient(mock.client);
  const api = createSongLyricsApi();

  const firstEmpty = await api.fetchSongLyrics(' song-1 ');
  assert.equal(firstEmpty, null);
  assert.equal(mock.calls.selects, 1);

  const saved = await api.upsertSongLyrics(' song-1 ', {
    format: 'lrc',
    source: 'editor',
    rawContent: '[00:01.00]第一行',
    normalizedContent: { lines: [{ startMs: 1000, text: '第一行' }] },
    offsetMs: -120,
    version: 1,
  });
  assert.equal(saved.song_id, 'song-1');
  assert.equal(saved.format, 'lrc');
  assert.equal(mock.calls.upserts.length, 1);
  assert.deepEqual(mock.calls.upserts[0].options, { onConflict: 'song_id' });
  assert.equal(mock.calls.upserts[0].payload.offset_ms, -120);
  assert.equal(typeof mock.calls.upserts[0].payload.checksum, 'string');
  assert.ok(mock.calls.upserts[0].payload.checksum.length > 0);

  const fetched = await api.fetchSongLyrics('song-1');
  assert.equal(fetched?.raw_content, '[00:01.00]第一行');
  assert.equal(mock.calls.selects, 2, '保存后必须失效歌词缓存');
  await api.fetchSongLyrics('song-1');
  assert.equal(mock.calls.selects, 2, '同一用户和歌曲的歌词读取应命中缓存');

  mock.setViewer('owner-2');
  const privateLyricsForOtherUser = await api.fetchSongLyrics('song-1');
  assert.equal(privateLyricsForOtherUser, null, '其他用户不能复用歌曲所有者的私有歌词缓存');
  assert.equal(mock.calls.selects, 3);

  mock.setViewer('owner-1');
  await api.deleteSongLyrics('song-1');
  assert.equal(mock.calls.deletes, 1);
  assert.equal(await api.fetchSongLyrics('song-1'), null);
  assert.equal(mock.calls.selects, 4, '删除后必须失效歌词缓存');

  await assert.rejects(
    () => api.upsertSongLyrics('song-1', {
      format: 'unsupported',
      source: 'editor',
      rawContent: '无效格式',
    }),
    /不支持的歌词格式/,
  );

  console.log('smoke-lyrics-api.mjs：通过（迁移契约、RLS 口径、读写、缓存失效与用户隔离）');
};

await run();
