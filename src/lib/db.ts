// --- Database Wrapper (IndexedDB) ---
// Architecture note: Wrapping IndexedDB in Promises to ensure async/await compatibility.
const DB_NAME = 'WeddingBoothDB';
const STORE_NAME = 'videos';

let dbPromise: Promise<IDBDatabase> | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }
  return dbPromise;
};

export const saveVideoToDB = async (videoBlob: Blob): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record = {
      id: `wedding_${Date.now()}`,
      timestamp: new Date().toISOString(),
      blob: videoBlob,
      size: videoBlob.size
    };
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

export const getAllVideos = async (): Promise<any[]> => {
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
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    let count = 0;
    let totalSize = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        count++;
        totalSize += cursor.value.size || 0;
        cursor.continue();
      } else {
        resolve({ count, sizeMB: (totalSize / (1024 * 1024)).toFixed(1) });
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const clearDB = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
