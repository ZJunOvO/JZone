import {
  clearApiCache,
} from './cache';
import { isSupabaseEnabled } from './client';
import { createCollectionsApi } from './collections';
import { createInteractionsApi } from './interactions';
import { createProfilesApi } from './profiles';
import { createSongArtistsApi } from './songArtists';
import { createSongsApi } from './songs';
import {
  clearSignedUrlCache,
  createSignedAudioUrl,
  createSignedAvatarUrl,
  createSignedCoverUrl,
} from './storageApi';

const collectionsApi = createCollectionsApi();
const songsApi = createSongsApi();
const interactionsApi = createInteractionsApi();
const profilesApi = createProfilesApi();
const songArtistsApi = createSongArtistsApi();

export const supabaseApi = {
  isEnabled: isSupabaseEnabled,
  ...collectionsApi,
  ...songsApi,
  ...interactionsApi,
  ...profilesApi,
  ...songArtistsApi,

  async createSignedAudioUrl(path: string, expiresInSeconds = 8 * 24 * 60 * 60) {
    return createSignedAudioUrl(path, expiresInSeconds);
  },

  async createSignedCoverUrl(path: string, expiresInSeconds = 31 * 24 * 60 * 60) {
    return createSignedCoverUrl(path, expiresInSeconds);
  },

  async createSignedAvatarUrl(path: string, expiresInSeconds = 31 * 24 * 60 * 60) {
    return createSignedAvatarUrl(path, expiresInSeconds);
  },

  clearCache(options?: { media?: boolean }) {
    clearApiCache();
    if (options?.media) clearSignedUrlCache();
  },
};

