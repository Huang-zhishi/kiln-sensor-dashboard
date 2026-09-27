// 异常记录列表接口：直连 TDengine 的 anomaly_events（由 Agent 在突破历史极值时写入）
// 返回不含报告全文（列表只用于展示概要），报告通过 /api/anomalies/[key] 按需拉取。

import { NextResponse } from 'next/server';
import { CACHE_TTL, queryWithCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500);

  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction,
           baseline_min, baseline_max, device_id, kiln_id,
           CASE WHEN report IS NULL OR report = '' THEN 0 ELSE 1 END AS has_report
    FROM anomaly_events
    WHERE ts > NOW() - ${hours}h
    ORDER BY ts DESC
    LIMIT ${limit}
  `;

  try {
    const rows = await queryWithCache<Record<string, unknown>[]>(
      `anomalies:${hours}:${limit}`,
      sql,
      CACHE_TTL.latest,
    );
    return NextResponse.json({ success: true, count: rows.length, items: rows });
  } catch (err) {
    // 表尚未创建 / 数据库抖动：返回空列表而非 500，避免首页崩溃
    console.error('anomalies list error:', err);
    return NextResponse.json({
      success: false,
      count: 0,
      items: [],
      warning: (err as Error).message,
    });
  }
}
