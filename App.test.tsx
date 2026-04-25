import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as AppMod from './App';

describe('saveVideoToDB', () => {
  beforeEach(async () => {
    // Clear the database before each test
    const req = indexedDB.deleteDatabase(AppMod.DB_NAME);
    await new Promise((resolve) => {
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should save a video blob to the database', async () => {
    const fakeBlob = new Blob(['fake video content'], { type: 'video/webm' });
    const record = await AppMod.saveVideoToDB(fakeBlob);

    expect(record).toBeDefined();
    expect(record.id).toMatch(/^wedding_\d+$/);
    expect(record.timestamp).toBeDefined();

    expect(record.blob).toBeDefined();
    expect(record.size).toBe(fakeBlob.size);

    const videos = await AppMod.getAllVideos();
    expect(videos.length).toBe(1);
    expect(videos[0].id).toBe(record.id);
    expect(videos[0].size).toBe(fakeBlob.size);
    expect(videos[0].blob).toBeDefined();
  });

  it('should handle errors when saving fails', async () => {
    const fakeBlob = new Blob(['fake video content'], { type: 'video/webm' });
    expect.assertions(1);

    // Instead of mocking IDBObjectStore, mock the global indexedDB object just for this test
    const originalIndexedDB = globalThis.indexedDB;

    Object.defineProperty(globalThis, 'indexedDB', {
        value: {
            open: () => {
                const req = {
                    onsuccess: null,
                    onerror: null,
                    onupgradeneeded: null,
                    result: {
                        transaction: () => ({
                            objectStore: () => ({
                                put: () => {
                                    const putReq = {
                                        onsuccess: null,
                                        onerror: null,
                                        error: new Error('Simulated IndexedDB put error')
                                    };
                                    setTimeout(() => {
                                        if (putReq.onerror) putReq.onerror({ target: putReq });
                                    }, 0);
                                    return putReq;
                                }
                            })
                        })
                    }
                };
                setTimeout(() => {
                    if (req.onsuccess) {
                        req.onsuccess({
                            target: { result: req.result }
                        });
                    }
                }, 0);
                return req;
            }
        },
        writable: true
    });

    try {
      await AppMod.saveVideoToDB(fakeBlob);
    } catch (e) {
      expect(e.message).toBe('Simulated IndexedDB put error');
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: originalIndexedDB, writable: true });
    }
  });
});
