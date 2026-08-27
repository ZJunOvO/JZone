import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const chromePath = process.env.JZONE_CHROME_PATH || undefined;
const headless = process.env.JZONE_HEADFUL !== '1';
const viewports = [
  { width: 390, height: 844, screenshot: 'output/playwright/listening-recap-390.png' },
  { width: 360, height: 800, screenshot: 'output/playwright/listening-recap-360.png' },
];
const appShellSelector = '.jzone-app-shell';
const routeStageSelector = '.jzone-route-stage';
const bottomNavigationSelector = '[data-testid="bottom-nav-layer"]';
const listeningRecapPath = '/listening-recap';
const listeningRecapRpcPath = '/rest/v1/rpc/get_listening_recap';
const routeStageStableFrames = 4;
const routeStageSettleTimeout = 5000;

const launchOptions = chromePath ? { headless, executablePath: chromePath } : { headless };

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isSignedIn = async (page) => page.getByTestId('bottom-nav-home').isVisible().catch(() => false);

const waitForAppShell = async (page, timeout = 30000) => {
  await page.locator(appShellSelector).waitFor({ state: 'visible', timeout });
  await page.locator(routeStageSelector).waitFor({ state: 'visible', timeout });
  await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout });
};

const waitForRouteStageStable = async (page, stage, timeout = routeStageSettleTimeout) => {
  await page.evaluate(({ selector, label, timeoutMs, requiredFrames }) => new Promise((resolve, reject) => {
    const epsilon = 0.0001;
    let stableFrames = 0;
    let settled = false;
    let lastSample = { exists: false, transform: null, opacity: null, stableFrames: 0 };

    const closeTo = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) <= epsilon;
    const isIdentityTransform = (transform) => {
      if (transform === 'none') return true;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        return closeTo(matrix.m11, 1)
          && closeTo(matrix.m12, 0)
          && closeTo(matrix.m13, 0)
          && closeTo(matrix.m14, 0)
          && closeTo(matrix.m21, 0)
          && closeTo(matrix.m22, 1)
          && closeTo(matrix.m23, 0)
          && closeTo(matrix.m24, 0)
          && closeTo(matrix.m31, 0)
          && closeTo(matrix.m32, 0)
          && closeTo(matrix.m33, 1)
          && closeTo(matrix.m34, 0)
          && closeTo(matrix.m41, 0)
          && closeTo(matrix.m42, 0)
          && closeTo(matrix.m43, 0)
          && closeTo(matrix.m44, 1);
      } catch {
        return false;
      }
    };

    const timeoutId = window.setTimeout(() => {
      settled = true;
      reject(new Error(`${label} 路由动画未在 ${timeoutMs}ms 内稳定：${JSON.stringify(lastSample)}`));
    }, timeoutMs);

    const sample = () => {
      if (settled) return;
      const routeStage = document.querySelector(selector);
      if (!routeStage) {
        stableFrames = 0;
        lastSample = { exists: false, transform: null, opacity: null, stableFrames };
        window.requestAnimationFrame(sample);
        return;
      }

      const style = getComputedStyle(routeStage);
      const opacity = Number.parseFloat(style.opacity);
      const stable = isIdentityTransform(style.transform) && closeTo(opacity, 1);
      stableFrames = stable ? stableFrames + 1 : 0;
      lastSample = {
        exists: true,
        transform: style.transform,
        opacity: style.opacity,
        stableFrames,
      };

      if (stableFrames >= requiredFrames) {
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(lastSample);
        return;
      }
      window.requestAnimationFrame(sample);
    };

    window.requestAnimationFrame(sample);
  }), {
    selector: routeStageSelector,
    label: stage,
    timeoutMs: timeout,
    requiredFrames: routeStageStableFrames,
  });
};

const waitForAuthGate = async (page, timeout = 30000) => {
  await page.waitForFunction(() => Boolean(
    document.querySelector('[data-testid="bottom-nav-home"]')
      || document.querySelector('[data-testid="auth-email"]'),
  ), null, { timeout });
};

const loginIfNeeded = async (page) => {
  await waitForAuthGate(page);
  if (await isSignedIn(page)) {
    await waitForAppShell(page);
    return;
  }
  if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

  await page.getByTestId('auth-email').waitFor({ state: 'visible', timeout: 20000 });
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="auth-submit"]');
    return Boolean(button && !button.disabled);
  });
  await page.getByTestId('auth-submit').click();
  await waitForAppShell(page);
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
    route: document.querySelector('.jzone-route-stage')?.getAttribute('data-route') ?? null,
    appShell: document.querySelector('.jzone-app-shell') ? 1 : 0,
    widths,
    mini: document.querySelectorAll('[data-testid="mini-player-layer"]').length,
    bottomNav: document.querySelectorAll(selector).length,
  };
}, bottomNavigationSelector);

const safeResponseSummary = (response) => {
  try {
    const url = new URL(response.url());
    return { status: response.status(), origin: url.origin, path: url.pathname };
  } catch {
    return { status: response.status(), origin: null, path: '<invalid-url>' };
  }
};

const isNavigationRequest = (request) => {
  try {
    return request.isNavigationRequest();
  } catch {
    return false;
  }
};

const isListeningRecapRequest = (request) => {
  try {
    const pathname = new URL(request.url()).pathname.replace(/\/+$/, '');
    return pathname === listeningRecapRpcPath;
  } catch {
    return false;
  }
};

const parseListeningRecapPeriod = (type, id) => {
  if (type === 'month' && typeof id === 'string' && /^\d{4}-\d{2}$/.test(id)) {
    const month = Number(id.slice(5));
    if (month >= 1 && month <= 12) return { type, id };
  }
  if (type === 'year' && typeof id === 'string' && /^\d{4}$/.test(id) && Number(id) > 0) {
    return { type, id };
  }
  return null;
};

const readListeningRecapRequestPeriod = (request) => {
  if (request.method() !== 'POST') return null;
  try {
    const payload = request.postDataJSON();
    if (!payload || typeof payload !== 'object') return null;
    return parseListeningRecapPeriod(payload.p_period_type, payload.p_period_id);
  } catch {
    return null;
  }
};

const readListeningRecapPeriodFromUrl = (urlValue) => {
  try {
    const url = new URL(urlValue);
    if (url.pathname.replace(/\/+$/, '') !== listeningRecapPath) return null;
    const id = url.searchParams.get('period');
    return parseListeningRecapPeriod(id?.includes('-') ? 'month' : 'year', id);
  } catch {
    return null;
  }
};

const isSameListeningRecapPeriod = (left, right) => (
  left?.type === right?.type && left?.id === right?.id
);

const safeRequestSummary = (request) => {
  const recapPeriod = isListeningRecapRequest(request) ? readListeningRecapRequestPeriod(request) : null;
  try {
    const url = new URL(request.url());
    return {
      method: request.method(),
      resourceType: request.resourceType(),
      navigation: isNavigationRequest(request),
      error: request.failure()?.errorText ?? 'unknown',
      origin: url.origin,
      path: url.pathname,
      recapPeriod,
    };
  } catch {
    return {
      method: request.method(),
      resourceType: request.resourceType(),
      navigation: isNavigationRequest(request),
      error: request.failure()?.errorText ?? 'unknown',
      origin: null,
      path: '<invalid-url>',
      recapPeriod,
    };
  }
};

const getIgnorableAbortedReason = (request, requestTransitions) => {
  const errorText = request.failure()?.errorText?.trim().toLowerCase();
  if (errorText !== 'net::err_aborted') return null;

  const transitions = requestTransitions.get(request);
  if (isListeningRecapRequest(request)) {
    const requestPeriod = readListeningRecapRequestPeriod(request);
    if (!requestPeriod || !transitions?.size) return null;

    // 默认首次请求即使跨入后续切换也必须失败，不能被当作普通旧周期请求吞掉。
    if ([...transitions].some((transition) => transition.kind === 'home-to-listening-recap')) return null;
    const staleTransition = [...transitions].find((transition) => (
      transition.type === 'period-switch'
      && transition.targetPeriod
      && !isSameListeningRecapPeriod(requestPeriod, transition.targetPeriod)
    ));
    if (!staleTransition) return null;
    return `period-switch-stale-recap:${requestPeriod.type}:${requestPeriod.id}->${staleTransition.targetPeriod.type}:${staleTransition.targetPeriod.id}`;
  }
  if (isNavigationRequest(request)) return 'browser-navigation';

  if (!transitions?.size) return null;
  return `route-transition:${[...transitions].map((transition) => transition.kind).join(',')}`;
};

const createSyntheticRecapRequest = ({
  errorText = 'net::ERR_ABORTED',
  method = 'POST',
  payload,
}) => ({
  failure: () => ({ errorText }),
  isNavigationRequest: () => false,
  method: () => method,
  postDataJSON: () => payload,
  url: () => 'https://example.supabase.co/rest/v1/rpc/get_listening_recap',
});

const assertSyntheticRequestFailureClassification = () => {
  const targetPeriod = { type: 'month', id: '2026-08' };
  const periodSwitch = { kind: 'period-switch:当前月', type: 'period-switch', targetPeriod };
  const homeEntry = { kind: 'home-to-listening-recap', type: 'route', targetPeriod: null };
  const classify = (request, transitions) => {
    const map = new WeakMap();
    if (transitions.length) map.set(request, new Set(transitions));
    return getIgnorableAbortedReason(request, map);
  };
  const requestFor = (period, overrides = {}) => createSyntheticRecapRequest({
    payload: period ? { p_period_type: period.type, p_period_id: period.id } : { invalid: true },
    ...overrides,
  });

  const staleRequest = requestFor({ type: 'month', id: '2026-07' });
  assert(
    classify(staleRequest, [periodSwitch]) === 'period-switch-stale-recap:month:2026-07->month:2026-08',
    '合成断言失败：period-switch 旧周期 ERR_ABORTED 应被忽略',
  );
  const currentRequest = requestFor(targetPeriod);
  assert(classify(currentRequest, [periodSwitch]) === null, '合成断言失败：当前目标周期 ERR_ABORTED 必须失败');
  const unparseableRequest = requestFor(null);
  assert(classify(unparseableRequest, [periodSwitch]) === null, '合成断言失败：无法解析周期的 RPC 必须失败');
  const initialRequest = requestFor({ type: 'month', id: '2026-07' });
  assert(
    classify(initialRequest, [homeEntry, periodSwitch]) === null,
    '合成断言失败：默认首次 RPC 即使跨入 period-switch 也必须失败',
  );
  const failedRequest = requestFor({ type: 'month', id: '2026-07' }, { errorText: 'net::ERR_FAILED' });
  assert(classify(failedRequest, [periodSwitch]) === null, '合成断言失败：ERR_FAILED 必须失败');
  const unscopedRequest = requestFor({ type: 'month', id: '2026-07' });
  assert(classify(unscopedRequest, []) === null, '合成断言失败：未关联 period-switch 的 RPC 必须失败');
};

assertSyntheticRequestFailureClassification();

const createMobileContext = async (browser, viewport, storageState) => {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(() => {
    localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
  });
  return context;
};

const createPageHarness = (page) => {
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const failedRequests = [];
  const ignoredAbortedRequests = [];
  const requestFailureEvents = [];
  const pendingRequests = new Set();
  const requestTransitions = new WeakMap();
  let activeRequestTransition = null;
  let processedRequestFailureCount = 0;

  const tagRequestForTransition = (request, transition) => {
    const transitions = requestTransitions.get(request) ?? new Set();
    transitions.add(transition);
    requestTransitions.set(request, transitions);
  };

  const beginRequestTransition = (kind, details = {}) => {
    const transition = { kind, type: details.type ?? 'route', targetPeriod: details.targetPeriod ?? null };
    activeRequestTransition = transition;
    for (const request of pendingRequests) tagRequestForTransition(request, transition);
    return transition;
  };

  const endRequestTransition = (transition) => {
    if (activeRequestTransition === transition) activeRequestTransition = null;
  };

  const withRequestTransition = async (kind, action, details) => {
    const transition = beginRequestTransition(kind, details);
    try {
      return await action(transition);
    } finally {
      endRequestTransition(transition);
    }
  };

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.stack || error.message);
  });

  page.on('request', (request) => {
    pendingRequests.add(request);
    if (activeRequestTransition) tagRequestForTransition(request, activeRequestTransition);
  });

  page.on('requestfinished', (request) => {
    pendingRequests.delete(request);
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push(safeResponseSummary(response));
    }
  });

  page.on('requestfailed', (request) => {
    pendingRequests.delete(request);
    requestFailureEvents.push(request);
  });

  const flushRequestFailureEvents = () => {
    while (processedRequestFailureCount < requestFailureEvents.length) {
      const request = requestFailureEvents[processedRequestFailureCount];
      processedRequestFailureCount += 1;
      const ignoredReason = getIgnorableAbortedReason(request, requestTransitions);
      if (ignoredReason) {
        ignoredAbortedRequests.push({ ...safeRequestSummary(request), reason: ignoredReason });
      } else {
        failedRequests.push(safeRequestSummary(request));
      }
    }
  };

  return {
    consoleErrors,
    pageErrors,
    failedResponses,
    failedRequests,
    ignoredAbortedRequests,
    withRequestTransition,
    flushRequestFailureEvents,
  };
};

const browser = await chromium.launch(launchOptions);
const results = [];

try {
  await mkdir('output/playwright', { recursive: true });
  const authContext = await createMobileContext(browser, viewports[0]);
  let authenticatedStorageState;
  try {
    const authPage = await authContext.newPage();
    await authPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await loginIfNeeded(authPage);
    authenticatedStorageState = await authContext.storageState();
  } finally {
    await authContext.close();
  }

  for (const viewport of viewports) {
    const context = await createMobileContext(browser, viewport, authenticatedStorageState);
    try {
      const page = await context.newPage();
      const {
        consoleErrors,
        pageErrors,
        failedResponses,
        failedRequests,
        ignoredAbortedRequests,
        withRequestTransition,
        flushRequestFailureEvents,
      } = createPageHarness(page);

      await withRequestTransition('browser-navigation', () => page.goto(baseUrl, { waitUntil: 'domcontentloaded' }));
      await loginIfNeeded(page);
      authenticatedStorageState = await context.storageState();
      await page.getByTestId('bottom-nav-home').click();
      await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'home', null, { timeout: 30000 });
      await page.getByTestId('listening-recap-entry').waitFor({ state: 'visible', timeout: 20000 });

      const waitForRecapSettled = async (stage) => {
        await page.getByTestId('listening-recap-page').waitFor({ state: 'visible', timeout: 30000 });
        // 不吞掉超时：loading 卡住时必须让 smoke 失败，而不是继续读取旧 DOM。
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="listening-recap-loading"]'),
          null,
          { timeout: 20000 },
        );
        const errorVisible = await page.getByTestId('listening-recap-error').isVisible().catch(() => false);
        assert(!errorVisible, `${stage} 进入错误态：${(await page.locator('body').innerText()).slice(0, 300)}`);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };

      const assertRecapLayout = async (stage) => {
        await waitForRouteStageStable(page, stage);
        const layout = await readLayout(page);
        assert(layout.route === 'listening-recap', `${stage} 路由壳不在 listening-recap：${JSON.stringify(layout)}`);
        assert(layout.appShell === 1, `${stage} 缺少应用壳：${JSON.stringify(layout)}`);
        assert(
          layout.widths.every(({ overflow }) => overflow <= 0),
          `${stage} 存在横向溢出：${JSON.stringify(layout)}`,
        );
        assert(layout.mini === 1, `${stage} Mini 播放器层应唯一：${JSON.stringify(layout)}`);
        assert(layout.bottomNav === 0, `${stage} 底部导航应隐藏：${JSON.stringify(layout)}`);
        return layout;
      };

      const assertDiagnosticsClean = (stage) => {
        flushRequestFailureEvents();
        assert(
          consoleErrors.length === 0,
          `${stage} 产生控制台错误：${JSON.stringify({ consoleErrors, failedResponses })}`,
        );
        assert(pageErrors.length === 0, `${stage} 产生页面错误：${JSON.stringify(pageErrors)}`);
        assert(failedResponses.length === 0, `${stage} 请求返回错误：${JSON.stringify(failedResponses)}`);
        assert(failedRequests.length === 0, `${stage} 请求失败：${JSON.stringify(failedRequests)}`);
      };

      await withRequestTransition('home-to-listening-recap', async () => {
        await page.getByTestId('listening-recap-entry').click();
        await waitForRecapSettled('默认周期');
      });
      assert(await page.getByTestId('listening-recap-period-current-month').getAttribute('aria-current') === 'page', '默认周期未选中当前月');
      const defaultLayout = await assertRecapLayout('默认周期');

      const periodChecks = [];
      const switchPeriod = async (testId, pattern, label) => {
        await page.getByTestId(testId).waitFor({ state: 'visible', timeout: 10000 });
        await withRequestTransition(`period-switch:${label}`, async (transition) => {
          await page.getByTestId(testId).click();
          await page.waitForFunction((source) => {
            const value = new URL(window.location.href).searchParams.get('period');
            return value !== null && new RegExp(source).test(value);
          }, pattern.source, { timeout: 10000 });
          const targetPeriod = readListeningRecapPeriodFromUrl(page.url());
          assert(targetPeriod, `${label} 无法从当前 URL 解析目标周期：${page.url()}`);
          transition.targetPeriod = targetPeriod;
          await waitForRecapSettled(label);
        }, { type: 'period-switch' });
        assert(await page.getByTestId(testId).getAttribute('aria-current') === 'page', `${label} 未成为当前选中周期`);
        const layout = await assertRecapLayout(label);
        const period = new URL(page.url()).searchParams.get('period');
        periodChecks.push({ label, period, layout });
      };

      await switchPeriod('listening-recap-period-current-year', /^\d{4}$/, '年度周期');
      await switchPeriod('listening-recap-period-previous-month', /^\d{4}-\d{2}$/, '上月周期');
      await switchPeriod('listening-recap-period-current-month', /^\d{4}-\d{2}$/, '切回当前月');

      await page.screenshot({ path: viewport.screenshot });
      await withRequestTransition('listening-recap-to-home', async () => {
        await page.getByTestId('listening-recap-back').click();
        await page.waitForFunction(() => (
          window.location.pathname === '/'
          && document.querySelector('[data-testid="bottom-nav-layer"]')
          && !document.querySelector('[data-testid="listening-recap-page"]')
        ), null, { timeout: 30000 });
        await waitForAppShell(page);
      });
      await waitForRouteStageStable(page, '返回首页');
      const returnedLayout = await readLayout(page);
      assert(returnedLayout.route === 'home', `返回后未回到首页：${JSON.stringify(returnedLayout)}`);
      assert(returnedLayout.bottomNav === 1, `返回后底部导航未恢复：${JSON.stringify(returnedLayout)}`);
      assert(returnedLayout.mini === 1, `返回后 Mini 播放器层不唯一：${JSON.stringify(returnedLayout)}`);
      assertDiagnosticsClean(`视口 ${viewport.width}x${viewport.height}`);
      authenticatedStorageState = await context.storageState();

      results.push({
        viewport: `${viewport.width}x${viewport.height}`,
        screenshot: viewport.screenshot,
        defaultLayout,
        periodChecks,
        returnedLayout,
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        failedResponses: [...failedResponses],
        failedRequests: [...failedRequests],
        ignoredAbortedRequests: [...ignoredAbortedRequests],
      });
    } finally {
      await context.close();
    }
  }

  console.log(JSON.stringify({ ok: true, baseUrl, route: '/listening-recap', results }, null, 2));
} finally {
  await browser.close();
}
