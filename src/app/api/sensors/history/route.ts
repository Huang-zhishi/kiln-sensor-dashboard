import { NextRequest, NextResponse } from 'next/server';
import { queryWithCache, CACHE_TTL } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';
import { resolveTimeWindow } from '@/lib/time-range';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kilnId = searchParams.get('kiln_id');
    const sensorTag = searchParams.get('sensor_tag');
    // time_range 预设（10m/30m/1h/6h/12h/24h/3d/7d/15d/30d）
    // 或自定义区间 start/end（epoch 毫秒或 ISO 时间串）
    const timeRange = searchParams.get('time_range') || '12h';
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const win = resolveTimeWindow({ timeRange, start, end });

    const conditions: string[] = [win.tsCondition];
    if (kilnId) {
      conditions.push(`sensor_tag LIKE '${escapeSql(kilnId)}%'`);
    }
    if (sensorTag) {
      conditions.push(`sensor_tag = '${escapeSql(sensorTag)}'`);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // TDengine: INTERVAL + PARTITION BY (no GROUP BY allowed with INTERVAL)
    const sql = `
      SELECT _wstart as ts, AVG(sensor_value) as sensor_value, sensor_tag, device_id
      FROM sensor_readings
      ${whereClause}
      PARTITION BY sensor_tag, device_id
      INTERVAL(${win.interval})
      ORDER BY ts ASC
    `;

    const rows = await queryWithCache<Record<string, unknown>[]>(
      `history:${win.tsCondition}:${win.interval}:${kilnId ?? ''}:${sensorTag ?? ''}`,
      sql,
      CACHE_TTL.history,
    );

    const data = rows.map((r) => ({
      device_id: r.device_id,
      kiln_id: extractKilnId(String(r.sensor_tag || '')),
      sensor_tag: r.sensor_tag,
      sensor_value: r.sensor_value,
      reported_at: r.ts,
    }));

    return NextResponse.json({
      success: true,
      time_range: timeRange,
      interval: win.interval,
      custom: win.isCustom,
      start: win.startMs,
      end: win.endMs,
      data,
      count: data.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('History API error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
