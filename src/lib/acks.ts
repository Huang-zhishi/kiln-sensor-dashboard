// 处理记录统一读取：以 alert_acks（富：处理人/意见/根因/分类/措施）为权威，
// anomaly_acks（历史遗留，仅状态）作为兜底补齐。
//
// 背景：早期首页「标记已处理」写的是 anomaly_acks（只有状态），告警中心写 alert_acks（完整）。
// 现统一为 alert_acks 为准，legacy 仅用于回显历史记录，不再写入。

import { fetchAlertAcks, type AlertAckRecord } from './alert-store';
import { fetchAcks as fetchLegacyAcks } from './anomaly-acks';

export type { AlertAckRecord };

export async function fetchMergedAcks(): Promise<Map<string, AlertAckRecord>> {
  const map = new Map<string, AlertAckRecord>();

  // 1) 历史遗留状态（仅 status/ackedAt）
  try {
    const legacy = await fetchLegacyAcks();
    for (const [k, v] of legacy) {
      map.set(k, {
        status: v.status,
        handler: '',
        comment: '',
        rootCause: '',
        rootCauseCategory: '',
        measure: '',
        ackedAt: v.ackedAt,
      });
    }
  } catch {
    // anomaly_acks 表尚未创建：忽略
  }

  // 2) 富处理记录覆盖（同一 event_key 以 alert_acks 为准）
  try {
    const rich = await fetchAlertAcks();
    for (const [k, v] of rich) {
      map.set(k, v);
    }
  } catch {
    // alert_acks 表尚未创建：忽略
  }

  return map;
}
