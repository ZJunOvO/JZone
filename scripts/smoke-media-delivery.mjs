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

    return { ordinary, high, firstPath, samePath, differentPath };
  });

  assert.equal(result.ordinary.isHighBitrate, false, '普通 M4A 不应触发播放副本');
  assert.equal(result.ordinary.canCreateStreamCopy, false, '普通 M4A 不应进入浏览器转码');
  assert.equal(result.high.isHighBitrate, true, '高码率 WAV 应触发播放副本');
  assert.equal(result.high.canCreateStreamCopy, true, '安全体积内的高码率 WAV 应允许转码');
  assert.equal(result.firstPath, result.samePath, '相同封面必须复用同一路径');
  assert.notEqual(result.firstPath, result.differentPath, '不同封面不能错误复用');
  assert.match(result.firstPath, /^shared\/covers\/v1\/[a-f0-9]{64}\.jpg$/);

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
