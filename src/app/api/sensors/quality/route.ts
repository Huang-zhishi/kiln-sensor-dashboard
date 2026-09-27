// 测点数据质量：每测点的 总行数/有效值数/首次与最后上报/最后有效值时间/无数据起始
// GET /api/sensors/quality
// （计算逻辑见 lib/sensor-quality.ts，与首页 SSE 共用缓存）

import { NextResponse } from 'next/server';
import { fetchQualityMap } from '@/lib/sensor-quality';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const quality = await fetchQualityMap();
    return NextResponse.json({ success: true, count: Object.keys(quality).length, quality });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('quality error:', message);
    return NextResponse.json({ success: false, error: message, quality: {} }, { status: 500 });
  }
}
