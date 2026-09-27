'use client';

import { useMemo } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
  value_missing?: boolean;
  maintenance?: boolean;
}

interface KilnOverviewProps {
  data: SensorData[];
  stats?: unknown; // 保留入参兼容；概览已不再展示聚合均值
}

interface KilnInfo {
  kiln_id: string;
  deviceCount: number;
  sensorCount: number;
  onlineCount: number;
}

// 每个窑体的在线概览（设备数 / 在线传感器数）
function buildKilnInfos(data: SensorData[]): KilnInfo[] {
  const kilns = new Map<string, KilnInfo>();
  const devices = new Map<string, Set<string>>();
  const sensors = new Map<string, Set<string>>();
  const online = new Map<string, Set<string>>();

  data.forEach((d) => {
    if (!kilns.has(d.kiln_id)) {
      kilns.set(d.kiln_id, { kiln_id: d.kiln_id, deviceCount: 0, sensorCount: 0, onlineCount: 0 });
      devices.set(d.kiln_id, new Set());
      sensors.set(d.kiln_id, new Set());
      online.set(d.kiln_id, new Set());
    }
    devices.get(d.kiln_id)!.add(d.device_id);
    sensors.get(d.kiln_id)!.add(d.sensor_tag);
    if (d.is_online !== false && (d.value_missing !== true || d.maintenance === true)) online.get(d.kiln_id)!.add(d.sensor_tag);
  });

  return Array.from(kilns.values()).map((k) => ({
    ...k,
    deviceCount: devices.get(k.kiln_id)?.size || 0,
    sensorCount: sensors.get(k.kiln_id)?.size || 0,
    onlineCount: online.get(k.kiln_id)?.size || 0,
  }));
}

export function KilnOverview({ data }: KilnOverviewProps) {
  const kilns = useMemo(() => buildKilnInfos(data), [data]);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        窑体概览
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">{kilns.length} 座</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {kilns.length === 0 ? (
          <div className="empty-state h-full">
            <span className="text-sm">暂无窑体数据</span>
            <span className="empty-hint">连接数据库后，各窑体的设备与传感器在线情况将在此展示。</span>
          </div>
        ) : (
          kilns.map((kiln) => {
            const healthy = kiln.onlineCount === kiln.sensorCount;
            const ratio = kiln.sensorCount > 0 ? kiln.onlineCount / kiln.sensorCount : 0;
            return (
              <div
                key={kiln.kiln_id}
                className="rounded p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`status-dot ${healthy ? 'online' : 'warning'}`} />
                    <span className="text-sm font-semibold text-foreground truncate">{kiln.kiln_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {kiln.deviceCount} 台 · {kiln.onlineCount}/{kiln.sensorCount} 在线
                  </span>
                </div>
                <div className="h-1 rounded overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round(ratio * 100)}%`,
                      background: healthy ? 'var(--success)' : 'var(--warning)',
                      transition: 'width var(--dur-base) var(--ease-out)',
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
