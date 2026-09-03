'use client';

import { useMemo } from 'react';
import { classifySensor } from '@/lib/sensor-classifier';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
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

interface KilnInfo {
  kiln_id: string;
  deviceCount: number;
  sensorCount: number;
  onlineCount: number;
  avgTemp: number | null;
  avgPressure: number | null;
}

// 每个窑体提取关键指标：平均温度 / 平均压力（来自 stats 聚合数据）
function buildKilnInfos(data: SensorData[], stats: StatsData | null): KilnInfo[] {
  const kilns = new Map<string, KilnInfo>();

  data.forEach((d) => {
    if (!kilns.has(d.kiln_id)) {
      kilns.set(d.kiln_id, {
        kiln_id: d.kiln_id,
        deviceCount: 0,
        sensorCount: 0,
        onlineCount: 0,
        avgTemp: null,
        avgPressure: null,
      });
    }
  });

  const devices = new Map<string, Set<string>>();
  const sensorTags = new Map<string, Set<string>>();
  const onlineTags = new Map<string, Set<string>>();
  data.forEach((d) => {
    if (!devices.has(d.kiln_id)) devices.set(d.kiln_id, new Set());
    if (!sensorTags.has(d.kiln_id)) sensorTags.set(d.kiln_id, new Set());
    if (!onlineTags.has(d.kiln_id)) onlineTags.set(d.kiln_id, new Set());
    devices.get(d.kiln_id)!.add(d.device_id);
    sensorTags.get(d.kiln_id)!.add(d.sensor_tag);
    if (d.is_online !== false) onlineTags.get(d.kiln_id)!.add(d.sensor_tag);
  });

  const avgByKiln: Record<string, { temp: number[]; pressure: number[] }> = {};
  (stats?.stats || []).forEach((s) => {
    const type = classifySensor(s.sensor_tag);
    if (!avgByKiln[s.kiln_id]) avgByKiln[s.kiln_id] = { temp: [], pressure: [] };
    if (type === '温度') avgByKiln[s.kiln_id].temp.push(Number(s.avg_value) || 0);
    if (type === '压力') avgByKiln[s.kiln_id].pressure.push(Number(s.avg_value) || 0);
  });

  return Array.from(kilns.values()).map((k) => ({
    ...k,
    deviceCount: devices.get(k.kiln_id)?.size || 0,
    sensorCount: sensorTags.get(k.kiln_id)?.size || 0,
    onlineCount: onlineTags.get(k.kiln_id)?.size || 0,
    avgTemp: avgByKiln[k.kiln_id]?.temp.length
      ? avgByKiln[k.kiln_id].temp.reduce((a, b) => a + b, 0) / avgByKiln[k.kiln_id].temp.length
      : null,
    avgPressure: avgByKiln[k.kiln_id]?.pressure.length
      ? avgByKiln[k.kiln_id].pressure.reduce((a, b) => a + b, 0) / avgByKiln[k.kiln_id].pressure.length
      : null,
  }));
}

export function KilnOverview({ data, stats }: KilnOverviewProps) {
  const kilns = useMemo(() => buildKilnInfos(data, stats), [data, stats]);

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        窑体概览
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          {kilns.length} 座
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {kilns.length === 0 ? (
          <div className="empty-state h-full">
            <span className="text-sm">暂无窑体数据</span>
            <span className="empty-hint">连接数据库后，各窑体的设备与传感器统计将在此展示。</span>
          </div>
        ) : (
          kilns.map((kiln) => {
            const healthy = kiln.onlineCount === kiln.sensorCount;
            return (
              <div
                key={kiln.kiln_id}
                className="rounded p-3"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                }}
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-[10px] text-muted-foreground">平均温度</div>
                    <div className="text-sm font-mono font-bold text-foreground tabular-nums">
                      {kiln.avgTemp !== null ? kiln.avgTemp.toFixed(1) : '--'}
                      <span className="text-[10px] text-muted-foreground font-normal"> °C</span>
                    </div>
                  </div>
                  <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="text-[10px] text-muted-foreground">平均压力</div>
                    <div className="text-sm font-mono font-bold text-foreground tabular-nums">
                      {kiln.avgPressure !== null ? kiln.avgPressure.toFixed(1) : '--'}
                      <span className="text-[10px] text-muted-foreground font-normal"> kPa</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
