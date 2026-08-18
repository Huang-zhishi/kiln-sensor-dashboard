'use client';

import { useState, useEffect } from 'react';

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

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function DataTable({ data }: DataTableProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const sortedData = [...data].sort((a, b) =>
    new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
  );

  return (
    <div className="panel h-full">
      <div className="panel-title">
        实时数据列表
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          共 {data.length} 条
        </span>
      </div>
      <div className="overflow-auto max-h-[400px]">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无数据
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>窑体</th>
                <th>设备</th>
                <th>传感器</th>
                <th>数值</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, idx) => (
                <tr key={`${row.device_id}-${row.sensor_tag}-${idx}`}>
                  <td>
                    <span className="text-foreground">{row.kiln_id}</span>
                  </td>
                  <td>
                    <span className="text-muted-foreground">{row.device_id}</span>
                  </td>
                  <td>
                    <span className="text-muted-foreground">{row.sensor_tag}</span>
                  </td>
                  <td>
                    <span className="font-bold" style={{
                      color: getValueColor(row.sensor_tag, Number(row.sensor_value) || 0),
                    }}>
                      {(Number(row.sensor_value) || 0).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted-foreground">
                      {mounted ? formatDate(row.reported_at) : '--'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function getValueColor(tag: string, value: number): string {
  const lower = tag.toLowerCase();
  if (lower.includes('temp') || lower.includes('温度') || lower.includes('ti')) {
    if (value > 800) return '#f2495c';
    if (value > 500) return '#fade2a';
    return '#e0e0e0';
  }
  if (lower.includes('pressure') || lower.includes('压力')) {
    if (value > 100) return '#f2495c';
    if (value > 60) return '#fade2a';
    return '#e0e0e0';
  }
  return '#e0e0e0';
}
