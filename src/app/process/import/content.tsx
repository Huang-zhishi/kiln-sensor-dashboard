'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface EditSystem {
  id: string;
  name: string;
  file: string;
  apiBaseUrl: string;
}

export default function ImportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('.');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [editSystem, setEditSystem] = useState<EditSystem | null>(null);

  // 编辑模式：加载已有系统数据
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    fetch('/api/process/systems')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const sys = json.data.find((s: any) => s.id === editId);
          if (sys) {
            setEditSystem(sys);
            setName(sys.name);
            setApiBaseUrl(sys.apiBaseUrl || '.');
          } else {
            setError('未找到该系统');
          }
        }
      })
      .catch(() => setError('加载系统信息失败'))
      .finally(() => setLoading(false));
  }, [editId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.endsWith('.html') && !f.name.endsWith('.htm')) {
        setError('仅支持 HTML 文件');
        setFile(null);
        return;
      }
      setFile(f);
      // 编辑模式下不自动覆盖名称
      if (!editId && !name) {
        setName(f.name.replace(/\.html?$/i, ''));
      }
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!editId && !file) { setError('请选择文件'); return; }
    if (!name) { setError('请输入系统名称'); return; }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      if (editId) formData.append('id', editId);
      if (file) formData.append('file', file);
      formData.append('name', name);
      formData.append('apiBaseUrl', apiBaseUrl);

      const method = editId ? 'PUT' : 'POST';
      const res = await fetch('/api/process/upload', { method, body: formData });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || '操作失败');
        return;
      }

      setSuccess(editId ? `"${name}" 更新成功！` : `"${name}" 导入成功！`);
      setTimeout(() => router.push('/process'), 2000);
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setUploading(false);
    }
  };

  const isEditing = !!editId;

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0e1a] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#00d4ff transparent #00d4ff transparent' }} />
        <p className="mt-4 text-sm" style={{ color: '#94a3b8' }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'rgba(0,212,255,0.15)' }}>
        <div className="flex items-center gap-4">
          <Link
            href="/process"
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
            返回工艺流程
          </Link>
          <h1 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
            <span style={{ color: '#00d4ff' }}>{isEditing ? '修改工艺流程图' : '导入工艺流程图'}</span>
          </h1>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg p-8" style={{
            background: '#0f1729',
            border: '1px solid rgba(0, 212, 255, 0.15)',
          }}>
            {/* 编辑模式提示 */}
            {isEditing && editSystem && (
              <div className="mb-6 p-3 rounded text-xs flex items-center gap-2" style={{
                background: 'rgba(0, 212, 255, 0.08)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                color: '#00d4ff',
              }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                正在编辑：<strong>{editSystem.name}</strong>（当前文件：{editSystem.file}）
              </div>
            )}

            {/* File upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>
                HTML 文件 {isEditing && <span className="text-xs" style={{ color: '#64748b' }}>（不选则保留原文件）</span>}
              </label>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-cyan-500/50"
                style={{
                  borderColor: file ? 'rgba(0, 212, 255, 0.4)' : 'rgba(255,255,255,0.1)',
                  background: file ? 'rgba(0, 212, 255, 0.03)' : 'transparent',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {file ? (
                  <div>
                    <svg className="w-10 h-10 mx-auto mb-2" style={{ color: '#00d4ff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm" style={{ color: '#00d4ff' }}>{file.name}</p>
                    <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-10 h-10 mx-auto mb-2" style={{ color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>
                      {isEditing ? '点击选择新文件替换（可选）' : '点击上传 HTML 文件'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#64748b' }}>支持 .html / .htm</p>
                  </div>
                )}
              </div>
            </div>

            {/* System name */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>
                系统名称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：1#还原系统"
                className="w-full px-3 py-2 rounded text-sm outline-none transition-colors focus:border-cyan-500/50"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {/* API base URL */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>
                API 地址
              </label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="输入 . 使用同源 API，或输入完整 URL"
                className="w-full px-3 py-2 rounded text-sm outline-none transition-colors focus:border-cyan-500/50"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                输入 <code className="px-1 rounded" style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>.</code> 使用同源 API（默认），或输入完整地址如 <code className="px-1 rounded" style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>https://api.example.com</code>
              </p>
            </div>

            {/* Error / Success */}
            {error && (
              <div className="mb-4 p-3 rounded text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 rounded text-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="w-full py-2.5 rounded text-sm font-medium transition-all"
              style={{
                background: uploading ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 212, 255, 0.2)',
                color: uploading ? '#94a3b8' : '#00d4ff',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? (isEditing ? '更新中...' : '导入中...') : (isEditing ? '保存修改' : '导入')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}