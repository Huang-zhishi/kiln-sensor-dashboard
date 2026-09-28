import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '传感器数据大屏 | 工业监控系统',
  description: '实时传感器数据监控大屏，展示窑炉温度、设备等关键参数',
};

// 移动端视口：宽度跟随设备，允许捏合缩放（现场常需放大工艺流程图/趋势图），适配刘海屏
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0e13',
};

// API 访问令牌：配置 API_ACCESS_TOKEN 时注入浏览器，前端 apiFetch 自动携带
const apiToken = process.env.API_ACCESS_TOKEN;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">
        {apiToken ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__API_TOKEN__=${JSON.stringify(apiToken).replace(/</g, '\\u003c')};`,
            }}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
