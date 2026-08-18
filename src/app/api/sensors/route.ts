import { NextRequest, NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kilnId = searchParams.get('kiln_id');
    const deviceId = searchParams.get('device_id');
    const sensorTag = searchParams.get('sensor_tag');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 1000);

    let sql = 'SELECT ts, sensor_value, device_id, sensor_tag FROM sensor_readings WHERE 1=1';
    const conditions: string[] = [];

    if (kilnId) {
      conditions.push(`sensor_tag LIKE '${escapeSql(kilnId)}%'`);
    }
    if (deviceId) {
      conditions.push(`device_id = '${escapeSql(deviceId)}'`);
    }
    if (sensorTag) {
      conditions.push(`sensor_tag = '${escapeSql(sensorTag)}'`);
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY ts DESC LIMIT ${limit}`;

    const result = await query(sql);
    const rows = toRows(result);

    // Normalize field names for frontend compatibility
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
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, '\\\\');
}
