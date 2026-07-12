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

const sampleTransition = async (time, direction) => page.evaluate(({ sampleTime, sampleDirection }) => {
  const shell = document.querySelector('[data-testid="player-transition-shell"]');
  if (!shell) return { time: sampleTime, direction: sampleDirection, exists: false };
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
  return {
    time: sampleTime,
    direction: sampleDirection,
    exists: true,
    phase: shell.getAttribute('data-player-transition-phase'),
    clipPath,
    insets: { top: insets[0], right: insets[1], bottom: insets[2], left: insets[3] },
    secondaryOpacity: secondary ? Number(getComputedStyle(secondary).opacity) : null,
    backgroundOpacity: background ? Number(getComputedStyle(background).opacity) : null,
    cover: shared('song-cover'),
    title: shared('song-title'),
    artist: shared('song-artist'),
  };
}, { sampleTime: time, sampleDirection: direction });

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

  await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
  const opening = await captureTimeline('opening', [20, 100, 220, 380, 780]);
  assert(opening[0].exists && opening[0].insets.top > 100, `播放器没有从 Mini 边界开始：${JSON.stringify(opening[0])}`);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(opening, key, 'decrease');
  const openingFinal = opening.at(-1);
  assert(Object.values(openingFinal.insets).every((value) => value <= 1), `播放器没有铺满视窗：${JSON.stringify(openingFinal.insets)}`);
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
  const closing = await captureTimeline('closing', [20, 120, 260, 500]);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(closing.slice(0, -1), key, 'increase');
  assert(closing.slice(0, -1).some((sample) => sample.cover.length >= 2), '关闭时封面缺少反向共享双端');
  await page.waitForTimeout(80);
  assert((await page.getByTestId('player-transition-shell').count()) === 0, '关闭完成后全屏播放器仍残留');
  assert(await page.getByTestId('mini-player').evaluate((element) => document.activeElement === element), '关闭后焦点没有回到 Mini 播放器');

  if (process.env.JZONE_CAPTURE_FRAMES === '1') {
    for (const offset of [100, 260, 460]) {
      await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
      await page.waitForTimeout(offset);
      await page.screenshot({ path: `output/playwright/player-curve-${offset}ms.png` });
      await page.waitForTimeout(Math.max(0, 780 - offset));
      await page.getByTestId('player-view-close').click();
      await page.waitForTimeout(560);
    }
  }

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `播放器转场产生控制台错误：${JSON.stringify(relevantErrors)}`);
  const result = { ok: true, viewport: `${viewportWidth}x${viewportHeight}`, opening, closing, consoleErrors };
  console.log(JSON.stringify(process.env.JZONE_COMPACT === '1' ? {
    ok: result.ok,
    viewport: result.viewport,
    openingInsets: opening.map((sample) => ({ time: sample.time, ...sample.insets })),
    closingInsets: closing.map((sample) => ({ time: sample.time, exists: sample.exists, ...(sample.insets ?? {}) })),
    sharedParts: ['cover', 'title', 'artist'],
    consoleErrors,
  } : result, null, 2));
} finally {
  await browser.close();
}
