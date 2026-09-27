// 告警规则 CRUD
// GET    /api/alerts/rules                → { rules }
// POST   /api/alerts/rules  (body: rule)  → 新增/更新，返回规则
// DELETE /api/alerts/rules?id=r_xxx       → 删除

import { NextRequest, NextResponse } from 'next/server';
import { loadRules, upsertRule, deleteRule, RuleValidationError } from '@/lib/alert-rules';
import { ensureAlertEngine } from '@/lib/alert-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, rules: loadRules() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }
  try {
    const rule = upsertRule(body);
    ensureAlertEngine();
    return NextResponse.json({ success: true, rule });
  } catch (err) {
    const message = err instanceof RuleValidationError ? err.message : err instanceof Error ? err.message : '保存失败';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ success: false, error: '缺少 id' }, { status: 400 });
  const ok = deleteRule(id);
  return NextResponse.json({ success: ok, error: ok ? undefined : '未找到该规则' }, { status: ok ? 200 : 404 });
}
