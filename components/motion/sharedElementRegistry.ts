const normalizeSharedId = (value: string | null | undefined, fallback: string) => {
  const raw = value?.trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
};

export const sharedElementIds = {
  collectionCover: (collectionId?: string | null) => `collection-cover-${normalizeSharedId(collectionId, 'current')}`,
};

export const SHARED_ELEMENT_TRANSITION = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 32,
  mass: 0.78,
};
