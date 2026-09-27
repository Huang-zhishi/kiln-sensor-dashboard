'use client';

import { useMemo } from 'react';
import { classifySensor, UNIT_MAP } from '@/lib/sensor-classifier';

export interface AnomalyItem {
  ts: string;
  event_key: string;
  sensor_tag: string;
  sensor_value: number;
  direction: string; // NEW_HIGH | NEW_LOW
  baseline_min: number;
  baseline_max: number;
  device_id: string;
  kiln_id: string;
  has_report: number; // 1/0
}

interface AnomalyListProps {
  items: AnomalyItem[];
  loading?: boolean;
  selectedKey?: string | null;
  onSelect: (item: AnomalyItem) => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const DIRECTION_STYLE: Record<string, { color: string; label: string }> = {
  NEW_HIGH: { color: 'var(--danger)', label: '突破最高' },
  NEW_LOW: { color: 'var(--info)', label: '突破最低' },
};

export function AnomalyList({ items, loading = false, selectedKey, onSelect }: AnomalyListProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()),
    [items],
  );

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        异常记录
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          {sorted.length} 条
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {loading && sorted.length === 0 ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-card-hover animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state h-full">
            <span className="status-dot online" style={{ width: 10, height: 10 }} />
            <span className="text-sm">最近无异常记录</span>
            <span className="empty-hint">当测点突破历史极值时，将在此生成记录并附 Agent 分析。</span>
          </div>
        ) : (
          sorted.map((a) => {
            const s = DIRECTION_STYLE[a.direction] || { color: 'var(--warning)', label: a.direction || '异常' };
            const active = selectedKey === a.event_key;
            const unit = UNIT_MAP[classifySensor(a.sensor_tag)];
            return (
              <button
                key={a.event_key}
                type="button"
                onClick={() => onSelect(a)}
                className="w-full text-left rounded px-3 py-2 transition-colors hover:bg-card-hover"
                style={{
                  background: active ? `color-mix(in srgb, ${s.color} 12%, transparent)` : `color-mix(in srgb, ${s.color} 6%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.color} ${active ? '45%' : '20%'}, transparent)`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate flex items-center gap-1.5" style={{ color: s.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                      {a.sensor_tag}
                      <span
                        className="text-[9px] px-1 rounded flex-shrink-0"
                        style={{ background: `color-mix(in srgb, ${s.color} 18%, transparent)` }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {a.kiln_id || '--'} · {fmtTime(a.ts)}
                      {Number(a.has_report) === 1 && (
                        <span className="ml-1.5 text-primary">· 有 Agent 分析</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold text-sm tabular-nums" style={{ color: s.color }}>
                      {Number(a.sensor_value).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{unit}</div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
