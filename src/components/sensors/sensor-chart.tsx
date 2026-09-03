'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from '@/components/charts/echarts';
import { SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface SensorDataPoint {
  reported_at: string;
  sensor_value: number;
}

interface SensorChartProps {
  name: string;
  type: SensorType;
  data: SensorDataPoint[];
  unit: string;
  isOnline?: boolean;
  lastReport?: string;
  /** 设备标识：同一 sensor_tag 可能对应多台设备，用于区分卡片 */
  deviceId?: string;
}

// 设备 ID 通常为长随机串，缩略展示（完整值放 title）
function shortDeviceId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function SensorChart({ name, type, data, unit, isOnline = true, lastReport, deviceId }: SensorChartProps) {
  const color = SENSOR_TYPE_COLORS[type] || '#33a2e5';

  // 使用 useMemo 缓存计算结果，避免不必要的重计算
  const { formatTime, latestValue, yDomain, chartData, chartOption } = useMemo(() => {
    // 格式化时间
    const formatTime = (ts: string) => {
      const date = new Date(ts);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    // 获取最新值
    const latestValue = data.length > 0 ? data[data.length - 1].sensor_value : 0;

    // 计算 Y 轴范围（使用固定范围避免重绘）
    const values = data.map((d) => Number(d.sensor_value)).filter((v) => !isNaN(v) && isFinite(v));
    const minVal = values.length > 0 ? Math.min(...values) : 0;
    const maxVal = values.length > 0 ? Math.max(...values) : 0;
    const padding = (maxVal - minVal) * 0.1 || 1;
    const yDomain: [number, number] = [minVal - padding, maxVal + padding];

    // 使用稳定的数据引用
    const chartData = data;

    const chartOption: EChartsOption = {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 8, right: 8, bottom: 18, left: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#14181f',
        borderColor: 'rgba(155,170,192,0.24)',
        borderRadius: 3,
        textStyle: { fontSize: 12 },
        valueFormatter: (v: unknown) => `${Number(v).toFixed(2)} ${unit}`,
      },
      xAxis: {
        type: 'category',
        data: chartData.map((d) => formatTime(d.reported_at)),
        axisLine: { lineStyle: { color: 'rgba(155,170,192,0.2)' } },
        axisTick: { show: false },
        axisLabel: { color: '#8b96a6', fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: yDomain[0],
        max: yDomain[1],
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(155,170,192,0.1)', type: 'dashed' } },
        axisLabel: { color: '#8b96a6', fontSize: 10 },
      },
      series: [
        {
          name,
          type: 'line',
          data: chartData.map((d) => d.sensor_value),
          showSymbol: false,
          lineStyle: { width: 2, color },
          color,
        },
      ],
    };

    return { formatTime, latestValue, yDomain, chartData, chartOption };
  }, [data, color, name, unit]);

  return (
    <div
      className={`bg-card rounded border p-4 transition-colors ${
        isOnline ? 'border-border hover:border-border-strong' : 'border-white/[0.04] opacity-60'
      }`}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: isOnline ? color : 'var(--muted-foreground)' }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate max-w-[160px]">
              {name}
            </h3>
            {deviceId && (
              <div
                className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]"
                title={deviceId}
              >
                {shortDeviceId(deviceId)}
              </div>
            )}
          </div>
        </div>
        {isOnline ? (
          <div className="text-right">
            <div className="text-lg font-bold font-mono" style={{ color }}>
              {latestValue.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">{unit}</div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-xs font-medium flex items-center gap-1.5 justify-end" style={{ color: 'var(--danger)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
              数据中断
            </div>
            {lastReport && <div className="text-[10px] text-muted-foreground">最后上报 {lastReport}</div>}
          </div>
        )}
      </div>

      {/* 图表 */}
      <div className="h-[120px]">
        <EChart option={chartOption} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
        <span>数据点: {data.length}</span>
        <span>
          范围: {yDomain[0].toFixed(1)} ~ {yDomain[1].toFixed(1)}
        </span>
      </div>
    </div>
  );
}
