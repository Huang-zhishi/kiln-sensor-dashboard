// 告警引擎：按规则评估最新值 → 触发/恢复 → 写事件 + 企业微信通知
// 单进程内 setInterval 周期评估（默认 10s）；活动状态落 data/config/alert-state.json，
// 事件与处理记录落 TDengine（alert_events / alert_acks）。

import { queryWithCache, CACHE_TTL, query, toRows } from './db';
import { loadRules, type AlertRule } from './alert-rules';
import { loadMetaMap, isAlertable } from './sensor-meta';
import { appendAlertEvent } from './alert-store';
import { readConfig, writeConfig } from './config-store';

const STATE_FILE = 'alert-state.json';
const EVAL_INTERVAL_MS = 10_000;

export interface ActiveAlert {
  ruleId: string;
  eventKey: string;
  sensorTag: string;
  deviceId: string;
  severity: string;
  direction: string;
  threshold: number;
  deadband: number;
  value: number;
  since: number;
  notify: string;
  note: string;
}

interface EngineState {
  version: number;
  active: Record<string, ActiveAlert>;
  breachSince: Record<string, number>;
  /** 已通知的极值异常最大 ts（epoch 毫秒），用于去重/避免重复推送 */
  anomaly_notified_ms?: number;
}

// 单例守卫放在 globalThis 上：Next.js 会把 lib 打进多个 bundle（instrumentation / route
// handlers / server components），模块级变量不跨 bundle 共享，会出现「两个告警引擎各跑一个
// 定时器」→ 同一极值事件被推送两次（2026-10-04 发现）。globalThis 在同一进程内共享，
// 是 Next.js 单例的标准修法（多进程部署需改用跨进程锁）。
type EngineRuntime = {
  timer: ReturnType<typeof setInterval> | null;
  evaluating: boolean;
  lastEval: number;
};
const runtime: EngineRuntime = ((globalThis as { __kilnAlertEngine?: EngineRuntime }).__kilnAlertEngine ??= {
  timer: null,
  evaluating: false,
  lastEval: 0,
});

function loadState(): EngineState {
  const s = readConfig<EngineState>(STATE_FILE, { version: 1, active: {}, breachSince: {} });
  return {
    version: 1,
    active: s.active && typeof s.active === 'object' ? s.active : {},
    breachSince: s.breachSince && typeof s.breachSince === 'object' ? s.breachSince : {},
    // 必须保留：否则每轮都走「首次运行」分支，极值异常通知永远不会发
    anomaly_notified_ms: typeof s.anomaly_notified_ms === 'number' ? s.anomaly_notified_ms : undefined,
  };
}

function saveState(s: EngineState): void {
  writeConfig(STATE_FILE, s);
}

// 极值异常（Agent 写入 anomaly_events）→ 中控台统一推送企业微信。
// 与规则告警共用 webhook；首次运行只记水位、不回刷历史，避免刷屏。
async function notifyNewAnomalies(state: EngineState): Promise<void> {
  const lastMs = Number(state.anomaly_notified_ms || 0);
  if (!lastMs) {
    state.anomaly_notified_ms = Date.now();
    return;
  }
  let rows: Record<string, unknown>[] = [];
  try {
    const res = await query(
      `SELECT ts, event_key, sensor_tag, sensor_value, direction, baseline_min, baseline_max, device_id, kiln_id, note, report, level
       FROM anomaly_events WHERE ts > ${Math.floor(lastMs)} ORDER BY ts ASC LIMIT 20`,
    );
    rows = toRows(res);
  } catch {
    return; // 表不存在 / 库抖动：跳过
  }
  if (!rows.length) return;

  let maxMs = lastMs;
  for (const r of rows) {
    const tsMs = new Date(String(r.ts)).getTime();
    if (isFinite(tsMs) && tsMs > maxMs) maxMs = tsMs;
    const tag = String(r.sensor_tag ?? '');
    const dir = String(r.direction ?? '');
    const label = dir === 'NEW_HIGH' ? '突破历史最高' : dir === 'NEW_LOW' ? '突破历史最低' : dir;
    const level = String(r.level ?? '');
    const note = r.note ? `\n> 备注：${String(r.note)}` : '';
    const levelTag = level ? `【${level}】` : '';
    // 头部告警信息 + Agent 分析报告全文（报告在写库时已生成）
    const header =
      `## ⚠️ ${levelTag}突破历史极值 · Agent 分析\n` +
      `> 测点：${tag}\n` +
      `> ${label}：${String(r.sensor_value)}（历史区间 ${String(r.baseline_min)} ~ ${String(r.baseline_max)}）${note}`;
    const report = String(r.report ?? '').trim();
    const content = report ? `${header}\n\n${report}` : `${header}\n\n> （暂无分析报告）`;
    await sendWecomMarkdown(content);
  }
  state.anomaly_notified_ms = maxMs;
}

/** 最新值映射：sensor_tag -> { value, deviceId }（同一 tag 多设备时取其一）。 */
async function fetchLatest(): Promise<Map<string, { value: number; deviceId: string }>> {
  const rows = await queryWithCache<Record<string, unknown>[]>(
    'alert-latest',
    `SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value, device_id, sensor_tag
     FROM sensor_readings PARTITION BY device_id, sensor_tag`,
    CACHE_TTL.latest,
  );
  const map = new Map<string, { value: number; deviceId: string }>();
  for (const r of rows) {
    const tag = String(r.sensor_tag ?? '');
    if (!tag) continue;
    const value = Number(r.sensor_value);
    if (!isFinite(value)) continue;
    map.set(tag, { value, deviceId: String(r.device_id ?? '') });
  }
  return map;
}

/** 企业微信机器人通知；未配置 webhook 时返回 skipped。 */
export async function sendWecomMessage(content: string): Promise<'sent' | 'failed' | 'skipped'> {
  const url = process.env.WECHAT_WEBHOOK_URL || process.env.WECOM_WEBHOOK_URL || '';
  if (!url) return 'skipped';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content } }),
      signal: AbortSignal.timeout(8000),
    });
    const status = r.ok ? 'sent' : 'failed';
    console.log(`[alert-engine] 企业微信通知 ${status}: ${content.split('\n')[0]}`);
    return status;
  } catch (err) {
    console.error('[alert-engine] 企业微信通知失败:', err);
    return 'failed';
  }
}

/** UTF-8 字节长度（企业微信 markdown 上限 4096 字节，留安全余量用 3800）。 */
function byteLen(s: string): number {
  return typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : s.length * 3;
}

// markdown 表格分隔行：| --- | :---: | ...
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
// 小数点统一两位：只处理 873.05853 / -14.444483，跳过 §2.3 章节号
const DECIMAL_RE = /(?<![\d.§])(-?\d+\.\d+)(?![\d])/g;

/** 与 Agent 侧 _round_decimals_2dp 对齐：小数值统一保留两位。 */
function roundDecimals2dp(text: string): string {
  return text.replace(DECIMAL_RE, (m) => {
    const n = Number(m);
    return isFinite(n) ? n.toFixed(2) : m;
  });
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** 与 Agent 侧 _md_tables_to_wecom 对齐：企业微信 markdown 不支持表格，转为列表。 */
function mdTablesToWecom(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      i += 2; // 跳过表头与分隔行
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitTableRow(lines[i]).filter((c) => c !== '');
        if (cells.length === 1) out.push(`- ${cells[0]}`);
        else if (cells.length === 2) out.push(`- **${cells[0]}**：${cells[1]}`);
        else out.push(`- **${cells[0]}**：${cells.slice(1).join('　')}`);
        i++;
      }
      out.push('');
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

/** 与 Agent 侧 _split_markdown_by_bytes 对齐：优先按行边界切分，不切断多字节字符。 */
function splitMarkdownByBytes(text: string, limit: number): string[] {
  if (byteLen(text) <= limit) return [text];
  const parts: string[] = [];
  let cur = '';
  for (let line of text.split('\n')) {
    const candidate = cur ? `${cur}\n${line}` : line;
    if (byteLen(candidate) <= limit) {
      cur = candidate;
      continue;
    }
    if (cur) parts.push(cur);
    while (byteLen(line) > limit) {
      let piece = '';
      for (const ch of line) {
        if (byteLen(piece + ch) > limit) break;
        piece += ch;
      }
      parts.push(piece);
      line = line.slice(piece.length);
    }
    cur = line;
  }
  if (cur) parts.push(cur);
  return parts.length ? parts : [''];
}

/** 企业微信 markdown 通知（带 Agent 分析报告）：与 Agent 原逻辑一致，不截断、按行分片。 */
export async function sendWecomMarkdown(content: string): Promise<'sent' | 'failed' | 'skipped'> {
  const url = process.env.WECHAT_WEBHOOK_URL || process.env.WECOM_WEBHOOK_URL || '';
  if (!url) return 'skipped';
  const prepared = roundDecimals2dp(mdTablesToWecom(content));
  const chunks = splitMarkdownByBytes(prepared, 3800);
  let ok = true;
  for (let i = 0; i < chunks.length; i++) {
    const body = chunks.length === 1 ? chunks[i] : `(${i + 1}/${chunks.length})\n${chunks[i]}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: body } }),
        signal: AbortSignal.timeout(8000),
      });
      ok = ok && r.ok;
    } catch (err) {
      console.error('[alert-engine] 企业微信 markdown 通知失败:', err);
      ok = false;
    }
  }
  const status = ok ? 'sent' : 'failed';
  console.log(`[alert-engine] 企业微信分析报告 ${status}（${chunks.length} 片, ${byteLen(prepared)}B）: ${content.split('\n')[0]}`);
  return status;
}

function buildMessage(rule: AlertRule, value: number): string {
  const dir = rule.direction === 'high' ? '高于上限' : '低于下限';
  const unitNote = rule.note ? `\n备注：${rule.note}` : '';
  return `【${rule.severity} 告警】${rule.sensor_tag}\n当前值 ${value} ${dir}阈值 ${rule.threshold}${unitNote}`;
}

export async function evaluateAlerts(): Promise<void> {
  if (runtime.evaluating) return;
  runtime.evaluating = true;
  try {
    const rules = loadRules();
    const state = loadState();
    const metaMap = loadMetaMap();
    const now = Date.now();
    const present = new Set<string>();

    // 无规则时也要收敛活动态（否则删除最后一条规则会留下悬挂告警）
    const latest = rules.length > 0
      ? await fetchLatest()
      : new Map<string, { value: number; deviceId: string }>();

    for (const rule of rules) {
        present.add(rule.id);

        // 规则停用 / 测点检修 / 测点停用：若有活动告警则自动恢复
        if (!rule.enabled || !isAlertable(metaMap[rule.sensor_tag])) {
          delete state.breachSince[rule.id];
          const cur = state.active[rule.id];
          if (cur) {
            delete state.active[rule.id];
            await appendAlertEvent({
              eventKey: cur.eventKey,
              ruleId: rule.id,
              sensorTag: rule.sensor_tag,
              deviceId: cur.deviceId,
              severity: rule.severity,
              direction: rule.direction,
              state: 'resolved',
              value: cur.value,
              threshold: rule.threshold,
              message: '规则停用或测点检修，自动恢复',
              notify: 'none',
            });
          }
          continue;
        }

        const lv = latest.get(rule.sensor_tag);
        if (!lv) continue;
        const v = lv.value;
        const breached = rule.direction === 'high' ? v >= rule.threshold : v <= rule.threshold;
        const recovered = rule.direction === 'high' ? v < rule.threshold - rule.deadband : v > rule.threshold + rule.deadband;

        if (breached) {
          if (!state.breachSince[rule.id]) state.breachSince[rule.id] = now;
          const since = state.breachSince[rule.id];
          const cur = state.active[rule.id];
          if (!cur && now - since >= rule.min_duration_sec * 1000) {
            const eventKey = `${rule.id}|${new Date(since).toISOString()}`;
            const notify = await sendWecomMessage(buildMessage(rule, v));
            state.active[rule.id] = {
              ruleId: rule.id,
              eventKey,
              sensorTag: rule.sensor_tag,
              deviceId: lv.deviceId,
              severity: rule.severity,
              direction: rule.direction,
              threshold: rule.threshold,
              deadband: rule.deadband,
              value: v,
              since,
              notify,
              note: rule.note,
            };
            await appendAlertEvent({
              eventKey,
              ruleId: rule.id,
              sensorTag: rule.sensor_tag,
              deviceId: lv.deviceId,
              severity: rule.severity,
              direction: rule.direction,
              state: 'active',
              value: v,
              threshold: rule.threshold,
              message: buildMessage(rule, v),
              notify,
            });
          } else if (cur) {
            cur.value = v;
          }
        } else {
          delete state.breachSince[rule.id];
          const cur = state.active[rule.id];
          if (cur && recovered) {
            delete state.active[rule.id];
            await appendAlertEvent({
              eventKey: cur.eventKey,
              ruleId: rule.id,
              sensorTag: rule.sensor_tag,
              deviceId: cur.deviceId,
              severity: rule.severity,
              direction: rule.direction,
              state: 'resolved',
              value: v,
              threshold: rule.threshold,
              message: '已恢复正常',
              notify: 'none',
            });
          }
        }
      }

      // 规则被删除但仍有活动告警 → 恢复
      for (const ruleId of Object.keys(state.active)) {
        if (!present.has(ruleId)) {
          const cur = state.active[ruleId];
          delete state.active[ruleId];
          await appendAlertEvent({
            eventKey: cur.eventKey,
            ruleId,
            sensorTag: cur.sensorTag,
            deviceId: cur.deviceId,
            severity: cur.severity,
            direction: cur.direction,
            state: 'resolved',
            value: cur.value,
            threshold: cur.threshold,
            message: '规则已删除，自动恢复',
            notify: 'none',
          });
        }
      }

    // 极值异常通知（与规则告警共用 webhook）
    await notifyNewAnomalies(state);

    saveState(state);
    runtime.lastEval = now;
  } catch (err) {
    console.error('[alert-engine] 评估失败:', err);
  } finally {
    runtime.evaluating = false;
  }
}
export function getActiveAlerts(): ActiveAlert[] {
  return Object.values(loadState().active).sort((a, b) => b.since - a.since);
}

export function getLastEval(): number {
  return runtime.lastEval;
}

/** 启动物理引擎（进程内单例，跨 bundle 共享）。重复调用无副作用。 */
export function ensureAlertEngine(): void {
  if (runtime.timer) return;
  void evaluateAlerts();
  runtime.timer = setInterval(() => void evaluateAlerts(), EVAL_INTERVAL_MS);
  runtime.timer.unref?.();
}

/** 通知文本构造，供手动「重发」复用。 */
export function notifyContentFor(rule: { sensor_tag: string; severity: string; direction: string; threshold: number; note?: string }, value: number): string {
  return buildMessage(rule as AlertRule, value);
}
