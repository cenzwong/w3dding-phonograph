// --- Database Wrapper (IndexedDB) ---
// Architecture note: Wrapping IndexedDB in Promises to ensure async/await compatibility.
import { formatBytesToMB } from './utils/formatters';

const DB_NAME = 'WeddingBoothDB';
const STORE_NAME = 'videos';
const METADATA_STORE_NAME = 'metadata';

export interface VideoRecord {
  id: string;
  timestamp: string;
  blob: Blob;
  size: number;
}

export interface StatsRecord {
  id: 'stats';
  count: number;
  totalSize: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const transaction = (e.target as IDBOpenDBRequest).transaction;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }

        let metaStore: IDBObjectStore;
        if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          metaStore = db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
        } else {
          metaStore = transaction!.objectStore(METADATA_STORE_NAME);
        }

        // Initialize default stats
        metaStore.put({ id: 'stats', count: 0, totalSize: 0 });

        // If upgrading from v1 and the videos store already existed, calculate stats
        if (e.oldVersion === 1 && transaction) {
          const videoStore = transaction.objectStore(STORE_NAME);
          const cursorRequest = videoStore.openCursor();

          let count = 0;
          let totalSize = 0;

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              count++;
              totalSize += cursor.value.size || 0;
              cursor.continue();
            } else {
              metaStore.put({ id: 'stats', count, totalSize });
            }
          };
        }
      };
    });
  }
  return dbPromise;
};

export const saveVideoToDB = async (videoBlob: Blob): Promise<VideoRecord> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(METADATA_STORE_NAME);

    const record: VideoRecord = {
      id: `wedding_${Date.now()}`,
      timestamp: new Date().toISOString(),
      blob: videoBlob,
      size: videoBlob.size
    };

    const request = store.put(record);

    request.onsuccess = () => {
      const statsRequest = metaStore.get('stats');
      statsRequest.onsuccess = () => {
        const stats = statsRequest.result as StatsRecord;
        const newStats: StatsRecord = {
          id: 'stats',
          count: (stats?.count || 0) + 1,
          totalSize: (stats?.totalSize || 0) + record.size
        };
        metaStore.put(newStats);
      };
    };

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAllVideos = async (): Promise<VideoRecord[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getDatabaseStats = async (): Promise<{ count: number, sizeMB: string }> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE_NAME], 'readonly');
    const metaStore = transaction.objectStore(METADATA_STORE_NAME);
    const request = metaStore.get('stats');

    request.onsuccess = () => {
      const stats = request.result as StatsRecord;
      if (stats) {
        resolve({ count: stats.count, sizeMB: formatBytesToMB(stats.totalSize) });
      } else {
        resolve({ count: 0, sizeMB: formatBytesToMB(0) });
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const clearDB = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(METADATA_STORE_NAME);

    store.clear();
    metaStore.put({ id: 'stats', count: 0, totalSize: 0 } as StatsRecord);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};
