import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const chromePath = process.env.JZONE_CHROME_PATH || undefined;
const headless = process.env.JZONE_HEADFUL !== '1';
const listeningRecapUrl = new URL('/listening-recap', baseUrl).toString();
const viewports = [
  { width: 390, height: 844, screenshot: 'output/playwright/listening-recap-390.png' },
  { width: 360, height: 800, screenshot: 'output/playwright/listening-recap-360.png' },
];
const bottomNavigationSelector = '[data-testid="bottom-nav-layer"]';

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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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

const readLayout = (page) => page.evaluate((selector) => {
  const nodes = [
    ['document', document.documentElement],
    ['body', document.body],
    ['app-shell', document.querySelector('.jzone-app-shell')],
    ['scroll-shell', document.querySelector('.jzone-glass-source')],
    ['listening-recap', document.querySelector('[data-testid="listening-recap-page"]')],
  ];
  const widths = nodes
    .filter(([, element]) => element)
    .map(([name, element]) => ({
      name,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflow: element.scrollWidth - element.clientWidth,
    }));

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    widths,
    mini: document.querySelectorAll('[data-testid="mini-player-layer"]').length,
    bottomNav: document.querySelectorAll(selector).length,
  };
}, bottomNavigationSelector);

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: viewports[0] });
const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
const results = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

page.on('pageerror', (error) => {
  pageErrors.push(error.stack || error.message);
});

page.on('response', (response) => {
  if (response.status() >= 400) {
    failedResponses.push({ status: response.status(), url: response.url() });
  }
});

await page.addInitScript(() => {
  localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
});

try {
  await mkdir('output/playwright', { recursive: true });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  for (const [index, viewport] of viewports.entries()) {
    if (index > 0) await page.setViewportSize(viewport);

    consoleErrors.length = 0;
    pageErrors.length = 0;
    await page.goto(listeningRecapUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('listening-recap-page').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => (
      !document.querySelector('[data-testid="listening-recap-loading"]')
      || Boolean(document.querySelector('[data-testid="listening-recap-error"]'))
    ), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const layout = await readLayout(page);
    assert(
      layout.widths.every(({ overflow }) => overflow <= 0),
      `聆听回顾页面存在横向溢出：${JSON.stringify(layout)}`,
    );
    assert(layout.mini === 1, `聆听回顾页面 Mini 播放器数量应为 1：${JSON.stringify(layout)}`);
    assert(layout.bottomNav === 0, `聆听回顾页面底部导航数量应为 0：${JSON.stringify(layout)}`);
    assert(
      consoleErrors.length === 0,
      `聆听回顾页面产生控制台错误：${JSON.stringify({ consoleErrors, failedResponses })}`,
    );
    assert(failedResponses.length === 0, `聆听回顾页面请求失败：${JSON.stringify(failedResponses)}`);
    assert(pageErrors.length === 0, `聆听回顾页面产生页面错误：${JSON.stringify(pageErrors)}`);

    await page.screenshot({ path: viewport.screenshot });
    results.push({
      viewport: `${viewport.width}x${viewport.height}`,
      screenshot: viewport.screenshot,
      layout,
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      failedResponses: [...failedResponses],
    });
  }

  console.log(JSON.stringify({ ok: true, baseUrl, route: '/listening-recap', results }, null, 2));
} finally {
  await browser.close();
}
