'use client';

import { SENSOR_TYPES, SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface CategoryNavProps {
  counts: Record<SensorType, number>;
  active: SensorType | 'all';
  onChange: (type: SensorType | 'all') => void;
}

export function CategoryNav({ counts, active, onChange }: CategoryNavProps) {
  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground tracking-wide">传感器分类</h2>
      </div>

      {/* 分类列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* 全部 */}
        <button
          onClick={() => onChange('all')}
          className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between border-l-2 ${
            active === 'all'
              ? 'bg-muted text-foreground border-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground border-transparent'
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
              className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between border-l-2 ${
                isActive
                  ? 'bg-muted text-foreground border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground border-transparent'
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
      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
        共 {Object.values(counts).reduce((a, b) => a + b, 0)} 个传感器
      </div>
    </div>
  );
}
