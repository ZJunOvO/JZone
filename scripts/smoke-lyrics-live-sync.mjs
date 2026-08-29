import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const pageErrors = [];

try {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/index.tsx', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* Live 对轴专项测试只挂载歌词编辑器。 */',
  }));
  await page.route('https://lrclib.net/api/search**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 20260829,
      trackName: '测试原曲',
      artistName: '测试原唱',
      albumName: '测试专辑',
      duration: 185,
      instrumental: false,
      plainLyrics: '第一句\n第二句\n第三句',
      syncedLyrics: '[00:05.00]第一句\n[00:10.00]第二句\n[00:15.00]第三句',
    }]),
  }));

  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  assert.ok(response?.ok(), `本地服务不可用：${baseUrl}`);
  await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });

  await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { LyricsEditor } = await import('/components/lyrics/editor/LyricsEditor.tsx');
    const mount = document.createElement('div');
    document.body.replaceChildren(mount);
    const root = ReactDOMClient.createRoot(mount);
    window.__lyricsLiveSavePayloads = [];
    window.__renderLyricsLiveSmoke = (currentTime = 0, playing = true, duration = 200) => {
      root.render(React.createElement(LyricsEditor, {
        songId: 'live-sync-smoke',
        songTitle: '测试原曲 Live',
        songArtist: '现场演唱者',
        duration,
        currentTime,
        playing,
        onPlay: () => {},
        onPause: () => {},
        onTogglePlay: () => {},
        onSeek: () => {},
        onSave: async (payload) => window.__lyricsLiveSavePayloads.push(payload),
      }));
    };
    window.__renderLyricsLiveSmoke();
  });

  await page.getByTestId('lyrics-editor').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('lyrics-source-online-tab').click();
  await page.getByTestId('lyrics-online-track').fill('测试原曲');
  await page.getByTestId('lyrics-online-artist').fill('测试原唱');
  await page.getByTestId('lyrics-online-submit').click();
  await page.getByTestId('lyrics-online-result-20260829').waitFor({ state: 'visible' });
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/lyrics-online-search-390.png', fullPage: true });
  assert.match(await page.getByTestId('lyrics-online-result-20260829').textContent(), /含 LRC 时间轴/, '搜索结果必须明确标出同步歌词');
  await page.getByTestId('lyrics-online-synced-20260829').click();

  assert.equal(await page.getByTestId('lyrics-editor-sync-tab').getAttribute('aria-selected'), 'true', '导入在线歌词后应直接进入 Live 对轴');
  assert.equal(await page.getByTestId('lyrics-editor').getAttribute('data-lyrics-format'), 'lrc', '同步歌词必须保留 LRC 格式');
  assert.match(await page.getByTestId('lyrics-live-line-0').textContent(), /第一句/, '第一句应成为待打点歌词');

  await page.evaluate(() => window.__renderLyricsLiveSmoke(7, true));
  await page.getByTestId('lyrics-live-align-start').click();
  assert.match(await page.getByTestId('lyrics-live-offset-value').textContent(), /\+2000/, '单锚点应整体平移原始 LRC 时间轴');
  await page.getByTestId('lyrics-live-line-2').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(19, true));
  await page.getByTestId('lyrics-live-align-end').click();
  await page.getByTestId('lyrics-editor-save').click();

  const aligned = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return { format: payload?.format, times: payload?.lines.map((line) => line.startTimeMs) };
  });
  assert.equal(aligned.format, 'lrc', '整体对齐后仍应保存为 LRC');
  assert.deepEqual(aligned.times, [7000, 13000, 19000], '双锚点应按 Live 首尾跨度线性校正整条时间轴');

  await page.getByTestId('lyrics-editor-source-toggle').click();
  await page.getByTestId('lyrics-source-online-tab').click();
  await page.getByTestId('lyrics-online-result-20260829').waitFor({ state: 'visible' });
  await page.getByTestId('lyrics-online-plain-20260829').click();
  assert.equal(await page.getByTestId('lyrics-editor').getAttribute('data-lyrics-format'), 'plain', '纯文本导入必须进入无时间轴状态');

  await page.evaluate(() => window.__renderLyricsLiveSmoke(1.2, true));
  await page.getByTestId('lyrics-live-mark').click();
  assert.match(await page.getByTestId('lyrics-live-line-1').textContent(), /第二句/, '纯文本第一次打点后应连续推进');
  await page.evaluate(() => window.__renderLyricsLiveSmoke(2.8, true));
  await page.getByTestId('lyrics-live-mark').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(4.4, true));
  await page.getByTestId('lyrics-live-mark').click();
  assert.match(await page.getByTestId('lyrics-live-mark').textContent(), /重新标记/, '完成后应允许修正当前歌词');
  assert.match(await page.getByTestId('lyrics-live-offset-value').textContent(), /0/, '完成后应显示整体偏移校正');
  await page.getByTestId('lyrics-editor-save').click();

  const result = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return {
      format: payload?.format,
      times: payload?.lines.map((line) => line.startTimeMs),
      rawContent: payload?.rawContent,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  assert.equal(result.format, 'lrc', 'Live 对轴保存格式应为 LRC');
  assert.deepEqual(result.times, [1200, 2800, 4400], 'Live 对轴应记录新的现场时间而不是在线 LRC 时间');
  assert.ok(!result.rawContent.includes('00:05.00'), '纯文本逐句打点不应混入上一份 LRC 时间轴');
  assert.ok(result.documentWidth <= result.viewportWidth + 1, `手机端出现横向溢出：${JSON.stringify(result)}`);

  await page.getByTestId('lyrics-editor-source-toggle').click();
  await page.getByTestId('lyrics-online-plain-20260829').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(1.2, true));
  await page.getByTestId('lyrics-live-mark').click();
  await page.getByTestId('lyrics-live-finish-here').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(200, false));
  await page.getByTestId('lyrics-editor-save').click();
  const partial = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return {
      allTimes: payload?.lines.map((line) => line.startTimeMs),
      playbackTimes: payload?.parsedLyrics.lines.map((line) => line.startTimeMs),
      range: payload?.normalizedContent.activeRange,
    };
  });
  assert.deepEqual(partial, {
    allTimes: [1200, null, null],
    playbackTimes: [1200],
    range: { startIndex: 0, endIndex: 0 },
  }, '录音提前结束时应移动结束截止线，并保留未演唱歌词供后续编辑');

  await page.getByTestId('lyrics-editor-source-toggle').click();
  await page.getByTestId('lyrics-online-synced-20260829').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(0, false, 12));
  await page.waitForFunction(() => document.querySelector('[data-testid="lyrics-live-line-2"]')?.className.includes('opacity-25'));
  assert.ok(await page.getByTestId('lyrics-live-range-start-boundary').isVisible(), '歌词轨道应显示开始截止线');
  assert.ok(await page.getByTestId('lyrics-live-range-end-boundary').isVisible(), '歌词轨道应显示结束截止线');
  await page.screenshot({ path: 'output/playwright/lyrics-range-track-mobile-390.png', fullPage: true });
  await page.getByTestId('lyrics-editor-preview-tab').click();
  const previewLayout = await page.getByTestId('lyrics-editor-preview').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  assert.ok(previewLayout.width <= previewLayout.viewportWidth, `手机预览宽度错位：${JSON.stringify(previewLayout)}`);
  assert.ok(previewLayout.height >= 280 && previewLayout.height <= 421, `手机预览高度失控：${JSON.stringify(previewLayout)}`);
  assert.ok(previewLayout.documentWidth <= previewLayout.viewportWidth + 1, `预览导致页面横向溢出：${JSON.stringify(previewLayout)}`);
  await page.screenshot({ path: 'output/playwright/lyrics-preview-mobile-390.png', fullPage: true });
  await page.getByTestId('lyrics-editor-save').click();
  const autoTrimmed = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return {
      allTimes: payload?.lines.map((line) => line.startTimeMs),
      playbackTimes: payload?.parsedLyrics.lines.map((line) => line.startTimeMs),
      range: payload?.normalizedContent.activeRange,
      rawContent: payload?.rawContent,
    };
  });
  assert.deepEqual(autoTrimmed.allTimes, [5000, 10000, 15000], '保存必须保留截止线外的完整歌词');
  assert.deepEqual(autoTrimmed.playbackTimes, [5000, 10000], '播放模型只应包含截止线内歌词');
  assert.deepEqual(autoTrimmed.range, { startIndex: 0, endIndex: 1 }, '保存内容必须记录双截止线位置');
  assert.match(autoTrimmed.rawContent, /第三句/, '截止线外歌词必须保存在原始内容中');

  await page.getByTestId('lyrics-editor-sync-tab').click();
  const endBoundary = await page.getByTestId('lyrics-live-range-end-boundary').boundingBox();
  const firstLine = await page.getByTestId('lyrics-live-line-0').boundingBox();
  assert.ok(endBoundary && firstLine, '截止线和歌词行必须可测量');
  await page.mouse.move(endBoundary.x + (endBoundary.width / 2), endBoundary.y + (endBoundary.height / 2));
  await page.mouse.down();
  await page.mouse.move(firstLine.x + (firstLine.width / 2), firstLine.y + (firstLine.height / 2), { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('lyrics-editor-save').click();
  const manuallyTrimmed = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return {
      allTimes: payload?.lines.map((line) => line.startTimeMs),
      playbackTimes: payload?.parsedLyrics.lines.map((line) => line.startTimeMs),
      range: payload?.normalizedContent.activeRange,
    };
  });
  assert.deepEqual(manuallyTrimmed.allTimes, [5000, 10000, 15000], '手动截止后仍不得删除完整歌词');
  assert.deepEqual(manuallyTrimmed.playbackTimes, [5000], '结束截止线应控制播放歌词范围');
  assert.deepEqual(manuallyTrimmed.range, { startIndex: 0, endIndex: 0 }, '拖动结束截止线应写入新范围');

  await page.getByTestId('lyrics-editor-edit-tab').click();
  await page.getByTestId('lyrics-editor-line-insert-after-0').click();
  await page.getByTestId('lyrics-editor-line-input-1').fill('DIY 新增歌词');
  await page.getByTestId('lyrics-editor-save').click();
  const diyRoundTrip = await page.evaluate(async () => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    const { getStoredLyricsModel } = await import('/utils/lyrics/storedLyrics.ts');
    const row = {
      song_id: 'live-sync-smoke',
      format: payload.format,
      source: payload.source,
      raw_content: payload.rawContent,
      normalized_content: payload.normalizedContent,
      offset_ms: payload.offsetMs,
      checksum: 'smoke',
      version: payload.version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const restored = getStoredLyricsModel(row);
    return {
      rawContent: payload.rawContent,
      allTexts: restored.editorLyrics.lines?.map((line) => line.text),
      playbackTexts: restored.playbackLyrics.lines?.map((line) => line.text),
      range: restored.activeRange,
    };
  });
  assert.match(diyRoundTrip.rawContent, /DIY 新增歌词/, 'DIY 歌词必须进入保存原文');
  assert.deepEqual(diyRoundTrip.allTexts, ['第一句', 'DIY 新增歌词', '第二句', '第三句'], '重新打开编辑器必须恢复完整歌词');
  assert.deepEqual(diyRoundTrip.playbackTexts, ['第一句', 'DIY 新增歌词'], '播放器必须只读取截止线内歌词');
  assert.deepEqual(diyRoundTrip.range, { startIndex: 0, endIndex: 1 }, '插入有效范围内歌词后应同步扩展截止线');

  await page.setViewportSize({ width: 360, height: 800 });
  const compactLayout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(compactLayout.width <= compactLayout.viewport + 1, `360px 手机端出现横向溢出：${JSON.stringify(compactLayout)}`);
  assert.deepEqual(pageErrors, [], `页面存在运行错误：${pageErrors.join(' | ')}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/lyrics-live-sync-390.png', fullPage: true });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await browser.close();
}
