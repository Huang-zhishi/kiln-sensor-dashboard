import { NextResponse } from 'next/server';
import { query, toRows, queryWithCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

function extractKilnId(sensorTag: string): string {
  if (sensorTag.startsWith('1#')) return '1#';
  if (sensorTag.startsWith('2#')) return '2#';
  return '';
}

function buildHistoryQuery(timeRange: string, kiln_id: string, sensor_tag: string): string {
  const timeMap: Record<string, string> = {
    '10m': '10m',
    '30m': '30m',
    '1h': '1h',
    '6h': '6h',
    '12h': '12h',
    '24h': '24h',
  };
  const hours = timeMap[timeRange] || '12h';

  const intervalMap: Record<string, string> = {
    '10m': '10s',
    '30m': '10s',
    '1h': '1m',
    '6h': '1m',
    '12h': '1h',
    '24h': '1h',
  };
  const interval = intervalMap[timeRange] || '1h';

  let whereClause = `ts > NOW() - ${hours}`;
  if (kiln_id) whereClause += ` AND sensor_tag LIKE '${kiln_id}%'`;
  if (sensor_tag) whereClause += ` AND sensor_tag = '${sensor_tag}'`;

  return `
    SELECT _wstart as ts, AVG(sensor_value) as sensor_value,
           sensor_tag, device_id
    FROM sensor_readings
    WHERE ${whereClause}
    PARTITION BY sensor_tag, device_id
    INTERVAL(${interval})
  `;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kiln_id = searchParams.get('kiln_id') || '';
  const sensor_tag = searchParams.get('sensor_tag') || '';
  const device_id = searchParams.get('device_id') || '';
  const timeRange = searchParams.get('time_range') || '12h';

  try {
    // 并行执行查询，stats 使用缓存
    const [latestResult, statsResult, historyResult] = await Promise.all([
      // 1. 最新数据查询（带缓存，10 秒）
      queryWithCache('latest', `
        SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value,
               device_id, sensor_tag
        FROM sensor_readings
        ${device_id ? `WHERE device_id = '${device_id}'` : ''}
        PARTITION BY device_id, sensor_tag
      `),

      // 2. 统计数据查询（带缓存，30 秒）
      queryWithCache('stats', `
        SELECT
          COUNT(ts) as total,
          sensor_tag,
          device_id,
          AVG(sensor_value) as avg_val,
          MIN(sensor_value) as min_val,
          MAX(sensor_value) as max_val
        FROM sensor_readings
        WHERE ts > NOW() - 24h
        ${kiln_id ? `AND sensor_tag LIKE '${kiln_id}%'` : ''}
        GROUP BY sensor_tag, device_id
      `),

      // 3. 历史趋势查询（不缓存，实时）
      query(buildHistoryQuery(timeRange, kiln_id, sensor_tag)),
    ]);

    // 解析最新数据
    const latestData = (latestResult as Array<Record<string, unknown>>).map((r) => ({
      device_id: r.device_id,
      kiln_id: extractKilnId(String(r.sensor_tag || '')),
      sensor_tag: r.sensor_tag,
      sensor_value: Number(r.sensor_value) || 0,
      reported_at: r.ts,
    }));

    // 解析统计数据
    const statsRows = statsResult as Array<Record<string, unknown>>;
    const kilns = Array.from(new Set(statsRows.map((r) => extractKilnId(String(r.sensor_tag || '')))))
      .filter(Boolean)
      .map((k) => ({ kiln_id: k }));
    const sensorTags = Array.from(new Set(statsRows.map((r) => r.sensor_tag)))
      .filter(Boolean)
      .map((t) => ({ sensor_tag: t }));
    const devices = Array.from(new Set(statsRows.map((r) => r.device_id)))
      .filter(Boolean)
      .map((d) => ({ device_id: d }));
    const totalRecords = statsRows.reduce((sum, r) => sum + Number(r.total || 0), 0);

    // 解析历史数据
    const historyData = toRows(historyResult).map((r) => ({
      device_id: r.device_id,
      kiln_id: extractKilnId(String(r.sensor_tag || '')),
      sensor_tag: r.sensor_tag,
      sensor_value: Number(r.sensor_value) || 0,
      reported_at: r.ts,
    }));

    return NextResponse.json({
      success: true,
      data: {
        latest: latestData,
        stats: {
          kilns,
          sensorTags,
          devices,
          totalRecords,
          stats: statsRows.map((r) => ({
            kiln_id: extractKilnId(String(r.sensor_tag || '')),
            sensor_tag: r.sensor_tag,
            avg_value: String(Number(r.avg_val || 0).toFixed(2)),
            min_value: String(Number(r.min_val || 0).toFixed(2)),
            max_value: String(Number(r.max_val || 0).toFixed(2)),
          })),
        },
        history: historyData,
      },
    });
  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
