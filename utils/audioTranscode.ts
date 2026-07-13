import { guessAudioMime } from './uploadAudio';

type TranscodeProgress = {
  progress: number;
  message: string;
};

let ffmpegInstance: any = null;
let ffmpegLoadPromise: Promise<any> | null = null;
let activeProgressCallback: ((progress: TranscodeProgress) => void) | undefined;

const localCoreURL = '/ffmpeg-core/ffmpeg-core.js';
const localWasmURL = '/ffmpeg-core/ffmpeg-core.wasm';
const cdnBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? 'input' : name.slice(idx + 1).toLowerCase();
};

const replaceExt = (name: string, ext: string) => name.replace(/\.[^/.]+$/, '') + `.${ext}`;

const fetchAsBlobUrl = async (
  url: string,
  mime: string,
  startProgress: number,
  endProgress: number,
  message: string,
  onProgress?: (progress: TranscodeProgress) => void,
) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({ progress: endProgress, message });
    return URL.createObjectURL(new Blob([blob], { type: mime }));
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    chunks.push(value);
    received += value.byteLength;
    const ratio = total > 0 ? Math.min(1, received / total) : 0;
    onProgress?.({
      progress: startProgress + (endProgress - startProgress) * ratio,
      message,
    });
  }
  onProgress?.({ progress: endProgress, message });
  return URL.createObjectURL(new Blob(chunks, { type: mime }));
};
const loadCoreFrom = async (
  ffmpeg: any,
  baseUrl: string,
  onProgress?: (progress: TranscodeProgress) => void,
) => {
  const coreUrl = baseUrl.endsWith('.js') ? baseUrl : `${baseUrl}/ffmpeg-core.js`;
  const wasmUrl = baseUrl.endsWith('.js')
    ? baseUrl.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.wasm')
    : `${baseUrl}/ffmpeg-core.wasm`;
  let coreBlobUrl = '';
  let wasmBlobUrl = '';
  try {
    coreBlobUrl = await fetchAsBlobUrl(coreUrl, 'text/javascript', 0.02, 0.04, '正在加载转换程序…', onProgress);
    wasmBlobUrl = await fetchAsBlobUrl(wasmUrl, 'application/wasm', 0.04, 0.3, '正在加载音频转换核心…', onProgress);
    await ffmpeg.load({ coreURL: coreBlobUrl, wasmURL: wasmBlobUrl });
  } finally {
    if (coreBlobUrl) URL.revokeObjectURL(coreBlobUrl);
    if (wasmBlobUrl) URL.revokeObjectURL(wasmBlobUrl);
  }
};

const loadFfmpeg = async (onProgress?: (progress: TranscodeProgress) => void) => {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) {
        activeProgressCallback?.({
          progress: 0.35 + Math.max(0, Math.min(1, progress)) * 0.6,
          message: '正在转换音频…',
        });
      }
    });

    onProgress?.({ progress: 0.02, message: '正在加载音频转码核心…' });
    try {
      await loadCoreFrom(ffmpeg, localCoreURL, onProgress);
    } catch (localError) {
      onProgress?.({ progress: 0.02, message: '本地转码核心加载失败，尝试备用源…' });
      try {
        await loadCoreFrom(ffmpeg, cdnBaseURL, onProgress);
      } catch (cdnError: any) {
        const localMessage = localError instanceof Error ? localError.message : String(localError);
        const cdnMessage = cdnError instanceof Error ? cdnError.message : String(cdnError);
        throw new Error(`转码核心加载失败：本地 ${localMessage || '未知'}；备用源 ${cdnMessage || '未知'}`);
      }
    }
    ffmpeg.loaded = true;
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (error) {
    ffmpegLoadPromise = null;
    throw error;
  }
};

export const transcodeAudioToMp3 = async (
  inputFile: File,
  onProgress?: (progress: TranscodeProgress) => void
): Promise<File> => {
  activeProgressCallback = onProgress;
  try {
    const [{ fetchFile }, ffmpeg] = await Promise.all([
      import('@ffmpeg/util'),
      loadFfmpeg(onProgress),
    ]);

    const inputName = `input.${getExt(inputFile.name)}`;
    const outputName = 'output.mp3';
    onProgress?.({ progress: 0.32, message: '正在读取原始音频…' });

    await ffmpeg.writeFile(inputName, await fetchFile(inputFile));
    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-map',
      '0:a:0',
      '-vn',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`音频转码失败（FFmpeg exit ${exitCode}）`);
    }

    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    const blob = new Blob([data], { type: 'audio/mpeg' });
    const name = replaceExt(inputFile.name || 'audio', 'mp3');
    onProgress?.({ progress: 1, message: '转码完成' });
    return new File([blob], name, { type: guessAudioMime(name) || 'audio/mpeg' });
  } finally {
    activeProgressCallback = undefined;
  }
};
