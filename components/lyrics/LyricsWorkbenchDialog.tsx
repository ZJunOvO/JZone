import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LyricsEditor } from './editor';
import type { LyricsEditorSavePayload } from './editor';
import { Icons } from '../Icons';
import { feedback } from '../feedback';
import { supabaseApi } from '../../supabaseApi';
import { hasSupabaseConfig } from '../../supabaseClient';
import { useModalPresence } from '../../modalPresence';
import type { Song } from '../../types';
import type { SongLyricsNormalizedContent, SongLyricsRow } from '../../services/supabase/types';
import { getStoredLyricsModel } from '../../utils/lyrics';
import { useKeyboardViewport } from '../../hooks/useKeyboardViewport';

export interface LyricsWorkbenchDialogProps {
  isOpen: boolean;
  songs: readonly Song[];
  onClose: () => void;
}

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message.trim() ? error.message : fallback
);

const resolveSongAudioUrl = async (song: Song) => {
  if (song.audioUrl) return song.audioUrl;
  const audioPath = song.audioPath || song.sourceAudioPath;
  if (!hasSupabaseConfig || !audioPath) return '';
  return supabaseApi.createSignedAudioUrl(audioPath);
};

export const LyricsWorkbenchDialog: React.FC<LyricsWorkbenchDialogProps> = ({
  isOpen,
  songs,
  onClose,
}) => {
  const [selectedSongId, setSelectedSongId] = useState('');
  const [lyricsRow, setLyricsRow] = useState<SongLyricsRow | null>(null);
  const [lyricsLoaded, setLyricsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const loadSequenceRef = useRef(0);
  const { scrollRef, overlayStyle, panelMaxHeight } = useKeyboardViewport(isOpen);

  useModalPresence(isOpen);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? null,
    [selectedSongId, songs],
  );
  const storedLyricsModel = useMemo(
    () => lyricsRow ? getStoredLyricsModel(lyricsRow) : null,
    [lyricsRow],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSongId((current) => songs.some((song) => song.id === current) ? current : songs[0]?.id ?? '');
  }, [isOpen, songs]);

  useEffect(() => {
    if (!isOpen || !selectedSong) {
      setLyricsLoaded(false);
      setLyricsRow(null);
      setLoadError(null);
      setAudioUrl('');
      setAudioError(null);
      return undefined;
    }

    const sequence = ++loadSequenceRef.current;
    let cancelled = false;
    setLyricsLoaded(false);
    setLyricsRow(null);
    setLoadError(null);
    setAudioUrl('');
    setAudioError(null);

    const load = async () => {
      const lyricsTask = hasSupabaseConfig
        ? supabaseApi.fetchSongLyrics(selectedSong.id)
        : Promise.resolve(null);
      const audioTask = resolveSongAudioUrl(selectedSong);
      const [lyricsResult, audioResult] = await Promise.allSettled([lyricsTask, audioTask]);
      if (cancelled || loadSequenceRef.current !== sequence) return;

      if (lyricsResult.status === 'fulfilled') {
        setLyricsRow(lyricsResult.value);
        setLoadError(hasSupabaseConfig ? null : '当前为本地资料库，歌词保存需要云端歌曲。');
      } else {
        const message = '歌词读取失败，请稍后重试。';
        setLyricsRow(null);
        setLoadError(message);
        feedback.error(message);
      }

      if (audioResult.status === 'fulfilled') {
        setAudioUrl(audioResult.value);
      } else {
        setAudioError('音频试听地址加载失败，仍可继续编辑歌词。');
      }
      setLyricsLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedSong]);

  const handleSave = useCallback(async (payload: LyricsEditorSavePayload) => {
    if (!selectedSong) throw new Error('请先选择歌曲。');
    if (!hasSupabaseConfig) {
      const message = '当前歌曲尚未同步到云端，歌词暂不能保存。';
      feedback.error(message);
      throw new Error(message);
    }

    setIsSaving(true);
    try {
      const saved = await supabaseApi.upsertSongLyrics(selectedSong.id, {
        format: payload.format,
        source: payload.source,
        rawContent: payload.rawContent,
        normalizedContent: payload.normalizedContent as unknown as SongLyricsNormalizedContent,
        offsetMs: payload.offsetMs,
        version: payload.version,
      });
      setLyricsRow(saved);
      setLyricsLoaded(true);
      feedback.success('歌词已保存');
    } catch (error) {
      const message = getErrorMessage(error, '歌词保存失败，请稍后重试。');
      feedback.error(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, [selectedSong]);

  const handleDelete = useCallback(async () => {
    if (!selectedSong || !lyricsRow || isDeleting) return;
    if (typeof window !== 'undefined' && !window.confirm(`确定删除《${selectedSong.title}》的歌词吗？`)) return;
    if (!hasSupabaseConfig) {
      feedback.error('当前歌曲尚未同步到云端，歌词暂不能删除。');
      return;
    }

    setIsDeleting(true);
    try {
      await supabaseApi.deleteSongLyrics(selectedSong.id);
      setLyricsRow(null);
      setLyricsLoaded(true);
      feedback.success('歌词已删除');
    } catch (error) {
      feedback.error(getErrorMessage(error, '歌词删除失败，请稍后重试。'));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, lyricsRow, selectedSong]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[280] flex items-end justify-center overflow-hidden bg-black/85 px-3 py-3 backdrop-blur-xl sm:items-center sm:px-6 sm:py-8"
      style={overlayStyle}
      data-testid="lyrics-workbench-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-workbench-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 shadow-2xl sm:max-h-[calc(100dvh-4rem)]"
        style={panelMaxHeight ? { maxHeight: `${panelMaxHeight}px` } : undefined}
      >
        <header className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] text-red-300/80">歌词工作台</p>
            <h2 id="lyrics-workbench-title" className="mt-1 truncate text-xl font-black text-white">歌词制作</h2>
            <p className="mt-1 text-xs leading-5 text-white/45">从我的上传中选择歌曲，补录或调整歌词。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭歌词工作台"
            data-testid="lyrics-workbench-close"
            className="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/10 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-colors hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
            title="关闭"
          >
            <Icons.X size={19} aria-hidden="true" />
          </button>
        </header>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-3 py-4 [scroll-padding-bottom:42dvh] sm:px-6 sm:py-5 sm:[scroll-padding-bottom:8rem]">
          {songs.length === 0 ? (
            <div className="py-12 text-center" role="status">
              <Icons.Music2 size={24} className="mx-auto text-white/35" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-white/75">还没有可制作歌词的上传</p>
              <p className="mt-1 text-xs leading-5 text-white/40">先保存一首歌曲，再回来补录歌词。</p>
            </div>
          ) : (
            <>
              <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:p-4" aria-labelledby="lyrics-workbench-song-title">
                <label id="lyrics-workbench-song-title" htmlFor="lyrics-workbench-song" className="block text-[10px] font-bold uppercase tracking-widest text-white/45">选择歌曲</label>
                <select
                  id="lyrics-workbench-song"
                  data-testid="lyrics-workbench-song"
                  value={selectedSongId}
                  onChange={(event) => setSelectedSongId(event.target.value)}
                  className="mt-2 min-h-12 w-full min-w-0 rounded-xl border border-white/10 bg-black/50 px-3 text-base text-white outline-none transition-colors focus:border-red-300/70 focus:ring-2 focus:ring-red-300/20"
                >
                  {songs.map((song) => (
                    <option key={song.id} value={song.id}>{song.title} · {song.artist}</option>
                  ))}
                </select>
                {selectedSong ? (
                  <div className="mt-3 flex min-w-0 items-center gap-3">
                    <img src={selectedSong.coverUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover bg-zinc-800" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{selectedSong.title}</p>
                      <p className="mt-0.5 truncate text-xs text-white/45">{selectedSong.artist}{selectedSong.album ? ` · ${selectedSong.album}` : ''}</p>
                    </div>
                  </div>
                ) : null}
              </section>

              {loadError ? (
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-3 text-xs leading-5 text-amber-100" role="alert" data-testid="lyrics-workbench-load-error">
                  {loadError}
                </p>
              ) : null}
              {audioError ? (
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-3 text-xs leading-5 text-amber-100" role="status" data-testid="lyrics-workbench-audio-error">
                  {audioError}
                </p>
              ) : null}

              {!lyricsLoaded ? (
                <div className="flex min-h-32 items-center justify-center text-sm text-white/45" role="status" data-testid="lyrics-workbench-loading">
                  正在读取歌词…
                </div>
              ) : selectedSong ? (
                <LyricsEditor
                  key={selectedSong.id}
                  initialLyrics={storedLyricsModel?.editorLyrics ?? null}
                  initialActiveRange={storedLyricsModel?.activeRange ?? null}
                  initialOffsetMs={lyricsRow?.offset_ms ?? 0}
                  songId={selectedSong.id}
                  songTitle={selectedSong.title}
                  songArtist={selectedSong.artist}
                  draftKey={`workbench:${selectedSong.id}`}
                  duration={selectedSong.duration}
                  audioUrl={audioUrl || undefined}
                  source="editor"
                  saving={isSaving || isDeleting}
                  onSave={handleSave}
                  className="mt-4 min-w-0"
                />
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="text-xs text-white/45" aria-live="polite" data-testid="lyrics-workbench-status">
                  {lyricsRow ? `已有歌词 · 更新于 ${new Date(lyricsRow.updated_at).toLocaleDateString('zh-CN')}` : '尚无已保存歌词'}
                </p>
                <button
                  type="button"
                  data-testid="lyrics-workbench-delete"
                  onClick={() => { void handleDelete(); }}
                  disabled={!lyricsRow || isDeleting || isSaving}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-red-300/25 px-3 text-xs font-bold text-red-200/75 transition-colors hover:bg-red-300/[0.08] hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Icons.Trash size={15} aria-hidden="true" />
                  {isDeleting ? '删除中…' : '删除已保存歌词'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
