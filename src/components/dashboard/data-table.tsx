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
  return level === 'danger' ? '#f2495c' : level === 'warning' ? '#fade2a' : '#e0e0e0';
}

const COLS = 'minmax(60px, 0.8fr) minmax(110px, 1.2fr) minmax(110px, 1.2fr) minmax(70px, 0.8fr) minmax(130px, 1fr)';

export function DataTable({ data }: DataTableProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedData = useMemo(() =>
    [...data].sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()),
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
          共 {data.length} 条 · 滚动查看
        </span>
      </div>
      <div ref={scrollRef} className="overflow-auto max-h-[320px]">
        {sortedData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无数据
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {/* 表头 */}
            <div
              className="grid sticky top-0 z-10 bg-card border-b border-border"
              style={{ gridTemplateColumns: COLS, height: ROW_H }}
            >
              {['窑体', '设备', '传感器', '数值', '时间'].map((h) => (
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
