import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const parseEnvFile = (path) => {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        return [line.slice(0, separator).trim(), value];
      }),
  );
};

const localEnv = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.local'),
};
const supabaseUrl = localEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = localEnv.VITE_SUPABASE_ANON_KEY;
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey) throw new Error('缺少 Supabase 测试配置');
if (!email || !password) throw new Error('缺少 JZONE_TEST_EMAIL 或 JZONE_TEST_PASSWORD');

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const songId = crypto.randomUUID();
let insertedSong = false;

try {
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw authError;

  const { error: songError } = await client.from('songs').insert({
    id: songId,
    owner_id: auth.user.id,
    visibility: 'private',
    is_public: false,
    title: 'Codex 歌词 RLS 临时验证',
    artist: 'JZone Test',
    duration: 12,
    trim_start: 0,
    trim_end: 12,
    audio_path: '__codex_lyrics_test__/no-media.m4a',
  });
  if (songError) throw songError;
  insertedSong = true;

  const { error: insertError } = await client.from('song_lyrics').insert({
    song_id: songId,
    format: 'lrc',
    source: 'editor',
    raw_content: '[00:01.00]临时验证',
    offset_ms: 0,
    checksum: 'codex-test-v1',
    version: 1,
  });
  if (insertError) throw insertError;

  const { data: first, error: firstError } = await client
    .from('song_lyrics')
    .select('version')
    .eq('song_id', songId)
    .single();
  if (firstError) throw firstError;

  const { error: updateError } = await client
    .from('song_lyrics')
    .update({ raw_content: '[00:02.00]更新验证', checksum: 'codex-test-v2', version: 2 })
    .eq('song_id', songId);
  if (updateError) throw updateError;

  const { data: second, error: secondError } = await client
    .from('song_lyrics')
    .select('version')
    .eq('song_id', songId)
    .single();
  if (secondError) throw secondError;

  const { error: deleteError } = await client.from('song_lyrics').delete().eq('song_id', songId);
  if (deleteError) throw deleteError;
  const { data: after, error: afterError } = await client
    .from('song_lyrics')
    .select('song_id')
    .eq('song_id', songId)
    .maybeSingle();
  if (afterError) throw afterError;

  console.log(JSON.stringify({
    ok: true,
    insertRead: first?.version === 1,
    updateRead: second?.version === 2,
    deleteRead: after === null,
  }));
} finally {
  if (insertedSong) await client.from('songs').delete().eq('id', songId);
  await client.auth.signOut();
}
