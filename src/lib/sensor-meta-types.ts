// 测点元数据类型与纯函数（前端/后端通用，禁止引入 fs）
// 服务端读写见 sensor-meta.ts。

export interface SensorMeta {
  sensor_tag: string;
  /** 显示别名（为空则用原始 tag） */
  alias: string;
  /** 单位覆盖（为空则用分类器推断值） */
  unit: string;
  range_min: number | null;
  range_max: number | null;
  precision: number | null;
  enabled: boolean;
  maintenance: boolean;
  suspect: boolean;
  location: string;
  note: string;
  updated_at: string;
}

export type SensorMetaMap = Record<string, SensorMeta>;

/** 展示名：别名优先，其次原 tag */
export function displayName(tag: string, meta?: SensorMeta | null): string {
  return meta?.alias?.trim() || tag;
}

/** 是否应参与告警评估（启用且非检修） */
export function isAlertable(meta?: SensorMeta | null): boolean {
  if (!meta) return true;
  return meta.enabled !== false && meta.maintenance !== true;
}
