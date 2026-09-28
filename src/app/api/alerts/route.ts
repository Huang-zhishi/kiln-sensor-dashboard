// 告警中心数据接口
// GET /api/alerts?hours=168&limit=300
// 返回：活动告警（规则引擎实时评估）+ 历史事件（规则告警 + 极值异常，合并处理记录）+ 规则数
//
// 统一说明：本接口把两个来源合并为同一列表——
//   source='rule'    规则告警（alert_events，引擎产生）
//   source='anomaly' 极值异常（anomaly_events，Agent 产生）
// 处理状态统一：优先读 alert_acks（本页处理），其次 anomaly_acks（首页历史处理）。

import { NextResponse } from 'next/server';
import { evaluateAlerts, ensureAlertEngine, getActiveAlerts, getLastEval } from '@/lib/alert-engine';
import { fetchAlertEvents, type AlertAckRecord } from '@/lib/alert-store';
import { fetchMergedAcks } from '@/lib/acks';
import { loadRules } from '@/lib/alert-rules';
import { query, toRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function fetchAnomalyEvents(hours: number, limit: number): Promise<Record<string, unknown>[]> {
  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction, baseline_min, baseline_max,
           device_id, kiln_id, note,
           CASE WHEN report IS NULL OR report = '' THEN 0 ELSE 1 END AS has_report
    FROM anomaly_events
    WHERE ts > NOW() - ${Math.max(1, Math.floor(hours))}h
    ORDER BY ts DESC
    LIMIT ${Math.min(Math.max(Math.floor(limit), 1), 1000)}
  `;
  const res = await query(sql);
  return toRows(res);
}

export async function GET(request: Request) {
  ensureAlertEngine();
  // 即时评估一次，保证首屏活动态准确（内部有 in-flight 去重 + 5s 缓存）
  await evaluateAlerts();

  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 300, 1), 1000);
  const sourceFilter = searchParams.get('source') || ''; // rule | anomaly | ''

  let acks = new Map<string, AlertAckRecord>();
  let alertRows: Record<string, unknown>[] = [];
  let anomalyRows: Record<string, unknown>[] = [];
  let warning = '';
  try {
    // 统一处理记录（alert_acks 为准，anomaly_acks 兜底）
    acks = await fetchMergedAcks();
  } catch {
    // ignore
  }
  try {
    if (sourceFilter !== 'anomaly') alertRows = await fetchAlertEvents(hours, limit);
    if (sourceFilter !== 'rule') anomalyRows = await fetchAnomalyEvents(hours, limit);
  } catch (err) {
    warning = err instanceof Error ? err.message : '告警事件读取失败';
  }

  const ruleItems = alertRows.map((e) => ({ ...e, source: 'rule', anomaly_direction: '' }));
  const anomalyItems = anomalyRows.map((e) => {
    const dir = String(e.direction ?? '');
    const isHigh = dir === 'NEW_HIGH';
    return {
      ts: e.ts,
      event_key: e.event_key,
      rule_id: '',
      sensor_tag: e.sensor_tag,
      device_id: e.device_id,
      kiln_id: e.kiln_id,
      severity: 'P2',
      direction: isHigh ? 'high' : 'low',
      anomaly_direction: dir,
      state: 'event',
      value: e.sensor_value,
      threshold: isHigh ? e.baseline_max : e.baseline_min,
      baseline_min: e.baseline_min,
      baseline_max: e.baseline_max,
      message: e.note
        ? String(e.note)
        : `突破历史极值（${isHigh ? '最高' : '最低'}）：历史区间 ${String(e.baseline_min)} ~ ${String(e.baseline_max)}`,
      notify: '-',
      source: 'anomaly',
      has_report: e.has_report,
    };
  });

  const merged = ([...ruleItems, ...anomalyItems] as Record<string, unknown>[])
    .sort((a, b) => new Date(String(b.ts)).getTime() - new Date(String(a.ts)).getTime())
    .slice(0, limit);

  const items = merged.map((e) => ({ ...e, ack: acks.get(String(e.event_key ?? '')) ?? null }));

  const now = Date.now();
  const active = getActiveAlerts().map((a) => ({
    ...a,
    source: 'rule',
    duration_sec: Math.max(0, Math.round((now - a.since) / 1000)),
    ack: acks.get(a.eventKey) ?? null,
  }));

  return NextResponse.json({
    success: true,
    active,
    items,
    rule_count: loadRules().length,
    last_eval: getLastEval(),
    warning,
  });
}
