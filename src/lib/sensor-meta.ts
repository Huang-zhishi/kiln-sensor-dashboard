// 测点主数据（元数据）治理：别名 / 单位 / 量程 / 精度 / 启停用 / 检修 / 坏点标记
// 存储于 data/config/sensor-meta.json，按 sensor_tag 索引。

import { readConfig, writeConfig } from './config-store';
import type { SensorMeta, SensorMetaMap } from './sensor-meta-types';

export type { SensorMeta, SensorMetaMap };
export { displayName, isAlertable } from './sensor-meta-types';

interface MetaFile {
  version: number;
  meta: SensorMetaMap;
}

const FILE = 'sensor-meta.json';

export function loadMetaMap(): SensorMetaMap {
  const data = readConfig<MetaFile>(FILE, { version: 1, meta: {} });
  return data.meta && typeof data.meta === 'object' ? data.meta : {};
}

export function getMeta(tag: string): SensorMeta | null {
  return loadMetaMap()[tag] ?? null;
}

function saveMetaMap(meta: SensorMetaMap): void {
  writeConfig<MetaFile>(FILE, { version: 1, meta });
}

export function defaultMeta(tag: string): SensorMeta {
  return {
    sensor_tag: tag,
    alias: '',
    unit: '',
    range_min: null,
    range_max: null,
    precision: null,
    enabled: true,
    maintenance: false,
    suspect: false,
    location: '',
    note: '',
    updated_at: new Date().toISOString(),
  };
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export interface MetaPatch {
  sensor_tag?: unknown;
  alias?: unknown;
  unit?: unknown;
  range_min?: unknown;
  range_max?: unknown;
  precision?: unknown;
  enabled?: unknown;
  maintenance?: unknown;
  suspect?: unknown;
  location?: unknown;
  note?: unknown;
}

export class MetaValidationError extends Error {}

export function upsertMeta(patch: MetaPatch): SensorMeta {
  // 注意：保留 sensor_tag 原样（部分测点名带前导空格），仅用 trim 做非空校验，
  // 否则元数据键会与真实 sensor_tag 对不上。
  const tag = String(patch.sensor_tag ?? '');
  if (!tag.trim()) throw new MetaValidationError('sensor_tag 不能为空');
  if (tag.length > 128) throw new MetaValidationError('sensor_tag 过长（>128）');

  const map = loadMetaMap();
  const base = map[tag] ?? defaultMeta(tag);

  const rangeMin = patch.range_min !== undefined ? nullableNum(patch.range_min) : base.range_min;
  const rangeMax = patch.range_max !== undefined ? nullableNum(patch.range_max) : base.range_max;
  if (rangeMin !== null && rangeMax !== null && rangeMin >= rangeMax) {
    throw new MetaValidationError('量程下限必须小于上限');
  }

  const precisionRaw = patch.precision !== undefined ? nullableNum(patch.precision) : base.precision;
  const precision = precisionRaw === null ? null : Math.min(Math.max(Math.floor(precisionRaw), 0), 4);

  const next: SensorMeta = {
    ...base,
    sensor_tag: tag,
    alias: patch.alias !== undefined ? String(patch.alias).slice(0, 80) : base.alias,
    unit: patch.unit !== undefined ? String(patch.unit).slice(0, 24) : base.unit,
    range_min: rangeMin,
    range_max: rangeMax,
    precision,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : base.enabled,
    maintenance: patch.maintenance !== undefined ? Boolean(patch.maintenance) : base.maintenance,
    suspect: patch.suspect !== undefined ? Boolean(patch.suspect) : base.suspect,
    location: patch.location !== undefined ? String(patch.location).slice(0, 80) : base.location,
    note: patch.note !== undefined ? String(patch.note).slice(0, 255) : base.note,
    updated_at: new Date().toISOString(),
  };

  map[tag] = next;
  saveMetaMap(map);
  return next;
}

export function deleteMeta(tag: string): boolean {
  const map = loadMetaMap();
  if (!(tag in map)) return false;
  delete map[tag];
  saveMetaMap(map);
  return true;
}

export interface BatchPatch {
  maintenance?: boolean;
  enabled?: boolean;
  suspect?: boolean;
}

/** 批量设置布尔字段（一次读、一次写）；tag 保留原样不做 trim。返回实际更新条数。 */
export function batchSetMeta(tags: string[], patch: BatchPatch): number {
  const map = loadMetaMap();
  const now = new Date().toISOString();
  let n = 0;
  for (const raw of tags) {
    const tag = String(raw ?? '');
    if (!tag.trim() || tag.length > 128) continue;
    const base = map[tag] ?? defaultMeta(tag);
    map[tag] = {
      ...base,
      maintenance: patch.maintenance !== undefined ? patch.maintenance : base.maintenance,
      enabled: patch.enabled !== undefined ? patch.enabled : base.enabled,
      suspect: patch.suspect !== undefined ? patch.suspect : base.suspect,
      updated_at: now,
    };
    n++;
  }
  saveMetaMap(map);
  return n;
}
