// 闭环报告手动触发
// POST /api/reports/closed-loop  body: { action?: 'weekly' | 'escalation', hours?: number }
//   - weekly（默认）：立即生成并推送闭环周报到企业微信，返回推送状态与正文预览
//   - escalation：立即执行一次未处理超时扫描
//
// 供告警中心「闭环分析」页手动使用（自动调度见 lib/scheduler.ts）。

import { NextResponse } from 'next/server';
import { buildWeeklyReportContent, sendWeeklyReport } from '@/lib/weekly-report';
import { runEscalationScan } from '@/lib/escalation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { action?: string; hours?: number; dry_run?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // 允许空 body，默认 weekly
  }

  if (body.action === 'escalation') {
    try {
      await runEscalationScan();
      return NextResponse.json({ success: true, action: 'escalation' });
    } catch (err) {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
    }
  }

  const hours = Math.min(Math.max(Number(body.hours) || 168, 1), 2160);
  // dry_run：仅生成正文预览（含 Agent 点评），不推送企业微信
  if (body.dry_run) {
    try {
      const content = await buildWeeklyReportContent(hours);
      return NextResponse.json({ success: true, action: 'weekly', dry_run: true, notify: 'skipped', content });
    } catch (err) {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
    }
  }

  try {
    const { notify, content } = await sendWeeklyReport(hours);
    return NextResponse.json({ success: true, action: 'weekly', notify, content });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
