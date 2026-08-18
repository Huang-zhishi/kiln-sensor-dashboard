'use client';

import { useState, useEffect, useMemo } from 'react';
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

const PAGE_SIZE = 12;

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getValueColor(tag: string, value: number): string {
  const level = getSensorLevel(tag, value);
  return level === 'danger' ? '#f2495c' : level === 'warning' ? '#fade2a' : '#e0e0e0';
}

export function DataTable({ data }: DataTableProps) {
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { setMounted(true); }, []);

  const sortedData = useMemo(() =>
    [...data].sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()),
    [data]
  );

  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageData = sortedData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (safePage > totalPages) setPage(totalPages);
  }, [safePage, totalPages]);

  return (
    <div className="panel">
      <div className="panel-title">
        实时数据列表
        <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
          共 {data.length} 条
        </span>
      </div>
      <div className="overflow-auto max-h-[320px]">
        {pageData.length === 0 ? (
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
              {pageData.map((row, idx) => (
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
      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border">
        <span className="text-xs text-muted-foreground">
          第 {safePage} / {totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-2 py-0.5 text-xs rounded transition-colors bg-card border border-border-strong text-foreground hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-2 py-0.5 text-xs rounded transition-colors bg-card border border-border-strong text-foreground hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
