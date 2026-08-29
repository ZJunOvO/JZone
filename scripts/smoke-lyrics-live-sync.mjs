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
    window.__renderLyricsLiveSmoke = (currentTime = 0, playing = true) => {
      root.render(React.createElement(LyricsEditor, {
        songId: 'live-sync-smoke',
        songTitle: '测试原曲 Live',
        songArtist: '现场演唱者',
        duration: 200,
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
  assert.match(await page.getByTestId('lyrics-live-current-line').textContent(), /第一句/, '第一句应成为待打点歌词');

  await page.evaluate(() => window.__renderLyricsLiveSmoke(7, true));
  await page.getByTestId('lyrics-live-align-start').click();
  assert.match(await page.getByTestId('lyrics-live-offset-value').textContent(), /\+2000/, '单锚点应整体平移原始 LRC 时间轴');
  await page.getByTestId('lyrics-live-line-list-toggle').click();
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
  assert.match(await page.getByTestId('lyrics-live-current-line').textContent(), /第二句/, '纯文本第一次打点后应连续推进');
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
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('lyrics-live-finish-here').click();
  await page.evaluate(() => window.__renderLyricsLiveSmoke(200, false));
  await page.getByTestId('lyrics-editor-save').click();
  const partial = await page.evaluate(() => {
    const payload = window.__lyricsLiveSavePayloads.at(-1);
    return { times: payload?.lines.map((line) => line.startTimeMs), lineCount: payload?.lines.length };
  });
  assert.deepEqual(partial, { times: [1200], lineCount: 1 }, '录音提前结束时只能显式截断，播放结束不得清空已打时间');

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
