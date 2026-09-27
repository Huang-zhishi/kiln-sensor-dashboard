'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AnomalyMarkdown } from './anomaly-markdown';
import { classifySensor, UNIT_MAP } from '@/lib/sensor-classifier';
import type { AnomalyItem } from './anomaly-list';

interface AnomalyDetailDrawerProps {
  eventKey: string | null;
  summary?: AnomalyItem | null;
  onClose: () => void;
  onStatusChange?: (eventKey: string, status: 'acked' | 'new') => void;
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

export function AnomalyDetailDrawer({ eventKey, summary, onClose, onStatusChange }: AnomalyDetailDrawerProps) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'acked' | 'new'>('new');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventKey) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  const item = (detail || summary) as Record<string, unknown> | null | undefined;
  const direction = String(item?.direction || '');
  const isHigh = direction === 'NEW_HIGH';
  const accent = isHigh ? 'var(--danger)' : 'var(--info)';
  const unit = item?.sensor_tag ? UNIT_MAP[classifySensor(String(item.sensor_tag))] : '';
  const report = String(detail?.report || '');

  return (
    <Sheet open={!!eventKey} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[580px] overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <span className="truncate">{String(item?.sensor_tag || '异常详情')}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
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
                  <div className="font-mono font-bold tabular-nums" style={{ color: accent }}>
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
              </div>
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
                  <span className="empty-hint">分析生成中或当时未产出报告；稍后刷新可查看。</span>
                </div>
              )}
            </section>

            {/* 操作 */}
            <section className="pt-1 flex items-center gap-2">
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
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
