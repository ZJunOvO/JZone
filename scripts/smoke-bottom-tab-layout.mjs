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
  const buttons = [...document.querySelectorAll('[data-testid^="bottom-nav-"]:not([data-testid="bottom-nav-layer"])')];
  const lens = document.querySelector('.liquid-tab-lens')?.parentElement;
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
    buttonRects: buttons.map(rect),
    iconSizes: buttons.map((button) => rect(button.querySelector('svg'))?.width ?? 0),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const assertLayout = (layout, mode) => {
  const { nav, mini, lens, buttonRects, iconSizes, viewport } = layout;
  assert(nav && mini && lens, `${mode} 缺少导航、透镜或 Mini 播放器：${JSON.stringify(layout)}`);
  const expectedWidth = mode === 'compact' ? 220 : Math.min(400, viewport.width - 24);
  const expectedBottom = mode === 'compact' ? 24 : 14;
  assert(Math.abs(nav.width - expectedWidth) <= 1, `${mode} 宽度错误：${JSON.stringify(layout)}`);
  assert(Math.abs(viewport.height - nav.bottom - expectedBottom) <= 1, `${mode} 底部间距错误：${JSON.stringify(layout)}`);
  assert(Math.abs(nav.left - (viewport.width - nav.width) / 2) <= 1, `${mode} 未居中：${JSON.stringify(layout)}`);
  const expectedMiniBottom = mode === 'compact' ? 102 : 92;
  assert(Math.abs(Number.parseFloat(layout.miniBottom) - expectedMiniBottom) <= 1, `${mode} Mini 播放器定位错误：${JSON.stringify(layout)}`);
  if (mini.height > 0) {
    assert(Math.abs(nav.top - mini.bottom - 12) <= 1, `${mode} Mini 播放器间距错误：${JSON.stringify(layout)}`);
  }
  assert(buttonRects.length === 4, `${mode} Tab 项数量错误：${JSON.stringify(layout)}`);
  const centers = buttonRects.map((item) => item.left + item.width / 2);
  const gaps = centers.slice(1).map((center, index) => center - centers[index]);
  assert(Math.max(...gaps) - Math.min(...gaps) <= 1, `${mode} 图标未等距：${JSON.stringify(layout)}`);
  assert(buttonRects.every((item) => item.left >= nav.left - 1 && item.right <= nav.right + 1), `${mode} 点击区域越界：${JSON.stringify(layout)}`);
  assert(lens.left >= nav.left - 1 && lens.right <= nav.right + 1, `${mode} 透镜越界：${JSON.stringify(layout)}`);
  const expectedIconSize = mode === 'compact' ? 24 : 28;
  assert(
    iconSizes.every((size) => Math.abs(size - expectedIconSize) <= 1 || Math.abs(size - expectedIconSize * 1.1) <= 1),
    `${mode} 图标尺寸错误：${JSON.stringify(layout)}`,
  );
  assert(layout.overflow <= 0, `${mode} 页面横向溢出：${JSON.stringify(layout)}`);
};

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  await mkdir('output/playwright', { recursive: true });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    await page.addInitScript(() => localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now())));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginIfNeeded(page);

    for (const mode of ['wide', 'compact']) {
      await setLayoutMode(page, mode);
      const layout = await readLayout(page);
      assertLayout(layout, mode);
      await page.screenshot({ path: `output/playwright/bottom-tab-${mode}-${viewport.width}.png` });
      results.push({ viewport: `${viewport.width}x${viewport.height}`, mode, layout });
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

    assert(consoleErrors.length === 0, `控制台错误：${JSON.stringify(consoleErrors)}`);
    assert(pageErrors.length === 0, `页面错误：${JSON.stringify(pageErrors)}`);
    await page.close();
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
