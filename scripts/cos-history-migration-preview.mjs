import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const buildMigrationPreview = (report) => {
  if (!report || report.readOnly !== true || !Array.isArray(report.candidates)) {
    throw new Error('输入不是有效的 COS 只读审计报告');
  }

  const operations = report.candidates.flatMap((candidate) => {
    if (candidate.kind === 'duplicate-cover' && candidate.canonicalPath && Array.isArray(candidate.paths)) {
      const duplicatePaths = candidate.paths.filter((path) => path !== candidate.canonicalPath);
      return [{
        kind: 'repoint-duplicate-cover',
        canonicalPath: candidate.canonicalPath,
        sourcePaths: duplicatePaths,
        referenceUpdates: (candidate.references ?? []).filter((item) => duplicatePaths.includes(item.path)),
        deleteCandidates: duplicatePaths,
        preconditions: ['逐条更新数据库引用成功', '删除前再次确认全局引用数为 0'],
      }];
    }
    if (candidate.kind === 'high-bitrate-audio') {
      return [{
        kind: 'create-stream-copy',
        songIds: candidate.songIds ?? [],
        sourcePath: candidate.sourcePath,
        targetBitrateKbps: candidate.targetBitrateKbps,
        estimatedCopySizeBytes: candidate.estimatedCopySizeBytes,
        estimatedPlaybackEgressBytesSavedPerFullPlay: candidate.estimatedPlaybackEgressBytesSavedPerFullPlay,
        preconditions: ['原始音频保持不变', '副本校验可播放且至少节省 10% 后才写入歌曲记录'],
      }];
    }
    return [];
  });

  return {
    schemaVersion: 'jzone-cos-migration-preview-v1',
    generatedAt: new Date().toISOString(),
    sourceReportGeneratedAt: report.generatedAt ?? null,
    readOnly: true,
    executable: false,
    warning: '这是迁移预览，不会访问、修改或删除任何远端对象。',
    summary: {
      operationCount: operations.length,
      duplicateCoverOperationCount: operations.filter((item) => item.kind === 'repoint-duplicate-cover').length,
      streamCopyOperationCount: operations.filter((item) => item.kind === 'create-stream-copy').length,
    },
    operations,
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const outputIndex = args.indexOf('--output');
  const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (!reportPath || !outputPath) {
    throw new Error('用法：node scripts/cos-history-migration-preview.mjs --report <审计报告.json> --output <迁移预览.json>');
  }
  const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
  const preview = buildMigrationPreview(report);
  await writeFile(resolve(outputPath), `${JSON.stringify(preview, null, 2)}\n`, 'utf8');
  console.log('只读迁移预览已生成；未访问或修改远端资源');
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '迁移预览生成失败');
    process.exitCode = 1;
  });
}
