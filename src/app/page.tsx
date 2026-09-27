'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { StatCards } from '@/components/dashboard/stat-cards';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { KilnOverview } from '@/components/dashboard/kiln-overview';
import { OfflinePanel } from '@/components/dashboard/offline-panel';
import { AnomalyList, type AnomalyItem, type AnomalyFilters } from '@/components/dashboard/anomaly-list';
import { AnomalyDetailDrawer } from '@/components/dashboard/anomaly-detail-drawer';
import { DashboardSkeleton } from '@/components/dashboard/panel-skeleton';
import { CUSTOM_RANGE_VALUE } from '@/lib/time-range';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  value_missing?: boolean;
  no_data_since?: string | null;
  maintenance?: boolean;
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

const DEFAULT_TREND_TAGS = [
  '1#窑体温度TI_206A',
  '1#窑体温度TI_206B',
  '1#窑体温度TI_206F',
  '1#窑体温度TI_206E',
];

const ANOMALY_REFRESH_MS = 30000;
const DEFAULT_ANOMALY_FILTERS: AnomalyFilters = { hours: 168, direction: '', onlyReport: false, status: '' };

// 新异常声音提醒：WebAudio 合成短促提示音（无需音频资源）
function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.47);
    osc.onended = () => ctx.close();
  } catch {
    // 浏览器限制自动播放时静默失败
  }
}

export default function DashboardPage() {
  const [latestData, setLatestData] = useState<SensorData[]>([]);
  const [historyData, setHistoryData] = useState<SensorData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [filters, setFilters] = useState({ kiln_id: '' });
  const [timeRange, setTimeRange] = useState('1h');
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedTrendTags, setSelectedTrendTags] = useState<string[]>(DEFAULT_TREND_TAGS);

  // 异常记录
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyItem | null>(null);
  const [anomalyFilters, setAnomalyFilters] = useState<AnomalyFilters>(DEFAULT_ANOMALY_FILTERS);
  const [unreadKeys, setUnreadKeys] = useState<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [anomaliesError, setAnomaliesError] = useState(false);
  const [agentChatUrl, setAgentChatUrl] = useState('');

  // 已出现过的 event_key / 上次筛选指纹（避免切换筛选时误报“新异常”）
  const knownKeysRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const lastFilterKeyRef = useRef('');
  const soundOnRef = useRef(true);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('anomaly_sound') : null;
    if (saved === 'off') setSoundOn(false);
  }, []);
  useEffect(() => {
    soundOnRef.current = soundOn;
    if (typeof window !== 'undefined') window.localStorage.setItem('anomaly_sound', soundOn ? 'on' : 'off');
  }, [soundOn]);

  // 运行时前端配置（Agent 对话入口 URL）
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((j) => setAgentChatUrl(j.agentChatUrl || ''))
      .catch(() => {});
  }, []);

  const candidates = stats?.sensorTags.map((t) => t.sensor_tag) || [];
  const effectiveTrendTags = useMemo(() => {
    if (selectedTrendTags.length === 0) return [];
    const valid = selectedTrendTags.filter((t) => candidates.includes(t));
    return valid.length > 0 ? valid : candidates.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrendTags, stats]);
  const trendTagsKey = effectiveTrendTags.join(',');

  const [connNonce, setConnNonce] = useState(0);
  const [connected, setConnected] = useState(false);

  const handleTimeRangeChange = useCallback((range: string) => {
    setTimeRange(range);
    // 切回预设时清除自定义区间，避免残留参数继续生效
    if (range !== CUSTOM_RANGE_VALUE) setCustomRange(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('time_range', timeRange);
    if (customRange) {
      params.set('start', String(customRange.start));
      params.set('end', String(customRange.end));
    }
    if (filters.kiln_id) params.set('kiln_id', filters.kiln_id);
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
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [filters, timeRange, customRange, trendTagsKey, connNonce]);

  // 异常记录拉取（30s 轮询 + 筛选变化即时刷新）
  const loadAnomalies = useCallback(async () => {
    const q = new URLSearchParams();
    q.set('hours', String(anomalyFilters.hours));
    q.set('limit', '100');
    if (anomalyFilters.direction) q.set('direction', anomalyFilters.direction);
    if (anomalyFilters.onlyReport) q.set('only_report', '1');
    if (anomalyFilters.status) q.set('status', anomalyFilters.status);
    try {
      const r = await fetch(`/api/anomalies?${q}`);
      const j = await r.json();
      const items: AnomalyItem[] = Array.isArray(j.items) ? j.items : [];

      // 新异常检测（仅在筛选条件未变化时提示，避免切换筛选误报）
      const filterKey = `${anomalyFilters.hours}|${anomalyFilters.direction}|${anomalyFilters.onlyReport}|${anomalyFilters.status}`;
      const filterChanged = lastFilterKeyRef.current !== filterKey;
      lastFilterKeyRef.current = filterKey;
      const fresh: string[] = [];
      for (const it of items) {
        if (!knownKeysRef.current.has(it.event_key)) {
          knownKeysRef.current.add(it.event_key);
          if (it.status !== 'acked') fresh.push(it.event_key);
        }
      }
      if (!firstLoadRef.current && !filterChanged && fresh.length > 0) {
        setUnreadKeys((prev) => new Set([...prev, ...fresh]));
        if (soundOnRef.current) playAlertBeep();
      }
      firstLoadRef.current = false;

      setAnomalies(items);
      setAnomaliesError(false);
    } catch {
      // 保留上一次结果，但标记错误供页面提示
      setAnomaliesError(true);
    } finally {
      setAnomaliesLoading(false);
    }
  }, [anomalyFilters]);

  useEffect(() => {
    loadAnomalies();
    const timer = setInterval(loadAnomalies, ANOMALY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadAnomalies, reloadNonce]);

  const handleRefresh = useMemo(() => () => setConnNonce((n) => n + 1), []);

  // 数据新鲜度：最新一次上报时间（页头据此显示延迟）
  const latestReportedAt = useMemo(() => {
    let max = 0;
    for (const d of latestData) {
      const t = new Date(d.reported_at).getTime();
      if (isFinite(t) && t > max) max = t;
    }
    return max ? new Date(max).toISOString() : null;
  }, [latestData]);

  const handleSelectAnomaly = useCallback((item: AnomalyItem) => {
    setSelectedAnomaly(item);
    setUnreadKeys((prev) => {
      if (!prev.has(item.event_key)) return prev;
      const next = new Set(prev);
      next.delete(item.event_key);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader
        lastUpdate={lastUpdate}
        onRefresh={handleRefresh}
        loading={loading}
        connected={connected}
        latestReportedAt={latestReportedAt}
      />

      {loading && latestData.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <div className="px-4 pb-6 space-y-3">
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            kilns={stats?.kilns.map((k) => k.kiln_id) || []}
          />

          <StatCards data={latestData} stats={stats} anomalyCount={anomalies.length} />

          {(!connected || anomaliesError) && (
            <div
              className="panel px-4 py-2 text-xs flex items-center gap-2"
              style={{ borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)' }}
            >
              <span className="status-dot warning" style={{ width: 8, height: 8 }} />
              <span style={{ color: 'var(--warning)' }}>
                {!connected ? '实时连接已断开，正在自动重连…' : '异常记录接口暂时不可用，正在重试…'}
              </span>
              <span className="text-muted-foreground">页面展示为最近一次成功获取的数据。</span>
            </div>
          )}

          <div className="grid grid-cols-12 gap-3 lg:h-[clamp(460px,60vh,760px)] lg:grid-rows-[minmax(0,1fr)]">
            {/* 左：窑体概览 + 数据中断 */}
            <div className="col-span-12 h-[520px] min-h-0 lg:col-span-3 lg:h-auto flex flex-col gap-3">
              <div className="flex-1 min-h-0">
                <KilnOverview data={latestData} stats={stats} />
              </div>
              <div className="flex-1 min-h-0">
                <OfflinePanel data={latestData} />
              </div>
            </div>

            {/* 中：趋势图（黄金区） */}
            <div className="col-span-12 h-[440px] min-h-0 lg:col-span-6 lg:h-auto">
              <TrendChart
                data={historyData}
                timeRange={timeRange}
                onTimeRangeChange={handleTimeRangeChange}
                customRange={customRange}
                onCustomRangeChange={setCustomRange}
                defaultTags={DEFAULT_TREND_TAGS}
                selectedTags={effectiveTrendTags}
                onSelectedTagsChange={setSelectedTrendTags}
                candidateTags={candidates}
                anomalies={anomalies}
              />
            </div>

            {/* 右：异常记录 */}
            <div className="col-span-12 h-[520px] min-h-0 lg:col-span-3 lg:h-auto">
              <AnomalyList
                items={anomalies}
                loading={anomaliesLoading}
                selectedKey={selectedAnomaly?.event_key || null}
                onSelect={handleSelectAnomaly}
                filters={anomalyFilters}
                onFiltersChange={setAnomalyFilters}
                unreadCount={unreadKeys.size}
                onClearUnread={() => setUnreadKeys(new Set())}
                soundOn={soundOn}
                onToggleSound={() => setSoundOn((v) => !v)}
              />
            </div>
          </div>
        </div>
      )}

      <AnomalyDetailDrawer
        eventKey={selectedAnomaly?.event_key || null}
        summary={selectedAnomaly}
        onClose={() => setSelectedAnomaly(null)}
        onStatusChange={handleStatusChange}
        agentChatUrl={agentChatUrl}
      />
    </div>
  );
}
