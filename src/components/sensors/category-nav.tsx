'use client';

import {
  LayoutGrid,
  Thermometer,
  Gauge,
  Waves,
  ToggleRight,
  Droplets,
  FlaskConical,
  Beaker,
  Zap,
  ToggleLeft,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { SENSOR_TYPES, SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface CategoryNavProps {
  counts: Record<SensorType, number>;
  active: SensorType | 'all';
  onChange: (type: SensorType | 'all') => void;
  offlineCount?: number;
  /** 横向排布（移动端顶部分类条），默认纵向侧栏 */
  horizontal?: boolean;
}

const TYPE_ICONS: Record<SensorType, LucideIcon> = {
  '温度': Thermometer,
  '压力': Gauge,
  '流量': Waves,
  '阀位': ToggleRight,
  '液位': Droplets,
  '成分检测': FlaskConical,
  'pH值': Beaker,
  '电流': Zap,
  '开关': ToggleLeft,
  '其他': CircleDot,
};

export function CategoryNav({ counts, active, onChange, offlineCount = 0, horizontal = false }: CategoryNavProps) {
  const totalOnline = Object.values(counts).reduce((a, b) => a + b, 0);

  const itemCls = (isActive: boolean) =>
    `w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2.5 border-l-2 ${
      isActive
        ? 'bg-muted/60 text-foreground border-primary'
        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground border-transparent'
    }`;

  // 移动端：横排可滑动分类条（竖向侧栏在小屏占宽过大）
  if (horizontal) {
    const chipCls = (isActive: boolean) =>
      `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border whitespace-nowrap transition-colors shrink-0 ${
        isActive
          ? 'bg-primary/15 border-primary text-foreground'
          : 'border-border-strong text-muted-foreground hover:text-foreground'
      }`;
    return (
      <div className="scroll-x flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card">
        <button onClick={() => onChange('all')} className={chipCls(active === 'all')}>
          全部<span className="tabular-nums opacity-60">{totalOnline}</span>
        </button>
        {SENSOR_TYPES.map((type) => {
          const count = counts[type] || 0;
          if (count === 0) return null;
          const color = SENSOR_TYPE_COLORS[type];
          const Icon = TYPE_ICONS[type];
          return (
            <button key={type} onClick={() => onChange(type)} className={chipCls(active === type)}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
              {type}<span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
        {offlineCount > 0 && (
          <span className="ml-auto pl-2 text-xs shrink-0" style={{ color: 'var(--danger)' }}>离线 {offlineCount}</span>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground tracking-wide">传感器分类</h2>
      </div>

      {/* 分类列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* 全部 */}
        <button onClick={() => onChange('all')} className={itemCls(active === 'all')}>
          <LayoutGrid className="w-4 h-4 flex-shrink-0 opacity-70" />
          <span className="flex-1">全部传感器</span>
          <span className="text-xs opacity-60 tabular-nums">{totalOnline}</span>
        </button>

        {/* 各类型（仅展示有在线数量的类型） */}
        {SENSOR_TYPES.map((type) => {
          const count = counts[type] || 0;
          if (count === 0) return null;

          const color = SENSOR_TYPE_COLORS[type];
          const Icon = TYPE_ICONS[type];
          const isActive = active === type;

          return (
            <button key={type} onClick={() => onChange(type)} className={itemCls(isActive)}>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
              <span className="flex-1">{type}</span>
              <span className="text-xs opacity-60 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
        在线 {totalOnline} 个
        {offlineCount > 0 && (
          <span className="ml-1" style={{ color: 'var(--danger)' }}>
            · 离线 {offlineCount} 个
          </span>
        )}
      </div>
    </div>
  );
}
