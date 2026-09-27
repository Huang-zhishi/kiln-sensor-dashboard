'use client';

import { useMemo } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
}

function fmtLastSeen(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 数据中断（离线）明细：原阈值告警移除后，单独保留中断可见性
export function OfflinePanel({ data }: { data: SensorData[] }) {
  const offline = useMemo(
    () => data.filter((d) => d.is_online === false).sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()),
    [data],
  );

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        数据中断
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">{offline.length} 个</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {offline.length === 0 ? (
          <div className="empty-state h-full">
            <span className="status-dot online" style={{ width: 10, height: 10 }} />
            <span className="text-sm">无数据中断</span>
            <span className="empty-hint">所有传感器均在正常上报。</span>
          </div>
        ) : (
          offline.map((d) => (
            <div
              key={`${d.device_id}-${d.sensor_tag}`}
              className="flex items-center justify-between rounded px-3 py-2"
              style={{
                background: 'color-mix(in srgb, var(--danger) 7%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger) 22%, transparent)',
              }}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
                  {d.sensor_tag}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {d.kiln_id || '--'} · {d.device_id}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="text-[10px] text-muted-foreground">最后上报</div>
                <div className="text-[11px] font-mono tabular-nums">{fmtLastSeen(d.reported_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
