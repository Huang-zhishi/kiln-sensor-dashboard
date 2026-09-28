// 异常闭环处理常量（纯前端/后端通用，禁止引入 fs 等 Node 模块）
// 根因分类用于把自由文本根因结构化，便于统计与复盘。

export interface RootCauseOption {
  value: string;
  label: string;
  color: string;
}

/** 根因分类（工业窑炉场景）。value 落库，label 展示，color 用于看板。 */
export const ROOT_CAUSE_CATEGORIES: RootCauseOption[] = [
  { value: 'equipment', label: '设备故障', color: 'var(--danger)' },
  { value: 'process', label: '工艺波动', color: 'var(--warning)' },
  { value: 'instrument', label: '仪表/传感器', color: 'var(--info)' },
  { value: 'electrical', label: '电气/供电', color: '#b07cff' },
  { value: 'communication', label: '通讯/网关', color: '#00b3a4' },
  { value: 'operation', label: '操作调整', color: '#e0a030' },
  { value: 'material', label: '原料/物料', color: '#9a7b4f' },
  { value: 'environment', label: '环境因素', color: '#5b8def' },
  { value: 'maintenance', label: '检修/停炉', color: '#7a8699' },
  { value: 'other', label: '其他', color: '#8b96a6' },
];

/** 历史遗留处理记录（anomaly_acks）无根因分类，统计时归入此类。 */
export const UNCLASSIFIED_CATEGORY: RootCauseOption = {
  value: 'unclassified',
  label: '未分类（历史记录）',
  color: 'var(--muted-foreground)',
};

const CATEGORY_MAP = new Map<string, RootCauseOption>(
  [...ROOT_CAUSE_CATEGORIES, UNCLASSIFIED_CATEGORY].map((c) => [c.value, c]),
);

export function categoryLabel(value?: string | null): string {
  if (!value) return '';
  return CATEGORY_MAP.get(value)?.label || value;
}

export function categoryColor(value?: string | null): string {
  if (!value) return 'var(--muted-foreground)';
  return CATEGORY_MAP.get(value)?.color || 'var(--muted-foreground)';
}

/** 处理状态：ack=已处理，new=未处理/已重开。 */
export type HandlingStatus = 'acked' | 'new';

export interface HandlingRecord {
  ts: string;
  status: HandlingStatus;
  handler: string;
  comment: string;
  rootCause: string;
  rootCauseCategory: string;
  measure: string;
}
