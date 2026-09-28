// 未处理超时升级提醒
// 周期扫描「未处理」的规则告警与极值异常，超过分级阈值后推送企业微信，
// 同一事件最多每 ESCALATION_RE_NOTIFY_HOURS 小时提醒一次，处理（acked）后自动停止。
//
// 阈值（分钟）：P1 默认 60 / P2 默认 240 / P3 默认 1440，可用环境变量覆盖。
// 状态落 data/config/escalation-state.json。

import { query, toRows } from './db';
import { fetchMergedAcks } from './acks';
import { getActiveAlerts, sendWecomMarkdown } from './alert-engine';
import { readConfig, writeConfig } from './config-store';

const STATE_FILE = 'escalation-state.json';
const LOOKBACK_HOURS = 7 * 24;

type Severity = 'P1' | 'P2' | 'P3';

function envNum(name: string, def: number): number {
  const v = Number(process.env[name]);
  return isFinite(v) && v > 0 ? v : def;
}

function thresholds(): Record<Severity, number> {
  return {
    P1: envNum('ESCALATION_P1_MINUTES', 60),
    P2: envNum('ESCALATION_P2_MINUTES', 240),
    P3: envNum('ESCALATION_P3_MINUTES', 1440),
  };
}

function reNotifyMs(): number {
  return envNum('ESCALATION_RE_NOTIFY_HOURS', 6) * 3600_000;
}

/** 极值异常的 level 归一化为 P1/P2/P3。 */
function normalizeSeverity(level?: string): Severity {
  const s = String(level || '').toUpperCase();
  if (s.includes('P1') || s.includes('DANGER') || s.includes('紧急')) return 'P1';
  if (s.includes('P3') || s.includes('INFO') || s.includes('提示')) return 'P3';
  return 'P2';
}

function fmtAge(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const h = minutes / 60;
  if (h < 24) return `${h.toFixed(1)} 小时`;
  return `${(h / 24).toFixed(1)} 天`;
}

interface EscalationState {
  version: number;
  /** event_key -> 最近一次提醒时间（epoch 毫秒） */
  notified: Record<string, number>;
}

interface Pending {
  key: string;
  tag: string;
  severity: Severity;
  ageMin: number;
  source: string;
}

export async function runEscalationScan(): Promise<void> {
  const th = thresholds();
  const now = Date.now();
  let acks: Awaited<ReturnType<typeof fetchMergedAcks>>;
  try {
    acks = await fetchMergedAcks();
  } catch {
    return;
  }

  const pending: Pending[] = [];

  // 1) 规则告警（引擎当前活动态）
  for (const a of getActiveAlerts()) {
    if (acks.get(a.eventKey)?.status === 'acked') continue;
    const sev = (['P1', 'P2', 'P3'].includes(a.severity) ? a.severity : 'P2') as Severity;
    const ageMin = (now - a.since) / 60000;
    if (ageMin >= th[sev]) {
      pending.push({ key: a.eventKey, tag: a.sensorTag, severity: sev, ageMin, source: '规则告警' });
    }
  }

  // 2) 极值异常（Agent 写入 anomaly_events）
  try {
    const res = await query(
      `SELECT ts, event_key, sensor_tag, level FROM anomaly_events ` +
        `WHERE ts > NOW() - ${LOOKBACK_HOURS}h ORDER BY ts DESC LIMIT 1000`,
    );
    for (const r of toRows(res)) {
      const key = String(r.event_key ?? '');
      if (!key || acks.get(key)?.status === 'acked') continue;
      const sev = normalizeSeverity(String(r.level ?? ''));
      const tsMs = new Date(String(r.ts)).getTime();
      if (!isFinite(tsMs)) continue;
      const ageMin = (now - tsMs) / 60000;
      if (ageMin >= th[sev]) {
        pending.push({ key, tag: String(r.sensor_tag ?? ''), severity: sev, ageMin, source: '极值异常' });
      }
    }
  } catch {
    // 表不存在 / 库抖动：仅按规则告警判断
  }

  const state = readConfig<EscalationState>(STATE_FILE, { version: 1, notified: {} });
  if (!state.notified || typeof state.notified !== 'object') state.notified = {};

  const reMs = reNotifyMs();
  const toNotify = pending.filter((p) => now - (state.notified[p.key] || 0) >= reMs);

  if (toNotify.length > 0) {
    toNotify.sort((a, b) => b.ageMin - a.ageMin);
    const sevRank: Record<Severity, number> = { P1: 0, P2: 1, P3: 2 };
    toNotify.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.ageMin - a.ageMin);
    const lines = toNotify
      .slice(0, 40)
      .map((p) => `- **${p.severity}** ${p.tag}（${p.source}）已持续 ${fmtAge(p.ageMin)}`);
    const more = toNotify.length > 40 ? `\n> 其余 ${toNotify.length - 40} 条略。` : '';
    const content =
      `## ⏰ 超时未处理提醒（${toNotify.length} 条）\n\n${lines.join('\n')}${more}\n\n` +
      `> 阈值：P1 ${th.P1}min / P2 ${th.P2}min / P3 ${th.P3}min；` +
      `在中控台标记「已处理」后自动停止提醒。`;
    await sendWecomMarkdown(content);
    for (const p of toNotify) state.notified[p.key] = now;
  }

  // 清理：仅保留仍在待处理集合中的 key，避免状态文件无限增长
  const pendingKeys = new Set(pending.map((p) => p.key));
  for (const k of Object.keys(state.notified)) {
    if (!pendingKeys.has(k)) delete state.notified[k];
  }
  writeConfig(STATE_FILE, state);
}
