import { NextRequest, NextResponse } from 'next/server';

// API 访问令牌（可选启用）：
// - 设置 API_ACCESS_TOKEN 环境变量后，所有 /api/* 请求必须携带
//   `x-api-token: <token>` 或 `Authorization: Bearer <token>` 头，否则返回 401
// - 未设置时保持原行为（本地开发/未启用场景默认放行）
const TOKEN = process.env.API_ACCESS_TOKEN;

export function proxy(req: NextRequest) {
  // 未配置令牌：不做鉴权，直接放行
  if (!TOKEN) {
    return NextResponse.next();
  }

  // 放行 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return NextResponse.next();
  }

  const headerToken = req.headers.get('x-api-token');
  const authorization = req.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (headerToken === TOKEN || bearerToken === TOKEN) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { success: false, error: '未授权访问，请提供有效的访问令牌' },
    { status: 401 },
  );
}

export const config = {
  // 仅保护 API 路由，页面与静态资源不受影响
  matcher: '/api/:path*',
};
