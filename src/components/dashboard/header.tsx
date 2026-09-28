'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface HeaderProps {
  lastUpdate: Date;
  onRefresh: () => void;
  loading: boolean;
  connected?: boolean;
  /** 最新一次数据上报时间（用于展示数据延迟） */
  latestReportedAt?: string | null;
}

// 顶部标题栏：信号迹线（视觉签名）+ 连接/数据新鲜度 + 手动刷新
export function DashboardHeader({ lastUpdate, onRefresh, loading, connected = true, latestReportedAt = null }: HeaderProps) {
  const [timeStr, setTimeStr] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setTimeStr(lastUpdate.toLocaleTimeString('zh-CN', { hour12: false }));
  }, [lastUpdate]);

  // 每秒刷新一次延迟显示
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  let delaySec: number | null = null;
  if (latestReportedAt) {
    const t = new Date(latestReportedAt).getTime();
    if (isFinite(t)) delaySec = Math.max(0, Math.round((nowMs - t) / 1000));
  }
  const delayText =
    delaySec === null ? '--' : delaySec < 60 ? `${delaySec}s` : `${Math.floor(delaySec / 60)}m${delaySec % 60}s`;
  const delayColor =
    delaySec === null
      ? 'var(--muted-foreground)'
      : delaySec < 30
        ? 'var(--success)'
        : delaySec < 120
          ? 'var(--warning)'
          : 'var(--danger)';

  return (
    <header className="border-b border-border">
      {/* 视觉签名：实时信号迹线 */}
      <div className="signal-line" aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 sm:px-6 py-2 sm:py-3">
        {/* 左侧：标题 + 连接状态 */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
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

        {/* 右侧：数据延迟 + 最后更新 + 刷新 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5">
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">数据延迟</div>
            <div className="text-sm font-mono tabular-nums" style={{ color: delayColor }} title="最新上报距当前的时间">
              {delayText}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">最后更新</div>
            <div className="text-sm font-mono text-foreground tabular-nums">{timeStr || '--:--:--'}</div>
          </div>
          <Link href="/alerts" className="nav-btn font-medium">
            告警中心
          </Link>
          <Link href="/reports" className="nav-btn font-medium">
            报表中心
          </Link>
          <Link href="/tags" className="nav-btn font-medium">
            测点主数据
          </Link>
          <Link href="/history" className="nav-btn font-medium">
            历史查询
          </Link>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="nav-btn font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
