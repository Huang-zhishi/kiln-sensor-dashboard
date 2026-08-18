# 传感器数据大屏 - 项目指南

## 项目概览

工业传感器数据监控大屏，连接 MySQL 数据库实时展示窑炉传感器数据（温度、压力等）。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19 + TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Charts**: Recharts
- **Database**: TDengine 3.x (REST API via mysql2 → fetch)

## 目录结构

```
src/
├── app/
│   ├── api/sensors/
│   │   ├── route.ts          # 通用传感器数据查询
│   │   ├── latest/route.ts   # 最新读数查询
│   │   ├── history/route.ts  # 历史趋势数据
│   │   └── stats/route.ts    # 统计信息（窑体/传感器/设备列表）
│   ├── layout.tsx
│   ├── page.tsx              # 大屏主页面
│   └── globals.css           # 大屏深色主题样式
├── components/dashboard/
│   ├── header.tsx            # 顶部标题栏
│   ├── filter-bar.tsx        # 筛选条件栏
│   ├── stat-cards.tsx        # 统计卡片
│   ├── trend-chart.tsx       # 趋势折线图
│   ├── sensor-gauge.tsx      # 传感器仪表盘
│   ├── kiln-overview.tsx     # 窑体概览
│   └── data-table.tsx        # 实时数据表
└── lib/
    └── db.ts                 # MySQL 连接池
```

## API 接口

| 路径 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/sensors` | GET | 查询传感器数据 | kiln_id, device_id, sensor_tag, limit |
| `/api/sensors/latest` | GET | 获取最新读数 | 无 |
| `/api/sensors/history` | GET | 历史趋势 | hours, kiln_id, sensor_tag, limit |
| `/api/sensors/stats` | GET | 统计元数据 | 无 |

## 数据库

- **Type**: TDengine 3.3.5.0 (时序数据库)
- **Host**: 8.134.81.26:6041 (REST API)
- **Database**: ams
- **Super Table**: sensor_readings (ts TIMESTAMP, sensor_value FLOAT) TAGS (device_id, sensor_tag)
- **Data Source**: DTU → MQTT → EMQX → TDengine，每秒 ~100 条写入

## 开发命令

```bash
pnpm dev          # 启动开发服务
pnpm build        # 构建生产版本
pnpm start        # 启动生产服务
pnpm ts-check     # TypeScript 类型检查
pnpm lint         # ESLint 检查
```

## 设计说明

- 深色工业风主题，参考 DESIGN.md
- 30 秒自动刷新最新数据
- 支持按窑体、传感器、设备、时间范围筛选
