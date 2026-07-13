import React from 'react';
import type { Comment } from '../../types';
import { AvatarWithFrame } from '../AvatarWithFrame';
import { Icons } from '../Icons';

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
};

interface CommentItemProps {
  comment: Comment;
  replies?: Comment[];
  isReply?: boolean;
  rootCommentId?: string;
  canDelete: (comment: Comment) => boolean;
  canReply: boolean;
  onSeek: (time: number) => void;
  onLike: (commentId: string) => void;
  onReply: (parentCommentId: string, username: string) => void;
  onDelete: (commentId: string) => Promise<void>;
  onShare: (comment: Comment) => void;
}

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  replies = [],
  isReply = false,
  rootCommentId,
  canDelete,
  canReply,
  onSeek,
  onLike,
  onReply,
  onDelete,
  onShare,
}) => {
  const textRef = React.useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [canExpand, setCanExpand] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded || comment.isDeleted) return;
    setCanExpand(element.scrollHeight > element.clientHeight + 1);
  }, [comment.isDeleted, comment.text, expanded]);

  const replyParentId = rootCommentId ?? comment.id;

  return (
    <div className={isReply ? 'relative pl-8' : ''} data-comment-id={comment.id}>
      {isReply ? <div className="absolute bottom-0 left-[17px] top-0 w-px bg-white/[0.07]" aria-hidden /> : null}
      <div className={`flex gap-3 ${comment.isVerified ? 'rounded-2xl border border-white/5 bg-white/5 p-3 -mx-3' : ''}`}>
        <AvatarWithFrame
          src={comment.avatarUrl}
          frameId={comment.avatarFrameId}
          size={isReply ? 30 : 36}
          className="shrink-0"
          alt={comment.username}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <span className={`truncate text-sm font-bold ${comment.isVerified ? 'text-white' : 'text-zinc-300'}`}>{comment.username}</span>
            {comment.isVerified ? <Icons.BadgeCheck size={14} className="shrink-0 fill-blue-500/20 text-blue-400" /> : null}
            <span className="shrink-0 text-[10px] font-medium text-zinc-500">{formatRelativeTime(comment.timestamp)}</span>
            {comment.isPending ? <span className="shrink-0 text-[10px] text-zinc-600">发送中</span> : null}
          </div>

          {comment.isDeleted ? (
            <p className="text-sm italic text-zinc-600">该评论已删除</p>
          ) : (
            <>
              <p
                ref={textRef}
                className={`break-words text-[15px] font-normal leading-relaxed text-zinc-100 ${expanded ? '' : 'line-clamp-5'}`}
              >
                {comment.text}
              </p>
              {canExpand ? (
                <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-xs font-bold text-zinc-500 hover:text-zinc-300">
                  {expanded ? '收起' : '展开'}
                </button>
              ) : null}
            </>
          )}

          {!comment.isDeleted ? (
            <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-4 gap-y-2">
              {!isReply ? (
                <button type="button" onClick={() => onSeek(comment.playbackTime)} className="group/time flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 transition-colors hover:bg-blue-500/30 active:bg-blue-500/40">
                  <Icons.Play size={9} fill="currentColor" className="text-blue-400 group-hover/time:text-blue-300" />
                  <span className="font-mono text-[10px] font-bold tracking-tight text-blue-400 group-hover/time:text-blue-300">{formatTime(comment.playbackTime)}</span>
                </button>
              ) : null}
              {canReply ? <button type="button" onClick={() => onReply(replyParentId, comment.username)} className="text-[11px] font-bold text-zinc-500 transition-colors hover:text-zinc-300">回复</button> : null}
              <button type="button" onClick={() => onLike(comment.id)} className={`flex items-center gap-1 transition-colors ${comment.isLiked ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-300'}`} aria-label={comment.isLiked ? '取消点赞此评论' : '点赞此评论'}>
                <Icons.Star size={12} strokeWidth={2} fill={comment.isLiked ? 'currentColor' : 'none'} />
                <span className="text-[11px] font-medium">{comment.likes}</span>
              </button>
              <button type="button" onClick={() => onShare(comment)} className="text-zinc-500 transition-colors hover:text-zinc-300" aria-label="生成评论分享图片">
                <Icons.Share2 size={13} />
              </button>
              {canReply && canDelete(comment) ? (
                confirmDelete ? (
                  <span className="flex items-center gap-2 text-[11px]">
                    <button type="button" onClick={() => void onDelete(comment.id)} className="font-bold text-red-400">确认删除</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-zinc-500">取消</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="text-zinc-600 transition-colors hover:text-red-400" aria-label="删除评论">
                    <Icons.Trash size={13} />
                  </button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!isReply && replies.length ? (
        <div className="mt-4 space-y-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              isReply
              rootCommentId={comment.id}
              canDelete={canDelete}
              canReply={canReply}
              onSeek={onSeek}
              onLike={onLike}
              onReply={onReply}
              onDelete={onDelete}
              onShare={onShare}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
