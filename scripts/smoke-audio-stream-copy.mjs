import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const sampleRate = 44100;
    const seconds = 1;
    const sampleCount = sampleRate * seconds;
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeText = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.25;
      view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }

    const source = new File([buffer], 'smoke.wav', { type: 'audio/wav' });
    const { transcodeAudioForStreaming } = await import('/utils/audioTranscode.ts');
    const progress = [];
    const output = await transcodeAudioForStreaming(source, 160, (item) => progress.push(item.progress));
    return {
      sourceSize: source.size,
      outputSize: output.size,
      outputName: output.name,
      outputType: output.type,
      lastProgress: progress.at(-1),
    };
  });

  assert.equal(result.outputName, 'smoke.stream.mp3');
  assert.equal(result.outputType, 'audio/mpeg');
  assert.ok(result.outputSize > 0, '播放副本不能为空');
  assert.equal(result.lastProgress, 1, '转码进度必须正常结束');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
