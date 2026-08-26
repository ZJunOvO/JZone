import assert from 'node:assert/strict';
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

assert.equal(report.schemaVersion, 1, '报告必须声明 schemaVersion');
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

console.log('cos-history-audit.test.mjs: 通过');
