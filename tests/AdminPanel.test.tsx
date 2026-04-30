import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminPanel } from '../src/features/admin/AdminPanel';
import * as dbLib from '../src/lib/db';

// Mock the DB functions
vi.mock('../src/lib/db', () => ({
  getAllVideos: vi.fn(),
  clearDB: vi.fn(),
}));

describe('AdminPanel', () => {
  const mockSetMode = vi.fn();
  const mockUpdateDbStats = vi.fn();
  const defaultDbStats = { count: 0, sizeMB: '0.0' };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.confirm
    window.confirm = vi.fn();

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();

    // Mock appendChild, removeChild on document.body for anchor tag
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node.nodeName.toLowerCase() === 'a') {
        return node; // don't actually append it to avoid messy DOM, just mock
      }
      return originalAppendChild(node);
    });

    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if (node.nodeName.toLowerCase() === 'a') {
        return node;
      }
      return originalRemoveChild(node);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with no videos', async () => {
    (dbLib.getAllVideos as any).mockResolvedValue([]);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={defaultDbStats}
        updateDbStats={mockUpdateDbStats}
      />
    );

    expect(screen.getByText('管理員後台')).toBeInTheDocument();
    expect(screen.getByText('總數: 0 條影片 | 佔用空間: 0.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回相機' })).toBeInTheDocument();

    // Ensure "Download All" is disabled
    const downloadAllBtn = screen.getByRole('button', { name: /全部匯出/i });
    expect(downloadAllBtn).toBeDisabled();

    // Wait for the empty message, as it depends on video state length which is 0
    await waitFor(() => {
      expect(screen.getByText('暫時未有任何留言。')).toBeInTheDocument();
    });
  });

  it('calls setMode("idle") when return button is clicked', async () => {
    (dbLib.getAllVideos as any).mockResolvedValue([]);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={defaultDbStats}
        updateDbStats={mockUpdateDbStats}
      />
    );

    // Wait for the empty message to ensure the initial load effect has finished
    // to avoid act() warnings when the promise resolves after the test ends
    await waitFor(() => {
      expect(screen.getByText('暫時未有任何留言。')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '返回相機' }));
    expect(mockSetMode).toHaveBeenCalledWith('idle');
  });

  it('loads and displays videos sorted by timestamp descending', async () => {
    const mockVideos = [
      {
        id: 'video1',
        timestamp: new Date('2023-01-01T10:00:00Z').getTime(), // older
        size: 1048576, // 1 MB
        blob: new Blob(['data1'], { type: 'video/mp4' }),
      },
      {
        id: 'video2',
        timestamp: new Date('2023-01-01T11:00:00Z').getTime(), // newer
        size: 2097152, // 2 MB
        blob: new Blob(['data2'], { type: 'video/webm' }),
      },
    ];

    (dbLib.getAllVideos as any).mockResolvedValue(mockVideos);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={{ count: 2, sizeMB: '3.0' }}
        updateDbStats={mockUpdateDbStats}
      />
    );

    // Wait for videos to load
    await waitFor(() => {
      expect(screen.queryByText('暫時未有任何留言。')).not.toBeInTheDocument();
    });

    // Verify sort order: newer (video2) should be first
    const sizes = screen.getAllByText(/MB/);
    // Note: one element is "總數: ... | 佔用空間: 3.0 MB" in the header
    // The items will display sizes 2.0 MB and 1.0 MB
    expect(sizes[1]).toHaveTextContent('2.0 MB'); // video2
    expect(sizes[2]).toHaveTextContent('1.0 MB'); // video1
  });

  it('handles single video download', async () => {
    const mockVideos = [
      {
        id: 'video1',
        timestamp: new Date('2023-01-01T12:00:00Z').getTime(),
        size: 1048576,
        blob: new Blob(['data1'], { type: 'video/mp4' }),
      },
    ];
    (dbLib.getAllVideos as any).mockResolvedValue(mockVideos);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={{ count: 1, sizeMB: '1.0' }}
        updateDbStats={mockUpdateDbStats}
      />
    );

    // Get the specific button inside the video card to avoid conflict with "全部匯出" (Download All)
    let downloadBtn: HTMLElement;
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /下載/i });
      downloadBtn = buttons.find(b => b.textContent?.includes('下載') && !b.textContent?.includes('全部匯出')) as HTMLElement;
      expect(downloadBtn).toBeInTheDocument();
    });

    // Mock anchor click
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(downloadBtn!);

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockVideos[0].blob);
    expect(clickSpy).toHaveBeenCalled();

    // Fast-forward timers if using fake timers, or just wait for setTimeout to clear revoked url
    await waitFor(() => {
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
    });
  });

  it('handles video preview open and close', async () => {
    const mockVideos = [
      {
        id: 'video1',
        timestamp: new Date('2023-01-01T12:00:00Z').getTime(),
        size: 1048576,
        blob: new Blob(['data1'], { type: 'video/mp4' }),
      },
    ];
    (dbLib.getAllVideos as any).mockResolvedValue(mockVideos);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={{ count: 1, sizeMB: '1.0' }}
        updateDbStats={mockUpdateDbStats}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /預覽/i })).toBeInTheDocument();
    });

    // Open preview
    fireEvent.click(screen.getByRole('button', { name: /預覽/i }));

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockVideos[0].blob);

    // Modal should be visible
    const closeButton = screen.getByRole('button', { name: 'Close preview' });
    expect(closeButton).toBeInTheDocument();
    expect(document.querySelector('video')).toBeInTheDocument();

    // Close preview
    fireEvent.click(closeButton);

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
    expect(screen.queryByRole('button', { name: 'Close preview' })).not.toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('handles download all sequential', async () => {
    // Cannot easily mix fake timers with React Testing Library waitFor if not careful,
    // better to mock setTimeout itself or not use fake timers for rendering part if possible,
    // but the issue is probably just test cleanup or an unhandled promise.
    const mockVideos = [
      {
        id: 'video1',
        timestamp: new Date('2023-01-01T12:00:00Z').getTime(), // newer, so it sorts first
        size: 1048576,
        blob: new Blob(['data1'], { type: 'video/mp4' }),
      },
      {
        id: 'video2',
        timestamp: new Date('2023-01-01T11:00:00Z').getTime(), // older
        size: 2048576,
        blob: new Blob(['data2'], { type: 'video/webm' }),
      },
    ];
    (dbLib.getAllVideos as any).mockResolvedValue(mockVideos);

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={{ count: 2, sizeMB: '3.0' }}
        updateDbStats={mockUpdateDbStats}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /全部匯出/i })).not.toBeDisabled();
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: /全部匯出/i }));

    // Should download the first video immediately
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockVideos[0].blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Wait for the sequential download to hit the second video
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(2);
    }, { timeout: 2000 });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockVideos[1].blob);
  });

  it('handles wipe data with confirmations', async () => {
    (dbLib.getAllVideos as any).mockResolvedValue([]);
    (window.confirm as any)
      .mockReturnValueOnce(true)  // First confirmation
      .mockReturnValueOnce(true); // Second confirmation

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={defaultDbStats}
        updateDbStats={mockUpdateDbStats}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /清除所有資料/i }));

    // Both confirms should be called
    expect(window.confirm).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(dbLib.clearDB).toHaveBeenCalled();
      expect(dbLib.getAllVideos).toHaveBeenCalledTimes(2); // Initial mount + after clear
      expect(mockUpdateDbStats).toHaveBeenCalled();
    });
  });

  it('cancels wipe data on first confirmation reject', async () => {
    (dbLib.getAllVideos as any).mockResolvedValue([]);
    (window.confirm as any).mockReturnValueOnce(false); // First confirmation rejected

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={defaultDbStats}
        updateDbStats={mockUpdateDbStats}
      />
    );

    // Wait for initial load to avoid act() warnings
    await waitFor(() => {
      expect(screen.getByText('暫時未有任何留言。')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /清除所有資料/i }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(dbLib.clearDB).not.toHaveBeenCalled();
    expect(mockUpdateDbStats).not.toHaveBeenCalled();
  });

  it('handles error in loadAdminVideos gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (dbLib.getAllVideos as any).mockRejectedValue(new Error('DB Error'));

    render(
      <AdminPanel
        setMode={mockSetMode}
        dbStats={defaultDbStats}
        updateDbStats={mockUpdateDbStats}
      />
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load videos', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });
});
