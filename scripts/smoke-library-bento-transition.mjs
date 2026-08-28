import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const chromePath = process.env.JZONE_CHROME_PATH || undefined;
const headless = process.env.JZONE_HEADFUL !== '1';
const launchOptions = chromePath ? { headless, executablePath: chromePath } : { headless };
const itemIds = Array.from({ length: 12 }, (_, index) => `bento-smoke-${index + 1}`);
const expectedOrder = [...itemIds].reverse();
const expectedLargeIds = [expectedOrder[0], expectedOrder[2], expectedOrder[5]];
const storageKey = 'jzone.library.bento.v2:bento-smoke-user:songs:all';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sampleFrames = (page, frameCount = 60) => page.evaluate(async (count) => {
  const samples = [];
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const view = document.querySelector('[data-library-view="canvas"]');
    const canvas = document.querySelector('[data-bento-canvas]');
    const sheen = document.querySelector('[data-testid="library-bento-transition-sheen"]');
    const tiles = [...document.querySelectorAll('[data-bento-item]')];
    const style = view ? getComputedStyle(view) : null;
    const sheenStyle = sheen ? getComputedStyle(sheen) : null;
    samples.push({
      frame,
      canvasCount: document.querySelectorAll('[data-bento-canvas]').length,
      listCount: document.querySelectorAll('[data-library-view="list"]').length,
      opacity: style ? Number(style.opacity) : null,
      clipPath: style?.clipPath ?? null,
      sheenOpacity: sheenStyle ? Number(sheenStyle.opacity) : null,
      scale: canvas ? Number(canvas.getAttribute('data-bento-scale')) : null,
      layout: tiles.map((tile) => ({
        id: tile.getAttribute('data-bento-item'),
        size: tile.getAttribute('data-bento-size'),
        left: tile.style.left,
        top: tile.style.top,
        width: tile.style.width,
        height: tile.style.height,
      })),
    });
  }
  return samples;
}, frameCount);

const layoutSignature = (sample) => JSON.stringify(sample.layout);

const countVisibleSegments = (samples, key, threshold) => {
  let segments = 0;
  let visible = false;
  for (const sample of samples) {
    const nextVisible = Number(sample[key] ?? 0) > threshold;
    if (nextVisible && !visible) segments += 1;
    visible = nextVisible;
  }
  return segments;
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.route('**/index.tsx*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOMClient from '/node_modules/.vite/deps/react-dom_client.js';
    import '/index.css';
    import { Library } from '/pages/Library.tsx';
    ReactDOMClient.createRoot(document.getElementById('root')).render(React.createElement(Library));
  `,
}));

await page.route('**/store.tsx*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `
    const songs = ${JSON.stringify(itemIds.map((id, index) => ({
      id,
      title: `专项曲目 ${index + 1}`,
      artist: `专项艺人 ${index + 1}`,
      coverUrl: '',
      audioUrl: '',
      duration: 180,
      uploadedBy: 'Me',
      addedAt: 1700000000000 + index,
      ownerId: 'bento-smoke-user',
      isPublic: true,
      visibility: 'public',
    })))};
    const value = {
      songs,
      playContext: () => {},
      deleteSong: async () => {},
      playerState: { currentSongId: null, isPlaying: false },
      favoriteSongIds: [],
    };
    export const useStore = () => value;
  `,
}));

await page.route('**/auth.tsx*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `
    const user = { id: 'bento-smoke-user', email: 'bento-smoke@example.invalid' };
    export const useAuth = () => ({ user, status: 'signed_in' });
  `,
}));

await page.route('**/supabaseApi.ts*', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: `
    export const supabaseApi = {
      isEnabled: () => false,
      fetchVisibleCollections: async () => [],
      fetchCollaboratingSongIds: async () => [],
    };
  `,
}));

await page.addInitScript(({ key, order, largeIds }) => {
  localStorage.setItem(key, JSON.stringify({ order, largeIds }));
  window.__libraryBentoSmoke = { mounts: 0, removals: 0, reads: [], maxCanvasCount: 0 };
  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function patchedGetItem(storageItemKey) {
    if (typeof storageItemKey === 'string' && storageItemKey.startsWith('jzone.library.bento.v2:')) {
      window.__libraryBentoSmoke.reads.push({ key: storageItemKey, at: performance.now() });
    }
    return originalGetItem.call(this, storageItemKey);
  };
  const countCanvasNodes = (node) => {
    if (!(node instanceof Element)) return 0;
    return Number(node.matches('[data-bento-canvas]')) + node.querySelectorAll('[data-bento-canvas]').length;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) window.__libraryBentoSmoke.mounts += countCanvasNodes(node);
      for (const node of record.removedNodes) window.__libraryBentoSmoke.removals += countCanvasNodes(node);
    }
    window.__libraryBentoSmoke.maxCanvasCount = Math.max(
      window.__libraryBentoSmoke.maxCanvasCount,
      document.querySelectorAll('[data-bento-canvas]').length,
    );
  });
  observer.observe(document, { childList: true, subtree: true });
  window.__libraryBentoSmoke.observer = observer;
}, { key: storageKey, order: expectedOrder, largeIds: expectedLargeIds });

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('资料库').first().waitFor({ timeout: 10000 });
  await page.evaluate(() => document.querySelector('[data-testid="library-view-canvas"]')?.click());

  const firstEntryFrames = await sampleFrames(page, 60);
  const firstLayoutFrame = firstEntryFrames.find((sample) => sample.layout.length > 0);
  assert(firstLayoutFrame, 'Bento 首次入场没有可采样布局');
  assert(
    firstLayoutFrame.layout.map((item) => item.id).join('|') === expectedOrder.join('|'),
    `保存顺序未在首个可见帧恢复：${JSON.stringify({ expectedOrder, first: firstLayoutFrame.layout })}`,
  );
  assert(
    firstLayoutFrame.layout.filter((item) => item.size === 'large').map((item) => item.id).join('|') === expectedLargeIds.join('|'),
    `保存尺寸未在首个可见帧恢复：${JSON.stringify({ expectedLargeIds, first: firstLayoutFrame.layout })}`,
  );
  const firstLayoutSignature = layoutSignature(firstLayoutFrame);
  assert(
    firstEntryFrames.filter((sample) => sample.layout.length > 0).every((sample) => layoutSignature(sample) === firstLayoutSignature),
    'Bento 入场后出现二次布局跳变',
  );
  assert(firstEntryFrames[0].scale < 0.8, `Bento 首帧仍从默认缩放二次适配：${firstEntryFrames[0].scale}`);
  assert(countVisibleSegments(firstEntryFrames, 'sheenOpacity', 0.04) === 1, 'Bento 首次入场扫光次数不唯一');

  const readCountAfterEntry = await page.evaluate((key) => (
    window.__libraryBentoSmoke.reads.filter((entry) => entry.key === key).length
  ), storageKey);
  assert(readCountAfterEntry === 1, `保存布局发生重复水合读取：${readCountAfterEntry}`);

  await page.evaluate(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    for (let round = 0; round < 10; round += 1) {
      document.querySelector('[data-testid="library-view-list"]')?.click();
      await wait(24);
      document.querySelector('[data-testid="library-view-canvas"]')?.click();
      await wait(24);
    }
  });
  const rapidFinalFrames = await sampleFrames(page, 65);
  const settled = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('[data-bento-canvas]').length,
    listCount: document.querySelectorAll('[data-library-view="list"]').length,
    canvasHidden: document.querySelector('[data-library-view="canvas"]')?.getAttribute('aria-hidden'),
    listHidden: document.querySelector('[data-library-view="list"]')?.getAttribute('aria-hidden'),
    canvasState: document.querySelector('[data-library-view="canvas"]')?.getAttribute('data-library-transition-state'),
    metrics: {
      mounts: window.__libraryBentoSmoke.mounts,
      removals: window.__libraryBentoSmoke.removals,
      maxCanvasCount: window.__libraryBentoSmoke.maxCanvasCount,
    },
  }));
  assert(settled.canvasCount === 1 && settled.listCount === 1, `快速切换后视图节点不唯一：${JSON.stringify(settled)}`);
  assert(settled.canvasHidden === 'false' && settled.listHidden === 'true' && settled.canvasState === 'active', `最终状态未服从最后一次 Bento 点击：${JSON.stringify(settled)}`);
  assert(settled.metrics.mounts === 1 && settled.metrics.removals === 0, `Bento Canvas 快切期间发生重挂载：${JSON.stringify(settled.metrics)}`);
  assert(settled.metrics.maxCanvasCount === 1, `Bento Canvas 快切期间出现重复实例：${JSON.stringify(settled.metrics)}`);
  assert(countVisibleSegments(rapidFinalFrames, 'sheenOpacity', 0.04) === 1, '最后一次 Bento 入场扫光次数不唯一');
  const rapidLayouts = rapidFinalFrames.filter((sample) => sample.layout.length > 0);
  assert(rapidLayouts.every((sample) => layoutSignature(sample) === layoutSignature(rapidLayouts[0])), '快速切换结束后出现二次布局跳变');

  await page.getByTestId('library-view-list').click();
  await page.waitForTimeout(360);
  const listFinal = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('[data-bento-canvas]').length,
    canvasHidden: document.querySelector('[data-library-view="canvas"]')?.getAttribute('aria-hidden'),
    listHidden: document.querySelector('[data-library-view="list"]')?.getAttribute('aria-hidden'),
  }));
  assert(listFinal.canvasCount === 1 && listFinal.canvasHidden === 'true' && listFinal.listHidden === 'false', `最终状态未服从最后一次列表点击：${JSON.stringify(listFinal)}`);

  await page.getByTestId('library-view-canvas').click();
  await page.waitForTimeout(720);
  const panTile = page.locator('[data-bento-item]').first();
  const panBefore = await panTile.boundingBox();
  const canvasBox = await page.locator('[data-bento-canvas]').boundingBox();
  assert(panBefore && canvasBox, 'Bento 拖拽验收缺少画布或卡片几何');
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height - 90);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2 + 42, canvasBox.y + canvasBox.height - 124, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(160);
  const panAfter = await panTile.boundingBox();
  assert(
    panAfter && Math.hypot(panAfter.x - panBefore.x, panAfter.y - panBefore.y) > 18,
    `Bento 拖拽能力失效：${JSON.stringify({ panBefore, panAfter })}`,
  );

  const scaleBefore = Number(await page.locator('[data-bento-canvas]').getAttribute('data-bento-scale'));
  await page.locator('[data-bento-canvas]').hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -40);
  await page.keyboard.up('Control');
  await page.waitForTimeout(120);
  const scaleAfter = Number(await page.locator('[data-bento-canvas]').getAttribute('data-bento-scale'));
  assert(scaleAfter > scaleBefore, `Bento 缩放能力失效：${JSON.stringify({ scaleBefore, scaleAfter })}`);

  await page.getByRole('button', { name: '调整 Bento 布局' }).click();
  const firstTile = page.locator('[data-bento-item]').first();
  const sizeBefore = await firstTile.getAttribute('data-bento-size');
  await firstTile.getByRole('button').click();
  await page.waitForTimeout(80);
  const sizeAfter = await firstTile.getAttribute('data-bento-size');
  assert(sizeBefore !== sizeAfter, `Bento 编辑/尺寸切换能力失效：${JSON.stringify({ sizeBefore, sizeAfter })}`);

  const relevantErrors = consoleErrors.filter((message) => !/Failed to load resource.*404/i.test(message));
  assert(relevantErrors.length === 0, `Bento 快切产生控制台错误：${JSON.stringify(relevantErrors)}`);
  await page.evaluate(() => window.__libraryBentoSmoke.observer.disconnect());

  console.log(JSON.stringify({
    ok: true,
    rounds: 10,
    firstVisibleFrame: firstLayoutFrame,
    storageReads: readCountAfterEntry,
    transitionMetrics: settled.metrics,
    finalStates: { canvas: settled, list: listFinal },
    capabilities: { panBefore, panAfter, scaleBefore, scaleAfter, sizeBefore, sizeAfter },
    consoleErrors: relevantErrors,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    body: (await page.locator('body').innerText().catch(() => '')).slice(0, 1200),
    consoleErrors,
    pageErrors,
  }, null, 2));
  throw error;
} finally {
  await browser.close();
}
