'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
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
  const { formatTime, latestValue, yDomain, chartData } = useMemo(() => {
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
    const yDomain = [minVal - padding, maxVal + padding];

    // 使用稳定的数据引用
    const chartData = data;

    return { formatTime, latestValue, yDomain, chartData };
  }, [data]);

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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(204,204,220,0.08)"
            />
            <XAxis
              dataKey="reported_at"
              tickFormatter={formatTime}
              stroke="#8b8b8b"
              fontSize={10}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yDomain}
              stroke="#8b8b8b"
              fontSize={10}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2227',
                border: '1px solid rgba(204,204,220,0.19)',
                borderRadius: '3px',
                fontSize: '12px',
              }}
              labelFormatter={(label) => `时间: ${formatTime(label)}`}
              formatter={(value: number) => [`${value.toFixed(2)} ${unit}`, name]}
            />
            <Line
              type="monotone"
              dataKey="sensor_value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
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
