'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EChart } from '@/components/charts/echarts';
import { AnomalyMarkdown } from './anomaly-markdown';
import { classifySensor, UNIT_MAP } from '@/lib/sensor-classifier';
import { ROOT_CAUSE_CATEGORIES, categoryLabel, categoryColor } from '@/lib/handling-constants';
import type { AnomalyItem } from './anomaly-list';

interface AnomalyDetailDrawerProps {
  eventKey: string | null;
  summary?: AnomalyItem | null;
  onClose: () => void;
  onStatusChange?: (eventKey: string, status: 'acked' | 'new') => void;
  agentChatUrl?: string;
}

interface AckData {
  status: 'acked' | 'new';
  handler: string;
  comment: string;
  rootCause: string;
  rootCauseCategory: string;
  measure: string;
  ackedAt: string | null;
}

interface TimelineRecord {
  ts: string;
  status: 'acked' | 'new';
  handler: string;
  comment: string;
  rootCause: string;
  rootCauseCategory: string;
  measure: string;
}

const EMPTY_FORM = { handler: '', rootCauseCategory: '', rootCause: '', measure: '', comment: '' };
const HANDLER_KEY = 'pfd_last_handler';

const DIRECTION_LABEL: Record<string, string> = {
  NEW_HIGH: '突破历史最高值',
  NEW_LOW: '突破历史最低值',
};

function num(v: unknown, digits = 2): string {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(digits) : '--';
}

function fmtTime(iso: unknown): string {
  const d = new Date(String(iso));
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtHHmm(ts: unknown): string {
  const d = new Date(String(ts));
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnomalyDetailDrawer({ eventKey, summary, onClose, onStatusChange, agentChatUrl }: AnomalyDetailDrawerProps) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'acked' | 'new'>('new');
  const [ack, setAck] = useState<AckData | null>(null);
  const [timeline, setTimeline] = useState<TimelineRecord[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [trendPoints, setTrendPoints] = useState<Array<{ ts: string; sensor_value: number }>>([]);
  const [reference, setReference] = useState<{ mn: number; mx: number; av: number } | null>(null);
  const loadedHandlersRef = useRef(false);

  // 记住上次处理人，每次打开时预填，减少重复输入
  useEffect(() => {
    if (loadedHandlersRef.current) return;
    loadedHandlersRef.current = true;
    try {
      const h = localStorage.getItem(HANDLER_KEY);
      if (h) setForm((f) => ({ ...f, handler: h }));
    } catch {
      // localStorage 不可用时忽略
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!eventKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/anomalies/${encodeURIComponent(eventKey)}`);
      const j = await r.json();
      if (!j.success) {
        setError(j.error || '加载失败');
        return;
      }
      setDetail(j.item as Record<string, unknown>);
      setStatus(j.item?.status === 'acked' ? 'acked' : 'new');
      const a = (j.ack as AckData | null) || null;
      setAck(a);
      setTimeline(Array.isArray(j.timeline) ? (j.timeline as TimelineRecord[]) : []);
      setForm((prev) => ({
        handler: a?.handler || prev.handler || '',
        rootCauseCategory: a?.rootCauseCategory || '',
        rootCause: a?.rootCause || '',
        measure: a?.measure || '',
        comment: a?.comment || '',
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [eventKey]);

  useEffect(() => {
    if (!eventKey) {
      setDetail(null);
      setError(null);
      setTrendPoints([]);
      setAck(null);
      setTimeline([]);
      setForm({ ...EMPTY_FORM });
      return;
    }
    void loadDetail();
  }, [eventKey, loadDetail]);

  const item = (detail || summary) as Record<string, unknown> | null | undefined;
  const sensorTag = String(item?.sensor_tag || '');
  const eventTs = String(item?.ts || '');

  // 触发前后趋势（事件时刻 ±30 分钟）
  useEffect(() => {
    if (!sensorTag || !eventTs) return;
    let cancelled = false;
    const q = new URLSearchParams({ sensor_tag: sensorTag, center: eventTs, minutes: '30' });
    fetch(`/api/sensors/window?${q}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setTrendPoints(Array.isArray(j.points) ? j.points : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sensorTag, eventTs]);

  // 当前历史参考区间（全量统计，服务端缓存 10 分钟）
  useEffect(() => {
    setReference(null);
    if (!sensorTag) return;
    let cancelled = false;
    fetch('/api/sensors/reference')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setReference(j.references?.[sensorTag] || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sensorTag]);

  const submitHandling = async (nextStatus: 'acked' | 'new') => {
    if (!eventKey || saving) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const r = await fetch(`/api/anomalies/${encodeURIComponent(eventKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          device_id: String((detail || summary)?.device_id || ''),
          handler: form.handler,
          root_cause_category: form.rootCauseCategory,
          root_cause: form.rootCause,
          measure: form.measure,
          comment: form.comment,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setSaveMsg(j.error || '保存失败');
        return;
      }
      if (nextStatus === 'acked' && form.handler.trim()) {
        try {
          localStorage.setItem(HANDLER_KEY, form.handler.trim());
        } catch {
          // ignore
        }
      }
      setStatus(nextStatus);
      onStatusChange?.(eventKey, nextStatus);
      setSaveMsg(nextStatus === 'acked' ? '已保存处理记录' : '已取消处理');
      await loadDetail();
    } catch {
      setSaveMsg('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const direction = String(item?.direction || '');
  const isHigh = direction === 'NEW_HIGH';
  // 注意：ECharts 不支持 CSS 变量（var(--danger) 会导致 hover 时线条消失），
  // 必须用具体色值；此处与 globals.css 的 --danger / --info 保持一致。
  const accent = isHigh ? '#ff4d5e' : '#4da3ff';
  const accentCss = isHigh ? 'var(--danger)' : 'var(--info)';
  const unit = sensorTag ? UNIT_MAP[classifySensor(sensorTag)] : '';
  const report = String(detail?.report || '');

  const trendOption = useMemo<EChartsOption>(() => {
    const labels = trendPoints.map((p) => fmtHHmm(p.ts));
    const values = trendPoints.map((p) => Number(p.sensor_value));
    // 触发点对齐到最近的时间桶
    let markIdx = -1;
    if (eventTs && trendPoints.length) {
      const target = new Date(eventTs).getTime();
      let best = Infinity;
      trendPoints.forEach((p, i) => {
        const diff = Math.abs(new Date(p.ts).getTime() - target);
        if (diff < best) {
          best = diff;
          markIdx = i;
        }
      });
    }
    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 8, right: 12, bottom: 20, left: 46 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#14181f',
        borderColor: 'rgba(155,170,192,0.24)',
        borderRadius: 3,
        textStyle: { fontSize: 11, color: '#e8edf4' },
        valueFormatter: (v: unknown) => (isFinite(Number(v)) ? `${Number(v).toFixed(2)} ${unit}` : '--'),
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: 'rgba(155,170,192,0.2)' } },
        axisLabel: { color: '#8b96a6', fontSize: 9, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(155,170,192,0.1)', type: 'dashed' } },
        axisLabel: { color: '#8b96a6', fontSize: 9 },
      },
      series: [
        {
          type: 'line',
          data: values,
          showSymbol: false,
          lineStyle: { width: 1.5 },
          color: accent,
          connectNulls: true,
          markLine:
            markIdx >= 0
              ? {
                  symbol: 'none',
                  silent: true,
                  lineStyle: { color: accent, type: 'dashed', width: 1 },
                  label: { formatter: '触发', color: accent, fontSize: 9 },
                  data: [{ xAxis: markIdx }],
                }
              : undefined,
        },
      ],
    };
  }, [trendPoints, eventTs, accent, unit]);

  return (
    <Sheet open={!!eventKey} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[580px] overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: accentCss }} />
            <span className="truncate">{sensorTag || '异常详情'}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ color: accentCss, background: `color-mix(in srgb, ${accentCss} 16%, transparent)` }}
            >
              {DIRECTION_LABEL[direction] || direction || '异常'}
            </span>
            {status === 'acked' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground flex-shrink-0">
                已处理
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {loading && !detail ? (
          <div className="p-5 space-y-3">
            <div className="h-24 rounded bg-card-hover animate-pulse" />
            <div className="h-40 rounded bg-card-hover animate-pulse" />
          </div>
        ) : error && !detail ? (
          <div className="empty-state h-[60%]">
            <span className="text-sm" style={{ color: 'var(--danger)' }}>详情加载失败</span>
            <span className="empty-hint">{error}</span>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* 基本信息 */}
            <section>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                基本信息
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div>
                  <div className="text-muted-foreground text-[10px]">触发时刻</div>
                  <div className="font-mono tabular-nums">{fmtTime(item?.ts)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">触发数值</div>
                  <div className="font-mono font-bold tabular-nums" style={{ color: accentCss }}>
                    {num(item?.sensor_value)} {unit}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">历史区间</div>
                  <div className="font-mono tabular-nums">
                    {num(item?.baseline_min)} ~ {num(item?.baseline_max)} {unit}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">设备 / 窑体</div>
                  <div className="truncate">
                    {String(item?.device_id || '--')} · {String(item?.kiln_id || '--')}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground text-[10px]">当前历史参考（全量统计）</div>
                  <div className="font-mono tabular-nums">
                    {reference && Number.isFinite(reference.mn) && Number.isFinite(reference.mx)
                      ? `${reference.mn.toFixed(2)} ~ ${reference.mx.toFixed(2)} ${unit}（均值 ${reference.av.toFixed(2)}）`
                      : reference
                        ? '该测点暂无历史数据'
                        : '加载中…'}
                  </div>
                </div>
              </div>
            </section>

            {/* 触发前后趋势 */}
            <section>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                触发前后趋势（±30 分钟）
              </div>
              {trendPoints.length > 0 ? (
                <div
                  className="rounded"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                >
                  <EChart option={trendOption} style={{ height: 150, width: '100%' }} />
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground px-1 py-3">暂无该时段历史数据</div>
              )}
            </section>

            {/* 处理闭环 */}
            <section>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                处理闭环
                {ack?.ackedAt && status === 'acked' && (
                  <span className="normal-case font-normal text-muted-foreground">
                    · {fmtTime(ack.ackedAt)}
                  </span>
                )}
              </div>

              {/* 当前处理信息 */}
              {status === 'acked' && ack && (
                <div
                  className="rounded p-3 mb-2 space-y-1.5 text-[11px]"
                  style={{ background: 'color-mix(in srgb, var(--success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 24%, transparent)' }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--success)' }}>已处理</span>
                    <span className="text-muted-foreground">处理人：{ack.handler || '未填写'}</span>
                    {ack.rootCauseCategory && (
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{ background: `color-mix(in srgb, ${categoryColor(ack.rootCauseCategory)} 18%, transparent)`, color: categoryColor(ack.rootCauseCategory) }}
                      >
                        {categoryLabel(ack.rootCauseCategory)}
                      </span>
                    )}
                  </div>
                  {ack.rootCause && <div>根因：{ack.rootCause}</div>}
                  {ack.measure && <div>措施：{ack.measure}</div>}
                  {ack.comment && <div className="text-muted-foreground">备注：{ack.comment}</div>}
                </div>
              )}

              {/* 处理表单 */}
              <div className="rounded p-3 space-y-2 text-[11px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-muted-foreground">处理人</span>
                    <input
                      value={form.handler}
                      onChange={(e) => setForm((f) => ({ ...f, handler: e.target.value }))}
                      placeholder="姓名 / 工号"
                      className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">根因分类</span>
                    <select
                      value={form.rootCauseCategory}
                      onChange={(e) => setForm((f) => ({ ...f, rootCauseCategory: e.target.value }))}
                      className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground text-xs"
                    >
                      <option value="">未分类</option>
                      {ROOT_CAUSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-muted-foreground">根因说明</span>
                  <input
                    value={form.rootCause}
                    onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))}
                    placeholder="如：热电偶接线松动导致跳变"
                    className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground text-xs"
                  />
                </label>
                <label className="block">
                  <span className="text-muted-foreground">处理措施</span>
                  <textarea
                    value={form.measure}
                    onChange={(e) => setForm((f) => ({ ...f, measure: e.target.value }))}
                    rows={2}
                    placeholder="如：紧固接线并复测，观察 30 分钟"
                    className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground text-xs resize-none"
                  />
                </label>
                <label className="block">
                  <span className="text-muted-foreground">备注</span>
                  <textarea
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground text-xs resize-none"
                  />
                </label>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <button
                    type="button"
                    onClick={() => submitHandling('acked')}
                    disabled={saving}
                    className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-60 transition-colors"
                    style={{ border: '1px solid var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}
                  >
                    {saving ? '保存中…' : status === 'acked' ? '更新处理记录' : '标记已处理'}
                  </button>
                  {status === 'acked' && (
                    <button
                      type="button"
                      onClick={() => submitHandling('new')}
                      disabled={saving}
                      className="px-3 py-1.5 rounded text-xs border border-border-strong text-muted-foreground hover:text-foreground disabled:opacity-60 transition-colors"
                    >
                      取消已处理
                    </button>
                  )}
                  {saveMsg && (
                    <span className="text-[11px]" style={{ color: saveMsg.includes('失败') ? 'var(--danger)' : 'var(--success)' }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* 处理时间线 */}
              {timeline.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] text-muted-foreground mb-1.5">处理时间线（{timeline.length}）</div>
                  <ol className="space-y-1.5">
                    {timeline.map((t, i) => (
                      <li key={`${t.ts}-${i}`} className="flex gap-2 text-[11px]">
                        <span
                          className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: t.status === 'acked' ? 'var(--success)' : 'var(--warning)' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-muted-foreground">{fmtTime(t.ts)}</span>
                            <span style={{ color: t.status === 'acked' ? 'var(--success)' : 'var(--warning)' }}>
                              {t.status === 'acked' ? '已处理' : '取消/重开'}
                            </span>
                            {t.handler && <span>{t.handler}</span>}
                            {t.rootCauseCategory && (
                              <span className="px-1 rounded" style={{ color: categoryColor(t.rootCauseCategory), background: `color-mix(in srgb, ${categoryColor(t.rootCauseCategory)} 15%, transparent)` }}>
                                {categoryLabel(t.rootCauseCategory)}
                              </span>
                            )}
                          </div>
                          {(t.rootCause || t.measure || t.comment) && (
                            <div className="text-muted-foreground mt-0.5">
                              {t.rootCause && <span>根因：{t.rootCause}　</span>}
                              {t.measure && <span>措施：{t.measure}　</span>}
                              {t.comment && <span>备注：{t.comment}</span>}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>

            {/* Agent 分析 */}
            <section>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                Agent 分析
                {report && <span className="text-primary normal-case font-normal">· AI 生成</span>}
              </div>
              {report ? (
                <div
                  className="rounded p-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                >
                  <AnomalyMarkdown text={report} />
                </div>
              ) : (
                <div className="empty-state py-8" style={{ minHeight: 'auto' }}>
                  <span className="text-sm">暂无分析报告</span>
                  <span className="empty-hint">
                    {String(detail?.note || '分析生成中或当时未产出报告；稍后刷新可查看。')}
                  </span>
                </div>
              )}
            </section>

            {/* 操作 */}
            <section className="pt-1 flex items-center gap-2 flex-wrap">
              <Link
                href="/sensors"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover transition-colors"
              >
                查看该测点趋势图
              </Link>
              <Link
                href="/process"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover transition-colors"
              >
                查看工艺流程
              </Link>
              {report && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(`${sensorTag} ${direction}\n\n${report}`)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover transition-colors"
                >
                  复制报告
                </button>
              )}
              {agentChatUrl && (
                <a
                  href={agentChatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs border border-border-strong bg-card hover:bg-card-hover transition-colors"
                >
                  问 Agent
                </a>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
