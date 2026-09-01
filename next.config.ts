import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 生产独立部署模式：构建产物自带运行时，服务器无需 node_modules 全量安装
  output: 'standalone',
  // TDengine WS 连接器仅服务端使用，且其依赖的 websocket 库含 Node/浏览器双构建，
  // 打包会误选浏览器构建（依赖全局 WebSocket），必须排除
  serverExternalPackages: ['@tdengine/websocket'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
