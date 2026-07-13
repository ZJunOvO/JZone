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
    { timeout }
  );
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const captureLibraryViewFirstFrame = (page, buttonTestId, view) => page.evaluate(async ({ buttonId, targetView }) => {
  document.querySelector(`[data-testid="${buttonId}"]`)?.click();
  for (let frame = 0; frame < 45; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const element = document.querySelector(`[data-library-view="${targetView}"]`);
    if (!element) continue;
    const style = getComputedStyle(element);
    return { opacity: Number(style.opacity), transform: style.transform, filter: style.filter };
  }
  return null;
}, { buttonId: buttonTestId, targetView: view });

const clickAndCaptureRouteTransition = (page, tabId) => page.evaluate(async (route) => {
  document.querySelector(`[data-testid="bottom-nav-${route}"]`)?.click();
  let lastSample = null;
  for (let frame = 0; frame < 36; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const stage = document.querySelector('.jzone-route-stage');
    const sample = {
      route,
      viewTransitionName: stage ? getComputedStyle(stage).viewTransitionName : null,
      activeAnimations: document.getAnimations().map((animation) => ({
        name: 'animationName' in animation ? animation.animationName : '',
        playState: animation.playState,
      })).filter((animation) => /jzone-route-(in|out)/.test(animation.name)),
    };
    lastSample = sample;
    if (sample.activeAnimations.length > 0) return sample;
  }
  return lastSample;
}, tabId);

const isLibraryViewAnimating = (sample) => {
  if (!sample) return false;
  const blur = Number(sample.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
  return sample.opacity < 0.98 || (sample.transform !== 'none' && !sample.transform.startsWith('matrix(1,')) || blur > 0.2;
};

const isSignedIn = async (page) => {
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /现在就听|精选推荐|最近播放|资料库|上传音乐/.test(body);
};

const loginIfNeeded = async (page) => {
  if (await isSignedIn(page)) return;

  if (!email || !password) {
    throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');
  }

  await waitForEitherText(page, [/邮箱/, /登录/]);

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);

  const submit = page.getByTestId('auth-submit');
  await submit.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="auth-submit"]');
    return Boolean(button && !button.disabled);
  });
  await submit.click();
  await page.getByText('现在就听').first().waitFor({ timeout: 30000 });
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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

await page.addInitScript(() => {
  localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  const checks = [
    ['home', '现在就听'],
    ['library', '资料库'],
    ['upload', '上传音乐'],
    ['profile', /创作|收藏|收录|专辑|歌单/],
  ];
  const routeTransitionSamples = [];

  for (const [tabId, expected] of checks) {
    routeTransitionSamples.push(await clickAndCaptureRouteTransition(page, tabId));
    if (expected instanceof RegExp) {
      await waitForEitherText(page, [expected], 15000);
    } else {
      await page.getByText(expected).first().waitFor({ timeout: 15000 });
    }
    await page.waitForTimeout(360);
  }

  assert(routeTransitionSamples.every((sample) => sample.viewTransitionName === 'jzone-route-content'), `一级路由没有使用独立快照层：${JSON.stringify(routeTransitionSamples)}`);
  assert(routeTransitionSamples.filter((sample) => sample.activeAnimations.length > 0).length >= 3, `一级路由淡入淡出没有运行：${JSON.stringify(routeTransitionSamples)}`);

  await page.getByTestId('bottom-nav-library').click();
  await page.getByText('资料库').first().waitFor({ timeout: 15000 });
  const canvasOpening = await captureLibraryViewFirstFrame(page, 'library-view-canvas', 'canvas');
  const canvasView = page.locator('[data-library-view="canvas"]');
  await canvasView.waitFor({ state: 'attached', timeout: 3000 });
  assert(isLibraryViewAnimating(canvasOpening), `Bento 视图没有入场转场：${JSON.stringify(canvasOpening)}`);
  await page.waitForTimeout(360);
  assert(await page.locator('[data-bento-canvas]').isVisible(), 'Bento 转场完成后画布不可见');

  const listOpening = await captureLibraryViewFirstFrame(page, 'library-view-list', 'list');
  const listView = page.locator('[data-library-view="list"]');
  await listView.waitFor({ state: 'attached', timeout: 3000 });
  assert(isLibraryViewAnimating(listOpening), `列表视图没有返回转场：${JSON.stringify(listOpening)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checkedTabs: checks.map(([tabId]) => tabId),
        routeTransitionSamples,
        libraryViewTransitions: { canvasOpening, listOpening },
        consoleErrors,
        failedResponses,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
