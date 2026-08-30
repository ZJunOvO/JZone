import type { SongVideoRow } from '../supabaseApi';

export const getMemoryVideoSegment = (
  row: SongVideoRow | null | undefined,
  trimStart: number,
  trimEnd: number,
) => {
  const duration = Math.max(0.1, trimEnd - trimStart);
  if (!row || row.kind !== 'memory' || row.song_start_ms == null || row.song_end_ms == null) {
    return { start: 0, end: 0, leftPercent: 0, widthPercent: 0 };
  }
  const start = Math.max(trimStart, row.song_start_ms / 1_000);
  const end = Math.min(trimEnd, row.song_end_ms / 1_000);
  const leftPercent = Math.max(0, Math.min(100, ((start - trimStart) / duration) * 100));
  const widthPercent = Math.max(0, Math.min(100 - leftPercent, ((end - start) / duration) * 100));
  return { start, end, leftPercent, widthPercent };
};

export const getMemoryAudioMix = (audioMix: number, baseVolume: number) => {
  const mix = Math.max(0, Math.min(1, Number.isFinite(audioMix) ? audioMix : 0));
  const volume = Math.max(0, Math.min(1, Number.isFinite(baseVolume) ? baseVolume : 0));
  return {
    songMultiplier: 1 - mix,
    videoVolume: mix * volume,
  };
};
