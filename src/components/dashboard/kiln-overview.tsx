'use client';

import { useMemo } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface StatsData {
  stats: Array<{
    kiln_id: string;
    sensor_tag: string;
    avg_value: number;
    min_value: number;
    max_value: number;
    count: number;
  }>;
}

interface KilnOverviewProps {
  data: SensorData[];
  stats: StatsData | null;
}

export function KilnOverview({ data, stats }: KilnOverviewProps) {
  const kilnData = useMemo(() => {
    const kilns = new Map<string, {
      kiln_id: string;
      sensors: SensorData[];
      devices: Set<string>;
      deviceCount: number;
    }>();

    data.forEach((d) => {
      if (!kilns.has(d.kiln_id)) {
        kilns.set(d.kiln_id, { kiln_id: d.kiln_id, sensors: [], devices: new Set(), deviceCount: 0 });
      }
      const kiln = kilns.get(d.kiln_id)!;
      kiln.sensors.push(d);
      kiln.devices.add(d.device_id);
      kiln.deviceCount = kiln.devices.size;
    });

    return Array.from(kilns.values());
  }, [data]);

  const getStats = (kilnId: string) => {
    if (!stats) return [];
    return stats.stats.filter((s) => s.kiln_id === kilnId);
  };

  return (
    <div className="panel h-full">
      <div className="panel-title">窑体概览</div>
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
        {kilnData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无窑体数据
          </div>
        ) : (
          kilnData.map((kiln) => {
            const kilnStats = getStats(kiln.kiln_id);
            return (
              <div
                key={kiln.kiln_id}
                className="rounded p-3"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(204,204,220,0.1)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="status-dot online" />
                    <span className="text-sm font-semibold text-foreground">{kiln.kiln_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{kiln.deviceCount} 台设备</span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  {kilnStats.slice(0, 4).map((s) => (
                    <div key={s.sensor_tag} className="text-center p-2 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <div className="text-[10px] text-muted-foreground truncate">{s.sensor_tag}</div>
                      <div className="text-sm font-mono font-bold text-foreground">
                        {(Number(s.avg_value) || 0).toFixed(1)}
                      </div>
                      <div className="text-[10px] text-muted-foreground opacity-70">
                        {(Number(s.min_value) || 0).toFixed(1)} ~ {(Number(s.max_value) || 0).toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sensor list */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {kiln.sensors.map((s) => (
                    <span
                      key={`${s.device_id}-${s.sensor_tag}`}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        color: '#a1a1a1',
                      }}
                    >
                      {s.sensor_tag}: {(Number(s.sensor_value) || 0).toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
