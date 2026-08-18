import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '传感器数据大屏 | 工业监控系统',
  description: '实时传感器数据监控大屏，展示窑炉温度、设备等关键参数',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
