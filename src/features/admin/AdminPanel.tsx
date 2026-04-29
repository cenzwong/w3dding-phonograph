import React, { useState, useEffect } from 'react';
import { ShieldAlert, Download, Video, Trash2 } from 'lucide-react';
import { getAllVideos, clearDB, VideoRecord } from '../../lib/db';
import { formatBytesToMB } from '../../lib/utils/formatters';

interface AdminPanelProps {
  setMode: (mode: string) => void;
  dbStats: { count: number, sizeMB: string };
  updateDbStats: () => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ setMode, dbStats, updateDbStats }) => {
  const [videos, setVideos] = useState<VideoRecord[]>([]);

  useEffect(() => {
    loadAdminVideos();
  }, []);

  const loadAdminVideos = async () => {
    try {
      const all = await getAllVideos();
      setVideos(all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (e) {
      console.error('Failed to load videos', e);
    }
  };

  const downloadVideo = (video: VideoRecord) => {
    const ext = video.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(video.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const downloadAllSequential = async () => {
    for (let i = 0; i < videos.length; i++) {
      downloadVideo(videos[i]);
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  const wipeData = async () => {
    if (window.confirm('警告：此操作將刪除所有留言且無法復原。是否確定？')) {
      if (window.confirm('請再次確認：你已備份所有影片？')) {
        await clearDB();
        await loadAdminVideos();
        updateDbStats();
      }
    }
  };

  return (
    <div className="relative z-50 w-full min-h-screen bg-stone-900 p-6 md:p-12 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between mb-10 gap-4">
          <div>
            <h2 className="text-3xl font-serif text-amber-400 flex items-center gap-3">
              <ShieldAlert /> 管理員後台
            </h2>
            <p className="text-stone-400 mt-2">
              總數: {videos.length} 條影片 | 佔用空間: {dbStats.sizeMB} MB
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setMode('idle')}
              className="px-6 py-2 rounded-lg bg-stone-800 text-stone-300 hover:bg-stone-700 transition-colors"
            >
              返回相機
            </button>
            <button
              onClick={downloadAllSequential}
              className="px-6 py-2 rounded-lg bg-amber-500 text-stone-900 font-medium hover:bg-amber-400 flex items-center gap-2 transition-colors"
              disabled={videos.length === 0}
            >
              <Download size={20} /> 全部匯出 (排隊下載)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div key={video.id} className="bg-stone-800 rounded-xl p-4 border border-stone-700 flex flex-col">
              <div className="flex items-center gap-3 text-stone-300 mb-3">
                <Video size={20} className="text-amber-500" />
                <span className="font-mono text-sm truncate">
                  {new Date(video.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                </span>
                <span className="ml-auto text-xs bg-stone-900 px-2 py-1 rounded">
                  {formatBytesToMB(video.size)} MB
                </span>
              </div>

              <div className="mt-auto flex gap-2 pt-2">
                <button
                  onClick={() => downloadVideo(video)}
                  className="flex-1 bg-stone-700 hover:bg-stone-600 text-white py-2 rounded flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <Download size={16} /> 單獨下載
                </button>
              </div>
            </div>
          ))}

          {videos.length === 0 && (
            <div className="col-span-full py-20 text-center text-stone-500">
              暫時未有任何留言。
            </div>
          )}
        </div>

        <div className="mt-20 pt-10 border-t border-stone-800 flex justify-end">
           <button
              onClick={wipeData}
              className="px-6 py-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-900/50 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={20} /> 清除所有資料 (危險)
            </button>
        </div>
      </div>
    </div>
  );
};
