import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [migration, api, player, viewer, manager, store, songs] = await Promise.all([
  fs.readFile(new URL('../supabase/sql/027_song_videos.sql', import.meta.url), 'utf8'),
  fs.readFile(new URL('../services/supabase/songVideos.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../pages/PlayerView.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/SongVideoViewer.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/SongVideoManagerDialog.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../store.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../services/supabase/songs.ts', import.meta.url), 'utf8'),
]);

assert.match(migration, /enable row level security/i);
assert.match(migration, /kind in \('full', 'memory'\)/);
assert.match(api, /createSignedVideoUrl/);
assert.match(api, /deleteFiles\(stalePaths\)/);
assert.match(api, /jzone:song-videos-changed/);
assert.match(player, /jzone-memory-mv-segment/);
assert.match(player, /showMemoryWindow/);
assert.match(viewer, /wasPlayingRef/);
assert.match(viewer, /setPlaybackVolumeMultiplier\(getMemoryAudioMix/);
assert.match(manager, /歌曲录音/);
assert.match(manager, /视频原声/);
assert.doesNotMatch(manager, /预设|人声优先|原声优先/);
assert.match(store, /playbackVolumeMultiplierRef/);
assert.match(songs, /filesToDelete\.push\(\.\.\.videoFiles\)/);

console.log('smoke-song-videos.mjs: 通过');
