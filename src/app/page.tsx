'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { StatCards } from '@/components/dashboard/stat-cards';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { KilnOverview } from '@/components/dashboard/kiln-overview';
import { DataTable } from '@/components/dashboard/data-table';
import { AlarmList } from '@/components/dashboard/alarm-list';
import { DashboardSkeleton } from '@/components/dashboard/panel-skeleton';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface StatsData {
  kilns: Array<{ kiln_id: string }>;
  sensorTags: Array<{ sensor_tag: string }>;
  devices: Array<{ device_id: string }>;
  stats: Array<{
    kiln_id: string;
    sensor_tag: string;
    avg_value: number;
    min_value: number;
    max_value: number;
    count: number;
  }>;
  totalRecords: number;
}

// 趋势曲线默认展示：1# 窑体温度传感器
const DEFAULT_TREND_TAGS = [
  '1#窑体温度TI_206A',
  '1#窑体温度TI_206B',
  '1#窑体温度TI_206F',
  '1#窑体温度TI_206E',
];

export default function DashboardPage() {
  const [latestData, setLatestData] = useState<SensorData[]>([]);
  const [historyData, setHistoryData] = useState<SensorData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filters, setFilters] = useState({
    kiln_id: '',
  });
  const [timeRange, setTimeRange] = useState('1h');
  // 趋势图选中的传感器（受控状态，联动 API 精确查询）
  const [selectedTrendTags, setSelectedTrendTags] = useState<string[]>(DEFAULT_TREND_TAGS);

  // 实际生效的选中标签：默认标签在新库不存在时自动回退到前 4 个实际传感器
  const candidates = stats?.sensorTags.map((t) => t.sensor_tag) || [];
  const effectiveTrendTags = useMemo(() => {
    if (selectedTrendTags.length === 0) return []; // 用户显式清空
    const valid = selectedTrendTags.filter((t) => candidates.includes(t));
    return valid.length > 0 ? valid : candidates.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrendTags, stats]);

  // 稳定键：effect 依赖原语字符串而非数组引用，避免 stats 高频更新导致 SSE 连接反复重建
  const trendTagsKey = effectiveTrendTags.join(',');

  // SSE 实时订阅：服务端单点查询 + 广播，相同筛选参数的观众共享一次查询
  // connNonce 仅用于手动刷新时重建连接
  const [connNonce, setConnNonce] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('time_range', timeRange);
    if (filters.kiln_id) params.set('kiln_id', filters.kiln_id);
    // 趋势图只订阅选中传感器的历史；空选择时显式传空，避免回退全量查询
    params.set('sensors', trendTagsKey);

    const es = new EventSource(`/api/stream?${params}`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data);
        setLatestData(json.latest);
        setHistoryData(json.history);
        setStats(json.stats);
        setLastUpdate(new Date());
        setConnected(true);
        setLoading(false);
      } catch {
        // 忽略无法解析的帧
      }
    };
    es.onerror = () => {
      // EventSource 断线自动重连（retry: 3000），此处仅标记连接态
      setConnected(false);
    };

    return () => es.close();
  }, [filters, timeRange, trendTagsKey, connNonce]);

  const handleRefresh = useMemo(() => () => setConnNonce((n) => n + 1), []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader lastUpdate={lastUpdate} onRefresh={handleRefresh} loading={loading} connected={connected} />

      {loading && latestData.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <div className="px-4 pb-6 space-y-3">
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          kilns={stats?.kilns.map((k) => k.kiln_id) || []}
        />

        <StatCards data={latestData} stats={stats} />

        {/* 三段式布局：左窑体概览 / 中趋势图(黄金区) / 右告警列表
            行高随视口自适应（44vh，360~600px 限幅），面板内部滚动 */}
        <div className="grid grid-cols-12 gap-3 lg:h-[clamp(360px,44vh,600px)] lg:grid-rows-[minmax(0,1fr)]">
          {/* Left: Kiln Overview */}
          <div className="col-span-12 h-[320px] min-h-0 lg:col-span-3 lg:h-auto">
            <KilnOverview data={latestData} stats={stats} />
          </div>

          {/* Center: Trend Chart (golden area) */}
          <div className="col-span-12 h-[420px] min-h-0 lg:col-span-6 lg:h-auto">
            <TrendChart
              data={historyData}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              defaultTags={DEFAULT_TREND_TAGS}
              selectedTags={effectiveTrendTags}
              onSelectedTagsChange={setSelectedTrendTags}
              candidateTags={candidates}
            />
          </div>

          {/* Right: Alarms */}
          <div className="col-span-12 h-[360px] min-h-0 lg:col-span-3 lg:h-auto">
            <AlarmList data={latestData} />
          </div>
        </div>

        {/* Bottom: Real-time data table */}
        <DataTable data={latestData} />
        </div>
      )}
    </div>
  );
}
