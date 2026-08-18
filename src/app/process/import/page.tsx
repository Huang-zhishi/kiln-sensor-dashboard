'use client';

import { Suspense } from 'react';
import ImportPageContent from './content';

export default function ImportProcessPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-screen bg-[#0a0e1a] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#00d4ff transparent #00d4ff transparent' }} />
        <p className="mt-4 text-sm" style={{ color: '#94a3b8' }}>加载中...</p>
      </div>
    }>
      <ImportPageContent />
    </Suspense>
  );
}