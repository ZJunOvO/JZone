import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const viewportWidth = Number(process.env.JZONE_VIEWPORT_WIDTH || 390);
const viewportHeight = Number(process.env.JZONE_VIEWPORT_HEIGHT || 844);

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 2 });
const consoleErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

await page.addInitScript(() => {
  localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const login = async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    if (await page.getByTestId('bottom-nav-home').isVisible().catch(() => false)) return;
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="auth-submit"]');
      return Boolean(button && !button.disabled);
    });
    await page.getByTestId('auth-submit').click();
    if (await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error('登录后未进入主界面');
};

const sampleTransition = async (time, direction, clickSelector = null) => page.evaluate(({ sampleTime, sampleDirection, selector }) => {
  const shell = document.querySelector('[data-testid="player-transition-shell"]');
  const miniGlass = document.querySelector('.liquid-mini-player .liquid-tab-f-glass');
  const miniSettleSurface = document.querySelector('.liquid-mini-player[data-liquid-settle-surface]');
  const miniFilter = miniGlass ? getComputedStyle(miniGlass).backdropFilter : null;
  const base = {
    time: sampleTime,
    direction: sampleDirection,
    miniFilter,
    miniSettleTransform: miniSettleSurface ? getComputedStyle(miniSettleSurface).transform : null,
  };
  if (!shell) return { ...base, exists: false };
  const style = getComputedStyle(shell);
  const clipPath = style.clipPath;
  const insetBody = clipPath.match(/^inset\((.*?)(?:\s+round\s+.*?)?\)$/)?.[1] ?? '';
  const raw = [...insetBody.matchAll(/-?[\d.]+/g)].map((match) => Number(match[0]));
  const insets = raw.length === 1
    ? [raw[0], raw[0], raw[0], raw[0]]
    : raw.length === 2
      ? [raw[0], raw[1], raw[0], raw[1]]
      : raw.length === 3
        ? [raw[0], raw[1], raw[2], raw[1]]
        : raw.slice(0, 4);
  const shared = (name) => [...document.querySelectorAll(`[data-shared-element="${name}"]`)].map((element) => ({
    transform: getComputedStyle(element).transform,
    opacity: Number(getComputedStyle(element).opacity),
    rect: element.getBoundingClientRect().toJSON(),
  }));
  const secondary = document.querySelector('[data-player-transition-part="secondary"]');
  const background = document.querySelector('[data-player-transition-part="background"]');
  const sample = {
    ...base,
    exists: true,
    phase: shell.getAttribute('data-player-transition-phase'),
    miniFilter,
    clipPath,
    insets: { top: insets[0], right: insets[1], bottom: insets[2], left: insets[3] },
    secondaryOpacity: secondary ? Number(getComputedStyle(secondary).opacity) : null,
    backgroundOpacity: background ? Number(getComputedStyle(background).opacity) : null,
    shellBackgroundColor: style.backgroundColor,
    coverSettleTransform: getComputedStyle(document.querySelector('[data-player-shared-settle="cover"]')).transform,
    cover: shared('song-cover'),
    title: shared('song-title'),
    artist: shared('song-artist'),
  };
  if (selector) document.querySelector(selector)?.click();
  return sample;
}, { sampleTime: time, sampleDirection: direction, selector: clickSelector });

const captureTimeline = async (direction, offsets) => {
  const samples = [];
  const startedAt = Date.now();
  for (const offset of offsets) {
    const remaining = offset - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
    const sample = await sampleTransition(offset, direction);
    samples.push(sample);
  }
  return samples;
};

const assertMonotonic = (samples, key, direction) => {
  const values = samples.filter((sample) => sample.exists).map((sample) => sample.insets[key]);
  for (let index = 1; index < values.length; index += 1) {
    const valid = direction === 'decrease'
      ? values[index] <= values[index - 1] + 1.5
      : values[index] + 1.5 >= values[index - 1];
    assert(valid, `${key} 未按 ${direction} 单调变化：${JSON.stringify(values)}`);
  }
};

const assertFrameBudget = (frames, label) => {
  const longFrameRatio = frames.frames > 0 ? frames.over50ms / frames.frames : 1;
  assert(
    frames.frames > 0 && frames.max <= 120.1 && longFrameRatio <= 0.15,
    `${label}存在持续长帧：${JSON.stringify({ ...frames, longFrameRatio })}`,
  );
};

const readMatrixScale = (transform) => {
  if (!transform || transform === 'none') return { x: 1, y: 1 };
  const values = transform.match(/-?[\d.]+/g)?.map(Number) ?? [];
  return values.length >= 4 ? { x: Math.abs(values[0]), y: Math.abs(values[3]) } : { x: 1, y: 1 };
};

const assertSoftSettle = (transforms, label, { minPeak = 1.003, maxPeak = 1.012, finalDelta = 0.002 } = {}) => {
  const scales = transforms.filter(Boolean).map((transform) => readMatrixScale(transform).x);
  const peak = Math.max(...scales);
  const final = scales.at(-1) ?? 1;
  assert(peak >= minPeak, `${label}缺少可感知的惯性越界：${JSON.stringify(scales)}`);
  assert(peak <= maxPeak, `${label}回弹幅度过大：${JSON.stringify(scales)}`);
  assert(Math.abs(final - 1) <= finalDelta, `${label}没有平滑收敛：${JSON.stringify(scales)}`);
};

const startFrameProbe = async (key, duration) => page.evaluate(({ probeKey, probeDuration }) => {
  window.__jzoneFrameProbes ??= {};
  const samples = [];
  let previous = performance.now();
  const started = previous;
  const tick = (now) => {
    samples.push(now - previous);
    previous = now;
    if (now - started < probeDuration) requestAnimationFrame(tick);
    else window.__jzoneFrameProbes[probeKey] = samples;
  };
  requestAnimationFrame(tick);
}, { probeKey: key, probeDuration: duration });

const readFrameProbe = async (key) => page.evaluate((probeKey) => {
  const values = [...(window.__jzoneFrameProbes?.[probeKey] ?? [])].sort((a, b) => a - b);
  if (!values.length) return { frames: 0, p95: 0, max: 0, over50ms: 0 };
  return {
    frames: values.length,
    p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
    max: values.at(-1),
    over50ms: values.filter((value) => value > 50).length,
  };
}, key);

try {
  await mkdir('output/playwright', { recursive: true });
  await login();
  consoleErrors.length = 0;
  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  const songRows = page.locator('[data-library-song="true"]:visible');
  await songRows.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-library-song="true"]')].some((row) => {
    const image = row.querySelector('img');
    return image?.complete && image.naturalWidth > 0;
  }), null, { timeout: 15000 });
  const playableIndex = await songRows.evaluateAll((rows) => rows.findIndex((row) => {
    const image = row.querySelector('img');
    return image?.complete && image.naturalWidth > 0;
  }));
  assert(playableIndex >= 0, '资料库没有封面已解码的测试歌曲');
  await songRows.nth(playableIndex).evaluate((element) => element.click());
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(760);

  await startFrameProbe('opening', 700);
  await page.getByTestId('mini-player').evaluate((element) => element.click());
  await page.getByTestId('player-transition-shell').waitFor({ state: 'attached', timeout: 2000 });
  const opening = await captureTimeline('opening', [20, 80, 160, 280, 560, 620, 760]);
  await page.waitForTimeout(100);
  const openingFrames = await readFrameProbe('opening');
  assert(opening[0].exists && opening[0].insets.top > 100, `播放器没有从 Mini 边界开始：${JSON.stringify(opening[0])}`);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(opening, key, 'decrease');
  const openingFinal = opening.at(-1);
  assert(Object.values(openingFinal.insets).every((value) => value <= 1), `播放器没有铺满视窗：${JSON.stringify(openingFinal.insets)}`);
  assert(opening.every((sample) => sample.miniFilter?.includes('url(')), '展开期间 Mini 播放器材质没有持续保活');
  assertSoftSettle(
    opening.slice(4).map((sample) => sample.coverSettleTransform),
    '全屏封面落地',
  );
  for (const key of ['cover', 'title', 'artist']) {
    assert(opening.slice(0, -1).some((sample) => sample[key].length >= 2), `${key} 缺少共享源/目标双端`);
    assert(
      opening.slice(0, -1).some((sample) => sample[key].some((item) => item.transform !== 'none')),
      `${key} 没有执行共享几何插值：${JSON.stringify(opening.map((sample) => sample[key]))}`,
    );
  }
  assert(
    opening[0].secondaryOpacity < opening[3].secondaryOpacity,
    `控制项没有随容器展开分阶段显现：${opening.map((sample) => sample.secondaryOpacity)}`,
  );

  await page.getByTestId('player-view-close').click();
  const closing = await captureTimeline('closing', [20, 80, 160, 240, 300, 340, 400, 520, 760]);
  const closingShellSamples = closing.filter((sample) => sample.exists);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(closingShellSamples, key, 'increase');
  assert(closingShellSamples.some((sample) => sample.cover.length >= 2), '关闭时封面缺少反向共享双端');
  assert(closing.every((sample) => sample.miniFilter?.includes('url(')), '收拢期间 Mini 播放器折射曾中断');
  const closingHandoff = closingShellSamples.at(-1);
  assert(closingHandoff.shellBackgroundColor === 'rgba(0, 0, 0, 0)', '收拢外壳仍有黑色实底');
  assert(closingHandoff.backgroundOpacity < 0.12, `收拢末段播放器背景没有让出 Mini：${closingHandoff.backgroundOpacity}`);
  const closingTitleTarget = closingHandoff.title.find((item) => item.transform !== 'none');
  const closingTitleScale = readMatrixScale(closingTitleTarget?.transform);
  assert(Math.abs(closingTitleScale.x - closingTitleScale.y) < 0.03, `收拢标题发生非等比压缩：${JSON.stringify(closingTitleScale)}`);
  assert((closingTitleTarget?.opacity ?? 1) < 0.25, `收拢标题没有在交接区淡出：${closingTitleTarget?.opacity}`);
  const miniSettleSamples = closing.filter((sample) => sample.time >= 240);
  const overlappingSettle = miniSettleSamples.find((sample) => sample.exists && readMatrixScale(sample.miniSettleTransform).x > 1.003);
  assert(overlappingSettle, `Mini 整体回弹没有提前叠入收拢末段：${JSON.stringify(miniSettleSamples.map((sample) => ({ time: sample.time, exists: sample.exists, transform: sample.miniSettleTransform })))}`);
  assert(miniSettleSamples.every((sample) => sample.miniFilter?.includes('url(')), 'Mini 整体回弹期间背景折射中断');
  assertSoftSettle(
    miniSettleSamples.map((sample) => sample.miniSettleTransform),
    'Mini 整体落地',
    { minPeak: 1.003, maxPeak: 1.014, finalDelta: 0.002 },
  );
  await page.waitForTimeout(80);
  assert((await page.getByTestId('player-transition-shell').count()) === 0, '关闭完成后全屏播放器仍残留');
  assert(await page.getByTestId('mini-player').evaluate((element) => document.activeElement === element), '关闭后焦点没有回到 Mini 播放器');

  const rapidReversals = [];
  await startFrameProbe('rapid', 2100);
  for (let round = 0; round < 5; round += 1) {
    await page.getByTestId('mini-player').evaluate((element) => element.click());
    await page.waitForTimeout(110);
    const beforeClose = await sampleTransition(round, 'rapid-before-close', '[data-testid="player-view-close"]');
    await page.waitForTimeout(32);
    const afterClose = await sampleTransition(round, 'rapid-after-close');
    assert(
      afterClose.insets.top >= beforeClose.insets.top - 18,
      `快速关闭时裁剪边界向错误方向闪跳：${JSON.stringify({ beforeClose, afterClose })}`,
    );
    await page.waitForTimeout(70);
    const beforeReopen = await sampleTransition(round, 'rapid-before-reopen', '[data-testid="mini-player"]');
    await page.waitForTimeout(32);
    const afterReopen = await sampleTransition(round, 'rapid-after-reopen');
    assert(
      afterReopen.insets.top <= beforeReopen.insets.top + 18,
      `快速重开时裁剪边界向错误方向闪跳：${JSON.stringify({ beforeReopen, afterReopen })}`,
    );
    assert(
      [beforeClose, afterClose, beforeReopen, afterReopen].every((sample) => sample.miniFilter?.includes('url(')),
      `快速反向第 ${round + 1} 轮 Mini 折射中断`,
    );
    rapidReversals.push({ round: round + 1, beforeClose, afterClose, beforeReopen, afterReopen });
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(560);
  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(450);
  assert((await page.getByTestId('player-transition-shell').count()) === 0, '快速反向测试结束后全屏播放器仍残留');
  await page.waitForTimeout(80);
  const sampledRapidFrames = await readFrameProbe('rapid');
  assertFrameBudget(openingFrames, '正常展开');

  await startFrameProbe('rapid-performance', 1800);
  await page.evaluate(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    for (let round = 0; round < 5; round += 1) {
      document.querySelector('[data-testid="mini-player"]')?.click();
      await wait(110);
      document.querySelector('[data-testid="player-view-close"]')?.click();
      await wait(102);
      document.querySelector('[data-testid="mini-player"]')?.click();
      await wait(102);
    }
    await wait(230);
  });
  await page.waitForTimeout(80);
  const rapidFrames = await readFrameProbe('rapid-performance');
  assertFrameBudget(rapidFrames, '快速反向');
  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(450);

  if (process.env.JZONE_CAPTURE_FRAMES === '1') {
    for (const offset of [100, 260, 460]) {
      await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
      await page.waitForTimeout(offset);
      await page.screenshot({ path: `output/playwright/player-curve-${offset}ms.png` });
      await page.waitForTimeout(Math.max(0, 780 - offset));
      await page.getByTestId('player-view-close').click();
      await page.waitForTimeout(560);
    }
    await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
    await page.waitForTimeout(700);
    await page.getByTestId('player-view-close').click();
    let previousOffset = 0;
    for (const offset of [260, 330, 410, 470, 600]) {
      await page.waitForTimeout(offset - previousOffset);
      await page.screenshot({ path: `output/playwright/player-handoff-${offset}ms.png` });
      previousOffset = offset;
    }
  }

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `播放器转场产生控制台错误：${JSON.stringify(relevantErrors)}`);
  const result = { ok: true, viewport: `${viewportWidth}x${viewportHeight}`, opening, closing, rapidReversals, openingFrames, sampledRapidFrames, rapidFrames, consoleErrors };
  console.log(JSON.stringify(process.env.JZONE_COMPACT === '1' ? {
    ok: result.ok,
    viewport: result.viewport,
    openingInsets: opening.map((sample) => ({ time: sample.time, ...sample.insets })),
    openingSecondaryOpacity: opening.map((sample) => ({ time: sample.time, opacity: sample.secondaryOpacity })),
    openingBackgroundOpacity: opening.map((sample) => ({ time: sample.time, opacity: sample.backgroundOpacity })),
    closingInsets: closing.map((sample) => ({ time: sample.time, exists: sample.exists, ...(sample.insets ?? {}) })),
    sharedParts: ['cover', 'title', 'artist'],
    rapidReversalRounds: rapidReversals.length,
    openingFrames,
    sampledRapidFrames,
    rapidFrames,
    consoleErrors,
  } : result, null, 2));
} finally {
  await browser.close();
}
