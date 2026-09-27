// 报表中心：按周期（今日/昨日/白班/夜班/近7天/自定义）聚合每个测点的统计值
// GET /api/reports?kind=today|yesterday|day|night|7d|custom&start=&end=&kiln_id=&type=
// 数据源 stats_1m_agg（分钟预聚合），MIN/MAX/AVG/COUNT 按测点汇总。

import { NextRequest, NextResponse } from 'next/server';
import { queryWithCache, CACHE_TTL } from '@/lib/db';
import { classifySensor, extractKilnId, UNIT_MAP } from '@/lib/sensor-classifier';
import { loadMetaMap, displayName } from '@/lib/sensor-meta';

export const dynamic = 'force-dynamic';

const MAX_SPAN_MS = 31 * 24 * 3600_000;

function escapeSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function shiftWindow(now: Date, kind: 'day' | 'night'): { start: number; end: number; label: string } {
  const base = startOfDay(now).getTime();
  if (kind === 'day') {
    // 白班 08:00–20:00，取最近一个已开始的
    let start = base + 8 * 3600_000;
    if (now.getTime() < start) start -= 24 * 3600_000;
    return { start, end: start + 12 * 3600_000, label: '白班 08:00–20:00' };
  }
  // 夜班 20:00–次日 08:00
  const today8 = base + 8 * 3600_000;
  const start = now.getTime() < today8 ? base - 4 * 3600_000 : base + 20 * 3600_000;
  return { start, end: start + 12 * 3600_000, label: '夜班 20:00–08:00' };
}

function resolveWindow(kind: string, startParam: string | null, endParam: string | null) {
  const now = new Date();
  let win: { start: number; end: number; label: string };
  switch (kind) {
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = startOfDay(y).getTime();
      win = { start: s, end: s + 24 * 3600_000, label: '昨日' };
      break;
    }
    case 'day':
      win = shiftWindow(now, 'day');
      break;
    case 'night':
      win = shiftWindow(now, 'night');
      break;
    case '7d':
      win = { start: now.getTime() - 7 * 24 * 3600_000, end: now.getTime(), label: '近 7 天' };
      break;
    case 'custom': {
      const s = Number(startParam);
      const e = Number(endParam);
      if (isFinite(s) && isFinite(e)) {
        const a = Math.min(s, e);
        const b = Math.max(s, e);
        win = { start: a, end: b, label: '自定义' };
      } else {
        win = { start: startOfDay(now).getTime(), end: now.getTime(), label: '今日' };
      }
      break;
    }
    case 'today':
    default:
      win = { start: startOfDay(now).getTime(), end: now.getTime(), label: '今日' };
  }
  // 上限 31 天，防止全表扫描
  if (win.end - win.start > MAX_SPAN_MS) win.start = win.end - MAX_SPAN_MS;
  return win;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') || 'today';
    const kilnId = searchParams.get('kiln_id') || '';
    const typeFilter = searchParams.get('type') || '';
    const win = resolveWindow(kind, searchParams.get('start'), searchParams.get('end'));

    const sql = `
      SELECT sensor_tag, device_id,
             MIN(min_val) AS min_value,
             MAX(max_val) AS max_value,
             AVG(avg_val) AS avg_value,
             SUM(cnt) AS rec_count
      FROM stats_1m_agg
      WHERE ts >= ${Math.floor(win.start)} AND ts <= ${Math.floor(win.end)}
      ${kilnId ? `AND sensor_tag LIKE '${escapeSql(kilnId)}%'` : ''}
      GROUP BY sensor_tag, device_id
      ORDER BY sensor_tag
    `;

    const rows = await queryWithCache<Record<string, unknown>[]>(
      `report:${kind}:${win.start}:${win.end}:${kilnId}:${typeFilter}`,
      sql,
      CACHE_TTL.stats,
    );

    // 告警次数（表可能不存在 → 容错为空）
    const alertBySensor = new Map<string, number>();
    try {
      const alertRows = await queryWithCache<Record<string, unknown>[]>(
        `report-alerts:${win.start}:${win.end}`,
        `SELECT sensor_tag, COUNT(*) AS cnt FROM alert_events
         WHERE ts >= ${Math.floor(win.start)} AND ts <= ${Math.floor(win.end)}
         GROUP BY sensor_tag`,
        CACHE_TTL.stats,
      );
      for (const r of alertRows) {
        const tag = String(r.sensor_tag ?? '');
        if (tag) alertBySensor.set(tag, Number(r.cnt) || 0);
      }
    } catch {
      // alert_events 尚未创建
    }

    const metaMap = loadMetaMap();
    let items = rows.map((r) => {
      const tag = String(r.sensor_tag ?? '');
      const type = classifySensor(tag);
      const meta = metaMap[tag];
      return {
        sensor_tag: tag,
        display_name: displayName(tag, meta),
        type,
        unit: meta?.unit?.trim() || UNIT_MAP[type] || '',
        kiln_id: extractKilnId(tag),
        device_id: String(r.device_id ?? ''),
        count: Number(r.rec_count) || 0,
        min_value: r.min_value === null || r.min_value === undefined ? null : Number(r.min_value),
        max_value: r.max_value === null || r.max_value === undefined ? null : Number(r.max_value),
        avg_value: r.avg_value === null || r.avg_value === undefined ? null : Number(r.avg_value),
        alert_count: alertBySensor.get(tag) || 0,
      };
    });
    if (typeFilter) items = items.filter((i) => i.type === typeFilter);

    return NextResponse.json({
      success: true,
      window: { kind, label: win.label, start: win.start, end: win.end },
      count: items.length,
      items,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('report error:', message);
    return NextResponse.json({ success: false, error: message, items: [] }, { status: 500 });
  }
}
