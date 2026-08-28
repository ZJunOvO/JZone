import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));

const evaluateWithReloadRetry = async (evaluate, argument) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(evaluate, argument);
    } catch (error) {
      lastError = error;
      if (!/execution context was destroyed|navigation/i.test(String(error))) throw error;
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
};

const ttmlFixture = [
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal">',
  '<body><div><p begin="00:00.000" end="00:02.000" itunes:key="L1">',
  '<span begin="00:00.000" end="00:01.000">你</span>',
  '<span begin="00:01.000" end="00:02.000">好</span>',
  '</p></div></body></tt>',
].join('');

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });

  const parsed = await evaluateWithReloadRetry(async (fixture) => {
    const lyrics = await import('/utils/lyrics/index.ts');
    const plain = lyrics.parseLyrics({ format: 'plain', content: '第一行\n第二行' });
    const lrc = lyrics.parseLyrics({
      format: 'lrc',
      content: '[00:01.00]第一行\n[00:03.50]第二行',
    });
    const ttml = lyrics.parseLyrics({ format: 'ttml', content: fixture });
    let malformedError = false;
    try {
      lyrics.parseLyrics({ format: 'ttml', content: '<tt>' });
    } catch (error) {
      malformedError = error instanceof Error && error.name === 'LyricsParseError';
    }

    return {
      plain: {
        format: plain.format,
        timing: plain.timing,
        lineCount: plain.lines.length,
      },
      lrc: {
        timing: lrc.timing,
        lineCount: lrc.lines.length,
        wordCount: lrc.lines.reduce((count, line) => count + line.words.length, 0),
        firstStart: lrc.lines[0]?.startTimeMs,
        secondStart: lrc.lines[1]?.startTimeMs,
        amllWordCount: lyrics.toAmllLyricLines(lrc, 5_000)[0]?.words.length,
      },
      ttml: {
        timing: ttml.timing,
        lineCount: ttml.lines.length,
        wordCount: ttml.lines[0]?.words.length,
        amllWordCount: lyrics.toAmllLyricLines(ttml)[0]?.words.length,
      },
      malformedError,
    };
  }, ttmlFixture);

  assert.deepEqual(parsed.plain, { format: 'plain', timing: 'none', lineCount: 2 });
  assert.deepEqual(parsed.lrc, {
    timing: 'line',
    lineCount: 2,
    wordCount: 0,
    firstStart: 1_000,
    secondStart: 3_500,
    amllWordCount: 1,
  });
  assert.deepEqual(parsed.ttml, {
    timing: 'word',
    lineCount: 1,
    wordCount: 2,
    amllWordCount: 2,
  });
  assert.equal(parsed.malformedError, true, '非法 TTML 必须返回统一解析错误');

  const rendered = await evaluateWithReloadRetry(async (fixture) => {
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const reactUrl = resources.find((url) => /\/react\.js(?:\?|$)/.test(url));
    const reactDomUrl = resources.find((url) => /\/react-dom_client\.js(?:\?|$)/.test(url));
    if (!reactUrl || !reactDomUrl) return { skipped: true, reason: 'Vite 未暴露 React 运行时资源地址' };

    const ReactModule = await import(reactUrl);
    const ReactDOMClientModule = await import(reactDomUrl);
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { LyricsRenderer } = await import('/components/lyrics/LyricsRenderer.tsx');
    const mount = document.createElement('div');
    mount.style.height = '520px';
    document.body.appendChild(mount);
    const seekCalls = [];
    const root = ReactDOMClient.createRoot(mount);

    root.render(React.createElement(LyricsRenderer, {
      lyrics: { format: 'lrc', content: '[00:01.00]第一行\n[00:03.50]第二行' },
      currentTime: 2,
      duration: 5,
      lowPerformance: true,
      onSeek: (time) => seekCalls.push(time),
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const lightMode = mount.querySelector('[data-testid="lyrics-renderer"]')?.dataset.lyricsRendererMode;
    const lightLine = mount.querySelector('[data-testid="lyrics-line-1"] button');
    lightLine?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lightUsesLineTiming = mount.querySelector('[data-testid="lyrics-lightweight"]')?.dataset.lyricsTiming === 'line';
    const lightHasNoAmllNodes = !mount.querySelector('.FmKaba_lyricMainLine');

    root.render(React.createElement(LyricsRenderer, {
      lyrics: { format: 'ttml', content: fixture },
      currentTime: 0.5,
      duration: 5,
      onSeek: (time) => seekCalls.push(time),
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const amllMode = mount.querySelector('[data-testid="lyrics-renderer"]')?.dataset.lyricsRendererMode;
    const amllElementPresent = Boolean(mount.querySelector('.amll-lyric-player'));
    const lightModeStillAvailable = Boolean(mount.querySelector('[data-testid="lyrics-lightweight"]'));

    root.unmount();
    const unmountedChildCount = mount.childElementCount;
    mount.remove();

    return {
      skipped: false,
      lightMode,
      lightUsesLineTiming,
      lightHasNoAmllNodes,
      amllMode,
      amllElementPresent,
      lightModeStillAvailable,
      seekCalls,
      unmountedChildCount,
    };
  }, ttmlFixture);

  if (!rendered.skipped) {
    assert.equal(rendered.lightMode, 'lightweight');
    assert.equal(rendered.lightUsesLineTiming, true, 'LRC 降级渲染必须保持行级时间模型');
    assert.equal(rendered.lightHasNoAmllNodes, true, '轻量降级渲染不能挂载 AMLL 逐字节点');
    assert.equal(rendered.seekCalls[0], 3.5, '点击 LRC 行必须按行起始时间跳转');
    assert.equal(rendered.amllMode, 'amll');
    assert.equal(rendered.amllElementPresent, true, '正常能力下必须挂载 AMLL 歌词元素');
    assert.equal(rendered.lightModeStillAvailable, false);
    assert.equal(rendered.unmountedChildCount, 0, '卸载后歌词根元素必须清空');
  }

  console.log(JSON.stringify({
    baseUrl,
    parsed,
    rendered,
    pageErrors,
  }, null, 2));
} finally {
  await browser.close();
}
