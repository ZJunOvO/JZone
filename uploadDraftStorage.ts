const DB_NAME = 'jzone-player-upload-draft';
const DB_VERSION = 1;
const STORE_NAME = 'upload-draft';

type DraftKey = 'audio' | 'cover' | 'meta';

interface StoredFilePayload {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

const memoryFiles: Partial<Record<'audio' | 'cover', File>> = {};

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

const idbGet = async <T>(key: DraftKey): Promise<T | null> => {
  return withStore('readonly', (store) => {
    return new Promise<T | null>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
};

const idbPut = async (key: DraftKey, value: any): Promise<void> => {
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
};

const idbDelete = async (key: DraftKey): Promise<void> => {
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

const getStoredFile = async (key: 'audio' | 'cover', fallbackName: string) => {
  const memory = memoryFiles[key];
  if (memory?.size) return memory;
  const stored = await idbGet<unknown>(key);
  const file = fromStoredFilePayload(stored, fallbackName);
  if (file) memoryFiles[key] = file;
  return file;
};

const setStoredFile = async (key: 'audio' | 'cover', file: File) => {
  memoryFiles[key] = file;
  await idbPut(key, toStoredFilePayload(file));
};

const deleteStoredFile = async (key: 'audio' | 'cover') => {
  delete memoryFiles[key];
  await idbDelete(key);
};

export const uploadDraftStorage = {
  getAudio: () => getStoredFile('audio', 'audio'),
  setAudio: (file: File) => setStoredFile('audio', file),
  deleteAudio: () => deleteStoredFile('audio'),

  getCover: () => getStoredFile('cover', 'cover'),
  setCover: (file: File) => setStoredFile('cover', file),
  deleteCover: () => deleteStoredFile('cover'),

  getMeta: () => idbGet<UploadDraftMeta>('meta'),
  setMeta: (meta: UploadDraftMeta) => idbPut('meta', meta),
  deleteMeta: () => idbDelete('meta'),

  clearAll: async () => {
    delete memoryFiles.audio;
    delete memoryFiles.cover;
    await Promise.all([idbDelete('audio'), idbDelete('cover'), idbDelete('meta')]);
  },
};

