import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const viewportWidth = Number(process.env.JZONE_VIEWPORT_WIDTH || 390);
const viewportHeight = Number(process.env.JZONE_VIEWPORT_HEIGHT || 844);

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 2 });
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
    if (attempt > 0) await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
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

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await login();

  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  await page.waitForTimeout(400);
  const firstSong = page.locator('[data-library-song="true"]:visible').first();
  await firstSong.evaluate((element) => element.click());
  await page.locator('.liquid-mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(35);
  const playerOpening = await page.evaluate(() => {
    const player = document.querySelector('.liquid-mini-player');
    const shell = player?.querySelector('[data-liquid-motion-shell]');
    const content = player?.querySelector(':scope > div.relative.z-10');
    const playerRect = player?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const filter = player?.querySelector('filter');
    const mapImage = player?.querySelector('feImage');
    return {
      playerWidth: playerRect?.width,
      playerHeight: playerRect?.height,
      shellWidth: shellRect?.width,
      contentFilter: content ? getComputedStyle(content).filter : null,
      filterWidth: Number(filter?.getAttribute('width')),
      filterHeight: Number(filter?.getAttribute('height')),
      mapReady: (mapImage?.getAttribute('href') || mapImage?.getAttribute('xlink:href') || '').startsWith('data:image/'),
    };
  });
  assert(
    (playerOpening.shellWidth ?? 0) < (playerOpening.playerWidth ?? 0) || playerOpening.contentFilter !== 'none',
    'Mini 播放器整个玻璃壳没有执行入场形变',
  );
  assert(playerOpening.mapReady, `Mini 播放器首帧位移图未就绪：${JSON.stringify(playerOpening)}`);
  assert(Math.abs(playerOpening.filterWidth - playerOpening.playerWidth) <= 1 && Math.abs(playerOpening.filterHeight - playerOpening.playerHeight) <= 1, `Mini 播放器首帧滤镜尺寸错误：${JSON.stringify(playerOpening)}`);

  if (await page.locator('.liquid-mini-player[data-compact-player-state="circle"]').isVisible().catch(() => false)) {
    await page.getByTestId('mini-player').click();
    await page.waitForFunction(() => document.querySelector('.liquid-mini-player')?.getAttribute('data-compact-player-state') === 'expanded');
    await page.waitForFunction(() => {
      const width = document.querySelector('.liquid-mini-player')?.getBoundingClientRect().width ?? 0;
      return Math.abs(width - 240) <= 0.75;
    });
    const expandedMaterial = await page.evaluate(() => {
      const player = document.querySelector('.liquid-mini-player');
      const material = player?.querySelector('[data-liquid-material="settings"]');
      const tabMaterial = document.querySelector('[data-testid="bottom-nav-layer"]');
      const filter = material?.querySelector('filter');
      const mapImage = material?.querySelector('feImage');
      const playerRect = player?.getBoundingClientRect();
      const materialRect = material?.getBoundingClientRect();
      return {
        materialType: material?.getAttribute('data-liquid-material'),
        coverage: material?.getAttribute('data-liquid-coverage'),
        playerWidth: playerRect?.width,
        materialWidth: materialRect?.width,
        filterWidth: Number(filter?.getAttribute('width')),
        filterApplied: material ? getComputedStyle(material).getPropertyValue('--liquid-tab-filter').includes('url(') : false,
        mapReady: (mapImage?.getAttribute('href') || mapImage?.getAttribute('xlink:href') || '').startsWith('data:image/'),
        blur: material ? getComputedStyle(material).getPropertyValue('--lg-f-blur').trim() : '',
        tabBlur: tabMaterial ? getComputedStyle(tabMaterial).getPropertyValue('--lg-f-blur').trim() : '',
        saturation: material ? getComputedStyle(material).getPropertyValue('--lg-f-saturation').trim() : '',
        tabSaturation: tabMaterial ? getComputedStyle(tabMaterial).getPropertyValue('--lg-f-saturation').trim() : '',
      };
    });
    assert(expandedMaterial.materialType === 'settings' && expandedMaterial.coverage === 'edge', `紧凑 Mini 未使用底部 Tab 同款材质：${JSON.stringify(expandedMaterial)}`);
    assert(Math.abs(expandedMaterial.playerWidth - 240) <= 1, `紧凑 Mini 未完成展开：${JSON.stringify(expandedMaterial)}`);
    assert(Math.abs(expandedMaterial.materialWidth - expandedMaterial.playerWidth) <= 1, `展开态材质没有覆盖播放器：${JSON.stringify(expandedMaterial)}`);
    assert(Math.abs(expandedMaterial.filterWidth - expandedMaterial.playerWidth) <= 1, `展开态仍复用圆形折射图：${JSON.stringify(expandedMaterial)}`);
    assert(expandedMaterial.filterApplied && expandedMaterial.mapReady, `展开态液态玻璃折射未生效：${JSON.stringify(expandedMaterial)}`);
    assert(expandedMaterial.blur === expandedMaterial.tabBlur && expandedMaterial.saturation === expandedMaterial.tabSaturation, `紧凑 Mini 与底部 Tab 参数未同步：${JSON.stringify(expandedMaterial)}`);
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: `output/playwright/liquid-glass-compact-mini-expanded-${viewportWidth}x${viewportHeight}.png` });
    await page.getByTestId('bottom-nav-home').click();
  }

  for (let round = 0; round < 3; round += 1) {
    for (const tab of ['upload', 'profile', 'home', 'library']) {
      await page.getByTestId(`bottom-nav-${tab}`).evaluate((element) => element.click());
      await page.waitForTimeout(180);
    }
  }

  await firstSong.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  });
  await page.locator('.liquid-context-menu-panel').waitFor({ state: 'visible' });
  await page.waitForTimeout(35);
  const opening = await page.evaluate(() => {
    const menu = document.querySelector('.liquid-context-menu-panel');
    const content = document.querySelector('.liquid-context-menu-panel > div.relative.z-10');
    const shell = menu?.querySelector('[data-liquid-motion-shell]');
    const material = menu?.querySelector('[data-liquid-material]');
    const rim = menu?.querySelector('[data-liquid-motion-rim]');
    const glass = menu?.querySelector('.liquid-tab-f-glass');
    const mapImage = menu?.querySelector('feImage');
    const menuRect = menu?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    return content ? {
      filter: getComputedStyle(content).filter,
      transform: getComputedStyle(content).transform,
      menuWidth: menuRect?.width,
      shellWidth: shellRect?.width,
      shellOpacity: shell ? Number(getComputedStyle(shell).opacity) : null,
      materialOpacity: material ? Number(getComputedStyle(material).opacity) : null,
      rimOpacity: rim ? Number(getComputedStyle(rim).opacity) : null,
      glassFilter: glass ? getComputedStyle(glass).backdropFilter : null,
      mapReady: (mapImage?.getAttribute('href') || mapImage?.getAttribute('xlink:href') || '').startsWith('data:image/'),
    } : null;
  });
  assert(opening && (opening.filter !== 'none' || opening.transform !== 'none'), 'Mini 菜单没有执行缩放模糊入场');
  assert((opening?.shellWidth ?? 0) < (opening?.menuWidth ?? 0), 'Mini 菜单整个玻璃壳没有执行入场形变');
  assert((opening?.shellOpacity ?? 0) > 0.99, `Mini 菜单首帧材质外壳不透明度建立了 Backdrop Root：${JSON.stringify(opening)}`);
  assert((opening?.materialOpacity ?? 0) > 0.99 && (opening?.rimOpacity ?? 0) > 0.99, `Mini 菜单首帧没有建立完整液态玻璃和高光：${JSON.stringify(opening)}`);
  assert(opening?.glassFilter?.includes('url('), `Mini 菜单首帧缺少折射滤镜：${JSON.stringify(opening)}`);
  assert(opening?.mapReady, `Mini 菜单首帧位移图尚未生成：${JSON.stringify(opening)}`);
  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: `output/playwright/liquid-glass-menu-opening-35ms-${viewportWidth}x${viewportHeight}.png` });

  await page.waitForTimeout(620);
  const state = await page.evaluate(() => {
    const mini = document.querySelector('.liquid-mini-player');
    const menu = document.querySelector('.liquid-context-menu-panel');
    const nav = document.querySelector('[data-testid="bottom-nav-library"]')?.closest('[data-liquid-control-root]');
    const miniMaterial = mini?.querySelector('[data-liquid-material]');
    const menuMaterial = menu?.querySelector('[data-liquid-material]');
    const adaptiveMenuButton = menu?.querySelector('button[data-liquid-adaptive="true"]');
    const adaptiveMenuIcon = adaptiveMenuButton?.querySelector('svg');
    const adaptiveMiniTitle = mini?.querySelector('[data-player-shared-source="title"]');
    const miniRect = mini?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const unsafeAncestors = [];

    for (let node = miniMaterial?.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.filter !== 'none' || style.backdropFilter !== 'none' || style.transform !== 'none') {
        unsafeAncestors.push({ className: String(node.className), filter: style.filter, backdropFilter: style.backdropFilter, transform: style.transform });
      }
    }

    return {
      miniFilter: mini ? getComputedStyle(mini.querySelector('.liquid-tab-f-glass')).backdropFilter : null,
      menuFilter: menu ? getComputedStyle(menu.querySelector('.liquid-tab-f-glass')).backdropFilter : null,
      miniCoverage: miniMaterial?.getAttribute('data-liquid-coverage'),
      menuCoverage: menuMaterial?.getAttribute('data-liquid-coverage'),
      menuGeometry: menuMaterial?.getAttribute('data-liquid-geometry'),
      menuRootFilter: menu ? getComputedStyle(menu).filter : null,
      menuRootTransform: menu ? getComputedStyle(menu).transform : null,
      menuRootWillChange: menu ? getComputedStyle(menu).willChange : null,
      gap: miniRect && navRect ? navRect.top - miniRect.bottom : null,
      adaptiveMenuButtons: menu?.querySelectorAll('button[data-liquid-adaptive="true"]').length ?? 0,
      adaptiveMenuButtonColor: adaptiveMenuButton ? getComputedStyle(adaptiveMenuButton).color : null,
      adaptiveMenuIconColor: adaptiveMenuIcon ? getComputedStyle(adaptiveMenuIcon).color : null,
      adaptiveMiniTitle: adaptiveMiniTitle?.getAttribute('data-liquid-adaptive') ?? null,
      unsafeAncestors,
      visibleImages: [...document.images].filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0;
      }).length,
    };
  });

  assert(state.miniFilter?.includes('url('), 'Mini 播放器缺少 SVG 背景折射');
  assert(state.menuFilter?.includes('url('), 'Mini 菜单缺少 SVG 背景折射');
  assert(state.miniCoverage === 'full' && state.menuCoverage === 'full', '宽面板没有启用全幅折射');
  assert(state.menuGeometry === 'panel', 'Mini 菜单没有启用纵向面板折射几何');
  assert(state.adaptiveMenuButtons >= 4, `Mini 菜单文字没有纳入液态玻璃前景适配：${JSON.stringify(state)}`);
  assert(state.adaptiveMenuButtonColor === state.adaptiveMenuIconColor, `Mini 菜单文字与图标没有继承同一前景色：${JSON.stringify(state)}`);
  assert(state.adaptiveMiniTitle === 'true', 'Mini 播放器标题文字没有纳入液态玻璃前景适配');
  assert(state.gap >= 12 && state.gap <= 15, `Mini 播放器与 Tab 间距异常：${state.gap}`);
  assert(state.unsafeAncestors.length === 0, `Mini 播放器存在不安全合成祖先：${JSON.stringify(state.unsafeAncestors)}`);
  assert(state.menuRootFilter === 'none' && state.menuRootTransform === 'none', 'Mini 菜单材质根仍存在 filter 或 transform');
  assert(!state.menuRootWillChange?.includes('opacity'), 'Mini 菜单材质根的 will-change 重新建立了 Backdrop Root');
  assert(state.visibleImages > 0, '页面可见图片在 SVG 合成后消失');

  let continuity = null;
  const songRows = page.locator('[data-library-song="true"]:visible');
  if (await songRows.count() > 1) {
    const before = await page.evaluate(() => {
      const menu = document.querySelector('.liquid-context-menu-panel');
      const rect = menu?.getBoundingClientRect();
      return { filterId: menu?.querySelector('filter')?.id, top: rect?.top };
    });
    await songRows.nth(1).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    });
    await page.waitForTimeout(260);
    const after = await page.evaluate(() => {
      const menu = document.querySelector('.liquid-context-menu-panel');
      const rect = menu?.getBoundingClientRect();
      const content = menu?.querySelector(':scope > div.relative.z-10');
      return {
        filterId: menu?.querySelector('filter')?.id,
        top: rect?.top,
        contentFilter: content ? getComputedStyle(content).filter : null,
        contentTransform: content ? getComputedStyle(content).transform : null,
      };
    });
    continuity = { before, after };
    assert(before.filterId === after.filterId, '切换歌曲锚点时 Mini 菜单材质被重新挂载');
    assert(Math.abs((before.top ?? 0) - (after.top ?? 0)) > 5, '切换歌曲锚点时 Mini 菜单没有平移');
    assert(
      (after.contentFilter === 'none' || after.contentFilter === 'blur(0px)') && after.contentTransform === 'none',
      `切换锚点时错误地重播了完整入场动画：${JSON.stringify(after)}`,
    );
  }

  await page.screenshot({ path: `output/playwright/liquid-glass-regression-${viewportWidth}x${viewportHeight}.png` });

  await page.mouse.click(4, 4);
  await page.waitForTimeout(160);
  const closing = await page.evaluate(() => {
    const menu = document.querySelector('.liquid-context-menu-panel');
    const content = menu?.querySelector(':scope > div.relative.z-10');
    const shell = menu?.querySelector('[data-liquid-motion-shell]');
    const material = menu?.querySelector('[data-liquid-material]');
    const glass = menu?.querySelector('.liquid-tab-f-glass');
    const rim = menu?.querySelector('[data-liquid-motion-rim]');
    return content ? {
      exists: true,
      filter: getComputedStyle(content).filter,
      transform: getComputedStyle(content).transform,
      shellOpacity: shell ? Number(getComputedStyle(shell).opacity) : null,
      materialOpacity: material ? Number(getComputedStyle(material).opacity) : null,
      glassFilter: glass ? getComputedStyle(glass).backdropFilter : null,
      rimOpacity: rim ? Number(getComputedStyle(rim).opacity) : null,
    } : { exists: false };
  });
  assert(closing.exists && (closing.filter !== 'none' || closing.transform !== 'none'), 'Mini 菜单关闭时没有反向缩放模糊');
  assert(closing.shellOpacity !== null && closing.shellOpacity > 0.99, `Mini 菜单退出时材质采样被透明度动画截断：${JSON.stringify(closing)}`);
  assert((closing.materialOpacity ?? 1) < 0.72 && (closing.rimOpacity ?? 1) < 0.72, `Mini 菜单退出时玻璃或高光仍然滞留：${JSON.stringify(closing)}`);
  assert(Math.abs((closing.materialOpacity ?? 0) - (closing.rimOpacity ?? 0)) < 0.18, `Mini 菜单退出时玻璃和高光不同步：${JSON.stringify(closing)}`);
  assert(Number(closing.glassFilter?.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0) > 3.5, `Mini 菜单退出时整层玻璃没有同步模糊：${JSON.stringify(closing)}`);
  assert((closing.rimOpacity ?? 1) < 0.7, `Mini 菜单内容消失时高光层仍然滞留：${JSON.stringify(closing)}`);
  await page.waitForTimeout(350);
  assert((await page.locator('.liquid-context-menu-panel').count()) === 0, 'Mini 菜单退出动画后仍残留');

  assert(consoleErrors.length === 0, `Console errors: ${JSON.stringify(consoleErrors)}`);
  assert(failedResponses.length === 0, `Failed responses: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({ ok: true, baseUrl, viewport: `${viewportWidth}x${viewportHeight}`, playerOpening, opening, state, continuity, closing, consoleErrors, failedResponses }, null, 2));
} finally {
  await browser.close();
}
