import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
const disableFiltersForDiagnostics = process.env.JZONE_PERF_DISABLE_FILTERS === '1';

if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const consoleErrors = [];
const failedResponses = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
});
page.on('requestfailed', (request) => {
  failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' });
});

await page.addInitScript(() => {
  localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now()));
  window.__jzoneLongTasks = [];
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__jzoneLongTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
          name: entry.name,
        });
      }
    });
    try {
      observer.observe({ type: 'longtask', buffered: true });
    } catch {}
  }
});
await page.route(/https:\/\/(?:fastly\.)?picsum\.photos\/.*/, (route) => route.fulfill({
  status: 200,
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#26272d"/><circle cx="200" cy="200" r="112" fill="#d9465f"/></svg>',
}));

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

  if (disableFiltersForDiagnostics) {
    await page.addStyleTag({
      content: '* { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    });
  }

  await page.getByTestId('bottom-nav-home').evaluate((element) => element.click());
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'home');

  const homeAvatar = page.locator('[data-shared-element="profile-avatar"]').first();
  await homeAvatar.waitFor({ state: 'visible', timeout: 15000 });
  const avatarMeasurementStartedAt = await page.evaluate(() => performance.now());
  const homeAvatarSrc = await homeAvatar.locator('img').getAttribute('src');
  const avatarTransitionName = await homeAvatar.evaluate((element) => getComputedStyle(element).viewTransitionName);
  assert(avatarTransitionName === 'none', `首页头像仍残留第二套 View Transition：${avatarTransitionName}`);
  const sourceAvatarRect = await homeAvatar.boundingBox();
  await page.evaluate(() => {
    window.__jzoneProfileTransitionFrames = [];
    const startedAt = performance.now();
    const tick = (now) => {
      const target = document.querySelector('[data-profile-avatar-target="true"]');
      const overlay = document.querySelector('[data-testid="profile-avatar-route-transition"]');
      const route = document.querySelector('.jzone-route-stage[data-route="profile"]');
      const background = document.querySelector('[data-testid="profile-immersive-background"]');
      const backgroundRect = background?.getBoundingClientRect();
      const readBackdrop = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        return style.backdropFilter || style.webkitBackdropFilter || 'none';
      };
      const readLayer = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          visibility: style.visibility,
          opacity: Number(style.opacity),
          rect: rect.toJSON(),
          visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.01 && rect.width > 0,
        };
      };
      window.__jzoneProfileTransitionFrames.push({
        time: now - startedAt,
        routeTransform: route ? getComputedStyle(route).transform : null,
        transitionPending: document.documentElement.dataset.profileAvatarTransition === 'pending',
        materialSuspended: document.documentElement.hasAttribute('data-profile-background-transition'),
        miniBackdrop: readBackdrop(document.querySelector('[data-testid="mini-player"] [data-liquid-material] .liquid-tab-f-glass')),
        profileTabsBackdrop: readBackdrop(document.querySelector('[data-profile-page="true"] .sticky')),
        target: readLayer(target),
        overlay: readLayer(overlay),
        background: background && backgroundRect && backgroundRect.width > 0 ? {
          rect: backgroundRect.toJSON(),
          transform: getComputedStyle(background).transform,
          opacity: Number(getComputedStyle(background).opacity),
          src: background.getAttribute('src'),
        } : null,
      });
      if (now - startedAt < 720) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await homeAvatar.click();
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'profile');
  await page.locator('[data-profile-avatar-target="true"]').waitFor({ state: 'attached', timeout: 3000 });
  await page.getByTestId('profile-avatar-route-transition').waitFor({ state: 'attached', timeout: 3000 });
  await page.waitForTimeout(70);
  const avatarTransition = await page.evaluate(() => ({
    targetCount: document.querySelectorAll('[data-shared-element="profile-avatar"]').length,
    overlayCount: document.querySelectorAll('[data-testid="profile-avatar-route-transition"]').length,
    overlayRect: document.querySelector('[data-testid="profile-avatar-route-transition"]')?.getBoundingClientRect().toJSON(),
    running: document.getAnimations().some((animation) => animation.playState === 'running'),
  }));
  assert(avatarTransition.targetCount > 0, '个人页头像目标没有挂载');
  assert(avatarTransition.overlayCount === 1, '首页头像到个人页缺少独立共享覆盖层');
  assert(avatarTransition.running, '首页头像到个人页没有运行共享过渡');
  assert(sourceAvatarRect && avatarTransition.overlayRect && avatarTransition.overlayRect.width > sourceAvatarRect.width, '头像共享覆盖层没有从首页尺寸向个人页尺寸插值');
  const profileFirstPaint = await page.evaluate(() => {
    const avatar = document.querySelector('[data-profile-avatar-target="true"] img');
    const background = document.querySelector('[data-testid="profile-immersive-background"]');
    return {
      avatarSrc: avatar?.getAttribute('src'),
      backgroundSrc: background?.getAttribute('src') ?? null,
      backgroundRect: background?.getBoundingClientRect().toJSON() ?? null,
    };
  });
  assert(!homeAvatarSrc || profileFirstPaint.avatarSrc === homeAvatarSrc, `个人页首帧头像回退到其他来源：${JSON.stringify({ homeAvatarSrc, profileFirstPaint })}`);
  await page.waitForTimeout(720);
  const avatarAfter = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="profile-avatar-route-transition"]');
    return {
      count: document.querySelectorAll('[data-testid="profile-avatar-route-transition"]').length,
      rect: overlay?.getBoundingClientRect().toJSON(),
      opacity: overlay ? getComputedStyle(overlay).opacity : null,
      animations: overlay?.getAnimations().map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime })) ?? [],
    };
  });
  assert(avatarAfter.count === 0, `头像共享过渡结束后覆盖层仍残留：${JSON.stringify(avatarAfter)}`);
  const profileFrames = await page.evaluate(() => window.__jzoneProfileTransitionFrames ?? []);
  const routedFrames = profileFrames.filter((frame) => frame.routeTransform !== null);
  const overlayFrames = profileFrames.filter((frame) => frame.overlay?.visible);
  const backgroundFrames = profileFrames.filter((frame) => frame.background);
  const overlayFrameDeltas = overlayFrames.slice(1).map((frame, index) => frame.time - overlayFrames[index].time);
  const sortedOverlayFrameDeltas = [...overlayFrameDeltas].sort((first, second) => first - second);
  const avatarFrameP95 = sortedOverlayFrameDeltas[Math.min(
    sortedOverlayFrameDeltas.length - 1,
    Math.floor(sortedOverlayFrameDeltas.length * 0.95),
  )] ?? 0;
  const avatarFrameMax = Math.max(0, ...overlayFrameDeltas);
  const avatarLongTasks = await page.evaluate((startedAt) => (window.__jzoneLongTasks ?? [])
    .filter((task) => task.startTime + task.duration >= startedAt)
    .map((task) => ({ ...task, startTime: task.startTime - startedAt })), avatarMeasurementStartedAt);
  assert(routedFrames.length > 6, `个人页路由帧样本不足：${routedFrames.length}`);
  assert(routedFrames.every((frame) => frame.routeTransform === 'none'), `个人页仍被路由 transform 干扰：${JSON.stringify(routedFrames.map((frame) => frame.routeTransform))}`);
  assert(overlayFrames.length > 4, `头像覆盖动画帧样本不足：${overlayFrames.length}`);
  assert(profileFrames.every((frame) => !frame.materialSuspended), '头像路由转场仍在临时撤销液态玻璃或模糊材质');
  const miniMaterialFrames = profileFrames.filter((frame) => frame.miniBackdrop !== null);
  assert(miniMaterialFrames.every((frame) => frame.miniBackdrop !== 'none'), `Mini 播放器液态玻璃在头像转场中断：${JSON.stringify(miniMaterialFrames)}`);
  const profileTabsMaterialFrames = routedFrames.filter((frame) => frame.profileTabsBackdrop !== null);
  assert(profileTabsMaterialFrames.length > 4, '个人页创作/收藏栏材质采样不足');
  assert(profileTabsMaterialFrames.every((frame) => frame.profileTabsBackdrop !== 'none'), `个人页创作/收藏栏模糊在头像转场中断：${JSON.stringify(profileTabsMaterialFrames)}`);
  assert(overlayFrames.filter((frame) => frame.transitionPending).every((frame) => !frame.target?.visible), '共享头像移动期间个人页目标头像提前显示');
  assert(routedFrames.every((frame) => Boolean(frame.target?.visible) || Boolean(frame.overlay?.visible)), '头像转场期间出现共享元素空档');
  assert(routedFrames.some((frame) => frame.target?.visible && frame.overlay?.visible), '共享头像终点缺少目标与覆盖层的交叉淡出帧');
  assert(avatarFrameP95 <= 34, `头像共享动画帧率不稳定：${JSON.stringify({ avatarFrameP95, avatarFrameMax, overlayFrameDeltas, avatarLongTasks, disableFiltersForDiagnostics })}`);
  if (backgroundFrames.length > 1) {
    const firstBackground = backgroundFrames[0].background;
    const maxGeometryDelta = Math.max(...backgroundFrames.map((frame) => {
      const rect = frame.background.rect;
      return Math.max(
        Math.abs(rect.left - firstBackground.rect.left),
        Math.abs(rect.top - firstBackground.rect.top),
        Math.abs(rect.width - firstBackground.rect.width),
        Math.abs(rect.height - firstBackground.rect.height),
      );
    }));
    assert(maxGeometryDelta <= 1, `个人页背景首帧后仍发生二次几何缩放：${maxGeometryDelta}px`);
    assert(backgroundFrames.every((frame) => frame.background.transform === firstBackground.transform), '个人页背景 transform 在入场后发生变化');
    assert(backgroundFrames.every((frame) => frame.background.opacity > 0.1), '个人页背景在头像转场期间被隐藏，产生黑屏闪烁');
  }
  const profileSettled = await page.evaluate(() => {
    const background = document.querySelector('[data-testid="profile-immersive-background"]');
    return {
      backgroundSrc: background?.getAttribute('src') ?? null,
      backgroundRect: background?.getBoundingClientRect().toJSON() ?? null,
    };
  });
  assert(profileSettled.backgroundSrc === profileFirstPaint.backgroundSrc, `个人页背景在首帧后发生来源切换：${JSON.stringify({ profileFirstPaint, profileSettled })}`);
  assert(Boolean(profileSettled.backgroundRect) === Boolean(profileFirstPaint.backgroundRect), `个人页背景模式在首帧后发生切换：${JSON.stringify({ profileFirstPaint, profileSettled })}`);
  assert((await page.getByTestId('mini-player-layer').count()) === 1, '头像路由过渡生成了重复 Mini 播放器层');
  const profileScroll = await page.evaluate(async () => {
    const scroller = document.querySelector('.jzone-glass-source');
    if (!(scroller instanceof HTMLElement)) return null;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const previousScrollBehavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollTop = Math.min(120, maxScroll);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const result = { maxScroll, scrollTop: scroller.scrollTop };
    scroller.scrollTop = 0;
    scroller.style.scrollBehavior = previousScrollBehavior;
    return result;
  });
  assert(profileScroll && profileScroll.maxScroll > 0 && profileScroll.scrollTop > 0, `个人页绝对布局没有进入主滚动容器：${JSON.stringify(profileScroll)}`);

  await page.evaluate(() => {
    window.__jzoneProfileExitFrames = [];
    window.__jzoneProfileHomeTransitionDetail = null;
    window.addEventListener('jzone:profile-avatar-transition', (event) => {
      window.__jzoneProfileHomeTransitionDetail = event.detail;
    }, { once: true });
    const startedAt = performance.now();
    const read = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && rect.width > 0,
      };
    };
    const tick = (now) => {
      window.__jzoneProfileExitFrames.push({
        time: now - startedAt,
        route: document.querySelector('.jzone-route-stage')?.getAttribute('data-route'),
        shell: read(document.querySelector('[data-profile-route-shell="true"]')),
        avatar: read(document.querySelector('[data-profile-avatar-target="true"]')),
        tabs: read(document.querySelector('[data-profile-page="true"] .sticky')),
      });
      if (now - startedAt < 420) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const reverseProfileSourceRect = await page.locator('[data-profile-avatar-target="true"]').boundingBox();
  await page.getByTestId('bottom-nav-home').click();
  await page.waitForFunction(() => window.__jzoneProfileHomeTransitionDetail !== null);
  const reverseTransitionDetail = await page.evaluate(() => window.__jzoneProfileHomeTransitionDetail);
  assert(
    reverseProfileSourceRect
      && reverseTransitionDetail?.destination === 'home'
      && Math.abs(reverseTransitionDetail.rect.left - reverseProfileSourceRect.x) <= 1
      && Math.abs(reverseTransitionDetail.rect.top - reverseProfileSourceRect.y) <= 1,
    `个人页返回现在就听没有从个人头像启动反向共享动画：${JSON.stringify({ reverseProfileSourceRect, reverseTransitionDetail })}`,
  );
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'home');
  await page.getByTestId('profile-avatar-route-transition').waitFor({ state: 'attached', timeout: 3000 });
  const reverseArrivalDistance = await page.evaluate(() => new Promise((resolve) => {
    let minimumDistance = Number.POSITIVE_INFINITY;
    const startedAt = performance.now();
    const tick = () => {
      const overlay = document.querySelector('[data-testid="profile-avatar-route-transition"]');
      const target = document.querySelector('[data-profile-home-avatar-target="true"]');
      if (overlay && target) {
        const overlayRect = overlay.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(overlayRect.left - targetRect.left, overlayRect.top - targetRect.top)
            + Math.abs(overlayRect.width - targetRect.width),
        );
      }
      if (!overlay || performance.now() - startedAt > 1400) {
        resolve(minimumDistance);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  assert(reverseArrivalDistance <= 2, `反向共享头像没有移动到现在就听页右上角终点：${reverseArrivalDistance}`);
  await page.waitForTimeout(440);
  const profileExitFrames = await page.evaluate(() => window.__jzoneProfileExitFrames ?? []);
  const homeExitFrames = profileExitFrames.filter((frame) => frame.route === 'home');
  assert(homeExitFrames.length > 4, `个人页离场帧样本不足：${JSON.stringify(profileExitFrames)}`);
  assert(homeExitFrames.every((frame) => !frame.shell?.visible && !frame.avatar?.visible && !frame.tabs?.visible), `个人页组件残留到其他路由：${JSON.stringify(homeExitFrames)}`);

  const homeAvatarSource = page.locator('[data-profile-home-avatar-source="true"]');
  const homeAvatarSourceRect = await homeAvatarSource.boundingBox();
  assert(homeAvatarSourceRect, '现在就听页右上角头像不可见，无法校验共享动画起点');
  await page.evaluate(() => {
    window.__jzoneHomeProfileTransitionDetail = null;
    window.addEventListener('jzone:profile-avatar-transition', (event) => {
      window.__jzoneHomeProfileTransitionDetail = event.detail;
    }, { once: true });
  });
  await page.getByTestId('bottom-nav-profile').click();
  await page.waitForFunction(() => window.__jzoneHomeProfileTransitionDetail !== null);
  const homeProfileTransitionDetail = await page.evaluate(() => window.__jzoneHomeProfileTransitionDetail);
  const homeProfileStartRect = homeProfileTransitionDetail?.rect;
  assert(
    homeProfileStartRect
      && Math.abs(homeProfileStartRect.left - homeAvatarSourceRect.x) <= 1
      && Math.abs(homeProfileStartRect.top - homeAvatarSourceRect.y) <= 1
      && Math.abs(homeProfileStartRect.width - homeAvatarSourceRect.width) <= 1
      && Math.abs(homeProfileStartRect.height - homeAvatarSourceRect.height) <= 1,
    `从现在就听页进入个人页时，共享头像没有从右上角头像出发：${JSON.stringify({ homeAvatarSourceRect, homeProfileStartRect })}`,
  );
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'profile');
  await page.getByTestId('profile-avatar-route-transition').waitFor({ state: 'detached', timeout: 1200 });
  await page.getByTestId('bottom-nav-home').click();
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'home');

  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  await page.waitForTimeout(500);
  const songRows = page.locator('[data-library-song="true"]:visible');
  const songVisible = await songRows.first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  assert(songVisible, `资料库没有可播放歌曲：${(await page.locator('body').innerText()).slice(0, 500)}`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-library-song="true"]')].some((row) => {
    const image = row.querySelector('img');
    return image?.complete && image.naturalWidth > 0;
  }), null, { timeout: 15000 });
  const playableIndex = await songRows.evaluateAll((rows) => rows.findIndex((row) => {
    const image = row.querySelector('img');
    return image?.complete && image.naturalWidth > 0;
  }));
  assert(playableIndex >= 0, '资料库没有封面已解码的测试歌曲');
  await songRows.nth(playableIndex).evaluate((element) => element.click());
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('mini-player').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-shared-element="song-cover"]').length >= 2, null, { timeout: 3000 });
  const playerForward = await transformedSharedElements('song-cover');
  assert(playerForward.length >= 2, `播放器正向过渡缺少源/目标双端：${playerForward.length}`);

  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(560);
  assert(await page.getByTestId('mini-player').evaluate((element) => document.activeElement === element), '播放器关闭后焦点没有回到 Mini 播放器');

  for (let round = 0; round < 10; round += 1) {
    await page.getByTestId('mini-player').click();
    await page.waitForTimeout(780);
    await page.getByTestId('player-view-close').click();
    await page.waitForTimeout(560);
  }
  const residualPlayerNodes = await page.locator('[data-shared-element="song-cover"]').count();
  assert(residualPlayerNodes === 1, `播放器连续开关后残留共享节点：${residualPlayerNodes}`);

  await page.evaluate(() => {
    window.__jzoneUnexpectedProfileTransitionCount = 0;
    window.addEventListener('jzone:profile-avatar-transition', () => {
      window.__jzoneUnexpectedProfileTransitionCount += 1;
    }, { once: true });
  });
  await page.getByTestId('bottom-nav-profile').click();
  await page.waitForFunction(() => document.querySelector('.jzone-route-stage')?.getAttribute('data-route') === 'profile');
  await page.waitForTimeout(180);
  const nonHomeProfileTransition = await page.evaluate(() => ({
    eventCount: window.__jzoneUnexpectedProfileTransitionCount ?? 0,
    overlayCount: document.querySelectorAll('[data-testid="profile-avatar-route-transition"]').length,
  }));
  assert(
    nonHomeProfileTransition.eventCount === 0 && nonHomeProfileTransition.overlayCount === 0,
    `资料库进入个人页错误触发头像共享动画：${JSON.stringify(nonHomeProfileTransition)}`,
  );
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

  const profileAvatarTarget = page.locator('[data-profile-avatar-target="true"]');
  await profileAvatarTarget.click();
  await page.getByTestId('avatar-frame-modal').waitFor({ state: 'visible', timeout: 3000 });
  const avatarFrameEntryRunning = await page.evaluate(() => document
    .querySelector('[data-testid="avatar-frame-modal"]')
    ?.getAnimations({ subtree: true })
    .some((animation) => animation.playState === 'running') ?? false);
  await page.waitForTimeout(420);
  const avatarFrameModal = await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="avatar-frame-modal"]');
    const panel = document.querySelector('[data-testid="avatar-frame-panel"]');
    const mini = document.querySelector('[data-testid="mini-player-layer"]');
    const miniPlayer = document.querySelector('[data-testid="mini-player"]');
    const miniFilter = miniPlayer?.querySelector('filter');
    return {
      modalZ: Number(getComputedStyle(modal).zIndex),
      miniZ: Number(getComputedStyle(mini).zIndex),
      panelHeight: panel?.getBoundingClientRect().height,
      miniWidth: miniPlayer?.getBoundingClientRect().width,
      miniFilterWidth: Number(miniFilter?.getAttribute('width')),
      viewportHeight: innerHeight,
    };
  });
  assert(avatarFrameModal.miniZ > avatarFrameModal.modalZ, `头像挂件弹窗遮住了 Mini 播放器：${JSON.stringify(avatarFrameModal)}`);
  assert(avatarFrameModal.panelHeight <= Math.min(640, avatarFrameModal.viewportHeight * 0.75), `头像挂件弹窗仍然过高：${JSON.stringify(avatarFrameModal)}`);
  assert(Math.abs(avatarFrameModal.miniWidth - avatarFrameModal.miniFilterWidth) <= 1, `Mini 播放器切换悬浮形态后滤镜尺寸错误：${JSON.stringify(avatarFrameModal)}`);
  assert(avatarFrameEntryRunning, '头像挂件弹窗缺少进场动画');
  await page.mouse.click(8, 8);
  await page.waitForTimeout(50);
  assert((await page.getByTestId('avatar-frame-modal').count()) === 1, '头像挂件弹窗没有保留退出动画生命周期');
  await page.getByTestId('avatar-frame-modal').waitFor({ state: 'detached', timeout: 1200 });

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `共享过渡产生控制台错误：${JSON.stringify({ relevantErrors, failedRequests })}`);

  console.log(JSON.stringify({
    ok: true,
    avatarTransition,
    avatarFrameBudget: { p95: avatarFrameP95, max: avatarFrameMax, samples: overlayFrameDeltas.length, avatarLongTasks },
    playerForward,
    playerCycles: 10,
    residualPlayerNodes,
    collectionChecked,
    consoleErrors,
    failedResponses,
    failedRequests,
  }, null, 2));
} finally {
  await browser.close();
}
