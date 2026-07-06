import type { UploadDraftMeta } from '../uploadDraftStorage';

export type UploadVisibility = 'public' | 'private';

export interface NormalizedUploadDraftMeta {
  title: string;
  artist: string;
  album: string;
  genre: string;
  story: string;
  visibility: UploadVisibility;
  duration: number | null;
  range: [number, number] | null;
}

const isVisibility = (value: unknown): value is UploadVisibility => value === 'public' || value === 'private';

const normalizeDuration = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
};

const normalizeRange = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [start, end] = value;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [start, end];
};

export const normalizeUploadDraftMeta = (meta: UploadDraftMeta): NormalizedUploadDraftMeta => ({
  title: meta.title ?? '',
  artist: meta.artist ?? '',
  album: meta.album ?? '',
  genre: meta.genre ?? '',
  story: meta.story ?? '',
  visibility: isVisibility(meta.visibility) ? meta.visibility : 'public',
  duration: normalizeDuration(meta.duration),
  range: normalizeRange(meta.range),
});

export const createUploadDraftMeta = (input: {
  title: string;
  artist: string;
  album: string;
  genre: string;
  story: string;
  visibility: UploadVisibility;
  duration: number;
  range: [number, number];
}): UploadDraftMeta => ({
  title: input.title,
  artist: input.artist,
  album: input.album,
  genre: input.genre,
  story: input.story,
  visibility: input.visibility,
  duration: input.duration,
  range: input.range,
});
