// 共享数据提供层：/api/dashboard、/api/stream（SSE Hub）共用
// 所有查询走 queryWithCache，真实查询频率由 TTL 控制

import { queryWithCache, CACHE_TTL } from '@/lib/db';
import { extractKilnId } from '@/lib/sensor-classifier';

export interface DashboardParams {
  kiln_id: string;
  time_range: string;
  // null = 未指定（查全部）；[] = 用户显式清空；非空 = 精确传感器列表
  sensors: string[] | null;
}

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

function normalizeSensors(sensorsParam: string | null): string[] | null {
  return sensorsParam === null
    ? null
    : sensorsParam.split(',').map((s) => s.trim()).filter(Boolean);
}

// 解析 URL 参数 → DashboardParams（dashboard 路由与 SSE Hub 共用）
export function parseDashboardParams(searchParams: URLSearchParams): DashboardParams {
  return {
    kiln_id: searchParams.get('kiln_id') || '',
    time_range: searchParams.get('time_range') || '12h',
    sensors: normalizeSensors(searchParams.get('sensors')),
  };
}

// 传感器页历史查询（时间范围 → 聚合间隔，与 dashboard 映射保持一致）
function buildAllSensorsHistoryQuery(timeRange: string): string {
  const intervalMap: Record<string, string> = {
    '10m': '10s',
    '30m': '10s',
    '1h': '1m',
    '6h': '1m',
    '12h': '1h',
    '24h': '1h',
  };
  const interval = intervalMap[timeRange] || '1h';
  const hours = { '10m': '10m', '30m': '30m' }[timeRange] || `${parseInt(timeRange) || 12}h`;

  return `
    SELECT _wstart as ts, AVG(sensor_value) as sensor_value,
           sensor_tag, device_id
    FROM sensor_readings
    WHERE ts > NOW() - ${hours}
    PARTITION BY sensor_tag, device_id
    INTERVAL(${interval})
    ORDER BY ts ASC
  `;
}

// 大屏聚合数据：最新读数 + 统计 + 历史趋势
export async function fetchDashboardData(p: DashboardParams) {
  const { kiln_id, time_range, sensors } = p;

  const [latestRows, statsRows, historyRows] = await Promise.all([
    // 1. 最新数据（缓存 5s；key 含筛选参数避免串数据）
    queryWithCache<Record<string, unknown>[]>(`latest:${p.kiln_id || ''}:${p.sensors === null ? '' : 'f'}`, `
      SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value,
             device_id, sensor_tag
      FROM sensor_readings
      PARTITION BY device_id, sensor_tag
    `, CACHE_TTL.latest),

    // 2. 统计数据（24h 聚合，缓存 60s；ENABLE_STATS 应急开关）
    process.env.ENABLE_STATS === '1'
      ? queryWithCache<Record<string, unknown>[]>(`stats:${kiln_id}`, `
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
      `, CACHE_TTL.stats)
      : Promise.resolve([] as Record<string, unknown>[]),

    // 3. 历史趋势（缓存 15s）
    queryWithCache<Record<string, unknown>[]>(
      `history:${time_range}:${kiln_id}:${sensors === null ? '*' : sensors.join('|')}`,
      buildHistoryQuery(time_range, kiln_id, '', sensors),
      CACHE_TTL.history,
    ),
  ]);

  const latestData = latestRows.map((r) => ({
    device_id: r.device_id,
    kiln_id: extractKilnId(String(r.sensor_tag || '')),
    sensor_tag: r.sensor_tag,
    sensor_value: Number(r.sensor_value) || 0,
    reported_at: r.ts,
  }));

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

  const historyData = historyRows.map((r) => ({
    device_id: r.device_id,
    kiln_id: extractKilnId(String(r.sensor_tag || '')),
    sensor_tag: r.sensor_tag,
    sensor_value: Number(r.sensor_value) || 0,
    reported_at: r.ts,
  }));

  return {
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
  };
}

// 传感器页聚合数据：全部最新读数 + 全部传感器历史
export async function fetchSensorsData(time_range: string) {
  const [latestRows, historyRows] = await Promise.all([
    queryWithCache<Record<string, unknown>[]>('sensors-latest:all', `
      SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value,
             device_id, sensor_tag
      FROM sensor_readings
      PARTITION BY device_id, sensor_tag
    `, CACHE_TTL.latest),

    queryWithCache<Record<string, unknown>[]>(
      `sensors-history:${time_range}`,
      buildAllSensorsHistoryQuery(time_range),
      CACHE_TTL.history,
    ),
  ]);

  const latest = latestRows.map((r) => ({
    device_id: r.device_id,
    kiln_id: extractKilnId(String(r.sensor_tag || '')),
    sensor_tag: r.sensor_tag,
    sensor_value: Number(r.sensor_value) || 0,
    reported_at: r.ts,
  }));

  const history = historyRows.map((r) => ({
    device_id: r.device_id,
    kiln_id: extractKilnId(String(r.sensor_tag || '')),
    sensor_tag: r.sensor_tag,
    sensor_value: Number(r.sensor_value) || 0,
    reported_at: r.ts,
  }));

  return { latest, history };
}
