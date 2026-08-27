import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAuditReport } from './cos-history-audit.mjs';

const duplicateCoverHash = 'a'.repeat(64);

const fixture = {
  generatedAt: '2026-08-26T00:00:00.000Z',
  songs: [
    {
      id: 'song-normal-m4a',
      audio_path: 'users/user-a/song-normal/audio.m4a?sign=TOP_SECRET_QUERY&token=TOP_SECRET_TOKEN',
      file_size: 4_000_000,
      duration: 200,
      stream_audio_path: null,
      cover_path: 'legacy/covers/normal.jpg?token=TOP_SECRET_TOKEN',
    },
    {
      id: 'song-high-flac',
      audio_path: 'users/user-b/song-high/audio.flac',
      file_size: 4_000_000,
      duration: 100,
      stream_audio_path: null,
      cover_path: 'legacy/covers/duplicate-a.jpg',
    },
    {
      id: 'song-existing-copy',
      audio_path: 'users/user-c/song-existing/audio.m4a',
      file_size: 8_000_000,
      duration: 100,
      stream_audio_path: 'users/user-c/song-existing/stream.mp3',
      stream_file_size: 2_000_000,
      stream_bitrate_kbps: 160,
      cover_path: 'legacy/covers/duplicate-b.jpg',
    },
    {
      id: 'song-missing-cover',
      audio_path: 'users/user-d/song-missing/audio.mp3',
      file_size: 2_000_000,
      duration: 100,
      stream_audio_path: null,
      cover_path: 'legacy/covers/missing.jpg',
    },
  ],
  objects: [
    { key: 'users/user-a/song-normal/audio.m4a', size: 4_000_000, kind: 'audio' },
    { key: 'legacy/covers/normal.jpg', size: 900, kind: 'cover', sha256: 'b'.repeat(64) },
    { key: 'users/user-b/song-high/audio.flac', size: 4_000_000, kind: 'audio' },
    { key: 'legacy/covers/duplicate-a.jpg', size: 1_000, kind: 'cover', sha256: duplicateCoverHash },
    { key: 'users/user-c/song-existing/audio.m4a', size: 8_000_000, kind: 'audio' },
    { key: 'users/user-c/song-existing/stream.mp3', size: 2_000_000, kind: 'stream' },
    { key: 'legacy/covers/duplicate-b.jpg', size: 1_000, kind: 'cover', sha256: duplicateCoverHash },
    { key: 'users/user-d/song-missing/audio.mp3', size: 2_000_000, kind: 'audio' },
  ],
};

const report = buildAuditReport(fixture);
const highBitrateCandidates = report.candidates.filter((candidate) => candidate.kind === 'high-bitrate-audio');
const duplicateCoverCandidates = report.candidates.filter((candidate) => candidate.kind === 'duplicate-cover');
const missingCandidates = report.candidates.filter((candidate) => candidate.kind === 'missing-resource');
const serializedReport = JSON.stringify(report);

assert.equal(report.schemaVersion, 2, '报告必须声明 schemaVersion');
assert.equal(report.mode, 'fixture', 'fixture 输入必须标记 fixture 模式');
assert.equal(report.generatedAt, fixture.generatedAt, 'fixture 提供时间时报告时间必须可复现');
assert.equal(report.summary.songCount, 4, '歌曲数应来自 fixture');
assert.equal(report.summary.originalAudioPathCount, 4, '原音频路径应按歌曲引用统计');
assert.equal(report.summary.existingStreamCopyCount, 1, '已有播放副本应被统计');
assert.equal(report.summary.coverPathCount, 4, '封面路径应按唯一规范化路径统计');
assert.equal(report.summary.estimatedHighBitrateCandidateCount, 1, '只有高码率且没有播放副本的歌曲可进入候选');
assert.equal(report.summary.missingResourceCandidateCount, 1, '缺失封面应形成缺失资源候选');
assert.equal(report.summary.duplicateCoverHashCandidateCount, 1, '同一 SHA-256 的两个封面路径应形成重复候选');
assert.equal(report.summary.duplicateCoverCandidatePathCount, 2, '重复候选应保留两条来源路径');
assert.equal(report.summary.estimatedPlaybackEgressBytesSavedPerFullPlay, 2_000_000, '播放下行节省应单独按完整播放估算');
assert.equal(report.summary.estimatedDuplicateCoverStorageBytesPotentiallyRemovable, 1_000, '重复封面潜在存储节省应单独统计');

assert.deepEqual(highBitrateCandidates.map((candidate) => candidate.songIds), [['song-high-flac']], '高码率候选应稳定关联歌曲');
assert.equal(highBitrateCandidates[0].estimatedPlaybackEgressBytesSavedPerFullPlay, 2_000_000, '高码率候选字段必须明确是每次完整播放下行估算');
assert.ok(!highBitrateCandidates.some((candidate) => candidate.songIds.includes('song-normal-m4a')), '普通 M4A 不得误列为高码率候选');
assert.ok(!highBitrateCandidates.some((candidate) => candidate.songIds.includes('song-existing-copy')), '已有 stream copy 不得重复列入高码率候选');
assert.deepEqual(duplicateCoverCandidates[0].paths, ['legacy/covers/duplicate-a.jpg', 'legacy/covers/duplicate-b.jpg'], '重复封面路径必须稳定排序');
assert.equal(duplicateCoverCandidates[0].estimatedDuplicateCoverStorageBytesPotentiallyRemovable, 1_000, '重复封面候选字段必须明确是潜在可移除存储');
assert.equal(missingCandidates[0].resourceType, 'cover', '缺失候选必须标明资源类型');
assert.ok(report.candidates.every((candidate) => candidate.candidateOnly === true), '所有候选必须明确只是审计候选');

assert.ok(!serializedReport.includes('TOP_SECRET_QUERY'), '报告不得泄露签名查询串');
assert.ok(!serializedReport.includes('TOP_SECRET_TOKEN'), '报告不得泄露 token 查询参数');
assert.ok(!serializedReport.includes('?sign='), '报告不得包含完整签名 URL 查询部分');
assert.ok(!serializedReport.includes('owner_id'), '报告不得复制用户隐私字段');

const reorderedFixture = {
  ...fixture,
  songs: [...fixture.songs].reverse(),
  objects: [...fixture.objects].reverse(),
};
assert.deepEqual(buildAuditReport(reorderedFixture), report, '相同 fixture 仅改变输入顺序时报告必须一致');

const duplicateAudioHash = 'c'.repeat(64);
const extendedFixture = {
  generatedAt: '2026-08-27T00:00:00.000Z',
  songs: [
    {
      id: 'song-a',
      audio_path: 'media/song-a.mp3',
      file_size: 1_000_000,
      duration: 100,
      stream_audio_path: null,
      cover_path: null,
    },
    {
      id: 'song-b',
      audio_path: 'media/song-b.m4a',
      file_size: 1_000_000,
      duration: 100,
      stream_audio_path: 'media/song-b-stream.mp3',
      stream_file_size: 2_000_000,
      stream_bitrate_kbps: 320,
      cover_path: 'media/song-b-cover.jpg',
    },
  ],
  albums: [
    { id: 'album-1', cover_url: 'albums/album-1.jpg?signature=REDACTED' },
  ],
  profiles: [
    {
      id: 'profile-1',
      avatar_url: 'profiles/profile-1/avatar.jpg',
      cover_url: 'profiles/profile-1/background.jpg',
    },
  ],
  objects: [
    { key: 'media/song-a.mp3', size: 1_000_000, kind: 'audio', sha256: duplicateAudioHash },
    { key: 'legacy/song-a-copy.mp3', size: 1_000_000, kind: 'audio', sha256: duplicateAudioHash },
    { key: 'media/song-b.m4a', size: 1_000_000, kind: 'audio', sha256: 'd'.repeat(64) },
    { key: 'media/song-b-stream.mp3', size: 2_000_000, kind: 'stream', sha256: 'e'.repeat(64) },
    { key: 'media/song-b-cover.jpg', size: 10_000, kind: 'cover', sha256: 'f'.repeat(64) },
    { key: 'albums/album-1.jpg', size: 11_000, kind: 'cover', sha256: '1'.repeat(64) },
    { key: 'profiles/profile-1/avatar.jpg', size: 12_000, kind: 'image', sha256: '2'.repeat(64) },
    { key: 'profiles/profile-1/background.jpg', size: 13_000, kind: 'cover', sha256: '3'.repeat(64) },
    { key: 'orphan/unknown.bin', size: 14_000, kind: 'binary' },
  ],
  pagination: {
    songs: { pageSize: 100, pages: [{ page: 0, offset: 0, rowCount: 2, hasMore: false }], totalRows: 2, complete: true },
    albums: { pageSize: 100, pages: [{ page: 0, offset: 0, rowCount: 1, hasMore: false }], totalRows: 1, complete: true },
    profiles: { pageSize: 100, pages: [{ page: 0, offset: 0, rowCount: 1, hasMore: false }], totalRows: 1, complete: true },
    objects: { pageSize: 8, pages: [{ page: 0, offset: 0, rowCount: 8, hasMore: true }], totalRows: 9, complete: false },
  },
};

const extendedReport = buildAuditReport(extendedFixture);
const duplicateAudio = extendedReport.candidates.find((candidate) => candidate.kind === 'duplicate-audio');
const abnormalStream = extendedReport.candidates.find((candidate) => candidate.kind === 'abnormal-stream-copy');

assert.equal(extendedReport.summary.albumCount, 1, 'fixture 应读取 albums 行');
assert.equal(extendedReport.summary.profileCount, 1, 'fixture 应读取 profiles 行');
assert.deepEqual(extendedReport.summary.albumCoverPaths, ['albums/album-1.jpg'], 'album cover_url 应纳入引用');
assert.deepEqual(extendedReport.summary.profileAvatarPaths, ['profiles/profile-1/avatar.jpg'], 'profile avatar_url 应纳入引用');
assert.deepEqual(extendedReport.summary.profileCoverPaths, ['profiles/profile-1/background.jpg'], 'profile cover_url 应纳入引用');
assert.equal(extendedReport.summary.unreferencedObjectCount, 2, '未引用对象应按对象快照输出');
assert.deepEqual(extendedReport.summary.unreferencedObjectPaths, ['legacy/song-a-copy.mp3', 'orphan/unknown.bin']);
assert.deepEqual(extendedReport.unreferencedObjects.map((object) => object.key), extendedReport.summary.unreferencedObjectPaths);
assert.ok(duplicateAudio, '相同音频内容哈希的不同路径应形成重复音频候选');
assert.deepEqual(duplicateAudio.paths, ['legacy/song-a-copy.mp3', 'media/song-a.mp3']);
assert.deepEqual(duplicateAudio.references[1].songIds, ['song-a']);
assert.ok(abnormalStream, '异常 stream 副本应形成候选');
assert.deepEqual(abnormalStream.songIds, ['song-b']);
assert.ok(abnormalStream.reasonCodes.includes('declared-stream-bitrate-out-of-range'));
assert.ok(abnormalStream.reasonCodes.includes('stream-object-not-smaller-than-source'));
assert.equal(extendedReport.streamDiagnostics[0].status, 'abnormal');
assert.equal(extendedReport.summary.abnormalStreamCopyCandidateCount, 1);
assert.equal(extendedReport.snapshotPagination.status, 'incomplete', '任一分页未完成时整体应标记为不完整');
assert.equal(extendedReport.snapshotPagination.tables.songs.complete, true);
assert.equal(extendedReport.snapshotPagination.tables.objects.complete, false);
assert.equal(extendedReport.summary.snapshotPaginationComplete, false);
assert.ok(extendedReport.warnings.some((warning) => warning.includes('objects') && warning.includes('分页')));
assert.ok(
  extendedReport.candidates.every((candidate) => candidate.candidateOnly === true && candidate.migrationReady === false),
  '新增候选也必须保持只读审查语义',
);
assert.ok(extendedReport.candidates.every((candidate) => !('targetPath' in candidate)), '候选不得生成迁移目标 key');

const reorderedExtendedFixture = {
  ...extendedFixture,
  songs: [...extendedFixture.songs].reverse(),
  albums: [...extendedFixture.albums].reverse(),
  profiles: [...extendedFixture.profiles].reverse(),
  objects: [...extendedFixture.objects].reverse(),
};
assert.deepEqual(buildAuditReport(reorderedExtendedFixture), extendedReport, '扩展 fixture 改变输入顺序时报告必须一致');

const profilesSource = await readFile(new URL('../services/supabase/profiles.ts', import.meta.url), 'utf8');
assert.match(profilesSource, /getBlobContentHash/, '头像/背景上传必须使用内容哈希');
assert.match(profilesSource, /uploadFileIfAbsent/, '内容寻址媒体必须使用幂等上传');
assert.match(profilesSource, /\/\$\{bucket\}\/v1\/\$\{contentHash\}/, '头像/背景 key 必须包含类型和内容哈希');
assert.doesNotMatch(profilesSource, /Date\.now\(\).*Math\.random|Math\.random\(\).*Date\.now\(\)/s, '头像/背景 key 不得继续使用时间戳和随机数');

console.log('cos-history-audit.test.mjs: 通过');
