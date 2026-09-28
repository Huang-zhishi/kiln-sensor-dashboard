// 异常闭环统计（接口 /api/anomalies/stats 与周报共用）
// 数据源：anomaly_events（窗口内事件）+ 统一处理记录（alert_acks 为准，anomaly_acks 兜底）。

import { query, toRows } from './db';
import { fetchMergedAcks } from './acks';
import { ROOT_CAUSE_CATEGORIES, UNCLASSIFIED_CATEGORY, categoryLabel, categoryColor } from './handling-constants';

export interface CategoryStat {
  key: string;
  label: string;
  color: string;
  count: number;
}
export interface NamedStat {
  name: string;
  count: number;
}
export interface KilnStat {
  kiln_id: string;
  total: number;
  handled: number;
}
export interface DayStat {
  date: string;
  total: number;
  handled: number;
}

export interface ClosedLoopStats {
  window_hours: number;
  total: number;
  handled: number;
  unhandled: number;
  handling_rate: number;
  avg_mttr_minutes: number | null;
  mttr_sample: number;
  by_category: CategoryStat[];
  by_handler: NamedStat[];
  by_kiln: KilnStat[];
  daily: DayStat[];
}

interface EventRow {
  ts: string;
  event_key: string;
  sensor_tag: string;
  kiln_id: string;
}

export async function computeClosedLoopStats(hours: number): Promise<ClosedLoopStats> {
  const res = await query(
    `SELECT ts, event_key, sensor_tag, kiln_id FROM anomaly_events ` +
      `WHERE ts > NOW() - ${Math.max(1, Math.floor(hours))}h ORDER BY ts DESC LIMIT 5000`,
  );
  const events = toRows(res) as unknown as EventRow[];
  const acks = await fetchMergedAcks();

  let handled = 0;
  let mttrSum = 0;
  let mttrCount = 0;
  const byCategory = new Map<string, number>();
  const byHandler = new Map<string, number>();
  const byKiln = new Map<string, { total: number; handled: number }>();
  const byDay = new Map<string, { total: number; handled: number }>();

  for (const e of events) {
    const a = acks.get(String(e.event_key ?? ''));
    const isHandled = a?.status === 'acked';
    const day = String(e.ts ?? '').slice(0, 10);
    const kiln = String(e.kiln_id ?? '') || '未归属';
    const k = byKiln.get(kiln) || { total: 0, handled: 0 };
    k.total += 1;
    const d = byDay.get(day) || { total: 0, handled: 0 };
    d.total += 1;

    if (isHandled) {
      handled += 1;
      k.handled += 1;
      d.handled += 1;
      // MTTR：仅统计有处理时刻且晚于事件时刻的记录
      if (a?.ackedAt) {
        const diffMin = (new Date(a.ackedAt).getTime() - new Date(e.ts).getTime()) / 60000;
        if (isFinite(diffMin) && diffMin >= 0) {
          mttrSum += diffMin;
          mttrCount += 1;
        }
      }
      const cat = a?.rootCauseCategory || UNCLASSIFIED_CATEGORY.value;
      byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
      const handler = a?.handler?.trim() || '未填写';
      byHandler.set(handler, (byHandler.get(handler) || 0) + 1);
    }

    byKiln.set(kiln, k);
    byDay.set(day, d);
  }

  const total = events.length;
  const categoryOrder = [...ROOT_CAUSE_CATEGORIES.map((c) => c.value), UNCLASSIFIED_CATEGORY.value];
  const categories = categoryOrder
    .filter((v) => byCategory.has(v))
    .map((v) => ({ key: v, label: categoryLabel(v), color: categoryColor(v), count: byCategory.get(v) || 0 }));

  return {
    window_hours: hours,
    total,
    handled,
    unhandled: total - handled,
    handling_rate: total > 0 ? handled / total : 0,
    avg_mttr_minutes: mttrCount > 0 ? mttrSum / mttrCount : null,
    mttr_sample: mttrCount,
    by_category: categories,
    by_handler: [...byHandler.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    by_kiln: [...byKiln.entries()]
      .map(([kiln_id, v]) => ({ kiln_id, total: v.total, handled: v.handled }))
      .sort((a, b) => b.total - a.total),
    daily: [...byDay.entries()]
      .map(([date, v]) => ({ date, total: v.total, handled: v.handled }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}
