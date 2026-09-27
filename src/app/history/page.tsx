'use client';

// 单测点历史查询页
// 选择任意一个测点 + 指定日期 / 时间段，查询该区间内的历史趋势。
// 典型用法：测点 1#窑体温度TI_206F，日期 2026-09-15 → 查看当天完整趋势。
//
// 数据走 /api/sensors/history（自定义区间 start/end，epoch 毫秒，规避时区问题），
// 聚合间隔由服务端按跨度自动选择（返回体带 interval）。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import { EChart } from '@/components/charts/echarts';
import { SensorPicker, type SensorOption } from '@/components/history/sensor-picker';
import { classifySensor, SENSOR_TYPE_COLORS, UNIT_MAP, type SensorType } from '@/lib/sensor-classifier';
import { intervalLabel, localInputToMs } from '@/lib/time-range';

interface HistoryPoint {
  device_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
}

interface QueryMeta {
  interval: string;
  start: number;
  end: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期（YYYY-MM-DD）→ 当天 00:00:00 ~ 23:59:59.999 的 epoch 毫秒 */
function dayToWindow(dateStr: string): { start: number; end: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(y, mo, d, 0, 0, 0, 0).getTime();
  const end = new Date(y, mo, d, 23, 59, 59, 999).getTime();
  if (!isFinite(start) || !isFinite(end)) return null;
  return { start, end };
}

function parseDate(iso: string): Date {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return new Date(normalized);
}

function fmtDateTime(iso: string): string {
  const d = parseDate(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtAxis(iso: string): string {
  const d = parseDate(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 点击输入框任意位置即弹出原生日期/时间选择器（默认只有点右侧图标才会弹）
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    // 部分浏览器不支持 showPicker 或非用户手势时抛错，忽略即可（退回原生行为）
  }
}

export default function HistoryPage() {
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(true);
  const [selected, setSelected] = useState<SensorOption | null>(null);

  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [day, setDay] = useState<string>(() => todayStr());
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [meta, setMeta] = useState<QueryMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  // 测点列表（含类型/单位）+ URL 深链参数
  useEffect(() => {
    let cancelled = false;
    fetch('/api/sensors/list')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const list: SensorOption[] = (j?.data || []).filter(
          (o: SensorOption) => o.sensor_tag && o.sensor_tag.trim(),
        );
        setSensors(list);
        setLoadingSensors(false);

        const sp = new URLSearchParams(window.location.search);
        const tag = sp.get('tag');
        const date = sp.get('date');
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setDay(date);
        const start = sp.get('start');
        const end = sp.get('end');
        if (start && end) {
          setMode('range');
          setRangeStart(start);
          setRangeEnd(end);
        }
        if (tag) {
          const found = list.find((o) => o.sensor_tag === tag);
          if (found) setSelected(found);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingSensors(false);
          setError('测点列表加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doQuery = useCallback(async () => {
    if (!selected) return;
    let win: { start: number; end: number } | null;
    if (mode === 'day') {
      win = dayToWindow(day);
    } else {
      const s = localInputToMs(rangeStart);
      const e = localInputToMs(rangeEnd);
      win = s !== null && e !== null ? { start: Math.min(s, e), end: Math.max(s, e) } : null;
    }
    if (!win) {
      setError('时间范围无效，请检查起止时间');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        sensor_tag: selected.sensor_tag,
        time_range: 'custom',
        start: String(win.start),
        end: String(win.end),
      });
      const r = await fetch(`/api/sensors/history?${params.toString()}`);
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error || '查询失败');
      const rows: HistoryPoint[] = (j.data || []).filter(
        (p: HistoryPoint) => p && p.sensor_value !== null && p.sensor_value !== undefined && isFinite(Number(p.sensor_value)),
      );
      rows.sort((a, b) => parseDate(a.reported_at).getTime() - parseDate(b.reported_at).getTime());
      setPoints(rows);
      setMeta({ interval: j.interval || '', start: Number(j.start) || win.start, end: Number(j.end) || win.end });
    } catch (e) {
      setPoints([]);
      setMeta(null);
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }, [selected, mode, day, rangeStart, rangeEnd]);

  // 切换测点自动查询；日期/时间段改动由「查询」按钮触发
  useEffect(() => {
    if (selected) void doQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const sensorType: SensorType = selected ? classifySensor(selected.sensor_tag) : '其他';
  const unit = selected?.unit || UNIT_MAP[sensorType] || '';
  const isSwitch = sensorType === '开关';

  const stats = useMemo(() => {
    if (!points.length) return null;
    let mn = Infinity;
    let mx = -Infinity;
    let sum = 0;
    for (const p of points) {
      const v = Number(p.sensor_value);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
    }
    return { mn, mx, avg: sum / points.length, count: points.length };
  }, [points]);

  const chartOption = useMemo<EChartsOption>(() => {
    const color = SENSOR_TYPE_COLORS[sensorType] || '#33a2e5';
    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 16, right: 20, bottom: 64, left: 60 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#14181f',
        borderColor: 'rgba(155,170,192,0.24)',
        borderRadius: 3,
        textStyle: { fontSize: 12, color: '#e8edf4' },
        formatter: (params: unknown) => {
          const arr = params as Array<{ dataIndex: number }>;
          const idx = arr?.[0]?.dataIndex ?? 0;
          const p = points[idx];
          if (!p) return '';
          const val = isSwitch ? (Number(p.sensor_value) >= 0.5 ? '开' : '关') : `${Number(p.sensor_value).toFixed(2)} ${unit}`;
          return `${fmtDateTime(p.reported_at)}<br/><b>${val}</b>`;
        },
      },
      xAxis: {
        type: 'category',
        data: points.map((p) => fmtAxis(p.reported_at)),
        axisLine: { lineStyle: { color: 'rgba(155,170,192,0.2)' } },
        axisLabel: { color: '#8b96a6', fontSize: 10, hideOverlap: true },
      },
      yAxis: isSwitch
        ? {
            type: 'value',
            min: -0.5,
            max: 1.5,
            interval: 0.5,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: 'rgba(155,170,192,0.1)', type: 'dashed' } },
            axisLabel: { color: '#8b96a6', fontSize: 10, formatter: (v: number) => (v === 0 ? '关' : v === 1 ? '开' : '') },
          }
        : {
            type: 'value',
            scale: true,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: 'rgba(155,170,192,0.1)', type: 'dashed' } },
            axisLabel: { color: '#8b96a6', fontSize: 10, formatter: (v: number) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2)) },
          },
      dataZoom: [
        { type: 'inside', throttle: 50 },
        { type: 'slider', height: 18, bottom: 12, borderColor: 'rgba(155,170,192,0.2)', textStyle: { color: '#8b96a6', fontSize: 9 } },
      ],
      series: [
        {
          name: selected?.sensor_tag || '',
          type: 'line',
          step: isSwitch ? 'end' : false,
          showSymbol: points.length <= 80,
          symbolSize: 4,
          data: points.map((p) => Number(p.sensor_value)),
          lineStyle: { width: 1.8, color },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}33` },
                { offset: 1, color: `${color}00` },
              ],
            },
          },
        },
      ],
    };
  }, [points, sensorType, unit, isSwitch, selected]);

  const exportCsv = () => {
    if (!selected || !points.length) return;
    const header = 'reported_at,sensor_tag,sensor_value,unit\n';
    const body = points
      .map((p) => `${fmtDateTime(p.reported_at)},${selected.sensor_tag},${p.sensor_value},${unit}`)
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.sensor_tag}_${fmtDateTime(points[0].reported_at).slice(0, 10)}_${fmtDateTime(points[points.length - 1].reported_at).slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="signal-line" aria-hidden="true" />

      {/* 顶部栏 */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-4">
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
          <h1 className="text-lg font-semibold text-foreground truncate">测点历史查询</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            选择单个测点与时间段，查看历史趋势
          </span>
        </div>
        <Link
          href="/sensors"
          className="px-3 py-1.5 bg-card hover:bg-card-hover border border-border-strong rounded text-sm text-foreground transition-colors flex-shrink-0"
        >
          传感器总览
        </Link>
      </header>

      <main className="flex-1 p-4 space-y-3">
        {/* 查询条件 */}
        <div className="panel p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-5">
              <label className="block text-xs text-muted-foreground mb-1">测点</label>
              <SensorPicker options={sensors} value={selected} onChange={setSelected} loading={loadingSensors} />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">时间方式</label>
              <div className="flex rounded border border-border-strong overflow-hidden">
                <button
                  onClick={() => setMode('day')}
                  className={`flex-1 px-2 py-2 text-xs transition-colors ${
                    mode === 'day' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  按天
                </button>
                <button
                  onClick={() => setMode('range')}
                  className={`flex-1 px-2 py-2 text-xs transition-colors ${
                    mode === 'range' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  时间段
                </button>
              </div>
            </div>

            <div className="lg:col-span-4">
              <label className="block text-xs text-muted-foreground mb-1">
                {mode === 'day' ? '日期' : '起止时间'}
              </label>
              {mode === 'day' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={day}
                    max={todayStr()}
                    onClick={openPicker}
                    onChange={(e) => setDay(e.target.value)}
                    className="flex-1 bg-card border border-border-strong rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer"
                  />
                  <button
                    onClick={() => setDay(todayStr())}
                    className="px-2 py-2 text-xs rounded border border-border-strong text-muted-foreground hover:text-foreground transition-colors"
                  >
                    今天
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                    }}
                    className="px-2 py-2 text-xs rounded border border-border-strong text-muted-foreground hover:text-foreground transition-colors"
                  >
                    昨天
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={rangeStart}
                    onClick={openPicker}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="flex-1 bg-card border border-border-strong rounded px-2 py-2 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                  />
                  <span className="text-muted-foreground text-xs">至</span>
                  <input
                    type="datetime-local"
                    value={rangeEnd}
                    onClick={openPicker}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="flex-1 bg-card border border-border-strong rounded px-2 py-2 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="lg:col-span-1 flex gap-2">
              <button
                onClick={() => void doQuery()}
                disabled={!selected || loading}
                className="w-full px-3 py-2 rounded text-sm font-medium bg-primary/20 border border-primary text-foreground hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '查询中' : '查询'}
              </button>
            </div>
          </div>

          {/* 常用测点快捷入口（仅显示数据源中真实存在的测点） */}
          {(() => {
            const quickTags = ['1#窑体温度TI_206A', '1#窑体温度TI_206B', '1#窑体温度TI_206F'];
            const available = quickTags.filter((tag) => sensors.some((o) => o.sensor_tag === tag));
            if (!available.length) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>快捷：</span>
                {available.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      const found = sensors.find((o) => o.sensor_tag === tag);
                      if (found) setSelected(found);
                    }}
                    className="px-2 py-0.5 rounded-full border border-border-strong hover:text-foreground hover:border-border-strong transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {error && (
          <div className="panel px-4 py-2 text-xs" style={{ borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {/* 结果 */}
        <div className="panel p-4">
          {!selected ? (
            <div className="empty-state h-[420px]">
              <span className="text-sm">请选择要查询的测点</span>
              <span className="empty-hint">在上方搜索框输入测点名（如 206F），再选择日期或时间段查看趋势。</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full" style={{ background: SENSOR_TYPE_COLORS[sensorType] || '#8b96a6' }} />
                  <span className="text-sm font-medium text-foreground truncate">{selected.sensor_tag}</span>
                  <span className="text-xs text-muted-foreground">{sensorType}{unit ? ` · ${unit}` : ''}</span>
                  {meta?.interval && <span className="text-[11px] text-muted-foreground">聚合 {intervalLabel(meta.interval)}</span>}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  {stats && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                      <span>点数 <b className="text-foreground">{stats.count}</b></span>
                      <span>最小 <b className="text-foreground">{isSwitch ? (stats.mn >= 0.5 ? '开' : '关') : stats.mn.toFixed(2)}</b></span>
                      <span>最大 <b className="text-foreground">{isSwitch ? (stats.mx >= 0.5 ? '开' : '关') : stats.mx.toFixed(2)}</b></span>
                      <span>平均 <b className="text-foreground">{isSwitch ? '--' : stats.avg.toFixed(2)}</b></span>
                    </div>
                  )}
                  <button
                    onClick={exportCsv}
                    disabled={!points.length}
                    className="px-2.5 py-1.5 rounded text-xs bg-card border border-border-strong text-foreground hover:bg-card-hover transition-colors disabled:opacity-50"
                  >
                    导出 CSV
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="empty-state h-[420px]">
                  <span className="text-sm">查询中…</span>
                </div>
              ) : points.length === 0 ? (
                <div className="empty-state h-[420px]">
                  <span className="text-sm">该时间段暂无数据</span>
                  <span className="empty-hint">该测点在此区间内没有上报记录，可换日期或测点重试。</span>
                </div>
              ) : (
                <EChart option={chartOption} style={{ width: '100%', height: 420 }} />
              )}

              {points.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowTable((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showTable ? '收起数据明细' : `展开数据明细（${points.length} 条）`}
                  </button>
                  {showTable && (
                    <div className="mt-2 max-h-72 overflow-y-auto rounded border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-card">
                          <tr className="text-muted-foreground">
                            <th className="text-left px-3 py-1.5 font-normal">时间</th>
                            <th className="text-right px-3 py-1.5 font-normal">数值{unit ? ` (${unit})` : ''}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((p, i) => (
                            <tr key={`${p.reported_at}-${i}`} className="border-t border-border/60">
                              <td className="px-3 py-1 font-mono text-foreground">{fmtDateTime(p.reported_at)}</td>
                              <td className="px-3 py-1 text-right font-mono text-foreground">
                                {isSwitch ? (Number(p.sensor_value) >= 0.5 ? '开' : '关') : Number(p.sensor_value).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
