import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const pageErrors = [];
const lyricsRows = new Map([
  ['smoke-upload-song-a', {
    song_id: 'smoke-upload-song-a',
    format: 'lrc',
    source: 'editor',
    raw_content: '[jzone:role:0:duet]\n[00:01.00]已有歌词 A',
    normalized_content: null,
    offset_ms: 0,
    checksum: 'smoke-a',
    version: 1,
    created_at: '2026-08-28T00:00:00.000Z',
    updated_at: '2026-08-28T00:00:00.000Z',
  }],
]);

const describeError = (error) => error instanceof Error ? error.message : String(error);

const fulfillJson = async (route, status, body) => {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
};

const getSongIdFromRequest = (request) => {
  const value = new URL(request.url()).searchParams.get('song_id') || '';
  return value.replace(/^eq\./, '');
};

const mountRoot = async () => {
  await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const mount = document.createElement('div');
    document.body.replaceChildren(mount);
    const root = ReactDOMClient.createRoot(mount);
    window.__jzoneLyricsSmokeRoot = root;
  });
};

const renderWorkbench = async (songs) => {
  await page.evaluate(async (nextSongs) => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { LyricsWorkbenchDialog } = await import('/components/lyrics/LyricsWorkbenchDialog.tsx');
    const { PwaInstallPrompt } = await import('/components/PwaInstallPrompt.tsx');
    window.__jzoneLyricsSmokeRoot.render(React.createElement(React.Fragment, null,
      React.createElement(PwaInstallPrompt),
      React.createElement(LyricsWorkbenchDialog, {
        isOpen: true,
        songs: nextSongs,
        onClose: () => {},
      }),
    ));
  }, songs);
};

const renderUploadEditor = async () => {
  await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { AuthProvider } = await import('/auth.tsx');
    const { AppProvider } = await import('/store.tsx');
    const { UploadEditor } = await import('/components/upload/UploadEditor.tsx');
    window.__jzoneLyricsSmokeRoot.render(
      React.createElement(AuthProvider, null,
        React.createElement(AppProvider, null,
          React.createElement(UploadEditor, {
            variant: 'page',
            defaultArtist: 'Smoke 艺人',
          }),
        ),
      ),
    );
  });
};

const assertFitsViewport = async (label) => {
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    rootWidth: document.querySelector('[data-testid="lyrics-editor"], [data-testid="lyrics-workbench-dialog"]')?.getBoundingClientRect().width ?? null,
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${label} 在 ${layout.viewportWidth}px 下出现横向溢出：${JSON.stringify(layout)}`);
  if (layout.rootWidth !== null) assert.ok(layout.rootWidth <= layout.viewportWidth + 1, `${label} 根节点超过视口：${JSON.stringify(layout)}`);
};

const getFeedbackItems = async () => page.evaluate(async () => {
  const { getFeedbackSnapshot } = await import('/components/feedback/feedback.ts');
  return getFeedbackSnapshot().map(({ kind, message }) => ({ kind, message }));
});

const songs = [
  {
    id: 'smoke-upload-song-a',
    title: '试听歌曲 A',
    artist: 'Smoke 艺人',
    album: '测试专辑',
    coverUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    audioUrl: 'data:audio/mpeg;base64,SUQz',
    duration: 5,
    trimStart: 0,
    trimEnd: 5,
    uploadedBy: 'Me',
    addedAt: Date.now(),
    ownerId: 'smoke-owner',
  },
  {
    id: 'smoke-upload-song-b',
    title: '试听歌曲 B',
    artist: 'Smoke 艺人',
    album: '测试专辑',
    coverUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    audioUrl: 'data:audio/mpeg;base64,SUQz',
    duration: 5,
    trimStart: 0,
    trimEnd: 5,
    uploadedBy: 'Me',
    addedAt: Date.now(),
    ownerId: 'smoke-owner',
  },
];

try {
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/index.tsx', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* 专项 smoke 只挂载歌词上传工作台组件。 */',
  }));
  await page.route('**/auth/v1/session**', (route) => fulfillJson(route, 200, { data: { session: null }, error: null }));
  await page.route('**/auth/v1/user**', (route) => fulfillJson(route, 200, {
    id: 'smoke-owner',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'smoke@example.com',
  }));
  await page.route('**/rest/v1/song_lyrics**', async (route) => {
    const request = route.request();
    const songId = getSongIdFromRequest(request);
    if (request.method() === 'GET') {
      await fulfillJson(route, 200, lyricsRows.get(songId) ?? null);
      return;
    }
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const now = new Date().toISOString();
      const previous = lyricsRows.get(payload.song_id);
      const next = {
        ...payload,
        created_at: previous?.created_at ?? now,
        updated_at: now,
      };
      lyricsRows.set(payload.song_id, next);
      await fulfillJson(route, 200, next);
      return;
    }
    if (request.method() === 'DELETE') {
      lyricsRows.delete(songId);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.continue();
  });

  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  assert.ok(response?.ok(), `本地服务不可用：${baseUrl} 返回 HTTP ${response?.status() ?? '无响应'}`);
  await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });
  await mountRoot();

  await renderWorkbench(songs);
  await page.getByTestId('lyrics-workbench-dialog').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('pwa-install-prompt').waitFor({ state: 'visible', timeout: 10_000 });
  const layerOrder = await page.evaluate(() => {
    const readZIndex = (selector) => {
      const element = document.querySelector(selector);
      return element ? Number.parseInt(getComputedStyle(element).zIndex, 10) : null;
    };
    return {
      workbenchZIndex: readZIndex('[data-testid="lyrics-workbench-dialog"]'),
      pwaZIndex: readZIndex('[data-testid="pwa-install-prompt"]'),
    };
  });
  assert.equal(layerOrder.pwaZIndex, 240, 'PWA 安装提示应保持 z-[240] 层级');
  assert.equal(layerOrder.workbenchZIndex, 280, '歌词工作台应使用与歌曲歌词编辑对话框一致的 z-[280] 层级');
  assert.ok(layerOrder.workbenchZIndex > layerOrder.pwaZIndex, `PWA 提示存在时歌词工作台必须位于其上方：${JSON.stringify(layerOrder)}`);
  await page.getByTestId('lyrics-workbench-loading').waitFor({ state: 'hidden', timeout: 10_000 });
  assert.equal(await page.getByTestId('lyrics-workbench-song').inputValue(), songs[0].id, '工作台默认应选择第一首上传歌曲');
  assert.match(await page.getByTestId('lyrics-workbench-status').textContent(), /已有歌词/, '工作台应加载已有歌词状态');
  assert.equal(await page.getByTestId('lyrics-editor-source').inputValue(), '[00:01.00]已有歌词 A', '工作台应载入歌词正文且不暴露内部角色元数据');
  assert.equal(await page.getByTestId('lyrics-editor-line-role-0').inputValue(), 'duet', '仅依靠后端原文再次打开时也必须恢复对唱角色');
  await assertFitsViewport('歌词工作台');
  await page.setViewportSize({ width: 360, height: 800 });
  await assertFitsViewport('歌词工作台 360px');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByTestId('lyrics-workbench-song').selectOption(songs[1].id);
  await page.getByTestId('lyrics-workbench-loading').waitFor({ state: 'hidden', timeout: 10_000 });
  assert.match(await page.getByTestId('lyrics-workbench-status').textContent(), /尚无已保存歌词/, '切换歌曲后不应沿用上一首的保存状态');
  assert.equal(await page.getByTestId('lyrics-editor-source').inputValue(), '', '切换歌曲后歌词编辑草稿不得串歌');

  await page.getByTestId('lyrics-editor-source').fill('[00:00.50]新歌词 B');
  await page.getByTestId('lyrics-editor-apply-source').click();
  await page.getByTestId('lyrics-editor-line-role-0').selectOption('background');
  await page.getByTestId('lyrics-editor-save').click();
  await page.getByTestId('lyrics-workbench-status').filter({ hasText: '已有歌词' }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(lyricsRows.get(songs[1].id)?.raw_content ?? '', /\[jzone:role:0:background\]/, '保存原文必须携带可再次解析的和声角色');
  assert.equal(lyricsRows.get(songs[1].id)?.normalized_content?.lines?.[0]?.isBackground, true, '保存的标准化内容必须保留和声角色');

  await page.getByTestId('lyrics-workbench-song').selectOption(songs[0].id);
  await page.getByTestId('lyrics-workbench-loading').waitFor({ state: 'hidden', timeout: 10_000 });
  await page.getByTestId('lyrics-workbench-song').selectOption(songs[1].id);
  await page.getByTestId('lyrics-workbench-loading').waitFor({ state: 'hidden', timeout: 10_000 });
  assert.equal(await page.getByTestId('lyrics-editor-line-role-0').inputValue(), 'background', '后端保存后切歌再打开必须恢复和声角色');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('lyrics-workbench-delete').click();
  await page.getByTestId('lyrics-workbench-status').filter({ hasText: '尚无已保存歌词' }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(lyricsRows.has(songs[1].id), false, '删除应清除当前歌曲的歌词记录');
  await assertFitsViewport('歌词工作台切换后');

  await page.evaluate(async () => {
    localStorage.clear();
    const { feedback } = await import('/components/feedback/feedback.ts');
    feedback.clear();
  });
  await renderUploadEditor();
  const audioInput = page.locator('#audio-upload-page');
  await audioInput.waitFor({ state: 'attached', timeout: 10_000 });
  const fileA = { name: 'smoke-a.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio-a'), lastModified: 1700000000000 };
  const fileB = { name: 'smoke-b.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio-b'), lastModified: 1700000000001 };
  await audioInput.setInputFiles([fileA, fileB]);
  await page.getByText('正在编辑', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  const uploadLyricsToggle = page.getByTestId('upload-lyrics-toggle');
  assert.equal(await uploadLyricsToggle.getAttribute('aria-expanded'), 'false', '上传歌词模块默认必须折叠');
  await uploadLyricsToggle.click();
  await page.getByTestId('lyrics-editor').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('lyrics-editor-source').fill('[00:01.00]文件 A 歌词');
  await page.getByTestId('lyrics-editor-apply-source').click();
  await page.getByTestId('lyrics-editor-line-role-0').selectOption('duet');
  await page.getByTestId('lyrics-editor-save').click();
  await page.getByTestId('upload-lyrics-status').filter({ hasText: '已暂存' }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.getByTestId('upload-lyrics-status').getAttribute('data-lyrics-source'), 'upload', '上传流程暂存歌词的来源必须是 upload');
  await page.waitForTimeout(100);
  const storedKeysAfterA = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('jzone:lyrics-draft:v1:')));
  assert.equal(storedKeysAfterA.length, 1, '文件 A 歌词应写入独立草稿键');
  const storedRoleAfterA = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null')?.lines?.[0], storedKeysAfterA[0]);
  assert.deepEqual({ isDuet: storedRoleAfterA?.isDuet, isBackground: storedRoleAfterA?.isBackground }, { isDuet: true, isBackground: false }, '上传流程草稿必须保留文件 A 的对唱角色');

  await page.getByRole('button', { name: '确认保存至资料库' }).click();
  await page.waitForFunction(
    () => document.querySelector('p.text-base.font-bold.text-white.truncate')?.textContent === 'smoke-b.mp3',
    null,
    { timeout: 10_000 },
  );
  assert.equal(await page.getByTestId('upload-lyrics-status').textContent(), '可选', '顺序加载文件 B 时不得沿用文件 A 的暂存歌词');
  assert.equal(await page.getByTestId('upload-lyrics-status').getAttribute('data-lyrics-source'), '', '文件 B 未暂存歌词时来源必须为空');
  assert.match((await getFeedbackItems()).at(-1)?.message ?? '', /歌曲已保存，歌词可稍后补录/, '本地保存文件 A 后应保留明确的歌词补录提示');
  await page.getByTestId('upload-lyrics-toggle').click();
  await page.getByTestId('lyrics-editor').waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.getByTestId('lyrics-editor-source').inputValue(), '', '顺序切换到文件 B 后不应恢复文件 A 歌词草稿');
  await page.getByTestId('lyrics-editor-source').fill('[00:02.00]文件 B 歌词');
  await page.getByTestId('lyrics-editor-apply-source').click();
  await page.getByTestId('lyrics-editor-line-role-0').selectOption('background');
  await page.getByTestId('lyrics-editor-save').click();
  await page.getByTestId('upload-lyrics-status').filter({ hasText: '已暂存' }).waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await page.getByTestId('upload-lyrics-status').getAttribute('data-lyrics-source'), 'upload', '文件 B 暂存歌词的来源必须是 upload');
  const storedKeysAfterB = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('jzone:lyrics-draft:v1:')));
  assert.equal(storedKeysAfterB.length, 2, '文件 A、B 必须各自拥有歌词草稿键');
  const storedRolesAfterB = await page.evaluate((keys) => keys.map((key) => {
    const line = JSON.parse(localStorage.getItem(key) || 'null')?.lines?.[0];
    return { isDuet: Boolean(line?.isDuet), isBackground: Boolean(line?.isBackground) };
  }), storedKeysAfterB);
  assert.ok(storedRolesAfterB.some((role) => role.isDuet && !role.isBackground), '文件 A 草稿的对唱角色不能被文件 B 覆盖');
  assert.ok(storedRolesAfterB.some((role) => !role.isDuet && role.isBackground), '文件 B 草稿必须独立保存和声角色');
  await page.getByRole('button', { name: '确认保存至资料库' }).click();
  await page.waitForFunction(async () => {
    const { getFeedbackSnapshot } = await import('/components/feedback/feedback.ts');
    return getFeedbackSnapshot().some((item) => item.kind === 'info' && item.message.includes('歌曲已保存，歌词可稍后补录'));
  }, null, { timeout: 10_000 });
  const uploadFeedback = await getFeedbackItems();
  assert.equal(uploadFeedback.at(-1)?.kind, 'info', '带歌词的本地保存最终必须是明确的 info 提示');
  assert.match(uploadFeedback.at(-1)?.message ?? '', /歌曲已保存，歌词可稍后补录/, '带歌词的本地保存不得显示矛盾的成功提示');
  assert.equal(uploadFeedback.some((item) => item.kind === 'success' && item.message === '歌曲已保存到资料库'), false, '带歌词的本地保存不得追加歌曲成功 toast');
  await assertFitsViewport('上传歌词模块');
  await page.setViewportSize({ width: 360, height: 800 });
  await assertFitsViewport('上传歌词模块 360px');

  assert.deepEqual(pageErrors, [], '上传和歌词工作台 smoke 期间不应出现页面异常');
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    viewport: 390,
    layers: { workbench: layerOrder.workbenchZIndex, pwaPrompt: layerOrder.pwaZIndex, workbenchAbovePwa: true },
    workbench: { loaded: true, switched: true, saved: true, rolesRestored: true, deleted: true },
    upload: { collapsedByDefault: true, stagedSource: 'upload', ordered: true, draftKeys: storedKeysAfterB.length, rolesPersisted: true, isolated: true, fallbackFeedback: 'info' },
  }, null, 2));
} catch (error) {
  console.error(`[smoke-lyrics-upload-workbench] 失败：${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}
