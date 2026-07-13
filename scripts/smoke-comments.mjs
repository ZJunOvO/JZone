import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.JZONE_BASE_URL || 'http://localhost:3000';
const email = process.env.JZONE_TEST_EMAIL;
const password = process.env.JZONE_TEST_PASSWORD;
if (!email || !password) throw new Error('Missing JZONE_TEST_EMAIL or JZONE_TEST_PASSWORD');

const browser = await chromium.launch({ headless: process.env.JZONE_HEADFUL !== '1' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
await page.addInitScript(() => localStorage.setItem('jzone.pwaInstallDismissedAt', String(Date.now())));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const login = async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    if (await page.getByTestId('bottom-nav-home').isVisible().catch(() => false)) return;
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.waitForFunction(() => !document.querySelector('[data-testid="auth-submit"]')?.disabled);
    await page.getByTestId('auth-submit').click();
    const signedIn = await page.getByTestId('bottom-nav-home')
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (signedIn) return;
  }
  throw new Error(`登录后未进入主界面：${(await page.locator('body').innerText()).slice(0, 300)}`);
};

const jsonHeaders = {
  'access-control-allow-origin': '*',
  'content-profile': 'public',
  'content-type': 'application/json; charset=utf-8',
};

try {
  await mkdir('output/playwright', { recursive: true });
  await login();
  consoleErrors.length = 0;
  const currentUserId = await page.evaluate(async () => {
    const { supabase } = await import('/supabaseClient.ts');
    return (await supabase.auth.getUser()).data.user?.id;
  });
  assert(currentUserId, '无法读取当前测试用户');

  let activeSongId = null;
  let failCommentRequests = false;
  let insertedReply = null;
  let profileIntercepts = 0;
  const avatarData = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%23d9465f"/%3E%3Ccircle cx="48" cy="39" r="18" fill="white"/%3E%3Cpath d="M18 92c4-24 16-35 30-35s26 11 30 35" fill="white"/%3E%3C/svg%3E';
  const rootId = '10000000-0000-4000-8000-000000000001';
  const popularId = '10000000-0000-4000-8000-000000000002';
  const replyId = '20000000-0000-4000-8000-000000000001';
  const longText = '这是一条用于验证长评论折叠行为的评论。'.repeat(18);

  const makeRoot = (index) => ({
    id: index === 0 ? rootId : index === 1 ? popularId : `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    song_id: activeSongId,
    user_id: currentUserId,
    username: index === 1 ? '高赞听众' : '纸菌live',
    avatar_url: avatarData,
    text: index === 0 ? longText : `分页评论 ${index + 1}`,
    playback_time: 42 + index,
    parent_comment_id: null,
    deleted_at: null,
    likes_count: index === 1 ? 36 : index,
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
  });
  const roots = Array.from({ length: 21 }, (_, index) => makeRoot(index));
  const reply = {
    id: replyId,
    song_id: activeSongId,
    user_id: currentUserId,
    username: '回复者',
    avatar_url: avatarData,
    text: '这是一条单层回复',
    playback_time: 42,
    parent_comment_id: rootId,
    deleted_at: null,
    likes_count: 2,
    created_at: new Date().toISOString(),
  };

  await page.route('**/rest/v1/comments**', async (route) => {
    if (failCommentRequests) return route.abort('internetdisconnected');
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      insertedReply = {
        ...payload,
        id: '30000000-0000-4000-8000-000000000001',
        created_at: new Date().toISOString(),
        deleted_at: null,
        likes_count: 0,
      };
      return route.fulfill({ status: 201, headers: jsonHeaders, body: JSON.stringify(insertedReply) });
    }

    const songFilter = url.searchParams.get('song_id');
    if (songFilter?.startsWith('eq.')) activeSongId = songFilter.slice(3);
    roots.forEach((row) => { row.song_id = activeSongId; });
    reply.song_id = activeSongId;
    const parentFilter = url.searchParams.get('parent_comment_id');
    if (parentFilter?.startsWith('in.')) {
      const rows = [reply, ...(insertedReply ? [insertedReply] : [])];
      return route.fulfill({ status: 200, headers: { ...jsonHeaders, 'content-range': `0-${rows.length - 1}/${rows.length}` }, body: JSON.stringify(rows) });
    }
    const offsetMatch = request.headers().range?.match(/(\d+)-(\d+)/);
    const start = Number(url.searchParams.get('offset') ?? offsetMatch?.[1] ?? 0);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 0);
    const end = requestedLimit > 0 ? start + requestedLimit - 1 : Number(offsetMatch?.[2] ?? 20);
    const sorted = url.searchParams.get('order')?.includes('likes_count.desc')
      ? [...roots].sort((first, second) => second.likes_count - first.likes_count)
      : roots;
    const rows = sorted.slice(start, end + 1);
    return route.fulfill({ status: 200, headers: { ...jsonHeaders, 'content-range': `${start}-${start + rows.length - 1}/${roots.length}` }, body: JSON.stringify(rows) });
  });

  await page.route('**/rest/v1/profiles**', async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (!url.includes(currentUserId)) return route.continue();
    profileIntercepts += 1;
    return route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify([{ id: currentUserId, nickname: '纸菌live', avatar_url: null, avatar_frame_id: 'cloud_dream_v1' }]),
    });
  });
  await page.route('**/rest/v1/comment_likes**', (route) => route.fulfill({ status: 200, headers: jsonHeaders, body: '[]' }));
  await page.route('**/rest/v1/rpc/delete_comment', (route) => route.fulfill({ status: 200, headers: jsonHeaders, body: '"deleted"' }));

  await page.getByTestId('bottom-nav-library').evaluate((element) => element.click());
  const songRows = page.locator('[data-library-song="true"]:visible');
  await songRows.first().waitFor({ state: 'visible', timeout: 15000 });
  await songRows.first().evaluate((element) => element.click());
  await page.getByTestId('mini-player').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('mini-player').click();
  await page.getByTestId('player-transition-shell').waitFor({ state: 'visible', timeout: 3000 });
  await page.waitForTimeout(850);
  await page.getByTestId('player-open-comments').click();
  await page.getByTestId('comments-sheet').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator(`[data-comment-id="${rootId}"]`).waitFor({ state: 'visible', timeout: 5000 });

  assert(await page.getByText('这是一条单层回复').isVisible(), '单层回复没有归入根评论');
  const avatarFrameState = await page.locator(`[data-comment-id="${rootId}"] [data-avatar-frame-id]`).first().getAttribute('data-avatar-frame-id').catch(() => null);
  assert(avatarFrameState === 'cloud_dream_v1', `评论头像挂件未显示：${JSON.stringify({ avatarFrameState, profileIntercepts })}`);
  assert(await page.getByRole('button', { name: '加载更多评论' }).isVisible(), '分页入口未显示');
  await page.getByRole('button', { name: '加载更多评论' }).click();
  await page.getByText('分页评论 21').waitFor({ state: 'visible', timeout: 3000 });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(250);
  assert(await page.getByText('分页评论 21').isVisible(), '静默刷新收回了已经加载的评论分页');

  const rootElement = page.locator(`[data-comment-id="${rootId}"]`).first();
  const expandButton = rootElement.getByRole('button', { name: '展开' });
  await expandButton.scrollIntoViewIfNeeded();
  const scrollBefore = await page.locator('[data-testid="comments-sheet-panel"] .overflow-y-auto').evaluate((element) => element.scrollTop);
  await expandButton.click();
  const scrollAfter = await page.locator('[data-testid="comments-sheet-panel"] .overflow-y-auto').evaluate((element) => element.scrollTop);
  assert(Math.abs(scrollAfter - scrollBefore) <= 1, `展开长评论改变了当前滚动位置：${scrollBefore} -> ${scrollAfter}`);

  await page.getByRole('button', { name: '最多赞' }).click();
  await page.waitForTimeout(120);
  const firstRootId = await page.locator('[data-comment-id]').first().getAttribute('data-comment-id');
  assert(firstRootId === popularId, `最多赞排序错误：${firstRootId}`);

  await page.getByRole('button', { name: '最新' }).click();
  await page.waitForTimeout(120);
  await rootElement.getByRole('button', { name: '回复' }).first().click();
  await page.getByText('回复 纸菌live', { exact: false }).waitFor({ state: 'visible' });
  const input = page.locator('textarea[placeholder^="回复"]');
  await input.fill('自动化回复验证');
  await page.getByRole('button', { name: '发送回复' }).click();
  const inserted = page.locator('[data-comment-id="30000000-0000-4000-8000-000000000001"]');
  await inserted.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="comments-sheet"] textarea')?.value === '');
  await inserted.getByRole('button', { name: '删除评论' }).click();
  await inserted.getByRole('button', { name: '确认删除' }).click();
  await inserted.waitFor({ state: 'detached', timeout: 3000 });

  await rootElement.getByRole('button', { name: '生成评论分享图片' }).first().click();
  const shareDialog = page.getByRole('dialog', { name: '分享评论图片' });
  await shareDialog.waitFor({ state: 'visible', timeout: 3000 });
  await page.getByAltText('评论分享图片预览').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: 'output/playwright/comments-share-preview-390x844.png' });
  await shareDialog.getByRole('button', { name: '关闭' }).click();
  await shareDialog.waitFor({ state: 'detached', timeout: 3000 });

  failCommentRequests = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('刷新失败，当前显示上次内容').waitFor({ state: 'visible', timeout: 5000 });
  assert(await page.getByText(longText).isVisible(), '刷新失败时错误清空了已有评论');
  failCommentRequests = false;
  await page.getByRole('button', { name: '重试' }).click();
  await page.getByText('刷新失败，当前显示上次内容').waitFor({ state: 'detached', timeout: 5000 });

  const relevantErrors = consoleErrors.filter((message) => !/Comment fetch failed|Failed to load resource: net::ERR_(?:INTERNET_DISCONNECTED|CONNECTION_CLOSED)/i.test(message));
  assert(relevantErrors.length === 0, `评论专项测试产生控制台错误：${JSON.stringify(relevantErrors)}`);
  console.log(JSON.stringify({
    ok: true,
    pagination: true,
    reply: true,
    delete: true,
    avatarFrame: true,
    sorting: true,
    longComment: true,
    shareImage: true,
    silentRefreshPreservesWindow: true,
    retryPreservesContent: true,
  }, null, 2));
} finally {
  await browser.close();
}
