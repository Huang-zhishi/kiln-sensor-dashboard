'use client';

// 大屏等比缩放容器
// 以 1920×1080 为设计稿基准，任意分辨率/拼接屏下内容等比缩放居中，不变形
// 内容超高时在设计稿尺寸内滚动（缩放后视觉一致）

import { useState, useEffect, type ReactNode } from 'react';

const DESIGN_W = 1920;
const DESIGN_H = 1080;

export function ScreenScaler({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 首帧（及 SSR）不做缩放，避免布局抖动；客户端拿到窗口尺寸后再套缩放
  if (scale === null) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          flexShrink: 0,
          transform: `scale(${scale})`,
          // 内容超出 1080 高度时在设计稿内滚动
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
