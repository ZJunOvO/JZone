const MP4_SCAN_HEAD_BYTES = 4 * 1024 * 1024;
const MP4_SCAN_TAIL_BYTES = 8 * 1024 * 1024;

const readUint64 = (view: DataView, offset: number) => {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  return high * 2 ** 32 + low;
};

const findMvhdDurationMs = (buffer: ArrayBuffer): number | null => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let index = 0; index <= bytes.length - 32; index += 1) {
    if (bytes[index] !== 0x6d || bytes[index + 1] !== 0x76 || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
    const content = index + 4;
    const version = view.getUint8(content);
    const timescaleOffset = version === 1 ? content + 20 : content + 12;
    const durationOffset = version === 1 ? content + 24 : content + 16;
    const requiredBytes = version === 1 ? 32 : 20;
    if (content + requiredBytes > view.byteLength) continue;
    const timescale = view.getUint32(timescaleOffset);
    const duration = version === 1 ? readUint64(view, durationOffset) : view.getUint32(durationOffset);
    if (!timescale || !Number.isFinite(duration) || duration <= 0) continue;
    const durationMs = Math.round(duration / timescale * 1_000);
    if (Number.isFinite(durationMs) && durationMs > 0) return durationMs;
  }
  return null;
};

const isMp4Container = (file: File) => (
  /\.(?:mp4|m4v|mov)$/i.test(file.name)
  || /^(?:video\/mp4|video\/quicktime)$/i.test(file.type)
);

/** 无需解码视频，只读取 MP4/MOV 容器的 mvhd 时长。 */
export const readMp4ContainerDurationMs = async (file: File): Promise<number | null> => {
  if (!isMp4Container(file)) return null;
  const headEnd = Math.min(file.size, MP4_SCAN_HEAD_BYTES);
  const headDuration = findMvhdDurationMs(await file.slice(0, headEnd).arrayBuffer());
  if (headDuration || file.size <= headEnd) return headDuration;

  const tailStart = Math.max(headEnd, file.size - MP4_SCAN_TAIL_BYTES);
  return findMvhdDurationMs(await file.slice(tailStart).arrayBuffer());
};
