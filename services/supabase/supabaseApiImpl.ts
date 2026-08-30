import {
  clearApiCache,
} from './cache';
import { isSupabaseEnabled } from './client';
import { createCollectionsApi } from './collections';
import { createInteractionsApi } from './interactions';
import { createListeningRecapApi } from './listeningRecap';
import { clearListeningRecapCache } from './listeningRecapCache';
import { createSongLyricsApi } from './lyrics';
import { createProfilesApi } from './profiles';
import { createSongArtistsApi } from './songArtists';
import { createSongVideosApi } from './songVideos';
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
const listeningRecapApi = createListeningRecapApi();
const songLyricsApi = createSongLyricsApi();
const profilesApi = createProfilesApi();
const songArtistsApi = createSongArtistsApi();
const songVideosApi = createSongVideosApi();

export const supabaseApi = {
  isEnabled: isSupabaseEnabled,
  ...collectionsApi,
  ...songsApi,
  ...interactionsApi,
  ...listeningRecapApi,
  ...songLyricsApi,
  ...profilesApi,
  ...songArtistsApi,
  ...songVideosApi,

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
    if (options?.media) {
      clearListeningRecapCache();
      clearSignedUrlCache();
    }
  },
};

