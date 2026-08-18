// TDengine REST API connection layer with connection pooling and caching

const TDENGINE_HOST = process.env.TDENGINE_HOST || '8.134.81.26';
const TDENGINE_PORT = Number(process.env.TDENGINE_PORT) || 6041;
const TDENGINE_USER = process.env.TDENGINE_USER || 'root';
const TDENGINE_PASSWORD = process.env.TDENGINE_PASSWORD || 'taosdata';
const TDENGINE_DATABASE = process.env.TDENGINE_DATABASE || 'ams';

const BASE_URL = `http://${TDENGINE_HOST}:${TDENGINE_PORT}/rest/sql/${TDENGINE_DATABASE}`;
const AUTH_HEADER = 'Basic ' + Buffer.from(`${TDENGINE_USER}:${TDENGINE_PASSWORD}`).toString('base64');

// 缓存配置
export const CACHE_TTL = {
  stats: 15000,      // 15 秒
  latest: 10000,     // 10 秒
  history: 60000,    // 60 秒
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

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

/**
 * Execute a SQL statement against TDengine via REST API
 * 使用 keep-alive 连接复用
 */
export async function query(sql: string): Promise<TDengineResult> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/text',
      'Connection': 'keep-alive',
    },
    body: sql,
  });

  const result = (await res.json()) as TDengineResult;

  if (result.code !== 0) {
    throw new Error(`TDengine error (code ${result.code}): ${result.desc || 'Unknown error'}`);
  }

  return result;
}

/**
 * 带缓存的查询函数
 * @param ttl 缓存有效期（毫秒），默认 10 秒
 */
export async function queryWithCache<T>(cacheKey: string, sql: string, ttl?: number): Promise<T> {
  const ttlMs = ttl ?? CACHE_TTL.latest;

  // 尝试从缓存获取
  const cached = getCached<T>(cacheKey, ttlMs);
  if (cached) {
    return cached;
  }

  // 执行查询
  const result = await query(sql);
  const data = toRows(result) as unknown as T;

  // 存入缓存
  setCache(cacheKey, data);

  return data;
}

/**
 * Convert TDengine result to array of objects
 */
export function toRows(result: TDengineResult): Record<string, unknown>[] {
  if (!result.data || result.data.length === 0) return [];

  const columns = result.column_meta.map((c) => c[0]);
  return result.data.map((row) => {
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
