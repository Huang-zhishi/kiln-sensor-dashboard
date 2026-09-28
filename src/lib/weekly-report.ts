// 异常闭环周报：按周聚合 MTTR / 根因分布 / 处理人工作量，生成 Markdown 并推送企业微信。
// 可选：配置 AGENT_BASE_URL + AGENT_API_TOKEN 后，调用 Agent 生成一段「AI 点评」（fail-open）。
//
// 调度：默认每周一 08:00（容器时区 Asia/Shanghai），可用环境变量覆盖。
// 状态落 data/config/weekly-report-state.json，避免同一周重复推送。

import { computeClosedLoopStats, type ClosedLoopStats } from './closed-loop-stats';
import { sendWecomMarkdown } from './alert-engine';
import { readConfig, writeConfig } from './config-store';

const STATE_FILE = 'weekly-report-state.json';

function envNum(name: string, def: number): number {
  const v = Number(process.env[name]);
  return isFinite(v) ? v : def;
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtMttr(min: number | null): string {
  if (min === null || !isFinite(min)) return '暂无样本';
  if (min < 60) return `${min.toFixed(0)} 分钟`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)} 小时`;
  return `${(h / 24).toFixed(1)} 天`;
}

export function buildReportMarkdown(stats: ClosedLoopStats, end = new Date()): string {
  const start = new Date(end.getTime() - stats.window_hours * 3600_000);
  const rate = (stats.handling_rate * 100).toFixed(1);
  const lines: string[] = [];
  lines.push(`## 📊 窑炉异常闭环周报（${localDate(start)} ~ ${localDate(end)}）`);
  lines.push('');
  lines.push('**总体**');
  lines.push(`- 异常事件：${stats.total} 起`);
  lines.push(`- 已处理：${stats.handled} 起，未处理：${stats.unhandled} 起`);
  lines.push(`- 处理率：${rate}%`);
  lines.push(`- 平均处理时长：${fmtMttr(stats.avg_mttr_minutes)}${stats.mttr_sample ? `（${stats.mttr_sample} 条样本）` : ''}`);

  if (stats.by_category.length) {
    const totalCat = stats.by_category.reduce((s, c) => s + c.count, 0) || 1;
    lines.push('');
    lines.push('**根因分布**');
    for (const c of stats.by_category) {
      lines.push(`- ${c.label}：${c.count} 起（${Math.round((c.count / totalCat) * 100)}%）`);
    }
  }

  if (stats.by_handler.length) {
    lines.push('');
    lines.push('**处理人工作量**');
    for (const h of stats.by_handler) {
      lines.push(`- ${h.name}：${h.count} 起`);
    }
  }

  if (stats.by_kiln.length) {
    lines.push('');
    lines.push('**分窑体**');
    for (const k of stats.by_kiln) {
      const kr = k.total > 0 ? Math.round((k.handled / k.total) * 100) : 0;
      lines.push(`- ${k.kiln_id}：${k.total} 起，处理率 ${kr}%`);
    }
  }

  lines.push('');
  lines.push('> 数据来源：TDengine anomaly_events + 处理记录；由中控台自动生成。');
  return lines.join('\n');
}

/** 可选：调用 Agent 生成管理建议（未配置或失败则返回空串，不影响主链路）。 */
async function enrichWithAgent(report: string): Promise<string> {
  const base = (process.env.AGENT_BASE_URL || '').replace(/\/+$/, '');
  const token = process.env.AGENT_API_TOKEN || '';
  if (!base || !token) return '';
  const prompt =
    '以下是本周窑炉异常闭环统计数据。请用中文给出 3 条简短、可执行的管理建议（总字数不超过 200 字），' +
    '不要重复罗列数据。\n\n' +
    report;
  try {
    const r = await fetch(`${base}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        thread_id: `weekly-report-${localDate(new Date())}`,
        message: prompt,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) return '';
    const j = await r.json();
    const text = j?.data?.response;
    return typeof text === 'string' ? text.trim().slice(0, 1500) : '';
  } catch (err) {
    console.warn('[weekly-report] Agent 点评生成失败（忽略）:', err instanceof Error ? err.message : err);
    return '';
  }
}

/** 生成周报正文（含可选 Agent 点评，不发消息）。 */
export async function buildWeeklyReportContent(hours = 168): Promise<string> {
  const stats = await computeClosedLoopStats(hours);
  let content = buildReportMarkdown(stats);
  const ai = await enrichWithAgent(content);
  if (ai) content += `\n\n**AI 点评**\n\n${ai}`;
  return content;
}

/** 生成并推送周报。hours 默认 168（近 7 天）。 */
export async function sendWeeklyReport(hours = 168): Promise<{ notify: string; content: string }> {
  const content = await buildWeeklyReportContent(hours);
  const notify = await sendWecomMarkdown(content);
  console.log(`[weekly-report] 推送结果=${notify}`);
  return { notify, content };
}

interface WeekState {
  version: number;
  lastSentAt: string;
}

/** 到点则推送周报（由调度器周期调用）。返回是否实际发送。 */
export async function maybeSendWeeklyReport(now = new Date()): Promise<boolean> {
  if (process.env.WEEKLY_REPORT_ENABLED === '0') return false;
  const dow = envNum('WEEKLY_REPORT_DOW', 1) % 7; // 1=周一 … 7=周日（转换为 JS getDay）
  const hour = envNum('WEEKLY_REPORT_HOUR', 8);
  if (now.getDay() !== dow || now.getHours() !== hour) return false;

  const state = readConfig<WeekState>(STATE_FILE, { version: 1, lastSentAt: '' });
  if (state.lastSentAt && localDate(new Date(state.lastSentAt)) === localDate(now)) return false;

  try {
    await sendWeeklyReport();
  } catch (err) {
    console.error('[weekly-report] 推送失败:', err);
    return false;
  }
  writeConfig(STATE_FILE, { version: 1, lastSentAt: now.toISOString() });
  return true;
}
