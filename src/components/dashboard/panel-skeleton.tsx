'use client';

// 面板级骨架屏：shimmer 占位，替代"加载中"文字
// 仅首次加载（无数据时）显示；SSE 首帧到达后消失

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`shimmer ${className}`} style={style} />;
}

// 带标题栏的面板骨架（高度自适应容器）
export function PanelSkeleton({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`panel flex flex-col ${className}`} style={{ minHeight: 160 }}>
      <Skeleton className="h-[38px] rounded-none" style={{ borderRadius: 'var(--radius) var(--radius) 0 0' }} />
      <div className="flex-1 flex flex-col gap-2 p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="flex-1" />
        ))}
      </div>
    </div>
  );
}

// 大屏整页骨架：5 统计卡 + 三栏面板 + 表格
export function DashboardSkeleton() {
  return (
    <div className="px-4 pb-6 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel px-4 py-3">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-3">
          <PanelSkeleton rows={5} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <PanelSkeleton rows={6} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <PanelSkeleton rows={5} />
        </div>
      </div>

      <div className="panel flex flex-col" style={{ minHeight: 180 }}>
        <Skeleton className="h-[38px] rounded-none" style={{ borderRadius: 'var(--radius) var(--radius) 0 0' }} />
        <div className="flex-1 flex flex-col gap-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="flex-1" />
          ))}
        </div>
      </div>
    </div>
  );
}
