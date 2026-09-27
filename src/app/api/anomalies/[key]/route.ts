// 异常详情接口：按 event_key 拉取单条 anomaly_events（含 Agent 分析报告全文 + 处理状态）
// PATCH：标记已处理 / 取消已处理（写 anomaly_acks）

import { NextResponse } from 'next/server';
import { queryWithCache } from '@/lib/db';
import { fetchAcks, writeAck, type AckStatus } from '@/lib/anomaly-acks';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function loadItem(eventKey: string): Promise<Record<string, unknown> | null> {
  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction,
           baseline_min, baseline_max, device_id, kiln_id, report, analyzed_at
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
    const acks = await fetchAcks();
    const a = acks.get(eventKey);
    return NextResponse.json({
      success: true,
      item: { ...item, status: a?.status === 'acked' ? 'acked' : 'new', acked_at: a?.ackedAt ?? null },
    });
  } catch (err) {
    console.error('anomaly detail error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const eventKey = decodeURIComponent(key || '');
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  let body: { status?: string; device_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 忽略非法 body
  }
  const status: AckStatus = body.status === 'acked' ? 'acked' : 'new';
  try {
    await writeAck(eventKey, body.device_id || 'unknown', status);
    return NextResponse.json({ success: true, event_key: eventKey, status });
  } catch (err) {
    console.error('anomaly ack error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
