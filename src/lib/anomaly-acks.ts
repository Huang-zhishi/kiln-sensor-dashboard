// 异常「已处理」状态存储：TDengine 追加式，无法 UPDATE，故用独立超级表 anomaly_acks
// 以 event_key 为粒度，取 LAST(status) 得到最新状态（acked / reopened）。
// 中控台账号具备写权限，直接写入。

import { execute, query, toRows } from '@/lib/db';

const ACK_STABLE = 'anomaly_acks';
let ensured = false;

export type AckStatus = 'acked' | 'new';

export interface AckInfo {
  status: AckStatus;
  ackedAt: string | null;
}

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await execute(
    `CREATE STABLE IF NOT EXISTS ${ACK_STABLE} (ts TIMESTAMP, event_key NCHAR(200), status NCHAR(16)) TAGS (device_id NCHAR(64))`,
  );
  ensured = true;
}

/** 拉取所有事件的「已处理」状态（表不存在/失败时视为全部未处理）。 */
export async function fetchAcks(): Promise<Map<string, AckInfo>> {
  const map = new Map<string, AckInfo>();
  try {
    const res = await query(
      `SELECT event_key, LAST(status) AS status, LAST(ts) AS acked_at FROM ${ACK_STABLE} GROUP BY event_key`,
    );
    for (const r of toRows(res)) {
      const key = String(r.event_key ?? '');
      if (!key) continue;
      const st = String(r.status ?? '');
      map.set(key, { status: st === 'acked' ? 'acked' : 'new', ackedAt: r.acked_at ? String(r.acked_at) : null });
    }
  } catch {
    // 表尚未创建 → 全部视为未处理
  }
  return map;
}

/** 写入一条处理状态（acked=已处理；new=取消处理/reopened）。 */
export async function writeAck(eventKey: string, deviceId: string, status: AckStatus): Promise<void> {
  await ensureTable();
  const safeDevice = (deviceId || 'unknown').replace(/[^A-Za-z0-9_]/g, '_') || 'unknown';
  const stored = status === 'acked' ? 'acked' : 'reopened';
  const sql =
    `INSERT INTO d_ack_${safeDevice} USING ${ACK_STABLE} TAGS ('${escapeSql(deviceId || 'unknown')}') ` +
    `VALUES (NOW, '${escapeSql(eventKey)}', '${stored}')`;
  await execute(sql);
}
