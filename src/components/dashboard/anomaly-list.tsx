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
  status?: 'acked' | 'new';
  acked_at?: string | null;
}

export interface AnomalyFilters {
  hours: number;
  direction: '' | 'NEW_HIGH' | 'NEW_LOW';
  onlyReport: boolean;
  status: '' | 'acked' | 'new';
}

interface AnomalyListProps {
  items: AnomalyItem[];
  loading?: boolean;
  selectedKey?: string | null;
  onSelect: (item: AnomalyItem) => void;
  filters: AnomalyFilters;
  onFiltersChange: (f: AnomalyFilters) => void;
  unreadCount?: number;
  onClearUnread?: () => void;
  soundOn?: boolean;
  onToggleSound?: () => void;
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

const TIME_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
];

export function AnomalyList({
  items,
  loading = false,
  selectedKey,
  onSelect,
  filters,
  onFiltersChange,
  unreadCount = 0,
  onClearUnread,
  soundOn = true,
  onToggleSound,
}: AnomalyListProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()),
    [items],
  );

  const set = (patch: Partial<AnomalyFilters>) => onFiltersChange({ ...filters, ...patch });

  const btn = (active: boolean) =>
    `px-2 py-0.5 rounded text-[11px] border transition-colors ${
      active ? 'border-primary/60 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-card-hover'
    }`;

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-title">
        异常记录
        {unreadCount > 0 && (
          <span
            className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            {unreadCount} 新
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 font-normal normal-case">
          <button
            type="button"
            title={soundOn ? '关闭声音提醒' : '开启声音提醒'}
            onClick={onToggleSound}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onClearUnread}
              className="text-[10px] text-primary hover:underline"
            >
              全部已读
            </button>
          )}
          <span className="text-xs text-muted-foreground">{sorted.length} 条</span>
        </span>
      </div>

      {/* 筛选栏 */}
      <div className="px-3 py-2 border-b border-border space-y-1.5">
        <div className="flex items-center gap-1">
          {TIME_OPTIONS.map((t) => (
            <button key={t.value} type="button" className={btn(filters.hours === t.value)} onClick={() => set({ hours: t.value })}>
              {t.label}
            </button>
          ))}
          <select
            value={filters.direction}
            onChange={(e) => set({ direction: e.target.value as AnomalyFilters['direction'] })}
            className="ml-1 px-1.5 py-0.5 rounded text-[11px] bg-card border border-border text-foreground"
          >
            <option value="">全部方向</option>
            <option value="NEW_HIGH">突破最高</option>
            <option value="NEW_LOW">突破最低</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btn(filters.onlyReport)}
            onClick={() => set({ onlyReport: !filters.onlyReport })}
          >
            仅有分析
          </button>
          <select
            value={filters.status}
            onChange={(e) => set({ status: e.target.value as AnomalyFilters['status'] })}
            className="px-1.5 py-0.5 rounded text-[11px] bg-card border border-border text-foreground"
          >
            <option value="">全部状态</option>
            <option value="new">未处理</option>
            <option value="acked">已处理</option>
          </select>
        </div>
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
            <span className="text-sm">无异常记录</span>
            <span className="empty-hint">当前筛选条件下没有突破历史极值的记录。</span>
          </div>
        ) : (
          sorted.map((a) => {
            const s = DIRECTION_STYLE[a.direction] || { color: 'var(--warning)', label: a.direction || '异常' };
            const active = selectedKey === a.event_key;
            const acked = a.status === 'acked';
            const unit = UNIT_MAP[classifySensor(a.sensor_tag)];
            return (
              <button
                key={a.event_key}
                type="button"
                onClick={() => onSelect(a)}
                className="w-full text-left rounded px-3 py-2 transition-colors hover:bg-card-hover"
                style={{
                  background: active
                    ? `color-mix(in srgb, ${s.color} 12%, transparent)`
                    : `color-mix(in srgb, ${s.color} 6%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.color} ${active ? '45%' : '20%'}, transparent)`,
                  opacity: acked ? 0.72 : 1,
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
                      {acked && (
                        <span className="text-[9px] px-1 rounded flex-shrink-0 text-muted-foreground border border-border">
                          已处理
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {a.kiln_id || '--'} · {fmtTime(a.ts)}
                      {Number(a.has_report) === 1 ? (
                        <span className="ml-1.5 text-primary">· 有分析</span>
                      ) : (
                        <span className="ml-1.5 text-muted-foreground">· 无分析</span>
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
