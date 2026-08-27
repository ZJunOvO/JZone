import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Comment, CommentLoadStatus, CommentSort } from '../types';
import type { CommentRow } from '../services/supabase/types';
import { MOCK_COMMENTS } from '../constants';
import { hasSupabaseConfig } from '../supabaseClient';
import { supabaseApi } from '../supabaseApi';
import { feedback } from '../components/feedback';
import { getFallbackAvatarUrl, getQQAvatarUrl } from '../utils/avatar';
import {
  getCommentsCacheKey,
  invalidateCommentsCache,
  readCommentsCache,
  writeCommentsCache,
  type CommentsCachePage,
} from '../services/supabase/commentsCache';

const COMMENT_PAGE_SIZE = 20;

const mapCommentRow = (row: CommentRow): Comment => ({
  id: row.id,
  songId: row.song_id,
  userId: row.user_id,
  username: row.username,
  avatarUrl: row.avatar_url,
  avatarFrameId: row.avatar_frame_id ?? null,
  text: row.text,
  timestamp: new Date(row.created_at).getTime(),
  playbackTime: row.playback_time,
  parentCommentId: row.parent_comment_id ?? null,
  isDeleted: Boolean(row.deleted_at),
  likes: Number(row.likes_count) || 0,
  isLiked: row.user_liked ?? false,
});

interface UseCommentsControllerOptions {
  currentSongId: string | null;
  authStatus: 'loading' | 'signed_out' | 'signed_in' | 'misconfigured';
  user: User | null;
}

interface LoadOptions {
  append?: boolean;
  force?: boolean;
  silent?: boolean;
  sort?: CommentSort;
}

export const useCommentsController = ({ currentSongId, authStatus, user }: UseCommentsControllerOptions) => {
  const [comments, setComments] = useState<Comment[]>(hasSupabaseConfig ? [] : MOCK_COMMENTS);
  const [commentsStatus, setCommentsStatus] = useState<CommentLoadStatus>(hasSupabaseConfig ? 'idle' : 'ready');
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentSort, setCommentSortState] = useState<CommentSort>('latest');
  const [commentsSchemaReady, setCommentsSchemaReady] = useState(false);
  const commentsRef = useRef(comments);
  const pageOffsetRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const commentsRequestRef = useRef(new Map<string, { sequence: number; token: symbol }>());

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    requestSequenceRef.current += 1;
    pageOffsetRef.current = 0;
    setComments([]);
    setCommentsError(null);
    setCommentsHasMore(false);
    setCommentsLoadingMore(false);
    setCommentsStatus('idle');
    setCommentsSchemaReady(false);
    commentsRequestRef.current.clear();
  }, [user?.id]);

  const loadComments = useCallback(async (songId: string, options: LoadOptions = {}) => {
    if (!hasSupabaseConfig || authStatus !== 'signed_in' || !user) return;
    const append = options.append ?? false;
    const force = options.force ?? false;
    const silent = options.silent ?? false;
    const sort = options.sort ?? commentSort;
    const cacheKey = getCommentsCacheKey({ userId: user.id, songId, sort });
    const activeRequest = commentsRequestRef.current.get(cacheKey);
    if (activeRequest?.sequence === requestSequenceRef.current) return;
    if (activeRequest) commentsRequestRef.current.delete(cacheKey);
    const requestSequence = ++requestSequenceRef.current;
    const cached = append ? undefined : readCommentsCache({ userId: user.id, songId, sort });

    if (cached?.value) {
      setComments(cached.value.rows);
      pageOffsetRef.current = cached.value.nextOffset;
      setCommentsSchemaReady(cached.value.schemaVersion === 'threaded');
      setCommentsHasMore(cached.value.hasMore);
      setCommentsError(null);
      setCommentsLoadingMore(false);
      setCommentsStatus('ready');
      if (cached.status === 'fresh' && !force) return;
    }

    const offset = append ? pageOffsetRef.current : 0;
    const loadedRootCount = (cached?.value?.rows ?? commentsRef.current).filter((comment) => (
      comment.songId === songId && !comment.parentCommentId
    )).length;
    const limit = !append && silent
      ? Math.max(COMMENT_PAGE_SIZE, loadedRootCount)
      : COMMENT_PAGE_SIZE;
    const requestToken = Symbol(cacheKey);
    commentsRequestRef.current.set(cacheKey, { sequence: requestSequence, token: requestToken });

    if (append) setCommentsLoadingMore(true);
    else if (!silent) setCommentsStatus('loading');
    setCommentsError(null);

    try {
      const page = await supabaseApi.fetchCommentsPage({
        songId,
        currentUserId: user.id,
        offset,
        limit,
        sort,
      });
      if (requestSequence !== requestSequenceRef.current) return;

      const nextRows = page.rows.map(mapCommentRow);
      const currentRows = commentsRef.current.filter((comment) => comment.songId === songId);
      const mergedRows = append
        ? [...new Map([...currentRows, ...nextRows].map((comment) => [comment.id, comment])).values()]
        : nextRows;
      const cachePage: CommentsCachePage = {
        rows: mergedRows,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
        schemaVersion: page.schemaVersion,
      };
      writeCommentsCache({ userId: user.id, songId, sort }, cachePage);
      setComments(mergedRows);
      pageOffsetRef.current = page.nextOffset;
      setCommentsSchemaReady(page.schemaVersion === 'threaded');
      setCommentsHasMore(page.hasMore);
      setCommentsStatus('ready');
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return;
      console.error('Comment fetch failed:', error);
      setCommentsError('评论加载失败，请检查网络后重试');
      setCommentsStatus('error');
    } finally {
      if (commentsRequestRef.current.get(cacheKey)?.token === requestToken) {
        commentsRequestRef.current.delete(cacheKey);
      }
      if (requestSequence === requestSequenceRef.current) setCommentsLoadingMore(false);
    }
  }, [authStatus, commentSort, user]);

  useEffect(() => {
    if (!currentSongId) {
      requestSequenceRef.current += 1;
      pageOffsetRef.current = 0;
      commentsRequestRef.current.clear();
      if (hasSupabaseConfig) setComments([]);
      setCommentsError(null);
      setCommentsHasMore(false);
      setCommentsLoadingMore(false);
      setCommentsSchemaReady(false);
      setCommentsStatus(hasSupabaseConfig ? 'idle' : 'ready');
      return;
    }
    if (!hasSupabaseConfig) return;
    pageOffsetRef.current = 0;
    void loadComments(currentSongId, { sort: commentSort });
  }, [commentSort, currentSongId, loadComments]);

  useEffect(() => {
    if (!currentSongId || !hasSupabaseConfig) return;
    const refreshCurrentSong = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void loadComments(currentSongId, { force: true, silent: true, sort: commentSort });
      }
    };
    const onVisibilityChange = () => refreshCurrentSong();
    window.addEventListener('online', refreshCurrentSong);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', refreshCurrentSong);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [commentSort, currentSongId, loadComments]);

  const setCommentSort = useCallback((sort: CommentSort) => {
    if (sort === commentSort) return;
    pageOffsetRef.current = 0;
    setCommentSortState(sort);
  }, [commentSort]);

  const invalidateCommentsForSong = useCallback((songId: string) => {
    if (!user?.id) return;
    invalidateCommentsCache({ userId: user.id, songId });
    requestSequenceRef.current += 1;
    (['latest', 'popular'] as const).forEach((sort) => {
      commentsRequestRef.current.delete(getCommentsCacheKey({ userId: user.id, songId, sort }));
    });
  }, [user?.id]);

  const retryComments = useCallback(() => {
    if (currentSongId) void loadComments(currentSongId, { force: true, sort: commentSort });
  }, [commentSort, currentSongId, loadComments]);

  const loadMoreComments = useCallback(async () => {
    if (!currentSongId || !commentsHasMore || commentsLoadingMore) return;
    await loadComments(currentSongId, { append: true, silent: true, sort: commentSort });
  }, [commentSort, commentsHasMore, commentsLoadingMore, currentSongId, loadComments]);

  const addComment = useCallback(async (comment: Comment) => {
    let normalizedComment = { ...comment, isPending: hasSupabaseConfig };
    if (hasSupabaseConfig && user) {
      try {
        const profile = await supabaseApi.fetchProfile(user.id);
        let avatarUrl = comment.avatarUrl;
        if (profile?.avatar_url) {
          try {
            avatarUrl = await supabaseApi.createSignedAvatarUrl(profile.avatar_url, 3600);
          } catch {
            avatarUrl = profile.avatar_url;
          }
        } else {
          avatarUrl = getQQAvatarUrl(user.email) || getFallbackAvatarUrl(user.id);
        }
        normalizedComment = {
          ...normalizedComment,
          username: profile?.nickname?.trim() || user.email || comment.username,
          avatarUrl,
          avatarFrameId: profile?.avatar_frame_id ?? null,
        };
      } catch {
        normalizedComment = {
          ...normalizedComment,
          username: user.email || comment.username,
          avatarUrl: getQQAvatarUrl(user.email) || getFallbackAvatarUrl(user.id),
        };
      }
    }

    setComments((previous) => [normalizedComment, ...previous]);
    if (!hasSupabaseConfig || !user) return;

    try {
      const row = await supabaseApi.insertComment({
        songId: normalizedComment.songId,
        userId: user.id,
        username: normalizedComment.username,
        avatarUrl: normalizedComment.avatarUrl,
        text: normalizedComment.text,
        playbackTime: normalizedComment.playbackTime,
        parentCommentId: normalizedComment.parentCommentId,
      });
      const persisted = {
        ...mapCommentRow(row),
        avatarFrameId: normalizedComment.avatarFrameId,
        isPending: false,
      };
      if ('parent_comment_id' in row && 'likes_count' in row) setCommentsSchemaReady(true);
      setComments((previous) => previous.map((item) => (
        item.id === normalizedComment.id ? persisted : item
      )));
      invalidateCommentsForSong(normalizedComment.songId);
      setCommentsStatus('ready');
    } catch (error) {
      console.error('Comment insert failed:', error);
      setComments((previous) => previous.filter((item) => item.id !== normalizedComment.id));
      feedback.error('评论发送失败，请检查网络后重试');
      throw error;
    }
  }, [invalidateCommentsForSong, user]);

  const toggleCommentLike = useCallback(async (commentId: string) => {
    if (!user) return;
    const target = commentsRef.current.find((comment) => comment.id === commentId);
    if (!target || target.isDeleted || target.isPending) return;
    const nextLiked = !target.isLiked;
    setComments((previous) => previous.map((comment) => (
      comment.id === commentId
        ? { ...comment, isLiked: nextLiked, likes: Math.max(0, comment.likes + (nextLiked ? 1 : -1)) }
        : comment
    )));

    if (!hasSupabaseConfig) return;
    try {
      if (nextLiked) await supabaseApi.addCommentLike(commentId, user.id);
      else await supabaseApi.removeCommentLike(commentId, user.id);
      invalidateCommentsForSong(target.songId);
    } catch (error) {
      console.error('Comment like update failed:', error);
      setComments((previous) => previous.map((comment) => comment.id === commentId ? target : comment));
      feedback.error('点赞状态同步失败，已恢复原状态');
    }
  }, [invalidateCommentsForSong, user]);

  const deleteComment = useCallback(async (commentId: string) => {
    const target = commentsRef.current.find((comment) => comment.id === commentId);
    if (!target) return;
    const hasReplies = commentsRef.current.some((comment) => comment.parentCommentId === commentId);
    setComments((previous) => hasReplies
      ? previous.map((comment) => comment.id === commentId ? { ...comment, text: '', isDeleted: true } : comment)
      : previous.filter((comment) => comment.id !== commentId));

    if (!hasSupabaseConfig) return;
    try {
      const result = await supabaseApi.deleteComment(commentId);
      setComments((previous) => result === 'soft_deleted'
        ? previous.map((comment) => comment.id === commentId ? { ...comment, text: '', isDeleted: true } : comment)
        : previous.filter((comment) => comment.id !== commentId));
      invalidateCommentsForSong(target.songId);
      feedback.success('评论已删除');
    } catch (error) {
      console.error('Comment delete failed:', error);
      setComments((previous) => {
        if (previous.some((comment) => comment.id === commentId)) {
          return previous.map((comment) => comment.id === commentId ? target : comment);
        }
        return [target, ...previous];
      });
      feedback.error('删除评论失败，请稍后重试');
      throw error;
    }
  }, [invalidateCommentsForSong]);

  return {
    comments,
    commentsStatus,
    commentsError,
    commentsLoading: commentsStatus === 'loading',
    commentsHasMore,
    commentsLoadingMore,
    commentSort,
    commentsSchemaReady,
    setCommentSort,
    retryComments,
    loadMoreComments,
    addComment,
    toggleCommentLike,
    deleteComment,
  };
};
