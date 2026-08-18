import { NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // TDengine: use LAST_ROW() with subtable to get latest per sensor
    // Since each sensor has its own subtable, we query the super table with PARTITION BY
    const sql = `
      SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value, 
             device_id, sensor_tag
      FROM sensor_readings
      PARTITION BY device_id, sensor_tag
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
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
