import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Comment, Song } from '../../types';
import { generateCommentShareImage } from '../../utils/commentShareImage';
import { Icons } from '../Icons';
import { feedback } from '../feedback';

interface CommentShareModalProps {
  comment: Comment | null;
  song: Song;
  onClose: () => void;
}

export const CommentShareModal: React.FC<CommentShareModalProps> = ({ comment, song, onClose }) => {
  const reduceMotion = useReducedMotion();
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!comment) return;
    let cancelled = false;
    setBlob(null);
    setPreviewUrl(null);
    setError(null);
    generateCommentShareImage(comment, song)
      .then((nextBlob) => {
        if (cancelled) return;
        setBlob(nextBlob);
        setPreviewUrl(URL.createObjectURL(nextBlob));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '分享图片生成失败');
      });
    return () => {
      cancelled = true;
    };
  }, [comment, song]);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const share = async () => {
    if (!blob || !comment) return;
    const file = new File([blob], `${song.title}-${comment.username}-评论.png`, { type: 'image/png' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `${song.title} 的评论`, files: [file] });
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      feedback.success('分享图片已保存');
    } catch (reason) {
      if ((reason as DOMException)?.name !== 'AbortError') feedback.error('分享失败，请稍后重试');
    }
  };

  return (
    <AnimatePresence>
      {comment ? (
        <motion.div
          className="absolute inset-0 z-[90] flex items-end justify-center bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-12"
          role="dialog"
          aria-modal="true"
          aria-label="分享评论图片"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: [0.22, 0.74, 0.22, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <div className="text-base font-bold text-white">分享评论</div>
                <div className="mt-0.5 text-xs text-zinc-500">已排版为图片</div>
              </div>
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="关闭">
                <Icons.X size={18} />
              </button>
            </div>
            <div className="aspect-[4/5] overflow-hidden rounded-[20px] bg-zinc-800">
              {previewUrl ? <img src={previewUrl} alt="评论分享图片预览" className="h-full w-full object-cover" /> : null}
              {!previewUrl && !error ? <div className="grid h-full place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-transparent" /></div> : null}
              {error ? <div className="grid h-full place-items-center px-8 text-center text-sm text-zinc-400">{error}</div> : null}
            </div>
            <button
              type="button"
              onClick={share}
              disabled={!blob}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-bold text-black transition active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              <Icons.Share2 size={18} />
              分享图片
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
