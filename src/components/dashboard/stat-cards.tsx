'use client';

import { useState, useEffect, useRef } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface StatsData {
  totalRecords: number;
  stats: Array<{
    kiln_id: string;
    sensor_tag: string;
    avg_value: number;
    min_value: number;
    max_value: number;
    count: number;
  }>;
}

interface StatCardsProps {
  data: SensorData[];
  stats: StatsData | null;
}

// 数字平滑补间：值变化时 rAF 缓动过渡，营造大屏数字"跳动"质感
function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) return;

    const duration = 500;
    const start = performance.now();
    let raf = 0;

    const step = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{format ? format(display) : Math.round(display).toLocaleString()}</>;
}

export function StatCards({ data, stats }: StatCardsProps) {
  const totalDevices = new Set(data.map((d) => d.device_id)).size;
  const totalKilns = new Set(data.map((d) => d.kiln_id)).size;
  const totalSensors = new Set(data.map((d) => `${d.device_id}-${d.sensor_tag}`)).size;
  const totalRecords = stats?.totalRecords || 0;

  // Calculate average temperature from temperature-related sensors
  const tempSensors = data.filter((d) =>
    d.sensor_tag.toLowerCase().includes('temp') ||
    d.sensor_tag.toLowerCase().includes('温度')
  );
  const avgTempValue = tempSensors.length > 0
    ? tempSensors.reduce((sum, d) => sum + d.sensor_value, 0) / tempSensors.length
    : null;

  const cards = [
    { label: '数据总量', value: <AnimatedNumber value={totalRecords} />, unit: '条' },
    { label: '在线窑体', value: <AnimatedNumber value={totalKilns} />, unit: '座' },
    { label: '在线设备', value: <AnimatedNumber value={totalDevices} />, unit: '台' },
    { label: '传感器数', value: <AnimatedNumber value={totalSensors} />, unit: '个' },
    {
      label: '平均温度',
      value: avgTempValue === null
        ? '--'
        : <AnimatedNumber value={avgTempValue} format={(n) => n.toFixed(1)} />,
      unit: '°C',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="panel px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1.5 truncate">
            {card.label}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold font-mono text-foreground number-transition leading-none">
              {card.value}
            </span>
            <span className="text-xs text-muted-foreground">{card.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
