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

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
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
    if (await page.getByTestId('bottom-nav-home').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error('登录后未进入主界面');
};

const sampleTransition = async (time, direction, clickSelector = null) => page.evaluate(({ sampleTime, sampleDirection, selector }) => {
  const shell = document.querySelector('[data-testid="player-transition-shell"]');
  const miniGlass = document.querySelector('.liquid-mini-player .liquid-tab-f-glass');
  const miniSettleSurface = document.querySelector('.liquid-mini-player[data-liquid-settle-surface]');
  const miniFilter = miniGlass ? getComputedStyle(miniGlass).backdropFilter : null;
  const base = {
    time: sampleTime,
    direction: sampleDirection,
    miniFilter,
    miniSettleTransform: miniSettleSurface ? getComputedStyle(miniSettleSurface).transform : null,
  };
  if (!shell) return { ...base, exists: false };
  const style = getComputedStyle(shell);
  const clipPath = style.clipPath;
  const insetBody = clipPath.match(/^inset\((.*?)(?:\s+round\s+.*?)?\)$/)?.[1] ?? '';
  const raw = [...insetBody.matchAll(/-?[\d.]+/g)].map((match) => Number(match[0]));
  const insets = raw.length === 1
    ? [raw[0], raw[0], raw[0], raw[0]]
    : raw.length === 2
      ? [raw[0], raw[1], raw[0], raw[1]]
      : raw.length === 3
        ? [raw[0], raw[1], raw[2], raw[1]]
        : raw.slice(0, 4);
  const shared = (name) => [...document.querySelectorAll(`[data-shared-element="${name}"]`)].map((element) => ({
    transform: getComputedStyle(element).transform,
    opacity: Number(getComputedStyle(element).opacity),
    rect: element.getBoundingClientRect().toJSON(),
  }));
  const secondary = document.querySelector('[data-player-transition-part="secondary"]');
  const background = document.querySelector('[data-player-transition-part="background"]');
  const sample = {
    ...base,
    exists: true,
    phase: shell.getAttribute('data-player-transition-phase'),
    miniFilter,
    clipPath,
    insets: { top: insets[0], right: insets[1], bottom: insets[2], left: insets[3] },
    secondaryOpacity: secondary ? Number(getComputedStyle(secondary).opacity) : null,
    backgroundOpacity: background ? Number(getComputedStyle(background).opacity) : null,
    shellBackgroundColor: style.backgroundColor,
    coverSettleTransform: getComputedStyle(document.querySelector('[data-player-shared-settle="cover"]')).transform,
    cover: shared('song-cover'),
    title: shared('song-title'),
    artist: shared('song-artist'),
  };
  if (selector) document.querySelector(selector)?.click();
  return sample;
}, { sampleTime: time, sampleDirection: direction, selector: clickSelector });

const captureTimeline = async (direction, offsets) => {
  const samples = [];
  const startedAt = Date.now();
  for (const offset of offsets) {
    const remaining = offset - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
    const sample = await sampleTransition(offset, direction);
    samples.push(sample);
  }
  return samples;
};

const assertMonotonic = (samples, key, direction) => {
  const values = samples.filter((sample) => sample.exists).map((sample) => sample.insets[key]);
  for (let index = 1; index < values.length; index += 1) {
    const valid = direction === 'decrease'
      ? values[index] <= values[index - 1] + 1.5
      : values[index] + 1.5 >= values[index - 1];
    assert(valid, `${key} 未按 ${direction} 单调变化：${JSON.stringify(values)}`);
  }
};

const assertFrameBudget = (frames, label) => {
  const longFrameRatio = frames.frames > 0 ? frames.over50ms / frames.frames : 1;
  assert(
    frames.frames > 0 && frames.max <= 120.1 && longFrameRatio <= 0.15,
    `${label}存在持续长帧：${JSON.stringify({ ...frames, longFrameRatio })}`,
  );
};

const clickAndCaptureOpeningFrame = async () => page.evaluate(async () => {
  document.querySelector('[data-testid="mini-player"]')?.click();
  for (let frame = 0; frame < 12; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const shell = document.querySelector('[data-testid="player-transition-shell"]');
    if (!shell) continue;
    const clipPath = getComputedStyle(shell).clipPath;
    const insetBody = clipPath.match(/^inset\((.*?)(?:\s+round\s+.*?)?\)$/)?.[1] ?? '';
    const raw = [...insetBody.matchAll(/-?[\d.]+/g)].map((match) => Number(match[0]));
    const top = raw[0] ?? 0;
    const sharedTransforms = Object.fromEntries(['cover', 'title', 'artist'].map((name) => {
      const target = shell.querySelector(`[data-shared-element="song-${name}"]`);
      return [name, target ? getComputedStyle(target).transform : null];
    }));
    return { clipPath, top, sharedTransforms };
  }
  return null;
});

const readMatrixScale = (transform) => {
  if (!transform || transform === 'none') return { x: 1, y: 1 };
  const values = transform.match(/-?[\d.]+/g)?.map(Number) ?? [];
  return values.length >= 4 ? { x: Math.abs(values[0]), y: Math.abs(values[3]) } : { x: 1, y: 1 };
};

const assertSoftSettle = (transforms, label, { minPeak = 1.003, maxPeak = 1.012, finalDelta = 0.002 } = {}) => {
  const scales = transforms.filter(Boolean).map((transform) => readMatrixScale(transform).x);
  const peak = Math.max(...scales);
  const minimum = Math.min(...scales);
  const final = scales.at(-1) ?? 1;
  assert(minimum >= 0.9998, `${label}出现了与惯性方向相反的预压缩跳变：${JSON.stringify(scales)}`);
  assert(peak >= minPeak, `${label}缺少可感知的惯性越界：${JSON.stringify(scales)}`);
  assert(peak <= maxPeak, `${label}回弹幅度过大：${JSON.stringify(scales)}`);
  assert(Math.abs(final - 1) <= finalDelta, `${label}没有平滑收敛：${JSON.stringify(scales)}`);
};

const startFrameProbe = async (key, duration) => page.evaluate(({ probeKey, probeDuration }) => {
  window.__jzoneFrameProbes ??= {};
  const samples = [];
  let previous = performance.now();
  const started = previous;
  const tick = (now) => {
    samples.push(now - previous);
    previous = now;
    if (now - started < probeDuration) requestAnimationFrame(tick);
    else window.__jzoneFrameProbes[probeKey] = samples;
  };
  requestAnimationFrame(tick);
}, { probeKey: key, probeDuration: duration });

const readFrameProbe = async (key) => page.evaluate((probeKey) => {
  const values = [...(window.__jzoneFrameProbes?.[probeKey] ?? [])].sort((a, b) => a - b);
  if (!values.length) return { frames: 0, p95: 0, max: 0, over50ms: 0 };
  return {
    frames: values.length,
    p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
    max: values.at(-1),
    over50ms: values.filter((value) => value > 50).length,
  };
}, key);

try {
  await mkdir('output/playwright', { recursive: true });
  await login();
  consoleErrors.length = 0;
  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  const songRows = page.locator('[data-library-song="true"]:visible');
  await songRows.first().waitFor({ state: 'visible', timeout: 15000 });
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
  await page.waitForTimeout(760);

  await startFrameProbe('opening', 700);
  const openingFirstFrame = await clickAndCaptureOpeningFrame();
  await page.getByTestId('player-transition-shell').waitFor({ state: 'attached', timeout: 2000 });
  const opening = await captureTimeline('opening', [20, 80, 160, 280, 560, 620, 760, 900]);
  await page.waitForTimeout(100);
  const openingFrames = await readFrameProbe('opening');
  assert(openingFirstFrame && openingFirstFrame.top > 100, `播放器没有从 Mini 边界开始：${JSON.stringify(openingFirstFrame)}`);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(opening, key, 'decrease');
  const openingFinal = opening.at(-1);
  assert(Object.values(openingFinal.insets).every((value) => value <= 1), `播放器没有铺满视窗：${JSON.stringify(openingFinal.insets)}`);
  assert(opening.every((sample) => sample.miniFilter?.includes('url(')), '展开期间 Mini 播放器材质没有持续保活');
  assertSoftSettle(
    opening.slice(4).map((sample) => sample.coverSettleTransform),
    '全屏封面落地',
  );
  for (const key of ['cover', 'title', 'artist']) {
    assert(opening.slice(0, -1).some((sample) => sample[key].length >= 2), `${key} 缺少共享源/目标双端`);
    assert(
      openingFirstFrame?.sharedTransforms[key] !== 'none'
        || opening.slice(0, -1).some((sample) => sample[key].some((item) => item.transform !== 'none')),
      `${key} 没有执行共享几何插值：${JSON.stringify(opening.map((sample) => sample[key]))}`,
    );
  }
  assert(
    opening[0].secondaryOpacity < opening[3].secondaryOpacity,
    `控制项没有随容器展开分阶段显现：${opening.map((sample) => sample.secondaryOpacity)}`,
  );

  const artworkBefore = await page.locator('[data-testid="player-artwork-layer"] img').last().getAttribute('src');
  await page.getByTestId('player-next-song').click();
  await page.waitForTimeout(45);
  const artworkDuring = await page.locator('[data-testid="player-artwork-layer"]').count();
  await page.waitForTimeout(470);
  const artworkAfterLayers = await page.locator('[data-testid="player-artwork-layer"]').count();
  const artworkAfter = await page.locator('[data-testid="player-artwork-layer"] img').last().getAttribute('src');
  assert(artworkAfterLayers === 1, `换曲结束后唱片层未收敛：${artworkAfterLayers}`);
  if (artworkBefore !== artworkAfter) {
    assert(artworkDuring >= 2, `换曲时没有保留新旧唱片交接层：${artworkDuring}`);
  }

  const playerToggle = page.getByTestId('player-toggle-play');
  if ((await playerToggle.getAttribute('aria-label')) === '暂停') await playerToggle.click();
  await page.waitForFunction(() => {
    const shadow = document.querySelector('[data-testid="player-cover-soft-shadow"]');
    if (!shadow) return false;
    const style = getComputedStyle(shadow);
    const blur = Number.parseFloat(style.filter.match(/blur\(([-\d.]+)px\)/)?.[1] ?? '0');
    return blur >= 35 && Number(style.opacity) <= 0.45;
  }, null, { timeout: 1500 });
  const pausedCover = await page.evaluate(() => {
    const visual = document.querySelector('[data-testid="player-cover-visual"]');
    const image = document.querySelector('[data-testid="player-cover-image"]');
    const shadow = document.querySelector('[data-testid="player-cover-soft-shadow"]');
    return {
      visualTransform: visual ? getComputedStyle(visual).transform : null,
      imageShadow: image ? getComputedStyle(image).boxShadow : null,
      shadowFilter: shadow ? getComputedStyle(shadow).filter : null,
      shadowOpacity: shadow ? Number(getComputedStyle(shadow).opacity) : null,
    };
  });
  assert(pausedCover.visualTransform !== 'none', `暂停时封面没有缩小：${JSON.stringify(pausedCover)}`);
  assert(Number.parseFloat(pausedCover.shadowFilter?.match(/blur\(([-\d.]+)px\)/)?.[1] ?? '0') >= 35, `暂停封面缺少独立柔化阴影：${JSON.stringify(pausedCover)}`);
  assert((pausedCover.shadowOpacity ?? 1) <= 0.45, `暂停封面阴影仍然过硬：${JSON.stringify(pausedCover)}`);
  await page.screenshot({ path: `output/playwright/player-paused-soft-shadow-${viewportWidth}x${viewportHeight}.png` });

  const readPlayerMenu = async () => page.evaluate(() => {
    const menu = document.querySelector('.liquid-context-menu-panel');
    const content = menu?.querySelector(':scope > div.relative.z-10');
    const material = menu?.querySelector('[data-liquid-material]');
    const rim = menu?.querySelector('[data-liquid-motion-rim]');
    const shell = menu?.querySelector('[data-liquid-motion-shell]');
    const glass = menu?.querySelector('.liquid-tab-f-glass');
    return {
      exists: Boolean(menu),
      buttonCount: menu?.querySelectorAll('button').length ?? 0,
      contentOpacity: content ? Number(getComputedStyle(content).opacity) : 0,
      contentFilter: content ? getComputedStyle(content).filter : null,
      materialOpacity: material ? Number(getComputedStyle(material).opacity) : 0,
      rimOpacity: rim ? Number(getComputedStyle(rim).opacity) : 0,
      rimFilter: rim ? getComputedStyle(rim).filter : null,
      shellOpacity: shell ? Number(getComputedStyle(shell).opacity) : 0,
      shellLayerOpacity: shell ? getComputedStyle(shell).getPropertyValue('--lg-motion-layer-opacity').trim() : null,
      glassFilter: glass ? getComputedStyle(glass).backdropFilter : null,
    };
  });
  const requestPlayerMenuClose = async () => page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });

  await page.getByTestId('player-more-menu').click();
  await page.waitForTimeout(35);
  const playerMenuFirstFrame = await readPlayerMenu();
  assert(playerMenuFirstFrame.contentOpacity < 0.82 && playerMenuFirstFrame.contentFilter?.includes('blur('), `播放页 Mini 菜单首帧内容没有参与模糊入场：${JSON.stringify(playerMenuFirstFrame)}`);
  assert(playerMenuFirstFrame.materialOpacity < 0.82 && playerMenuFirstFrame.rimOpacity < 0.82, `播放页 Mini 菜单首帧材质或高光提前完成：${JSON.stringify(playerMenuFirstFrame)}`);
  assert(Math.abs(playerMenuFirstFrame.materialOpacity - playerMenuFirstFrame.rimOpacity) < 0.18, `播放页 Mini 菜单首帧材质与高光不同步：${JSON.stringify(playerMenuFirstFrame)}`);
  await page.waitForTimeout(55);
  const playerMenuFirstOpen = await readPlayerMenu();
  assert(playerMenuFirstOpen.buttonCount >= 5 && playerMenuFirstOpen.contentOpacity > 0.2, `播放页 Mini 菜单首次打开缺少内容：${JSON.stringify(playerMenuFirstOpen)}`);
  assert(playerMenuFirstOpen.glassFilter?.includes('url('), `播放页 Mini 菜单首次打开缺少材质：${JSON.stringify(playerMenuFirstOpen)}`);
  await requestPlayerMenuClose();
  await page.waitForTimeout(170);
  const playerMenuClosing = await readPlayerMenu();
  assert(playerMenuClosing.contentOpacity > 0.04 && playerMenuClosing.materialOpacity > 0.04, `播放页 Mini 菜单退出中途已有图层提前消失：${JSON.stringify(playerMenuClosing)}`);
  assert(playerMenuClosing.contentOpacity < 0.88 && playerMenuClosing.materialOpacity < 0.88 && playerMenuClosing.rimOpacity < 0.88, `播放页 Mini 菜单退出中途有图层尚未开始淡出：${JSON.stringify(playerMenuClosing)}`);
  assert(Math.abs(playerMenuClosing.materialOpacity - playerMenuClosing.rimOpacity) < 0.18, `播放页 Mini 菜单退出时材质与高光不同步：${JSON.stringify(playerMenuClosing)}`);
  await page.locator('.liquid-context-menu-panel').waitFor({ state: 'detached', timeout: 900 });

  await page.getByTestId('player-more-menu').click();
  await page.waitForTimeout(35);
  const playerMenuSlowReopenFirstFrame = await readPlayerMenu();
  assert(playerMenuSlowReopenFirstFrame.contentOpacity < 0.82 && playerMenuSlowReopenFirstFrame.contentFilter?.includes('blur('), `播放页 Mini 菜单慢速重开首帧跳过内容动画：${JSON.stringify(playerMenuSlowReopenFirstFrame)}`);
  assert(playerMenuSlowReopenFirstFrame.materialOpacity < 0.82 && playerMenuSlowReopenFirstFrame.rimOpacity < 0.82, `播放页 Mini 菜单慢速重开首帧材质不同步：${JSON.stringify(playerMenuSlowReopenFirstFrame)}`);
  await page.waitForTimeout(55);
  const playerMenuSlowReopen = await readPlayerMenu();
  assert(playerMenuSlowReopen.buttonCount >= 5 && playerMenuSlowReopen.contentOpacity > 0.2, `播放页 Mini 菜单慢速重开后内容为空：${JSON.stringify(playerMenuSlowReopen)}`);
  await requestPlayerMenuClose();
  await page.waitForTimeout(80);
  await page.getByTestId('player-more-menu').click();
  await page.waitForTimeout(35);
  const playerMenuRapidReopenFirstFrame = await readPlayerMenu();
  assert(playerMenuRapidReopenFirstFrame.contentOpacity < 0.82 && playerMenuRapidReopenFirstFrame.contentFilter?.includes('blur('), `播放页 Mini 菜单退出中断后文字图标直接出现：${JSON.stringify(playerMenuRapidReopenFirstFrame)}`);
  assert(playerMenuRapidReopenFirstFrame.materialOpacity < 0.82 && playerMenuRapidReopenFirstFrame.rimOpacity < 0.82, `播放页 Mini 菜单退出中断后材质或高光提前完成：${JSON.stringify(playerMenuRapidReopenFirstFrame)}`);
  assert(Math.abs(playerMenuRapidReopenFirstFrame.materialOpacity - playerMenuRapidReopenFirstFrame.rimOpacity) < 0.18, `播放页 Mini 菜单退出中断后材质与高光不同步：${JSON.stringify(playerMenuRapidReopenFirstFrame)}`);
  await page.waitForTimeout(65);
  const playerMenuRapidReopen = await readPlayerMenu();
  assert(playerMenuRapidReopen.buttonCount >= 5 && playerMenuRapidReopen.contentOpacity > 0.2, `播放页 Mini 菜单快速重开后内容为空：${JSON.stringify(playerMenuRapidReopen)}`);
  assert(playerMenuRapidReopen.glassFilter?.includes('url('), `播放页 Mini 菜单快速重开后材质丢失：${JSON.stringify(playerMenuRapidReopen)}`);
  await requestPlayerMenuClose();
  await page.locator('.liquid-context-menu-panel').waitFor({ state: 'detached', timeout: 900 });

  await startFrameProbe('comments-open', 720);
  await page.getByTestId('player-open-comments').click();
  await page.getByTestId('comments-sheet').waitFor({ state: 'visible', timeout: 2000 });
  await page.waitForTimeout(70);
  const commentsEnterTransform = await page.getByTestId('comments-sheet-panel').evaluate((element) => getComputedStyle(element).transform);
  assert(commentsEnterTransform !== 'none', `评论区没有执行二级页面进场：${commentsEnterTransform}`);
  await page.waitForTimeout(650);
  const commentsOpenFrames = await readFrameProbe('comments-open');
  assertFrameBudget(commentsOpenFrames, '评论区打开');
  await startFrameProbe('comments-close', 520);
  await page.getByTestId('comments-sheet-close').click();
  await page.waitForTimeout(40);
  assert((await page.getByTestId('comments-sheet').count()) === 1, '评论区关闭时没有保留退出动画生命周期');
  const commentsExitTransform = await page.getByTestId('comments-sheet-panel').evaluate((element) => getComputedStyle(element).transform);
  assert(commentsExitTransform !== 'none', `评论区没有执行返回动画：${commentsExitTransform}`);
  await page.waitForTimeout(520);
  const commentsCloseFrames = await readFrameProbe('comments-close');
  assertFrameBudget(commentsCloseFrames, '评论区关闭');
  assert((await page.getByTestId('comments-sheet').count()) === 0, '评论区退出动画结束后仍残留');

  await startFrameProbe('queue-open', 720);
  await page.getByTestId('player-open-queue').click();
  await page.getByTestId('player-queue-sheet').waitFor({ state: 'visible', timeout: 2000 });
  await page.waitForTimeout(70);
  const queueEnterTransform = await page.getByTestId('player-queue-panel').evaluate((element) => getComputedStyle(element).transform);
  assert(queueEnterTransform !== 'none', `待播清单没有执行二级页面进场：${queueEnterTransform}`);
  await page.waitForTimeout(650);
  const queueOpenFrames = await readFrameProbe('queue-open');
  assertFrameBudget(queueOpenFrames, '待播清单打开');
  await startFrameProbe('queue-close', 520);
  await page.getByTestId('player-queue-close').click();
  await page.waitForTimeout(40);
  assert((await page.getByTestId('player-queue-sheet').count()) === 1, '待播清单关闭时没有保留退出动画生命周期');
  const queueExitTransform = await page.getByTestId('player-queue-panel').evaluate((element) => getComputedStyle(element).transform);
  assert(queueExitTransform !== 'none', `待播清单没有执行返回动画：${queueExitTransform}`);
  await page.waitForTimeout(520);
  const queueCloseFrames = await readFrameProbe('queue-close');
  assertFrameBudget(queueCloseFrames, '待播清单关闭');
  assert((await page.getByTestId('player-queue-sheet').count()) === 0, '待播清单退出动画结束后仍残留');

  await page.getByTestId('player-view-close').click();
  const closing = await captureTimeline('closing', [20, 80, 160, 240, 300, 340, 400, 520, 760]);
  const closingShellSamples = closing.filter((sample) => sample.exists);
  for (const key of ['top', 'right', 'bottom', 'left']) assertMonotonic(closingShellSamples, key, 'increase');
  assert(closingShellSamples.some((sample) => sample.cover.length >= 2), '关闭时封面缺少反向共享双端');
  assert(closing.every((sample) => sample.miniFilter?.includes('url(')), '收拢期间 Mini 播放器折射曾中断');
  const closingHandoff = closingShellSamples.at(-1);
  assert(closingHandoff.shellBackgroundColor === 'rgba(0, 0, 0, 0)', '收拢外壳仍有黑色实底');
  assert(closingHandoff.backgroundOpacity < 0.12, `收拢末段播放器背景没有让出 Mini：${closingHandoff.backgroundOpacity}`);
  const closingTitleTarget = closingHandoff.title.find((item) => item.transform !== 'none');
  const closingTitleScale = readMatrixScale(closingTitleTarget?.transform);
  assert(Math.abs(closingTitleScale.x - closingTitleScale.y) < 0.03, `收拢标题发生非等比压缩：${JSON.stringify(closingTitleScale)}`);
  assert((closingTitleTarget?.opacity ?? 1) < 0.25, `收拢标题没有在交接区淡出：${closingTitleTarget?.opacity}`);
  const miniSettleSamples = closing.filter((sample) => sample.time >= 240);
  const visibleSettle = miniSettleSamples.find((sample) => readMatrixScale(sample.miniSettleTransform).x > 1.003);
  assert(visibleSettle, `Mini 整体回弹没有在收拢交接阶段启动：${JSON.stringify(miniSettleSamples.map((sample) => ({ time: sample.time, exists: sample.exists, transform: sample.miniSettleTransform })))}`);
  assert(miniSettleSamples.every((sample) => sample.miniFilter?.includes('url(')), 'Mini 整体回弹期间背景折射中断');
  assertSoftSettle(
    miniSettleSamples.map((sample) => sample.miniSettleTransform),
    'Mini 整体落地',
    { minPeak: 1.003, maxPeak: 1.014, finalDelta: 0.002 },
  );
  await page.waitForTimeout(80);
  assert((await page.getByTestId('player-transition-shell').count()) === 0, '关闭完成后全屏播放器仍残留');
  assert(await page.getByTestId('mini-player').evaluate((element) => document.activeElement === element), '关闭后焦点没有回到 Mini 播放器');

  const rapidReversals = [];
  await startFrameProbe('rapid', 2100);
  for (let round = 0; round < 5; round += 1) {
    await page.getByTestId('mini-player').evaluate((element) => element.click());
    await page.waitForTimeout(110);
    const beforeClose = await sampleTransition(round, 'rapid-before-close', '[data-testid="player-view-close"]');
    await page.waitForTimeout(32);
    const afterClose = await sampleTransition(round, 'rapid-after-close');
    assert(
      afterClose.insets.top >= beforeClose.insets.top - 18,
      `快速关闭时裁剪边界向错误方向闪跳：${JSON.stringify({ beforeClose, afterClose })}`,
    );
    await page.waitForTimeout(70);
    const beforeReopen = await sampleTransition(round, 'rapid-before-reopen', '[data-testid="mini-player"]');
    await page.waitForTimeout(32);
    const afterReopen = await sampleTransition(round, 'rapid-after-reopen');
    assert(
      afterReopen.insets.top <= beforeReopen.insets.top + 18,
      `快速重开时裁剪边界向错误方向闪跳：${JSON.stringify({ beforeReopen, afterReopen })}`,
    );
    assert(
      [beforeClose, afterClose, beforeReopen, afterReopen].every((sample) => sample.miniFilter?.includes('url(')),
      `快速反向第 ${round + 1} 轮 Mini 折射中断`,
    );
    rapidReversals.push({ round: round + 1, beforeClose, afterClose, beforeReopen, afterReopen });
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(560);
  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(450);
  assert((await page.getByTestId('player-transition-shell').count()) === 0, '快速反向测试结束后全屏播放器仍残留');
  await page.waitForTimeout(80);
  const sampledRapidFrames = await readFrameProbe('rapid');
  assertFrameBudget(openingFrames, '正常展开');

  await startFrameProbe('rapid-performance', 1800);
  await page.evaluate(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    for (let round = 0; round < 5; round += 1) {
      document.querySelector('[data-testid="mini-player"]')?.click();
      await wait(110);
      document.querySelector('[data-testid="player-view-close"]')?.click();
      await wait(102);
      document.querySelector('[data-testid="mini-player"]')?.click();
      await wait(102);
    }
    await wait(230);
  });
  await page.waitForTimeout(80);
  const rapidFrames = await readFrameProbe('rapid-performance');
  assertFrameBudget(rapidFrames, '快速反向');
  await page.getByTestId('player-view-close').click();
  await page.waitForTimeout(450);

  const persistentRouteLayers = await page.evaluate(async () => {
    document.querySelector('[data-testid="bottom-nav-home"]')?.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const miniLayer = document.querySelector('[data-testid="mini-player-layer"]');
    const mini = document.querySelector('[data-testid="mini-player"]');
    const bottomNav = document.querySelector('[data-testid="bottom-nav-layer"]');
    const miniGlass = mini?.querySelector('.liquid-tab-f-glass');
    const navGlass = bottomNav?.querySelector('.liquid-tab-f-glass');
    const routeStage = document.querySelector('.jzone-route-stage');
    const read = (element) => element ? {
      opacity: Number(getComputedStyle(element).opacity),
      visibility: getComputedStyle(element).visibility,
      display: getComputedStyle(element).display,
      viewTransitionName: getComputedStyle(element).viewTransitionName,
      rect: element.getBoundingClientRect().toJSON(),
    } : null;
    return {
      miniLayer: read(miniLayer),
      mini: read(mini),
      bottomNav: read(bottomNav),
      miniLayerCount: document.querySelectorAll('[data-testid="mini-player-layer"]').length,
      bottomNavCount: document.querySelectorAll('[data-testid="bottom-nav-layer"]').length,
      miniFilter: miniGlass ? getComputedStyle(miniGlass).backdropFilter : null,
      navFilter: navGlass ? getComputedStyle(navGlass).backdropFilter : null,
      routeOpacity: routeStage ? Number(getComputedStyle(routeStage).opacity) : null,
      routeTransform: routeStage ? getComputedStyle(routeStage).transform : null,
    };
  });
  assert((persistentRouteLayers.routeOpacity ?? 1) < 0.99 || persistentRouteLayers.routeTransform !== 'none', `播放器持久层测试时一级路由动画未运行：${JSON.stringify(persistentRouteLayers)}`);
  assert(persistentRouteLayers.miniLayerCount === 1 && persistentRouteLayers.bottomNavCount === 1, `路由切换时生成了重复 Mini/Tab：${JSON.stringify(persistentRouteLayers)}`);
  assert((persistentRouteLayers.mini?.rect.height ?? 0) > 40 && persistentRouteLayers.mini?.opacity === 1 && persistentRouteLayers.mini?.visibility === 'visible', `路由转场期间播放中的 Mini 播放器消失：${JSON.stringify(persistentRouteLayers)}`);
  assert((persistentRouteLayers.bottomNav?.rect.height ?? 0) > 50 && persistentRouteLayers.bottomNav?.opacity === 1 && persistentRouteLayers.bottomNav?.visibility === 'visible', `路由转场期间底部 Tab 消失：${JSON.stringify(persistentRouteLayers)}`);
  assert(persistentRouteLayers.miniFilter?.includes('url(') && persistentRouteLayers.navFilter?.includes('url('), `路由转场期间 Mini/Tab 折射材质丢失：${JSON.stringify(persistentRouteLayers)}`);
  await page.waitForTimeout(320);

  if (process.env.JZONE_CAPTURE_FRAMES === '1') {
    for (const offset of [100, 260, 460]) {
      await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
      await page.waitForTimeout(offset);
      await page.screenshot({ path: `output/playwright/player-curve-${offset}ms.png` });
      await page.waitForTimeout(Math.max(0, 780 - offset));
      await page.getByTestId('player-view-close').click();
      await page.waitForTimeout(560);
    }
    await page.getByTestId('mini-player').click({ position: { x: 180, y: 28 } });
    await page.waitForTimeout(700);
    await page.getByTestId('player-view-close').click();
    let previousOffset = 0;
    for (const offset of [260, 330, 410, 470, 600]) {
      await page.waitForTimeout(offset - previousOffset);
      await page.screenshot({ path: `output/playwright/player-handoff-${offset}ms.png` });
      previousOffset = offset;
    }
  }

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `播放器转场产生控制台错误：${JSON.stringify(relevantErrors)}`);
  const secondarySheets = {
    commentsEnterTransform,
    commentsExitTransform,
    queueEnterTransform,
    queueExitTransform,
    commentsOpenFrames,
    commentsCloseFrames,
    queueOpenFrames,
    queueCloseFrames,
  };
  const result = { ok: true, viewport: `${viewportWidth}x${viewportHeight}`, opening, closing, playerMenuFirstOpen, playerMenuSlowReopen, playerMenuRapidReopen, secondarySheets, rapidReversals, persistentRouteLayers, openingFrames, sampledRapidFrames, rapidFrames, consoleErrors };
  console.log(JSON.stringify(process.env.JZONE_COMPACT === '1' ? {
    ok: result.ok,
    viewport: result.viewport,
    openingInsets: opening.map((sample) => ({ time: sample.time, ...sample.insets })),
    openingSecondaryOpacity: opening.map((sample) => ({ time: sample.time, opacity: sample.secondaryOpacity })),
    openingBackgroundOpacity: opening.map((sample) => ({ time: sample.time, opacity: sample.backgroundOpacity })),
    closingInsets: closing.map((sample) => ({ time: sample.time, exists: sample.exists, ...(sample.insets ?? {}) })),
    sharedParts: ['cover', 'title', 'artist'],
    playerMenuReopen: {
      first: playerMenuFirstOpen,
      slow: playerMenuSlowReopen,
      rapid: playerMenuRapidReopen,
    },
    secondarySheets,
    rapidReversalRounds: rapidReversals.length,
    openingFrames,
    sampledRapidFrames,
    rapidFrames,
    consoleErrors,
  } : result, null, 2));
} finally {
  await browser.close();
}
