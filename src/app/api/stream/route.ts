// SSE 实时推送端点
// GET /api/stream                          → 大屏数据（默认）
// GET /api/stream?type=sensors&time_range=1h → 传感器页数据
// 相同参数的连接共享一次查询（见 sse-hub.ts），浏览器用 EventSource 接收

import { sseHub } from '@/lib/sse-hub';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 只透传白名单参数
  const params: Record<string, string> = {};
  for (const key of ['type', 'kiln_id', 'time_range', 'sensors']) {
    const value = searchParams.get(key);
    if (value !== null) params[key] = value;
  }
  const groupKey = JSON.stringify(params);

  const encoder = new TextEncoder();
  let closed = false;
  let client: { write: (chunk: string) => void } | null = null;

  const cleanup = () => {
    if (!closed) {
      closed = true;
      if (client) sseHub.unsubscribe(groupKey, client);
      try {
        controller?.close();
      } catch {}
    }
  };

  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
      client = {
        write: (chunk: string) => {
          if (closed) return;
          try {
            c.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        },
      };
      sseHub.subscribe(groupKey, params, client);

      // 客户端断开（页面关闭/导航/网络中断）
      request.signal.addEventListener('abort', cleanup);
      // EventSource 重连提示
      c.enqueue(encoder.encode('retry: 3000\n\n'));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
