// TDengine WebSocket 连接层（连接池 + 缓存）
// 相比 REST：长连接省去每次查询的 TCP+HTTP 开销，延迟 37ms → 个位数 ms
// 凭据一律从环境变量读取（见项目根目录 .env，已被 .gitignore 排除）

import taos from '@tdengine/websocket';

const TDENGINE_HOST = process.env.TDENGINE_HOST || '192.168.1.78';
const TDENGINE_PORT = Number(process.env.TDENGINE_PORT) || 6041;
const TDENGINE_USER = process.env.TDENGINE_USER;
const TDENGINE_PASSWORD = process.env.TDENGINE_PASSWORD;
const TDENGINE_DATABASE = process.env.TDENGINE_DATABASE || 'test';

if (!TDENGINE_USER || !TDENGINE_PASSWORD) {
  throw new Error(
    'Missing TDengine credentials: set TDENGINE_USER and TDENGINE_PASSWORD in .env',
  );
}

// 非空收敛（上面的 guard 已保证非空）
const WS_USER: string = TDENGINE_USER;
const WS_PASSWORD: string = TDENGINE_PASSWORD;

// 缓存配置
// SSE Hub 每 2s tick 一次，TTL 决定真实查询频率；缓存命中则直接广播
export const CACHE_TTL = {
  stats: 60000,      // 60 秒
  latest: 5000,      // 5 秒
  history: 15000,    // 15 秒
};

const QUERY_TIMEOUT_MS = 10000;
const WS_POOL_SIZE = 4;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ---------- WebSocket 连接池 ----------

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

interface WsMetaColumn {
  name: string;
  type: string | number;
  length?: number;
}

interface WsRows {
  getMeta(): WsMetaColumn[];
  next(): Promise<boolean>;
  getData(): unknown[];
  close(): Promise<void>;
}

interface WsConnection {
  query(sql: string): Promise<WsRows>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

interface PooledConn {
  conn: WsConnection;
  busy: boolean;
  waiters: Array<() => void>;
}

const pool: PooledConn[] = [];
let poolInitFailed = false;

async function createConn(): Promise<WsConnection> {
  const conf = new taos.WSConfig(`ws://${TDENGINE_HOST}:${TDENGINE_PORT}`);
  conf.setUser(WS_USER);
  conf.setPwd(WS_PASSWORD);
  conf.setDb(TDENGINE_DATABASE);
  conf.setTimeOut(QUERY_TIMEOUT_MS);
  return (await taos.sqlConnect(conf)) as unknown as WsConnection;
}

async function acquire(): Promise<PooledConn> {
  // 优先复用空闲连接
  let entry = pool.find((p) => !p.busy);
  if (!entry && pool.length < WS_POOL_SIZE) {
    try {
      const conn = await createConn();
      entry = { conn, busy: false, waiters: [] };
      pool.push(entry);
      poolInitFailed = false;
    } catch (err) {
      poolInitFailed = true;
      throw err;
    }
  }
  if (!entry) {
    // 全忙：等待最早创建的连接释放
    entry = pool[0];
    if (!entry) throw new Error('TDengine pool empty');
    if (entry.busy) {
      await new Promise<void>((resolve) => entry!.waiters.push(resolve));
    }
  }
  entry.busy = true;
  return entry;
}

function release(entry: PooledConn) {
  entry.busy = false;
  const next = entry.waiters.shift();
  if (next) next();
}

function evict(entry: PooledConn) {
  const idx = pool.indexOf(entry);
  if (idx >= 0) pool.splice(idx, 1);
  entry.waiters.forEach((w) => w());
  entry.waiters = [];
  entry.conn.close().catch(() => {});
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TDengine query timeout (${ms}ms)`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ---------- 结果转换 ----------

export interface TDengineColumn {
  name: string;
  type: string;
  length: number;
}

export interface TDengineResult {
  code: number;
  column_meta: [string, string, number][];
  data: unknown[][];
  rows: number;
  desc?: string;
}

// WS 返回 TIMESTAMP 为 bigint；按量级自适应单位（实测连接器返回毫秒）
function toMsTimestamp(n: number): string {
  let ms = n;
  if (n > 1e17) ms = n / 1_000_000;        // 纳秒
  else if (n > 1e14) ms = n / 1_000;        // 微秒
  else if (n > 1e11) ms = n;                // 毫秒
  else ms = n * 1000;                       // 秒
  return new Date(ms).toISOString();
}

function convertValue(value: unknown, col: WsMetaColumn): unknown {
  const typeStr = typeof col.type === 'string' ? col.type.toUpperCase() : '';
  const isTsColumn = typeStr.includes('TIMESTAMP');
  if (typeof value === 'bigint') {
    const n = Number(value);
    if (isTsColumn) return toMsTimestamp(n);
    // 未知类型的 bigint：时间戳量级按时间戳处理，其余当数值
    if (!typeStr && n > 1e11) return toMsTimestamp(n);
    return n;
  }
  if (typeof value === 'number' && isTsColumn && value > 1e11) {
    return toMsTimestamp(value);
  }
  return value;
}

/**
 * Execute a SQL statement against TDengine via WebSocket
 * 连接池复用长连接；带 10 秒超时，超时的连接会被废弃重建
 */
export async function query(sql: string): Promise<TDengineResult> {
  if (pool.length === 0 && poolInitFailed) {
    // 上次连接失败，直接重试建连（不做长期负缓存，TDengine 恢复后自动重连）
    poolInitFailed = false;
  }

  const entry = await acquire();
  try {
    const wsRows = await withTimeout(entry.conn.query(sql), QUERY_TIMEOUT_MS);
    const meta = wsRows.getMeta();
    const data: Record<string, unknown>[] = [];
    while (await wsRows.next()) {
      const values = wsRows.getData();
      const row: Record<string, unknown> = {};
      meta.forEach((col, idx) => {
        row[col.name] = convertValue(values[idx], col);
      });
      data.push(row);
    }
    wsRows.close().catch(() => {});
    return {
      code: 0,
      column_meta: meta.map((c) => [c.name, String(c.type), c.length ?? 0]) as TDengineResult['column_meta'],
      data: data as unknown as unknown[][],
      rows: data.length,
    };
  } catch (err) {
    // 查询失败（超时/断连）的连接直接废弃，下次调用重建，避免池中留有坏连接
    evict(entry);
    throw err;
  } finally {
    if (pool.includes(entry)) release(entry);
  }
}

// 同 key 的 in-flight 查询共享同一个 Promise，防止缓存过期瞬间的并发击穿
const inflight = new Map<string, Promise<unknown>>();

/**
 * 带缓存的查询函数（含缓存击穿去重）
 * @param key 缓存键（含查询参数，避免不同筛选串数据）
 * @param sql 查询语句
 * @param ttl 缓存有效期（毫秒），默认 10 秒
 */
export async function queryWithCache<T>(cacheKey: string, sql: string, ttl?: number): Promise<T> {
  const ttlMs = ttl ?? CACHE_TTL.latest;

  // 尝试从缓存获取
  const cached = getCached<T>(cacheKey, ttlMs);
  if (cached !== null) {
    return cached;
  }

  // 并发请求共享同一次查询
  const existing = inflight.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const result = await query(sql);
    const data = toRows(result) as unknown as T;
    setCache(cacheKey, data);
    return data;
  })().finally(() => {
    inflight.delete(cacheKey);
  });
  inflight.set(cacheKey, promise);

  return promise;
}

/**
 * Convert TDengine result to array of objects
 */
export function toRows(result: TDengineResult): Record<string, unknown>[] {
  if (!result.data || result.data.length === 0) return [];

  if (typeof result.data[0] === 'object' && !Array.isArray(result.data[0])) {
    return result.data as unknown as Record<string, unknown>[];
  }

  const columns = result.column_meta.map((c) => c[0]);
  return (result.data as unknown[][]).map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// Re-export types for API routes
export interface SensorReading {
  ts: string;
  sensor_value: number;
  device_id: string;
  sensor_tag: string;
}
