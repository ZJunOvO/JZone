import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const chromePath = process.env.JZONE_CHROME_PATH || undefined;
const headless = process.env.JZONE_HEADFUL !== '1';

const launchOptions = chromePath ? { headless, executablePath: chromePath } : { headless };

const waitForEitherText = async (page, patterns, timeout = 20000) => {
  await page.waitForFunction(
    (sources) => {
      const text = document.body?.innerText || '';
      return sources.some((source) => new RegExp(source, 'i').test(text));
    },
    patterns.map((pattern) => pattern.source),
    { timeout },
  );
};

const isSignedIn = async (page) => {
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /现在就听|精选推荐|最近播放|资料库|上传音乐|创作/.test(body);
};

const loginIfNeeded = async (page) => {
  if (await isSignedIn(page)) return;
  if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

  await waitForEitherText(page, [/邮箱/, /登录/]);
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="auth-submit"]');
    return Boolean(button && !button.disabled);
  });
  await page.getByTestId('auth-submit').click();
  await page.getByText('现在就听').first().waitFor({ timeout: 30000 });
};

const openFirstAvailableCollection = async (page) => {
  for (const tabId of ['albums', 'playlists']) {
    await page.getByTestId(`profile-subtab-${tabId}`).click();
    await page.waitForTimeout(600);
    const cards = page.locator('[data-collection-card="true"]');
    const count = await cards.count();
    if (count > 0) {
      await cards.first().click();
      return tabId;
    }
  }
  return null;
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
});
const consoleErrors = [];
const failedResponses = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

page.on('response', (response) => {
  if (response.status() >= 400) {
    failedResponses.push({
      status: response.status(),
      url: response.url(),
    });
  }
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await page.getByTestId('bottom-nav-profile').click();
  await waitForEitherText(page, [/创作/, /收藏/, /收录/], 15000);

  const openedFrom = await openFirstAvailableCollection(page);
  if (!openedFrom) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: '当前账号没有可打开的专辑或歌单',
          consoleErrors,
          failedResponses,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  await page.getByTestId('collection-detail-back').waitFor({ timeout: 15000 });
  await waitForEitherText(page, [/播放全部/, /还没有歌曲/, /添加歌曲/], 15000);
  await page.getByTestId('collection-detail-back').click();
  await waitForEitherText(page, [/创作/, /收藏/, /收录/], 15000);

  console.log(
    JSON.stringify(
      {
        ok: true,
        skipped: false,
        openedFrom,
        checked: ['profile-collection-list', 'collection-detail', 'collection-back'],
        consoleErrors,
        failedResponses,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
