'use client';

import { useState, useEffect } from 'react';

interface HeaderProps {
  lastUpdate: Date;
  onRefresh: () => void;
  loading: boolean;
}

export function DashboardHeader({ lastUpdate, onRefresh, loading }: HeaderProps) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    setTimeStr(lastUpdate.toLocaleTimeString('zh-CN', { hour12: false }));
  }, [lastUpdate]);

  return (
    <header className="relative px-6 pt-4 pb-3">
      {/* Top decorative line */}
      <div className="header-line mb-4" />

      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-xs text-emerald-400 font-mono">ONLINE</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider" style={{ color: '#00d4ff' }}>
            传感器数据监控大屏
          </h1>
        </div>

        {/* Right: Status */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-slate-500">最后更新</div>
            <div className="text-sm font-mono text-slate-300">
              {timeStr}
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 rounded text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              color: '#00d4ff',
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                刷新中
              </span>
            ) : (
              '刷新数据'
            )}
          </button>
        </div>
      </div>

      {/* Bottom decorative line */}
      <div className="header-line mt-3" />
    </header>
  );
}
