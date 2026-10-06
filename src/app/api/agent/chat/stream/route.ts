// AI 对话流式代理：中控台浏览器 → 本路由 → Agent /api/v1/chat/stream
//
// 为什么不直连 Agent：
//  - 令牌不下发浏览器（AGENT_API_TOKEN 只在服务端使用）；
//  - 绕过 CORS / 端口暴露；
//  - Agent 侧对对话台设置了 X-Frame-Options: DENY，无法用 iframe 嵌入。
//
// 请求体：{ message: string, voice_mode?: boolean }
// 请求头：x-thread-id（可选，多轮会话标识）
// 响应：原样透传 text/event-stream（start / thinking / tool_start / tool_end / token / error / end）

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function agentBase(): string {
  return (process.env.AGENT_BASE_URL || '').replace(/\/+$/, '');
}

export async function POST(request: Request) {
  const base = agentBase();
  if (!base) {
    return NextResponse.json({ error: 'AGENT_BASE_URL 未配置' }, { status: 500 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const token = process.env.AGENT_API_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;
  const threadId = request.headers.get('x-thread-id');
  if (threadId) headers['x-thread-id'] = threadId;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/v1/chat/stream`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    return NextResponse.json(
      { error: `无法连接 Agent（${base}）：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return new NextResponse(text || `Agent 返回 ${upstream.status}`, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  // 透传 SSE：禁用缓冲，保证 token 级实时
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
