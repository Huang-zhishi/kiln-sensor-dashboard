// TDengine REST API connection layer with connection pooling and caching
// 凭据一律从环境变量读取（见项目根目录 .env，已被 .gitignore 排除）

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

const BASE_URL = `http://${TDENGINE_HOST}:${TDENGINE_PORT}/rest/sql/${TDENGINE_DATABASE}`;
const AUTH_HEADER = 'Basic ' + Buffer.from(`${TDENGINE_USER}:${TDENGINE_PASSWORD}`).toString('base64');

// 缓存配置
// SSE Hub 每 2s tick 一次，TTL 决定真实查询频率；缓存命中则直接广播
export const CACHE_TTL = {
  stats: 60000,      // 60 秒
  latest: 5000,      // 5 秒
  history: 15000,    // 15 秒
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
 * 使用 keep-alive 连接复用；带 10 秒超时，防止慢查询挂起导致请求堆积
 */
export async function query(sql: string): Promise<TDengineResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/text',
        'Connection': 'keep-alive',
      },
      body: sql,
      signal: controller.signal,
    });

    const result = (await res.json()) as TDengineResult;

    if (result.code !== 0) {
      throw new Error(`TDengine error (code ${result.code}): ${result.desc || 'Unknown error'}`);
    }

    return result;
  } finally {
    clearTimeout(timer);
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
