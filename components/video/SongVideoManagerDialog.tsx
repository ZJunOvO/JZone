import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from '../Icons';
import { feedback } from '../feedback';
import { supabaseApi, type SongVideoKind, type SongVideoRow } from '../../supabaseApi';
import type { Song } from '../../types';
import { useModalPresence } from '../../modalPresence';
import { readMp4ContainerDurationMs } from '../../utils/videoMetadata';

interface SongVideoManagerDialogProps {
  song: Song;
  onClose: () => void;
}

interface VideoMetadataResult {
  durationMs: number;
  poster: File | null;
  previewAvailable: boolean;
}

const readBrowserVideoMetadata = (file: File) => new Promise<VideoMetadataResult>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  let settled = false;
  const finish = (result: VideoMetadataResult) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(metadataTimer);
    URL.revokeObjectURL(url);
    resolve(result);
  };
  const fail = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(metadataTimer);
    URL.revokeObjectURL(url);
    reject(new Error('browser_preview_unavailable'));
  };
  const metadataTimer = window.setTimeout(fail, 10_000);
  video.preload = 'metadata';
  video.muted = true;
  video.onloadedmetadata = () => {
    const durationMs = Math.round(video.duration * 1_000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      fail();
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      finish({ durationMs, poster: null, previewAvailable: true });
      return;
    }
    const posterTimer = window.setTimeout(() => finish({ durationMs, poster: null, previewAvailable: true }), 1_800);
    video.onseeked = () => {
      window.clearTimeout(posterTimer);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish({
          durationMs,
          poster: blob ? new File([blob], 'mv-poster.jpg', { type: 'image/jpeg' }) : null,
          previewAvailable: true,
        }), 'image/jpeg', 0.84);
      } catch {
        finish({ durationMs, poster: null, previewAvailable: true });
      }
    };
    video.currentTime = Math.min(0.25, Math.max(0, video.duration / 20));
  };
  video.onerror = fail;
  video.src = url;
});

const readVideoMetadata = async (file: File, fallbackDurationMs: number): Promise<VideoMetadataResult> => {
  try {
    return await readBrowserVideoMetadata(file);
  } catch {
    const containerDurationMs = await readMp4ContainerDurationMs(file);
    return {
      durationMs: containerDurationMs ?? Math.max(1_000, Math.round(fallbackDurationMs)),
      poster: null,
      previewAvailable: false,
    };
  }
};

const kindLabel = (kind: SongVideoKind) => kind === 'full' ? '完整 MV' : '记忆 MV';
const isSupportedVideoFile = (file: File) => (
  /\.(?:mp4|m4v|mov|webm)$/i.test(file.name)
  || /^(?:video\/mp4|video\/webm|video\/quicktime)$/i.test(file.type)
);

export const SongVideoManagerDialog: React.FC<SongVideoManagerDialogProps> = ({ song, onClose }) => {
  useModalPresence(true);
  const [kind, setKind] = React.useState<SongVideoKind>('memory');
  const [rows, setRows] = React.useState<SongVideoRow[]>([]);
  const [file, setFile] = React.useState<File | null>(null);
  const [poster, setPoster] = React.useState<File | null>(null);
  const [durationMs, setDurationMs] = React.useState(0);
  const [songStart, setSongStart] = React.useState(Math.max(0, Math.round(song.trimStart || 0)));
  const [songEnd, setSongEnd] = React.useState(Math.min(song.trimEnd || song.duration, Math.max(15, (song.trimStart || 0) + 30)));
  const [audioMix, setAudioMix] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [previewWarning, setPreviewWarning] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadRows = React.useCallback(async () => {
    try {
      setRows(await supabaseApi.fetchSongVideos(song.id));
    } catch (error) {
      console.warn('MV 信息读取失败', error);
    }
  }, [song.id]);

  React.useEffect(() => { void loadRows(); }, [loadRows]);

  const selectFile = async (selected: File | undefined) => {
    if (!selected) return;
    if (!isSupportedVideoFile(selected)) {
      feedback.error('请选择 MP4、MOV 或 WebM 视频');
      return;
    }
    setBusy(true);
    try {
      const metadata = await readVideoMetadata(selected, (song.trimEnd || song.duration) * 1_000);
      setFile(selected);
      setDurationMs(metadata.durationMs);
      setPoster(metadata.poster);
      setPreviewWarning(metadata.previewAvailable ? '' : '当前设备无法预览此视频，但仍可直接上传。若上传后也无法播放，请转换为 H.264 编码的 MP4。');
      if (kind === 'memory') {
        const clipSeconds = Math.max(1, Math.min(metadata.durationMs / 1_000, song.duration));
        setSongEnd(Math.min(song.trimEnd || song.duration, songStart + clipSeconds));
      }
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : '视频读取失败');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file || !song.ownerId || busy) return;
    if (kind === 'memory' && songEnd <= songStart) {
      feedback.error('记忆片段的结束位置需要晚于开始位置');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await supabaseApi.createSongVideo(song.id, song.ownerId, {
        kind,
        videoFile: file,
        posterFile: poster,
        durationMs,
        videoStartMs: 0,
        videoEndMs: durationMs,
        songStartMs: kind === 'memory' ? songStart * 1_000 : null,
        songEndMs: kind === 'memory' ? songEnd * 1_000 : null,
        audioMix: kind === 'memory' ? audioMix : 1,
      }, setProgress);
      feedback.success(`${kindLabel(kind)}已保存`);
      setFile(null);
      setPoster(null);
      setDurationMs(0);
      setPreviewWarning('');
      await loadRows();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : 'MV 保存失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: SongVideoRow) => {
    if (busy || !window.confirm(`删除这段${kindLabel(row.kind)}？`)) return;
    setBusy(true);
    try {
      await supabaseApi.deleteSongVideo(row);
      setRows((current) => current.filter((item) => item.id !== row.id));
      feedback.success('影像已删除');
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/72 p-3 backdrop-blur-md sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 p-5 shadow-2xl backdrop-blur-2xl" style={{ backgroundColor: 'rgba(9, 9, 11, 0.965)' }} initial={{ y: 28, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="text-xl font-black text-white">影像与 MV</h2><p className="mt-1 text-xs text-white/45">{song.title}</p></div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/7 text-white/65" aria-label="关闭"><Icons.X size={20} /></button>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-2xl bg-white/[0.055] p-1">
          {(['memory', 'full'] as SongVideoKind[]).map((value) => (
            <button key={value} onClick={() => setKind(value)} className={`min-h-11 rounded-xl text-sm font-bold transition ${kind === value ? 'bg-white text-black' : 'text-white/48'}`}>{kindLabel(value)}</button>
          ))}
        </div>

        <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-white/18 bg-white/[0.025] text-sm font-bold text-white/70">
          <Icons.Upload size={19} />{file ? file.name : `选择${kindLabel(kind)}视频`}
        </button>
        <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm" className="hidden" onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        {previewWarning ? <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs font-medium leading-relaxed text-amber-100/75">{previewWarning}</p> : null}

        <AnimatePresence initial={false}>
          {kind === 'memory' && file ? (
            <motion.div className="mt-5 space-y-5" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-white/45">歌曲开始<input type="number" min={song.trimStart} max={song.trimEnd || song.duration} step="0.1" value={songStart} onChange={(e) => setSongStart(Number(e.target.value))} className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-black/30 px-3 text-white outline-none" /></label>
                <label className="text-xs font-bold text-white/45">歌曲结束<input type="number" min={songStart + 0.1} max={song.trimEnd || song.duration} step="0.1" value={songEnd} onChange={(e) => setSongEnd(Number(e.target.value))} className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-black/30 px-3 text-white outline-none" /></label>
              </div>
              <label className="block">
                <span className="flex justify-between text-xs font-bold text-white/52"><span>歌曲录音</span><span>视频原声</span></span>
                <input type="range" min="0" max="1" step="0.01" value={audioMix} onChange={(e) => setAudioMix(Number(e.target.value))} className="mt-3 w-full accent-red-500" aria-label="歌曲录音与视频原声混合" />
              </label>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {busy && progress > 0 ? <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-red-500 transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
        <button onClick={save} disabled={!file || busy} className="mt-5 min-h-12 w-full rounded-2xl bg-red-500 text-sm font-black text-white disabled:opacity-35">{busy ? '处理中…' : `保存${kindLabel(kind)}`}</button>

        {rows.length ? <div className="mt-6 space-y-2 border-t border-white/8 pt-5">{rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.045] px-4 py-3"><Icons.Video size={18} className="text-white/55" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">{kindLabel(row.kind)}</p><p className="truncate text-xs text-white/35">{row.file_name}</p></div><button onClick={() => void remove(row)} className="grid h-9 w-9 place-items-center text-red-400" aria-label={`删除${kindLabel(row.kind)}`}><Icons.Trash size={17} /></button></div>
        ))}</div> : null}
      </motion.div>
    </motion.div>
  );
};
