'use client';

import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { EChart } from '@/components/charts/echarts';
import { classifySensor, SENSOR_TYPES, SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';
import {
  TIME_RANGE_PRESETS,
  CUSTOM_RANGE_VALUE,
  intervalForRange,
  intervalLabel,
  localInputToMs,
  msToLocalInput,
} from '@/lib/time-range';

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
  /** 自定义区间（epoch 毫秒）；timeRange 为 'custom' 时生效 */
  customRange?: { start: number; end: number } | null;
  onCustomRangeChange?: (range: { start: number; end: number } | null) => void;
  /** 全部可用传感器标签（来自 stats；数据按选中裁剪后仍可搜索/选择其它传感器） */
  candidateTags?: string[];
  /** 异常事件（突破极值）用于在曲线上打点 */
  anomalies?: Array<{ ts: string; sensor_tag: string; direction: string; sensor_value: number }>;
}

// 系列调色板（与语义色对齐，首位为信息蓝）
const COLORS = [
  '#4da3ff', '#ff4d5e', '#f5a524', '#38c172', '#33a2e5',
  '#f7c948', '#b877d9', '#ffd166', '#e0752d', '#0ea5e9',
  '#a7c7e7', '#c0a3e6', '#95de64', '#ff85c0', '#5cdbd3', '#d3adf7',
];

// Get interval info from time range
function getIntervalInfo(
  timeRange: string,
  spanMs?: number,
): { interval: string; label: string; formatFn: (iso: string) => string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const interval = intervalForRange(timeRange, spanMs);
  const label = intervalLabel(interval);

  let formatFn: (iso: string) => string;
  if (interval === '10s') {
    formatFn = (iso) => {
      const d = parseDate(iso);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
  } else if (interval === '1m') {
    formatFn = (iso) => {
      const d = parseDate(iso);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
  } else if (interval.endsWith('m')) {
    // 5m / 15m / 30m：分钟粒度，超过一天时带上日期
    formatFn = (iso) => {
      const d = parseDate(iso);
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
  } else {
    // 1h / 3h 等小时及以上粒度
    formatFn = (iso) => {
      const d = parseDate(iso);
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:00`;
    };
  }

  return { interval, label, formatFn };
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
  customRange,
  onCustomRangeChange,
  candidateTags,
  anomalies,
}: TrendChartProps) {
  const [internalTimeRange, setInternalTimeRange] = useState<string>('1h');
  const timeRange = externalTimeRange ?? internalTimeRange;

  const handleTimeRangeChange = (range: string) => {
    setInternalTimeRange(range);
    onTimeRangeChange?.(range);
  };

  // 自定义区间：默认折叠，点击「自定义」展开日期时间选择
  const [showCustom, setShowCustom] = useState(false);
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  const customSpanMs = customRange ? customRange.end - customRange.start : undefined;

  const openCustom = () => {
    if (!showCustom) {
      const end = customRange?.end ?? Date.now();
      const start = customRange?.start ?? end - 7 * 24 * 3600_000;
      setCustomStartInput(msToLocalInput(start));
      setCustomEndInput(msToLocalInput(end));
    }
    setShowCustom((v) => !v);
  };

  const applyCustom = () => {
    const s = localInputToMs(customStartInput);
    const e = localInputToMs(customEndInput);
    if (s === null || e === null) return;
    handleTimeRangeChange(CUSTOM_RANGE_VALUE);
    onCustomRangeChange?.({ start: Math.min(s, e), end: Math.max(s, e) });
  };

  const { interval, formatFn } = useMemo(
    () => getIntervalInfo(timeRange, customSpanMs),
    [timeRange, customSpanMs],
  );

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

  // ECharts 配置：Canvas 渲染 + 关闭动画，SSE 高频推送下无闪烁
  const chartOption = useMemo<EChartsOption>(() => {
    const series = displayTags.map((tag) => {
      const idx = allTags.indexOf(tag) % COLORS.length;
      return {
        name: tag,
        type: 'line' as const,
        data: chartData.map((row) => [row.time as string, row[tag] as number | null]),
        showSymbol: chartData.length <= 30,
        symbolSize: 4,
        lineStyle: { width: 1.5 },
        color: COLORS[idx],
        connectNulls: true,
      };
    });

    // 异常点打标：把异常时间对齐到最近的曲线时间桶，叠加散点（红=突破最高，蓝=突破最低）
    const anomalyPoints = (anomalies || [])
      .filter((a) => displayTags.includes(a.sensor_tag))
      .map((a) => {
        const label = formatFn(a.ts);
        const idx = chartData.findIndex((row) => row.time === label);
        if (idx < 0) return null;
        const color = a.direction === 'NEW_HIGH' ? '#ff4d5e' : '#4da3ff';
        return {
          value: [idx, Number(a.sensor_value)],
          name: a.sensor_tag,
          direction: a.direction,
          itemStyle: { color },
        };
      })
      .filter(Boolean) as Array<{
      value: [number, number];
      name: string;
      direction: string;
      itemStyle: { color: string };
    }>;
    const anomalySeries = anomalyPoints.length
      ? [
          {
            name: '异常点',
            type: 'scatter' as const,
            data: anomalyPoints,
            symbolSize: 9,
            z: 20,
          },
        ]
      : [];

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 10, right: 20, bottom: 40, left: 55, containLabel: false },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { fontSize: 10, color: '#8b96a6' },
        itemWidth: 14,
        itemHeight: 2,
        icon: 'rect',
        pageIconColor: '#8b96a6',
        pageIconInactiveColor: '#3a4250',
        pageTextStyle: { color: '#8b96a6' },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#14181f',
        borderColor: 'rgba(155,170,192,0.24)',
        borderRadius: 3,
        textStyle: { fontSize: 11, color: '#e8edf4' },
        valueFormatter: (v: unknown) => {
          const num = Number(v);
          return isNaN(num) ? String(v ?? '') : num.toFixed(2);
        },
      },
      xAxis: {
        type: 'category',
        data: chartData.map((row) => row.time as string),
        axisLine: { lineStyle: { color: 'rgba(155,170,192,0.2)' } },
        axisTick: { lineStyle: { color: 'rgba(155,170,192,0.2)' } },
        axisLabel: {
          color: '#8b96a6',
          fontSize: 10,
          rotate: 20,
          interval: 'auto',
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(155,170,192,0.1)', type: 'dashed' } },
        axisLabel: {
          color: '#8b96a6',
          fontSize: 10,
          formatter: (v: number) => {
            if (!isFinite(v)) return '';
            if (v >= 1000) return v.toFixed(0);
            if (v >= 10) return v.toFixed(1);
            return v.toFixed(2);
          },
        },
        scale: true,
      },
      series: [...series, ...anomalySeries],
    };
  }, [chartData, displayTags, allTags, anomalies, formatFn]);

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
        <div className="flex flex-wrap items-center justify-end gap-1">
          {TIME_RANGE_PRESETS.map((tr) => (
            <button
              key={tr.value}
              onClick={() => {
                setShowCustom(false);
                handleTimeRangeChange(tr.value);
              }}
              title={tr.label}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                timeRange === tr.value
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tr.short}
            </button>
          ))}
          <button
            onClick={openCustom}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              timeRange === CUSTOM_RANGE_VALUE || showCustom
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            自定义
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border text-xs">
          <input
            type="datetime-local"
            value={customStartInput}
            onChange={(e) => setCustomStartInput(e.target.value)}
            className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
          />
          <span className="text-muted-foreground">至</span>
          <input
            type="datetime-local"
            value={customEndInput}
            onChange={(e) => setCustomEndInput(e.target.value)}
            className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
          />
          <button
            onClick={applyCustom}
            className="px-2 py-1 rounded text-xs bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
          >
            查询
          </button>
          <span className="text-muted-foreground">聚合间隔：{intervalLabel(interval)}</span>
        </div>
      )}

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
                      color: isSelected ? COLORS[idx] : 'var(--muted-foreground)',
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
          <div className="empty-state h-full">
            <span className="text-sm">暂无趋势数据</span>
            <span className="empty-hint">选择传感器并等待数据推送后，趋势曲线将在此绘制。</span>
          </div>
        ) : (
          <EChart option={chartOption} style={{ width: '100%', height: '100%' }} />
        )}
      </div>
    </div>
  );
}
