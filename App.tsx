import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Square, CheckCircle, Video, Download, Trash2, ShieldAlert, AlertCircle, Mic, MicOff, CameraOff } from 'lucide-react';

// --- Database Wrapper (IndexedDB) ---
// Architecture note: Wrapping IndexedDB in Promises to ensure async/await compatibility.
const DB_NAME = 'WeddingBoothDB';
const STORE_NAME = 'videos';

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveVideoToDB = async (videoBlob) => {
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

export const getAllVideos = async () => {
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
  const db: any = await initDB();
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

export const clearDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  // Application State
  const [mode, setMode] = useState('idle'); // 'idle', 'recording', 'saving', 'success', 'admin'
  const [timeLeft, setTimeLeft] = useState(60);
  const [dbStats, setDbStats] = useState({ count: 0, sizeMB: 0 });
  const [videos, setVideos] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [hardwareStatus, setHardwareStatus] = useState({ camConnected: false, micConnected: false });
  
  // Refs for media handling
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const adminClickCount = useRef(0);
  const adminClickTimer = useRef(null);

  // --- Initialization & Hardware Access ---
  const initCamera = async () => {
    try {
      // Check if existing stream has active tracks
      let needsNewStream = !streamRef.current;
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        if (tracks.length === 0 || tracks.some(track => track.readyState === 'ended')) {
          needsNewStream = true;
          // Stop old tracks just in case
          tracks.forEach(track => track.stop());
        }
      }

      if (needsNewStream) {
        // Request 720p for optimal iPad performance/storage ratio
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        streamRef.current = stream;
      }

      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }

      if (streamRef.current) {
        const hasVideo = streamRef.current.getVideoTracks().length > 0;
        const hasAudio = streamRef.current.getAudioTracks().length > 0;
        setHardwareStatus({ camConnected: hasVideo, micConnected: hasAudio });
      }

    } catch (err) {
      setHardwareStatus({ camConnected: false, micConnected: false });
      setErrorMsg('請允許相機與麥克風權限以繼續使用。');
      console.error('Camera error:', err);
    }
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.log('Wake Lock API not supported/failed');
    }
  };

  const requestPersist = async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch (e) {
      console.warn('Failed to request storage persistence:', e);
    }
  };

  useEffect(() => {
    initCamera();
    requestWakeLock();
    requestPersist();
    updateDbStats();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        initCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // --- Recording Logic ---
  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    
    // Fallback to webm if mp4 is not supported on older iOS
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
    }

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setMode('saving');
        const finalMime = mediaRecorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: finalMime });
        
        try {
          await saveVideoToDB(blob);
          chunksRef.current = []; // Free up RAM
          updateDbStats();
          setMode('success');
          setTimeout(() => {
            setMode('idle');
            setTimeLeft(60);
          }, 3000);
        } catch (err) {
          setErrorMsg('儲存失敗，請檢查儲存空間！');
          setMode('idle');
        }
      };

      mediaRecorder.start();
      setMode('recording');
      setTimeLeft(60);
      
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setErrorMsg('無法啟動錄影器，請重啟網頁。');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // --- Admin & DB Logic ---
  const handleAdminTrigger = () => {
    adminClickCount.current += 1;
    if (adminClickTimer.current) clearTimeout(adminClickTimer.current);
    
    adminClickTimer.current = setTimeout(() => {
      adminClickCount.current = 0;
    }, 2000);

    if (adminClickCount.current >= 5) {
      adminClickCount.current = 0;
      loadAdminVideos();
      setMode('admin');
    }
  };

  const updateDbStats = async () => {
    try {
      const stats = await getDatabaseStats();
      setDbStats(stats);
    } catch (e) {
      console.warn('Failed to update DB stats:', e);
    }
  };

  const loadAdminVideos = async () => {
    try {
      const all = await getAllVideos();
      // Sort by newest first
      setVideos(all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } catch (e) {
      console.error('Failed to load videos', e);
    }
  };

  const downloadVideo = (video) => {
    const ext = video.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(video.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100); // Cleanup memory
  };

  // Architectural detail: Sequential download to avoid iPad RAM exhaustion
  const downloadAllSequential = async () => {
    for (let i = 0; i < videos.length; i++) {
      downloadVideo(videos[i]);
      // Wait 800ms between downloads to let browser handle the file saving
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

  // --- Rendering UI ---
  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 font-sans selection:bg-amber-500/30 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-800 via-stone-900 to-black pointer-events-none" />
      
      {errorMsg && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-red-500/90 text-white p-4 rounded-xl flex items-center gap-3 shadow-lg">
          <AlertCircle />
          <p>{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="ml-auto underline">關閉</button>
        </div>
      )}

      {/* Main Camera View (visible in idle, recording, saving, success) */}
      {mode !== 'admin' && (
        <div className="relative w-full h-screen flex flex-col items-center justify-center p-6">
          
          <header className="absolute top-8 w-full text-center z-10" onClick={handleAdminTrigger}>
            <h1 className="text-3xl md:text-4xl font-serif text-amber-200 tracking-widest drop-shadow-lg">
              WEDDING GUESTBOOK
            </h1>
            <p className="text-stone-300 mt-2 tracking-widest text-sm uppercase">Leave your blessings</p>
          </header>

          {/* Camera Container */}
          <div className="relative w-full max-w-4xl aspect-[4/3] md:aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-stone-800 ring-4 ring-stone-900">
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && streamRef.current && el.srcObject !== streamRef.current) {
                  el.srcObject = streamRef.current;
                }
              }}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-700 ${mode === 'saving' || mode === 'success' ? 'opacity-30 blur-sm' : 'opacity-100'}`}
            />
            
            {/* Hardware Status Indicators */}
            <div className="absolute top-4 right-4 flex gap-2 z-20">
              <div className={`p-2 rounded-full backdrop-blur-md shadow-lg ${hardwareStatus.camConnected ? 'bg-black/40 text-green-400' : 'bg-red-500/80 text-white'}`}>
                {hardwareStatus.camConnected ? <Video size={18} /> : <CameraOff size={18} />}
              </div>
              <div className={`p-2 rounded-full backdrop-blur-md shadow-lg ${hardwareStatus.micConnected ? 'bg-black/40 text-green-400' : 'bg-red-500/80 text-white'}`}>
                {hardwareStatus.micConnected ? <Mic size={18} /> : <MicOff size={18} />}
              </div>
            </div>

            {/* UI Overlays */}
            {mode === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
                <button
                  onClick={startRecording}
                  className="group flex flex-col items-center gap-4 transition-transform active:scale-95"
                >
                  <div className="w-24 h-24 rounded-full bg-amber-500/90 text-stone-900 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)] group-hover:bg-amber-400 group-hover:scale-105 transition-all">
                    <Camera size={40} className="ml-1" />
                  </div>
                  <span className="text-xl font-medium tracking-wider text-amber-50 drop-shadow-md bg-black/40 px-6 py-2 rounded-full backdrop-blur-md border border-white/10">
                    點擊開始留言
                  </span>
                </button>
              </div>
            )}

            {mode === 'recording' && (
              <div className="absolute inset-0 flex flex-col items-center justify-between p-8">
                <div className="flex items-center gap-3 bg-red-600/90 text-white px-6 py-2 rounded-full font-mono text-xl backdrop-blur-md shadow-lg">
                  <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  REC {timeLeft}s
                </div>
                
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center backdrop-blur-md hover:bg-white/30 transition-all active:scale-95"
                >
                  <Square size={28} fill="currentColor" className="text-red-500" />
                </button>
              </div>
            )}

            {mode === 'saving' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-200">
                <div className="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-xl tracking-widest font-medium">儲存中，請稍候...</p>
              </div>
            )}

            {mode === 'success' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-green-400">
                <CheckCircle size={80} className="mb-4 drop-shadow-lg" />
                <p className="text-3xl tracking-widest font-medium text-white drop-shadow-lg">儲存成功！</p>
                <p className="mt-2 text-stone-300">多謝你的留言</p>
              </div>
            )}
          </div>

          <div className="absolute bottom-6 text-stone-500 text-sm">
            已錄製: {dbStats.count} 條 ({dbStats.sizeMB} MB)
          </div>
        </div>
      )}

      {/* Admin Panel */}
      {mode === 'admin' && (
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
              {videos.map((video, idx) => (
                <div key={video.id} className="bg-stone-800 rounded-xl p-4 border border-stone-700 flex flex-col">
                  <div className="flex items-center gap-3 text-stone-300 mb-3">
                    <Video size={20} className="text-amber-500" />
                    <span className="font-mono text-sm truncate">
                      {new Date(video.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                    </span>
                    <span className="ml-auto text-xs bg-stone-900 px-2 py-1 rounded">
                      {(video.size / (1024*1024)).toFixed(1)} MB
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
      )}
    </div>
  );
}