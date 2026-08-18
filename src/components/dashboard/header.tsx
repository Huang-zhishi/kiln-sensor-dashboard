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
    <header className="flex items-center justify-between px-6 py-3 border-b border-border">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <span className="status-dot online" />
        <span className="text-xs text-muted-foreground font-mono">ONLINE</span>
        <h1 className="text-xl font-semibold tracking-wide text-foreground ml-2">
          传感器数据监控大屏
        </h1>
      </div>

      {/* Right: Status */}
      <div className="flex items-center gap-5">
        <div className="text-right">
          <div className="text-xs text-muted-foreground">最后更新</div>
          <div className="text-sm font-mono text-foreground">
            {timeStr}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded text-sm font-medium bg-card border border-border-strong text-foreground hover:bg-card-hover transition-colors disabled:opacity-60"
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
    </header>
  );
}
