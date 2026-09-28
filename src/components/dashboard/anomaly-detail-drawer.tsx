'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EChart } from '@/components/charts/echarts';
import { AnomalyMarkdown } from './anomaly-markdown';
import { classifySensor, UNIT_MAP } from '@/lib/sensor-classifier';
import type { AnomalyItem } from './anomaly-list';

interface AnomalyDetailDrawerProps {
  eventKey: string | null;
  summary?: AnomalyItem | null;
  onClose: () => void;
  onStatusChange?: (eventKey: string, status: 'acked' | 'new') => void;
  agentChatUrl?: string;
}

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
  const [saving, setSaving] = useState(false);
  const [trendPoints, setTrendPoints] = useState<Array<{ ts: string; sensor_value: number }>>([]);
  const [reference, setReference] = useState<{ mn: number; mx: number; av: number } | null>(null);

  useEffect(() => {
    if (!eventKey) {
      setDetail(null);
      setError(null);
      setTrendPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrendPoints([]);
    fetch(`/api/anomalies/${encodeURIComponent(eventKey)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.success) {
          setDetail(j.item as Record<string, unknown>);
          setStatus(j.item?.status === 'acked' ? 'acked' : 'new');
        } else {
          setError(j.error || '加载失败');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventKey]);

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

  const toggleAck = async () => {
    if (!eventKey || saving) return;
    const next: 'acked' | 'new' = status === 'acked' ? 'new' : 'acked';
    setSaving(true);
    try {
      const r = await fetch(`/api/anomalies/${encodeURIComponent(eventKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, device_id: String((detail || summary)?.device_id || '') }),
      });
      const j = await r.json();
      if (j.success) {
        setStatus(next);
        onStatusChange?.(eventKey, next);
      }
    } catch {
      // 失败保持原状
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
              <button
                type="button"
                onClick={toggleAck}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-60"
                style={
                  status === 'acked'
                    ? { border: '1px solid var(--border-strong)', background: 'var(--card)' }
                    : { border: '1px solid var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }
                }
              >
                {saving ? '处理中…' : status === 'acked' ? '取消已处理' : '标记已处理'}
              </button>
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
