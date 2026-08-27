const DB_NAME = 'jzone-player-upload-draft';
const DB_VERSION = 1;
const STORE_NAME = 'upload-draft';

type DraftKey = 'audio' | 'cover' | 'meta' | 'pendingFiles';
type OwnerId = string | null | undefined;

interface StoredFilePayload {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

type MemoryFiles = Partial<Record<'audio' | 'cover', File>>;

// 旧版本在同一个 object store 中使用固定字符串 audio/cover/meta，无法证明归属账号。
// 新逻辑只读取带 owner 的复合 key，旧键保留、不迁移也不删除，以免误归属或破坏用户数据。
const LEGACY_FIXED_KEYS = ['audio', 'cover', 'meta'] as const;
void LEGACY_FIXED_KEYS;

const memoryFiles = new Map<string, MemoryFiles>();
const memoryPendingFiles = new Map<string, File[]>();

const normalizeOwnerKey = (ownerId: OwnerId): string | null => {
  if (typeof ownerId !== 'string') return null;
  const normalized = ownerId.trim();
  if (!normalized) return null;
  try {
    return encodeURIComponent(normalized);
  } catch {
    return null;
  }
};

const getDraftStorageKey = (ownerId: OwnerId, key: DraftKey): IDBValidKey | null => {
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!normalizedOwnerKey) return null;
  // 使用 IDB 数组 key，而不是将 ownerId 与字段名直接拼接，避免分隔符歧义。
  return ['owner-scoped-v1', normalizedOwnerKey, key];
};

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> => {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await fn(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
};

const idbGet = async <T>(key: IDBValidKey): Promise<T | null> => {
  return withStore('readonly', (store) => {
    return new Promise<T | null>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
};

const idbPut = async (key: IDBValidKey, value: unknown): Promise<void> => {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
};

const idbDelete = async (key: IDBValidKey): Promise<void> => {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
};

export interface UploadDraftMeta {
  title: string;
  artist: string;
  artistCredits?: Array<{
    profileId?: string | null;
    displayName: string;
    role?: 'primary' | 'featured' | 'producer' | 'other';
    sortOrder?: number;
  }>;
  album: string;
  genre?: string;
  story?: string;
  visibility?: 'public' | 'private';
  streamOptimizationEnabled?: boolean;
  range?: [number, number];
  duration?: number;
}

const toStoredFilePayload = (file: File): StoredFilePayload => ({
  blob: file,
  name: file.name || 'audio',
  type: file.type || '',
  lastModified: file.lastModified || Date.now(),
});

const fromStoredFilePayload = (value: unknown, fallbackName: string): File | null => {
  if (!value) return null;

  if (value instanceof File) {
    return value.size > 0 ? value : null;
  }

  if (value instanceof Blob) {
    if (value.size <= 0) return null;
    return new File([value], fallbackName, { type: value.type || '', lastModified: Date.now() });
  }

  const payload = value as Partial<StoredFilePayload>;
  if (!(payload.blob instanceof Blob)) return null;
  if (payload.blob.size <= 0) return null;

  return new File([payload.blob], payload.name || fallbackName, {
    type: payload.type || payload.blob.type || '',
    lastModified: payload.lastModified || Date.now(),
  });
};

const fromStoredPendingFiles = (value: unknown): File[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => fromStoredFilePayload(item, `audio-${index + 1}`))
    .filter((file): file is File => Boolean(file));
};

const getStoredFile = async (ownerId: OwnerId, key: 'audio' | 'cover', fallbackName: string) => {
  const storageKey = getDraftStorageKey(ownerId, key);
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return null;

  const memory = memoryFiles.get(normalizedOwnerKey)?.[key];
  if (memory?.size) return memory;
  const stored = await idbGet<unknown>(storageKey);
  const file = fromStoredFilePayload(stored, fallbackName);
  if (file) {
    const ownerMemory = memoryFiles.get(normalizedOwnerKey) ?? {};
    ownerMemory[key] = file;
    memoryFiles.set(normalizedOwnerKey, ownerMemory);
  }
  return file;
};

const setStoredFile = async (ownerId: OwnerId, key: 'audio' | 'cover', file: File) => {
  const storageKey = getDraftStorageKey(ownerId, key);
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return;

  const ownerMemory = memoryFiles.get(normalizedOwnerKey) ?? {};
  ownerMemory[key] = file;
  memoryFiles.set(normalizedOwnerKey, ownerMemory);
  await idbPut(storageKey, toStoredFilePayload(file));
};

const deleteStoredFile = async (ownerId: OwnerId, key: 'audio' | 'cover') => {
  const storageKey = getDraftStorageKey(ownerId, key);
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return;

  const ownerMemory = memoryFiles.get(normalizedOwnerKey);
  if (ownerMemory) {
    delete ownerMemory[key];
    if (!ownerMemory.audio && !ownerMemory.cover) memoryFiles.delete(normalizedOwnerKey);
  }
  await idbDelete(storageKey);
};

const getPendingFiles = async (ownerId: OwnerId): Promise<File[]> => {
  const storageKey = getDraftStorageKey(ownerId, 'pendingFiles');
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return [];

  const memory = memoryPendingFiles.get(normalizedOwnerKey);
  if (memory) return [...memory];

  const stored = await idbGet<unknown>(storageKey);
  const files = fromStoredPendingFiles(stored);
  memoryPendingFiles.set(normalizedOwnerKey, files);
  return [...files];
};

const setPendingFiles = async (ownerId: OwnerId, files: File[]): Promise<void> => {
  const storageKey = getDraftStorageKey(ownerId, 'pendingFiles');
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return;

  const nextFiles = files.filter((file) => file.size > 0);
  memoryPendingFiles.set(normalizedOwnerKey, [...nextFiles]);
  if (!nextFiles.length) {
    await idbDelete(storageKey);
    return;
  }
  await idbPut(storageKey, nextFiles.map(toStoredFilePayload));
};

const deletePendingFiles = async (ownerId: OwnerId): Promise<void> => {
  const storageKey = getDraftStorageKey(ownerId, 'pendingFiles');
  const normalizedOwnerKey = normalizeOwnerKey(ownerId);
  if (!storageKey || !normalizedOwnerKey) return;

  memoryPendingFiles.delete(normalizedOwnerKey);
  await idbDelete(storageKey);
};

function setAudio(ownerId: OwnerId, file: File): Promise<void> {
  return setStoredFile(ownerId, 'audio', file);
}

function setCover(ownerId: OwnerId, file: File): Promise<void> {
  return setStoredFile(ownerId, 'cover', file);
}

export const uploadDraftStorage = {
  getAudio: (ownerId: OwnerId) => getStoredFile(ownerId, 'audio', 'audio'),
  setAudio,
  deleteAudio: (ownerId: OwnerId) => deleteStoredFile(ownerId, 'audio'),

  getCover: (ownerId: OwnerId) => getStoredFile(ownerId, 'cover', 'cover'),
  setCover,
  deleteCover: (ownerId: OwnerId) => deleteStoredFile(ownerId, 'cover'),

  getMeta: async (ownerId: OwnerId) => {
    const storageKey = getDraftStorageKey(ownerId, 'meta');
    return storageKey ? idbGet<UploadDraftMeta>(storageKey) : null;
  },
  setMeta: async (ownerId: OwnerId, meta: UploadDraftMeta) => {
    const storageKey = getDraftStorageKey(ownerId, 'meta');
    if (!storageKey) return;
    await idbPut(storageKey, meta);
  },
  deleteMeta: async (ownerId: OwnerId) => {
    const storageKey = getDraftStorageKey(ownerId, 'meta');
    if (!storageKey) return;
    await idbDelete(storageKey);
  },

  getPendingFiles,
  setPendingFiles,
  deletePendingFiles,

  clearAll: async (ownerId: OwnerId) => {
    const normalizedOwnerKey = normalizeOwnerKey(ownerId);
    const audioKey = getDraftStorageKey(ownerId, 'audio');
    const coverKey = getDraftStorageKey(ownerId, 'cover');
    const metaKey = getDraftStorageKey(ownerId, 'meta');
    if (!normalizedOwnerKey || !audioKey || !coverKey || !metaKey) return;

    // 这里只清理当前编辑草稿；pendingFiles 是独立的待编辑队列，保存或重置当前曲目时必须保留。
    memoryFiles.delete(normalizedOwnerKey);
    await Promise.all([idbDelete(audioKey), idbDelete(coverKey), idbDelete(metaKey)]);
  },
};

