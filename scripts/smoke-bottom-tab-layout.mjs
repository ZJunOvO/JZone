import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const viewports = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loginIfNeeded = async (page) => {
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/现在就听|资料库|上传音乐/.test(body)) return;
  if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="auth-submit"]');
    return Boolean(button && !button.disabled);
  });
  await page.getByTestId('auth-submit').click();
  await page.getByText('现在就听').first().waitFor({ timeout: 30000 });
};

const setLayoutMode = async (page, mode) => {
  await page.evaluate((nextMode) => {
    const key = 'jzone.liquidGlassSettings.v6';
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...current, bottomTabLayout: nextMode };
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('jzone:liquid-glass-settings-changed', { detail: next }));
  }, mode);
  await page.locator(`[data-testid="bottom-nav-layer"][data-layout-mode="${mode}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(420);
};

const readLayout = (page) => page.evaluate(() => {
  const nav = document.querySelector('[data-testid="bottom-nav-layer"]');
  const mini = document.querySelector('[data-testid="mini-player-layer"]');
  const buttons = [...document.querySelectorAll('button[data-testid^="bottom-nav-"]')];
  const lens = document.querySelector('[data-testid="bottom-nav-lens"]');
  const rect = (element) => {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
  };
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    mode: nav?.getAttribute('data-layout-mode'),
    nav: rect(nav),
    mini: rect(mini),
    miniBottom: mini ? getComputedStyle(mini).bottom : null,
    lens: rect(lens),
    lensOpacity: lens ? Number.parseFloat(getComputedStyle(lens).opacity) : null,
    lensVisual: lens?.getAttribute('data-lens-visual') ?? null,
    buttonRects: buttons.map(rect),
    iconSizes: buttons.map((button) => rect(button.querySelector('svg'))?.width ?? 0),
    ariaCurrent: buttons.map((button) => button.getAttribute('aria-current')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const assertLayout = (layout, mode) => {
  const { nav, mini, lens, buttonRects, iconSizes, viewport } = layout;
  assert(nav && mini, `${mode} 缺少导航或 Mini 播放器：${JSON.stringify(layout)}`);
  const expectedWidth = mode === 'compact' ? 240 : Math.min(400, viewport.width - 24);
  const expectedBottom = mode === 'compact' ? 33 : 14;
  assert(Math.abs(nav.width - expectedWidth) <= 1, `${mode} 宽度错误：${JSON.stringify(layout)}`);
  assert(Math.abs(viewport.height - nav.bottom - expectedBottom) <= 1, `${mode} 底部间距错误：${JSON.stringify(layout)}`);
  assert(Math.abs(nav.left - (viewport.width - nav.width) / 2) <= 1, `${mode} 未居中：${JSON.stringify(layout)}`);
  const expectedMiniBottom = mode === 'compact' ? 111 : 92;
  assert(Math.abs(Number.parseFloat(layout.miniBottom) - expectedMiniBottom) <= 1, `${mode} Mini 播放器定位错误：${JSON.stringify(layout)}`);
  if (mini.height > 0) {
    assert(Math.abs(nav.top - mini.bottom - 12) <= 1, `${mode} Mini 播放器间距错误：${JSON.stringify(layout)}`);
  }
  assert(buttonRects.length === 4, `${mode} Tab 项数量错误：${JSON.stringify(layout)}`);
  const centers = buttonRects.map((item) => item.left + item.width / 2);
  const gaps = centers.slice(1).map((center, index) => center - centers[index]);
  assert(Math.max(...gaps) - Math.min(...gaps) <= 1, `${mode} 图标未等距：${JSON.stringify(layout)}`);
  assert(buttonRects.every((item) => item.left >= nav.left - 1 && item.right <= nav.right + 1), `${mode} 点击区域越界：${JSON.stringify(layout)}`);
  if (mode === 'compact') {
    assert(!lens && layout.lensVisual === null && layout.lensOpacity === null, `紧凑模式仍渲染透镜：${JSON.stringify(layout)}`);
  } else {
    assert(lens && lens.left >= nav.left - 1 && lens.right <= nav.right + 1, `宽屏透镜越界或缺失：${JSON.stringify(layout)}`);
    assert(layout.lensVisual === 'visible' && layout.lensOpacity > 0, `宽屏模式透镜异常隐藏：${JSON.stringify(layout)}`);
  }
  const expectedIconSize = mode === 'compact' ? 24 : 28;
  assert(
    iconSizes.every((size) => Math.abs(size - expectedIconSize) <= 1 || Math.abs(size - expectedIconSize * 1.1) <= 1),
    `${mode} 图标尺寸错误：${JSON.stringify(layout)}`,
  );
  assert(layout.overflow <= 0, `${mode} 页面横向溢出：${JSON.stringify(layout)}`);
};

const parseColor = (value) => {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const channels = match[1].split(',').slice(0, 3).map((channel) => Number.parseFloat(channel.trim()));
  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
};

const colorDistance = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

const readDragState = (page) => page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button[data-testid^="bottom-nav-"]')];
  return {
    currentTab: buttons.find((button) => button.getAttribute('aria-current') === 'page')?.getAttribute('data-tab') ?? null,
    dragging: document.querySelector('[data-testid="bottom-nav-layer"]')?.getAttribute('data-dragging') ?? null,
    colors: buttons.map((button) => getComputedStyle(button).color),
    iconColors: buttons.map((button) => getComputedStyle(button.querySelector('svg')).color),
    iconTransitionDurations: buttons.map((button) => getComputedStyle(button.querySelector('svg')).transitionDuration),
    adaptive: buttons.map((button) => button.getAttribute('data-liquid-adaptive')),
  };
});

const assertInheritedDragColors = (state, label) => {
  assert(state.adaptive.every((value) => value === null), `${label} 拖动按钮仍带自适应前景：${JSON.stringify(state)}`);
  assert(state.iconTransitionDurations.every((value) => Number.parseFloat(value) === 0), `${label} SVG 仍有颜色过渡：${JSON.stringify(state)}`);
  state.colors.forEach((color, index) => {
    assert(colorDistance(parseColor(color), parseColor(state.iconColors[index])) <= 1, `${label} SVG 未继承按钮颜色：${JSON.stringify(state)}`);
  });
};

const verifyCompactDrag = async (page) => {
  const home = await page.getByTestId('bottom-nav-home').boundingBox();
  const library = await page.getByTestId('bottom-nav-library').boundingBox();
  assert(home && library, '拖动验收缺少首页或资料库按钮');
  const homePoint = { x: home.x + home.width / 2, y: home.y + home.height / 2 };
  const libraryPoint = { x: library.x + library.width / 2, y: library.y + library.height / 2 };
  const white = [255, 255, 255];
  const red = [239, 68, 68];

  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="bottom-nav-home"]');
    button?.addEventListener('pointerdown', (event) => {
      window.__bottomTabSmokePointerId = event.pointerId;
    }, { once: true });
  });
  await page.mouse.move(homePoint.x, homePoint.y);
  await page.mouse.down();
  const cancelPointerId = await page.evaluate(() => window.__bottomTabSmokePointerId ?? 1);
  await page.mouse.move(libraryPoint.x, libraryPoint.y, { steps: 2 });
  await page.waitForTimeout(120);
  const beforeCancel = await readDragState(page);
  assert(beforeCancel.currentTab === 'home' && beforeCancel.dragging === 'true', `pointercancel 前拖动状态异常：${JSON.stringify(beforeCancel)}`);
  await page.evaluate(({ x, y, pointerId }) => {
    const button = document.querySelector('[data-testid="bottom-nav-home"]');
    button?.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
    }));
  }, { x: libraryPoint.x, y: libraryPoint.y, pointerId: cancelPointerId });
  await page.waitForFunction(() => document.querySelector('[data-testid="bottom-nav-layer"]')?.getAttribute('data-dragging') === 'false', null, { timeout: 5000 });
  const afterCancel = await readDragState(page);
  assert(afterCancel.currentTab === 'home', `pointercancel 意外切换路由：${JSON.stringify(afterCancel)}`);
  assert(afterCancel.dragging === 'false', `pointercancel 后拖动状态未恢复：${JSON.stringify(afterCancel)}`);
  assert(afterCancel.adaptive[0] === null && afterCancel.adaptive[1] === 'true' && afterCancel.adaptive[2] === 'true' && afterCancel.adaptive[3] === 'true', `pointercancel 后 adaptive 未恢复：${JSON.stringify(afterCancel)}`);
  await page.mouse.up();
  await page.waitForTimeout(40);
  const afterCancelRelease = await readDragState(page);
  assert(afterCancelRelease.currentTab === 'home', `pointercancel 后释放鼠标发生导航：${JSON.stringify(afterCancelRelease)}`);

  await page.mouse.move(homePoint.x, homePoint.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const startTransition = await readDragState(page);
  assertInheritedDragColors(startTransition, '起点过渡');
  assert(startTransition.currentTab === 'home', `按住拖动前路由异常：${JSON.stringify(startTransition)}`);
  await page.waitForTimeout(300);
  const start = await readDragState(page);
  assertInheritedDragColors(start, '起点');
  const startColors = start.colors.map(parseColor);
  assert(start.currentTab === 'home', `按住拖动前路由异常：${JSON.stringify(start)}`);
  assert(colorDistance(startColors[0], red) < 12, `拖动起点未保持目标红色：${JSON.stringify(start)}`);
  assert(colorDistance(startColors[1], white) < 12, `拖动起点非目标图标未保持白色：${JSON.stringify(start)}`);

  await page.mouse.move((homePoint.x + libraryPoint.x) / 2, homePoint.y, { steps: 1 });
  await page.waitForTimeout(120);
  const middle = await readDragState(page);
  assertInheritedDragColors(middle, '中点');
  const middleColors = middle.colors.map(parseColor);
  assert(middle.currentTab === 'home', `松手前中点提前切路由：${JSON.stringify(middle)}`);
  assert(middleColors[0] && middleColors[1], `中点颜色不可读：${JSON.stringify(middle)}`);
  assert(middleColors[0][1] > startColors[0][1] && middleColors[0][2] > startColors[0][2], `当前图标未向白色平缓淡出：${JSON.stringify(middle)}`);
  assert(middleColors[1][1] < startColors[1][1] && middleColors[1][2] < startColors[1][2], `目标图标未向红色渐变：${JSON.stringify(middle)}`);

  await page.mouse.move(libraryPoint.x, libraryPoint.y, { steps: 1 });
  await page.waitForTimeout(360);
  const target = await readDragState(page);
  assertInheritedDragColors(target, '目标点');
  const targetColors = target.colors.map(parseColor);
  assert(target.currentTab === 'home', `到达目标但松手前已切路由：${JSON.stringify(target)}`);
  assert(colorDistance(targetColors[0], white) < 12, `活动图标离开后未淡回白色：${JSON.stringify(target)}`);
  assert(colorDistance(targetColors[1], red) < 12, `目标图标未到达红色：${JSON.stringify(target)}`);

  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-testid="bottom-nav-library"]')?.getAttribute('aria-current') === 'page', null, { timeout: 5000 });
  const afterRelease = await readDragState(page);
  assert(afterRelease.adaptive[0] === 'true' && afterRelease.adaptive[1] === null && afterRelease.adaptive[2] === 'true' && afterRelease.adaptive[3] === 'true', `松手后自适应前景未恢复：${JSON.stringify(afterRelease)}`);
  return { startTransition, start, middle, target, afterRelease };
};

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  await mkdir('output/playwright', { recursive: true });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });
    await page.addInitScript(() => localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now())));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginIfNeeded(page);

    for (const mode of ['wide', 'compact']) {
      await setLayoutMode(page, mode);
      const layout = await readLayout(page);
      assertLayout(layout, mode);
      await page.screenshot({ path: `output/playwright/bottom-tab-${mode}-${viewport.width}.png` });
      results.push({ viewport: `${viewport.width}x${viewport.height}`, mode, layout });
      if (mode === 'compact') {
        results.push({ viewport: `${viewport.width}x${viewport.height}`, mode: 'compact-drag', drag: await verifyCompactDrag(page) });
      }
    }

    if (viewport.width === 390) {
      await page.getByTestId('bottom-nav-profile').click();
      await page.getByTestId('profile-settings-button').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(500);
      const compactEndLayout = await readLayout(page);
      assertLayout(compactEndLayout, 'compact');
      results.push({ viewport: `${viewport.width}x${viewport.height}`, mode: 'compact-last-item', layout: compactEndLayout });
      await page.getByTestId('profile-settings-button').click();
      await page.getByRole('button', { name: /高级设置/ }).click();
      const compactOption = page.getByTestId('bottom-tab-layout-compact');
      await compactOption.waitFor({ state: 'visible', timeout: 5000 });
      await compactOption.click();
      await page.locator('[data-testid="bottom-nav-layer"][data-layout-mode="compact"]').waitFor({ timeout: 5000 });
      assert(await compactOption.getAttribute('aria-pressed') === 'true', '高级设置未选中紧凑模式');
      const persistedMode = await page.evaluate(() => JSON.parse(localStorage.getItem('jzone.liquidGlassSettings.v6') || '{}').bottomTabLayout);
      assert(persistedMode === 'compact', `紧凑模式未持久化：${persistedMode}`);
      await page.screenshot({ path: 'output/playwright/bottom-tab-layout-settings-390.png' });
      await page.getByTestId('bottom-tab-layout-wide').click();
      await page.locator('[data-testid="bottom-nav-layer"][data-layout-mode="wide"]').waitFor({ timeout: 5000 });
    }

    assert(consoleErrors.length === 0, `控制台错误：${JSON.stringify({ consoleErrors, failedResponses })}`);
    assert(failedResponses.length === 0, `请求错误：${JSON.stringify(failedResponses)}`);
    assert(pageErrors.length === 0, `页面错误：${JSON.stringify(pageErrors)}`);
    await page.close();
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
