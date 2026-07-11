import React, { useState } from 'react';
import { Song } from '../types';
import { CollectionCreatableSelect, type CollectionSelectValue } from './CollectionCreatableSelect';
import { Icons } from './Icons';
import { attachUploadedSongToCollection } from '../utils/uploadFlow';
import { useStore } from '../store';
import { useAuth } from '../auth';

export const AddSongToCollectionDialog: React.FC<{
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ song, isOpen, onClose }) => {
  const { updateSong } = useStore();
  const { user } = useAuth();
  const [selection, setSelection] = useState<CollectionSelectValue>({ kind: 'none' });
  const [isAttaching, setIsAttaching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen || !song) return null;

  const close = () => {
    setSelection({ kind: 'none' });
    setIsAttaching(false);
    setFeedback(null);
    onClose();
  };

  const attach = async () => {
    if (selection.kind === 'none' || isAttaching) return;
    setIsAttaching(true);
    setFeedback(null);
    try {
      await attachUploadedSongToCollection(selection, song.id);
      const canEditSongMetadata = !song.ownerId || song.ownerId === user?.id;
      if (selection.type === 'album' && canEditSongMetadata) {
        try {
          await updateSong(song.id, { album: selection.title });
        } catch {
          setFeedback({ type: 'success', message: '已加入专辑，但歌曲专辑名同步失败，可稍后在歌曲信息中重试' });
          window.setTimeout(close, 900);
          return;
        }
      }
      const target = selection.type === 'album' ? '专辑' : '歌单';
      setFeedback({ type: 'success', message: `已加入${target}` });
      window.setTimeout(close, 520);
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '加入失败，请稍后重试';
      setFeedback({ type: 'error', message: msg });
      setIsAttaching(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[190]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={close} />
      <div
        className="frosted-glass-panel absolute left-1/2 top-1/2 w-[min(420px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 rounded-[24px] shadow-2xl overflow-hidden"
      >
        <div className="relative z-10 p-5 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-white font-extrabold tracking-tight truncate">加入歌单或专辑</div>
            <div className="text-xs text-zinc-500 truncate mt-1">{song.title}</div>
          </div>
          <button
            onClick={close}
            aria-label="关闭加入歌单或专辑"
            className="w-10 h-10 rounded-full bg-white/5 text-zinc-400 hover:text-white active:scale-95 transition flex items-center justify-center"
          >
            <Icons.X size={16} />
          </button>
        </div>

        <div className="relative z-10 p-5 space-y-5">
          <CollectionCreatableSelect
            label="目标"
            value={selection}
            onChange={(next) => {
              setSelection(next);
              setFeedback(null);
            }}
            placeholder="搜索或创建..."
          />

          {feedback && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                feedback.type === 'success'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/20 bg-red-500/10 text-red-300'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <button
            onClick={attach}
            disabled={selection.kind === 'none' || isAttaching}
            className={`w-full py-4 rounded-2xl font-bold active:scale-[0.98] transition ${
              selection.kind === 'none' || isAttaching ? 'bg-white/5 text-zinc-600' : 'bg-white text-black'
            }`}
          >
            {isAttaching ? '加入中...' : '确认加入'}
          </button>
        </div>
      </div>
    </div>
  );
};
