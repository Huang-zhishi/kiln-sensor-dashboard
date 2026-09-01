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
}

export function SensorChart({ name, type, data, unit }: SensorChartProps) {
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
        backgroundColor: '#1f2227',
        borderColor: 'rgba(204,204,220,0.19)',
        borderRadius: 3,
        textStyle: { fontSize: 12 },
        valueFormatter: (v: unknown) => `${Number(v).toFixed(2)} ${unit}`,
      },
      xAxis: {
        type: 'category',
        data: chartData.map((d) => formatTime(d.reported_at)),
        axisLine: { lineStyle: { color: 'rgba(204,204,220,0.15)' } },
        axisTick: { show: false },
        axisLabel: { color: '#8b8b8b', fontSize: 10, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: yDomain[0],
        max: yDomain[1],
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(204,204,220,0.08)', type: 'dashed' } },
        axisLabel: { color: '#8b8b8b', fontSize: 10 },
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
    <div className="bg-card rounded border border-border p-4 hover:border-border-strong transition-colors">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {name}
          </h3>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold font-mono" style={{ color }}>
            {latestValue.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground">{unit}</div>
        </div>
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
