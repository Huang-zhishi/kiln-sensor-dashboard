# 架构优化待办清单

> 目标：查得快、够实时、看得爽
> 前提：32核64G / 8T 磁盘单机，TDengine 3.3.5（100 条/秒写入、116 传感器），内网部署
> 核心思想：**数据只查一次，广播给所有人；重计算在写入时做掉，不在查询时做**

## 总体架构（目标形态）

```
                    ┌────────────────── 32核64G 单机 ──────────────────┐
 DTU → MQTT → EMQX →│                                                  │
                    │  TDengine 3.3.5                                  │
                    │   ├─ sensor_readings（原始库）                    │
                    │   ├─ 流计算: stats_1m 预聚合表（分钟级统计）        │
                    │   └─ WebSocket 端口（taosAdapter）                │
                    │        ▲ ws 查询          ▲ 写入(已有)            │
                    │  Next.js standalone（单进程 Node）                │
                    │   ├─ SSE Hub：每2s查库 → 广播所有浏览器            │
                    │   ├─ 查询层：ws连接 + 进程内缓存 + 击穿去重         │
                    │   └─ API Routes（其余低频接口）                   │
                    │        ▲                         │               │
                    │  nginx :80（gzip/静态缓存/反代）    │               │
                    └────────┼─────────────────────────┼───────────────┘
                     浏览器大屏 × N（EventSource 长连接，断线自动重连）
```

---

## P0 部署基线（立即做）

- [x] 构建:`next.config.ts` 加 `output: 'standalone'`，生产用 `next build` + `next start`
- [x] 删除 Coze 模板遗留的自定义 `src/server.ts`，生产不再走 `tsx watch`
- [x] 编写 systemd 服务单元（崩溃/OOM 3 秒自动拉起）：`deploy/kiln-dashboard.service`
- [x] nginx 配置入仓（gzip + 静态缓存 + SSE 通道预留）：`deploy/nginx.conf`（安装配置到服务器时启用）
- [ ] ~~服务器上手工创建 `.env`~~（未上生产，暂不需要）
- [ ] ~~root 密码 rotation~~（未上生产，暂不需要）

**P0 完成记录**：`pnpm build` 验证通过（11.7s，10 页面全部生成），standalone 产物 `.next/standalone/server.js` 已产出；dev 切官方 CLI 后正常。

## P1 实时性（本周，价值最大）

- [x] 新增 `/api/stream` SSE Hub：服务端单点每 2s 查 latest + history，广播所有浏览器
- [x] 前端改用原生 `EventSource`（断线自动重连），删除 `page.tsx` / `sensors/page.tsx` 里的 `setInterval` 轮询
- [x] `queryWithCache` 加 in-flight Promise 去重（同 key 并发共享一次查询）
- [x] 缓存 TTL 缩短换新鲜度：`latest` 5s、`history` 15s、stats 60s
- [x] 大屏等比缩放：1920×1080 设计稿，`transform: scale(min(w/1920, h/1080))`，任意分辨率不变形（`components/dashboard/screen-scaler.tsx`）
- [x] StatCards 数字平滑：rAF easeOutCubic 补间，配合 2s 推送做出数字"跳动"质感

**P1 完成记录**：
- 架构：`lib/dashboard-data.ts` 共享数据层 + `lib/sse-hub.ts` 分组广播（相同参数观众共享一次查询，结果变化才推送，25s 心跳保活，无客户端自动停表）
- 顺带修复：4 个 sensor 路由的 `toRows` 双重调用 bug（此前返回空数据）
- 验证：ts-check 通过；/api/dashboard、sensors/list（87 传感器）、history（183 点）、latest（87）、values（10）全 200；SSE 两种类型 2s 内出首帧；浏览器实测两页面渲染正常、5s 内数据自动更新、服务端长连接稳定无错误

> 注意：SSE 要求单进程广播，Node 保持 **PM2 fork 单实例**，不开 cluster（单进程扛几千 SSE 连接绰绰有余，32 核留给 TDengine 和 nginx）

## P2 查询提速（下周）

- [ ] TDengine 流计算预聚合，写入时自动维护分钟级统计：
  ```sql
  CREATE STREAM IF NOT EXISTS stats_1m
    TRIGGER WINDOW_CLOSE
    INTO stats_1m_agg AS
    SELECT _wstart AS ts, sensor_tag, device_id,
           AVG(sensor_value) AS avg_val,
           MIN(sensor_value) AS min_val,
           MAX(sensor_value) AS max_val,
           COUNT(ts) AS cnt
    FROM sensor_readings
    PARTITION BY sensor_tag, device_id
    INTERVAL(1m);
  ```
  stats 接口改为查 `stats_1m_agg`（毫秒级），删除 `ENABLE_STATS` 应急开关
- [ ] REST → WebSocket：`db.ts` 的 `query()` 换 taosAdapter ws 长连接（37ms → 1~5ms）
- [ ] 趋势图迁移 ECharts（Canvas 渲染，SVG 在高频更新下会成瓶颈；自带 gauge/热力图，替代手写 sensor-gauge）

## P3 观感与收尾（随手做）

- [ ] 骨架屏替换"加载中"文字（面板级 shimmer）
- [ ] 数据表虚拟滚动（`@tanstack/react-virtual`，116 行全量渲染没必要）
- [ ] 其余图表随新增需求顺势迁 ECharts，不专门重写
- [ ] Uptime Kuma 监控三件事：6041 探活、大屏 HTTP 200、磁盘使用率，异常推企业微信/钉钉
- [ ] TDengine 备份：taosdump 定时全量（8T 空间充裕，备份文件随便放）

---

## 明确不做（防过度设计）

| 不做 | 理由 |
|------|------|
| 微服务 / 独立 Spring Boot 后端 | 单机单体最优，多一个 JVM 纯增加故障面 |
| Redis | 单进程 Node，进程内缓存足够；出现多实例需求再说 |
| Kafka 等消息队列 | EMQX→TDengine 写入链路已成熟，加层只增加延迟和运维负担 |
| TMQ 数据订阅替代 SSE Hub 轮询 | 100 条/s 写入下 2s 轮询成本约等于零，TMQ 复杂度不值 |
| Vue 重写 | 无收益的负优化 |
| 数据保留策略 / 降采样 | 8T 磁盘，原始数据随便存 |

## 关键取舍备忘

- **SSE 而非 WebSocket**：单向推送场景更简单（纯 HTTP、原生重连、nginx 无需升级配置）
- **单进程而非 cluster**：SSE 广播模型要求"查一次库给所有人"，多实例反而复杂化
- **流计算而非查询时聚合**：写多读少的时序场景，重活放到写入路径是 TDengine 的正确用法
- **ECharts 渐进迁移**：随新增图表顺势换，不为迁移而迁移
