// 极值基线管理：中控台 → Agent 的服务端代理
// 浏览器请求 /api/extreme/*，本路由转发到 Agent 的 /api/admin/extreme/* 并附管理员令牌。
// 这样浏览器无需接触 Agent 令牌，也无需直连 :5000（绕开 CORS/端口）。

import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function agentBase(): string {
  return (process.env.AGENT_BASE_URL || '').replace(/\/+$/, '');
}

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const base = agentBase();
  if (!base) {
    return NextResponse.json({ error: 'AGENT_BASE_URL 未配置' }, { status: 500 });
  }
  const { search } = new URL(request.url);
  const target = `${base}/api/admin/extreme/${path.join('/')}${search}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.AGENT_API_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method: request.method, headers, cache: 'no-store' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }
  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `无法连接 Agent（${base}）：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path || []);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path || []);
}
