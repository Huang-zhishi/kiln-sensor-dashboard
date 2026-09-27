// 指定时刻前后窗口的历史数据（用于异常详情内嵌趋势小图）
// GET /api/sensors/window?sensor_tag=xxx&center=<ISO或时间串>&minutes=30

import { NextRequest, NextResponse } from 'next/server';
import { queryWithCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sensorTag = searchParams.get('sensor_tag') || '';
  const center = searchParams.get('center') || '';
  const minutes = Math.min(Math.max(Number(searchParams.get('minutes')) || 30, 5), 240);

  if (!sensorTag || !center) {
    return NextResponse.json({ success: false, error: 'missing sensor_tag/center' }, { status: 400 });
  }
  const c = new Date(center.includes('T') ? center : center.replace(' ', 'T'));
  if (!isFinite(c.getTime())) {
    return NextResponse.json({ success: false, error: 'invalid center' }, { status: 400 });
  }

  const start = new Date(c.getTime() - minutes * 60000);
  const end = new Date(c.getTime() + minutes * 60000);
  const sql = `
    SELECT ts, avg_val AS sensor_value
    FROM stats_1m_agg
    WHERE sensor_tag = '${escapeSql(sensorTag)}'
      AND ts >= '${fmtLocal(start)}' AND ts <= '${fmtLocal(end)}'
    ORDER BY ts ASC
  `;

  try {
    const rows = await queryWithCache<Record<string, unknown>[]>(
      `window:${sensorTag}:${fmtLocal(start)}:${fmtLocal(end)}`,
      sql,
      60000,
    );
    return NextResponse.json({
      success: true,
      sensor_tag: sensorTag,
      center: c.toISOString(),
      minutes,
      points: rows.map((r) => ({ ts: r.ts, sensor_value: r.sensor_value })),
    });
  } catch (err) {
    console.error('sensor window error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message, points: [] }, { status: 500 });
  }
}
