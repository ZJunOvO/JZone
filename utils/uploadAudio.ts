import { uploadDraftStorage } from '../uploadDraftStorage';

type BrowserAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export const guessAudioMime = (filename: string) => {
  const idx = filename.lastIndexOf('.');
  const ext = idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'amr') return 'audio/amr';
  return '';
};

export const makePreviewBlob = (audioFile: File) => {
  const mime = audioFile.type || guessAudioMime(audioFile.name);
  if (!mime) return audioFile;
  if (audioFile.type === mime) return audioFile;
  return audioFile.slice(0, audioFile.size, mime);
};

export const persistDraftAudio = (audioFile: File) => {
  const maxPersistBytes = 25 * 1024 * 1024;
  if (audioFile.size > maxPersistBytes) return;
  const fn = () => {
    uploadDraftStorage.setAudio(audioFile).catch(() => {});
  };
  const requestIdleCallback = window.requestIdleCallback;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1500 });
    return;
  }
  window.setTimeout(fn, 0);
};

export const decodeAudioDuration = async (audioFile: File) => {
  const AudioContextCtor = window.AudioContext || (window as BrowserAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const ctx = new AudioContextCtor();
  try {
    const buf = await audioFile.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    return Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : null;
  } finally {
    await ctx.close().catch(() => {});
  }
};

export const adjustRangeForDuration = (prev: [number, number], duration: number): [number, number] => {
  const prevEnd = prev[1];
  if (!Number.isFinite(prevEnd) || prevEnd <= 0) return [0, duration];
  if (Math.abs(prevEnd - 240) < 1.5) return [0, duration];
  if (prevEnd > duration) return [prev[0], duration];
  return prev;
};
