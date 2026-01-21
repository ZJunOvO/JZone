const DB_NAME = 'jzone-player-library';
const DB_VERSION = 1;
const STORE_NAME = 'library-songs';

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

export interface LocalSongMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  story?: string;
  fileSize?: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  uploadedBy: string;
  addedAt: number;
  coverUrl?: string;
}

interface LocalSongRecord {
  meta: LocalSongMeta;
  audioFile: File;
  coverFile?: File;
}

export const localLibraryStorage = {
  saveSong: async (record: LocalSongRecord) => {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(record, record.meta.id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },

  getAllSongs: async () => {
    const records = await withStore('readonly', (store) => {
      return new Promise<LocalSongRecord[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as LocalSongRecord[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    });

    return records.map((r) => {
      const audioUrl = URL.createObjectURL(r.audioFile);
      const coverUrl = r.coverFile ? URL.createObjectURL(r.coverFile) : (r.meta.coverUrl ?? '');
      return { meta: r.meta, audioUrl, coverUrl };
    });
  },

  removeSong: async (id: string) => {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },
};

