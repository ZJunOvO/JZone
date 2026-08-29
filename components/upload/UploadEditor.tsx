import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { Icons } from '../Icons';
import { CollectionCreatableSelect } from '../CollectionCreatableSelect';
import { WaveformCropper } from '../WaveformCropper';
import { useUploadDraft, type UploadDraftStatus } from './useUploadDraft';
import { useUploadSave } from './useUploadSave';
import { ArtistPicker } from './ArtistPicker';
import type { CurrentArtistProfile } from '../../hooks/useCurrentArtistProfile';
import { snapshotAudioFile } from '../../utils/uploadAudio';
import { analyzeAudioDelivery } from '../../utils/audioDelivery';
import { uploadDraftStorage } from '../../uploadDraftStorage';
import { LyricsEditor } from '../lyrics';
import type { LyricsEditorSavePayload } from '../lyrics';

const AUDIO_FILE_ACCEPT = 'audio/*,video/mp4,application/octet-stream,.mp3,.m4a,.mp4,.wav,.flac,.amr,.3gp';

const createUploadLyricsDraftKey = (ownerId: string | undefined, file: File | null) => {
  if (!file) return null;
  const fileIdentity = [file.name, file.size, file.lastModified, file.type].join('|');
  return `upload:${ownerId ?? 'anonymous'}:${fileIdentity}`;
};

type UploadEditorVariant = 'page' | 'modal';

interface UploadEditorProps {
  variant?: UploadEditorVariant;
  defaultArtist?: string;
  currentArtistProfile?: CurrentArtistProfile | null;
  onSaved?: () => void;
  onDraftStatusChange?: (status: UploadDraftStatus) => void;
  onSavingChange?: (isSaving: boolean) => void;
  onQueueCountChange?: (count: number) => void;
}

export const UploadEditor: React.FC<UploadEditorProps> = ({
  variant = 'page',
  defaultArtist,
  currentArtistProfile,
  onSaved,
  onDraftStatusChange,
  onSavingChange,
  onQueueCountChange,
}) => {
  const { user } = useAuth();
  const ownerId = user?.id;
  const { draft, actions, status } = useUploadDraft(defaultArtist, currentArtistProfile, user?.id);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isPendingFilesRestored, setIsPendingFilesRestored] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [nextFileToLoad, setNextFileToLoad] = useState<File | null>(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [stagedLyrics, setStagedLyrics] = useState<{ draftKey: string; payload: LyricsEditorSavePayload } | null>(null);
  const selectionSeqRef = useRef(0);
  const pendingRestoreSeqRef = useRef(0);
  const pendingRestorePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const restoredPendingOwnerRef = useRef<string | null>(null);
  const pendingPersistTailRef = useRef<Promise<void>>(Promise.resolve());
  const lyricsDraftKey = useMemo(
    () => createUploadLyricsDraftKey(ownerId, draft.file),
    [draft.file, ownerId],
  );
  const activeStagedLyrics = stagedLyrics?.draftKey === lyricsDraftKey ? stagedLyrics.payload : null;
  const stagedLyricsInput = useMemo(() => activeStagedLyrics ? ({
    format: activeStagedLyrics.format,
    timing: activeStagedLyrics.normalizedContent.timing,
    rawContent: activeStagedLyrics.rawContent,
    lines: activeStagedLyrics.lines,
  }) : null, [activeStagedLyrics]);

  const persistPendingFiles = useCallback((persistOwnerId: string | undefined, files: File[]) => {
    if (!persistOwnerId) return;
    const operation = pendingPersistTailRef.current
      .catch(() => {})
      .then(() => files.length
        ? uploadDraftStorage.setPendingFiles(persistOwnerId, files)
        : uploadDraftStorage.deletePendingFiles(persistOwnerId));
    pendingPersistTailRef.current = operation;
    void operation.catch(() => {});
  }, []);

  useEffect(() => {
    const restoreOwnerId = ownerId;
    const restoreSeq = pendingRestoreSeqRef.current + 1;
    pendingRestoreSeqRef.current = restoreSeq;
    let cancelled = false;
    restoredPendingOwnerRef.current = null;
    setIsPendingFilesRestored(false);
    setPendingFiles([]);

    const restore = (async () => {
      if (!restoreOwnerId) {
        if (!cancelled && pendingRestoreSeqRef.current === restoreSeq) setIsPendingFilesRestored(true);
        return;
      }

      const restored = await uploadDraftStorage.getPendingFiles(restoreOwnerId).catch(() => []);
      if (cancelled || pendingRestoreSeqRef.current !== restoreSeq) return;
      setPendingFiles(restored);
      restoredPendingOwnerRef.current = restoreOwnerId;
      setIsPendingFilesRestored(true);
    })();
    pendingRestorePromiseRef.current = restore;

    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !isPendingFilesRestored || restoredPendingOwnerRef.current !== ownerId) return;
    persistPendingFiles(ownerId, pendingFiles);
  }, [isPendingFilesRestored, ownerId, pendingFiles, persistPendingFiles]);

  const handleSaved = () => {
    const nextFile = pendingFiles[0];
    if (nextFile) {
      setNextFileToLoad(nextFile);
    }
    setStagedLyrics(null);
    setIsLyricsOpen(false);
    onSaved?.();
  };
  const { save, isSaving, saveError, saveProgress } = useUploadSave({
    draft,
    defaultArtist,
    resetDraft: actions.resetDraft,
    onSaved: handleSaved,
    lyrics: activeStagedLyrics,
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const inputSuffix = variant === 'modal' ? 'modal' : 'page';
  const frameClass =
    variant === 'page'
      ? 'space-y-8 animate-[fadeIn_0.3s_ease-out]'
      : 'space-y-8 animate-in slide-in-from-bottom-4 duration-300 bg-zinc-900/50 p-6 rounded-[28px] border border-white/5 shadow-2xl';
  const genreTags = draft.genre.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
  const deliveryAnalysis = useMemo(
    () => draft.file ? analyzeAudioDelivery(draft.file, draft.duration) : null,
    [draft.duration, draft.file],
  );

  useEffect(() => {
    onDraftStatusChange?.(status);
  }, [onDraftStatusChange, status]);

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  useEffect(() => {
    onQueueCountChange?.(pendingFiles.length);
  }, [onQueueCountChange, pendingFiles.length]);

  useEffect(() => {
    if (!nextFileToLoad || draft.step !== 1 || draft.file || draft.isReadingFile) return;
    const file = nextFileToLoad;
    setNextFileToLoad(null);
    void actions.loadFile(file).then((loaded) => {
      if (!loaded) return;
      setPendingFiles((previous) => previous[0] === file ? previous.slice(1) : previous);
    });
  }, [actions, draft.file, draft.isReadingFile, draft.step, nextFileToLoad]);

  useEffect(() => {
    setStagedLyrics((previous) => previous && previous.draftKey === lyricsDraftKey ? previous : null);
  }, [lyricsDraftKey]);

  const handleAudioSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const selectionSeq = selectionSeqRef.current + 1;
    selectionSeqRef.current = selectionSeq;
    setIsPreparingFiles(true);

    const prepared: File[] = [];
    const failures: string[] = [];
    try {
      const pendingRestoreSeq = pendingRestoreSeqRef.current;
      await pendingRestorePromiseRef.current;
      if (
        selectionSeqRef.current !== selectionSeq
        || pendingRestoreSeqRef.current !== pendingRestoreSeq
        || (ownerId && restoredPendingOwnerRef.current !== ownerId)
      ) return;

      // 手机媒体提供器的 File 可能在 input 清空后立即失效，因此必须在这里完成字节快照。
      for (const file of files) {
        try {
          prepared.push(await snapshotAudioFile(file));
        } catch (error) {
          failures.push(`${file.name || '未命名音频'}：${error instanceof Error ? error.message : '读取失败'}`);
        }
      }

      if (selectionSeqRef.current !== selectionSeq) return;
      if (draft.step === 1 && !draft.file && prepared.length) {
        const loaded = await actions.loadFile(prepared[0]);
        setPendingFiles((previous) => [...previous, ...(loaded ? prepared.slice(1) : prepared)]);
      } else if (prepared.length) {
        setPendingFiles((previous) => [...previous, ...prepared]);
      }
      if (failures.length) actions.setPreviewError(`有 ${failures.length} 个文件读取失败：${failures.join('；')}`);
    } finally {
      if (selectionSeqRef.current === selectionSeq) setIsPreparingFiles(false);
      input.value = '';
    }
  };

  const handleDiscard = useCallback(() => {
    selectionSeqRef.current += 1;
    pendingRestoreSeqRef.current += 1;
    restoredPendingOwnerRef.current = ownerId ?? null;
    setIsPendingFilesRestored(true);
    setIsPreparingFiles(false);
    setNextFileToLoad(null);
    setPendingFiles([]);
    setStagedLyrics(null);
    setIsLyricsOpen(false);
    persistPendingFiles(ownerId, []);
    actions.resetDraft();
  }, [actions, ownerId, persistPendingFiles]);

  const stageLyrics = useCallback((payload: LyricsEditorSavePayload) => {
    if (!lyricsDraftKey) throw new Error('请先选择音频文件。');
    setStagedLyrics({ draftKey: lyricsDraftKey, payload });
  }, [lyricsDraftKey]);

  const pendingQueue = pendingFiles.length ? (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-zinc-200">等待编辑 · {pendingFiles.length}</div>
        <div className="flex items-center gap-1">
          <label htmlFor={`audio-queue-${inputSuffix}`} className="min-h-11 px-3 flex items-center cursor-pointer text-xs font-bold text-red-400">
            继续添加
          </label>
          <button type="button" onClick={handleDiscard} className="min-h-11 px-2 text-xs font-bold text-zinc-500 hover:text-white">
            弃置队列
          </button>
        </div>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto no-scrollbar">
        {pendingFiles.map((file, index) => (
          <div key={`${file.name}-${file.lastModified}-${index}`} className="min-h-11 flex items-center gap-3 rounded-xl px-3 bg-black/25">
            <Icons.Music2 size={15} className="text-zinc-500 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{file.name}</span>
            <button
              type="button"
              onClick={() => setPendingFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
              className="w-11 h-11 flex items-center justify-center text-zinc-600 hover:text-white"
              aria-label={`从等待队列移除 ${file.name}`}
            >
              <Icons.X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (draft.step === 1) {
    return (
      <div className="space-y-4">
        {pendingQueue}
        <div className="border-2 border-dashed border-zinc-800 rounded-[28px] p-8 flex flex-col items-center justify-center h-56 bg-zinc-900/30 hover:bg-zinc-900/50 transition group">
          <input
            key={draft.fileInputVersion}
            type="file"
            multiple
            accept={AUDIO_FILE_ACCEPT}
            onChange={handleAudioSelection}
            className="hidden"
            id={`audio-upload-${inputSuffix}`}
          />
          <label htmlFor={`audio-upload-${inputSuffix}`} className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
            <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
              <Icons.Upload className="text-white" size={24} />
            </div>
            <span className="text-zinc-300 font-bold">{draft.isReadingFile || isPreparingFiles ? '正在读取音频文件…' : '点击选择音频文件'}</span>
            <span className="text-zinc-500 text-[11px] mt-1">{draft.isReadingFile || isPreparingFiles ? '请保持页面开启，读取完成后会自动进入编辑' : '支持一次选择多首并依次编辑'}</span>
            <span className="text-zinc-500 text-[11px] mt-2 font-medium tracking-wide">MP3 / M4A / MP4 / WAV / FLAC / AMR</span>
            {draft.previewError ? (
              <span className="mt-4 max-w-[280px] text-center text-[11px] font-semibold leading-relaxed text-red-300">
                {draft.previewError}
              </span>
            ) : null}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <input
        type="file"
        multiple
        accept={AUDIO_FILE_ACCEPT}
        onChange={handleAudioSelection}
        className="hidden"
        id={`audio-queue-${inputSuffix}`}
      />
      {pendingQueue ?? (
        <div className="flex justify-end">
          <label htmlFor={`audio-queue-${inputSuffix}`} className="min-h-11 px-3 flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-400 hover:text-white">
            <Icons.PlusCircle size={15} />继续添加文件
          </label>
        </div>
      )}
      <div className="flex items-center gap-6">
        <div className="relative group shrink-0">
          <img src={draft.coverUrl} className="w-24 h-24 rounded-2xl object-cover bg-zinc-800 shadow-xl ring-1 ring-white/10" alt="Cover" />
          <label htmlFor={`cover-upload-${inputSuffix}`} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-2xl cursor-pointer">
            <Icons.PlusCircle size={20} className="text-white mb-1" />
            <span className="text-[10px] text-white font-bold">更换封面</span>
          </label>
          <input type="file" id={`cover-upload-${inputSuffix}`} accept="image/*" onChange={actions.handleCoverUpload} className="hidden" />
        </div>
        <div className="overflow-hidden space-y-1">
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">正在编辑</p>
          <p className="text-base font-bold text-white truncate">{draft.file?.name}</p>
          <p className="text-[10px] text-zinc-500 font-mono">{(draft.file ? draft.file.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
        </div>
      </div>

      {deliveryAnalysis?.isHighBitrate ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-bold text-amber-100">
                {deliveryAnalysis.canCreateStreamCopy
                  ? draft.streamOptimizationEnabled ? '将生成节流播放副本' : '已关闭播放副本优化'
                  : '检测到大型高码率音频'}
              </div>
              <div className="text-[11px] leading-relaxed text-amber-100/65">
                {deliveryAnalysis.estimatedBitrateKbps ? `预计 ${deliveryAnalysis.estimatedBitrateKbps}kbps` : '无损音频'}
                {deliveryAnalysis.canCreateStreamCopy
                  ? `，可生成 ${deliveryAnalysis.targetBitrateKbps}kbps MP3 供播放，原文件仍会保留，预计完整播放节省约 ${deliveryAnalysis.expectedSavingsPercent}% 流量。转码失败会自动使用原文件。`
                  : '，文件超过浏览器安全转码上限。为避免手机页面崩溃，本次保留原文件直接上传，建议之后在电脑端生成播放副本。'}
              </div>
            </div>
            {deliveryAnalysis.canCreateStreamCopy ? (
              <button
                type="button"
                role="switch"
                aria-label="生成节流播放副本"
                aria-checked={draft.streamOptimizationEnabled}
                onClick={() => actions.setStreamOptimizationEnabled(!draft.streamOptimizationEnabled)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${draft.streamOptimizationEnabled ? 'border-amber-200/40 bg-amber-300/70' : 'border-white/15 bg-white/10'}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${draft.streamOptimizationEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">裁剪选段</label>
          <button
            disabled={!draft.isPreviewSupported}
            onClick={actions.playPreviewSection}
            className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1 rounded-full active:scale-95 transition ${draft.isPreviewSupported ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 bg-white/5'}`}
          >
            {draft.isPreviewPlaying ? <Icons.Pause size={12} fill="currentColor" /> : <Icons.Play size={12} fill="currentColor" />}
            {draft.isPreviewPlaying ? '暂停预览' : '播放选段'}
          </button>
        </div>
        <WaveformCropper
          duration={draft.duration}
          range={draft.range}
          setRange={actions.setRange}
          currentTime={draft.currentPreviewTime}
          onSeek={actions.handleSeek}
          onPlayFromStart={actions.playPreviewFromStart}
        />
        <div className="grid grid-cols-3 text-[10px] text-zinc-500 font-mono font-bold tracking-tight">
          <div className="text-left">IN: {draft.range[0].toFixed(1)}s</div>
          <div className="text-center text-red-500/80">LENGTH: {(draft.range[1] - draft.range[0]).toFixed(1)}s</div>
          <div className="text-right">OUT: {draft.range[1].toFixed(1)}s</div>
        </div>
        <audio
          ref={actions.audioPreviewRef}
          src={draft.previewUrl || undefined}
          preload="metadata"
          playsInline
          onTimeUpdate={actions.handleAudioTimeUpdate}
          onPlay={actions.handleAudioPlay}
          onPause={actions.handleAudioPause}
          onEnded={actions.handleAudioEnded}
          onError={actions.handleAudioError}
          onLoadedMetadata={actions.handleAudioLoadedMetadata}
        />
        {draft.previewError ? (
          <div className="space-y-3 text-[11px] font-semibold text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-3">
            <div>{draft.previewError}</div>
            {!draft.isPreviewSupported && draft.file && !draft.isTranscoding ? (
              <button
                type="button"
                onClick={actions.transcodeToMp3}
                className="w-full rounded-xl bg-white px-3 py-2 text-xs font-bold text-black transition active:scale-[0.98]"
              >
                转为 MP3 并继续预览
              </button>
            ) : null}
          </div>
        ) : null}
        {draft.isTranscoding ? (
          <div
            className="space-y-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-3"
            role="progressbar"
            aria-label="音频转换进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={draft.transcodeProgress}
          >
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-zinc-200">
              <span className="min-w-0 flex-1 truncate">{draft.transcodeMessage || '正在准备音频转换…'}</span>
              <span className="shrink-0 font-mono text-zinc-400">{draft.transcodeProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(2, Math.min(100, draft.transcodeProgress))}%` }}
              />
            </div>
          </div>
        ) : draft.transcodeMessage && !draft.previewError ? (
          <div className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
            {draft.transcodeMessage}
          </div>
        ) : null}
        {draft.sourceWarning ? (
          <div className="text-[11px] font-semibold leading-relaxed text-amber-200 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-3">
            {draft.sourceWarning}
          </div>
        ) : null}
      </div>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-white/5 bg-black/30">
        <button
          type="button"
          aria-expanded={isLyricsOpen}
          data-testid="upload-lyrics-toggle"
          onClick={() => setIsLyricsOpen((previous) => !previous)}
          className="flex min-h-14 w-full min-w-0 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icons.Music2 size={17} className="shrink-0 text-red-300" aria-hidden="true" />
            <span className="truncate text-xs font-bold uppercase tracking-widest text-zinc-200">歌词</span>
            <span
              className="truncate text-[11px] text-zinc-500"
              data-testid="upload-lyrics-status"
              data-lyrics-source={activeStagedLyrics?.source ?? ''}
            >
              {activeStagedLyrics ? '已暂存' : '可选'}
            </span>
          </span>
          <Icons.ChevronRight size={17} className={`shrink-0 text-zinc-500 transition-transform ${isLyricsOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        {isLyricsOpen ? (
          <div className="min-w-0 border-t border-white/5 px-3 py-4 sm:px-4">
            <p className="mb-3 text-xs leading-5 text-zinc-500">歌词会先暂存到当前音频，歌曲保存成功后再同步到资料库。</p>
            <LyricsEditor
              key={lyricsDraftKey ?? 'upload-lyrics'}
              initialLyrics={stagedLyricsInput}
              initialActiveRange={activeStagedLyrics?.normalizedContent.activeRange ?? null}
              draftKey={lyricsDraftKey}
              songTitle={draft.title}
              songArtist={draft.artist}
              duration={draft.duration}
              audioUrl={draft.previewUrl || undefined}
              clearDraftOnSave={false}
              source="upload"
              onSave={stageLyrics}
              className="min-w-0"
            />
          </div>
        ) : null}
      </section>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">歌曲标题</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => actions.setTitle(e.target.value)}
              className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
              placeholder="例如：My New Song"
            />
          </div>
          <ArtistPicker
            value={draft.artist}
            currentArtist={defaultArtist}
            currentProfile={currentArtistProfile}
            onChange={actions.setArtist}
            credits={draft.artistCredits}
            onCreditsChange={actions.setArtistCredits}
          />
          <div className="rounded-2xl border border-white/5 bg-black/30">
            <button type="button" onClick={() => setMoreOpen((prev) => !prev)} className="w-full flex items-center justify-between px-4 py-3 text-zinc-300 font-bold text-xs uppercase tracking-widest">
              更多
              <span className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`}>
                <Icons.ChevronRight size={16} />
              </span>
            </button>
            {moreOpen && (
              <div className="px-4 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">可见性</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => actions.setSongVisibility('public')}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border transition ${draft.songVisibility === 'public' ? 'bg-white text-black border-white' : 'bg-black/40 text-zinc-300 border-white/5 hover:bg-black/30'}`}
                    >
                      <Icons.Globe size={16} />公开
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.setSongVisibility('private')}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border transition ${draft.songVisibility === 'private' ? 'bg-white text-black border-white' : 'bg-black/40 text-zinc-300 border-white/5 hover:bg-black/30'}`}
                    >
                      <Icons.Lock size={16} />私有
                    </button>
                  </div>
                </div>
                <CollectionCreatableSelect
                  label="专辑 / 歌单"
                  value={draft.collectionSelection}
                  onChange={(v) => {
                    actions.setCollectionSelection(v);
                    if (v.kind === 'none') actions.setAlbum('');
                    else if (v.type === 'album') actions.setAlbum(v.title);
                    else actions.setAlbum('');
                  }}
                  placeholder="搜索或创建…"
                />
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">标签</label>
                  {genreTags.length ? (
                    <div className="flex flex-wrap gap-2 px-1 pb-1">
                      {genreTags.map((tag, index) => (
                        <span key={`${tag}-${index}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] pl-3 pr-1 text-[11px] font-semibold text-zinc-300">
                          {tag}
                          <button
                            type="button"
                            onClick={() => actions.setGenre(genreTags.filter((_, itemIndex) => itemIndex !== index).join(', '))}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-white"
                            aria-label={`删除标签 ${tag}`}
                          >
                            <Icons.X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <input
                    type="text"
                    value={draft.genre}
                    onChange={(e) => actions.setGenre(e.target.value)}
                    className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                    placeholder="例如：夜行, Lo-fi, 旧时光"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">灵感札记</label>
                  <textarea
                    value={draft.story}
                    onChange={(e) => actions.setStory(e.target.value)}
                    className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700 min-h-[120px] resize-none"
                    placeholder="写下这首歌的故事、情绪或一段记忆"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4">
        {saveError ? (
          <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
            {saveError}
          </div>
        ) : null}
        {isSaving && saveProgress ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-zinc-300">
              <span className="truncate">{saveProgress.message}</span>
              <span className="font-mono text-zinc-400">{saveProgress.percent}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(3, Math.min(100, saveProgress.percent))}%` }}
              />
            </div>
          </div>
        ) : null}
        <button
          onClick={save}
          disabled={isSaving}
          className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all ${isSaving ? 'bg-zinc-800 text-zinc-500 shadow-none' : 'bg-red-600 shadow-red-600/20'}`}
        >
          {isSaving ? (saveProgress?.message ?? '上传中...') : '确认保存至资料库'}
        </button>
        <button onClick={handleDiscard} className="w-full text-zinc-500 text-[11px] font-bold py-2 hover:text-white transition uppercase tracking-widest">
          弃置并重新选择
        </button>
      </div>
    </div>
  );
};
