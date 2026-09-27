// 测点主数据接口
// GET    /api/sensors/meta                 → { meta: { tag: SensorMeta } }
// PUT    /api/sensors/meta  (body: patch)  → upsert
// DELETE /api/sensors/meta?sensor_tag=xxx  → 恢复默认

import { NextRequest, NextResponse } from 'next/server';
import { loadMetaMap, upsertMeta, deleteMeta, MetaValidationError } from '@/lib/sensor-meta';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, meta: loadMetaMap() });
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }
  try {
    const item = upsertMeta(body);
    return NextResponse.json({ success: true, item });
  } catch (err) {
    const message = err instanceof MetaValidationError ? err.message : err instanceof Error ? err.message : '保存失败';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const tag = new URL(req.url).searchParams.get('sensor_tag') || '';
  if (!tag) return NextResponse.json({ success: false, error: '缺少 sensor_tag' }, { status: 400 });
  const ok = deleteMeta(tag);
  return NextResponse.json({ success: ok, error: ok ? undefined : '未找到该测点元数据' }, { status: ok ? 200 : 404 });
}
