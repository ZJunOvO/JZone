import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

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

const openPersonalization = async () => {
  await page.getByTestId('bottom-nav-profile').click();
  if (!await page.getByTestId('mini-player').isVisible().catch(() => false)) {
    const songTitle = page.getByText('小胡同', { exact: true }).first();
    await songTitle.waitFor({ state: 'visible', timeout: 20_000 });
    await songTitle.locator('xpath=ancestor::button[1]').click();
    await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 10_000 });
  }
  await page.getByTestId('profile-personalization-entry').waitFor({ state: 'visible' });
  await page.getByTestId('profile-personalization-entry').click();
  await page.getByTestId('personalization-page').waitFor({ state: 'visible' });
};

try {
  await login();
  await openPersonalization();

  const miniLayout = await page.getByTestId('mini-player').getAttribute('data-layout-mode');
  if (miniLayout !== 'wide') throw new Error(`个性空间未使用宽屏 mini 播放器：${miniLayout}`);
  if (process.env.JZONE_CAPTURE_DIR) {
    await mkdir(process.env.JZONE_CAPTURE_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.JZONE_CAPTURE_DIR}/personalization-mobile.png`, fullPage: false });
  }

  await page.getByRole('button', { name: '成就', exact: true }).click();
  await page.getByTestId('achievement-test-trigger').click();
  await page.getByTestId('achievement-celebration').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭成就演出' }).click();
  await page.getByTestId('achievement-celebration').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '播放器', exact: true }).click();

  if (await page.getByTestId('player-skin-vinyl').getAttribute('aria-pressed') !== 'true') {
    await page.getByTestId('player-skin-vinyl').click();
    await page.getByText('播放器样式已更新', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('player-skin-vinyl').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-testid="player-skin-vinyl"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 10_000 });

  const skinColumns = await page.getByTestId('player-skin-vinyl').evaluate((element) => {
    const grid = element.parentElement;
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  });
  if (skinColumns < 2) throw new Error(`手机端播放器外观不是至少两列：${skinColumns}`);

  await page.getByTestId('player-skin-classic').click();
  await page.getByText('播放器样式已更新', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

  await page.getByRole('button', { name: '头像框' }).click();
  await page.getByTestId('avatar-frame-cloud_dream_v1').click();
  await page.getByText('头像框已佩戴', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: '返回个人页' }).click();
  await page.locator('[data-profile-avatar-target="true"] [data-avatar-frame-id="cloud_dream_v1"]').waitFor({ state: 'attached', timeout: 10_000 });

  await page.getByTestId('profile-personalization-entry').click();
  await page.getByRole('button', { name: '头像框' }).click();
  await page.getByTestId('avatar-frame-default').click();
  await page.getByText('已恢复默认头像', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: '返回个人页' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-profile-avatar-target="true"] [data-avatar-frame-id]'));

  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ route: true, skinPersistence: true, skinColumns, wideMiniPlayer: true, achievementCelebration: true, avatarFrameSync: true, restoredDefaults: true }, null, 2));
} finally {
  await browser.close();
}
