// Agent 对话传输层：消费中控台代理 /api/agent/chat/stream 的 SSE 流。
//
// 与 UI 解耦：组件只负责把事件渲染成消息/工具状态，传输与解析集中在这里，
// 便于复用（如未来在异常详情内嵌轻量问答）与单测。
//
// 事件类型与 Agent `/api/v1/chat/stream` 对齐：
//   start / thinking / tool_start / tool_end / token / error / end

export type AgentChatEvent =
  | { type: 'start'; run_id?: string; thread_id?: string }
  | { type: 'thinking' }
  | { type: 'tool_start'; tool?: string; args?: unknown }
  | { type: 'tool_end'; tool?: string; success?: boolean }
  | { type: 'token'; content?: string }
  | { type: 'error'; error?: string }
  | { type: 'end'; run_id?: string };

export interface StreamAgentChatOptions {
  /** 多轮会话标识（透传到 Agent 的 x-thread-id） */
  threadId?: string;
  signal?: AbortSignal;
  /** 代理端点，默认 /api/agent/chat/stream */
  endpoint?: string;
}

/** 发送一条消息并按 SSE 顺序产出事件。调用方用 for-await 消费。 */
export async function* streamAgentChat(
  message: string,
  opts: StreamAgentChatOptions = {},
): AsyncGenerator<AgentChatEvent> {
  const endpoint = opts.endpoint || '/api/agent/chat/stream';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.threadId) headers['x-thread-id'] = opts.threadId;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(5).trim()) as AgentChatEvent;
      } catch {
        // 非 JSON 分片（心跳/空行）直接跳过
      }
    }
  }
}
