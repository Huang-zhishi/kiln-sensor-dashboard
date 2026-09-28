// 异常闭环统计接口
// GET /api/anomalies/stats?hours=168
// 返回：处理率 / 平均处理时长(MTTR) / 根因分类分布 / 处理人工作量 / 按窑体分布 / 每日趋势
// 计算逻辑抽到 lib/closed-loop-stats.ts，与周报（lib/weekly-report.ts）共用。

import { NextResponse } from 'next/server';
import { computeClosedLoopStats } from '@/lib/closed-loop-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);
  try {
    const stats = await computeClosedLoopStats(hours);
    return NextResponse.json({ success: true, ...stats });
  } catch (err) {
    console.error('anomaly stats error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
