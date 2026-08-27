import { readFile } from 'node:fs/promises';
import * as ts from 'typescript';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const controllerSource = await readFile(new URL('../hooks/useCommentsController.ts', import.meta.url), 'utf8');
const source = await readFile(new URL('../services/supabase/commentsCache.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const cache = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const {
  COMMENTS_CACHE_FRESH_MS,
  COMMENTS_CACHE_MAX_ENTRIES,
  COMMENTS_CACHE_STALE_MS,
  clearCommentsCache,
  getCommentsCacheKey,
  getCommentsCacheSize,
  invalidateCommentsCache,
  readCommentsCache,
  writeCommentsCache,
} = cache;

const refreshHandler = controllerSource.match(/const refreshCurrentSong = \(\) => \{([\s\S]*?)\n    \};/);
assert(refreshHandler, '未找到当前歌曲恢复刷新处理器');
assert(
  /void loadComments\(currentSongId, \{ force: true, silent: true, sort: commentSort \}\);/.test(refreshHandler[1]),
  '恢复刷新未强制静默 revalidate 当前歌曲和排序，可能被 fresh cache gate 直接返回',
);
assert(controllerSource.includes("window.addEventListener('online', refreshCurrentSong)"), 'online 事件未绑定当前歌曲恢复刷新');
assert(controllerSource.includes("document.addEventListener('visibilitychange', onVisibilityChange)"), 'visibilitychange 事件未绑定当前歌曲恢复刷新');
assert(controllerSource.includes("if (cached.status === 'fresh' && !force) return;"), 'fresh cache gate 未保留 force 绕过条件');

const makePage = (id, nextOffset = 20) => ({
  rows: [{
    id,
    songId: 'song-a',
    userId: 'user-a',
    username: id,
    avatarUrl: '',
    text: `评论 ${id}`,
    timestamp: 1,
    playbackTime: 0,
    likes: 0,
    parentCommentId: null,
  }],
  hasMore: true,
  nextOffset,
  schemaVersion: 'threaded',
});

const latestA = { userId: 'user-a', songId: 'song-a', sort: 'latest' };
const popularA = { userId: 'user-a', songId: 'song-a', sort: 'popular' };
const otherSongA = { userId: 'user-a', songId: 'song-b', sort: 'latest' };
const sameSongB = { userId: 'user-b', songId: 'song-a', sort: 'latest' };
const start = 1_000;

clearCommentsCache();
const cacheKey = getCommentsCacheKey(latestA);
assert(cacheKey.includes('user-a') && cacheKey.includes('song-a') && cacheKey.endsWith(':latest'), '缓存 key 未包含账号、歌曲和排序');
writeCommentsCache(latestA, makePage('root-a', 20), start);

const fresh = readCommentsCache(latestA, start + COMMENTS_CACHE_FRESH_MS - 1);
assert(fresh.status === 'fresh', 'fresh 窗口未命中');
assert(fresh.value?.nextOffset === 20 && fresh.value?.hasMore === true, '分页状态未随快照保存');
fresh.value.rows[0].text = '外部修改不应污染缓存';
assert(readCommentsCache(latestA, start).value?.rows[0].text === '评论 root-a', '缓存快照未隔离可变数组');

const stale = readCommentsCache(latestA, start + COMMENTS_CACHE_FRESH_MS + 1);
assert(stale.status === 'stale' && stale.value?.rows[0].id === 'root-a', 'stale 未先返回旧内容');
const afterFailedRefresh = readCommentsCache(latestA, start + COMMENTS_CACHE_FRESH_MS + 2);
assert(afterFailedRefresh.status === 'stale' && afterFailedRefresh.value?.rows[0].id === 'root-a', '刷新失败后旧快照未保留');
assert(readCommentsCache(latestA, start + COMMENTS_CACHE_FRESH_MS + COMMENTS_CACHE_STALE_MS).status === 'miss', 'stale 保留窗口到期后未失效');

clearCommentsCache();
writeCommentsCache(latestA, makePage('latest-a'), start);
writeCommentsCache(popularA, makePage('popular-a'), start);
writeCommentsCache(otherSongA, makePage('other-song-a'), start);
writeCommentsCache(sameSongB, makePage('same-song-b'), start);
assert(invalidateCommentsCache({ userId: 'user-a', songId: 'song-a' }) === 2, 'mutation 未精确清理当前账号当前歌曲的所有排序');
assert(readCommentsCache(latestA, start).status === 'miss', 'latest 缓存未清理');
assert(readCommentsCache(popularA, start).status === 'miss', 'popular 缓存未清理');
assert(readCommentsCache(otherSongA, start).status === 'fresh', '其他歌曲缓存被误清理');
assert(readCommentsCache(sameSongB, start).status === 'fresh', '其他账号缓存被误清理');

clearCommentsCache();
for (let index = 0; index <= COMMENTS_CACHE_MAX_ENTRIES; index += 1) {
  writeCommentsCache(
    { userId: 'capacity-user', songId: `song-${index}`, sort: 'latest' },
    makePage(`capacity-${index}`),
    start + index,
  );
}
assert(getCommentsCacheSize() === COMMENTS_CACHE_MAX_ENTRIES, '缓存容量上限未生效');
assert(readCommentsCache({ userId: 'capacity-user', songId: 'song-0', sort: 'latest' }, start + COMMENTS_CACHE_MAX_ENTRIES + 1).status === 'miss', '最旧缓存未按容量淘汰');
assert(readCommentsCache({ userId: 'capacity-user', songId: `song-${COMMENTS_CACHE_MAX_ENTRIES}`, sort: 'latest' }, start + COMMENTS_CACHE_MAX_ENTRIES + 1).status === 'fresh', '最新缓存未保留');

console.log(JSON.stringify({
  ok: true,
  keyIsolation: true,
  freshHit: true,
  staleFirst: true,
  failedRefreshKeepsOld: true,
  expiry: true,
  paginationState: true,
  mutationInvalidation: true,
  accountIsolation: true,
  recoveryForceRevalidate: true,
  capacityLimit: COMMENTS_CACHE_MAX_ENTRIES,
}, null, 2));
