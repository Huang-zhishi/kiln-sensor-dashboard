// 后台调度器：进程内单例，随服务启动（见 src/instrumentation.ts）。
// - 告警引擎：每 10s 按规则评估（ensureAlertEngine 幂等）
// - 超时升级：每 5 分钟扫描一次未处理事件
// - 周报：每 10 分钟检查一次是否到点（默认周一 08:00）
//
// 单进程部署（standalone 单实例）下无重复执行问题；定时器 unref 不阻塞退出。
// 注意：Next.js 会把本模块打进多个 bundle，模块级 `started` 不跨 bundle 共享，
// 故将单例标记放在 globalThis 上（与 alert-engine 同理），避免重复调度。

import { ensureAlertEngine } from './alert-engine';
import { runEscalationScan } from './escalation';
import { maybeSendWeeklyReport } from './weekly-report';

type SchedulerRuntime = { started: boolean };
const runtime: SchedulerRuntime = ((globalThis as { __kilnScheduler?: SchedulerRuntime }).__kilnScheduler ??= {
  started: false,
});

const ESCALATION_INTERVAL_MS = 5 * 60_000;
const REPORT_CHECK_INTERVAL_MS = 10 * 60_000;

export function ensureSchedulers(): void {
  if (runtime.started) return;
  runtime.started = true;

  ensureAlertEngine();

  const timers: Array<ReturnType<typeof setInterval>> = [];
  const timeouts: Array<ReturnType<typeof setTimeout>> = [];

  // 冷启动后稍等再跑首轮，避开启动期资源争抢
  timeouts.push(setTimeout(() => void runEscalationScan(), 30_000));
  timers.push(setInterval(() => void runEscalationScan(), ESCALATION_INTERVAL_MS));

  timeouts.push(setTimeout(() => void maybeSendWeeklyReport(new Date()), 45_000));
  timers.push(setInterval(() => void maybeSendWeeklyReport(new Date()), REPORT_CHECK_INTERVAL_MS));

  for (const t of [...timers, ...timeouts]) t.unref?.();
  console.log('[scheduler] 已启动：告警引擎 / 超时升级 / 周报');
}
