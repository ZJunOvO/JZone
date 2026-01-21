const DB_NAME = 'jzone-player';
const DB_VERSION = 1;
const STORE_NAME = 'upload-draft';

type DraftKey = 'audio' | 'cover' | 'meta';

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
  album: string;
  range?: [number, number];
  duration?: number;
}

export const uploadDraftStorage = {
  getAudio: () => idbGet<File>('audio'),
  setAudio: (file: File) => idbPut('audio', file),
  deleteAudio: () => idbDelete('audio'),

  getCover: () => idbGet<File>('cover'),
  setCover: (file: File) => idbPut('cover', file),
  deleteCover: () => idbDelete('cover'),

  getMeta: () => idbGet<UploadDraftMeta>('meta'),
  setMeta: (meta: UploadDraftMeta) => idbPut('meta', meta),
  deleteMeta: () => idbDelete('meta'),

  clearAll: async () => {
    await Promise.all([idbDelete('audio'), idbDelete('cover'), idbDelete('meta')]);
  },
};

