'use client';

import { useMemo } from 'react';
import { classifySensor, getSensorLevel, UNIT_MAP, type SensorLevel } from '@/lib/sensor-classifier';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
}

interface AlarmListProps {
  data: SensorData[];
}

// 统一的告警条目：阈值告警 + 数据中断（离线）
interface AlarmItem {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  reported_at: string;
  kind: 'offline' | 'threshold';
  level: SensorLevel; // offline 固定 danger；threshold 为 warning/danger
  value: number;
}

function fmtLastSeen(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 告警视觉语义：颜色统一取 CSS 变量，背景/描边用 color-mix 做透明度层级
const ALARM_STYLE: Record<'offline' | 'danger' | 'warning', { color: string; label: string }> = {
  offline: { color: 'var(--danger)', label: '数据中断' },
  danger: { color: 'var(--danger)', label: '超限' },
  warning: { color: 'var(--warning)', label: '预警' },
};

export function AlarmList({ data }: AlarmListProps) {
  const alarms = useMemo(() => {
    const thresholdAlarms: AlarmItem[] = data
      .filter((d) => d.is_online !== false)
      .map((d) => ({ ...d, value: Number(d.sensor_value) || 0 }))
      .filter((d) => getSensorLevel(d.sensor_tag, d.value) !== 'normal')
      .map((d) => ({
        device_id: d.device_id,
        kiln_id: d.kiln_id,
        sensor_tag: d.sensor_tag,
        reported_at: d.reported_at,
        kind: 'threshold' as const,
        level: getSensorLevel(d.sensor_tag, d.value) as Exclude<SensorLevel, 'normal'>,
        value: d.value,
      }));

    // 离线 = 数据中断，作为最高优先级告警置顶
    const offlineAlarms: AlarmItem[] = data
      .filter((d) => d.is_online === false)
      .map((d) => ({
        device_id: d.device_id,
        kiln_id: d.kiln_id,
        sensor_tag: d.sensor_tag,
        reported_at: d.reported_at,
        kind: 'offline' as const,
        level: 'danger' as const,
        value: Number(d.sensor_value) || 0,
      }));

    return [...offlineAlarms, ...thresholdAlarms].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'offline' ? -1 : 1;
      if (a.level !== b.level) return a.level === 'danger' ? -1 : 1;
      return b.value - a.value;
    });
  }, [data]);

  const hasOffline = alarms.some((a) => a.kind === 'offline');

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        告警信息
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          {alarms.length} 条
          {hasOffline && (
            <span className="text-danger ml-1">· 含数据中断</span>
          )}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {alarms.length === 0 ? (
          <div className="empty-state h-full">
            <span className="status-dot online" style={{ width: 10, height: 10 }} />
            <span className="text-sm">全部正常</span>
            <span className="empty-hint">当前所有在线传感器均处于正常区间，无阈值告警。</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {alarms.map((a) => {
              const s = ALARM_STYLE[a.kind === 'offline' ? 'offline' : a.level === 'danger' ? 'danger' : 'warning'];
              return (
                <div
                  key={`${a.kind}-${a.device_id}-${a.sensor_tag}`}
                  className="flex items-center justify-between rounded px-3 py-2"
                  style={{
                    background: `color-mix(in srgb, ${s.color} 7%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${s.color} 22%, transparent)`,
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: s.color }}>
                      {a.kind === 'offline' && (
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
                      )}
                      {a.sensor_tag}
                      <span
                        className="text-[9px] px-1 rounded"
                        style={{ background: `color-mix(in srgb, ${s.color} 18%, transparent)` }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {a.kiln_id} · {a.device_id}
                      {a.kind === 'offline' && ` · 最后上报 ${fmtLastSeen(a.reported_at)}`}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {a.kind === 'offline' ? (
                      <div className="font-mono font-bold text-sm" style={{ color: s.color }}>
                        无数据
                      </div>
                    ) : (
                      <>
                        <div className="font-mono font-bold text-sm tabular-nums" style={{ color: s.color }}>
                          {a.value.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {UNIT_MAP[classifySensor(a.sensor_tag)]}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
