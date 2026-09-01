'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { CategoryNav } from '@/components/sensors/category-nav';
import { SensorChart } from '@/components/sensors/sensor-chart';
import { LazyLoad } from '@/components/sensors/lazy-load';
import { classifySensor, UNIT_MAP, type SensorType } from '@/lib/sensor-classifier';

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

// 单位映射（从公共模块导入，见 sensor-classifier.ts）
export default function SensorsPage() {
  const [latestData, setLatestData] = useState<SensorReading[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, SensorHistory[]>>({});
  const [activeType, setActiveType] = useState<SensorType | 'all'>('all');
  const [timeRange, setTimeRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // SSE 实时订阅：最新数据每 2s 推送，历史随服务端缓存（15s）自动刷新
  // 相同 time_range 的观众共享一次服务端查询
  useEffect(() => {
    const es = new EventSource(`/api/stream?type=sensors&time_range=${timeRange}`);
    es.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data);
        if (json.latest) {
          setLatestData(json.latest);
          // 按传感器分组历史数据
          const grouped: Record<string, SensorHistory[]> = {};
          (json.history as SensorHistory[]).forEach((item) => {
            if (!grouped[item.sensor_tag]) {
              grouped[item.sensor_tag] = [];
            }
            grouped[item.sensor_tag].push(item);
          });
          setHistoryData(grouped);
          setLastUpdate(new Date());
          setLoading(false);
        }
      } catch {
        // 忽略无法解析的帧
      }
    };
    es.onerror = () => {
      // EventSource 断线自动重连（retry: 3000）
    };
    return () => es.close();
  }, [timeRange]);

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
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
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
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-4">
            {/* 返回首页按钮 */}
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 bg-card hover:bg-card-hover border border-border-strong rounded text-sm text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回首页
            </Link>

            <h1 className="text-lg font-semibold text-foreground">
              {activeType === 'all' ? '全部传感器' : activeType}
            </h1>
            <span className="text-sm text-muted-foreground">
              {filteredSensors.length} 个传感器
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* 时间范围选择 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">时间范围:</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
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
              <span className="text-xs text-muted-foreground">
                更新: {lastUpdate.toLocaleTimeString('zh-CN')}
              </span>
            )}
          </div>
        </div>

        {/* 图表网格 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="panel p-3">
                  <div className="shimmer h-3 w-24 mb-2" />
                  <div className="shimmer h-6 w-16 mb-3" />
                  <div className="shimmer h-[120px]" />
                </div>
              ))}
            </div>
          ) : filteredSensors.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">暂无数据</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
