// 异常闭环统计接口
// GET /api/anomalies/stats?hours=168
// 返回：处理率 / 平均处理时长(MTTR) / 根因分类分布 / 处理人工作量 / 按窑体分布 / 每日趋势
//
// 数据源：anomaly_events（窗口内事件）+ 统一处理记录（alert_acks 为准，anomaly_acks 兜底）。

import { NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { fetchMergedAcks } from '@/lib/acks';
import { ROOT_CAUSE_CATEGORIES, UNCLASSIFIED_CATEGORY, categoryLabel, categoryColor } from '@/lib/handling-constants';

export const dynamic = 'force-dynamic';

interface EventRow {
  ts: string;
  event_key: string;
  sensor_tag: string;
  kiln_id: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);

  try {
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

    return NextResponse.json({
      success: true,
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
    });
  } catch (err) {
    console.error('anomaly stats error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
