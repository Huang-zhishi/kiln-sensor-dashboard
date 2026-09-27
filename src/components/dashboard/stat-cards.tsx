'use client';

import { useState, useEffect, useRef } from 'react';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
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
  anomalyCount?: number;
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

// 统计卡：大数字即论点。左侧语义色条承载状态，主数据等宽 tabular。
export function StatCards({ data, stats, anomalyCount = 0 }: StatCardsProps) {
  void stats; // 统计总量不再首页展示（保留入参兼容）
  const onlineData = data.filter((d) => d.is_online !== false);
  const totalOnlineSensors = new Set(onlineData.map((d) => `${d.device_id}-${d.sensor_tag}`)).size;
  const totalAllSensors = new Set(data.map((d) => `${d.device_id}-${d.sensor_tag}`)).size;
  const onlineDevices = new Set(onlineData.map((d) => d.device_id)).size;
  const totalDevices = new Set(data.map((d) => d.device_id)).size;
  const onlineKilns = new Set(onlineData.map((d) => d.kiln_id)).size;
  const totalKilns = new Set(data.map((d) => d.kiln_id)).size;
  const hasOffline = totalAllSensors > totalOnlineSensors;

  // tone：danger(异常) / success(在线健康) / warning(存在离线) / neutral
  const cards = [
    {
      label: '异常记录',
      tone: anomalyCount > 0 ? ('danger' as const) : ('success' as const),
      value: <AnimatedNumber value={anomalyCount} />,
      unit: '条',
    },
    {
      label: '在线窑体',
      tone: hasOffline ? ('warning' as const) : ('success' as const),
      value: <AnimatedNumber value={onlineKilns} />,
      unit: `/ ${totalKilns} 座`,
    },
    {
      label: '在线设备',
      tone: hasOffline ? ('warning' as const) : ('success' as const),
      value: <AnimatedNumber value={onlineDevices} />,
      unit: `/ ${totalDevices} 台`,
    },
    {
      label: '在线传感器',
      tone: hasOffline ? ('warning' as const) : ('success' as const),
      value: <AnimatedNumber value={totalOnlineSensors} />,
      unit: `/ ${totalAllSensors} 个`,
    },
  ];

  const toneBar: Record<string, string> = {
    danger: 'var(--danger)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    neutral: 'var(--border-strong)',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="stat-card px-4 py-3 reveal"
          style={{ animationDelay: `${i * 40}ms`, borderTopColor: toneBar[card.tone] }}
        >
          <div className="text-xs text-muted-foreground mb-1.5 truncate">{card.label}</div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[26px] font-bold font-mono leading-none tabular-nums number-transition"
              style={{ color: card.tone === 'danger' ? 'var(--danger)' : 'var(--foreground)' }}
            >
              {card.value}
            </span>
            <span className="text-xs text-muted-foreground">{card.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
