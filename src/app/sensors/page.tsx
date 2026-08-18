'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { CategoryNav } from '@/components/sensors/category-nav';
import { SensorChart } from '@/components/sensors/sensor-chart';
import { LazyLoad } from '@/components/sensors/lazy-load';
import { classifySensor, type SensorType } from '@/lib/sensor-classifier';

interface SensorReading {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface SensorHistory {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

// 单位映射
const UNIT_MAP: Record<SensorType, string> = {
  '温度': '°C',
  '压力': 'kPa',
  '流量': 'm³/h',
  '阀位': '%',
  '液位': 'm',
  '成分检测': '%',
  'pH值': 'pH',
  '设备状态': '',
  '其他': '',
};

export default function SensorsPage() {
  const [latestData, setLatestData] = useState<SensorReading[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, SensorHistory[]>>({});
  const [activeType, setActiveType] = useState<SensorType | 'all'>('all');
  const [timeRange, setTimeRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 获取数据（无感更新）
  const fetchData = useCallback(async () => {
    try {
      // 并行请求最新数据和历史数据
      const [latestRes, historyRes] = await Promise.all([
        fetch('/api/sensors/latest'),
        fetch(`/api/sensors/history?time_range=${timeRange}`),
      ]);

      const latestJson = await latestRes.json();
      if (latestJson.success) {
        setLatestData(latestJson.data);
      }

      const historyJson = await historyRes.json();
      if (historyJson.success) {
        // 按传感器分组
        const grouped: Record<string, SensorHistory[]> = {};
        historyJson.data.forEach((item: SensorHistory) => {
          if (!grouped[item.sensor_tag]) {
            grouped[item.sensor_tag] = [];
          }
          grouped[item.sensor_tag].push(item);
        });
        setHistoryData(grouped);
      }

      setLastUpdate(new Date());
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 计算每种类型的传感器数量
  const typeCounts = useMemo(() => {
    const counts: Record<SensorType, number> = {} as Record<SensorType, number>;
    latestData.forEach((item) => {
      const type = classifySensor(item.sensor_tag);
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [latestData]);

  // 根据选中的类型过滤传感器
  const filteredSensors = useMemo(() => {
    if (activeType === 'all') {
      return latestData;
    }
    return latestData.filter((item) => classifySensor(item.sensor_tag) === activeType);
  }, [latestData, activeType]);

  // 时间范围选项
  const timeRangeOptions = [
    { value: '10m', label: '10分钟' },
    { value: '30m', label: '30分钟' },
    { value: '1h', label: '1小时' },
    { value: '6h', label: '6小时' },
    { value: '12h', label: '12小时' },
    { value: '24h', label: '24小时' },
  ];

  return (
    <div className="h-screen flex bg-[#0a0e1a] text-[#e2e8f0] overflow-hidden">
      {/* 左侧分类导航 */}
      <div className="w-[200px] flex-shrink-0">
        <CategoryNav
          counts={typeCounts}
          active={activeType}
          onChange={setActiveType}
        />
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[rgba(0,212,255,0.15)] bg-[#0f1729]">
          <div className="flex items-center gap-4">
            {/* 返回首页按钮 */}
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] border border-[rgba(0,212,255,0.2)] rounded text-sm text-[#e2e8f0] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回首页
            </Link>

            <h1 className="text-lg font-bold text-[#e2e8f0]">
              {activeType === 'all' ? '全部传感器' : activeType}
            </h1>
            <span className="text-sm text-[#64748b]">
              {filteredSensors.length} 个传感器
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* 时间范围选择 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748b]">时间范围:</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-[#1e293b] border border-[rgba(0,212,255,0.2)] rounded px-2 py-1 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#00d4ff]"
              >
                {timeRangeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 最后更新时间 */}
            {lastUpdate && (
              <span className="text-xs text-[#64748b]">
                更新: {lastUpdate.toLocaleTimeString('zh-CN')}
              </span>
            )}
          </div>
        </div>

        {/* 图表网格 */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-[#64748b]">加载中...</div>
            </div>
          ) : filteredSensors.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-[#64748b]">暂无数据</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSensors.map((sensor) => {
                const sensorType = classifySensor(sensor.sensor_tag);
                return (
                  <LazyLoad key={sensor.sensor_tag}>
                    <SensorChart
                      name={sensor.sensor_tag}
                      type={sensorType}
                      data={historyData[sensor.sensor_tag] || []}
                      unit={UNIT_MAP[sensorType]}
                    />
                  </LazyLoad>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
