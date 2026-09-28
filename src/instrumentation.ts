// Next.js 启动钩子：服务实例初始化时拉起后台调度器（告警引擎/超时升级/周报）。
// 仅 Node.js 运行时、非构建阶段执行。

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  try {
    const { ensureSchedulers } = await import('./lib/scheduler');
    ensureSchedulers();
  } catch (err) {
    console.error('[instrumentation] 启动调度器失败:', err);
  }
}
