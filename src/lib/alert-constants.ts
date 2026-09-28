// 告警常量与类型（纯前端/后端通用，禁止引入 fs 等 Node 模块）
// 服务端规则存储见 alert-rules.ts；浏览器组件引用本文件。

export type AlertDirection = 'high' | 'low';
export type AlertSeverity = 'P1' | 'P2' | 'P3';

export const ALERT_SEVERITIES: AlertSeverity[] = ['P1', 'P2', 'P3'];

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  P1: 'P1 紧急',
  P2: 'P2 重要',
  P3: 'P3 提示',
};

export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  P1: 'var(--danger)',
  P2: 'var(--warning)',
  P3: 'var(--info)',
};

export const DIRECTION_LABEL: Record<AlertDirection, string> = {
  high: '高于上限',
  low: '低于下限',
};

export interface AlertRule {
  id: string;
  sensor_tag: string;
  enabled: boolean;
  direction: AlertDirection;
  /** 触发阈值 */
  threshold: number;
  /** 死区/回差：恢复需回退超过该值 */
  deadband: number;
  severity: AlertSeverity;
  /** 持续满足多少秒才触发（0 = 立即） */
  min_duration_sec: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AlertAck {
  status: 'acked' | 'new';
  handler: string;
  comment: string;
  rootCause: string;
  /** 根因分类（结构化枚举值） */
  rootCauseCategory: string;
  /** 处理措施 */
  measure: string;
  ackedAt: string | null;
}

export interface ActiveAlert {
  ruleId: string;
  eventKey: string;
  sensorTag: string;
  deviceId: string;
  severity: AlertSeverity;
  direction: AlertDirection;
  threshold: number;
  deadband: number;
  value: number;
  since: number;
  notify: string;
  note: string;
  duration_sec?: number;
  ack?: AlertAck | null;
}

export interface AlertEventItem {
  ts: string;
  event_key: string;
  rule_id: string;
  sensor_tag: string;
  device_id: string;
  severity: AlertSeverity;
  direction: AlertDirection;
  state: 'active' | 'resolved' | string;
  value: number;
  threshold: number;
  message: string;
  notify: string;
  /** 'rule' 规则告警 | 'anomaly' 极值异常 */
  source?: 'rule' | 'anomaly';
  /** 极值异常原始方向：NEW_HIGH / NEW_LOW */
  anomaly_direction?: string;
  baseline_min?: number;
  baseline_max?: number;
  has_report?: number;
  ack?: AlertAck | null;
}
