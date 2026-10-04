'use client';

// 极值基线：可视化 + 可回溯 + 人工修正
// 背景：极值基线由 Agent 自动推进；若毛刺/坏值把基线带偏，此前无法改回。
// 本页通过 /api/extreme/*（服务端代理 Agent）提供：
//   基线列表、变更历史（审计）、人工修正、按历史统计重置、撤销最近变更、最近突破事件。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface Baseline {
  sensor_tag: string;
  min_val: number | null;
  max_val: number | null;
  updated_at: string;
}

interface BaselineLog {
  id: number;
  sensor_tag: string;
  prev_min: number | null;
  prev_max: number | null;
  min_val: number | null;
  max_val: number | null;
  source: string;
  event_id: number | null;
  operator: string | null;
  reason: string | null;
  created_at: string;
}

interface ExtremeEvent {
  id: number;
  ts: string;
  device_id: string;
  sensor_tag: string;
  value: number;
  baseline_min: number | null;
  baseline_max: number | null;
  direction: string;
}

const SOURCE_LABEL: Record<string, string> = { event: '突破事件', prime: '首扫校准', manual: '人工修正' };
const SOURCE_STYLE: Record<string, string> = {
  event: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  prime: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  manual: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmtTime(v?: string | null): string {
  if (!v) return '--';
  const d = new Date(v);
  if (!isFinite(d.getTime())) return String(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtBound(v: number | null | undefined): string {
  return v === null || v === undefined ? '不限' : String(v);
}
function srcLabel(s?: string | null): string {
  return SOURCE_LABEL[s || ''] || s || '-';
}
function srcStyle(s?: string | null): string {
  return SOURCE_STYLE[s || ''] || 'bg-muted text-muted-foreground border-border';
}

async function callJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as { detail?: string; error?: string } | null;
    throw new Error(b?.detail || b?.error || `HTTP ${res.status}`);
  }
  return body as T;
}

export default function ExtremeBaselinePage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Baseline[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const data = await callJson<{ total: number; items: Baseline[] }>(
        `/api/extreme/baselines?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=${offset}`,
      );
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setNotice({ kind: 'err', text: `加载失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  // ---- 变更历史 ----
  const [historyTag, setHistoryTag] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<BaselineLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  async function openHistory(row: Baseline) {
    setHistoryTag(row.sensor_tag);
    setHistoryLoading(true);
    try {
      const data = await callJson<{ items: BaselineLog[] }>(
        `/api/extreme/history?sensor_tag=${encodeURIComponent(row.sensor_tag)}&limit=200`,
      );
      setHistoryItems(data.items || []);
    } catch (e) {
      setNotice({ kind: 'err', text: `历史加载失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setHistoryLoading(false);
    }
  }

  // ---- 人工修正 ----
  const [editRow, setEditRow] = useState<Baseline | null>(null);
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  function openEdit(row: Baseline) {
    setEditRow(row);
    setEditMin(row.min_val === null ? '' : String(row.min_val));
    setEditMax(row.max_val === null ? '' : String(row.max_val));
    setEditReason('');
  }
  async function submitEdit() {
    if (!editRow) return;
    let minVal: number | null = null;
    let maxVal: number | null = null;
    if (editMin !== '') {
      minVal = Number(editMin);
      if (Number.isNaN(minVal)) return void setNotice({ kind: 'err', text: '最小值必须是数字或留空' });
    }
    if (editMax !== '') {
      maxVal = Number(editMax);
      if (Number.isNaN(maxVal)) return void setNotice({ kind: 'err', text: '最大值必须是数字或留空' });
    }
    setSaving(true);
    try {
      await callJson('/api/extreme/baselines/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_tag: editRow.sensor_tag, min_val: minVal, max_val: maxVal, reason: editReason }),
      });
      setEditRow(null);
      setNotice({ kind: 'ok', text: '已修正基线（已记录审计）' });
      void load();
    } catch (e) {
      setNotice({ kind: 'err', text: `修正失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  async function resetFromStats(row: Baseline) {
    if (!window.confirm(`按 TDengine 历史统计重算「${row.sensor_tag}」的可信区间（自动过滤坏值）？`)) return;
    try {
      const res = await callJson<{ from_stats?: { min: number | null; max: number | null } }>(
        '/api/extreme/baselines/reset-from-stats',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sensor_tag: row.sensor_tag }) },
      );
      setNotice({ kind: 'ok', text: `已重置：min=${fmtBound(res.from_stats?.min)}，max=${fmtBound(res.from_stats?.max)}` });
      void load();
    } catch (e) {
      setNotice({ kind: 'err', text: `重置失败：${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function undo(row: Baseline) {
    if (!window.confirm(`撤销「${row.sensor_tag}」最近一次基线变更，回退到变更前区间？`)) return;
    try {
      await callJson('/api/extreme/baselines/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_tag: row.sensor_tag }),
      });
      setNotice({ kind: 'ok', text: '已撤销（已记录审计）' });
      void load();
    } catch (e) {
      setNotice({ kind: 'err', text: `撤销失败：${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // ---- 最近突破事件 ----
  const [eventsOpen, setEventsOpen] = useState(false);
  const [events, setEvents] = useState<ExtremeEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  async function openEvents() {
    setEventsOpen(true);
    setEventsLoading(true);
    try {
      const data = await callJson<{ items: ExtremeEvent[] }>('/api/extreme/events?limit=100');
      setEvents(data.items || []);
    } catch (e) {
      setNotice({ kind: 'err', text: `事件加载失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setEventsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/alerts" className="nav-btn mb-2 inline-flex items-center gap-1">
              ← 返回告警中心
            </Link>
            <h1 className="text-xl font-semibold tracking-wide">极值基线</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              基线由 Agent 自动推进；本页可查看每次变更来源（突破事件 / 首扫校准 / 人工修正），
              并对被毛刺带偏的基线做「修正 / 重置为历史统计 / 撤销最近变更」。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="nav-btn" onClick={openEvents}>
              最近突破事件
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              notice.kind === 'ok'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
            <button className="float-right opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                void load();
              }
            }}
            placeholder="按测点名搜索（如 TI_206F / 窑体温度）"
            className="w-72 rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            className="nav-btn"
            onClick={() => {
              setPage(1);
              void load();
            }}
          >
            搜索
          </button>
          <button className="nav-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
          <span className="ml-auto text-xs text-muted-foreground">共 {total} 个测点</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">测点</th>
                <th className="px-3 py-2 text-right font-medium">当前最小值</th>
                <th className="px-3 py-2 text-right font-medium">当前最大值</th>
                <th className="px-3 py-2 font-medium">更新时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.sensor_tag} className="border-b border-border/60 last:border-0 hover:bg-card-hover">
                  <td className="px-3 py-2">{row.sensor_tag}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtBound(row.min_val)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtBound(row.max_val)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fmtTime(row.updated_at)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="mr-2 text-primary hover:underline" onClick={() => void openHistory(row)}>
                      历史
                    </button>
                    <button className="mr-2 text-primary hover:underline" onClick={() => openEdit(row)}>
                      修正
                    </button>
                    <button className="mr-2 text-amber-400 hover:underline" onClick={() => void resetFromStats(row)}>
                      重置
                    </button>
                    <button className="text-red-400 hover:underline" onClick={() => void undo(row)}>
                      撤销
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button className="nav-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </button>
          <span className="text-muted-foreground">
            {page} / {pageCount}
          </span>
          <button className="nav-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
            下一页
          </button>
        </div>
      </div>

      {/* 变更历史抽屉 */}
      {historyTag !== null && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setHistoryTag(null)}>
          <div
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">基线变更历史 · {historyTag}</h2>
              <button className="nav-btn" onClick={() => setHistoryTag(null)}>
                关闭
              </button>
            </div>
            {historyLoading ? (
              <div className="py-8 text-center text-muted-foreground">加载中…</div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">时间</th>
                      <th className="px-3 py-2">来源</th>
                      <th className="px-3 py-2">变更前区间</th>
                      <th className="px-3 py-2">变更后区间</th>
                      <th className="px-3 py-2">操作人/原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((x) => (
                      <tr key={x.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{fmtTime(x.created_at)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-0.5 text-xs ${srcStyle(x.source)}`}>{srcLabel(x.source)}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {fmtBound(x.prev_min)} ~ {fmtBound(x.prev_max)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {fmtBound(x.min_val)} ~ {fmtBound(x.max_val)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {x.operator || x.reason ? `${x.operator || '-'} · ${x.reason || '-'}` : '-'}
                        </td>
                      </tr>
                    ))}
                    {historyItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          暂无变更记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 人工修正弹层 */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditRow(null)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-base font-semibold">修正基线 · {editRow.sensor_tag}</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              留空表示置空该方向（不参与极值检测）；最小值不得大于最大值。所有修正都会记入审计。
            </p>
            <label className="mb-1 block text-xs text-muted-foreground">最小值 min</label>
            <input
              value={editMin}
              onChange={(e) => setEditMin(e.target.value)}
              placeholder="数字，或留空=不限"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <label className="mb-1 block text-xs text-muted-foreground">最大值 max</label>
            <input
              value={editMax}
              onChange={(e) => setEditMax(e.target.value)}
              placeholder="数字，或留空=不限"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <label className="mb-1 block text-xs text-muted-foreground">原因</label>
            <input
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="如：毛刺误推进，改回原区间"
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button className="nav-btn" onClick={() => setEditRow(null)}>
                取消
              </button>
              <button className="nav-btn" onClick={() => void submitEdit()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 最近突破事件 */}
      {eventsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setEventsOpen(false)}>
          <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">最近突破事件</h2>
              <button className="nav-btn" onClick={() => setEventsOpen(false)}>
                关闭
              </button>
            </div>
            {eventsLoading ? (
              <div className="py-8 text-center text-muted-foreground">加载中…</div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">触发时刻</th>
                      <th className="px-3 py-2">测点</th>
                      <th className="px-3 py-2">方向</th>
                      <th className="px-3 py-2 text-right">触发值</th>
                      <th className="px-3 py-2">当时区间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{fmtTime(ev.ts)}</td>
                        <td className="px-3 py-2">{ev.sensor_tag}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-xs ${
                              ev.direction === 'NEW_HIGH'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            }`}
                          >
                            {ev.direction === 'NEW_HIGH' ? '新高' : ev.direction === 'NEW_LOW' ? '新低' : ev.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{ev.value}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {fmtBound(ev.baseline_min)} ~ {fmtBound(ev.baseline_max)}
                        </td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          暂无突破事件
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
