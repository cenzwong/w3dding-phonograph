import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllVideos, saveVideoToDB, clearDB } from './App';
import 'fake-indexeddb/auto';

import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Define a base MockMediaRecorder that test cases can override if needed
class MockMediaRecorder {
  stream: any;
  options: any;
  state: string;
  mimeType: string;
  onstart: any;
  onstop: any;
  ondataavailable: any;

  constructor(stream: any, options: any) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.mimeType = options?.mimeType || 'video/mp4';
  }
  start() {
    this.state = 'recording';
    if (this.onstart) this.onstart();
  }
  stop() {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  }
  static isTypeSupported(type: string) { return true; }
}

beforeEach(() => {
  // Reset window.MediaRecorder for each test
  (window as any).MediaRecorder = MockMediaRecorder;

  vi.stubGlobal('navigator', {
    ...global.navigator,
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn(), readyState: 'live' }],
        getVideoTracks: () => [{ stop: vi.fn(), readyState: 'live' }],
        getAudioTracks: () => [{ stop: vi.fn(), readyState: 'live' }]
      })
    },
    wakeLock: { request: vi.fn().mockResolvedValue({}) },
    storage: { persist: vi.fn().mockResolvedValue(true) }
  });




});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});



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

describe('App startRecording logic', () => {
  it('should start recording when camera button is clicked', async () => {
    render(<App />);
    const recordBtn = await screen.findByText('點擊開始留言');
    fireEvent.click(recordBtn);
    const recordingIndicator = await screen.findByText(/REC 60s/i);
    expect(recordingIndicator).toBeInTheDocument();
  });

  it('should use fallback mimeType webm if mp4 is not supported', async () => {
    let usedMimeType = '';
    class FallbackMockMediaRecorder extends MockMediaRecorder {
      constructor(stream: any, options: any) {
        super(stream, options);
        usedMimeType = this.mimeType;
      }
      static isTypeSupported(type: string) {
        return type !== 'video/mp4';
      }
    }
    (window as any).MediaRecorder = FallbackMockMediaRecorder;

    render(<App />);
    const recordBtn = await screen.findByText('點擊開始留言');
    fireEvent.click(recordBtn);

    expect(usedMimeType).toBe('video/webm;codecs=vp8,opus');
  });

  it('handles MediaRecorder constructor error correctly', async () => {
    class ErrorMockMediaRecorder {
      constructor() {
        throw new Error('Fake MediaRecorder Error');
      }
      static isTypeSupported() { return true; }
    }
    (window as any).MediaRecorder = ErrorMockMediaRecorder;

    render(<App />);
    const recordBtn = await screen.findByText('點擊開始留言');
    fireEvent.click(recordBtn);

    const errorMsg = await screen.findByText('無法啟動錄影器，請重啟網頁。');
    expect(errorMsg).toBeInTheDocument();
  });

  it('stops recording correctly when stop button is clicked', async () => {
    let recorderStopCalled = false;
    class StoppableMockMediaRecorder extends MockMediaRecorder {
      stop() {
        super.stop();
        recorderStopCalled = true;
      }
    }
    (window as any).MediaRecorder = StoppableMockMediaRecorder;

    render(<App />);
    const recordBtn = await screen.findByText('點擊開始留言');
    fireEvent.click(recordBtn);

    const recordingIndicator = await screen.findByText(/REC 60s/i);
    expect(recordingIndicator).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const stopBtn = buttons[buttons.length - 1];
    fireEvent.click(stopBtn);

    expect(recorderStopCalled).toBe(true);
  });
});
