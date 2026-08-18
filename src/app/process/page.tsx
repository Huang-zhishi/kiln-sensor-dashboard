'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface ProcessSystem {
  id: string;
  name: string;
  file: string;
  apiBaseUrl: string;
  createdAt: string;
}

export default function ProcessPage() {
  const [systems, setSystems] = useState<ProcessSystem[]>([]);
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch('/api/process/systems')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.length > 0) {
          setSystems(json.data);
          setActive(json.data[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const current = systems.find((s) => s.id === active);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定删除该工艺流程？')) return;
    try {
      const res = await apiFetch('/api/process/systems', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        setSystems((prev) => {
          const next = prev.filter((s) => s.id !== id);
          if (active === id && next.length > 0) setActive(next[0].id);
          else if (next.length === 0) setActive('');
          return next;
        });
      }
    } catch {}
  }, [active]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0e1a]">
        <div className="text-sm" style={{ color: '#64748b' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'rgba(0,212,255,0.15)' }}>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-2 hover:bg-cyan-500/20"
            style={{
              background: 'rgba(0, 212, 255, 0.1)',
              color: '#00d4ff',
              border: '1px solid rgba(0, 212, 255, 0.3)',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回首页
          </Link>
          <h1 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
            <span style={{ color: '#00d4ff' }}>工艺流程</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {systems.map((sys) => (
            <div key={sys.id} className="relative group">
              <button
                onClick={() => setActive(sys.id)}
                className="px-4 py-1.5 text-xs rounded transition-all"
                style={{
                  background: active === sys.id ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: active === sys.id ? '#00d4ff' : '#94a3b8',
                  border: active === sys.id
                    ? '1px solid rgba(0, 212, 255, 0.4)'
                    : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {sys.name}
              </button>
              {/* Edit button */}
              <Link
                href={`/process/import?id=${sys.id}`}
                className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[9px]"
                style={{ background: 'rgba(0, 212, 255, 0.8)', color: 'white' }}
                title="修改"
              >
                ✎
              </Link>
              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, sys.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                style={{ background: '#ef4444', color: 'white' }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}

          <Link
            href="/process/import"
            className="px-3 py-1.5 text-xs rounded transition-all flex items-center gap-1.5"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            导入
          </Link>
        </div>
      </div>

      {/* Process flow content */}
      <div className="flex-1 relative">
        {current && (
          <iframe
            ref={iframeRef}
            src={`${current.file}?api=${current.apiBaseUrl}`}
            className="absolute inset-0 w-full h-full border-0"
            style={{ background: '#0a0e1a' }}
            title={current.name}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
        {!current && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm mb-4" style={{ color: '#64748b' }}>暂无工艺流程，请先导入</p>
              <Link
                href="/process/import"
                className="px-4 py-2 rounded text-sm inline-block"
                style={{
                  background: 'rgba(0, 212, 255, 0.2)',
                  color: '#00d4ff',
                  border: '1px solid rgba(0, 212, 255, 0.4)',
                }}
              >
                导入流程图
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}