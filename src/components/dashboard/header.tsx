'use client';

import { useState, useEffect } from 'react';

interface HeaderProps {
  lastUpdate: Date;
  onRefresh: () => void;
  loading: boolean;
  connected?: boolean;
}

// 顶部标题栏：信号迹线（视觉签名）+ 连接状态 + 手动刷新
export function DashboardHeader({ lastUpdate, onRefresh, loading, connected = true }: HeaderProps) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    setTimeStr(lastUpdate.toLocaleTimeString('zh-CN', { hour12: false }));
  }, [lastUpdate]);

  return (
    <header className="border-b border-border">
      {/* 视觉签名：实时信号迹线 */}
      <div className="signal-line" aria-hidden="true" />

      <div className="flex items-center justify-between px-6 py-3">
        {/* 左侧：标题 + 连接状态 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-widest">
              {connected ? '实时连接' : '重连中'}
            </span>
          </div>
          <span className="w-px h-4 bg-border" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-wide text-foreground truncate">
            窑炉传感器中控台
          </h1>
        </div>

        {/* 右侧：最后更新 + 刷新 */}
        <div className="flex items-center gap-5 flex-shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">最后更新</div>
            <div className="text-sm font-mono text-foreground tabular-nums">{timeStr || '--:--:--'}</div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm font-medium bg-card border border-border-strong text-foreground hover:bg-card-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
    </header>
  );
}
