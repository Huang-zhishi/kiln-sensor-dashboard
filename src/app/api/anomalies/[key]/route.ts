// 异常详情接口：按 event_key 拉取单条 anomaly_events（含 Agent 分析报告全文）
// event_key = `${ts}|${sensor_tag}`（URL 编码后传入）

import { NextResponse } from 'next/server';
import { queryWithCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const eventKey = decodeURIComponent(key || '');
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }

  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction,
           baseline_min, baseline_max, device_id, kiln_id, report, analyzed_at
    FROM anomaly_events
    WHERE event_key = '${escapeSql(eventKey)}'
    ORDER BY ts DESC
    LIMIT 1
  `;

  try {
    const rows = await queryWithCache<Record<string, unknown>[]>(`anomaly:${eventKey}`, sql, 60000);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err) {
    console.error('anomaly detail error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
