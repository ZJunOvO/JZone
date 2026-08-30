import assert from 'node:assert/strict';
import { buildMigrationPreview } from './cos-history-migration-preview.mjs';

const preview = buildMigrationPreview({
  readOnly: true,
  generatedAt: '2026-08-30T00:00:00.000Z',
  candidates: [
    {
      kind: 'duplicate-cover',
      canonicalPath: 'shared/covers/v1/a.jpg',
      paths: ['shared/covers/v1/a.jpg', 'legacy/u1/a.jpg'],
      references: [{ path: 'legacy/u1/a.jpg', songIds: ['song-1'] }],
    },
    {
      kind: 'high-bitrate-audio',
      sourcePath: 'u1/song-2/audio.wav',
      songIds: ['song-2'],
      targetBitrateKbps: 160,
      estimatedCopySizeBytes: 4_000_000,
      estimatedPlaybackEgressBytesSavedPerFullPlay: 10_000_000,
    },
  ],
});

assert.equal(preview.readOnly, true);
assert.equal(preview.executable, false);
assert.equal(preview.summary.operationCount, 2);
assert.deepEqual(preview.operations[0].deleteCandidates, ['legacy/u1/a.jpg']);
assert.equal(preview.operations[1].targetBitrateKbps, 160);
console.log('cos-history-migration-preview.test.mjs: 通过');
