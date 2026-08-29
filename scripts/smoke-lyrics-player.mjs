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
const scenarioModes = (process.env.JZONE_LYRICS_SMOKE_MODES || 'ready,empty,error')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);

const readProjectFile = (relativePath) => fs.readFile(path.join(projectRoot, relativePath), 'utf8');

const assertContract = async () => {
  const [player, menu, editSong, shell, dialog, events, lyricsIndex, editor, store] = await Promise.all([
    readProjectFile('pages/PlayerView.tsx'),
    readProjectFile('components/UniversalContextMenu.tsx'),
    readProjectFile('components/EditSongModal.tsx'),
    readProjectFile('components/layout/AppShell.tsx'),
    readProjectFile('components/lyrics/SongLyricsEditorDialog.tsx'),
    readProjectFile('utils/lyrics/events.ts'),
    readProjectFile('utils/lyrics/index.ts'),
    readProjectFile('components/lyrics/editor/LyricsEditor.tsx'),
    readProjectFile('store.tsx'),
  ]);

  assert.match(player, /data-testid="player-cover-button"/);
  assert.match(player, /data-testid="player-cover-layout"/);
  assert.match(player, /layout=\{!reduceMotion\}/);
  assert.doesNotMatch(player, /data-testid="player-cover-lyrics-toggle"/);
  assert.match(player, /<LyricsRenderer/);
  assert.match(player, /currentTime=\{currentTime\}/);
  assert.match(player, /playing=\{playerState\.isPlaying\}/);
  assert.match(player, /onSeek=\{seek\}/);
  assert.match(player, /player-lyrics-loading/);
  assert.match(player, /player-lyrics-error/);
  assert.match(player, /player-lyrics-empty/);
  assert.match(player, /PLAYER_LYRICS_UI_CACHE_FRESH_MS/);
  assert.match(player, /playerLyricsUiCache/);
  assert.match(player, /data-testid="player-song-info-button"/);
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
  assert.match(player, /getCurrentAudioSource\(\) \|\| song\?\.audioUrl/);
  assert.match(player, /pausePlayback\(\)/);
  assert.match(player, /audioUrl=\{lyricsEditorAudioUrl\}/);
  assert.doesNotMatch(player, /<SongLyricsEditorDialog[\s\S]*?audioControls=/);

  assert.doesNotMatch(menu, /label: '查看歌词'/);
  assert.doesNotMatch(menu, /收藏此歌曲|取消收藏此歌曲/);
  assert.doesNotMatch(menu, /添加歌词\/编辑歌词/);

  assert.match(editSong, /React\.lazy\(\(\) => import\('\.\/lyrics\/SongLyricsEditorDialog'\)/);
  assert.match(editSong, /data-testid="edit-song-lyrics"/);
  assert.match(editSong, /getCurrentAudioSource\(\) \|\| song\.audioUrl/);
  assert.match(editSong, /pausePlayback\(\)/);
  assert.match(editSong, /audioUrl=\{lyricsEditorAudioUrl \|\| song\.audioUrl\}/);
  assert.match(editSong, /className="grid grid-cols-2 gap-3"/);

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
  assert.match(dialog, /audioUrl=\{audioUrl \|\| song\.audioUrl\}/);

  assert.match(editor, /preload="metadata"[\s\S]*?loop/);
  assert.match(store, /const getCurrentAudioSource = useCallback/);

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
      const { dispatchPlayerLyricsRequest, PLAYER_LYRICS_REQUEST_EVENT } = await import('/utils/lyrics/events.ts');
      const { supabaseApi } = await import('/supabaseApi.ts');

      let lyricsMode = mode;
      const lyricsFetchSongIds = [];
      supabaseApi.fetchSongLyrics = async (songId) => {
        lyricsFetchSongIds.push(songId);
        if (lyricsMode === 'error') throw new Error('模拟歌词网络失败');
        if (lyricsMode === 'ready') {
          return {
            song_id: songId,
            format: 'lrc',
            raw_content: '[00:08.00]左侧主唱\n[00:12.00]下一句歌词\n[00:16.00]继续播放',
            offset_ms: 0,
          };
        }
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

      const SongSeeder = () => {
        const { songs, addSong } = useStore();
        React.useEffect(() => {
          smokeSongs.forEach((candidate) => {
            if (!songs.some((item) => item.id === candidate.id)) addSong(candidate);
          });
        }, [addSong, songs]);
        const ready = smokeSongs.every((candidate) => songs.some((item) => item.id === candidate.id));
        return React.createElement('span', { 'data-testid': 'lyrics-song-seeder', 'data-ready': ready ? 'true' : 'false' });
      };

      const mount = document.querySelector('#root');
      if (!mount) throw new Error('缺少根节点');
      const root = ReactDOMClient.createRoot(mount);
      window.__jzoneLyricsPlayerSmokeRoot = root;
      root.render(React.createElement(AuthProvider, null,
        React.createElement(AppProvider, null,
          React.createElement(React.Fragment, null,
            React.createElement(AppShell),
            React.createElement(SongSeeder),
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
      const settleLayout = () => new Promise((resolve) => setTimeout(resolve, 560));
      const readRect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;

      await wait(() => Boolean(document.querySelector('[data-testid="bottom-nav-home"]')), '应用壳');
      await wait(() => document.querySelector('[data-testid="lyrics-song-seeder"]')?.getAttribute('data-ready') === 'true', '测试歌曲写入');

      const requests = [];
      const onLyricsRequest = (event) => requests.push(event.detail);
      window.addEventListener(PLAYER_LYRICS_REQUEST_EVENT, onLyricsRequest);
      const readPlayerTitle = () => document.querySelector('[data-testid="player-transition-shell"] h2')?.textContent?.trim() ?? '';
      dispatchPlayerLyricsRequest(smokeSong.id);
      await wait(() => Boolean(document.querySelector('[data-testid="player-transition-shell"]')), '全屏播放器');
      await wait(() => readPlayerTitle() === smokeSong.title, '首个播放器歌曲');

      let errorState;
      let retryRecovered = false;
      let readyLayout = null;
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
      } else if (mode === 'empty') {
        await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')), '歌词空状态');
        errorState = { error: false, empty: true };
      } else {
        await wait(() => Boolean(document.querySelector('[data-testid="lyrics-renderer"]')), '歌词渲染器');
        await wait(() => Boolean(document.querySelector('[data-testid="lyrics-intro-dots"]')), '前奏三点');
        await settleLayout();
        errorState = { error: false, empty: false };

        const coverButton = document.querySelector('[data-testid="player-cover-button"]');
        if (!(coverButton instanceof HTMLButtonElement)) throw new Error('未找到可点击封面');
        const smallCover = readRect('[data-testid="player-cover-layout"]');
        const lyricsInfo = readRect('[data-testid="player-song-info"]');
        const lyricsPanel = readRect('[data-testid="player-lyrics-panel"]');
        const progress = readRect('[data-testid="player-progress"]');
        const introDots = document.querySelector('[data-testid="lyrics-intro-dots"]');
        const edgeFade = document.querySelector('[data-testid="lyrics-edge-fade"]');
        const smallState = {
          cover: smallCover,
          info: lyricsInfo,
          lyricsPanel,
          progress,
          ariaLabel: coverButton.getAttribute('aria-label'),
          visibleText: coverButton.textContent?.trim() ?? '',
          introFirstLineTimeMs: Number(introDots?.dataset.firstLineTimeMs),
          introTop: introDots?.getBoundingClientRect().top ?? null,
          edgeFade: Boolean(edgeFade),
          sharedCoverCount: document.querySelectorAll('[data-player-shared-target="cover"]').length,
        };

        coverButton.click();
        await wait(() => !document.querySelector('[data-testid="player-lyrics-panel"]'), '返回大封面');
        await settleLayout();
        const largeCover = readRect('[data-testid="player-cover-layout"]');
        const rendererAfterClose = Boolean(document.querySelector('[data-testid="lyrics-renderer"]'));
        const coverStateLabel = coverButton.getAttribute('aria-label');

        const openingWidths = [];
        coverButton.click();
        for (let index = 0; index < 7; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          const rect = readRect('[data-testid="player-cover-layout"]');
          if (rect) openingWidths.push(rect.width);
        }
        await wait(() => Boolean(document.querySelector('[data-testid="lyrics-renderer"]')), '再次打开歌词');
        await settle();
        const reopenedCover = readRect('[data-testid="player-cover-layout"]');
        const songInfoButton = document.querySelector('[data-testid="player-song-info-button"]');
        if (!(songInfoButton instanceof HTMLButtonElement)) throw new Error('未找到歌曲信息返回按钮');
        songInfoButton.click();
        await wait(() => !document.querySelector('[data-testid="player-lyrics-panel"]'), '点击歌曲信息返回封面');
        const songInfoReturnedCover = Boolean(document.querySelector('[data-testid="player-cover-image"]'));
        coverButton.click();
        await wait(() => Boolean(document.querySelector('[data-testid="lyrics-renderer"]')), '歌曲信息返回后再次打开歌词');
        await settle();
        document.querySelector('[data-testid="player-toggle-play"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 4_500));
        const lowerControls = document.querySelector('[data-testid="player-lower-controls"]');
        const controlsAfterIdle = lowerControls?.dataset.controlsVisible ?? null;
        const controlsLockedAfterIdle = lowerControls?.dataset.controlsLocked ?? null;
        const introTopAfterIdle = document.querySelector('[data-testid="lyrics-intro-dots"]')?.getBoundingClientRect().top ?? null;
        document.querySelector('[data-testid="player-transition-shell"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await settle();
        const controlsAfterActivity = lowerControls?.dataset.controlsVisible ?? null;
        const introTopAfterActivity = document.querySelector('[data-testid="lyrics-intro-dots"]')?.getBoundingClientRect().top ?? null;
        const elasticLayer = document.querySelector('[data-testid="lyrics-elastic-layer"]');
        const elasticRenderer = document.querySelector('[data-testid="lyrics-renderer"]');
        let elasticPullOffset = null;
        let elasticPullSettledOffset = null;
        let elasticViewportHeight = null;
        if (elasticLayer instanceof HTMLElement && elasticRenderer instanceof HTMLElement) {
          elasticViewportHeight = elasticRenderer.clientHeight;
          const initialTop = elasticLayer.getBoundingClientRect().top;
          elasticRenderer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 21, pointerType: 'touch', clientY: 120 }));
          elasticRenderer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 21, pointerType: 'touch', clientY: 520 }));
          await settle();
          elasticPullOffset = elasticLayer.getBoundingClientRect().top - initialTop;
          elasticRenderer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21, pointerType: 'touch', clientY: 520 }));
          await new Promise((resolve) => setTimeout(resolve, 620));
          elasticPullSettledOffset = elasticLayer.getBoundingClientRect().top - initialTop;
        }
        songInfoButton.click();
        await wait(() => !document.querySelector('[data-testid="player-lyrics-panel"]'), '锁定后返回封面');
        coverButton.click();
        await wait(() => Boolean(document.querySelector('[data-testid="lyrics-renderer"]')), '锁定后重新进入歌词');
        const controlsAfterReentry = document.querySelector('[data-testid="player-lower-controls"]')?.dataset.controlsVisible ?? null;
        readyLayout = {
          smallState,
          largeCover,
          rendererAfterClose,
          coverStateLabel,
          openingWidths,
          reopenedCover,
          songInfoReturnedCover,
          lyricsRestored: Boolean(document.querySelector('[data-testid="player-lyrics-panel"]')),
          controlsAfterIdle,
          controlsLockedAfterIdle,
          controlsAfterActivity,
          controlsAfterReentry,
          introTopAfterIdle,
          introTopAfterActivity,
          elasticPullOffset,
          elasticPullSettledOffset,
          elasticViewportHeight,
        };
      }

      const empty = Boolean(document.querySelector('[data-testid="player-lyrics-empty"]'));
      let coverBeforeClose = false;
      let rendererAfterClose = false;
      if (mode === 'empty') {
        document.querySelector('[data-testid="player-cover-button"]')?.click();
        await settleLayout();
        coverBeforeClose = Boolean(document.querySelector('[data-testid="player-cover-image"]'));
        rendererAfterClose = Boolean(document.querySelector('[data-testid="lyrics-renderer"]'));
      }

      const switchDispatched = mode === 'ready' ? null : dispatchPlayerLyricsRequest(nextSmokeSong.id);
      if (mode !== 'ready') {
        await wait(() => readPlayerTitle() === nextSmokeSong.title, '播放器切换');
        await wait(() => Boolean(document.querySelector('[data-testid="player-lyrics-empty"]')), '切换后的歌词状态');
      }
      const switchedTitle = mode === 'ready' ? null : readPlayerTitle();
      window.removeEventListener(PLAYER_LYRICS_REQUEST_EVENT, onLyricsRequest);
      return {
        mode,
        requests,
        errorState,
        retryRecovered,
        empty,
        coverBeforeClose,
        rendererAfterClose,
        readyLayout,
        switchDispatched,
        switchedTitle,
        lyricsFetchSongIds,
        widths: [...document.querySelectorAll('html, body, .jzone-app-shell')].map((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      };
    }, initialMode);

    const postEvaluateState = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="player-transition-shell"]');
      const cover = document.querySelector('[data-testid="player-cover-layout"]');
      return {
        shellPresent: Boolean(shell),
        shellPhase: shell?.dataset.playerTransitionPhase ?? null,
        shellClipPath: shell ? getComputedStyle(shell).clipPath : null,
        shellOpacity: shell ? getComputedStyle(shell).opacity : null,
        coverPresent: Boolean(cover),
        coverRect: cover?.getBoundingClientRect().toJSON() ?? null,
      };
    });
    if (initialMode === 'ready') {
      assert.equal(postEvaluateState.shellPresent, true, `截图前全屏播放器不得卸载：${JSON.stringify(postEvaluateState)}`);
      assert.equal(postEvaluateState.coverPresent, true, `截图前歌词封面不得卸载：${JSON.stringify(postEvaluateState)}`);
    }

    assert.deepEqual(result.requests[0], { songId: 'smoke-lyrics-player-song', source: 'song-menu' });
    if (initialMode !== 'ready') {
      assert.deepEqual(result.requests[1], { songId: 'smoke-lyrics-player-song-next', source: 'song-menu' });
    }
    assert.equal(result.errorState.error, initialMode === 'error');
    assert.equal(result.errorState.empty, initialMode === 'empty');
    assert.equal(result.empty, initialMode !== 'ready');
    if (initialMode !== 'ready') {
      assert.equal(result.switchDispatched, true);
      assert.equal(result.switchedTitle, '播放器歌词切换 smoke');
      assert(result.lyricsFetchSongIds.includes('smoke-lyrics-player-song-next'), '播放器切换后必须重新读取目标歌曲歌词');
    }
    if (initialMode === 'empty') {
      assert.equal(result.coverBeforeClose, true, '关闭歌词态后必须恢复封面');
      assert.equal(result.rendererAfterClose, false, '关闭歌词态后必须卸载歌词渲染器');
    } else if (initialMode === 'error') {
      assert.equal(result.retryRecovered, true, '歌词失败状态必须支持重试并恢复空状态');
    } else {
      const { smallState, largeCover, rendererAfterClose, coverStateLabel, openingWidths, reopenedCover, songInfoReturnedCover, lyricsRestored, controlsAfterIdle, controlsLockedAfterIdle, controlsAfterActivity, controlsAfterReentry, introTopAfterIdle, introTopAfterActivity, elasticPullOffset, elasticPullSettledOffset, elasticViewportHeight } = result.readyLayout;
      assert.equal(smallState.ariaLabel, '查看封面', '歌词态小封面必须提供返回名称');
      assert.equal(smallState.visibleText, '', '封面切换入口不能显示“查看歌词/查看封面”文字');
      assert.equal(smallState.introFirstLineTimeMs, 8_000, '播放器必须按第一句有效时间显示前奏三点');
      assert.equal(smallState.edgeFade, true, '歌词上下边缘必须挂载柔化遮罩');
      assert.equal(smallState.sharedCoverCount, 1, '封面往返必须复用同一个共享目标');
      assert(smallState.cover && smallState.info && smallState.lyricsPanel && smallState.progress && largeCover && reopenedCover, '必须能读取封面、信息区、歌词与进度条几何');
      assert(largeCover.width > smallState.cover.width * 2.5, `大封面没有显著缩至顶部：${JSON.stringify({ largeCover, small: smallState.cover })}`);
      assert(Math.abs(reopenedCover.width - smallState.cover.width) <= 2, '重新打开歌词后小封面尺寸必须稳定');
      assert(smallState.info.left >= smallState.cover.right + 8, '歌词态标题艺人必须位于小封面右侧');
      assert(smallState.lyricsPanel.top >= smallState.cover.bottom - 1, '歌词必须位于顶部信息区下方');
      assert(smallState.lyricsPanel.bottom <= smallState.progress.top + 1, '歌词必须填充到进度条上方且不能遮挡进度条');
      assert(smallState.lyricsPanel.height >= 180, `歌词主空间不足：${smallState.lyricsPanel.height}`);
      assert.equal(rendererAfterClose, false, '返回大封面后必须卸载歌词渲染器');
      assert.equal(coverStateLabel, '查看歌词');
      assert.equal(lyricsRestored, true, '再次点击大封面必须恢复歌词态');
      assert.equal(songInfoReturnedCover, true, '歌词态点击歌名艺人区域必须返回封面态');
      assert.equal(result.lyricsFetchSongIds.filter((songId) => songId === 'smoke-lyrics-player-song').length, 1, '同一歌曲反复开关歌词视图不得重复拉取');
      assert.equal(controlsAfterIdle, 'false', '播放中的歌词页停留后必须自动淡出下方控制区');
      assert.equal(controlsLockedAfterIdle, 'true', '歌词进入全屏后必须锁定控制区');
      assert.equal(controlsAfterActivity, 'false', '歌词全屏锁定后，触摸面板不得恢复控制区');
      assert.equal(controlsAfterReentry, 'true', '返回封面再进入歌词后必须重新开始 4.2 秒倒计时');
      assert(elasticPullOffset !== null && elasticPullOffset > 8, `首行下拉必须产生可见阻尼位移：${elasticPullOffset}`);
      assert(elasticViewportHeight !== null && elasticPullOffset <= elasticViewportHeight * 0.22 + 3, `首行下拉不得越过歌词视窗中线：${JSON.stringify({ elasticPullOffset, elasticViewportHeight })}`);
      assert(elasticPullSettledOffset !== null && Math.abs(elasticPullSettledOffset) <= 2, `首行下拉松手后必须弹性归位：${elasticPullSettledOffset}`);
      assert(smallState.introTop !== null && introTopAfterIdle !== null && introTopAfterActivity !== null, '前奏三点在控制区切换期间不得卸载');
      assert(Math.abs(introTopAfterIdle - smallState.introTop) <= 1 && Math.abs(introTopAfterActivity - smallState.introTop) <= 1, `控制区收放导致前奏三点错位：${JSON.stringify({ initial: smallState.introTop, introTopAfterIdle, introTopAfterActivity })}`);
      assert(openingWidths.length >= 5, '必须采集到封面缩放动画帧');
      assert(openingWidths.some((width) => width < largeCover.width - 8 && width > smallState.cover.width + 8), `封面缩放缺少中间动画帧：${JSON.stringify(openingWidths)}`);
    }
    assert(result.widths.every(({ scrollWidth, clientWidth }) => scrollWidth <= clientWidth + 1), `${viewport.width}px 存在横向溢出：${JSON.stringify(result.widths)}`);
    assert.deepEqual(pageErrors, []);

    await fs.mkdir(path.join(projectRoot, 'output', 'playwright'), { recursive: true });
    await page.screenshot({
      path: path.join(projectRoot, 'output', 'playwright', `lyrics-player-${viewport.width}-${initialMode}.png`),
      fullPage: false,
    });
    return { viewport: `${viewport.width}x${viewport.height}`, ...result, postEvaluateState, pageErrors, consoleErrors };
  } finally {
    await page.close();
  }
};

await assertContract();
const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
try {
  const results = [];
  for (const viewport of viewports) {
    for (const mode of scenarioModes) {
      results.push(await runBrowserScenario(browser, viewport, mode));
    }
  }
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
