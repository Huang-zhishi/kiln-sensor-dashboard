// 单条告警：详情 / 处理闭环 / 通知重发
// GET   /api/alerts/[key]
// PATCH /api/alerts/[key]  body: { status:'acked'|'new', handler, comment, root_cause }
// POST  /api/alerts/[key]  body: { action:'resend' }

import { NextResponse } from 'next/server';
import { fetchAlertEventByKey, fetchAlertAcks, writeAlertAck } from '@/lib/alert-store';
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
    const event = await fetchAlertEventByKey(eventKey);
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
    const event = await fetchAlertEventByKey(eventKey);
    if (!event) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
    const content = String(event.message || event.sensor_tag || '') || `告警 ${eventKey}`;
    const notify = await sendWecomMessage(content);
    return NextResponse.json({ success: true, notify });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : '重发失败' }, { status: 500 });
  }
}
