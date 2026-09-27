'use client';

import { useMemo } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
  /** 源值为 NULL（网关上报 null）而非真实 0 */
  value_missing?: boolean;
}

function fmtLastSeen(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface RowProps {
  d: SensorData;
  tone: string;
  label: string;
  pulse?: boolean;
}

function QualityRow({ d, tone, label, pulse }: RowProps) {
  return (
    <div
      className="flex items-center justify-between rounded px-3 py-2"
      style={{
        background: `color-mix(in srgb, ${tone} 7%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 22%, transparent)`,
      }}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: tone }}>
          <span className={`w-1.5 h-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`} style={{ background: tone }} />
          {d.sensor_tag}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {d.kiln_id || '--'} · {d.device_id}
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-2">
        <div className="text-[10px]" style={{ color: tone }}>{label}</div>
        <div className="text-[11px] font-mono tabular-nums text-muted-foreground">{fmtLastSeen(d.reported_at)}</div>
      </div>
    </div>
  );
}

// 数据质量面板：数据中断（离线）+ 值缺失（源报文为 null，时间戳仍在走）
export function OfflinePanel({ data }: { data: SensorData[] }) {
  const offline = useMemo(
    () => data.filter((d) => d.is_online === false).sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()),
    [data],
  );
  const missing = useMemo(
    () => data.filter((d) => d.is_online !== false && d.value_missing === true).sort((a, b) => a.sensor_tag.localeCompare(b.sensor_tag)),
    [data],
  );
  const total = offline.length + missing.length;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        数据质量
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          中断 {offline.length} · 值缺失 {missing.length}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {total === 0 ? (
          <div className="empty-state h-full">
            <span className="status-dot online" style={{ width: 10, height: 10 }} />
            <span className="text-sm">数据质量正常</span>
            <span className="empty-hint">所有传感器均在正常上报且带有数值。</span>
          </div>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">值缺失（网关上报 null）</div>
                {missing.map((d) => (
                  <QualityRow key={`m-${d.device_id}-${d.sensor_tag}`} d={d} tone="var(--warning)" label="无数据" />
                ))}
              </div>
            )}
            {offline.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">数据中断</div>
                {offline.map((d) => (
                  <QualityRow key={`o-${d.device_id}-${d.sensor_tag}`} d={d} tone="var(--danger)" label="中断" pulse />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
