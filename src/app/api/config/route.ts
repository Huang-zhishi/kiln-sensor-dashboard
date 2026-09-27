// 运行时前端配置（避免把外部链接打成构建期常量）
// GET /api/config → { agentChatUrl }
// 通过环境变量 AGENT_CHAT_URL 配置（如 http://192.168.1.78:5000/），未配置则返回空串。

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    agentChatUrl: process.env.AGENT_CHAT_URL || '',
  });
}
