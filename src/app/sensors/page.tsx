'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { CategoryNav } from '@/components/sensors/category-nav';
import { SensorChart } from '@/components/sensors/sensor-chart';
import { LazyLoad } from '@/components/sensors/lazy-load';
import { classifySensor, UNIT_MAP, isSuspectReading, type SensorType } from '@/lib/sensor-classifier';
import {
  TIME_RANGE_PRESETS,
  CUSTOM_RANGE_VALUE,
  localInputToMs,
  msToLocalInput,
} from '@/lib/time-range';
import type { SensorMetaMap } from '@/lib/sensor-meta-types';

interface SensorReading {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
  value_missing?: boolean;
  no_data_since?: string | null;
  maintenance?: boolean;
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
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hideOffline, setHideOffline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [referenceMap, setReferenceMap] = useState<Record<string, { mn: number; mx: number; av: number }>>({});
  const [metaMap, setMetaMap] = useState<SensorMetaMap>({});

  // SSE 实时订阅：最新数据每 2s 推送，历史随服务端缓存（15s）自动刷新
  useEffect(() => {
    const params = new URLSearchParams({ type: 'sensors', time_range: timeRange });
    if (customRange) {
      params.set('start', String(customRange.start));
      params.set('end', String(customRange.end));
    }
    const es = new EventSource(`/api/stream?${params.toString()}`);
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
  }, [timeRange, customRange]);

  // 历史参考区间（全量统计，服务端缓存 10 分钟）+ 测点主数据
  useEffect(() => {
    let cancelled = false;
    fetch('/api/sensors/reference')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setReferenceMap(j.references || {});
      })
      .catch(() => {});
    fetch('/api/sensors/meta')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setMetaMap(j.meta || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
  // 组内按「设备 ID + 点位」固定排序——不能按 reported_at 排，
  // 否则每台设备上报时间不同，每次推送都会打乱卡片顺序
  const filteredSensors = useMemo(() => {
    const byType = activeType === 'all'
      ? latestData
      : latestData.filter((item) => classifySensor(item.sensor_tag) === activeType);
    // 测点主数据：停用测点不展示
    const enabledOnly = byType.filter((item) => metaMap[item.sensor_tag]?.enabled !== false);
    const visible = hideOffline ? enabledOnly.filter((d) => d.is_online !== false) : enabledOnly;
    const q = searchQuery.trim().toLowerCase();
    const searched = q ? visible.filter((d) => d.sensor_tag.toLowerCase().includes(q)) : visible;
    return [...searched].sort((a, b) => {
      const oa = a.is_online === false ? 1 : 0;
      const ob = b.is_online === false ? 1 : 0;
      if (oa !== ob) return oa - ob;
      return (
        a.device_id.localeCompare(b.device_id) ||
        a.sensor_tag.localeCompare(b.sensor_tag)
      );
    });
  }, [latestData, activeType, hideOffline, searchQuery, metaMap]);

  const handleRangeSelect = (value: string) => {
    setTimeRange(value);
    if (value === CUSTOM_RANGE_VALUE) {
      const end = customRange?.end ?? Date.now();
      const start = customRange?.start ?? end - 7 * 24 * 3600_000;
      setCustomStartInput(msToLocalInput(start));
      setCustomEndInput(msToLocalInput(end));
    } else {
      setCustomRange(null);
    }
  };

  const applyCustomRange = () => {
    const s = localInputToMs(customStartInput);
    const e = localInputToMs(customEndInput);
    if (s === null || e === null) return;
    setCustomRange({ start: Math.min(s, e), end: Math.max(s, e) });
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* 视觉签名：信号迹线 */}
      <div className="signal-line" aria-hidden="true" />

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* 左侧分类导航（桌面端） */}
        <div className="hidden md:block w-[210px] flex-shrink-0">
          <CategoryNav
            counts={typeCounts}
            active={activeType}
            onChange={setActiveType}
            offlineCount={offlineCount}
          />
        </div>

        {/* 移动端：横排分类条 */}
        <div className="md:hidden shrink-0">
          <CategoryNav
            counts={typeCounts}
            active={activeType}
            onChange={setActiveType}
            offlineCount={offlineCount}
            horizontal
          />
        </div>

        {/* 右侧主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 顶部栏 */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 sm:px-6 py-2 sm:py-3 border-b border-border bg-card">
            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 min-w-0">
              <Link href="/" className="nav-btn">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                返回首页
              </Link>

              <Link href="/history" className="nav-btn">
                历史查询
              </Link>

              <Link href="/alerts" className="nav-btn">
                告警中心
              </Link>

              <Link href="/reports" className="nav-btn">
                报表中心
              </Link>

              <Link href="/tags" className="nav-btn">
                测点主数据
              </Link>

              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                {activeType === 'all' ? '全部传感器' : activeType}
              </h1>
              <span className="text-sm text-muted-foreground flex-shrink-0">
                在线 {onlineData.length} / 共 {latestData.length} 个
                {offlineCount > 0 && (
                  <span className="ml-1" style={{ color: 'var(--danger)' }}>· {offlineCount} 个数据中断</span>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              {/* 连接状态 */}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`status-dot ${connected ? 'online' : 'offline'}`} style={{ width: 7, height: 7 }} />
                {connected ? '实时' : '重连中'}
              </span>

              {/* 搜索 */}
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索测点…"
                className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground w-40 focus:outline-none focus:border-primary"
              />

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
                  onChange={(e) => handleRangeSelect(e.target.value)}
                  className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  {TIME_RANGE_PRESETS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  <option value={CUSTOM_RANGE_VALUE}>自定义</option>
                </select>
              </div>

              {/* 自定义日期区间（选择「自定义」后出现） */}
              {timeRange === CUSTOM_RANGE_VALUE && (
                <div className="flex items-center gap-1">
                  <input
                    type="datetime-local"
                    value={customStartInput}
                    onChange={(e) => setCustomStartInput(e.target.value)}
                    className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">至</span>
                  <input
                    type="datetime-local"
                    value={customEndInput}
                    onChange={(e) => setCustomEndInput(e.target.value)}
                    className="bg-card border border-border-strong rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={applyCustomRange}
                    className="px-2 py-1 rounded text-xs bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  >
                    查询
                  </button>
                </div>
              )}

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
                  const meta = metaMap[sensor.sensor_tag];
                  const displayName = meta?.alias?.trim() || sensor.sensor_tag;
                  const name = meta?.maintenance ? `${displayName} · 检修` : displayName;
                  const unit = meta?.unit?.trim() || UNIT_MAP[sensorType];
                  const rangeRef =
                    meta && meta.range_min !== null && meta.range_max !== null
                      ? { mn: meta.range_min, mx: meta.range_max, av: referenceMap[sensor.sensor_tag]?.av ?? 0 }
                      : referenceMap[sensor.sensor_tag];
                  return (
                    <LazyLoad key={`${sensor.device_id}-${sensor.sensor_tag}`}>
                      <SensorChart
                        name={name}
                        deviceId={sensor.device_id}
                        type={sensorType}
                        data={historyData[`${sensor.device_id}|${sensor.sensor_tag}`] || []}
                        unit={unit}
                        isOnline={online}
                        valueMissing={sensor.value_missing === true && !meta?.maintenance}
                        lastReport={online ? undefined : new Date(sensor.reported_at).toLocaleString('zh-CN')}
                        suspect={meta?.suspect || isSuspectReading(Number(sensor.sensor_value))}
                        reference={rangeRef}
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
