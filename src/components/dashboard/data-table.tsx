'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getSensorLevel } from '@/lib/sensor-classifier';

interface SensorData {
  device_id: string;
  kiln_id: string;
  sensor_tag: string;
  sensor_value: number;
  reported_at: string;
  is_online?: boolean;
}

interface DataTableProps {
  data: SensorData[];
}

// 固定行高（虚拟滚动按此估算；也规避祖先 transform:scale 对测量值的干扰）
const ROW_H = 35;

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getValueColor(tag: string, value: number): string {
  const level = getSensorLevel(tag, value);
  return level === 'danger' ? 'var(--danger)' : level === 'warning' ? 'var(--warning)' : 'var(--foreground)';
}

const COLS = 'minmax(54px, 0.6fr) minmax(60px, 0.8fr) minmax(105px, 1.1fr) minmax(105px, 1.1fr) minmax(66px, 0.8fr) minmax(125px, 1fr)';

export function DataTable({ data }: DataTableProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedData = useMemo(() =>
    [...data].sort((a, b) => {
      // 在线优先，组内按上报时间倒序
      const oa = a.is_online === false ? 1 : 0;
      const ob = b.is_online === false ? 1 : 0;
      if (oa !== ob) return oa - ob;
      return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
    }),
    [data]
  );

  // 虚拟滚动：只渲染可视区行（SSE 每 2s 全量更新数据，滚动浏览比翻页更顺）
  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  return (
    <div className="panel">
      <div className="panel-title">
        实时数据列表
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          在线 {data.filter((d) => d.is_online !== false).length} · 离线 {data.filter((d) => d.is_online === false).length} · 滚动查看
        </span>
      </div>
      <div ref={scrollRef} className="overflow-auto max-h-[clamp(240px,32vh,420px)]">
        {sortedData.length === 0 ? (
          <div className="empty-state h-48">
            <span className="text-sm">暂无实时数据</span>
            <span className="empty-hint">数据接入后，各传感器的实时读数将在此滚动展示。</span>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {/* 表头 */}
            <div
              className="grid sticky top-0 z-10 bg-card border-b border-border"
              style={{ gridTemplateColumns: COLS, height: ROW_H }}
            >
              {['状态', '窑体', '设备', '传感器', '数值', '时间'].map((h) => (
                <div key={h} className="flex items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {h}
                </div>
              ))}
            </div>
            {/* 可视区行 */}
            {virtualizer.getVirtualItems().map((vi) => {
              const row = sortedData[vi.index];
              return (
                <div
                  key={`${row.device_id}-${row.sensor_tag}-${row.reported_at}`}
                  className="grid hover:bg-white/[0.025] border-b border-white/[0.07]"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vi.size,
                    transform: `translateY(${vi.start + ROW_H}px)`,
                    gridTemplateColumns: COLS,
                  }}
                >
                  <div className="flex items-center px-3">
                    {row.is_online === false ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
                        离线
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--success)' }}>
                        <span className="status-dot online" style={{ width: 6, height: 6 }} />
                        在线
                      </span>
                    )}
                  </div>
                  <div className="flex items-center px-3 text-[13px] font-mono text-foreground truncate">
                    {row.kiln_id}
                  </div>
                  <div className="flex items-center px-3 text-[13px] font-mono text-muted-foreground truncate">
                    {row.device_id}
                  </div>
                  <div className="flex items-center px-3 text-[13px] font-mono text-muted-foreground truncate">
                    {row.sensor_tag}
                  </div>
                  <div className="flex items-center px-3 text-[13px] font-bold" style={{ color: getValueColor(row.sensor_tag, Number(row.sensor_value) || 0) }}>
                    {(Number(row.sensor_value) || 0).toFixed(2)}
                  </div>
                  <div className="flex items-center px-3 text-[13px] font-mono text-muted-foreground">
                    {mounted ? formatDate(row.reported_at) : '--'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
