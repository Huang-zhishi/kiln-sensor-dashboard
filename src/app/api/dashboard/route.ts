import { NextResponse } from 'next/server';
import { query, toRows, queryWithCache, CACHE_TTL } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

// 标准 SQL 转义（TDengine 适用）：单引号双写 + 反斜杠转义
function escapeSql(s: string): string {
  return s.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

// 趋势图一次最多查询的传感器数（与前端显示上限一致，防止拖垮后端）
const MAX_TREND_SENSORS = 12;

function buildHistoryQuery(
  timeRange: string,
  kiln_id: string,
  sensor_tag: string,
  sensors: string[] | null = null,
): string {
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

  // 显式空选择（sensors 参数存在但为空）：用户清空了趋势图，无需查库
  if (sensors !== null && sensors.length === 0) {
    return `
      SELECT _wstart as ts, AVG(sensor_value) as sensor_value,
             sensor_tag, device_id
      FROM sensor_readings
      WHERE 1=0
      PARTITION BY sensor_tag, device_id
      INTERVAL(${interval})
    `;
  }

  let whereClause = `ts > NOW() - ${hours}`;
  if (kiln_id) whereClause += ` AND sensor_tag LIKE '${escapeSql(kiln_id)}%'`;
  if (sensors !== null) {
    // 精确按传感器列表查询（趋势图只拉选中传感器，避免全量 116 个的历史）
    const limited = sensors.slice(0, MAX_TREND_SENSORS);
    const list = limited.map((s) => `'${escapeSql(s)}'`).join(',');
    whereClause += ` AND sensor_tag IN (${list})`;
  } else if (sensor_tag) {
    whereClause += ` AND sensor_tag = '${escapeSql(sensor_tag)}'`;
  }

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
  // 逗号分隔的传感器列表（趋势图精确查询用）；null = 未传（兼容旧调用，查全部）
  const sensorsParam = searchParams.get('sensors');
  const sensors: string[] | null = sensorsParam === null
    ? null
    : sensorsParam.split(',').map((s) => s.trim()).filter(Boolean);

  try {
    // 并行执行查询，stats 使用缓存
    const [latestResult, statsResult, historyResult] = await Promise.all([
      // 1. 最新数据查询（带缓存，10 秒；key 含筛选参数避免串数据）
      queryWithCache(`latest:${device_id}`, `
        SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value,
               device_id, sensor_tag
        FROM sensor_readings
        ${device_id ? `WHERE device_id = '${escapeSql(device_id)}'` : ''}
        PARTITION BY device_id, sensor_tag
      `, CACHE_TTL.latest),

      // 2. 统计数据查询（带缓存，15 秒；key 含筛选参数避免串数据）
      queryWithCache(`stats:${kiln_id}`, `
        SELECT
          COUNT(ts) as total,
          sensor_tag,
          device_id,
          AVG(sensor_value) as avg_val,
          MIN(sensor_value) as min_val,
          MAX(sensor_value) as max_val
        FROM sensor_readings
        WHERE ts > NOW() - 24h
        ${kiln_id ? `AND sensor_tag LIKE '${escapeSql(kiln_id)}%'` : ''}
        GROUP BY sensor_tag, device_id
      `, CACHE_TTL.stats),

      // 3. 历史趋势查询（精确到选中传感器；缓存 60 秒避免轮询重复拖库）
      queryWithCache(
        `history:${timeRange}:${kiln_id}:${sensors === null ? '*' : sensors.join('|')}`,
        buildHistoryQuery(timeRange, kiln_id, sensor_tag, sensors),
        CACHE_TTL.history,
      ),
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
    const historyData = (historyResult as Record<string, unknown>[]).map((r) => ({
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
