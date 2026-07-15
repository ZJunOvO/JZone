import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await page.route(/https:\/\/(?:fastly\.)?picsum\.photos\/.*/, (route) => route.abort('failed'));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (!(await page.getByTestId('bottom-nav-home').isVisible().catch(() => false))) {
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.getByTestId('auth-submit').click();
    await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30_000 });
  }

  const fallbackSong = page.getByRole('button', { name: /播放 公园/ });
  await fallbackSong.waitFor({ state: 'visible', timeout: 15_000 });
  await fallbackSong.click();
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByTestId('mini-player').click();
  await page.getByTestId('player-transition-shell').waitFor({ state: 'visible', timeout: 5_000 });

  const background = page.locator('img[alt="immersive background"]');
  await background.waitFor({ state: 'attached', timeout: 5_000 });
  await page.waitForTimeout(300);
  const result = await background.evaluate((image) => ({
    src: image.getAttribute('src'),
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));

  assert(!result.src?.includes('picsum.photos'), `播放背景仍依赖 Picsum：${result.src}`);
  assert(result.naturalWidth > 0 && result.naturalHeight > 0, `播放背景没有可渲染资源：${JSON.stringify(result)}`);
  assert(result.naturalWidth === result.naturalHeight, `本地封面不是方形资源：${JSON.stringify(result)}`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
