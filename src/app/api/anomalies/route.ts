// 异常记录列表接口：直连 TDengine 的 anomaly_events（Agent 在突破历史极值时写入）
// 支持筛选：时间范围 / 突破方向 / 仅看有分析 / 处理状态；并合并 anomaly_acks 的已处理状态。
// 列表不返回报告全文，报告通过 /api/anomalies/[key] 按需拉取。

import { NextResponse } from 'next/server';
import { CACHE_TTL, queryWithCache } from '@/lib/db';
import { fetchMergedAcks } from '@/lib/acks';

export const dynamic = 'force-dynamic';

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Math.min(Math.max(Number(searchParams.get('hours')) || 168, 1), 2160);
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500);
  const direction = searchParams.get('direction') || '';
  const onlyReport = searchParams.get('only_report') === '1';
  const statusFilter = searchParams.get('status') || ''; // acked | new | ''

  const where = [`ts > NOW() - ${hours}h`];
  if (direction === 'NEW_HIGH' || direction === 'NEW_LOW') {
    where.push(`direction = '${escapeSql(direction)}'`);
  }
  if (onlyReport) where.push(`report != ''`);

  const sql = `
    SELECT ts, event_key, sensor_tag, sensor_value, direction,
           baseline_min, baseline_max, device_id, kiln_id, note,
           CASE WHEN report IS NULL OR report = '' THEN 0 ELSE 1 END AS has_report
    FROM anomaly_events
    WHERE ${where.join(' AND ')}
    ORDER BY ts DESC
    LIMIT ${limit}
  `;

  const cacheKey = `anomalies:${hours}:${limit}:${direction}:${onlyReport}:${statusFilter}`;

  try {
    const events = await queryWithCache<Record<string, unknown>[]>(cacheKey, sql, CACHE_TTL.latest);
    // 统一处理记录：alert_acks（富）为准，anomaly_acks（历史）兜底
    const acks = await fetchMergedAcks();
    let items = events.map((e) => {
      const a = acks.get(String(e.event_key ?? ''));
      return {
        ...e,
        status: a?.status === 'acked' ? 'acked' : 'new',
        acked_at: a?.ackedAt ?? null,
        handler: a?.handler ?? '',
        root_cause: a?.rootCause ?? '',
        root_cause_category: a?.rootCauseCategory ?? '',
        measure: a?.measure ?? '',
      };
    });
    if (statusFilter === 'acked' || statusFilter === 'new') {
      items = items.filter((i) => i.status === statusFilter);
    }
    return NextResponse.json({ success: true, count: items.length, items });
  } catch (err) {
    // 表尚未创建 / 数据库抖动：返回空列表而非 500，避免首页崩溃
    console.error('anomalies list error:', err);
    return NextResponse.json({ success: false, count: 0, items: [], warning: (err as Error).message });
  }
}
