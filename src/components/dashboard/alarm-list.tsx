'use client';

import { useMemo } from 'react';
import { classifySensor, getSensorLevel, UNIT_MAP, type SensorLevel } from '@/lib/sensor-classifier';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface AlarmListProps {
  data: SensorData[];
}

export function AlarmList({ data }: AlarmListProps) {
  const alarms = useMemo(() => {
    return data
      .map((d) => {
        const value = Number(d.sensor_value) || 0;
        const level = getSensorLevel(d.sensor_tag, value);
        return { ...d, value, level };
      })
      .filter((d): d is typeof d & { level: Exclude<SensorLevel, 'normal'> } => d.level !== 'normal')
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'danger' ? -1 : 1;
        return b.value - a.value;
      });
  }, [data]);

  const levelColor: Record<Exclude<SensorLevel, 'normal'>, string> = {
    danger: '#f2495c',
    warning: '#fade2a',
  };

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        告警信息
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          {alarms.length} 条
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {alarms.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="status-dot online" style={{ width: 10, height: 10 }} />
            <span className="text-sm">全部正常</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {alarms.map((a) => {
              const color = levelColor[a.level];
              return (
                <div
                  key={`${a.device_id}-${a.sensor_tag}`}
                  className="flex items-center justify-between rounded px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${color}33`,
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color }}>
                      {a.sensor_tag}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {a.kiln_id} · {a.device_id}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="font-mono font-bold text-sm" style={{ color }}>
                      {a.value.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {UNIT_MAP[classifySensor(a.sensor_tag)]}
                    </div>
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
