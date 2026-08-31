import { mkdir } from 'node:fs/promises';
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

try {
  await login();
  await page.getByTestId('bottom-nav-profile').click();
  const songTitle = page.getByText('小胡同', { exact: true }).first();
  await songTitle.waitFor({ state: 'visible', timeout: 20_000 });
  await songTitle.locator('xpath=ancestor::button[1]').click();
  await page.getByTestId('profile-personalization-entry').click();
  await page.getByTestId('personalization-page').waitFor({ state: 'visible' });
  if (await page.getByTestId('player-skin-immersive').getAttribute('aria-pressed') !== 'true') {
    await page.getByTestId('player-skin-immersive').click();
    await page.getByText('播放器样式已更新', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  }
  await page.getByRole('button', { name: '返回个人页' }).click();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await page.getByTestId('player-transition-shell').isVisible().catch(() => false)) break;
    await page.getByTestId('mini-player').click();
    await page.waitForTimeout(650);
  }
  const shell = page.getByTestId('player-transition-shell');
  await shell.waitFor({ state: 'visible', timeout: 10_000 });
  if (await page.getByTestId('pwa-install-prompt').isVisible().catch(() => false)) {
    await page.getByTestId('pwa-install-close').click();
  }
  if (await shell.getAttribute('data-player-skin') !== 'immersive') throw new Error('全屏封面皮肤未应用到播放器');
  await page.waitForTimeout(700);
  const geometry = await page.getByTestId('player-cover-button').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      rightGap: window.innerWidth - rect.right,
      width: rect.width,
      height: rect.height,
      borderRadius: getComputedStyle(element).borderRadius,
    };
  });
  if (Math.abs(geometry.left) > 2 || Math.abs(geometry.rightGap) > 2 || geometry.borderRadius !== '0px') {
    throw new Error(`全屏封面仍有边界：${JSON.stringify(geometry)}`);
  }
  if (process.env.JZONE_CAPTURE_DIR) {
    await mkdir(process.env.JZONE_CAPTURE_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.JZONE_CAPTURE_DIR}/immersive-player-mobile.png`, fullPage: false });
  }

  await page.getByTestId('player-view-close').click();
  await page.getByTestId('player-transition-shell').waitFor({ state: 'detached', timeout: 10_000 });
  await page.getByTestId('profile-personalization-entry').click();
  await page.getByTestId('player-skin-classic').click();
  await page.getByText('播放器样式已更新', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ immersiveApplied: true, edgeToEdge: true, geometry, restoredClassic: true }, null, 2));
} finally {
  await browser.close();
}
