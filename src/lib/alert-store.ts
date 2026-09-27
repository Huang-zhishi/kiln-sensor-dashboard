// 告警事件与处理记录（TDengine 追加式）
// - alert_events：规则每次「触发/恢复」状态切换写一行，用于活动告警与历史
// - alert_acks：处理闭环（处理人 / 处理意见 / 根因），按 event_key 取 LAST
//
// 注意：TDengine 中 value / state / comment 是保留字，故物理列名用
// cur_value / event_state / remark，查询后在 JS 层映射回对外字段名。

import { execute, query, toRows } from './db';

const EVENT_STABLE = 'alert_events';
const ACK_STABLE = 'alert_acks';

let ensured = false;

export function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/** TDengine 子表名不能含特殊字符 */
export function safeIdent(s: string): string {
  return (s || 'unknown').replace(/[^A-Za-z0-9_]/g, '_') || 'unknown';
}

export interface AlertEventInput {
  eventKey: string;
  ruleId: string;
  sensorTag: string;
  deviceId: string;
  severity: string;
  direction: string;
  /** active | resolved */
  state: string;
  value: number;
  threshold: number;
  message: string;
  /** sent | failed | skipped | none */
  notify: string;
}

export interface AlertAckRecord {
  status: 'acked' | 'new';
  handler: string;
  comment: string;
  rootCause: string;
  ackedAt: string | null;
}

export async function ensureAlertTables(): Promise<void> {
  if (ensured) return;
  await execute(
    `CREATE STABLE IF NOT EXISTS ${EVENT_STABLE} (` +
      'ts TIMESTAMP, event_key NCHAR(200), rule_id NCHAR(64), sensor_tag NCHAR(128), ' +
      'severity NCHAR(8), direction NCHAR(8), event_state NCHAR(12), cur_value DOUBLE, ' +
      'threshold DOUBLE, message NCHAR(255), notify NCHAR(16)' +
      `) TAGS (device_id NCHAR(64))`,
  );
  await execute(
    `CREATE STABLE IF NOT EXISTS ${ACK_STABLE} (` +
      'ts TIMESTAMP, event_key NCHAR(200), status NCHAR(16), handler NCHAR(64), ' +
      'remark NCHAR(500), root_cause NCHAR(255)' +
      `) TAGS (device_id NCHAR(64))`,
  );
  ensured = true;
}

/** 物理行 → 对外字段（cur_value→value / event_state→state） */
function mapEventRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    ts: r.ts,
    event_key: r.event_key,
    rule_id: r.rule_id,
    sensor_tag: r.sensor_tag,
    device_id: r.device_id,
    severity: r.severity,
    direction: r.direction,
    state: r.event_state,
    value: r.cur_value,
    threshold: r.threshold,
    message: r.message,
    notify: r.notify,
  };
}

export async function appendAlertEvent(ev: AlertEventInput): Promise<void> {
  await ensureAlertTables();
  const sub = `d_aevent_${safeIdent(ev.deviceId)}`;
  const sql =
    `INSERT INTO ${sub} USING ${EVENT_STABLE} TAGS ('${escapeSql(ev.deviceId || 'unknown')}') ` +
    `VALUES (NOW, '${escapeSql(ev.eventKey)}', '${escapeSql(ev.ruleId)}', '${escapeSql(ev.sensorTag)}', ` +
    `'${escapeSql(ev.severity)}', '${escapeSql(ev.direction)}', '${escapeSql(ev.state)}', ` +
    `${Number(ev.value) || 0}, ${Number(ev.threshold) || 0}, '${escapeSql(ev.message)}', '${escapeSql(ev.notify)}')`;
  await execute(sql);
}

export async function fetchAlertEvents(hours = 168, limit = 300): Promise<Record<string, unknown>[]> {
  await ensureAlertTables();
  const sql = `
    SELECT ts, event_key, rule_id, sensor_tag, device_id, severity, direction,
           event_state, cur_value, threshold, message, notify
    FROM ${EVENT_STABLE}
    WHERE ts > NOW() - ${Math.max(1, Math.floor(hours))}h
    ORDER BY ts DESC
    LIMIT ${Math.min(Math.max(Math.floor(limit), 1), 1000)}
  `;
  const res = await query(sql);
  return toRows(res).map(mapEventRow);
}

export async function fetchAlertEventByKey(eventKey: string): Promise<Record<string, unknown> | null> {
  await ensureAlertTables();
  const sql = `
    SELECT ts, event_key, rule_id, sensor_tag, device_id, severity, direction,
           event_state, cur_value, threshold, message, notify
    FROM ${EVENT_STABLE}
    WHERE event_key = '${escapeSql(eventKey)}'
    ORDER BY ts DESC
    LIMIT 1
  `;
  const rows = await query(sql).then((r) => toRows(r));
  return rows.length > 0 ? mapEventRow(rows[0]) : null;
}

export async function fetchAlertAcks(): Promise<Map<string, AlertAckRecord>> {
  const map = new Map<string, AlertAckRecord>();
  try {
    const res = await query(
      `SELECT event_key, LAST(status) AS status, LAST(handler) AS handler, ` +
        `LAST(remark) AS remark, LAST(root_cause) AS root_cause, LAST(ts) AS acked_at ` +
        `FROM ${ACK_STABLE} GROUP BY event_key`,
    );
    for (const r of toRows(res)) {
      const key = String(r.event_key ?? '');
      if (!key) continue;
      map.set(key, {
        status: String(r.status ?? '') === 'acked' ? 'acked' : 'new',
        handler: String(r.handler ?? ''),
        comment: String(r.remark ?? ''),
        rootCause: String(r.root_cause ?? ''),
        ackedAt: r.acked_at ? String(r.acked_at) : null,
      });
    }
  } catch {
    // 表尚未创建 → 全部视为未处理
  }
  return map;
}

export interface AckInput {
  eventKey: string;
  deviceId: string;
  status: 'acked' | 'new';
  handler?: string;
  comment?: string;
  rootCause?: string;
}

export async function writeAlertAck(input: AckInput): Promise<void> {
  await ensureAlertTables();
  const sub = `d_aack_${safeIdent(input.deviceId)}`;
  const status = input.status === 'acked' ? 'acked' : 'reopened';
  const sql =
    `INSERT INTO ${sub} USING ${ACK_STABLE} TAGS ('${escapeSql(input.deviceId || 'unknown')}') ` +
    `VALUES (NOW, '${escapeSql(input.eventKey)}', '${escapeSql(status)}', ` +
    `'${escapeSql(input.handler || '')}', '${escapeSql(input.comment || '')}', '${escapeSql(input.rootCause || '')}')`;
  await execute(sql);
}
