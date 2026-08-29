import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icons } from '../Icons';
import { useAuth } from '../../auth';
import { useModalPresence } from '../../modalPresence';
import { supabaseApi, type SongLyricsNormalizedContent, type SongLyricsRow } from '../../supabaseApi';
import type { Song } from '../../types';
import { LyricsEditor } from './editor';
import type {
  LyricsEditorSavePayload,
} from './editor';
import { dispatchSongLyricsUpdated } from '../../utils/lyrics/events';
import { getStoredLyricsModel } from '../../utils/lyrics';
import { useKeyboardViewport } from '../../hooks/useKeyboardViewport';

export interface SongLyricsEditorDialogProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  audioUrl?: string;
}

type LyricsLoadState = 'idle' | 'loading' | 'ready' | 'error';

const getOperationErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

export const SongLyricsEditorDialog: React.FC<SongLyricsEditorDialogProps> = ({
  isOpen,
  song,
  onClose,
  audioUrl,
}) => {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [loadState, setLoadState] = useState<LyricsLoadState>('idle');
  const [lyrics, setLyrics] = useState<SongLyricsRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const { scrollRef, overlayStyle, panelMaxHeight } = useKeyboardViewport(isOpen && Boolean(song));

  const isOwner = Boolean(user?.id && song?.ownerId === user.id);
  const storedLyricsModel = React.useMemo(
    () => lyrics ? getStoredLyricsModel(lyrics) : null,
    [lyrics],
  );

  useModalPresence(isOpen && Boolean(song));

  useEffect(() => {
    if (!isOpen || !song?.id) {
      if (!isOpen) {
        setLoadState('idle');
        setLyrics(null);
        setLoadError(null);
        setOperationError(null);
        setOperationMessage(null);
      }
      return undefined;
    }

    let cancelled = false;
    const songId = song.id;
    setLoadState('loading');
    setLyrics(null);
    setLoadError(null);
    setOperationError(null);
    setOperationMessage(null);

    void supabaseApi.fetchSongLyrics(songId).then((row) => {
      if (cancelled) return;
      setLyrics(row);
      setLoadState('ready');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setLyrics(null);
      setLoadState('error');
      setLoadError(getOperationErrorMessage(error, '歌词加载失败，请检查网络后重试。'));
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, retryNonce, song?.id]);

  const handleRetry = () => {
    if (loadState === 'loading' || saving || deleting) return;
    setRetryNonce((value) => value + 1);
  };

  const handleSave = async (payload: LyricsEditorSavePayload) => {
    if (!song || !isOwner) throw new Error('只有歌曲所有者可以保存歌词。');
    setSaving(true);
    setOperationError(null);
    setOperationMessage(null);
    try {
      const saved = await supabaseApi.upsertSongLyrics(song.id, {
        format: payload.format,
        source: payload.source,
        rawContent: payload.rawContent,
        normalizedContent: payload.normalizedContent as unknown as SongLyricsNormalizedContent,
        offsetMs: payload.offsetMs,
        version: payload.version,
      });
      setLyrics(saved);
      setLoadState('ready');
      dispatchSongLyricsUpdated({ songId: song.id, action: 'saved' });
    } catch (error) {
      const message = getOperationErrorMessage(error, '歌词保存失败，请检查网络后重试。');
      setOperationError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!song || !isOwner || !lyrics || deleting || saving) return;
    if (!window.confirm('确定要删除这首歌的歌词吗？此操作无法撤销。')) return;
    setDeleting(true);
    setOperationError(null);
    setOperationMessage(null);
    try {
      await supabaseApi.deleteSongLyrics(song.id);
      setLyrics(null);
      setLoadState('ready');
      setEditorRevision((value) => value + 1);
      setOperationMessage('歌词已删除，当前播放页会自动刷新。');
      dispatchSongLyricsUpdated({ songId: song.id, action: 'deleted' });
    } catch (error) {
      setOperationError(getOperationErrorMessage(error, '歌词删除失败，请检查网络后重试。'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {isOpen && song && (
        <motion.div
          key={song.id}
          className="fixed inset-0 z-[280] flex items-end justify-center overflow-hidden p-3 sm:items-center sm:p-6"
          style={overlayStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
          data-testid="song-lyrics-editor-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="song-lyrics-editor-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/65 backdrop-blur-md"
            onClick={onClose}
            aria-label="关闭歌词编辑"
          />
          <motion.div
            className="relative z-10 flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/95 shadow-2xl sm:max-h-[88dvh]"
            style={panelMaxHeight ? { maxHeight: `${panelMaxHeight}px` } : undefined}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985, filter: 'blur(4px)' }}
            transition={{ duration: reduceMotion ? 0.1 : 0.24, ease: [0.22, 0.74, 0.22, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.16em] text-white/45">歌词工作台</p>
                <h2 id="song-lyrics-editor-dialog-title" className="mt-1 truncate text-xl font-black text-white">
                  {lyrics ? '编辑歌词' : '添加歌词'}
                </h2>
                <p className="mt-1 truncate text-sm text-white/50">{song.title} · {song.artist}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-colors hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                aria-label="关闭歌词编辑"
                title="关闭"
                data-testid="song-lyrics-editor-close"
              >
                <Icons.X size={18} />
              </button>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [scroll-padding-bottom:42dvh] sm:px-6 sm:[scroll-padding-bottom:8rem]">
              {loadState === 'loading' && (
                <div className="flex min-h-[300px] flex-col items-center justify-center text-center" data-testid="song-lyrics-editor-loading" role="status" aria-live="polite">
                  <Icons.RotateCcw size={22} className="animate-spin text-white/60" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-white/75">正在加载歌词…</p>
                  <p className="mt-2 text-xs text-white/40">正在读取这首歌的歌词内容。</p>
                </div>
              )}

              {loadState === 'error' && (
                <div className="flex min-h-[300px] flex-col items-center justify-center px-3 text-center" data-testid="song-lyrics-editor-error" role="alert">
                  <p className="text-base font-bold text-red-200">歌词加载失败</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/55">{loadError}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                    data-testid="song-lyrics-editor-retry"
                  >
                    <Icons.RotateCcw size={16} aria-hidden="true" />
                    重新加载
                  </button>
                </div>
              )}

              {loadState === 'ready' && isOwner && (
                <LyricsEditor
                  key={`${song.id}:${editorRevision}`}
                  initialLyrics={storedLyricsModel?.editorLyrics ?? null}
                  initialActiveRange={storedLyricsModel?.activeRange ?? null}
                  initialOffsetMs={lyrics?.offset_ms ?? 0}
                  songId={song.id}
                  songTitle={song.title}
                  songArtist={song.artist}
                  duration={song.duration}
                  audioUrl={audioUrl || song.audioUrl}
                  onSave={handleSave}
                  saving={saving}
                  version={Math.max(1, (lyrics?.version ?? 0) + 1)}
                  className="py-2"
                />
              )}

              {loadState === 'ready' && !isOwner && (
                <div className="flex min-h-[300px] items-center justify-center text-center" data-testid="song-lyrics-editor-forbidden" role="alert">
                  <p className="text-sm font-semibold text-white/60">只有歌曲所有者可以编辑歌词。</p>
                </div>
              )}
            </div>

            {(operationError || operationMessage || (loadState === 'ready' && lyrics)) && (
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1 text-xs leading-5" aria-live="polite">
                  {operationError ? <span className="block text-red-200" data-testid="song-lyrics-editor-operation-error">{operationError}</span> : null}
                  {!operationError && operationMessage ? <span className="block text-emerald-200" data-testid="song-lyrics-editor-operation-message">{operationMessage}</span> : null}
                </div>
                {loadState === 'ready' && lyrics && isOwner && (
                  <button
                    type="button"
                    onClick={() => { void handleDelete(); }}
                    disabled={saving || deleting}
                    className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-red-400/25 px-4 text-sm font-bold text-red-200 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-45"
                    data-testid="song-lyrics-editor-delete"
                  >
                    {deleting ? <Icons.RotateCcw size={15} className="animate-spin" aria-hidden="true" /> : <Icons.Trash size={15} aria-hidden="true" />}
                    {deleting ? '删除中…' : '删除歌词'}
                  </button>
                )}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
