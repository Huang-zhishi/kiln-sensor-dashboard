'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { classifySensor, SENSOR_TYPES, SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface TrendChartProps {
  data: SensorData[];
  sensorType?: SensorType | null;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
  /** 默认选中的传感器标签（存在则优先于"前 4 个"逻辑） */
  defaultTags?: string[];
  /** 受控选中的传感器标签 */
  selectedTags?: string[];
  onSelectedTagsChange?: (tags: string[]) => void;
  /** 全部可用传感器标签（来自 stats；数据按选中裁剪后仍可搜索/选择其它传感器） */
  candidateTags?: string[];
}

// Grafana 调色板
const COLORS = [
  '#5794f2', '#f2495c', '#ff9830', '#73bf69', '#33a2e5',
  '#fade2a', '#b877d9', '#ffd166', '#e0752d', '#0ea5e9',
  '#a7c7e7', '#c0a3e6', '#95de64', '#ff85c0', '#5cdbd3', '#d3adf7',
];

// Get interval info from time range
function getIntervalInfo(timeRange: string): { interval: string; label: string; formatFn: (iso: string) => string } {
  const pad = (n: number) => String(n).padStart(2, '0');

  switch (timeRange) {
    case '10m':
    case '30m':
      return {
        interval: '10s',
        label: '10秒采样',
        formatFn: (iso: string) => {
          const d = parseDate(iso);
          return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        },
      };
    case '1h':
    case '6h':
      return {
        interval: '1m',
        label: '1分钟采样',
        formatFn: (iso: string) => {
          const d = parseDate(iso);
          return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },
      };
    case '12h':
    case '24h':
    default:
      return {
        interval: '1h',
        label: '1小时采样',
        formatFn: (iso: string) => {
          const d = parseDate(iso);
          return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:00`;
        },
      };
  }
}

function parseDate(iso: string): Date {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return new Date(normalized);
}

function formatTimeRange(iso1: string, iso2: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (iso: string) => {
    const d = parseDate(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  return `${fmt(iso1)} ~ ${fmt(iso2)}`;
}

export function TrendChart({
  data,
  sensorType,
  timeRange: externalTimeRange,
  onTimeRangeChange,
  defaultTags,
  selectedTags: controlledTags,
  onSelectedTagsChange,
  candidateTags,
}: TrendChartProps) {
  const [internalTimeRange, setInternalTimeRange] = useState<string>('1h');
  const timeRange = externalTimeRange ?? internalTimeRange;

  const handleTimeRangeChange = (range: string) => {
    setInternalTimeRange(range);
    onTimeRangeChange?.(range);
  };

  const { formatFn } = useMemo(() => getIntervalInfo(timeRange), [timeRange]);

  const TIME_RANGES = [
    { value: '10m', label: '10 分钟' },
    { value: '30m', label: '30 分钟' },
    { value: '1h', label: '1 小时' },
    { value: '6h', label: '6 小时' },
    { value: '12h', label: '12 小时' },
    { value: '24h', label: '24 小时' },
  ];

  // 根据类型过滤数据
  const filteredData = useMemo(() => {
    if (!sensorType) return data;
    return data.filter((d) => classifySensor(d.sensor_tag) === sensorType);
  }, [data, sensorType]);

  const allTags = useMemo(() => {
    // 优先使用全部候选标签（数据被按选中裁剪后仍可搜索/选择其它传感器）
    if (candidateTags && candidateTags.length > 0) return candidateTags;
    const tags = new Set(filteredData.map((d) => d.sensor_tag));
    return Array.from(tags);
  }, [filteredData, candidateTags]);

  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const isControlled = controlledTags !== undefined;

  const effectiveSelected = useMemo(() => {
    if (isControlled) return new Set(controlledTags);
    if (internalSelected.size === 0) {
      // 默认：优先使用指定的默认标签（存在于数据中的子集）
      if (defaultTags && defaultTags.length > 0) {
        const matched = defaultTags.filter((t) => allTags.includes(t));
        if (matched.length > 0) return new Set(matched);
      }
      // 兜底：取前 4 个传感器
      if (allTags.length > 0) return new Set(allTags.slice(0, 4));
    }
    return internalSelected;
  }, [isControlled, controlledTags, internalSelected, allTags, defaultTags]);

  const commitSelection = (next: Set<string>) => {
    if (isControlled) onSelectedTagsChange?.(Array.from(next));
    else setInternalSelected(next);
  };

  const toggleTag = (tag: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    commitSelection(next);
  };

  // 与图表显示上限一致：全选最多选 12 个，避免一次查询过多传感器拖慢后端
  const selectAll = () => commitSelection(new Set(allTags.slice(0, 12)));
  const clearAll = () => commitSelection(new Set());

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!searchQuery) return allTags;
    const q = searchQuery.toLowerCase();
    return allTags.filter((t) => t.toLowerCase().includes(q));
  }, [allTags, searchQuery]);

  // Group filtered tags
  const groupedTags = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredTags.forEach((tag) => {
      let group = '其他';
      if (tag.startsWith('1#')) group = '1# 窑';
      else if (tag.startsWith('2#')) group = '2# 窑';
      else if (tag.startsWith('四锰')) group = '四锰';
      else if (tag.startsWith('磨机') || tag.startsWith('PN') || tag.startsWith('压缩')) group = '公用';
      if (!groups[group]) groups[group] = [];
      groups[group].push(tag);
    });
    return groups;
  }, [filteredTags]);

  // Data time range
  const timeRangeStr = useMemo(() => {
    if (!data.length) return '';
    const times = data.map((d) => parseDate(d.reported_at).getTime());
    return formatTimeRange(data.find((d) => parseDate(d.reported_at).getTime() === Math.min(...times))!.reported_at,
      data.find((d) => parseDate(d.reported_at).getTime() === Math.max(...times))!.reported_at);
  }, [data]);

  // Build chart data - group by time label
  const chartData = useMemo(() => {
    if (!filteredData.length) return [];

    const grouped = new Map<string, Record<string, unknown>>();

    filteredData.forEach((d) => {
      const timeLabel = formatFn(d.reported_at);
      const key = d.sensor_tag;
      const value = Number(d.sensor_value);
      if (isNaN(value)) return;

      if (!grouped.has(timeLabel)) {
        grouped.set(timeLabel, { time: timeLabel });
      }
      const row = grouped.get(timeLabel)!;
      // If multiple values for same sensor at same time, average them
      if (row[key] !== undefined) {
        row[key] = ((row[key] as number) + value) / 2;
      } else {
        row[key] = value;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const ta = a.time as string;
      const tb = b.time as string;
      return ta.localeCompare(tb);
    });
  }, [data, formatFn]);

  const visibleTags = useMemo(() => {
    return allTags.filter((tag) => effectiveSelected.has(tag));
  }, [allTags, effectiveSelected]);

  // Limit to 12 lines max for readability
  const displayTags = visibleTags.slice(0, 12);
  const extraCount = visibleTags.length - 12;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>趋势曲线</span>
          {sensorType && (
            <span className="text-xs font-normal normal-case" style={{ color: SENSOR_TYPE_COLORS[sensorType] }}>
              {sensorType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => handleTimeRangeChange(tr.value)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                timeRange === tr.value
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>
      {timeRangeStr && (
        <div className="px-4 py-1 text-xs text-muted-foreground border-b border-border">
          {timeRangeStr}
        </div>
      )}

      {/* Sensor selector with search */}
      {allTags.length > 0 && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-muted-foreground">选择传感器：</span>
            <button onClick={selectAll}
              className="text-[11px] px-1.5 py-0.5 rounded transition-colors bg-primary/15 text-primary hover:bg-primary/25">
              全选
            </button>
            <button onClick={clearAll}
              className="text-[11px] px-1.5 py-0.5 rounded transition-colors bg-card text-muted-foreground border border-border-strong hover:bg-card-hover">
              清空
            </button>
            <span className="text-[11px] text-muted-foreground ml-1">
              已选 {effectiveSelected.size} / {allTags.length}
            </span>
            <input
              type="text"
              placeholder="搜索..."
              className="ml-auto text-xs px-2 py-0.5 rounded w-36 outline-none bg-card border border-border-strong text-foreground focus:border-primary transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Tag chips - scrollable */}
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pb-1">
            {Object.entries(groupedTags).map(([group, tags]) => (
              tags.map((tag) => {
                const idx = allTags.indexOf(tag) % COLORS.length;
                const isSelected = effectiveSelected.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="text-[10px] px-2 py-0.5 rounded-full transition-all truncate max-w-48"
                    style={{
                      background: isSelected ? `${COLORS[idx]}26` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? COLORS[idx] + '66' : 'rgba(255,255,255,0.08)'}`,
                      color: isSelected ? COLORS[idx] : '#a1a1a1',
                    }}
                  >
                    {tag}
                  </button>
                );
              })
            ))}
          </div>
          {extraCount > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              还有 {extraCount} 个传感器未显示，请减少选择
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 pb-2">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(204,204,220,0.08)" />
              <XAxis
                dataKey="time"
                tick={{ fill: '#8b8b8b', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(204,204,220,0.15)' }}
                tickLine={{ stroke: 'rgba(204,204,220,0.15)' }}
                interval="preserveStartEnd"
                angle={-20}
                textAnchor="end"
                height={40}
              />
              <YAxis
                tick={{ fill: '#8b8b8b', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(204,204,220,0.15)' }}
                tickLine={{ stroke: 'rgba(204,204,220,0.15)' }}
                width={50}
                tickFormatter={(v: number) => {
                  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return '';
                  if (v >= 1000) return v.toFixed(0);
                  if (v >= 10) return v.toFixed(1);
                  return v.toFixed(2);
                }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1f2227',
                  border: '1px solid rgba(204,204,220,0.19)',
                  borderRadius: '3px',
                  fontSize: '11px',
                  color: '#e0e0e0',
                }}
                labelStyle={{ color: '#a1a1a1' }}
                formatter={(value: number | string, name: string) => {
                  const num = Number(value);
                  return [isNaN(num) ? String(value) : num.toFixed(2), name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', color: '#a1a1a1' }}
                iconType="line"
              />
              {displayTags.map((tag) => {
                const idx = allTags.indexOf(tag) % COLORS.length;
                return (
                  <Line
                    key={tag}
                    type="monotone"
                    dataKey={tag}
                    stroke={COLORS[idx]}
                    strokeWidth={1.5}
                    dot={chartData.length <= 30 ? { r: 2, fill: COLORS[idx] } : false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
