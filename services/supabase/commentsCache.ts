import type { Comment, CommentSort } from '../../types';

export const COMMENTS_CACHE_FRESH_MS = 60_000;
export const COMMENTS_CACHE_STALE_MS = 10 * 60_000;
export const COMMENTS_CACHE_MAX_ENTRIES = 40;

export interface CommentsCacheKey {
  userId: string;
  songId: string;
  sort: CommentSort;
}

export interface CommentsCachePage {
  rows: Comment[];
  hasMore: boolean;
  nextOffset: number;
  schemaVersion: 'legacy' | 'threaded';
}

export type CommentsCacheReadStatus = 'miss' | 'fresh' | 'stale';

export interface CommentsCacheReadResult {
  key: string;
  status: CommentsCacheReadStatus;
  value?: CommentsCachePage;
  ageMs?: number;
}

interface CommentsCacheEntry {
  key: string;
  userId: string;
  songId: string;
  sort: CommentSort;
  value: CommentsCachePage;
  createdAt: number;
  freshUntil: number;
  staleUntil: number;
}

const commentsCache = new Map<string, CommentsCacheEntry>();

const encodeKeyPart = (value: string) => encodeURIComponent(value);

export const getCommentsCacheKey = ({ userId, songId, sort }: CommentsCacheKey) => (
  `comments:${encodeKeyPart(userId)}:${encodeKeyPart(songId)}:${sort}`
);

const clonePage = (value: CommentsCachePage): CommentsCachePage => ({
  rows: value.rows.map((comment) => ({ ...comment })),
  hasMore: value.hasMore,
  nextOffset: value.nextOffset,
  schemaVersion: value.schemaVersion,
});

const removeExpiredEntries = (now: number) => {
  for (const [key, entry] of commentsCache) {
    if (entry.staleUntil <= now) commentsCache.delete(key);
  }
};

const touchEntry = (entry: CommentsCacheEntry) => {
  commentsCache.delete(entry.key);
  commentsCache.set(entry.key, entry);
};

export const readCommentsCache = (
  keyInput: CommentsCacheKey,
  now = Date.now(),
): CommentsCacheReadResult => {
  const key = getCommentsCacheKey(keyInput);
  const entry = commentsCache.get(key);
  if (!entry) return { key, status: 'miss' };
  if (entry.staleUntil <= now) {
    commentsCache.delete(key);
    return { key, status: 'miss' };
  }

  touchEntry(entry);
  return {
    key,
    status: entry.freshUntil <= now ? 'stale' : 'fresh',
    value: clonePage(entry.value),
    ageMs: Math.max(0, now - entry.createdAt),
  };
};

export const writeCommentsCache = (
  keyInput: CommentsCacheKey,
  value: CommentsCachePage,
  now = Date.now(),
) => {
  removeExpiredEntries(now);
  const key = getCommentsCacheKey(keyInput);
  const entry: CommentsCacheEntry = {
    key,
    userId: keyInput.userId,
    songId: keyInput.songId,
    sort: keyInput.sort,
    value: clonePage(value),
    createdAt: now,
    freshUntil: now + COMMENTS_CACHE_FRESH_MS,
    staleUntil: now + COMMENTS_CACHE_FRESH_MS + COMMENTS_CACHE_STALE_MS,
  };

  commentsCache.delete(key);
  commentsCache.set(key, entry);
  while (commentsCache.size > COMMENTS_CACHE_MAX_ENTRIES) {
    const oldestKey = commentsCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    commentsCache.delete(oldestKey);
  }
  return key;
};

export const invalidateCommentsCache = ({
  userId,
  songId,
  sort,
}: {
  userId: string;
  songId: string;
  sort?: CommentSort;
}) => {
  let removed = 0;
  for (const [key, entry] of commentsCache) {
    if (entry.userId !== userId || entry.songId !== songId) continue;
    if (sort && entry.sort !== sort) continue;
    commentsCache.delete(key);
    removed += 1;
  }
  return removed;
};

export const clearCommentsCache = () => {
  commentsCache.clear();
};

export const getCommentsCacheSize = () => commentsCache.size;
