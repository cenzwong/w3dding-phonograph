import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App, { getAllVideos, saveVideoToDB, clearDB } from './App';
import 'fake-indexeddb/auto';
import React from 'react';

// Mock MediaRecorder
const mockStop = vi.fn();
const mockStart = vi.fn();

class MockMediaRecorder {
  stream: any;
  options: any;
  state: string;
  mimeType: string;
  onstop: (() => void) | null = null;
  ondataavailable: ((event: any) => void) | null = null;

  static isTypeSupported() {
    return true;
  }
  constructor(stream: any, options: any) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.mimeType = 'video/mp4';
  }
  start() {
    this.state = 'recording';
    mockStart();
  }
  stop() {
    this.state = 'inactive';
    mockStop();
    if (this.onstop) this.onstop();
  }
}

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
    const dummyBlob = new Blob(['dummy content'], { type: 'video/mp4' });
    const savedRecord = await saveVideoToDB(dummyBlob) as any;

    const videos = await getAllVideos() as any[];
    expect(videos.length).toBe(1);
    expect(videos[0].size).toBe(dummyBlob.size);
    expect(videos[0].id).toBe(savedRecord.id);
    expect(videos[0].timestamp).toBe(savedRecord.timestamp);

    expect(videos[0].blob).toBeDefined();
  });

  it('getAllVideos should return multiple saved videos', async () => {
    const blob1 = new Blob(['1'], { type: 'video/mp4' });
    const blob2 = new Blob(['22'], { type: 'video/mp4' });

    await saveVideoToDB(blob1);
    await new Promise(resolve => setTimeout(resolve, 10));
    await saveVideoToDB(blob2);

    const videos = await getAllVideos() as any[];
    expect(videos.length).toBe(2);

    const sizes = videos.map(v => v.size).sort();
    expect(sizes).toEqual([1, 2]);
  });
});

describe('App Recording Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn(), readyState: 'live' }],
          getVideoTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });

    window.MediaRecorder = MockMediaRecorder as any;
  });

  it('should call stop on MediaRecorder when stopRecording is triggered', async () => {
    render(<App />);

    const startButton = await screen.findByText('點擊開始留言');
    await act(async () => {
      fireEvent.click(startButton);
    });

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });

    expect(screen.getByText(/REC/)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const stopButton = buttons.find(b => b.querySelector('svg'));
    if (stopButton) {
      await act(async () => {
        fireEvent.click(stopButton);
      });
    } else {
      throw new Error("Stop button not found");
    }

    await waitFor(() => {
      expect(mockStop).toHaveBeenCalled();
    });
  });

  it('should clear interval when stopRecording is triggered', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    render(<App />);

    const startButton = await screen.findByText('點擊開始留言');
    await act(async () => {
      fireEvent.click(startButton);
    });

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });

    const buttons = screen.getAllByRole('button');
    const stopButton = buttons.find(b => b.querySelector('svg'));
    if (stopButton) {
      await act(async () => {
        fireEvent.click(stopButton);
      });
    } else {
      throw new Error("Stop button not found");
    }

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should not throw error if stopRecording is called when MediaRecorder is inactive', async () => {
    const { unmount } = render(<App />);

    const startButton = await screen.findByText('點擊開始留言');
    await act(async () => {
      fireEvent.click(startButton);
    });

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });

    const buttons = screen.getAllByRole('button');
    const stopButton = buttons.find(b => b.querySelector('svg'));

    // Stop recording manually using stop button to invoke stopRecording.
    // Inside stopRecording, mediaRecorder state becomes 'inactive'.
    if (stopButton) {
      await act(async () => {
        fireEvent.click(stopButton);
      });
    }

    await waitFor(() => {
      expect(mockStop).toHaveBeenCalled();
    });

    // Unmounting will call cleanup and clear interval. We don't get an error.
    unmount();
  });
});
