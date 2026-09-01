'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { StatCards } from '@/components/dashboard/stat-cards';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { KilnOverview } from '@/components/dashboard/kiln-overview';
import { DataTable } from '@/components/dashboard/data-table';
import { AlarmList } from '@/components/dashboard/alarm-list';
import { apiFetch } from '@/lib/api-client';

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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('time_range', timeRange);
      if (filters.kiln_id) params.set('kiln_id', filters.kiln_id);
      // 趋势图只请求选中的传感器历史；空选择时显式传空，避免回退全量查询拖慢后端
      params.set('sensors', selectedTrendTags.join(','));

      const res = await apiFetch(`/api/dashboard?${params}`);
      const json = await res.json();
      if (json.success) {
        setLatestData(json.data.latest);
        setHistoryData(json.data.history);
        setStats(json.data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
    setLastUpdate(new Date());
    setLoading(false);
  }, [filters, timeRange, selectedTrendTags]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto refresh every 30 seconds（页面不可见时暂停，节省服务器压力）
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll();
    }, 30000);
    // 切回页面时立即刷新一次
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchAll]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader lastUpdate={lastUpdate} onRefresh={fetchAll} loading={loading} />

      <div className="px-4 pb-6 space-y-3">
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          kilns={stats?.kilns.map((k) => k.kiln_id) || []}
        />

        <StatCards data={latestData} stats={stats} />

        {/* 三段式布局：左窑体概览 / 中趋势图(黄金区) / 右告警列表 */}
        <div className="grid grid-cols-12 gap-3">
          {/* Left: Kiln Overview */}
          <div className="col-span-12 lg:col-span-3">
            <KilnOverview data={latestData} stats={stats} />
          </div>

          {/* Center: Trend Chart (golden area) */}
          <div className="col-span-12 lg:col-span-6">
            <TrendChart
              data={historyData}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              defaultTags={DEFAULT_TREND_TAGS}
              selectedTags={selectedTrendTags}
              onSelectedTagsChange={setSelectedTrendTags}
              candidateTags={stats?.sensorTags.map((t) => t.sensor_tag) || []}
            />
          </div>

          {/* Right: Alarms */}
          <div className="col-span-12 lg:col-span-3">
            <AlarmList data={latestData} />
          </div>
        </div>

        {/* Bottom: Real-time data table */}
        <DataTable data={latestData} />
      </div>
    </div>
  );
}
