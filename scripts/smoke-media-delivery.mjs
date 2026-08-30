import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const delivery = await import('/utils/audioDelivery.ts');
    const shared = await import('/utils/sharedMedia.ts');
    const uploadAudio = await import('/utils/uploadAudio.ts');

    const ordinaryM4a = new File([new Uint8Array(2 * 1024 * 1024)], '普通录音.m4a', { type: 'audio/mp4' });
    const highBitrateWav = new File([new Uint8Array(20 * 1024 * 1024)], '母带.wav', { type: 'audio/wav' });
    const ordinary = delivery.analyzeAudioDelivery(ordinaryM4a, 180);
    const high = delivery.analyzeAudioDelivery(highBitrateWav, 60);

    const firstCover = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    const sameCover = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    const differentCover = new Blob([new Uint8Array([4, 3, 2, 1])], { type: 'image/jpeg' });
    const [firstPath, samePath, differentPath] = await Promise.all([
      shared.createSharedCoverPath(firstCover),
      shared.createSharedCoverPath(sameCover),
      shared.createSharedCoverPath(differentCover),
    ]);

    const cleanup = {
      unsharedOrphan: shared.getCoverCleanupDisposition('users/u1/old-cover.jpg', 0),
      sharedStillReferenced: shared.getCoverCleanupDisposition(firstPath, 2),
      sharedOrphan: shared.getCoverCleanupDisposition(firstPath, 0),
      externalUrl: shared.getCoverCleanupDisposition('https://example.com/cover.jpg', 0),
      invalidCount: shared.getCoverCleanupDisposition('users/u1/old-cover.jpg', Number.NaN),
    };

    const mp4Bytes = new Uint8Array(64);
    mp4Bytes.set([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70], 0);
    mp4Bytes.set([0x6d, 0x76, 0x68, 0x64], 20);
    const secondsSince1904 = Math.floor(Date.UTC(2024, 5, 1) / 1000) + 2_082_844_800;
    mp4Bytes[28] = (secondsSince1904 >>> 24) & 0xff;
    mp4Bytes[29] = (secondsSince1904 >>> 16) & 0xff;
    mp4Bytes[30] = (secondsSince1904 >>> 8) & 0xff;
    mp4Bytes[31] = secondsSince1904 & 0xff;
    const recordedTags = await uploadAudio.readEmbeddedAudioTags(
      new File([mp4Bytes], '现场录音.m4a', { type: 'audio/mp4' }),
    );

    return { ordinary, high, firstPath, samePath, differentPath, cleanup, recordedTags };
  });

  assert.equal(result.ordinary.isHighBitrate, false, '普通 M4A 不应触发播放副本');
  assert.equal(result.ordinary.canCreateStreamCopy, false, '普通 M4A 不应进入浏览器转码');
  assert.equal(result.high.isHighBitrate, true, '高码率 WAV 应触发播放副本');
  assert.equal(result.high.canCreateStreamCopy, true, '安全体积内的高码率 WAV 应允许转码');
  assert.equal(result.firstPath, result.samePath, '相同封面必须复用同一路径');
  assert.notEqual(result.firstPath, result.differentPath, '不同封面不能错误复用');
  assert.match(result.firstPath, /^shared\/covers\/v1\/[a-f0-9]{64}\.jpg$/);
  assert.equal(result.cleanup.unsharedOrphan, 'delete', '无引用的旧非共享封面应允许清理');
  assert.equal(result.cleanup.sharedStillReferenced, 'retain', '仍被复用的共享封面必须保留');
  assert.equal(result.cleanup.sharedOrphan, 'delete', '全局引用为零的共享封面可由安全清理流程回收');
  assert.equal(result.cleanup.externalUrl, 'skip', '外部 URL 不能交给 COS 删除');
  assert.equal(result.cleanup.invalidCount, 'retain', '引用数异常时必须保守保留');
  assert.equal(result.recordedTags.recordedAt, '2024-06-01', 'M4A mvhd 原始录制日期应被解析');

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
