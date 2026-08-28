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

const roleLyricsFixture = {
  format: 'ttml',
  timing: 'word',
  rawContent: '<tt>lyrics renderer role smoke</tt>',
  lines: [
    {
      id: 'lead-line',
      text: '左侧主唱',
      startTimeMs: 8_000,
      endTimeMs: 11_500,
      words: [{ text: '左侧主唱', startTimeMs: 8_000, endTimeMs: 11_500 }],
      translatedText: '',
      romanizedText: '',
      isBackground: false,
      isDuet: false,
    },
    {
      id: 'lead-background',
      text: '左侧和声',
      startTimeMs: 8_100,
      endTimeMs: 11_500,
      words: [{ text: '左侧和声', startTimeMs: 8_100, endTimeMs: 11_500 }],
      translatedText: '',
      romanizedText: '',
      isBackground: true,
      isDuet: false,
    },
    {
      id: 'duet-line',
      text: '右侧对唱',
      startTimeMs: 12_000,
      endTimeMs: 15_000,
      words: [{ text: '右侧对唱', startTimeMs: 12_000, endTimeMs: 15_000 }],
      translatedText: '',
      romanizedText: '',
      isBackground: false,
      isDuet: true,
    },
    {
      id: 'duet-background',
      text: '右侧和声',
      startTimeMs: 12_100,
      endTimeMs: 15_000,
      words: [{ text: '右侧和声', startTimeMs: 12_100, endTimeMs: 15_000 }],
      translatedText: '',
      romanizedText: '',
      isBackground: true,
      isDuet: true,
    },
  ],
};

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

  const rendered = await evaluateWithReloadRetry(async ({ fixture, roleLyrics }) => {
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const reactUrl = resources.find((url) => /\/react\.js(?:\?|$)/.test(url));
    const reactDomUrl = resources.find((url) => /\/react-dom_client\.js(?:\?|$)/.test(url));
    if (!reactUrl || !reactDomUrl) return { skipped: true, reason: 'Vite 未暴露 React 运行时资源地址' };

    const ReactModule = await import(reactUrl);
    const ReactDOMClientModule = await import(reactDomUrl);
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { LyricsRenderer } = await import('/components/lyrics/LyricsRenderer.tsx');
    const { toAmllLyricLines } = await import('/utils/lyrics/index.ts');
    const mount = document.createElement('div');
    mount.style.height = '600px';
    document.body.appendChild(mount);
    const seekCalls = [];
    const root = ReactDOMClient.createRoot(mount);
    const convertedRoles = toAmllLyricLines(roleLyrics, 18_000).map((line) => ({
      isBG: line.isBG,
      isDuet: line.isDuet,
      startTime: line.startTime,
    }));

    root.render(React.createElement(LyricsRenderer, {
      lyrics: roleLyrics,
      currentTime: 2,
      duration: 18,
      lowPerformance: true,
      onSeek: (time) => seekCalls.push(time),
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const lightMode = mount.querySelector('[data-testid="lyrics-renderer"]')?.dataset.lyricsRendererMode;
    const lightLead = mount.querySelector('[data-testid="lyrics-line-0"]');
    const lightLeadBackground = mount.querySelector('[data-testid="lyrics-line-1"]');
    const lightDuet = mount.querySelector('[data-testid="lyrics-line-2"]');
    const lightDuetBackground = mount.querySelector('[data-testid="lyrics-line-3"]');
    const introAtTwoSeconds = mount.querySelector('[data-testid="lyrics-intro-dots"]');
    const introAtTwoSecondsOpacity = introAtTwoSeconds ? Number(getComputedStyle(introAtTwoSeconds).opacity) : null;
    const lightLeadFontSize = Number.parseFloat(getComputedStyle(lightLead?.querySelector('span') ?? mount).fontSize);
    const lightBackgroundFontSize = Number.parseFloat(getComputedStyle(lightLeadBackground?.querySelector('span') ?? mount).fontSize);
    lightDuet?.querySelector('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lightUsesWordTiming = mount.querySelector('[data-testid="lyrics-lightweight"]')?.dataset.lyricsTiming === 'word';
    const lightHasNoAmllNodes = !mount.querySelector('.FmKaba_lyricMainLine');
    const lightRoles = [lightLead, lightLeadBackground, lightDuet, lightDuetBackground].map((line) => ({
      role: line?.dataset.lyricsRole,
      direction: line?.dataset.lyricsDirection,
      textAlign: line ? getComputedStyle(line.querySelector('button, div')).textAlign : null,
    }));

    root.render(React.createElement(LyricsRenderer, {
      lyrics: roleLyrics,
      currentTime: 7.65,
      duration: 18,
      lowPerformance: true,
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const endingDots = mount.querySelector('[data-testid="lyrics-intro-dots"]');
    const introNearFirstLine = endingDots ? {
      state: endingDots.dataset.introState,
      opacity: Number(getComputedStyle(endingDots).opacity),
      firstLineTimeMs: Number(endingDots.dataset.firstLineTimeMs),
      currentTimeMs: Number(endingDots.dataset.currentTimeMs),
    } : null;

    root.render(React.createElement(LyricsRenderer, {
      lyrics: roleLyrics,
      currentTime: 8,
      duration: 18,
      lowPerformance: true,
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const introAtFirstLine = Boolean(mount.querySelector('[data-testid="lyrics-intro-dots"]'));

    root.render(React.createElement(LyricsRenderer, {
      lyrics: roleLyrics,
      currentTime: 2,
      duration: 18,
      onSeek: (time) => seekCalls.push(time),
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 400));
    const amllMode = mount.querySelector('[data-testid="lyrics-renderer"]')?.dataset.lyricsRendererMode;
    const amllElementPresent = Boolean(mount.querySelector('.amll-lyric-player'));
    const lightModeStillAvailable = Boolean(mount.querySelector('[data-testid="lyrics-lightweight"]'));
    const amllDuetLines = [...mount.querySelectorAll('.FmKaba_lyricDuetLine')];
    const amllBackgroundLines = [...mount.querySelectorAll('.FmKaba_lyricBgLine')];
    const amllBuiltInDots = mount.querySelector('.FmKaba_interludeDots');
    const amllSemanticState = {
      duetCount: amllDuetLines.length,
      backgroundCount: amllBackgroundLines.length,
      duetLines: amllDuetLines.map((line) => ({ className: line.className, text: line.textContent?.trim() ?? '' })),
      backgroundLines: amllBackgroundLines.map((line) => ({ className: line.className, text: line.textContent?.trim() ?? '' })),
      duetTextAlign: amllDuetLines[0] ? getComputedStyle(amllDuetLines[0]).textAlign : null,
      backgroundFontSize: amllBackgroundLines[0] ? Number.parseFloat(getComputedStyle(amllBackgroundLines[0]).fontSize) : null,
      leadFontSize: mount.querySelector('.FmKaba_lyricLine:not(.FmKaba_lyricBgLine)')
        ? Number.parseFloat(getComputedStyle(mount.querySelector('.FmKaba_lyricLine:not(.FmKaba_lyricBgLine)')).fontSize)
        : null,
      builtInDotsDisplay: amllBuiltInDots ? getComputedStyle(amllBuiltInDots).display : null,
      customIntroVisible: Boolean(mount.querySelector('[data-testid="lyrics-intro-dots"]')),
    };

    root.unmount();
    const unmountedChildCount = mount.childElementCount;
    mount.remove();

    return {
      skipped: false,
      lightMode,
      lightUsesWordTiming,
      lightHasNoAmllNodes,
      lightRoles,
      lightLeadFontSize,
      lightBackgroundFontSize,
      introAtTwoSecondsOpacity,
      introNearFirstLine,
      introAtFirstLine,
      amllMode,
      amllElementPresent,
      lightModeStillAvailable,
      amllSemanticState,
      convertedRoles,
      seekCalls,
      unmountedChildCount,
    };
  }, { fixture: ttmlFixture, roleLyrics: roleLyricsFixture });

  if (!rendered.skipped) {
    assert.equal(rendered.lightMode, 'lightweight');
    assert.equal(rendered.lightUsesWordTiming, true, '轻量降级渲染必须保持原歌词时间模型');
    assert.equal(rendered.lightHasNoAmllNodes, true, '轻量降级渲染不能挂载 AMLL 逐字节点');
    assert.equal(rendered.seekCalls[0], 12, '点击右侧对唱行必须按行起始时间跳转');
    assert.deepEqual(rendered.lightRoles, [
      { role: 'lead', direction: 'left', textAlign: 'left' },
      { role: 'background', direction: 'left', textAlign: 'left' },
      { role: 'duet', direction: 'right', textAlign: 'right' },
      { role: 'background', direction: 'right', textAlign: 'right' },
    ]);
    assert(rendered.lightLeadFontSize > rendered.lightBackgroundFontSize, '轻量模式和声字号必须小于主唱');
    assert.equal(rendered.introAtTwoSecondsOpacity, 1, '前奏早段三点必须保持可见');
    assert.deepEqual(rendered.introNearFirstLine, {
      state: 'ending',
      opacity: 0.5,
      firstLineTimeMs: 8_000,
      currentTimeMs: 7_650,
    }, '前奏三点必须仅按当前时间与第一句时间进入收尾');
    assert.equal(rendered.introAtFirstLine, false, '到达第一句有效时间时前奏三点必须结束');
    assert.equal(rendered.amllMode, 'amll');
    assert.equal(rendered.amllElementPresent, true, '正常能力下必须挂载 AMLL 歌词元素');
    assert.equal(rendered.lightModeStillAvailable, false);
    assert.deepEqual(rendered.convertedRoles, [
      { isBG: false, isDuet: false, startTime: 8_000 },
      { isBG: true, isDuet: false, startTime: 8_100 },
      { isBG: false, isDuet: true, startTime: 12_000 },
      { isBG: true, isDuet: true, startTime: 12_100 },
    ], 'AMLL 输入必须完整保留主唱、对唱与和声语义');
    assert(rendered.amllSemanticState.duetCount >= 1, `AMLL 必须保留对唱方向语义：${JSON.stringify(rendered.amllSemanticState)}`);
    assert(rendered.amllSemanticState.backgroundCount >= 1, `AMLL 必须保留和声层级语义：${JSON.stringify(rendered.amllSemanticState)}`);
    assert.equal(rendered.amllSemanticState.duetTextAlign, 'right');
    assert(rendered.amllSemanticState.leadFontSize > rendered.amllSemanticState.backgroundFontSize, 'AMLL 和声字号必须小于主唱');
    assert.equal(rendered.amllSemanticState.builtInDotsDisplay, 'none', '必须隐藏 AMLL 自带的非严格间奏提示');
    assert.equal(rendered.amllSemanticState.customIntroVisible, true, 'AMLL 路径必须复用严格时序的前奏三点');
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
