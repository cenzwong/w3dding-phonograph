import React, { useState, useEffect, useRef } from 'react';
import { Camera, Square, CheckCircle, Video, CameraOff, Mic, MicOff } from 'lucide-react';
import { saveVideoToDB } from '../../lib/db';

interface CameraViewProps {
  mode: string;
  setMode: (mode: string) => void;
  setErrorMsg: (msg: string) => void;
  dbStats: { count: number, sizeMB: string };
  updateDbStats: () => Promise<void>;
  handleAdminTrigger: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  mode, setMode, setErrorMsg, dbStats, updateDbStats, handleAdminTrigger
}) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [hardwareStatus, setHardwareStatus] = useState({ camConnected: false, micConnected: false });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const initCamera = async () => {
    try {
      let needsNewStream = !streamRef.current;
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        if (tracks.length === 0 || tracks.some(track => track.readyState === 'ended')) {
          needsNewStream = true;
          tracks.forEach(track => track.stop());
        }
      }

      if (needsNewStream) {
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
        await (navigator as any).wakeLock.request('screen');
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
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];

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
          chunksRef.current = [];
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
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
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
            if (videoRef.current !== el) {
               videoRef.current = el;
            }
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
  );
};
