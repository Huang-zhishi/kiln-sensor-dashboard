// 大屏聚合数据接口（一次请求返回 latest + stats + history）
// 注意：前端大屏已改用 /api/stream SSE 推送，本接口保留用于兼容与调试

import { NextResponse } from 'next/server';
import { fetchDashboardData, parseDashboardParams } from '@/lib/dashboard-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const params = parseDashboardParams(searchParams);
    const data = await fetchDashboardData(params);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
