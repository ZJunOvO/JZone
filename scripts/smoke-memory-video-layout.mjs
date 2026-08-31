import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const login = async () => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (await page.getByTestId('bottom-nav-home').isVisible().catch(() => false)) return;
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="auth-submit"]');
    return Boolean(button && !button.disabled);
  });
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30_000 });
};

const rect = (testId) => page.getByTestId(testId).evaluate((element) => {
  const value = element.getBoundingClientRect();
  return { top: value.top, left: value.left, width: value.width, height: value.height };
});

const closeEnough = (a, b, tolerance = 2) => (
  Math.abs(a.top - b.top) <= tolerance
  && Math.abs(a.left - b.left) <= tolerance
  && Math.abs(a.width - b.width) <= tolerance
  && Math.abs(a.height - b.height) <= tolerance
);

try {
  await login();
  await page.getByTestId('bottom-nav-profile').click();
  const songTitle = page.getByText('小胡同', { exact: true }).first();
  await songTitle.waitFor({ state: 'visible', timeout: 20_000 });
  await songTitle.locator('xpath=ancestor::button[1]').click();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await page.getByTestId('player-transition-shell').isVisible().catch(() => false)) break;
    await page.getByTestId('mini-player').click();
    await page.waitForTimeout(650);
  }
  await page.getByTestId('player-transition-shell').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('播放进度').fill('104');
  await page.getByTestId('memory-video-surface').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(600);

  const previewRect = await rect('memory-video-surface');
  const coverRect = await rect('player-cover-button');
  if (!closeEnough(previewRect, coverRect)) {
    throw new Error(`记忆视频预览未贴合封面：${JSON.stringify({ previewRect, coverRect })}`);
  }

  await page.getByRole('button', { name: '打开记忆 MV' }).click();
  await page.getByTestId('memory-video-surface').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-testid="memory-video-surface"]')?.getAttribute('data-expanded') === 'true', null, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="memory-video-surface"]');
    if (!element) return false;
    const value = element.getBoundingClientRect();
    return Math.abs(value.top) <= 3
      && Math.abs(value.left) <= 3
      && Math.abs(value.width - window.innerWidth) <= 3
      && Math.abs(value.height - window.innerHeight) <= 3;
  }, null, { timeout: 5_000 });
  const expandedRect = await rect('memory-video-surface');
  if (!closeEnough(expandedRect, { top: 0, left: 0, width: 390, height: 844 }, 3)) {
    throw new Error(`记忆视频未覆盖视窗：${JSON.stringify(expandedRect)}`);
  }

  await page.getByRole('button', { name: '关闭记忆 MV' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="memory-video-surface"]')?.getAttribute('data-expanded') === 'false', null, { timeout: 10_000 });
  await page.waitForTimeout(520);
  const closedRect = await rect('memory-video-surface');
  const currentCoverRect = await rect('player-cover-button');
  if (!closeEnough(closedRect, currentCoverRect)) {
    throw new Error(`记忆视频关闭后未回到封面：${JSON.stringify({ closedRect, currentCoverRect })}`);
  }

  await page.getByTestId('player-cover-button').click();
  await page.getByTestId('player-lyrics-panel').waitFor({ state: 'visible' });
  await page.waitForTimeout(420);
  const surface = page.getByTestId('memory-video-surface');
  if (await surface.count()) {
    const surfaceOpacity = await surface.evaluate((element) => getComputedStyle(element).opacity);
    if (Number(surfaceOpacity) > 0.02) throw new Error(`歌词视图仍显示记忆视频预览：opacity=${surfaceOpacity}`);
  }

  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ previewAnchored: true, expandedViewport: true, closeAnchored: true, lyricsPreviewHidden: true }, null, 2));
} finally {
  await browser.close();
}
