// 异常详情接口：按 event_key 拉取单条 anomaly_events（含 Agent 分析报告全文 + 处理记录 + 时间线）
// PATCH：处理闭环（状态 / 处理人 / 根因分类 / 根因 / 处理措施 / 处理意见），写 alert_acks
//
// 说明：处理记录统一由 alert_acks 承载（见 lib/alert-store.ts），首页与告警中心共用同一份闭环数据。

import { NextResponse } from 'next/server';
import { queryWithCache } from '@/lib/db';
import { fetchMergedAcks } from '@/lib/acks';
import { fetchAckTimeline, writeAlertAck } from '@/lib/alert-store';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function loadItem(eventKey: string): Promise<Record<string, unknown> | null> {
  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction,
           baseline_min, baseline_max, device_id, kiln_id, report, note, analyzed_at
    FROM anomaly_events
    WHERE event_key = '${escapeSql(eventKey)}'
    ORDER BY ts DESC
    LIMIT 1
  `;
  const rows = await queryWithCache<Record<string, unknown>[]>(`anomaly:${eventKey}`, sql, 60000);
  return rows.length > 0 ? rows[0] : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const eventKey = decodeURIComponent(key || '');
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  try {
    const item = await loadItem(eventKey);
    if (!item) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    }
    const acks = await fetchMergedAcks();
    const a = acks.get(eventKey) ?? null;
    let timeline: Array<Record<string, unknown>> = [];
    try {
      timeline = await fetchAckTimeline(eventKey);
    } catch {
      // 时间线读取失败不影响详情展示
    }
    return NextResponse.json({
      success: true,
      item: { ...item, status: a?.status === 'acked' ? 'acked' : 'new', acked_at: a?.ackedAt ?? null },
      ack: a,
      timeline,
    });
  } catch (err) {
    console.error('anomaly detail error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

function clamp(s: unknown, max: number): string {
  return (typeof s === 'string' ? s : '').slice(0, max);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const eventKey = decodeURIComponent(key || '');
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  let body: {
    status?: string;
    device_id?: string;
    handler?: string;
    comment?: string;
    root_cause?: string;
    root_cause_category?: string;
    measure?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    // 忽略非法 body
  }
  const status = body.status === 'acked' ? 'acked' : 'new';
  try {
    let deviceId = body.device_id || '';
    // 未显式传 device_id 时从事件补全（子表名依据 device_id）
    if (!deviceId) {
      const item = await loadItem(eventKey);
      deviceId = String(item?.device_id ?? '');
    }
    await writeAlertAck({
      eventKey,
      deviceId: deviceId || 'unknown',
      status,
      handler: clamp(body.handler, 64),
      comment: clamp(body.comment, 500),
      rootCause: clamp(body.root_cause, 255),
      rootCauseCategory: clamp(body.root_cause_category, 32),
      measure: clamp(body.measure, 500),
    });
    return NextResponse.json({ success: true, event_key: eventKey, status });
  } catch (err) {
    console.error('anomaly ack error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
