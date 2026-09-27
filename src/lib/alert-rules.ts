// 告警规则：按测点配置阈值 / 死区 / 分级 / 持续时长
// 存储于 data/config/alert-rules.json（可变配置，走文件而非 TDengine）

import { randomUUID } from 'crypto';
import { readConfig, writeConfig } from './config-store';
import type { AlertDirection, AlertSeverity, AlertRule } from './alert-constants';

export type { AlertDirection, AlertSeverity, AlertRule };
export { ALERT_SEVERITIES, SEVERITY_LABEL } from './alert-constants';

interface RulesFile {
  version: number;
  rules: AlertRule[];
}

const FILE = 'alert-rules.json';

export function loadRules(): AlertRule[] {
  const data = readConfig<RulesFile>(FILE, { version: 1, rules: [] });
  return Array.isArray(data.rules) ? data.rules : [];
}

function saveRules(rules: AlertRule[]): void {
  writeConfig<RulesFile>(FILE, { version: 1, rules });
}

export class RuleValidationError extends Error {}

export interface RuleInput {
  id?: string;
  sensor_tag?: unknown;
  enabled?: unknown;
  direction?: unknown;
  threshold?: unknown;
  deadband?: unknown;
  severity?: unknown;
  min_duration_sec?: unknown;
  note?: unknown;
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

/** 新增或更新规则；缺省字段沿用原值（新增时用默认值） */
export function upsertRule(input: RuleInput): AlertRule {
  const rules = loadRules();
  const idx = input.id ? rules.findIndex((r) => r.id === input.id) : -1;
  const base: AlertRule =
    idx >= 0
      ? rules[idx]
      : {
          id: `r_${randomUUID().slice(0, 8)}`,
          sensor_tag: '',
          enabled: true,
          direction: 'high',
          threshold: 0,
          deadband: 0,
          severity: 'P2',
          min_duration_sec: 0,
          note: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

  const sensor_tag = input.sensor_tag !== undefined ? String(input.sensor_tag).trim() : base.sensor_tag;
  if (!sensor_tag) throw new RuleValidationError('sensor_tag 不能为空');
  if (sensor_tag.length > 128) throw new RuleValidationError('sensor_tag 过长（>128）');

  const direction = input.direction !== undefined ? String(input.direction) : base.direction;
  if (direction !== 'high' && direction !== 'low') throw new RuleValidationError('direction 必须为 high/low');

  const severity = input.severity !== undefined ? String(input.severity) : base.severity;
  if (severity !== 'P1' && severity !== 'P2' && severity !== 'P3') {
    throw new RuleValidationError('severity 必须为 P1/P2/P3');
  }

  const threshold = input.threshold !== undefined ? num(input.threshold, NaN) : base.threshold;
  if (!isFinite(threshold)) throw new RuleValidationError('threshold 必须为数字');

  const deadband = input.deadband !== undefined ? num(input.deadband, 0) : base.deadband;
  if (deadband < 0) throw new RuleValidationError('deadband 不能为负');

  const minDuration = input.min_duration_sec !== undefined ? num(input.min_duration_sec, 0) : base.min_duration_sec;
  if (minDuration < 0) throw new RuleValidationError('min_duration_sec 不能为负');

  const next: AlertRule = {
    ...base,
    sensor_tag,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : base.enabled,
    direction,
    threshold,
    deadband,
    severity,
    min_duration_sec: Math.floor(minDuration),
    note: input.note !== undefined ? String(input.note).slice(0, 255) : base.note,
    updated_at: new Date().toISOString(),
  };

  if (idx >= 0) rules[idx] = next;
  else rules.push(next);
  saveRules(rules);
  return next;
}

export function deleteRule(id: string): boolean {
  const rules = loadRules();
  const next = rules.filter((r) => r.id !== id);
  if (next.length === rules.length) return false;
  saveRules(next);
  return true;
}
