import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 生产独立部署模式：构建产物自带运行时，服务器无需 node_modules 全量安装
  output: 'standalone',
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
