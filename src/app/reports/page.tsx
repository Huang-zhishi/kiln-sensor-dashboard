'use client';

// 报表中心：按周期（今日/昨日/白班/夜班/近7天/自定义）汇总每个测点的
// 最小值/最大值/平均值/记录数/告警次数，支持 CSV 导出。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { localInputToMs, msToLocalInput } from '@/lib/time-range';
import { SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface ReportItem {
  sensor_tag: string;
  display_name: string;
  type: string;
  unit: string;
  kiln_id: string;
  device_id: string;
  count: number;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  alert_count: number;
}

interface ReportWindow {
  kind: string;
  label: string;
  start: number;
  end: number;
}

const KINDS = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'day', label: '白班 08-20' },
  { value: 'night', label: '夜班 20-08' },
  { value: '7d', label: '近 7 天' },
  { value: 'custom', label: '自定义' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmt(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportsPage() {
  const [kind, setKind] = useState('today');
  const [kilnId, setKilnId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startInput, setStartInput] = useState(() => msToLocalInput(Date.now() - 24 * 3600_000));
  const [endInput, setEndInput] = useState(() => msToLocalInput(Date.now()));
  const [items, setItems] = useState<ReportItem[]>([]);
  const [win, setWin] = useState<ReportWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const query = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ kind });
      if (kilnId) params.set('kiln_id', kilnId);
      if (typeFilter) params.set('type', typeFilter);
      if (kind === 'custom') {
        const s = localInputToMs(startInput);
        const e = localInputToMs(endInput);
        if (s === null || e === null) {
          setError('自定义时间无效');
          setLoading(false);
          return;
        }
        params.set('start', String(Math.min(s, e)));
        params.set('end', String(Math.max(s, e)));
      }
      const r = await apiFetch(`/api/reports?${params.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '报表生成失败');
      setItems(j.items || []);
      setWin(j.window || null);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : '报表生成失败');
    } finally {
      setLoading(false);
    }
  }, [kind, kilnId, typeFilter, startInput, endInput]);

  useEffect(() => {
    void query();
    // 周期/筛选变化自动查询
  }, [query]);

  const totals = useMemo(() => {
    let records = 0;
    let alerts = 0;
    for (const i of items) {
      records += i.count;
      alerts += i.alert_count;
    }
    return { records, alerts, sensors: items.length };
  }, [items]);

  const exportCsv = () => {
    if (!items.length) return;
    const header = ['测点', '类型', '单位', '窑体', '设备', '记录数', '最小', '最大', '平均', '告警次数'];
    const body = items.map((i) => [
      i.display_name || i.sensor_tag,
      i.type,
      i.unit,
      i.kiln_id,
      i.device_id,
      i.count,
      i.min_value ?? '',
      i.max_value ?? '',
      i.avg_value === null ? '' : Number(i.avg_value).toFixed(2),
      i.alert_count,
    ]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `报表_${win?.label || kind}_${fmt(win?.start ?? Date.now()).replace(/[: ]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const types = ['温度', '压力', '流量', '阀位', '液位', '成分检测', 'pH值', '电流', '开关', '其他'];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="signal-line" aria-hidden="true" />

      <header className="border-b border-border bg-card px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
          <Link href="/" className="nav-btn">
            返回首页
          </Link>
          <h1 className="text-base sm:text-lg font-semibold">报表中心</h1>
          {win && (
            <span className="text-xs text-muted-foreground">
              {win.label} · {fmt(win.start)} ~ {fmt(win.end)} · 测点 {totals.sensors} · 记录 {totals.records.toLocaleString()} · 告警 {totals.alerts}
            </span>
          )}
        </div>
        <button onClick={exportCsv} disabled={!items.length} className="nav-btn bg-primary/20 border-primary hover:bg-primary/30 disabled:opacity-50">
          导出 CSV
        </button>
      </header>

      <main className="flex-1 p-3 sm:p-4 space-y-3 overflow-hidden">
        <div className="panel p-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">周期</div>
            <div className="flex flex-wrap gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => setKind(k.value)}
                  className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${kind === k.value ? 'bg-primary/15 border-primary text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground'}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {kind === 'custom' && (
            <div className="flex items-end gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">开始</div>
                <input type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} className="bg-card border border-border-strong rounded px-2 py-1.5 text-xs text-foreground" />
              </div>
              <span className="text-muted-foreground text-xs pb-2">至</span>
              <div>
                <div className="text-xs text-muted-foreground mb-1">结束</div>
                <input type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} className="bg-card border border-border-strong rounded px-2 py-1.5 text-xs text-foreground" />
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-muted-foreground mb-1">窑体</div>
            <select value={kilnId} onChange={(e) => setKilnId(e.target.value)} className="bg-card border border-border-strong rounded px-2 py-1.5 text-xs text-foreground">
              <option value="">全部</option>
              <option value="1#">1#</option>
              <option value="2#">2#</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">类型</div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-card border border-border-strong rounded px-2 py-1.5 text-xs text-foreground">
              <option value="">全部</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={() => void query()} disabled={loading} className="px-3 py-1.5 rounded text-xs bg-card border border-border-strong text-foreground hover:bg-card-hover disabled:opacity-50">
            {loading ? '生成中…' : '生成报表'}
          </button>
        </div>

        {error && <div className="panel px-4 py-2 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="panel overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-260px)]">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="sticky top-0 bg-card text-muted-foreground z-10">
                <tr>
                  {['测点', '类型', '窑体', '设备', '记录数', '最小', '最大', '平均', '告警次数'].map((h) => (
                    <th key={h} className="text-left font-normal px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.device_id}|${i.sensor_tag}`} className="border-t border-border/60 hover:bg-card-hover">
                    <td className="px-3 py-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: SENSOR_TYPE_COLORS[i.type as SensorType] || '#8b96a6' }} />
                      {i.display_name}
                      {i.display_name !== i.sensor_tag && <span className="ml-1 text-muted-foreground">({i.sensor_tag})</span>}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{i.type}</td>
                    <td className="px-3 py-1.5">{i.kiln_id}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{i.device_id}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{i.count.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{i.min_value === null ? '--' : Number(i.min_value).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{i.max_value === null ? '--' : Number(i.max_value).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{i.avg_value === null ? '--' : Number(i.avg_value).toFixed(2)} {i.unit}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: i.alert_count > 0 ? 'var(--danger)' : 'var(--muted-foreground)' }}>{i.alert_count}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">该周期无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
