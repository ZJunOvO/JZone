import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.route('**/index.tsx', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* 专项 smoke 只挂载歌词编辑器，跳过业务应用入口。 */',
  }));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.querySelector('#root')), null, { timeout: 10_000 });
  pageErrors.length = 0;

  const result = await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const ReactDOMClientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMClient = ReactDOMClientModule.default ?? ReactDOMClientModule;
    const { LyricsEditor } = await import('/components/lyrics/editor/LyricsEditor.tsx');
    const lyricsApi = await import('/utils/lyrics/index.ts');
    const draftApi = await import('/hooks/useLyricsDraft.ts');
    const mount = document.createElement('div');
    document.body.replaceChildren(mount);
    const root = ReactDOMClient.createRoot(mount);
    const seekCalls = [];
    const saveCalls = [];
    const pauseCalls = [];
    const playCalls = [];

    const settle = (delay = 0) => new Promise((resolve) => {
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), delay);
    });
    const render = async (props) => {
      root.render(React.createElement(LyricsEditor, props));
      await settle();
    };
    const click = async (testId) => {
      mount.querySelector(`[data-testid="${testId}"]`)?.click();
      await settle(20);
    };
    const changeSelect = async (testId, value) => {
      const select = mount.querySelector(`[data-testid="${testId}"]`);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle(20);
    };
    const pressEnter = async (testId) => {
      mount.querySelector(`[data-testid="${testId}"]`)?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
      await settle(20);
    };
    const pasteSource = async (text) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', text);
      mount.querySelector('[data-testid="lyrics-editor-source"]')?.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }));
      await settle(20);
    };

    localStorage.clear();
    const lrc = '[00:01.00]第一行\n[00:03.50]第二行';
    const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="2s">TTML 行</p></div></body></tt>';
    const parsedLrc = lyricsApi.parseLyrics({ format: 'lrc', content: lrc });
    const parsedRoles = lyricsApi.parseLyrics({
      format: 'lrc',
      content: '[jzone:role:0:duet]\n[jzone:role:1:background]\n[00:01.00]第一行\n[00:03.50]第二行',
    });
    const parserChecks = {
      lrcTiming: parsedLrc.timing,
      lrcWordCount: parsedLrc.lines.reduce((count, line) => count + line.words.length, 0),
      plainFormat: lyricsApi.detectLyricsFormat('第一行\n第二行'),
      ttmlFormat: lyricsApi.detectLyricsFormat(ttml),
      roles: parsedRoles.lines.map((line) => ({
        isDuet: line.isDuet,
        isBackground: line.isBackground,
      })),
    };

    await render({
      initialLyrics: { format: 'plain', content: '第一行\n第二行' },
      songId: 'smoke-song-a',
      duration: 5,
      currentTime: 1.25,
      playing: true,
      onPause: () => pauseCalls.push('initial'),
      onSeek: (time) => seekCalls.push(time),
      onSave: async (payload) => saveCalls.push(payload),
    });

    const editor = mount.querySelector('[data-testid="lyrics-editor"]');
    const initial = {
      root: Boolean(editor),
      viewportWidth: document.documentElement.clientWidth,
      lineCount: mount.querySelectorAll('[data-lyrics-line-index]').length,
      format: editor?.dataset.lyricsFormat,
      fitsViewport: Boolean(editor && editor.getBoundingClientRect().width <= 360 && editor.scrollWidth <= editor.clientWidth + 1),
      fileAccept: mount.querySelector('[data-testid="lyrics-editor-file"]')?.getAttribute('accept') || '',
    };

    await click('lyrics-editor-restart');
    const timelineFlow = {
      timeline: Boolean(mount.querySelector('[data-testid="lyrics-editor-timeline"]')),
      seek: Boolean(mount.querySelector('[data-testid="lyrics-editor-seek"]')),
      globalTimeMarkRemoved: !mount.querySelector('[data-testid="lyrics-editor-time-mark"]'),
      restartedAt: seekCalls.at(-1),
      addButtonRemoved: !mount.querySelector('[data-testid="lyrics-editor-add-line"]'),
      newBlankRemoved: !mount.querySelector('[data-testid="lyrics-editor-new"]'),
    };

    await click('lyrics-editor-line-time-1');
    const rowSpecificMark = {
      firstTime: mount.querySelector('[data-testid="lyrics-editor-line-time-0"] > span')?.textContent,
      secondTime: mount.querySelector('[data-testid="lyrics-editor-line-time-1"] > span')?.textContent,
      selected: mount.querySelector('[data-testid="lyrics-editor-line-1"]')?.dataset.selected,
      focused: document.activeElement?.getAttribute('data-testid'),
      paused: pauseCalls.filter((value) => value === 'initial').length === 1,
    };

    await render({
      initialLyrics: { format: 'plain', content: '第一行\n第二行' },
      songId: 'smoke-song-mark',
      duration: 5,
      currentTime: 1.25,
      playing: true,
      onPause: () => pauseCalls.push('mark'),
      onPlay: () => playCalls.push('resume'),
      onSeek: (time) => seekCalls.push(time),
      clearDraftOnSave: false,
      onSave: async (payload) => saveCalls.push(payload),
    });
    await changeSelect('lyrics-editor-line-role-0', 'duet');
    await changeSelect('lyrics-editor-line-role-1', 'background');
    await click('lyrics-editor-line-0');
    await click('lyrics-editor-line-time-0');
    const draftKeyA = draftApi.createLyricsDraftStorageKey({ songId: 'smoke-song-mark' });
    const storedAfterMark = JSON.parse(localStorage.getItem(draftKeyA) || 'null');
    const afterMark = {
      format: mount.querySelector('[data-testid="lyrics-editor"]')?.dataset.lyricsFormat,
      firstTime: mount.querySelector('[data-testid="lyrics-editor-line-0"] span')?.textContent,
      paused: pauseCalls.filter((value) => value === 'mark').length === 1,
      selected: mount.querySelector('[data-testid="lyrics-editor-line-0"]')?.dataset.selected,
      focused: document.activeElement?.getAttribute('data-testid'),
      storageVersion: storedAfterMark?.version,
      storageHasAudioField: Object.keys(storedAfterMark || {}).some((key) => /audio|blob|file/i.test(key)),
      storedLineCount: storedAfterMark?.lines?.length,
      storedRoles: storedAfterMark?.lines?.map((line) => ({
        isDuet: line.isDuet,
        isBackground: line.isBackground,
      })),
    };

    await pressEnter('lyrics-editor-line-input-0');
    const afterFirstCompletion = {
      resumed: playCalls.length === 1,
      lineCount: mount.querySelectorAll('[data-lyrics-line-index]').length,
      selected: mount.querySelector('[data-testid="lyrics-editor-line-1"]')?.dataset.selected,
      focused: document.activeElement?.getAttribute('data-testid'),
      completedState: mount.querySelector('[data-testid="lyrics-editor-line-0"]')?.dataset.lineState,
      collapsedText: mount.querySelector('[data-testid="lyrics-editor-line-summary-0"]')?.textContent,
      hiddenEditor: !mount.querySelector('[data-testid="lyrics-editor-line-input-0"]'),
    };
    await click('lyrics-editor-line-summary-0');
    const reopenedCompletedLine = {
      state: mount.querySelector('[data-testid="lyrics-editor-line-0"]')?.dataset.lineState,
      focused: document.activeElement?.getAttribute('data-testid'),
      text: mount.querySelector('[data-testid="lyrics-editor-line-input-0"]')?.value,
    };
    await click('lyrics-editor-line-1');
    await click('lyrics-editor-mark');
    await pressEnter('lyrics-editor-line-input-1');
    const afterLastMark = {
      paused: pauseCalls.filter((value) => value === 'mark').length === 2,
      resumed: playCalls.length === 2,
      lineCount: mount.querySelectorAll('[data-lyrics-line-index]').length,
      selected: mount.querySelector('[data-testid="lyrics-editor-line-2"]')?.dataset.selected,
      focused: document.activeElement?.getAttribute('data-testid'),
      firstText: mount.querySelector('[data-testid="lyrics-editor-line-summary-0"]')?.textContent,
      secondText: mount.querySelector('[data-testid="lyrics-editor-line-summary-1"]')?.textContent,
      inheritedRole: mount.querySelector('[data-testid="lyrics-editor-line-role-2"]')?.value,
    };
    await click('lyrics-editor-undo');
    const afterUndo = {
      secondTime: mount.querySelector('[data-testid="lyrics-editor-line-1"] span')?.textContent,
      undoDisabled: mount.querySelector('[data-testid="lyrics-editor-undo"]')?.hasAttribute('disabled'),
    };
    await click('lyrics-editor-mark');
    await click('lyrics-editor-save');
    const saveFeedback = {
      message: mount.querySelector('[data-testid="lyrics-editor-save-message"]')?.textContent,
      status: mount.querySelector('[data-testid="lyrics-editor-draft-status"]')?.textContent,
    };
    const rolePayload = saveCalls.at(-1);
    if (!rolePayload) {
      throw new Error(`角色歌词未产生保存载荷：${mount.querySelector('[data-testid="lyrics-editor-error"]')?.textContent || mount.querySelector('[data-testid="lyrics-editor-save-error"]')?.textContent || '无错误提示'}`);
    }
    const reparsedRolePayload = lyricsApi.parseLyrics({
      format: rolePayload.format,
      content: rolePayload.rawContent,
    });
    const roleRoundTrip = {
      rawHasMetadata: /\[jzone:role:0:duet\]/.test(rolePayload.rawContent)
        && /\[jzone:role:1:background\]/.test(rolePayload.rawContent),
      normalizedRoles: rolePayload.normalizedContent.lines.slice(0, 2).map((line) => ({
        isDuet: line.isDuet,
        isBackground: line.isBackground,
      })),
      parsedRoles: reparsedRolePayload.lines.slice(0, 2).map((line) => ({
        isDuet: line.isDuet,
        isBackground: line.isBackground,
      })),
    };

    await render({ initialLyrics: null, songId: 'smoke-song-switch', duration: 5 });
    await render({
      initialLyrics: { format: 'plain', content: '第一行\n第二行' },
      songId: 'smoke-song-mark',
      duration: 5,
      currentTime: 1.25,
      onPause: () => pauseCalls.push('restore'),
      clearDraftOnSave: false,
      onSave: async (payload) => saveCalls.push(payload),
    });
    if (mount.querySelector('[data-testid="lyrics-editor-line-summary-0"]')) await click('lyrics-editor-line-summary-0');
    const restoredDuet = mount.querySelector('[data-testid="lyrics-editor-line-role-0"]')?.value;
    if (mount.querySelector('[data-testid="lyrics-editor-line-summary-1"]')) await click('lyrics-editor-line-summary-1');
    const restoredRoles = {
      duet: restoredDuet,
      background: mount.querySelector('[data-testid="lyrics-editor-line-role-1"]')?.value,
    };

    await render({
      initialLyrics: { format: 'lrc', content: lrc },
      songId: 'smoke-song-b',
      duration: 5,
      currentTime: 3.5,
      onSeek: (time) => seekCalls.push(time),
      onSave: async (payload) => saveCalls.push(payload),
    });
    await click('lyrics-editor-line-1');
    const jumped = seekCalls.at(-1);
    await click('lyrics-editor-preview-tab');
    const preview = {
      present: Boolean(mount.querySelector('[data-testid="lyrics-editor-preview"]')),
      renderer: Boolean(mount.querySelector('[data-testid="lyrics-renderer"]')),
      timing: mount.querySelector('[data-testid="lyrics-renderer"]')?.dataset.lyricsTiming,
    };

    await render({
      initialLyrics: { format: 'lrc', content: '[00:06.00]超出时长' },
      songId: 'smoke-song-invalid',
      duration: 5,
      onSave: async (payload) => saveCalls.push(payload),
    });
    await click('lyrics-editor-edit-tab');
    await click('lyrics-editor-save');
    const durationError = mount.querySelector('[data-testid="lyrics-editor-error"]')?.textContent || '';

    const nonMonotonic = draftApi.validateLyricsDraft({
      content: lrc,
      lines: [
        { ...parsedLrc.lines[0], startTimeMs: 2_000 },
        { ...parsedLrc.lines[1], startTimeMs: 1_000 },
      ],
      offsetMs: 0,
      durationSeconds: 5,
    });

    await render({
      initialLyrics: { format: 'lrc', content: lrc },
      songId: 'smoke-song-save',
      duration: 5,
      initialOffsetMs: 120,
      onSave: async (payload) => saveCalls.push(payload),
    });
    const saveDraftKey = draftApi.createLyricsDraftStorageKey({ songId: 'smoke-song-save' });
    const draftPresentBeforeSave = Boolean(localStorage.getItem(saveDraftKey));
    await click('lyrics-editor-save');
    const savedPayload = saveCalls.at(-1);
    const saveResult = {
      draftPresentBeforeSave,
      draftCleared: localStorage.getItem(saveDraftKey) === null,
      offsetMs: savedPayload?.offsetMs,
      wordCount: savedPayload?.lines?.reduce((count, line) => count + line.words.length, 0),
    };

    await render({
      initialLyrics: null,
      draftKey: 'smoke-upload',
      duration: 5,
    });
    const fileInput = mount.querySelector('[data-testid="lyrics-editor-file"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([ttml], 'sample.ttml', { type: 'application/xml' }));
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(30);
    const uploadedFormat = mount.querySelector('[data-testid="lyrics-editor"]')?.dataset.lyricsFormat;

    await pasteSource(lrc);
    const pastedFormat = mount.querySelector('[data-testid="lyrics-editor"]')?.dataset.lyricsFormat;
    await pasteSource('<tt>');
    const malformedFeedback = mount.querySelector('[data-testid="lyrics-editor-parse-error"]')?.textContent || '';

    await click('lyrics-editor-mark');
    const blankCreationLineCount = mount.querySelectorAll('[data-lyrics-line-index]').length;
    await click('lyrics-editor-save');
    const emptyFeedback = mount.querySelector('[data-testid="lyrics-editor-error"]')?.textContent || '';

    const isolatedA = draftApi.createLyricsDraftStorageKey({ songId: 'song-a' });
    const isolatedB = draftApi.createLyricsDraftStorageKey({ songId: 'song-b' });
    const fallbackKey = draftApi.createLyricsDraftStorageKey({ draftKey: 'new-song' });

    root.unmount();
    mount.remove();

    return {
      parserChecks,
      initial,
      timelineFlow,
      rowSpecificMark,
      afterMark,
    afterFirstCompletion,
    reopenedCompletedLine,
    afterLastMark,
      afterUndo,
    roleRoundTrip,
    saveFeedback,
      restoredRoles,
      jumped,
      preview,
      durationError,
      nonMonotonicCodes: nonMonotonic.issues.map((issue) => issue.code),
      saveResult,
      uploadedFormat,
      pastedFormat,
      malformedFeedback,
      blankCreationLineCount,
      emptyFeedback,
      isolated: isolatedA !== isolatedB && Boolean(fallbackKey),
    };
  });

  assert.deepEqual(result.parserChecks, {
    lrcTiming: 'line',
    lrcWordCount: 0,
    plainFormat: 'plain',
    ttmlFormat: 'ttml',
    roles: [
      { isDuet: true, isBackground: false },
      { isDuet: false, isBackground: true },
    ],
  }, '统一解析层必须识别 LRC、TXT 和 TTML，且普通 LRC 不制造逐字时间');
  assert.equal(result.initial.root, true, '编辑器根节点必须挂载');
  assert.equal(result.initial.viewportWidth, 360, 'smoke 必须在 360px 视口运行');
  assert.equal(result.initial.fitsViewport, true, '编辑器不得在 360px 视口横向溢出');
  assert.equal(result.initial.lineCount, 2, '纯文本应按行进入编辑器');
  assert.equal(result.initial.format, 'plain');
  assert.match(result.initial.fileAccept, /\.lrc/);
  assert.match(result.initial.fileAccept, /\.txt/);
  assert.match(result.initial.fileAccept, /\.ttml/);
  assert.deepEqual(result.timelineFlow, {
    timeline: true,
    seek: true,
    globalTimeMarkRemoved: true,
    restartedAt: 0,
    addButtonRemoved: true,
    newBlankRemoved: true,
  }, '逐行标记必须提供时间轴与从头试听，并移除独立新增按钮');
  assert.deepEqual(result.rowSpecificMark, {
    firstTime: '--:--.--',
    secondTime: '0:01.25',
    selected: 'true',
    focused: 'lyrics-editor-line-input-1',
    paused: true,
  }, '点击任意未完成歌词左侧时间块必须只标记该行并暂停聚焦');
  assert.equal(result.afterMark.format, 'lrc');
  assert.notEqual(result.afterMark.firstTime, '--:--.--', '标记当前行后必须出现行级时间');
  assert.equal(result.afterMark.paused, true, '标记当前行后必须立即暂停');
  assert.equal(result.afterMark.selected, 'true', '标记后必须留在当前行等待填写');
  assert.equal(result.afterMark.focused, 'lyrics-editor-line-input-0', '标记后焦点应进入当前行');
  assert.equal(result.afterMark.storageVersion, 1, '草稿必须带版本号');
  assert.equal(result.afterMark.storageHasAudioField, false, '草稿不得保存音频 Blob 或文件字段');
  assert.equal(result.afterMark.storedLineCount, 2, '部分打点也必须保留未打点行');
  assert.deepEqual(result.afterMark.storedRoles, [
    { isDuet: true, isBackground: false },
    { isDuet: false, isBackground: true },
  ], '草稿必须持久化逐行角色');
  assert.deepEqual(result.afterFirstCompletion, {
    resumed: true,
    lineCount: 2,
    selected: 'true',
    focused: 'lyrics-editor-line-input-1',
    completedState: 'complete',
    collapsedText: '第一行',
    hiddenEditor: true,
  }, '回车完成当前句后必须续播并前往下一句');
  assert.deepEqual(result.reopenedCompletedLine, {
    state: 'editing-complete',
    focused: 'lyrics-editor-line-input-0',
    text: '第一行',
  }, '点击已完成歌词必须重新展开并聚焦编辑，而不是暴露冗余操作');
  assert.deepEqual(result.afterLastMark, {
    paused: true,
    resumed: true,
    lineCount: 3,
    selected: 'true',
    focused: 'lyrics-editor-line-input-2',
    firstText: '第一行',
    secondText: '第二行',
    inheritedRole: 'background',
  }, '末行完成后必须追加空白行、继承角色且不能覆盖已有歌词');
  assert.equal(result.afterUndo.secondTime, '--:--.--', '撤销上次打点必须恢复最近一行原时间');
  assert.equal(result.afterUndo.undoDisabled, true, '撤销后不应继续存在可撤销打点');
  assert.deepEqual(result.roleRoundTrip, {
    rawHasMetadata: true,
    normalizedRoles: [
      { isDuet: true, isBackground: false },
      { isDuet: false, isBackground: true },
    ],
    parsedRoles: [
      { isDuet: true, isBackground: false },
      { isDuet: false, isBackground: true },
    ],
  }, '保存内容与再次解析都必须保留主唱、对唱、和声语义');
  assert.deepEqual(result.saveFeedback, {
    message: '歌词已暂存，保存歌曲后会同步。',
    status: '已暂存到歌曲',
  }, '移动端保存后必须显示明确的成功状态');
  assert.deepEqual(result.restoredRoles, { duet: 'duet', background: 'background' }, '重新挂载后必须从本地草稿恢复角色');
  assert.equal(result.jumped, 3.5, '点击已打点行必须跳转到行起始时间');
  assert.deepEqual(result.preview, { present: true, renderer: true, timing: 'line' });
  assert.match(result.durationError, /超过歌曲时长/);
  assert.ok(result.nonMonotonicCodes.includes('non-monotonic'), '必须报告非单调时间');
  assert.deepEqual(result.saveResult, {
    draftPresentBeforeSave: true,
    draftCleared: true,
    offsetMs: 120,
    wordCount: 0,
  }, '保存成功后必须清草稿并保留独立 offset');
  assert.equal(result.uploadedFormat, 'ttml', '上传 TTML 后必须自动识别');
  assert.equal(result.pastedFormat, 'lrc', '粘贴 LRC 后必须自动识别并载入');
  assert.match(result.malformedFeedback, /没有可用的歌词行|解析失败/, '解析错误必须给出反馈');
  assert.equal(result.blankCreationLineCount, 1, '从零创建后首次打点应自动创建歌词行');
  assert.match(result.emptyFeedback, /歌词内容不能为空/, '空内容必须阻止保存并给出反馈');
  assert.equal(result.isolated, true, 'songId 与 draftKey 草稿必须隔离');
  assert.deepEqual(pageErrors, [], '编辑器运行期间不应出现页面异常');

  console.log(JSON.stringify({ baseUrl, result }, null, 2));
} finally {
  await browser.close();
}
