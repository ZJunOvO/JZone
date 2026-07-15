export const STREAM_COPY_BITRATE_KBPS = 160;
export const STREAM_COPY_THRESHOLD_KBPS = 256;
export const MAX_BROWSER_TRANSCODE_BYTES = 96 * 1024 * 1024;
export const MAX_MOBILE_TRANSCODE_BYTES = 48 * 1024 * 1024;

const LOSSLESS_EXTENSIONS = new Set(['aif', 'aiff', 'alac', 'flac', 'wav', 'wave']);

const getExtension = (name: string) => {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
};

export interface AudioDeliveryAnalysis {
  estimatedBitrateKbps: number | null;
  isHighBitrate: boolean;
  canCreateStreamCopy: boolean;
  expectedSavingsPercent: number;
  targetBitrateKbps: number;
}

export const analyzeAudioDelivery = (file: Pick<File, 'name' | 'size'>, durationSeconds: number): AudioDeliveryAnalysis => {
  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
  const estimatedBitrateKbps = hasDuration
    ? Math.round((file.size * 8) / durationSeconds / 1000)
    : null;
  const isLosslessContainer = LOSSLESS_EXTENSIONS.has(getExtension(file.name));
  const isHighBitrate = isLosslessContainer
    || (estimatedBitrateKbps !== null && estimatedBitrateKbps > STREAM_COPY_THRESHOLD_KBPS);
  const likelyMobile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  const safeTranscodeLimit = likelyMobile ? MAX_MOBILE_TRANSCODE_BYTES : MAX_BROWSER_TRANSCODE_BYTES;
  const canCreateStreamCopy = isHighBitrate && file.size <= safeTranscodeLimit;
  const expectedSavingsPercent = estimatedBitrateKbps && estimatedBitrateKbps > STREAM_COPY_BITRATE_KBPS
    ? Math.max(0, Math.min(95, Math.round((1 - STREAM_COPY_BITRATE_KBPS / estimatedBitrateKbps) * 100)))
    : 0;

  return {
    estimatedBitrateKbps,
    isHighBitrate,
    canCreateStreamCopy,
    expectedSavingsPercent,
    targetBitrateKbps: STREAM_COPY_BITRATE_KBPS,
  };
};
