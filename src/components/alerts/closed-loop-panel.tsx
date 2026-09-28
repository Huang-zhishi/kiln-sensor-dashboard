'use client';

// 异常闭环分析：处理率 / 平均处理时长(MTTR) / 根因分类分布 / 处理人工作量 / 按窑体分布
// 数据来源：/api/anomalies/stats（anomaly_events + 统一处理记录）

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface CategoryStat {
  key: string;
  label: string;
  color: string;
  count: number;
}
interface NamedStat {
  name: string;
  count: number;
}
interface KilnStat {
  kiln_id: string;
  total: number;
  handled: number;
}
interface DayStat {
  date: string;
  total: number;
  handled: number;
}
interface ClosedLoopStats {
  window_hours: number;
  total: number;
  handled: number;
  unhandled: number;
  handling_rate: number;
  avg_mttr_minutes: number | null;
  mttr_sample: number;
  by_category: CategoryStat[];
  by_handler: NamedStat[];
  by_kiln: KilnStat[];
  daily: DayStat[];
}

const WINDOWS = [
  { value: 24, label: '24 小时' },
  { value: 168, label: '7 天' },
  { value: 720, label: '30 天' },
];

function fmtMttr(min: number | null): string {
  if (min === null || !isFinite(min)) return '--';
  if (min < 60) return `${min.toFixed(0)} 分钟`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)} 小时`;
  return `${(h / 24).toFixed(1)} 天`;
}

function Card({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: color || 'var(--foreground)' }}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 truncate flex-shrink-0" title={label}>{label}</span>
      <div className="flex-1 h-3 rounded bg-card-hover overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-10 text-right tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

export function ClosedLoopPanel() {
  const [hours, setHours] = useState(168);
  const [stats, setStats] = useState<ClosedLoopStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (h: number) => {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch(`/api/anomalies/stats?hours=${h}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '统计读取失败');
      setStats(j as ClosedLoopStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '统计读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  const pushWeekly = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/reports/closed-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'weekly', hours: 168 }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '推送失败');
      setMsg(j.notify === 'sent' ? '周报已推送企业微信' : j.notify === 'skipped' ? '未配置企业微信 Webhook，未推送' : '推送失败');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '推送失败');
    } finally {
      setBusy(false);
    }
  }, []);

  const scanEscalation = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/reports/closed-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'escalation' }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '扫描失败');
      setMsg('超时扫描完成（超阈值事件已推送企微）');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '扫描失败');
    } finally {
      setBusy(false);
    }
  }, []);

  const rate = stats ? Math.round(stats.handling_rate * 100) : 0;
  const catTotal = stats ? stats.by_category.reduce((s, c) => s + c.count, 0) : 0;
  const handlerTotal = stats ? stats.by_handler.reduce((s, c) => s + c.count, 0) : 0;
  const maxDaily = stats ? Math.max(1, ...stats.daily.map((d) => d.total)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">统计区间</span>
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            onClick={() => setHours(w.value)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              hours === w.value ? 'bg-primary/15 border-primary text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground'
            }`}
          >
            {w.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
          <button
            onClick={pushWeekly}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover disabled:opacity-50 transition-colors"
          >
            推送周报
          </button>
          <button
            onClick={scanEscalation}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover disabled:opacity-50 transition-colors"
          >
            扫描超时
          </button>
        </div>
      </div>

      {error && (
        <div className="panel px-4 py-2 text-xs" style={{ borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)', color: 'var(--warning)' }}>
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded panel animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card label="异常事件" value={String(stats.total)} />
            <Card label="已处理" value={String(stats.handled)} color="var(--success)" />
            <Card label="未处理" value={String(stats.unhandled)} color={stats.unhandled > 0 ? 'var(--danger)' : undefined} />
            <Card label="处理率" value={`${rate}%`} color={rate >= 90 ? 'var(--success)' : rate >= 60 ? 'var(--warning)' : 'var(--danger)'} />
            <Card
              label="平均处理时长"
              value={fmtMttr(stats.avg_mttr_minutes)}
              hint={stats.mttr_sample > 0 ? `基于 ${stats.mttr_sample} 条记录` : '暂无样本'}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="panel p-4">
              <h3 className="text-sm font-medium mb-3">根因分类分布</h3>
              {stats.by_category.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">区间内暂无已处理记录</div>
              ) : (
                <div className="space-y-2">
                  {stats.by_category.map((c) => (
                    <BarRow key={c.key} label={c.label} count={c.count} total={catTotal} color={c.color} />
                  ))}
                </div>
              )}
            </div>

            <div className="panel p-4">
              <h3 className="text-sm font-medium mb-3">处理人工作量</h3>
              {stats.by_handler.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">区间内暂无处理记录</div>
              ) : (
                <div className="space-y-2">
                  {stats.by_handler.map((h) => (
                    <BarRow key={h.name} label={h.name} count={h.count} total={handlerTotal} color="var(--info)" />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="panel p-4">
              <h3 className="text-sm font-medium mb-3">按窑体闭环情况</h3>
              {stats.by_kiln.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">区间内暂无异常</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      {['窑体', '异常数', '已处理', '处理率'].map((h) => (
                        <th key={h} className="text-left font-normal py-1.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.by_kiln.map((k) => (
                      <tr key={k.kiln_id} className="border-t border-border/60">
                        <td className="py-1.5">{k.kiln_id}</td>
                        <td className="py-1.5 tabular-nums">{k.total}</td>
                        <td className="py-1.5 tabular-nums">{k.handled}</td>
                        <td className="py-1.5 tabular-nums" style={{ color: k.handled === k.total ? 'var(--success)' : 'var(--warning)' }}>
                          {k.total > 0 ? Math.round((k.handled / k.total) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="panel p-4">
              <h3 className="text-sm font-medium mb-3">每日趋势（总数 / 已处理）</h3>
              {stats.daily.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">区间内暂无异常</div>
              ) : (
                <div className="flex items-end gap-1.5 h-40">
                  {stats.daily.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${d.date}　共 ${d.total} 条，已处理 ${d.handled} 条`}>
                      <div className="w-full flex flex-col justify-end" style={{ height: `${(d.total / maxDaily) * 120}px` }}>
                        <div className="w-full" style={{ height: `${d.total > 0 ? (d.handled / d.total) * 100 : 0}%`, background: 'var(--success)' }} />
                        <div className="w-full flex-1" style={{ background: 'color-mix(in srgb, var(--danger) 45%, transparent)' }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
