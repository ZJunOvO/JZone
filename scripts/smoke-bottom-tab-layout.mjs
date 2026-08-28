import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const settingsKey = 'jzone.liquidGlassSettings.v6';
const compactMigrationKey = 'jzone.liquidGlassSettings.compactDockMigration.v1';
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
  await page.evaluate(({ nextMode, key }) => {
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...current, bottomTabLayout: nextMode };
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('jzone:liquid-glass-settings-changed', { detail: next }));
  }, { nextMode: mode, key: settingsKey });
  await page.locator(`[data-testid="bottom-nav-layer"][data-layout-mode="${mode}"]`).waitFor({ timeout: 5000 });
  await page.waitForTimeout(420);
};

const verifyDefaultAndMigration = async (page, { verifyMigration }) => {
  await page.locator('[data-testid="bottom-nav-layer"][data-layout-mode="compact"]').waitFor({ timeout: 5000 });
  const defaultState = await page.evaluate(({ key, migrationKey }) => ({
    mode: document.querySelector('[data-testid="bottom-nav-layer"]')?.getAttribute('data-layout-mode'),
    migration: localStorage.getItem(migrationKey),
    stored: localStorage.getItem(key),
  }), { key: settingsKey, migrationKey: compactMigrationKey });
  assert(defaultState.mode === 'compact', `新用户默认布局不是紧凑模式：${JSON.stringify(defaultState)}`);
  assert(defaultState.migration === '1', `新用户未记录紧凑布局迁移状态：${JSON.stringify(defaultState)}`);

  if (!verifyMigration) return { defaultState };

  await page.evaluate(({ key, migrationKey }) => {
    localStorage.setItem(key, JSON.stringify({
      strength: 0.031,
      blur: 2,
      bottomTabLayout: 'wide',
    }));
    localStorage.removeItem(migrationKey);
  }, { key: settingsKey, migrationKey: compactMigrationKey });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await page.locator('[data-testid="bottom-nav-layer"][data-layout-mode="compact"]').waitFor({ timeout: 5000 });
  const migratedState = await page.evaluate(({ key, migrationKey }) => ({
    settings: JSON.parse(localStorage.getItem(key) || '{}'),
    migration: localStorage.getItem(migrationKey),
  }), { key: settingsKey, migrationKey: compactMigrationKey });
  assert(migratedState.settings.bottomTabLayout === 'compact', `旧设置未一次迁移到紧凑模式：${JSON.stringify(migratedState)}`);
  assert(Math.abs(migratedState.settings.strength - 0.031) < 0.0001, `布局迁移覆盖了旧材质设置：${JSON.stringify(migratedState)}`);
  assert(migratedState.migration === '1', `旧设置迁移未写入一次性标记：${JSON.stringify(migratedState)}`);

  await setLayoutMode(page, 'wide');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await page.locator('[data-testid="bottom-nav-layer"][data-layout-mode="wide"]').waitFor({ timeout: 5000 });
  const persistedWideState = await page.evaluate(({ key, migrationKey }) => ({
    settings: JSON.parse(localStorage.getItem(key) || '{}'),
    migration: localStorage.getItem(migrationKey),
  }), { key: settingsKey, migrationKey: compactMigrationKey });
  assert(persistedWideState.settings.bottomTabLayout === 'wide', `用户切回宽屏后被重复迁移：${JSON.stringify(persistedWideState)}`);
  assert(persistedWideState.migration === '1', `宽屏回归时迁移标记丢失：${JSON.stringify(persistedWideState)}`);
  return { defaultState, migratedState, persistedWideState };
};

const ensureMiniPlayer = async (page) => {
  if (await page.getByTestId('mini-player').isVisible().catch(() => false)) return;
  await page.getByTestId('bottom-nav-library').click();
  const firstSong = page.locator('[data-library-song="true"]').first();
  await firstSong.waitFor({ state: 'visible', timeout: 15000 });
  await firstSong.evaluate((element) => element.click());
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('bottom-nav-home').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="bottom-nav-home"]')?.getAttribute('aria-current') === 'page');
};

const readLayout = (page) => page.evaluate(() => {
  const nav = document.querySelector('[data-testid="bottom-nav-layer"]');
  const mini = document.querySelector('[data-testid="mini-player-layer"]');
  const miniPlayer = document.querySelector('[data-testid="mini-player"]');
  const miniCover = miniPlayer?.querySelector('[data-player-shared-source="cover"]');
  const miniTitle = miniPlayer?.querySelector('[data-player-shared-source="title"]');
  const miniArtist = miniPlayer?.querySelector('[data-player-shared-source="artist"]');
  const miniControls = [...(miniPlayer?.querySelectorAll('button') ?? [])];
  const miniMaterial = miniPlayer?.querySelector('[data-liquid-material="shuding"]');
  const miniMaterialFilter = miniMaterial?.querySelector('filter');
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
    miniPlayer: rect(miniPlayer),
    miniCover: rect(miniCover),
    miniTitle: rect(miniTitle),
    miniArtist: rect(miniArtist),
    miniControls: miniControls.map(rect),
    miniMaterial: rect(miniMaterial),
    miniMaterialFilterWidth: Number.parseFloat(miniMaterialFilter?.getAttribute('width') ?? 'NaN'),
    miniMaterialFilterApplied: Boolean(miniMaterial && getComputedStyle(miniMaterial).getPropertyValue('--liquid-tab-filter').includes('url(')),
    miniLayoutMode: miniPlayer?.getAttribute('data-layout-mode') ?? null,
    compactPlayerState: miniPlayer?.getAttribute('data-compact-player-state') ?? null,
    compactPresentation: nav?.getAttribute('data-compact-presentation') ?? null,
    compactExpanded: mini?.getAttribute('data-compact-player-expanded') ?? null,
    playbackProgress: Number.parseFloat(miniPlayer?.getAttribute('data-playback-progress') ?? 'NaN'),
    hasEqualizer: Boolean(miniPlayer?.querySelector('[data-testid="compact-player-equalizer"]')),
    hasPausedIndicator: Boolean(miniPlayer?.querySelector('[data-testid="compact-player-paused"]')),
    hasProgressRing: Boolean(miniPlayer?.querySelector('[data-testid="compact-player-progress-ring"]')),
    miniRadius: miniPlayer ? Number.parseFloat(getComputedStyle(miniPlayer).borderRadius) : null,
    navRadius: nav ? Number.parseFloat(getComputedStyle(nav.querySelector('.liquid-tab-surface')).borderRadius) : null,
    miniBottom: mini ? getComputedStyle(mini).bottom : null,
    miniInlineBottom: mini?.style.bottom ?? null,
    navInlineBottom: nav?.style.bottom ?? null,
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
  const { nav, mini, miniPlayer, lens, buttonRects, iconSizes, viewport } = layout;
  assert(nav && mini, `${mode} 缺少导航或 Mini 播放器：${JSON.stringify(layout)}`);
  const expectedWidth = Math.min(mode === 'compact' ? 240 : 400, viewport.width - 24);
  const expectedBottom = mode === 'compact' ? 33 : 14;
  assert(Math.abs(nav.width - expectedWidth) <= 1, `${mode} 宽度错误：${JSON.stringify(layout)}`);
  assert(Math.abs(viewport.height - nav.bottom - expectedBottom) <= 1, `${mode} 底部间距错误：${JSON.stringify(layout)}`);
  const expectedNavLeft = mode === 'compact' ? (viewport.width - 314) / 2 : (viewport.width - nav.width) / 2;
  assert(Math.abs(nav.left - expectedNavLeft) <= 1, `${mode} 横向位置错误：${JSON.stringify(layout)}`);
  assert(layout.navInlineBottom.includes('safe-area-inset-bottom'), `${mode} Tab 未纳入底部安全区：${JSON.stringify(layout)}`);
  const expectedMiniBottom = mode === 'compact' ? 34 : 92;
  assert(Math.abs(Number.parseFloat(layout.miniBottom) - expectedMiniBottom) <= 1, `${mode} Mini 播放器定位错误：${JSON.stringify(layout)}`);
  assert(layout.miniInlineBottom.includes('safe-area-inset-bottom'), `${mode} Mini 播放器未纳入底部安全区：${JSON.stringify(layout)}`);
  if (mini.height > 0) {
    assert(miniPlayer && Math.abs(miniPlayer.width - mini.width) <= 1, `${mode} Mini 内容未填满容器：${JSON.stringify(layout)}`);
    if (mode === 'compact') {
      assert(Math.abs(mini.width - 64) <= 1, `紧凑收起态 Mini 不是圆形入口：${JSON.stringify(layout)}`);
      assert(Math.abs(mini.left - nav.right - 10) <= 1, `紧凑收起态横向间距错误：${JSON.stringify(layout)}`);
      assert(Math.abs((mini.top + mini.height / 2) - (nav.top + nav.height / 2)) <= 1, `紧凑 Dock 未在同一基线：${JSON.stringify(layout)}`);
      assert(layout.miniLayoutMode === 'compact-circle' && layout.compactPlayerState === 'circle', `紧凑 Mini 未进入圆形态：${JSON.stringify(layout)}`);
      assert(layout.compactPresentation === 'full' && layout.compactExpanded === 'false', `紧凑 Tab 默认状态错误：${JSON.stringify(layout)}`);
      assert(layout.hasProgressRing && Number.isFinite(layout.playbackProgress), `圆形 Mini 缺少真实进度环：${JSON.stringify(layout)}`);
      assert(layout.miniCover && layout.miniCover.left >= miniPlayer.left - 1 && layout.miniCover.right <= miniPlayer.right + 1, `紧凑 Mini 封面越界：${JSON.stringify(layout)}`);
      assert(layout.miniControls.length === 0, `圆形 Mini 不应暴露内部控制：${JSON.stringify(layout)}`);
    } else {
      const visualGap = nav.top - mini.bottom;
      assert(visualGap >= 12 - 1 && visualGap <= 15 + 1, `${mode} Mini 播放器间距错误：${JSON.stringify(layout)}`);
      assert(layout.miniLayoutMode === mode, `${mode} Mini 内部模式不一致：${JSON.stringify(layout)}`);
    }
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

const assertCompactExpandedLayout = (layout) => {
  const { nav, mini, miniPlayer, viewport, buttonRects } = layout;
  assert(nav && mini && miniPlayer, `紧凑展开态缺少 Dock：${JSON.stringify(layout)}`);
  assert(Math.abs(nav.width - 64) <= 1 && Math.abs(mini.width - 240) <= 1, `紧凑展开态没有互换宽度：${JSON.stringify(layout)}`);
  assert(Math.abs(nav.left - (viewport.width - 314) / 2) <= 1, `紧凑展开态整体未居中：${JSON.stringify(layout)}`);
  assert(Math.abs(mini.left - nav.right - 10) <= 1, `紧凑展开态横向间距错误：${JSON.stringify(layout)}`);
  assert(Math.abs((mini.top + mini.height / 2) - (nav.top + nav.height / 2)) <= 1, `紧凑展开态未在同一基线：${JSON.stringify(layout)}`);
  assert(layout.compactPresentation === 'home' && layout.compactExpanded === 'true', `紧凑展开态状态标记错误：${JSON.stringify(layout)}`);
  assert(layout.miniLayoutMode === 'compact-expanded' && layout.compactPlayerState === 'expanded', `横向 Mini 表现错误：${JSON.stringify(layout)}`);
  assert(layout.miniTitle?.width >= 44 && layout.miniArtist?.width >= 44, `横向 Mini 文本区域不可读：${JSON.stringify(layout)}`);
  assert(layout.miniControls.length === 2, `横向 Mini 播放控制数量异常：${JSON.stringify(layout)}`);
  assert(layout.miniMaterial && Math.abs(layout.miniMaterial.width - 240) <= 1, `横向 Mini 液态玻璃表面没有覆盖完整宽度：${JSON.stringify(layout)}`);
  assert(Math.abs(layout.miniMaterialFilterWidth - 240) <= 1, `横向 Mini 仍在复用圆形折射图：${JSON.stringify(layout)}`);
  assert(layout.miniMaterialFilterApplied, `横向 Mini 没有应用液态玻璃折射滤镜：${JSON.stringify(layout)}`);
  assert(buttonRects[0]?.width >= 50, `首页圆钮点击区域过小：${JSON.stringify(layout)}`);
  assert(buttonRects.slice(1).every((rect) => rect.left >= nav.right - 1), `隐藏入口没有留在稳定轨道外：${JSON.stringify(layout)}`);
  assert(layout.overflow <= 0, `紧凑展开态横向溢出：${JSON.stringify(layout)}`);
};

const waitForCompactGeometry = (page, state) => page.waitForFunction((expectedState) => {
  const player = document.querySelector('[data-testid="mini-player"]');
  const nav = document.querySelector('[data-testid="bottom-nav-layer"]');
  const playerRect = player?.getBoundingClientRect();
  const navRect = nav?.getBoundingClientRect();
  if (!playerRect || !navRect || player?.getAttribute('data-compact-player-state') !== expectedState) return false;
  return expectedState === 'expanded'
    ? Math.abs(playerRect.width - 240) <= 1 && Math.abs(navRect.width - 64) <= 1
    : Math.abs(playerRect.width - 64) <= 1 && Math.abs(navRect.width - 240) <= 1;
}, state);

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

const verifyLiveMiniOrigin = async (page) => {
  const circle = page.getByTestId('mini-player');
  const circleState = await readLayout(page);
  assert(circleState.compactPlayerState === 'circle', `交互测试起点不是圆形态：${JSON.stringify(circleState)}`);

  const openingFrames = await page.evaluate(async () => {
    const player = document.querySelector('[data-testid="mini-player"]');
    player?.click();
    const frames = [];
    for (let index = 0; index < 18; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = player?.getBoundingClientRect();
      if (rect) frames.push({ left: rect.left, width: rect.width });
    }
    return frames;
  });
  await waitForCompactGeometry(page, 'expanded');
  assert(openingFrames.some((frame) => frame.left < circleState.mini.left - 8 && frame.left > circleState.mini.left - 168), `圆形播放器没有连续向左展开：${JSON.stringify(openingFrames)}`);
  assert(openingFrames.some((frame) => frame.width > 72 && frame.width < 232), `圆形播放器展开缺少中间宽度：${JSON.stringify(openingFrames)}`);
  let expandedLayout = await readLayout(page);
  assertCompactExpandedLayout(expandedLayout);
  const playButton = page.getByTestId('mini-player').locator('button').first();
  await playButton.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="mini-player"] button')?.getAttribute('aria-label')?.startsWith('播放'));
  assert(!(await page.getByTestId('player-view-close').isVisible().catch(() => false)), '横向 Mini 内部播放按钮误开全屏播放器');

  const closingFrames = await page.evaluate(async () => {
    const home = document.querySelector('[data-testid="bottom-nav-home"]');
    home?.click();
    const frames = [];
    for (let index = 0; index < 18; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const buttons = [...document.querySelectorAll('button[data-testid^="bottom-nav-"]')];
      frames.push(buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left + rect.width / 2;
      }));
    }
    return frames;
  });
  await waitForCompactGeometry(page, 'circle');
  const expectedCenters = closingFrames.at(-1);
  assert(expectedCenters && closingFrames.every((frame) => frame.every((center, index) => Math.abs(center - expectedCenters[index]) <= 1)), `Tab 图标在回弹首帧发生挤压错位：${JSON.stringify(closingFrames)}`);
  const pausedCircle = await readLayout(page);
  assert(!pausedCircle.hasEqualizer, `暂停圆形 Mini 仍显示播放音阶：${JSON.stringify(pausedCircle)}`);
  assert(pausedCircle.hasPausedIndicator, `暂停圆形 Mini 缺少暂停状态标识：${JSON.stringify(pausedCircle)}`);

  await page.getByTestId('mini-player').click();
  await waitForCompactGeometry(page, 'expanded');
  const startedButtonLabel = await page.getByTestId('mini-player').locator('button').first().getAttribute('aria-label');
  assert(startedButtonLabel?.startsWith('暂停'), `暂停时点击圆形 Mini 没有先开始播放：${startedButtonLabel}`);
  await page.getByTestId('bottom-nav-home').click();
  await waitForCompactGeometry(page, 'circle');
  const playingCircle = await readLayout(page);
  assert(playingCircle.hasEqualizer, `播放中圆形 Mini 缺少跳动音阶：${JSON.stringify(playingCircle)}`);
  assert(!playingCircle.hasPausedIndicator, `播放中圆形 Mini 仍显示暂停状态标识：${JSON.stringify(playingCircle)}`);

  await page.getByTestId('mini-player').click();
  await waitForCompactGeometry(page, 'expanded');
  expandedLayout = await readLayout(page);
  assertCompactExpandedLayout(expandedLayout);
  const stillPlayingLabel = await page.getByTestId('mini-player').locator('button').first().getAttribute('aria-label');
  assert(stillPlayingLabel?.startsWith('暂停'), `播放中点击圆形 Mini 意外暂停：${stillPlayingLabel}`);
  if (page.viewportSize()?.width === 390) {
    await page.screenshot({ path: 'output/playwright/bottom-tab-compact-expanded-390.png' });
  }

  const source = await page.evaluate(() => {
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
    };
    const mini = document.querySelector('[data-testid="mini-player"]');
    return {
      player: rect(mini),
      radius: mini ? Number.parseFloat(getComputedStyle(mini).borderRadius) : null,
      cover: rect(document.querySelector('[data-player-shared-source="cover"]')),
      title: rect(document.querySelector('[data-player-shared-source="title"]')),
      artist: rect(document.querySelector('[data-player-shared-source="artist"]')),
    };
  });
  assert(source.player && source.cover && source.title && source.artist, `共享动画缺少紧凑 Mini 源元素：${JSON.stringify(source)}`);

  await page.getByTestId('mini-player').click();
  await page.waitForFunction(() => {
    const layer = document.querySelector('[data-testid="mini-player-layer"]');
    return Boolean(layer?.getAttribute('data-player-transition-origin') && layer?.getAttribute('data-player-shared-origin'));
  }, null, { timeout: 5000 });
  const captured = await page.getByTestId('mini-player-layer').evaluate((element) => ({
    origin: JSON.parse(element.getAttribute('data-player-transition-origin')),
    shared: JSON.parse(element.getAttribute('data-player-shared-origin')),
  }));
  const assertRectClose = (actual, expected, label) => {
    const delta = Math.max(...['left', 'top', 'width', 'height'].map((key) => Math.abs(actual[key] - expected[key])));
    assert(delta <= 1, `${label} 未读取实时紧凑 Mini 几何：${JSON.stringify({ actual, expected, delta })}`);
  };
  assertRectClose(captured.origin, source.player, '播放器外壳始点');
  assert(Math.abs(captured.origin.borderRadius - source.radius) <= 1, `播放器始点圆角不是实时值：${JSON.stringify({ captured, source })}`);
  for (const name of ['cover', 'title', 'artist']) assertRectClose(captured.shared[name], source[name], `${name} 共享始点`);

  await page.getByTestId('player-view-close').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId('player-view-close').click();
  await page.getByTestId('player-transition-shell').waitFor({ state: 'detached', timeout: 5000 });
  await page.getByTestId('bottom-nav-home').click();
  await waitForCompactGeometry(page, 'circle');
  return { circleState, openingFrames, closingFrames, pausedCircle, playingCircle, expandedLayout, source, captured };
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
    const settingsCompatibility = await verifyDefaultAndMigration(page, { verifyMigration: viewport.width === 390 });
    results.push({ viewport: `${viewport.width}x${viewport.height}`, mode: 'settings-compatibility', settingsCompatibility });
    await ensureMiniPlayer(page);

    for (const mode of ['wide', 'compact']) {
      await setLayoutMode(page, mode);
      const layout = await readLayout(page);
      assertLayout(layout, mode);
      await page.screenshot({ path: `output/playwright/bottom-tab-${mode}-${viewport.width}.png` });
      results.push({ viewport: `${viewport.width}x${viewport.height}`, mode, layout });
      if (mode === 'compact') {
        results.push({ viewport: `${viewport.width}x${viewport.height}`, mode: 'compact-drag', drag: await verifyCompactDrag(page) });
        results.push({ viewport: `${viewport.width}x${viewport.height}`, mode: 'compact-player-origin', origin: await verifyLiveMiniOrigin(page) });
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
      const persistedMode = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').bottomTabLayout, settingsKey);
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
