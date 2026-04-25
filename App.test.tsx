import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App, { getAllVideos, saveVideoToDB, clearDB } from './App';
import 'fake-indexeddb/auto';

describe('Database functions', () => {
  beforeEach(async () => {
    try {
        await clearDB();
    } catch (e) {
        // ignore
    }
  });

  it('getAllVideos should return an empty array initially', async () => {
    const videos = await getAllVideos();
    expect(videos).toEqual([]);
  });

  it('getAllVideos should return saved videos', async () => {
    // create a dummy blob
    const dummyBlob = new Blob(['dummy content'], { type: 'video/mp4' });
    const savedRecord = await saveVideoToDB(dummyBlob);

    const videos = await getAllVideos();
    expect(videos.length).toBe(1);
    expect(videos[0].size).toBe(dummyBlob.size);
    expect(videos[0].id).toBe(savedRecord.id);
    expect(videos[0].timestamp).toBe(savedRecord.timestamp);

    // Check if we got something back for the blob
    expect(videos[0].blob).toBeDefined();
    // JS/DOM environment vs fake-indexeddb interactions sometimes cause blobs to become generic objects
    // depending on fake-indexeddb behavior
  });

  it('getAllVideos should return multiple saved videos', async () => {
    const blob1 = new Blob(['1'], { type: 'video/mp4' });
    const blob2 = new Blob(['22'], { type: 'video/mp4' });

    await saveVideoToDB(blob1);

    // Add small delay so IDs/timestamps might differ cleanly, although fake id timestamp logic works
    await new Promise(resolve => setTimeout(resolve, 10));

    await saveVideoToDB(blob2);

    const videos = await getAllVideos();
    expect(videos.length).toBe(2);

    // Sort logic isn't in getAllVideos itself, it just returns all
    // We check that both are returned
    const sizes = videos.map(v => v.size).sort();
    expect(sizes).toEqual([1, 2]);
  });
});

describe('App component', () => {
  it('handles initCamera error', async () => {
    // Mock navigator.mediaDevices
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('請允許相機與麥克風權限以繼續使用。')).toBeInTheDocument();
    });
  });
});
