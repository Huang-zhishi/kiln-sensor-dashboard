// 单条告警：详情 / 处理闭环 / 通知重发
// GET   /api/alerts/[key]
// PATCH /api/alerts/[key]  body: { status:'acked'|'new', handler, comment, root_cause }
// POST  /api/alerts/[key]  body: { action:'resend' }

import { NextResponse } from 'next/server';
import { fetchAlertEventByKey, fetchAlertAcks, writeAlertAck, escapeSql } from '@/lib/alert-store';
import { query, toRows } from '@/lib/db';
import { sendWecomMessage } from '@/lib/alert-engine';

export const dynamic = 'force-dynamic';

function parseKey(raw: string): string {
  return decodeURIComponent(raw || '');
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const eventKey = parseKey((await params).key);
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  try {
    const event = await fetchAlertEventByKey(eventKey);
    if (!event) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    const acks = await fetchAlertAcks();
    return NextResponse.json({ success: true, event, ack: acks.get(eventKey) ?? null });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '查询失败' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const eventKey = parseKey((await params).key);
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  let body: { status?: string; handler?: string; comment?: string; root_cause?: string; device_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 忽略非法 body
  }
  try {
    let event = await fetchAlertEventByKey(eventKey);
    // 极值异常的事件在 anomaly_events 里，补查 device_id
    if (!event) {
      try {
        const res = await query(
          `SELECT device_id, sensor_tag FROM anomaly_events WHERE event_key = '${escapeSql(eventKey)}' ORDER BY ts DESC LIMIT 1`,
        );
        const rows = toRows(res);
        if (rows.length > 0) event = rows[0];
      } catch {
        // ignore
      }
    }
    const deviceId = body.device_id || String(event?.device_id ?? 'unknown');
    await writeAlertAck({
      eventKey,
      deviceId,
      status: body.status === 'acked' ? 'acked' : 'new',
      handler: (body.handler || '').slice(0, 64),
      comment: (body.comment || '').slice(0, 500),
      rootCause: (body.root_cause || '').slice(0, 255),
    });
    return NextResponse.json({ success: true, event_key: eventKey, status: body.status === 'acked' ? 'acked' : 'new' });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '处理失败' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const eventKey = parseKey((await params).key);
  if (!eventKey || eventKey.length > 200) {
    return NextResponse.json({ success: false, error: 'invalid key' }, { status: 400 });
  }
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 忽略
  }
  if (body.action !== 'resend') {
    return NextResponse.json({ success: false, error: '不支持的动作' }, { status: 400 });
  }
  try {
    let content = '';
    const event = await fetchAlertEventByKey(eventKey);
    if (event) {
      content = String(event.message || event.sensor_tag || '');
    } else {
      // 极值异常：从 anomaly_events 构造通知文案
      const res = await query(
        `SELECT sensor_tag, sensor_value, direction, baseline_min, baseline_max, note FROM anomaly_events WHERE event_key = '${escapeSql(eventKey)}' ORDER BY ts DESC LIMIT 1`,
      );
      const rows = toRows(res);
      if (rows.length > 0) {
        const r = rows[0];
        const dir = String(r.direction ?? '');
        const label = dir === 'NEW_HIGH' ? '突破历史最高' : dir === 'NEW_LOW' ? '突破历史最低' : dir;
        content = `【极值异常】${String(r.sensor_tag)}\n${label}：${String(r.sensor_value)}（历史区间 ${String(r.baseline_min)} ~ ${String(r.baseline_max)}）`;
      }
    }
    if (!content) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    const notify = await sendWecomMessage(content);
    return NextResponse.json({ success: true, notify });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '重发失败' }, { status: 500 });
  }
}
