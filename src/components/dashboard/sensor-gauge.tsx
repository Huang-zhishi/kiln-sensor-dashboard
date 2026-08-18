'use client';

import { useMemo } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface SensorGaugeProps {
  data: SensorData[];
}

function getGaugeColor(value: number, tag: string): string {
  const lower = tag.toLowerCase();
  if (lower.includes('temp') || lower.includes('温度')) {
    if (value > 800) return '#f2495c';
    if (value > 500) return '#fade2a';
    return '#33a2e5';
  }
  if (lower.includes('pressure') || lower.includes('压力')) {
    if (value > 100) return '#f2495c';
    if (value > 60) return '#fade2a';
    return '#33a2e5';
  }
  return '#33a2e5';
}

function GaugeItem({ tag, value, unit }: { tag: string; value: number; unit: string }) {
  const numValue = Number(value) || 0;
  const color = getGaugeColor(numValue, tag);
  const percentage = Math.min((numValue / 1000) * 100, 100);

  return (
    <div className="flex flex-col items-center gap-2 p-3">
      {/* Circular gauge */}
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="rgba(204,204,220,0.12)"
            strokeWidth="6"
          />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 2.136} 213.6`}
            style={{
              transition: 'stroke-dasharray 0.5s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-lg font-bold font-mono"
            style={{ color }}
          >
            {numValue.toFixed(1)}
          </span>
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center truncate w-full">{tag}</span>
    </div>
  );
}

export function SensorGauge({ data }: SensorGaugeProps) {
  const gaugeData = useMemo(() => {
    // Get unique sensor readings (latest per sensor_tag)
    const seen = new Map<string, SensorData>();
    data.forEach((d) => {
      if (!seen.has(d.sensor_tag)) {
        seen.set(d.sensor_tag, d);
      }
    });
    return Array.from(seen.values()).slice(0, 8);
  }, [data]);

  return (
    <div className="panel h-full">
      <div className="panel-title">传感器仪表</div>
      <div className="p-3">
        {gaugeData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无传感器数据
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gaugeData.map((d) => (
              <GaugeItem
                key={d.sensor_tag}
                tag={d.sensor_tag}
                value={d.sensor_value}
                unit={getUnit(d.sensor_tag)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getUnit(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower.includes('temp') || lower.includes('温度')) return '°C';
  if (lower.includes('pressure') || lower.includes('压力')) return 'kPa';
  if (lower.includes('humidity') || lower.includes('湿度')) return '%';
  if (lower.includes('flow') || lower.includes('流量')) return 'm³/h';
  if (lower.includes('vibration') || lower.includes('振动')) return 'mm/s';
  if (lower.includes('speed') || lower.includes('转速')) return 'rpm';
  return '';
}
