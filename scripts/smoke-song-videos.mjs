import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [migration, api, player, viewer, memorySurface, manager, rangeSelector, store, songs, videoMetadata, cosClient, storageApi] = await Promise.all([
  fs.readFile(new URL('../supabase/sql/027_song_videos.sql', import.meta.url), 'utf8'),
  fs.readFile(new URL('../services/supabase/songVideos.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../pages/PlayerView.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/SongVideoViewer.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/MemoryVideoSurface.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/SongVideoManagerDialog.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../components/video/MemoryVideoRangeSelector.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../store.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../services/supabase/songs.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../utils/videoMetadata.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../cosClient.ts', import.meta.url), 'utf8'),
  fs.readFile(new URL('../services/supabase/storageApi.ts', import.meta.url), 'utf8'),
]);

assert.match(migration, /enable row level security/i);
assert.match(migration, /kind in \('full', 'memory'\)/);
assert.match(api, /createSignedVideoUrl/);
assert.match(api, /deleteFiles\(stalePaths\)/);
assert.match(api, /jzone:song-videos-changed/);
assert.match(player, /jzone-memory-mv-segment/);
assert.match(player, /showMemoryWindow/);
assert.match(player, /memoryPreviewSegment\.start - 10/);
assert.match(viewer, /wasPlayingRef/);
assert.match(viewer, /initialVideoUrl/);
assert.match(player, /MemoryVideoSurface/);
assert.match(player, /activeVideo && activeVideo\.row\.kind !== 'memory'/);
assert.match(memorySurface, /memory-video-surface/);
assert.match(memorySurface, /bufferedDuration \/ video\.duration >= 0\.2/);
assert.match(memorySurface, /video\.currentTime >= videoEnd - 0\.04/);
assert.match(memorySurface, /expanded && !mediaReady/);
assert.doesNotMatch(memorySurface, /scale:/);
assert.match(viewer, /setPlaybackVolumeMultiplier\(getMemoryAudioMix/);
assert.match(viewer, /originClipPath/);
assert.match(viewer, /onCanPlay/);
assert.match(viewer, /data-video-phase/);
assert.match(viewer, /memoryEnteredRef/);
assert.match(manager, /歌曲录音/);
assert.match(manager, /视频原声/);
assert.match(manager, /MemoryVideoRangeSelector/);
assert.doesNotMatch(manager, /type="number"/);
assert.match(manager, /backgroundColor: 'rgba\(9, 9, 11, 0\.965\)'/);
assert.match(manager, /当前设备无法预览此视频，但仍可直接上传/);
assert.match(manager, /isSupportedVideoFile/);
assert.doesNotMatch(manager, /当前浏览器无法读取这个视频/);
assert.doesNotMatch(manager, /预设|人声优先|原声优先/);
assert.match(videoMetadata, /mvhd/);
assert.match(videoMetadata, /MP4_SCAN_HEAD_BYTES = 4 \* 1024 \* 1024/);
assert.match(videoMetadata, /MP4_SCAN_TAIL_BYTES = 8 \* 1024 \* 1024/);
assert.match(rangeSelector, /setPointerCapture/);
assert.match(rangeSelector, /选择歌曲中的记忆位置/);
assert.match(rangeSelector, /定位到歌词/);
assert.match(cosClient, /COS_VIDEO_BROWSER_CACHE_MAX_AGE_SECONDS = 180 \* 24 \* 60 \* 60/);
assert.match(storageApi, /VIDEO_SIGNED_URL_TTL_SECONDS/);
assert.match(storageApi, /invalidateSignedVideoUrlCache/);
assert.match(store, /playbackVolumeMultiplierRef/);
assert.match(songs, /filesToDelete\.push\(\.\.\.videoFiles\)/);

console.log('smoke-song-videos.mjs: 通过');
