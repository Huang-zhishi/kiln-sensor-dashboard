// 告警中心数据接口
// GET /api/alerts?hours=168&limit=300
// 返回：活动告警（引擎实时评估）+ 历史事件（合并处理记录）+ 规则数

import { NextResponse } from 'next/server';
import { evaluateAlerts, ensureAlertEngine, getActiveAlerts, getLastEval } from '@/lib/alert-engine';
import { fetchAlertEvents, fetchAlertAcks, type AlertAckRecord } from '@/lib/alert-store';
import { loadRules } from '@/lib/alert-rules';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  ensureAlertEngine();
  // 即时评估一次，保证首屏活动态准确（内部有 in-flight 去重 + 5s 缓存）
  await evaluateAlerts();

  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 300, 1), 1000);

  let acks = new Map<string, AlertAckRecord>();
  let history: Record<string, unknown>[] = [];
  let warning = '';
  try {
    acks = await fetchAlertAcks();
    history = await fetchAlertEvents(hours, limit);
  } catch (err) {
    warning = err instanceof Error ? err.message : '告警事件表读取失败';
  }

  const items = history.map((e) => {
    const ack = acks.get(String(e.event_key ?? '')) ?? null;
    return { ...e, ack };
  });

  const now = Date.now();
  const active = getActiveAlerts().map((a) => ({
    ...a,
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
