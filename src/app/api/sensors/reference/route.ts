// 测点历史参考区间（全量统计，对照用）
// GET /api/sensors/reference → { references: { tag: {mn,mx,av} } }
// 数据源 stats_1m_agg，按 sensor_tag 聚合；变化慢，缓存 10 分钟。

import { NextResponse } from 'next/server';
import { queryWithCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sql = `
    SELECT sensor_tag, MIN(min_val) AS mn, MAX(max_val) AS mx, AVG(avg_val) AS av
    FROM stats_1m_agg
    GROUP BY sensor_tag
  `;
  try {
    const rows = await queryWithCache<Record<string, unknown>[]>('sensor-reference', sql, 600000);
    const references: Record<string, { mn: number; mx: number; av: number }> = {};
    for (const r of rows) {
      const tag = String(r.sensor_tag ?? '');
      if (!tag) continue;
      // 跳过无数据测点（MIN/MAX/AVG 可能为 null/NaN），避免前端 toFixed 崩溃
      if (typeof r.mn !== 'number' || !Number.isFinite(r.mn)) continue;
      if (typeof r.mx !== 'number' || !Number.isFinite(r.mx)) continue;
      if (typeof r.av !== 'number' || !Number.isFinite(r.av)) continue;
      references[tag] = { mn: r.mn, mx: r.mx, av: r.av };
    }
    return NextResponse.json({ success: true, count: Object.keys(references).length, references });
  } catch (err) {
    console.error('sensor reference error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message, references: {} });
  }
}
