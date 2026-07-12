import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const consoleErrors = [];
const failedResponses = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
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
    const signedIn = await page.getByTestId('bottom-nav-home')
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (signedIn) return;
  }
  throw new Error(`登录后未进入主界面：${(await page.locator('body').innerText()).slice(0, 300)}`);
};

const transformedSharedElements = async (name) => page.evaluate((sharedName) => (
  [...document.querySelectorAll(`[data-shared-element="${sharedName}"]`)]
    .map((element) => ({
      transform: getComputedStyle(element).transform,
      opacity: getComputedStyle(element).opacity,
      rect: element.getBoundingClientRect().toJSON(),
    }))
), name);

try {
  await login();

  const homeAvatar = page.locator('[data-shared-element="profile-avatar"]').first();
  await homeAvatar.waitFor({ state: 'visible', timeout: 15000 });
  const avatarTransitionName = await homeAvatar.evaluate((element) => getComputedStyle(element).viewTransitionName);
  assert(avatarTransitionName === 'jzone-profile-avatar', `首页头像缺少稳定共享标识：${avatarTransitionName}`);
  await homeAvatar.click();
  await page.waitForTimeout(80);
  const avatarTransition = await page.evaluate(() => ({
    targetCount: document.querySelectorAll('[data-shared-element="profile-avatar"]').length,
    running: document.getAnimations().some((animation) => animation.playState === 'running'),
  }));
  assert(avatarTransition.targetCount > 0, '个人页头像目标没有挂载');
  assert(avatarTransition.running, '首页头像到个人页没有运行共享过渡');

  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  await page.waitForTimeout(500);
  const firstSong = page.locator('[data-library-song="true"]:visible').first();
  const songVisible = await firstSong.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  assert(songVisible, `资料库没有可播放歌曲：${(await page.locator('body').innerText()).slice(0, 500)}`);
  await firstSong.click({ force: true });
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('mini-player').click();
  await page.waitForTimeout(80);
  const playerForward = await transformedSharedElements('song-cover');
  assert(playerForward.length >= 2, `播放器正向过渡缺少源/目标双端：${playerForward.length}`);
  assert(playerForward.some((item) => item.transform !== 'none'), '播放器正向封面没有执行几何插值');

  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(560);
  assert(await page.getByTestId('mini-player').evaluate((element) => document.activeElement === element), '播放器关闭后焦点没有回到 Mini 播放器');

  for (let round = 0; round < 10; round += 1) {
    await page.getByTestId('mini-player').click();
    await page.waitForTimeout(560);
    await page.getByTestId('player-view-close').click();
    await page.waitForTimeout(560);
  }
  const residualPlayerNodes = await page.locator('[data-shared-element="song-cover"]').count();
  assert(residualPlayerNodes === 1, `播放器连续开关后残留共享节点：${residualPlayerNodes}`);

  await page.getByTestId('bottom-nav-profile').evaluate((element) => element.click());
  await page.waitForTimeout(700);
  let collectionChecked = false;
  for (const tab of ['albums', 'playlists']) {
    await page.getByTestId(`profile-subtab-${tab}`).click();
    await page.waitForTimeout(500);
    const cards = page.locator('[data-collection-card="true"]');
    if (await cards.count() === 0) continue;
    const card = cards.first();
    const cardTestId = await card.getAttribute('data-testid');
    const sourceCoverCount = await page.locator('[data-shared-element="collection-cover"]').count();
    await card.click();
    await page.getByTestId('collection-detail-back').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      (count) => document.querySelectorAll('[data-shared-element="collection-cover"]').length > count,
      sourceCoverCount,
      { timeout: 15000 },
    );
    await page.waitForTimeout(35);
    const collectionForward = await transformedSharedElements('collection-cover');
    assert(collectionForward.length >= 2, `集合详情过渡缺少源/目标双端：${collectionForward.length}`);
    assert(
      collectionForward.some((item) => item.transform !== 'none'),
      `集合封面没有执行几何插值：${JSON.stringify(collectionForward)}`,
    );
    await page.getByTestId('collection-detail-back').click();
    await page.waitForTimeout(560);
    if (cardTestId) {
      assert(
        await page.getByTestId(cardTestId).evaluate((element) => document.activeElement === element),
        '集合详情关闭后焦点没有回到来源卡片',
      );
    }
    collectionChecked = true;
    break;
  }

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `共享过渡产生控制台错误：${JSON.stringify(relevantErrors)}`);

  console.log(JSON.stringify({
    ok: true,
    avatarTransition,
    playerForward,
    playerCycles: 10,
    residualPlayerNodes,
    collectionChecked,
    consoleErrors,
    failedResponses,
  }, null, 2));
} finally {
  await browser.close();
}
