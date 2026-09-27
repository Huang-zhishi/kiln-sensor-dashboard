'use client';

// 单测点选择器：带搜索的下拉，选项含类型色点 / 单位 / 设备
// 数据来自 /api/sensors/list，测点数量较多（200+），故只渲染过滤后的前 N 条

import { useEffect, useMemo, useRef, useState } from 'react';
import { SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

export interface SensorOption {
  sensor_tag: string;
  device_id: string;
  kiln_id: string;
  type: string;
  unit: string;
}

interface SensorPickerProps {
  options: SensorOption[];
  value: SensorOption | null;
  onChange: (option: SensorOption) => void;
  loading?: boolean;
}

const MAX_RESULTS = 200;

export function SensorPicker({ options, value, onChange, loading = false }: SensorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.sensor_tag.toLowerCase().includes(q)) : options;
    return list.slice(0, MAX_RESULTS);
  }, [options, query]);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={open ? query : value?.sensor_tag ?? ''}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder={loading ? '加载测点中…' : '搜索测点，如 206F / 窑体温度'}
        className="w-full bg-card border border-border-strong rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
      />
      {value && !open && (
        <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: SENSOR_TYPE_COLORS[value.type as SensorType] || '#8b96a6' }}
          />
          <span>{value.type || '其他'}</span>
          <span className="font-mono truncate" title={value.device_id}>
            {value.device_id}
          </span>
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded border border-border-strong bg-card shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">无匹配测点</div>
          ) : (
            filtered.map((o) => (
              <button
                key={`${o.device_id}|${o.sensor_tag}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-card-hover transition-colors flex items-center gap-2"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: SENSOR_TYPE_COLORS[o.type as SensorType] || '#8b96a6' }}
                />
                <span className="truncate">{o.sensor_tag}</span>
                <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">{o.type}</span>
              </button>
            ))
          )}
          {filtered.length >= MAX_RESULTS && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
              结果过多，仅显示前 {MAX_RESULTS} 条，请补充关键词
            </div>
          )}
        </div>
      )}
    </div>
  );
}
