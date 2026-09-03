# 多阶段构建：deps → build → runner
# 产物为 Next.js standalone，最终镜像仅含运行时必需文件（~180MB）

# ---------- 阶段 1：安装依赖 ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# ---------- 阶段 2：构建 ----------
FROM node:22-alpine AS build
WORKDIR /app
# db.ts 在模块加载时校验凭据，构建期收集页面数据会 import 路由模块，
# 因此需要占位值（构建期不会真正连接 TDengine）
ENV TDENGINE_USER=build \
    TDENGINE_PASSWORD=build \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

# ---------- 阶段 3：运行 ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# 非 root 运行
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/sensors/latest > /dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
