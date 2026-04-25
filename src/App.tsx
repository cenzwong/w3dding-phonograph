import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { CameraView } from './features/camera/CameraView';
import { AdminPanel } from './features/admin/AdminPanel';
import { getDatabaseStats } from './lib/db';

export default function App() {
  const [mode, setMode] = useState('idle'); // 'idle', 'recording', 'saving', 'success', 'admin'
  const [errorMsg, setErrorMsg] = useState('');
  const [dbStats, setDbStats] = useState({ count: 0, sizeMB: '0.0' });

  const adminClickCount = useRef(0);
  const adminClickTimer = useRef<NodeJS.Timeout | null>(null);

  const updateDbStats = async () => {
    try {
      const stats = await getDatabaseStats();
      setDbStats(stats);
    } catch (e) {
      console.error('Failed to update DB stats:', e);
    }
  };

  useEffect(() => {
    updateDbStats();
  }, []);

  const handleAdminTrigger = () => {
    adminClickCount.current += 1;
    if (adminClickTimer.current) clearTimeout(adminClickTimer.current);

    adminClickTimer.current = setTimeout(() => {
      adminClickCount.current = 0;
    }, 2000);

    if (adminClickCount.current >= 5) {
      adminClickCount.current = 0;
      setMode('admin');
    }
  };

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

      {mode !== 'admin' ? (
        <CameraView
          mode={mode}
          setMode={setMode}
          setErrorMsg={setErrorMsg}
          dbStats={dbStats}
          updateDbStats={updateDbStats}
          handleAdminTrigger={handleAdminTrigger}
        />
      ) : (
        <AdminPanel
          setMode={setMode}
          dbStats={dbStats}
          updateDbStats={updateDbStats}
        />
      )}
    </div>
  );
}
