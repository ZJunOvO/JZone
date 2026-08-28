import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
];

const readProjectFile = (relativePath) => fs.readFile(path.join(projectRoot, relativePath), 'utf8');

const assertContract = async () => {
  const [player, menu, shell, dialog, events, lyricsIndex] = await Promise.all([
    readProjectFile('pages/PlayerView.tsx'),
    readProjectFile('components/UniversalContextMenu.tsx'),
    readProjectFile('components/layout/AppShell.tsx'),
    readProjectFile('components/lyrics/SongLyricsEditorDialog.tsx'),
    readProjectFile('utils/lyrics/events.ts'),
    readProjectFile('utils/lyrics/index.ts'),
  ]);

  assert.match(player, /data-testid="player-cover-lyrics-toggle"/);
  assert.match(player, /<LyricsRenderer/);
  assert.match(player, /currentTime=\{currentTime\}/);
  assert.match(player, /playing=\{playerState\.isPlaying\}/);
  assert.match(player, /onSeek=\{seek\}/);
  assert.match(player, /player-lyrics-loading/);
  assert.match(player, /player-lyrics-error/);
  assert.match(player, /player-lyrics-empty/);
  assert.match(player, /SONG_LYRICS_UPDATED_EVENT/);
  assert.match(player, /<SongLyricsEditorDialog/);
  assert.match(player, /React\.useMemo\(\s*\(\) => lyricsRow \? getPlayerLyricsInput\(lyricsRow\) : null/);
  assert.match(player, /\[lyricsRow\?\.format, lyricsRow\?\.raw_content, lyricsRow\?\.offset_ms\]/);
  assert.match(player, /React\.lazy\(\(\) => import\('\.\.\/components\/lyrics\/SongLyricsEditorDialog'\)/);
  assert.match(player, /<React\.Suspense fallback=\{null\}>/);
  assert.match(player, /lyrics=\{playerLyricsInput\}/);
  assert.doesNotMatch(player, /lyrics=\{getPlayerLyricsInput\(lyricsRow\)\}/);
  assert.doesNotMatch(player, /import\s+\{\s*SongLyricsEditorDialog\s*\}/);
  assert.doesNotMatch(player, /<audio\b/i);

  assert.match(menu, /label: '查看歌词'/);
  assert.match(menu, /dispatchPlayerLyricsRequest\(item\.id\)/);
  assert.match(menu, /label: isOwner \? '添加歌词\/编辑歌词' : null/);
  assert.match(menu, /from '\.\.\/utils\/lyrics\/events'/);
  assert.match(menu, /React\.lazy\(\(\) => import\('\.\/lyrics\/SongLyricsEditorDialog'\)/);
  assert.match(menu, /<React\.Suspense fallback=\{null\}>/);
  assert.doesNotMatch(menu, /import\s+\{\s*SongLyricsEditorDialog\s*\}/);

  assert.match(shell, /addEventListener\(PLAYER_LYRICS_REQUEST_EVENT/);
  assert.match(shell, /removeEventListener\(PLAYER_LYRICS_REQUEST_EVENT/);
  assert.match(shell, /playContext\(\[targetSong\.id\], targetSong\.id\)/);
  assert.match(shell, /lyricsRequest=\{playerLyricsRequest\}/);
  assert.match(shell, /from '\.\.\/\.\.\/utils\/lyrics\/events'/);
  assert.doesNotMatch(shell, /from '\.\.\/UniversalContextMenu'/);

  assert.match(dialog, /fetchSongLyrics\(songId\)/);
  assert.match(dialog, /upsertSongLyrics\(song\.id/);
  assert.match(dialog, /deleteSongLyrics\(song\.id\)/);
  assert.match(dialog, /<LyricsEditor/);
  assert.match(dialog, /dispatchSongLyricsUpdated/);

  assert.match(events, /export const PLAYER_LYRICS_REQUEST_EVENT/);
  assert.match(events, /export interface PlayerLyricsRequestDetail/);
  assert.match(events, /export type PlayerLyricsRequestEvent/);
  assert.match(events, /export const dispatchPlayerLyricsRequest/);
  assert.match(events, /export const SONG_LYRICS_UPDATED_EVENT/);
  assert.match(events, /export interface SongLyricsUpdatedDetail/);
  assert.match(events, /export type SongLyricsUpdatedEvent/);
  assert.match(events, /export const dispatchSongLyricsUpdated/);
  assert.match(lyricsIndex, /from '\.\/events'/);
};

const waitFor = async (predicate, label, timeout = 15_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${label}未在 ${timeout}ms 内完成`);
};

const runBrowserScenario = async (browser, viewport, initialMode) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    await page.route('**/index.tsx**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '/* 播放器专项 smoke 使用受控挂载。 */',
    }));
    await page.addInitScript(() => {
      try {
        HTMLMediaElement.prototype.load = () => {};
        HTMLMediaElement.prototype.play = () => Promise.resolve();
      } catch {}
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });

    const result = await page.evaluate(async (mode) => {
      const ReactModule = await import('/node_modules/.vite/deps/react.js');
      const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
      const React = ReactModule.default ?? ReactModule;
      const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
      const { AuthProvider } = await import('/auth.tsx');
      const { AppProvider, useStore } = await import('/store.tsx');
      const { AppShell } = await import('/components/layout/AppShell.tsx');
      const { UniversalContextMenu } = await import('/components/UniversalContextMenu.tsx');
      const { dispatchPlayerLyricsRequest, PLAYER_LYRICS_REQUEST_EVENT } = await import('/utils/lyrics/events.ts');
      const { supabaseApi } = await import('/supabaseApi.ts');

      let lyricsMode = mode;
      const lyricsFetchSongIds = [];
      supabaseApi.fetchSongLyrics = async (songId) => {
        lyricsFetchSongIds.push(songId);
        if (lyricsMode === 'error') throw new Error('模拟歌词网络失败');
        return null;
      };

      const smokeSong = {
        id: 'smoke-lyrics-player-song',
        title: '播放器歌词 smoke',
        artist: 'JZone',
        coverUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"%3E%3Crect width="320" height="320" fill="%231b1b24"/%3E%3Ccircle cx="160" cy="160" r="92" fill="%23c9a7ff"/%3E%3C/svg%3E',
        audioUrl: '',
        duration: 180,
        trimStart: 0,
        trimEnd: 180,
        uploadedBy: 'smoke',
        addedAt: Date.now(),
        ownerId: 'smoke-owner',
      };
      const nextSmokeSong = {
        ...smokeSong,
        id: 'smoke-lyrics-player-song-next',
        title: '播放器歌词切换 smoke',
        addedAt: Date.now() + 1,
      };
      const smokeSongs = [smokeSong, nextSmokeSong];

      const MenuProbe = () => {
        const { songs, addSong } = useStore();
        const song = songs.find((item) => item.id === smokeSong.id) ?? smokeSong;
        React.useEffect(() => {
          smokeSongs.forEach((candidate) => {
            if (!songs.some((item) => item.id === candidate.id)) addSong(candidate);
          });
        }, [addSong, songs]);
        return React.createElement(UniversalContextMenu, {
          isOpen: true,
          item: song,
          type: 'song',
          anchorPosition: { x: 12, y: 12 },
          onClose: () => {},
        });
      };

      const mount = document.querySelector('#root');
      if (!mount) throw new Error('缺少根节点');
      const root = ReactDOMClient.createRoot(mount);
      root.render(React.createElement(AuthProvider, null,
        React.createElement(AppProvider, null,
          React.createElement(React.Fragment, null,
            React.createElement(AppShell),
            React.createElement(MenuProbe),
          ),
        ),
      ));

      const wait = async (predicate, label, timeout = 15_000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
          if (predicate()) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`${label}未在 ${timeout}ms 内完成`);
      };
      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      await wait(() => Boolean(document.querySelector('[data-testid="bottom-nav-home"]')), '应用壳');
      await wait(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === '查看歌词'), '歌曲更多菜单');

      const requests = [];
      const onLyricsRequest = (event) => requests.push(event.detail);
      window.addEventListener(PLAYER_LYRICS_REQUEST_EVENT, onLyricsRequest);
      const readPlayerTitle = () => document.querySelector('[data-testid="player-transition-shell"] h2')?.textContent?.trim() ?? '';
      const viewButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '查看歌词');
      if (!viewButton) throw new Error('未找到查看歌词菜单项');
      viewButton.click();
      await wait(() => Boolean(document.querySelector('[data-testid="player-transition-shell"]')), '全屏播放器');
      await wait(() => readPlayerTitle() === smokeSong.title, '首个播放器歌曲');

      let errorState;
      let retryRecovered = false;
      if (mode === 'error') {
        await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-error"]')), '歌词失败状态');
        errorState = {
          error: true,
          empty: Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')),
        };
        lyricsMode = 'empty';
        document.querySelector('[data-testid="player-lyrics-retry"]')?.click();
        await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')), '重试后的空歌词状态');
        await settle();
        retryRecovered = Boolean(document.querySelector('[data-testid="player-lyrics-empty"]'));
      } else {
        await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')), '歌词空状态');
        errorState = { error: false, empty: true };
      }

      const empty = Boolean(document.querySelector('[data-testid="player-lyrics-empty"]'));
      let coverBeforeClose = false;
      let rendererAfterClose = false;
      if (mode === 'empty') {
        document.querySelector('[data-testid="player-cover-lyrics-toggle"]')?.click();
        await settle();
        coverBeforeClose = Boolean(document.querySelector('[data-testid="player-cover-image"]'));
        rendererAfterClose = Boolean(document.querySelector('[data-testid="lyrics-renderer"]'));
      }

      const switchDispatched = dispatchPlayerLyricsRequest(nextSmokeSong.id);
      await wait(() => readPlayerTitle() === nextSmokeSong.title, '播放器切换');
      await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')), '切换后的歌词状态');
      const switchedTitle = readPlayerTitle();
      window.removeEventListener(PLAYER_LYRICS_REQUEST_EVENT, onLyricsRequest);
      return {
        mode,
        requests,
        errorState,
        retryRecovered,
        empty,
        coverBeforeClose,
        rendererAfterClose,
        switchDispatched,
        switchedTitle,
        lyricsFetchSongIds,
        widths: [...document.querySelectorAll('html, body, .jzone-app-shell')].map((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      };
    }, initialMode);

    assert.deepEqual(result.requests[0], { songId: 'smoke-lyrics-player-song', source: 'song-menu' });
    assert.deepEqual(result.requests[1], { songId: 'smoke-lyrics-player-song-next', source: 'song-menu' });
    assert.equal(result.errorState.error, initialMode === 'error');
    assert.equal(result.errorState.empty, initialMode === 'empty');
    assert.equal(result.empty, true);
    assert.equal(result.switchDispatched, true);
    assert.equal(result.switchedTitle, '播放器歌词切换 smoke');
    assert(result.lyricsFetchSongIds.includes('smoke-lyrics-player-song-next'), '播放器切换后必须重新读取目标歌曲歌词');
    if (initialMode === 'empty') {
      assert.equal(result.coverBeforeClose, true, '关闭歌词态后必须恢复封面');
      assert.equal(result.rendererAfterClose, false, '关闭歌词态后必须卸载歌词渲染器');
    } else {
      assert.equal(result.retryRecovered, true, '歌词失败状态必须支持重试并恢复空状态');
    }
    assert(result.widths.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth + 1), `${viewport.width}px 存在横向溢出：${JSON.stringify(result.widths)}`);
    assert.deepEqual(pageErrors, []);

    await fs.mkdir(path.join(projectRoot, 'output', 'playwright'), { recursive: true });
    await page.screenshot({
      path: path.join(projectRoot, 'output', 'playwright', `lyrics-player-${viewport.width}-${initialMode}.png`),
      fullPage: false,
    });
    return { viewport: `${viewport.width}x${viewport.height}`, ...result, pageErrors, consoleErrors };
  } finally {
    await page.close();
  }
};

await assertContract();
const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
try {
  const results = [];
  for (const viewport of viewports) {
    results.push(await runBrowserScenario(browser, viewport, 'empty'));
    results.push(await runBrowserScenario(browser, viewport, 'error'));
  }
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
