'use client';

// 全局 AI 助手：右侧抽屉 + 右下角悬浮入口。
//
// 设计要点：
//  - 常驻挂载（不随开关卸载），关闭时只是位移隐藏，会话历史不丢；
//  - 通过 window 事件 `ai-assistant:open` 接受任意页面的"就地唤起"，
//    并可带入上下文（context 会作为参考信息随首条消息发给 Agent）；
//  - 流式消费 /api/agent/chat/stream（SSE），实时渲染 token / 工具调用状态。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Plus, Loader2, Wrench, Check, AlertCircle, Square, ExternalLink } from 'lucide-react';
import { AnomalyMarkdown } from '@/components/dashboard/anomaly-markdown';
import { streamAgentChat, type AgentChatEvent } from '@/lib/agent-chat';

export interface AssistantOpenDetail {
  /** 预填到输入框的问题 */
  prompt?: string;
  /** 带入的上下文（随消息一并发送，界面上以"引用上下文"提示） */
  context?: string;
  /** 是否立即发送预填问题（默认 false，仅预填） */
  autoSend?: boolean;
}

/** 任意组件调用：打开 AI 助手，可带入上下文/预填问题。 */
export function openAssistant(detail?: AssistantOpenDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AssistantOpenDetail>('ai-assistant:open', { detail: detail || {} }));
  }
}

interface ToolCall {
  name: string;
  status: 'running' | 'done' | 'error';
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  context?: string;
  tools?: ToolCall[];
  thinking?: boolean;
  error?: boolean;
}

const THREAD_KEY = 'ai_assistant_thread_id';
const uid = () => Math.random().toString(36).slice(2, 10);

function newThreadId(): string {
  return 'web-' + uid() + uid();
}

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [sending, setSending] = useState(false);
  const [threadId, setThreadId] = useState('');
  const [chatUrl, setChatUrl] = useState('');
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 会话 thread_id：localStorage 持久化，刷新页面后仍可续聊
  useEffect(() => {
    let t = '';
    try {
      t = localStorage.getItem(THREAD_KEY) || '';
    } catch {
      /* localStorage 不可用 */
    }
    if (!t) {
      t = newThreadId();
      try {
        localStorage.setItem(THREAD_KEY, t);
      } catch {
        /* ignore */
      }
    }
    setThreadId(t);
  }, []);

  // Agent 完整对话台地址（有则展示"打开完整对话台"）
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((j) => setChatUrl(j?.agentChatUrl || ''))
      .catch(() => {});
  }, []);

  const patch = useCallback((id: string, fn: (m: ChatMsg) => ChatMsg) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const handleEvent = useCallback(
    (evt: AgentChatEvent, id: string) => {
      switch (evt.type) {
        case 'thinking':
          patch(id, (m) => ({ ...m, thinking: true }));
          break;
        case 'token':
          patch(id, (m) => ({ ...m, thinking: false, content: m.content + (evt.content || '') }));
          break;
        case 'tool_start':
          patch(id, (m) => ({
            ...m,
            tools: [...(m.tools || []), { name: evt.tool || 'tool', status: 'running' }],
          }));
          break;
        case 'tool_end':
          patch(id, (m) => {
            const tools = [...(m.tools || [])];
            const idx = tools.findIndex((t) => t.name === (evt.tool || 'tool') && t.status === 'running');
            const next: ToolCall = { name: evt.tool || 'tool', status: evt.success === false ? 'error' : 'done' };
            if (idx >= 0) tools[idx] = next;
            else tools.push(next);
            return { ...m, tools };
          });
          break;
        case 'error':
          patch(id, (m) => ({
            ...m,
            thinking: false,
            error: true,
            content: m.content + `\n\n> ⚠️ ${evt.error || '请求出错'}`,
          }));
          break;
        case 'end':
          patch(id, (m) => ({ ...m, thinking: false }));
          break;
        default:
          break;
      }
    },
    [patch],
  );

  const send = useCallback(
    async (textRaw: string, ctxOverride?: string) => {
      const text = textRaw.trim();
      if (!text || sending) return;
      const ctx = (ctxOverride ?? context).trim();
      const outgoing = ctx ? `【当前上下文，供参考】\n${ctx}\n\n${text}` : text;

      const asstId = uid();
      activeIdRef.current = asstId;
      setMessages((ms) => [
        ...ms,
        { id: uid(), role: 'user', content: text, context: ctx || undefined },
        { id: asstId, role: 'assistant', content: '', tools: [], thinking: true },
      ]);
      setInput('');
      setSending(true);

      const ac = new AbortController();
      abortRef.current = ac;
      try {
        for await (const evt of streamAgentChat(outgoing, { threadId, signal: ac.signal })) {
          handleEvent(evt, asstId);
        }
      } catch (e) {
        const err = e as Error;
        if (err?.name === 'AbortError') {
          patch(asstId, (m) => ({ ...m, thinking: false }));
        } else {
          patch(asstId, (m) => ({
            ...m,
            thinking: false,
            error: true,
            content: m.content || `> ⚠️ 请求失败：${err?.message || String(e)}`,
          }));
        }
      } finally {
        setSending(false);
        abortRef.current = null;
        patch(asstId, (m) => ({ ...m, thinking: false }));
      }
    },
    [context, handleEvent, patch, sending, threadId],
  );

  // 就地唤起
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<AssistantOpenDetail>).detail || {};
      setOpen(true);
      if (d.context) setContext(d.context);
      if (d.prompt) {
        if (d.autoSend) void send(d.prompt, d.context);
        else setInput(d.prompt);
      }
      setTimeout(() => inputRef.current?.focus(), 120);
    };
    window.addEventListener('ai-assistant:open', onOpen);
    return () => window.removeEventListener('ai-assistant:open', onOpen);
  }, [send]);

  // 新消息自动滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const newSession = () => {
    const t = newThreadId();
    try {
      localStorage.setItem(THREAD_KEY, t);
    } catch {
      /* ignore */
    }
    setThreadId(t);
    setMessages([]);
    setContext('');
    setInput('');
  };

  const stop = () => abortRef.current?.abort();

  return (
    <>
      {/* 悬浮入口：全站可用 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[55] inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--primary) 88%, transparent)',
            color: 'var(--primary-foreground)',
            border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)',
          }}
          aria-label="打开 AI 助手"
        >
          <Sparkles size={16} />
          <span className="text-xs font-semibold">AI 助手</span>
        </button>
      )}

      {/* 抽屉 */}
      <div
        className="fixed top-0 right-0 h-full w-full sm:w-[460px] z-[60] flex flex-col bg-card border-l border-border-strong shadow-2xl transition-transform duration-300"
        style={{ transform: open ? 'translateX(0)' : 'translateX(102%)' }}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)' }}
          />
          <span className="text-sm font-semibold">AI 助手</span>
          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[110px]" title={threadId}>
            {threadId || '—'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={newSession}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border-strong text-muted-foreground hover:text-foreground hover:bg-card-hover"
            >
              <Plus size={12} /> 新会话
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card-hover"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-xs mt-10 space-y-2">
              <Sparkles size={22} className="mx-auto opacity-50" />
              <div>可以直接问测点数据、异常原因、工艺流程、联锁与处置建议。</div>
              <div className="text-[11px] leading-relaxed opacity-80">
                例：2#冷却器出口温度为什么波动大？
                <br />
                例：回转窑结圈怎么处理？
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                {m.context && (
                  <div className="max-w-[88%] text-[10px] text-muted-foreground border border-border rounded px-2 py-1 bg-background/40 whitespace-pre-wrap line-clamp-3">
                    引用上下文：{m.context}
                  </div>
                )}
                <div
                  className="max-w-[88%] px-3 py-2 rounded-lg text-xs whitespace-pre-wrap"
                  style={{ background: 'color-mix(in srgb, var(--info) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 32%, transparent)' }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-1.5">
                {(m.tools?.length || m.thinking) && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools?.map((t, i) => (
                      <span
                        key={`${t.name}-${i}`}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                        style={{
                          color: t.status === 'error' ? 'var(--danger)' : t.status === 'running' ? 'var(--info)' : 'var(--success)',
                          borderColor: 'var(--border-strong)',
                          background: 'var(--card-hover)',
                        }}
                      >
                        {t.status === 'running' ? <Loader2 size={10} className="animate-spin" /> : t.status === 'error' ? <AlertCircle size={10} /> : <Check size={10} />}
                        <Wrench size={10} className="opacity-60" />
                        {t.name}
                      </span>
                    ))}
                    {m.thinking && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border-strong bg-card-hover text-muted-foreground">
                        <Loader2 size={10} className="animate-spin" /> 思考中…
                      </span>
                    )}
                  </div>
                )}
                {m.content ? (
                  <div className="text-xs leading-relaxed text-foreground">
                    <AnomalyMarkdown text={m.content} />
                  </div>
                ) : (
                  !m.thinking && !m.tools?.length && <div className="text-[11px] text-muted-foreground">（无内容）</div>
                )}
              </div>
            ),
          )}
        </div>

        {/* 上下文提示 */}
        {context && (
          <div className="px-4 pt-2">
            <div className="flex items-start gap-2 text-[10px] text-muted-foreground border border-border rounded px-2 py-1.5 bg-background/40">
              <span className="whitespace-pre-wrap line-clamp-3 flex-1">引用上下文：{context}</span>
              <button type="button" onClick={() => setContext('')} className="text-muted-foreground hover:text-foreground" aria-label="清除上下文">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
              className="flex-1 resize-none bg-background border border-border-strong rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
            {sending ? (
              <button
                type="button"
                onClick={stop}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs border border-border-strong text-muted-foreground hover:text-foreground"
              >
                <Square size={12} /> 停止
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!input.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs disabled:opacity-50"
                style={{ background: 'color-mix(in srgb, var(--primary) 20%, transparent)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              >
                <Send size={12} /> 发送
              </button>
            )}
          </div>
          {chatUrl && (
            <a
              href={chatUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink size={10} /> 打开完整对话台
            </a>
          )}
        </div>
      </div>
    </>
  );
}
