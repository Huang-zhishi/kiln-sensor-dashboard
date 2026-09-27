// 测点数据质量（服务端共享）：/api/sensors/quality 与首页 SSE 共用，缓存 2 分钟
// - last_ok：最后一次「有值」的时间（取自 stats_1m_agg，avg_val 非空）
// - no_data_since：当前无数据时起始时间 = last_ok（曾有过值）或 first_ts（从未有值）

import { queryWithCache } from './db';

export interface QualityInfo {
  n: number;
  non_null: number;
  first_ts: string | null;
  last_ts: string | null;
  last_ok: string | null;
  no_data: boolean;
  no_data_since: string | null;
}

export type QualityMap = Record<string, QualityInfo>;

const TTL = 120_000;

export async function fetchQualityMap(): Promise<QualityMap> {
  const [base, lastOk] = await Promise.all([
    queryWithCache<Record<string, unknown>[]>(
      'quality:base',
      `SELECT sensor_tag, COUNT(*) AS n, COUNT(sensor_value) AS nn,
              FIRST(ts) AS first_ts, LAST(ts) AS last_ts
       FROM sensor_readings GROUP BY sensor_tag`,
      TTL,
    ),
    queryWithCache<Record<string, unknown>[]>(
      'quality:lastok',
      `SELECT sensor_tag, LAST(ts) AS last_ok
       FROM stats_1m_agg WHERE avg_val IS NOT NULL GROUP BY sensor_tag`,
      TTL,
    ),
  ]);

  const okMap = new Map<string, string>();
  for (const r of lastOk) {
    const t = String(r.sensor_tag ?? '');
    if (t) okMap.set(t, r.last_ok ? String(r.last_ok) : '');
  }

  const quality: QualityMap = {};
  for (const r of base) {
    const tag = String(r.sensor_tag ?? '');
    if (!tag.trim()) continue; // 空测点名无意义
    const nn = Number(r.nn) || 0;
    const lastOkVal = okMap.get(tag) || null;
    const lastTsMs = r.last_ts ? new Date(String(r.last_ts)).getTime() : 0;
    const lastOkMs = lastOkVal ? new Date(lastOkVal).getTime() : 0;
    // 当前无数据：从未有过有效值 / 最后有效值缺失 / 末行时间晚于最后有效值超过 5 分钟
    const noData =
      nn === 0 || lastOkVal === null
        ? true
        : lastTsMs > 0 && lastOkMs > 0 && lastTsMs - lastOkMs > 5 * 60 * 1000;
    quality[tag] = {
      n: Number(r.n) || 0,
      non_null: nn,
      first_ts: r.first_ts ? String(r.first_ts) : null,
      last_ts: r.last_ts ? String(r.last_ts) : null,
      last_ok: lastOkVal,
      no_data: noData,
      no_data_since: noData ? lastOkVal || (r.first_ts ? String(r.first_ts) : null) : null,
    };
  }
  return quality;
}
