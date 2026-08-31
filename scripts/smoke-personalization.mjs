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
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30_000 });
};

const openPersonalization = async () => {
  await page.getByTestId('bottom-nav-profile').click();
  await page.getByTestId('profile-personalization-entry').waitFor({ state: 'visible' });
  await page.getByTestId('profile-personalization-entry').click();
  await page.getByTestId('personalization-page').waitFor({ state: 'visible' });
};

try {
  await login();
  await openPersonalization();

  await page.getByTestId('player-skin-vinyl').click();
  await page.getByTestId('player-skin-vinyl').waitFor({ state: 'visible' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('player-skin-vinyl').waitFor({ state: 'visible' });
  if (await page.getByTestId('player-skin-vinyl').getAttribute('aria-pressed') !== 'true') {
    throw new Error('播放器外观没有在刷新后保持');
  }
  await page.getByTestId('player-skin-classic').click();

  await page.getByRole('button', { name: '头像框' }).click();
  await page.getByTestId('avatar-frame-cloud_dream_v1').click();
  await page.getByRole('button', { name: '返回个人页' }).click();
  await page.locator('[data-profile-avatar-target="true"] [data-avatar-frame-id="cloud_dream_v1"]').waitFor({ state: 'attached', timeout: 10_000 });

  await page.getByTestId('profile-personalization-entry').click();
  await page.getByRole('button', { name: '头像框' }).click();
  await page.getByTestId('avatar-frame-default').click();
  await page.getByRole('button', { name: '返回个人页' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-profile-avatar-target="true"] [data-avatar-frame-id]'));

  if (pageErrors.length) throw new Error(`页面错误：${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ route: true, skinPersistence: true, avatarFrameSync: true, restoredDefaults: true }, null, 2));
} finally {
  await browser.close();
}
