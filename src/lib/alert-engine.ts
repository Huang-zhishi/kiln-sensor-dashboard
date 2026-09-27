// 告警引擎：按规则评估最新值 → 触发/恢复 → 写事件 + 企业微信通知
// 单进程内 setInterval 周期评估（默认 10s）；活动状态落 data/config/alert-state.json，
// 事件与处理记录落 TDengine（alert_events / alert_acks）。

import { queryWithCache, CACHE_TTL } from './db';
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
}

let lastEval = 0;
let evaluating = false;
let timer: ReturnType<typeof setInterval> | null = null;

function loadState(): EngineState {
  const s = readConfig<EngineState>(STATE_FILE, { version: 1, active: {}, breachSince: {} });
  return {
    version: 1,
    active: s.active && typeof s.active === 'object' ? s.active : {},
    breachSince: s.breachSince && typeof s.breachSince === 'object' ? s.breachSince : {},
  };
}

function saveState(s: EngineState): void {
  writeConfig(STATE_FILE, s);
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
    return r.ok ? 'sent' : 'failed';
  } catch (err) {
    console.error('[alert-engine] 企业微信通知失败:', err);
    return 'failed';
  }
}

function buildMessage(rule: AlertRule, value: number): string {
  const dir = rule.direction === 'high' ? '高于上限' : '低于下限';
  const unitNote = rule.note ? `\n备注：${rule.note}` : '';
  return `【${rule.severity} 告警】${rule.sensor_tag}\n当前值 ${value} ${dir}阈值 ${rule.threshold}${unitNote}`;
}

export async function evaluateAlerts(): Promise<void> {
  if (evaluating) return;
  evaluating = true;
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

    saveState(state);
    lastEval = now;
  } catch (err) {
    console.error('[alert-engine] 评估失败:', err);
  } finally {
    evaluating = false;
  }
}

export function getActiveAlerts(): ActiveAlert[] {
  return Object.values(loadState().active).sort((a, b) => b.since - a.since);
}

export function getLastEval(): number {
  return lastEval;
}

/** 启动物理引擎（单进程单例）。重复调用无副作用。 */
export function ensureAlertEngine(): void {
  if (timer) return;
  void evaluateAlerts();
  timer = setInterval(() => void evaluateAlerts(), EVAL_INTERVAL_MS);
  timer.unref?.();
}

/** 通知文本构造，供手动「重发」复用。 */
export function notifyContentFor(rule: { sensor_tag: string; severity: string; direction: string; threshold: number; note?: string }, value: number): string {
  return buildMessage(rule as AlertRule, value);
}
