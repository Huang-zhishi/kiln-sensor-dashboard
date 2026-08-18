import { NextResponse } from 'next/server';
import { queryWithCache, CACHE_TTL } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get distinct device_ids（设备列表变化极慢，缓存 60 秒）
    const devicesResult = await queryWithCache('stats:devices',
      'SELECT DISTINCT device_id FROM sensor_readings ORDER BY device_id',
      CACHE_TTL.history,
    );
    const devices = (devicesResult as Record<string, unknown>[]).map((r) => ({ device_id: r.device_id }));

    // Get distinct sensor_tags（传感器列表变化极慢，缓存 60 秒）
    const tagsResult = await queryWithCache('stats:tags',
      'SELECT DISTINCT sensor_tag FROM sensor_readings ORDER BY sensor_tag',
      CACHE_TTL.history,
    );
    const sensorTags = (tagsResult as Record<string, unknown>[]).map((r) => ({ sensor_tag: r.sensor_tag }));

    // Extract kiln_ids from sensor_tags (e.g. "1#窑体温度TI_206A" -> "1#")
    const kilnIdSet = new Set<string>();
    sensorTags.forEach((t) => {
      const match = String(t.sensor_tag).match(/^(\d+#)/);
      if (match) kilnIdSet.add(match[1]);
    });
    const kilns = Array.from(kilnIdSet).sort().map((k) => ({ kiln_id: k }));

    // Get stats per sensor over last 24 hours（统计值 15 秒缓存）
    // TDengine: use COUNT(ts) instead of COUNT(*)
    const statsResult = await queryWithCache('stats:agg', `
      SELECT AVG(sensor_value) as avg_value, 
             MIN(sensor_value) as min_value,
             MAX(sensor_value) as max_value,
             COUNT(ts) as cnt,
             sensor_tag, device_id
      FROM sensor_readings
      WHERE ts > NOW() - 24h
      GROUP BY sensor_tag, device_id
      ORDER BY sensor_tag
    `, CACHE_TTL.stats);
    const statsRaw = statsResult as Record<string, unknown>[];
    const stats = statsRaw.map((r) => ({
      kiln_id: extractKilnId(String(r.sensor_tag || '')),
      sensor_tag: r.sensor_tag,
      avg_value: r.avg_value,
      min_value: r.min_value,
      max_value: r.max_value,
      count: r.cnt,
    }));

    // Get total record count（全表 COUNT 开销大，缓存 60 秒）
    const totalResult = await queryWithCache('stats:total',
      'SELECT COUNT(ts) as total FROM sensor_readings',
      CACHE_TTL.history,
    );
    const totalRows = totalResult as Record<string, unknown>[];
    const totalRecords = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

    return NextResponse.json({
      success: true,
      data: {
        kilns,
        sensorTags,
        devices,
        stats,
        totalRecords,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
