import { uploadDraftStorage } from '../uploadDraftStorage';

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

export const getAudioExtFromMime = (mime?: string) => {
  const normalized = (mime || '').toLowerCase().split(';')[0].trim();
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/mp4' || normalized === 'video/mp4' || normalized === 'audio/x-m4a') return 'm4a';
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return 'wav';
  if (normalized === 'audio/flac' || normalized === 'audio/x-flac') return 'flac';
  if (normalized === 'audio/amr') return 'amr';
  if (normalized === 'audio/3gpp' || normalized === 'audio/3gpp2') return '3gp';
  return '';
};

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
};

const sniffAudioMime = (bytes: Uint8Array) => {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 3 && text(0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && text(0, 4) === 'fLaC') return 'audio/flac';
  if (bytes.length >= 12 && text(4, 8) === 'ftyp') return 'audio/mp4';
  if (bytes.length >= 6 && text(0, 6) === '#!AMR\n') return 'audio/amr';
  return '';
};

const withAudioExtension = (name: string, mime: string) => {
  if (getExt(name)) return name;
  const ext = getAudioExtFromMime(mime);
  return ext ? `${name}.${ext}` : name;
};

const isGenericMime = (mime?: string) => {
  const normalized = (mime || '').toLowerCase().split(';')[0].trim();
  return !normalized || normalized === 'application/octet-stream' || normalized === 'binary/octet-stream';
};

const stableAudioSnapshots = new WeakSet<File>();
const stableAudioDurations = new WeakMap<File, number>();

const readWithFileReader = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader unavailable'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('FileReader returned no bytes'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onabort = () => reject(new Error('FileReader aborted'));
    reader.readAsArrayBuffer(blob);
  });

const readWithStream = async (blob: Blob) => {
  if (typeof blob.stream !== 'function') throw new Error('Blob stream unavailable');
  const chunks: Uint8Array[] = [];
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks).arrayBuffer();
};

const readSourceBytes = async (sourceFile: File) => {
  const failures: string[] = [];
  const readers: Array<() => Promise<ArrayBuffer>> = [
    () => sourceFile.arrayBuffer(),
    () => readWithFileReader(sourceFile),
    () => readWithStream(sourceFile),
  ];

  for (const read of readers) {
    try {
      const buffer = await read();
      if (buffer.byteLength > 0) return buffer;
      failures.push('返回 0 字节');
    } catch (error) {
      failures.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }

  throw new Error(`浏览器无法读取该文件（${failures.filter(Boolean).join('；') || '未知错误'}）。请先在系统文件管理器中将录音保存到“下载”目录后再选择。`);
};

const findBytes = (bytes: Uint8Array, pattern: number[], from = 0, to = bytes.length) => {
  const end = Math.min(to, bytes.length) - pattern.length;
  for (let index = Math.max(0, from); index <= end; index += 1) {
    let matches = true;
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  return -1;
};

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

const readUint64 = (bytes: Uint8Array, offset: number) => {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4);
  return high * 0x100000000 + low;
};

const extractMp4Duration = (bytes: Uint8Array) => {
  const markerIndex = findBytes(bytes, [0x6d, 0x76, 0x68, 0x64]);
  if (markerIndex < 0 || markerIndex + 32 > bytes.length) return null;
  const version = bytes[markerIndex + 4];
  const timescaleOffset = markerIndex + (version === 1 ? 24 : 16);
  const durationOffset = markerIndex + (version === 1 ? 28 : 20);
  const timescale = readUint32(bytes, timescaleOffset);
  const duration = version === 1 ? readUint64(bytes, durationOffset) : readUint32(bytes, durationOffset);
  const seconds = timescale > 0 ? duration / timescale : 0;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

const extractMp4TextTag = (bytes: Uint8Array, marker: number[]) => {
  let markerIndex = findBytes(bytes, marker);
  while (markerIndex >= 0) {
    const searchEnd = Math.min(bytes.length, markerIndex + 256 * 1024);
    const dataIndex = findBytes(bytes, [0x64, 0x61, 0x74, 0x61], markerIndex + marker.length, searchEnd);
    if (dataIndex >= 4) {
      const atomStart = dataIndex - 4;
      const atomSize = readUint32(bytes, atomStart);
      const payloadStart = dataIndex + 12;
      const payloadEnd = Math.min(bytes.length, atomStart + atomSize);
      if (atomSize >= 16 && payloadEnd > payloadStart) {
        const value = new TextDecoder('utf-8')
          .decode(bytes.slice(payloadStart, payloadEnd))
          .replace(/[\u0000-\u001f]+/g, ' ')
          .trim();
        if (value) return value;
      }
    }
    markerIndex = findBytes(bytes, marker, markerIndex + marker.length);
  }
  return '';
};

const extractMp4Tags = (bytes: Uint8Array) => ({
  title: extractMp4TextTag(bytes, [0xa9, 0x6e, 0x61, 0x6d]) || undefined,
  artist:
    extractMp4TextTag(bytes, [0xa9, 0x41, 0x52, 0x54])
    || extractMp4TextTag(bytes, [0x61, 0x41, 0x52, 0x54])
    || undefined,
});

const formatRecordingName = (lastModified: number, ext: string) => {
  const date = new Date(lastModified || Date.now());
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
  return `录音-${stamp}.${ext || 'm4a'}`;
};

const resolveSnapshotName = (originalName: string, type: string, bytes: Uint8Array, lastModified: number) => {
  const withExtension = withAudioExtension(originalName || 'audio', type);
  const baseName = withExtension.replace(/\.[^/.]+$/, '').trim();
  if (!/^\d{6,}$/.test(baseName)) return withExtension;

  const tags: { title?: string; artist?: string } = type === 'audio/mp4' ? extractMp4Tags(bytes) : {};
  const ext = getExt(withExtension) || getAudioExtFromMime(type) || 'm4a';
  const safeTitle = tags.title?.replace(/[\\/:*?"<>|]/g, '-').trim();
  return safeTitle ? `${safeTitle}.${ext}` : formatRecordingName(lastModified, ext);
};

export const makePreviewBlob = (audioFile: File) => {
  const mime = audioFile.type || guessAudioMime(audioFile.name);
  if (!mime) return audioFile;
  if (audioFile.type === mime) return audioFile;
  return audioFile.slice(0, audioFile.size, mime);
};

export const snapshotAudioFile = async (sourceFile: File): Promise<File> => {
  if (stableAudioSnapshots.has(sourceFile)) return sourceFile;

  const originalName = sourceFile.name || 'audio';
  const lastModified = sourceFile.lastModified || Date.now();
  const buffer = await readSourceBytes(sourceFile);
  const bytes = new Uint8Array(buffer);
  const head = bytes.slice(0, Math.min(bytes.byteLength, 64));
  const sniffedType = sniffAudioMime(head);
  const type = sniffedType || (isGenericMime(sourceFile.type) ? '' : sourceFile.type) || guessAudioMime(originalName) || 'application/octet-stream';
  const name = resolveSnapshotName(originalName, type, bytes, lastModified);
  const snapshot = new File([buffer], name, { type, lastModified });
  stableAudioSnapshots.add(snapshot);
  const duration = type === 'audio/mp4' ? extractMp4Duration(bytes) : null;
  if (duration) stableAudioDurations.set(snapshot, duration);
  return snapshot;
};

const decodeId3Text = (payload: Uint8Array) => {
  if (!payload.length) return '';
  const encoding = payload[0];
  const body = payload.slice(1);
  if (encoding === 1 || encoding === 2) {
    let offset = 0;
    let littleEndian = true;
    if (body[0] === 0xff && body[1] === 0xfe) {
      offset = 2;
      littleEndian = true;
    } else if (body[0] === 0xfe && body[1] === 0xff) {
      offset = 2;
      littleEndian = false;
    }
    const codes: number[] = [];
    for (let i = offset; i + 1 < body.length; i += 2) {
      codes.push(littleEndian ? body[i] | (body[i + 1] << 8) : (body[i] << 8) | body[i + 1]);
    }
    return String.fromCharCode(...codes).replace(/\u0000+$/g, '').trim();
  }
  const decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'latin1');
  return decoder.decode(body).replace(/\u0000+$/g, '').trim();
};

const readSynchsafe = (bytes: Uint8Array, offset: number) => {
  return (bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3];
};

export const readEmbeddedAudioTags = async (audioFile: File): Promise<{ title?: string; artist?: string }> => {
  const head = new Uint8Array(await audioFile.slice(0, Math.min(audioFile.size, 512 * 1024)).arrayBuffer());
  if (sniffAudioMime(head.slice(0, 64)) === 'audio/mp4') {
    const tailStart = Math.max(head.byteLength, audioFile.size - 2 * 1024 * 1024);
    const tail = tailStart < audioFile.size
      ? new Uint8Array(await audioFile.slice(tailStart).arrayBuffer())
      : new Uint8Array();
    const searchable = new Uint8Array(head.byteLength + tail.byteLength);
    searchable.set(head);
    searchable.set(tail, head.byteLength);
    return extractMp4Tags(searchable);
  }
  if (head.length < 20 || String.fromCharCode(...head.slice(0, 3)) !== 'ID3') return {};

  const tagEnd = Math.min(head.length, 10 + readSynchsafe(head, 6));
  let offset = 10;
  const tags: { title?: string; artist?: string } = {};

  while (offset + 10 <= tagEnd) {
    const id = String.fromCharCode(...head.slice(offset, offset + 4));
    const size = (head[offset + 4] << 24) | (head[offset + 5] << 16) | (head[offset + 6] << 8) | head[offset + 7];
    if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0) break;
    const frameStart = offset + 10;
    const frameEnd = Math.min(frameStart + size, tagEnd);
    const payload = head.slice(frameStart, frameEnd);
    if (id === 'TIT2') tags.title = decodeId3Text(payload);
    if (id === 'TPE1') tags.artist = decodeId3Text(payload);
    if (tags.title && tags.artist) break;
    offset = frameEnd;
  }

  return tags;
};

export const readAudioDurationMetadata = async (audioFile: File) => {
  const cachedDuration = stableAudioDurations.get(audioFile);
  if (cachedDuration) return cachedDuration;
  const mime = audioFile.type || guessAudioMime(audioFile.name);
  if (mime !== 'audio/mp4' && mime !== 'video/mp4' && mime !== 'audio/x-m4a') return null;

  const headSize = Math.min(audioFile.size, 2 * 1024 * 1024);
  const head = new Uint8Array(await audioFile.slice(0, headSize).arrayBuffer());
  const fromHead = extractMp4Duration(head);
  if (fromHead) return fromHead;

  const tailStart = Math.max(headSize, audioFile.size - 4 * 1024 * 1024);
  if (tailStart >= audioFile.size) return null;
  const tail = new Uint8Array(await audioFile.slice(tailStart).arrayBuffer());
  return extractMp4Duration(tail);
};

export const persistDraftAudio = (audioFile: File) => {
  const maxPersistBytes = 25 * 1024 * 1024;
  if (audioFile.size > maxPersistBytes) return Promise.resolve();
  return uploadDraftStorage.setAudio(audioFile);
};

export const adjustRangeForDuration = (prev: [number, number], duration: number): [number, number] => {
  const prevEnd = prev[1];
  if (!Number.isFinite(prevEnd) || prevEnd <= 0) return [0, duration];
  if (Math.abs(prevEnd - 240) < 1.5) return [0, duration];
  if (prevEnd > duration) return [prev[0], duration];
  return prev;
};
