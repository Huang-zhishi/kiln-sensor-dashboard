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
  is_online?: boolean;
}

interface SensorHistory {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

export default function SensorsPage() {
  const [latestData, setLatestData] = useState<SensorReading[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, SensorHistory[]>>({});
  const [activeType, setActiveType] = useState<SensorType | 'all'>('all');
  const [timeRange, setTimeRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hideOffline, setHideOffline] = useState(false);

  // SSE 实时订阅：最新数据每 2s 推送，历史随服务端缓存（15s）自动刷新
  useEffect(() => {
    const es = new EventSource(`/api/stream?type=sensors&time_range=${timeRange}`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data);
        if (json.latest) {
          setLatestData(json.latest);
          // 按「设备 + 点位」分组历史数据（同一 sensor_tag 可能对应多台设备）
          const grouped: Record<string, SensorHistory[]> = {};
          (json.history as SensorHistory[]).forEach((item) => {
            const key = `${item.device_id}|${item.sensor_tag}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
          });
          setHistoryData(grouped);
          setLastUpdate(new Date());
          setConnected(true);
          setLoading(false);
        }
      } catch {
        // 忽略无法解析的帧
      }
    };
    es.onerror = () => {
      // EventSource 断线自动重连（retry: 3000），此处仅标记连接态
      setConnected(false);
    };
    return () => es.close();
  }, [timeRange]);

  // 计算每种类型的传感器数量（只统计在线的，离线的单独显示）
  const onlineData = useMemo(() => latestData.filter((d) => d.is_online !== false), [latestData]);
  const offlineCount = latestData.length - onlineData.length;

  const typeCounts = useMemo(() => {
    const counts: Record<SensorType, number> = {} as Record<SensorType, number>;
    onlineData.forEach((item) => {
      const type = classifySensor(item.sensor_tag);
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [onlineData]);

  // 根据选中的类型过滤传感器；在线优先，离线置底
  const filteredSensors = useMemo(() => {
    const byType = activeType === 'all'
      ? latestData
      : latestData.filter((item) => classifySensor(item.sensor_tag) === activeType);
    const visible = hideOffline ? byType.filter((d) => d.is_online !== false) : byType;
    return [...visible].sort((a, b) => {
      const oa = a.is_online === false ? 1 : 0;
      const ob = b.is_online === false ? 1 : 0;
      if (oa !== ob) return oa - ob;
      return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
    });
  }, [latestData, activeType, hideOffline]);

  const timeRangeOptions = [
    { value: '10m', label: '10分钟' },
    { value: '30m', label: '30分钟' },
    { value: '1h', label: '1小时' },
    { value: '6h', label: '6小时' },
    { value: '12h', label: '12小时' },
    { value: '24h', label: '24小时' },
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* 视觉签名：信号迹线 */}
      <div className="signal-line" aria-hidden="true" />

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧分类导航 */}
        <div className="w-[210px] flex-shrink-0">
          <CategoryNav
            counts={typeCounts}
            active={activeType}
            onChange={setActiveType}
            offlineCount={offlineCount}
          />
        </div>

        {/* 右侧主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1.5 bg-card hover:bg-card-hover border border-border-strong rounded text-sm text-foreground transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                返回首页
              </Link>

              <h1 className="text-lg font-semibold text-foreground truncate">
                {activeType === 'all' ? '全部传感器' : activeType}
              </h1>
              <span className="text-sm text-muted-foreground flex-shrink-0">
                在线 {onlineData.length} / 共 {latestData.length} 个
                {offlineCount > 0 && (
                  <span className="ml-1" style={{ color: 'var(--danger)' }}>· {offlineCount} 个数据中断</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-4 flex-shrink-0">
              {/* 连接状态 */}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`status-dot ${connected ? 'online' : 'offline'}`} style={{ width: 7, height: 7 }} />
                {connected ? '实时' : '重连中'}
              </span>

              {/* 只看在线 */}
              <button
                onClick={() => setHideOffline((v) => !v)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  hideOffline
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-card border-border-strong text-muted-foreground hover:text-foreground'
                }`}
              >
                只看在线
              </button>

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

              {lastUpdate && (
                <span className="text-xs text-muted-foreground tabular-nums">
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
              <div className="empty-state h-full">
                <span className="text-sm">
                  {latestData.length === 0 ? '暂无传感器数据' : '当前筛选条件下没有传感器'}
                </span>
                <span className="empty-hint">
                  {latestData.length === 0
                    ? '等待数据推送后，传感器趋势卡片将在此展示。'
                    : hideOffline ? '已隐藏离线传感器，可关闭「只看在线」查看全部。' : '请切换左侧分类或时间范围。'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredSensors.map((sensor) => {
                  const sensorType = classifySensor(sensor.sensor_tag);
                  const online = sensor.is_online !== false;
                  return (
                    <LazyLoad key={`${sensor.device_id}-${sensor.sensor_tag}`}>
                      <SensorChart
                        name={sensor.sensor_tag}
                        deviceId={sensor.device_id}
                        type={sensorType}
                        data={historyData[`${sensor.device_id}|${sensor.sensor_tag}`] || []}
                        unit={UNIT_MAP[sensorType]}
                        isOnline={online}
                        lastReport={online ? undefined : new Date(sensor.reported_at).toLocaleString('zh-CN')}
                      />
                    </LazyLoad>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
