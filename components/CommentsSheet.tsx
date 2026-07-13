import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useStore } from '../store';
import { Icons } from './Icons';
import type { Comment } from '../types';
import { useAuth } from '../auth';
import { CommentRowSkeleton } from './Skeletons';
import { getFallbackAvatarUrl, getQQAvatarUrl } from '../utils/avatar';
import { AvatarWithFrame } from './AvatarWithFrame';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';
import { CommentItem } from './comments/CommentItem';

const CommentShareModal = React.lazy(() => import('./comments/CommentShareModal').then((module) => ({
  default: module.CommentShareModal,
})));

interface CommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const createTemporaryCommentId = () => globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `comment_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ isOpen, onClose }) => {
  const {
    comments,
    commentsLoading,
    commentsStatus,
    commentsError,
    commentsHasMore,
    commentsLoadingMore,
    commentSort,
    commentsSchemaReady,
    getCurrentSong,
    playerState,
    addComment,
    deleteComment,
    retryComments,
    loadMoreComments,
    setCommentSort,
    seek,
    toggleCommentLike,
  } = useStore();
  const { user } = useAuth();
  const { displayName, resolvedAvatarUrl, profile } = useCurrentArtistProfile();
  const [inputText, setInputText] = React.useState('');
  const [anchorTime, setAnchorTime] = React.useState<number | null>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [keyboardOffset, setKeyboardOffset] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<{ parentId: string; username: string } | null>(null);
  const [shareComment, setShareComment] = React.useState<Comment | null>(null);
  const reduceMotion = useReducedMotion();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputWrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const currentSong = getCurrentSong();
  const songComments = React.useMemo(
    () => comments.filter((comment) => comment.songId === currentSong?.id),
    [comments, currentSong?.id],
  );
  const rootComments = React.useMemo(() => songComments
    .filter((comment) => !comment.parentCommentId)
    .sort((first, second) => commentSort === 'popular'
      ? second.likes - first.likes || second.timestamp - first.timestamp
      : second.timestamp - first.timestamp), [commentSort, songComments]);
  const repliesByRoot = React.useMemo(() => {
    const result = new Map<string, Comment[]>();
    songComments.forEach((comment) => {
      if (!comment.parentCommentId) return;
      const replies = result.get(comment.parentCommentId) ?? [];
      replies.push(comment);
      result.set(comment.parentCommentId, replies);
    });
    result.forEach((replies) => replies.sort((first, second) => first.timestamp - second.timestamp));
    return result;
  }, [songComments]);

  const myAvatarUrl = resolvedAvatarUrl || getQQAvatarUrl(user?.email) || getFallbackAvatarUrl(user?.id || 'me');
  const myAvatarFrameId = profile?.avatar_frame_id ?? null;

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardOffset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  React.useEffect(() => {
    setReplyTarget(null);
    setShareComment(null);
  }, [currentSong?.id, isOpen]);

  const handleFocus = () => {
    setIsFocused(true);
    if (anchorTime === null) setAnchorTime(playerState.currentTime);
    window.setTimeout(() => inputWrapRef.current?.scrollIntoView({ block: 'end' }), 50);
  };

  const handleReply = (parentId: string, username: string) => {
    setReplyTarget({ parentId, username });
    const parent = songComments.find((comment) => comment.id === parentId);
    if (parent) setAnchorTime(parent.playbackTime);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputText.trim() || !currentSong || isSubmitting || !user) return;
    setIsSubmitting(true);
    const newComment: Comment = {
      id: createTemporaryCommentId(),
      songId: currentSong.id,
      userId: user.id,
      username: displayName || user.email || 'Member',
      avatarUrl: myAvatarUrl,
      avatarFrameId: myAvatarFrameId,
      text: inputText.trim(),
      timestamp: Date.now(),
      playbackTime: anchorTime ?? playerState.currentTime,
      parentCommentId: replyTarget?.parentId ?? null,
      likes: 0,
    };
    try {
      await addComment(newComment);
      setInputText('');
      setAnchorTime(null);
      setReplyTarget(null);
      if (!newComment.parentCommentId && scrollRef.current) scrollRef.current.scrollTop = 0;
    } catch {
      // 保留输入内容与回复目标，网络恢复后可直接重试。
    } finally {
      setIsSubmitting(false);
    }
  };

  const canDelete = React.useCallback((comment: Comment) => (
    Boolean(user && (comment.userId === user.id || currentSong?.ownerId === user.id))
  ), [currentSong?.ownerId, user]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div className="absolute inset-0 z-[60] flex flex-col justify-end" data-testid="comments-sheet" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0.1 : 0.32 }}>
          <motion.div className="absolute inset-0 bg-black/60" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: 'easeOut' }} />

          <motion.div
            className="relative flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[32px] border-t border-white/10 bg-zinc-900/95 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)] will-change-transform transform-gpu"
            data-testid="comments-sheet-panel"
            initial={reduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.88 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.84 }}
            transition={reduceMotion ? { duration: 0.1 } : { type: 'spring', stiffness: 320, damping: 32, mass: 0.92 }}
          >
            <div className="relative shrink-0 border-b border-white/5 px-6 pb-3 pt-5">
              <div className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 cursor-pointer rounded-full bg-white/20" onClick={onClose} />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight text-white">评论 <span className="ml-1 text-sm font-medium text-zinc-500">{songComments.length}</span></h3>
                <button type="button" onClick={onClose} data-testid="comments-sheet-close" className="-mr-2 rounded-full p-2 text-white/40 transition-colors hover:text-white" aria-label="关闭评论区"><Icons.X size={20} strokeWidth={2.5} /></button>
              </div>
              <div className="mt-3 grid w-[168px] grid-cols-2 rounded-lg bg-black/25 p-0.5" aria-label="评论排序">
                {(['latest', 'popular'] as const).map((sort) => (
                  <button
                    type="button"
                    key={sort}
                    onClick={() => setCommentSort(sort)}
                    disabled={sort === 'popular' && !commentsSchemaReady}
                    title={sort === 'popular' && !commentsSchemaReady ? '完成评论数据库升级后可用' : undefined}
                    className={`h-7 rounded-md text-xs font-bold transition-colors ${commentSort === sort ? 'bg-white/12 text-white' : 'text-zinc-500 hover:text-zinc-300'} ${sort === 'popular' && !commentsSchemaReady ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {sort === 'latest' ? '最新' : '最多赞'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar" ref={scrollRef}>
              <div className="mt-4 space-y-6 pb-32">
                {commentsStatus === 'error' ? (
                  <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${songComments.length ? 'border-amber-400/15 bg-amber-400/[0.06]' : 'border-red-400/15 bg-red-400/[0.06]'}`} role="alert">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-zinc-200">{songComments.length ? '刷新失败，当前显示上次内容' : '评论暂时加载不出来'}</div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500">{commentsError}</div>
                    </div>
                    <button type="button" onClick={retryComments} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15">重试</button>
                  </div>
                ) : null}

                {commentsLoading && !songComments.length
                  ? Array.from({ length: 4 }).map((_, index) => <CommentRowSkeleton key={`comment-skeleton-${index}`} />)
                  : rootComments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      replies={repliesByRoot.get(comment.id) ?? []}
                      canDelete={canDelete}
                      canReply={commentsSchemaReady}
                      onSeek={seek}
                      onLike={(commentId) => void toggleCommentLike(commentId)}
                      onReply={handleReply}
                      onDelete={deleteComment}
                      onShare={setShareComment}
                    />
                  ))}

                {commentsStatus === 'ready' && rootComments.length === 0 ? <div className="py-10 text-center text-sm text-zinc-500">暂无评论，来留下第一条吧</div> : null}

                {commentsHasMore ? (
                  <button type="button" onClick={() => void loadMoreComments()} disabled={commentsLoadingMore} className="mx-auto flex h-10 items-center justify-center rounded-full bg-white/[0.06] px-5 text-sm font-bold text-zinc-300 transition hover:bg-white/10 disabled:text-zinc-600">
                    {commentsLoadingMore ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> : '加载更多评论'}
                  </button>
                ) : null}
              </div>
            </div>

            <div ref={inputWrapRef} className="z-20 shrink-0 border-t border-white/5 bg-zinc-900 px-4 pt-3" style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 16px + ${keyboardOffset}px)` }}>
              {replyTarget ? (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-white/[0.055] px-3 py-2 text-xs">
                  <span className="truncate text-zinc-400">回复 <strong className="text-zinc-200">{replyTarget.username}</strong></span>
                  <button type="button" onClick={() => setReplyTarget(null)} className="ml-3 shrink-0 text-zinc-500 hover:text-white" aria-label="取消回复"><Icons.X size={14} /></button>
                </div>
              ) : null}

              {(isFocused || anchorTime !== null) ? (
                <div className="mb-3 flex items-center justify-between px-2 animate-[fadeIn_0.2s_ease-out]">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold uppercase text-zinc-400">评论时间点</span>
                    <div className="flex items-center rounded-lg border border-white/5 bg-zinc-800 p-0.5">
                      <button type="button" onClick={() => setAnchorTime(Math.max(0, (anchorTime ?? playerState.currentTime) - 1))} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-white"><Icons.Minus size={12} /></button>
                      <span className="w-12 text-center font-mono text-xs font-bold tabular-nums text-blue-400">{formatTime(anchorTime ?? playerState.currentTime)}</span>
                      <button type="button" onClick={() => setAnchorTime((anchorTime ?? playerState.currentTime) + 1)} className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-white"><Icons.Plus size={12} /></button>
                    </div>
                  </div>
                  <button type="button" onClick={() => setAnchorTime(playerState.currentTime)} className="flex items-center gap-1.5 rounded-full bg-zinc-800/50 px-2 py-1 text-[10px] font-bold text-zinc-500 hover:text-red-400"><Icons.RotateCcw size={10} />重置同步</button>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <AvatarWithFrame src={myAvatarUrl} frameId={myAvatarFrameId} size={32} className="mb-1 shrink-0" alt="我的头像" />
                <div className="flex-1 rounded-[20px] border border-white/5 bg-zinc-800/80 px-4 py-2 transition-all focus-within:border-white/20 focus-within:bg-zinc-800">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={inputText}
                    maxLength={2000}
                    onChange={(event) => setInputText(event.target.value)}
                    onFocus={handleFocus}
                    onBlur={() => setIsFocused(false)}
                    placeholder={replyTarget ? `回复 ${replyTarget.username}` : '发一条友善的评论...'}
                    className="max-h-24 min-h-7 w-full resize-none bg-transparent py-1 text-[15px] text-white outline-none placeholder:text-zinc-500"
                  />
                </div>
                <button type="submit" disabled={!inputText.trim() || isSubmitting} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all duration-300 ${inputText.trim() && !isSubmitting ? 'scale-100 bg-red-500 text-white shadow-lg shadow-red-500/30' : 'scale-90 bg-zinc-800 text-zinc-600'}`} aria-label={replyTarget ? '发送回复' : '发送评论'}>
                  {isSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> : <Icons.Send size={18} fill={inputText.trim() ? 'currentColor' : 'none'} className={inputText.trim() ? '-ml-0.5' : ''} />}
                </button>
              </form>
            </div>
          </motion.div>

          <React.Suspense fallback={null}>
            {currentSong ? <CommentShareModal comment={shareComment} song={currentSong} onClose={() => setShareComment(null)} /> : null}
          </React.Suspense>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
