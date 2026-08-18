'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { StatCards } from '@/components/dashboard/stat-cards';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { KilnOverview } from '@/components/dashboard/kiln-overview';
import { DataTable } from '@/components/dashboard/data-table';
import { SensorGauge } from '@/components/dashboard/sensor-gauge';
import { classifySensor, SENSOR_TYPES } from '@/lib/sensor-classifier';
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('time_range', timeRange);
      if (filters.kiln_id) params.set('kiln_id', filters.kiln_id);

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
  }, [filters, timeRange]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return (
    <div className="dashboard-bg">
      <DashboardHeader lastUpdate={lastUpdate} onRefresh={fetchAll} loading={loading} />

      <div className="px-4 pb-6 space-y-4">
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          kilns={stats?.kilns.map((k) => k.kiln_id) || []}
        />

        <StatCards data={latestData} stats={stats} />

        <div className="grid grid-cols-12 gap-4">
          {/* Left: Trend Chart */}
          <div className="col-span-12 lg:col-span-8">
            <TrendChart data={historyData} timeRange={timeRange} onTimeRangeChange={setTimeRange} />
          </div>

          {/* Right: Sensor Gauges */}
          <div className="col-span-12 lg:col-span-4">
            <SensorGauge data={latestData} />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Kiln Overview */}
          <div className="col-span-12 lg:col-span-5">
            <KilnOverview data={latestData} stats={stats} />
          </div>

          {/* Data Table */}
          <div className="col-span-12 lg:col-span-7">
            <DataTable data={latestData} />
          </div>
        </div>
      </div>
    </div>
  );
}
