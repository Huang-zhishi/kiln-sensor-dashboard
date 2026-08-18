'use client';

import { SENSOR_TYPES, SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface CategoryNavProps {
  counts: Record<SensorType, number>;
  active: SensorType | 'all';
  onChange: (type: SensorType | 'all') => void;
}

export function CategoryNav({ counts, active, onChange }: CategoryNavProps) {
  return (
    <div className="h-full flex flex-col bg-[#0f1729] border-r border-[rgba(0,212,255,0.15)]">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-[rgba(0,212,255,0.15)]">
        <h2 className="text-sm font-bold text-[#e2e8f0] tracking-wider">传感器分类</h2>
      </div>

      {/* 分类列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* 全部 */}
        <button
          onClick={() => onChange('all')}
          className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${
            active === 'all'
              ? 'bg-[rgba(0,212,255,0.15)] text-[#00d4ff] border-r-2 border-[#00d4ff]'
              : 'text-[#94a3b8] hover:bg-[rgba(0,212,255,0.05)] hover:text-[#e2e8f0]'
          }`}
        >
          <span>全部传感器</span>
          <span className="text-xs opacity-60">
            {Object.values(counts).reduce((a, b) => a + b, 0)}
          </span>
        </button>

        {/* 各类型 */}
        {SENSOR_TYPES.map((type) => {
          const count = counts[type] || 0;
          if (count === 0) return null;

          const color = SENSOR_TYPE_COLORS[type];
          const isActive = active === type;

          return (
            <button
              key={type}
              onClick={() => onChange(type)}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${
                isActive
                  ? 'bg-[rgba(0,212,255,0.15)] text-[#00d4ff] border-r-2 border-[#00d4ff]'
                  : 'text-[#94a3b8] hover:bg-[rgba(0,212,255,0.05)] hover:text-[#e2e8f0]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{type}</span>
              </div>
              <span className="text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-3 border-t border-[rgba(0,212,255,0.15)] text-xs text-[#64748b]">
        共 {Object.values(counts).reduce((a, b) => a + b, 0)} 个传感器
      </div>
    </div>
  );
}
