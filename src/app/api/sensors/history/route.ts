import { NextRequest, NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

// Map time range to TDengine INTERVAL and hours
function getIntervalConfig(timeRange: string): { hours: number; interval: string } {
  switch (timeRange) {
    case '10m':  return { hours: 0, interval: '10s' };
    case '30m':  return { hours: 0, interval: '10s' };
    case '1h':   return { hours: 1, interval: '1m' };
    case '6h':   return { hours: 6, interval: '1m' };
    case '12h':  return { hours: 12, interval: '1h' };
    case '24h':  return { hours: 24, interval: '1h' };
    default:     return { hours: 12, interval: '1h' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kilnId = searchParams.get('kiln_id');
    const sensorTag = searchParams.get('sensor_tag');
    const timeRange = searchParams.get('time_range') || '12h';

    const { hours, interval } = getIntervalConfig(timeRange);

    const conditions: string[] = [];

    // Build time condition
    if (hours > 0) {
      conditions.push(`ts > NOW() - ${hours}h`);
    } else {
      // For sub-hour ranges, use minutes/seconds
      if (timeRange === '10m') conditions.push(`ts > NOW() - 10m`);
      else if (timeRange === '30m') conditions.push(`ts > NOW() - 30m`);
      else conditions.push(`ts > NOW() - 12h`);
    }

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
      INTERVAL(${interval})
      ORDER BY ts ASC
    `;

    const result = await query(sql);
    const rows = toRows(result);

    const data = rows.map((r) => ({
      device_id: r.device_id,
      kiln_id: extractKilnId(String(r.sensor_tag || '')),
      sensor_tag: r.sensor_tag,
      sensor_value: r.sensor_value,
      reported_at: r.ts,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('History API error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
