const normalizeSharedId = (value: string | null | undefined, fallback: string) => {
  const raw = value?.trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
};

export const sharedElementIds = {
  profileAvatar: (userId?: string | null) => `profile-avatar-${normalizeSharedId(userId, 'current')}`,
  songCover: (songId?: string | null) => `song-cover-${normalizeSharedId(songId, 'current')}`,
  songTitle: (songId?: string | null) => `song-title-${normalizeSharedId(songId, 'current')}`,
  songArtist: (songId?: string | null) => `song-artist-${normalizeSharedId(songId, 'current')}`,
  collectionCover: (collectionId?: string | null) => `collection-cover-${normalizeSharedId(collectionId, 'current')}`,
};

export const SHARED_ELEMENT_TRANSITION = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 32,
  mass: 0.78,
};
