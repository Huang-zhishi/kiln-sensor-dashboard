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
  /** 无数据起始时间（值缺失时使用） */
  no_data_since?: string | null;
  /** 检修中的测点（值缺失/中断属预期） */
  maintenance?: boolean;
}

function fmtLastSeen(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface RowProps {
  d: SensorData;
  tone: string;
  /** 右侧时间标签，如“无数据起始” */
  timeLabel: string;
  /** 右侧展示的时间（ISO），缺省用最后上报时间 */
  time?: string | null;
  pulse?: boolean;
}

function QualityRow({ d, tone, timeLabel, time, pulse }: RowProps) {
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
        <div className="text-[10px] text-muted-foreground">{timeLabel}</div>
        <div className="text-[11px] font-mono tabular-nums" style={{ color: tone }}>{fmtLastSeen(time || d.reported_at)}</div>
      </div>
    </div>
  );
}

// 数据质量面板：数据中断 + 值缺失（含检修中单独分组）
export function OfflinePanel({ data }: { data: SensorData[] }) {
  const offline = useMemo(
    () => data.filter((d) => d.is_online === false && d.maintenance !== true).sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()),
    [data],
  );
  const missing = useMemo(
    () => data.filter((d) => d.is_online !== false && d.value_missing === true && d.maintenance !== true).sort((a, b) => a.sensor_tag.localeCompare(b.sensor_tag)),
    [data],
  );
  const maintMissing = useMemo(
    () => data.filter((d) => d.is_online !== false && d.value_missing === true && d.maintenance === true).sort((a, b) => a.sensor_tag.localeCompare(b.sensor_tag)),
    [data],
  );
  const total = offline.length + missing.length + maintMissing.length;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        数据质量
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          中断 {offline.length} · 值缺失 {missing.length}
          {maintMissing.length > 0 && <span className="ml-1">· 检修 {maintMissing.length}</span>}
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
                  <QualityRow key={`m-${d.device_id}-${d.sensor_tag}`} d={d} tone="var(--warning)" timeLabel="无数据起始" time={d.no_data_since || d.reported_at} />
                ))}
              </div>
            )}
            {offline.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">数据中断</div>
                {offline.map((d) => (
                  <QualityRow key={`o-${d.device_id}-${d.sensor_tag}`} d={d} tone="var(--danger)" timeLabel="最后上报" pulse />
                ))}
              </div>
            )}
            {maintMissing.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">检修中（值缺失，不计入问题）</div>
                {maintMissing.map((d) => (
                  <QualityRow key={`mt-${d.device_id}-${d.sensor_tag}`} d={d} tone="var(--muted-foreground)" timeLabel="无数据起始" time={d.no_data_since || d.reported_at} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
