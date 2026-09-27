'use client';

// 测点主数据治理：别名 / 单位 / 量程 / 精度 / 启停用 / 检修 / 坏点标记
// 支持：状态筛选（检修/停用/坏点/值缺失/已配置）、批量启用/停用/检修、无数据起始时间。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { SensorMeta, SensorMetaMap } from '@/lib/sensor-meta-types';
import { SENSOR_TYPE_COLORS, type SensorType } from '@/lib/sensor-classifier';

interface SensorOption {
  sensor_tag: string;
  device_id: string;
  kiln_id: string;
  type: string;
  unit: string;
}

interface QualityInfo {
  n: number;
  non_null: number;
  first_ts: string | null;
  last_ts: string | null;
  last_ok: string | null;
  no_data: boolean;
  no_data_since: string | null;
}
type QualityMap = Record<string, QualityInfo>;

type FilterKey = 'all' | 'maintenance' | 'disabled' | 'suspect' | 'nodata' | 'configured';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'nodata', label: '值缺失' },
  { key: 'maintenance', label: '检修' },
  { key: 'disabled', label: '停用' },
  { key: 'suspect', label: '坏点' },
  { key: 'configured', label: '已配置' },
];

function emptyMeta(tag: string): SensorMeta {
  return {
    sensor_tag: tag,
    alias: '',
    unit: '',
    range_min: null,
    range_max: null,
    precision: null,
    enabled: true,
    maintenance: false,
    suspect: false,
    location: '',
    note: '',
    updated_at: '',
  };
}

function fmtTs(iso?: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return String(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TagsPage() {
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [metaMap, setMetaMap] = useState<SensorMetaMap>({});
  const [quality, setQuality] = useState<QualityMap>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [sRes, mRes, qRes] = await Promise.all([
        apiFetch('/api/sensors/list'),
        apiFetch('/api/sensors/meta'),
        apiFetch('/api/sensors/quality'),
      ]);
      const sJson = await sRes.json();
      const mJson = await mRes.json();
      const qJson = await qRes.json();
      setSensors((sJson?.data || []).filter((o: SensorOption) => o.sensor_tag && o.sensor_tag.trim()));
      if (mJson?.success) setMetaMap(mJson.meta || {});
      if (qJson?.success) setQuality(qJson.quality || {});
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadMeta = useCallback(async () => {
    const r = await apiFetch('/api/sensors/meta');
    const j = await r.json();
    if (j?.success) setMetaMap(j.meta || {});
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sensors
      .filter((o) => !q || o.sensor_tag.toLowerCase().includes(q))
      .map((o) => ({ option: o, meta: metaMap[o.sensor_tag] ?? emptyMeta(o.sensor_tag), quality: quality[o.sensor_tag] }))
      .filter(({ meta, quality: qy }) => {
        switch (filter) {
          case 'maintenance':
            return meta.maintenance;
          case 'disabled':
            return meta.enabled === false;
          case 'suspect':
            return meta.suspect;
          case 'nodata':
            return qy?.no_data === true;
          case 'configured':
            return !!metaMap[meta.sensor_tag];
          default:
            return true;
        }
      });
  }, [sensors, metaMap, quality, query, filter]);

  const counts = useMemo(() => {
    const c = { all: sensors.length, maintenance: 0, disabled: 0, suspect: 0, nodata: 0, configured: 0 };
    for (const o of sensors) {
      const m = metaMap[o.sensor_tag];
      if (m?.maintenance) c.maintenance++;
      if (m?.enabled === false) c.disabled++;
      if (m?.suspect) c.suspect++;
      if (quality[o.sensor_tag]?.no_data) c.nodata++;
    }
    c.configured = Object.keys(metaMap).length;
    return c;
  }, [sensors, metaMap, quality]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.option.sensor_tag));
  const toggle = (tag: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(tag)) n.delete(tag);
      else n.add(tag);
      return n;
    });
  const toggleAllVisible = () =>
    setSelected((s) => {
      if (allVisibleSelected) {
        const n = new Set(s);
        rows.forEach((r) => n.delete(r.option.sensor_tag));
        return n;
      }
      const n = new Set(s);
      rows.forEach((r) => n.add(r.option.sensor_tag));
      return n;
    });

  const patch = (tag: string, p: Partial<SensorMeta>) => {
    setMetaMap((m) => ({ ...m, [tag]: { ...(m[tag] ?? emptyMeta(tag)), ...p } }));
  };

  const save = async (tag: string) => {
    setSaving(tag);
    setMsg('');
    try {
      const r = await apiFetch('/api/sensors/meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaMap[tag] ?? emptyMeta(tag)),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '保存失败');
      setMetaMap((m) => ({ ...m, [tag]: j.item }));
      setMsg(`已保存：${tag}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving('');
    }
  };

  const reset = async (tag: string) => {
    if (!confirm(`恢复「${tag}」的默认元数据？`)) return;
    await apiFetch(`/api/sensors/meta?sensor_tag=${encodeURIComponent(tag)}`, { method: 'DELETE' });
    setMetaMap((m) => {
      const n = { ...m };
      delete n[tag];
      return n;
    });
  };

  const batch = async (p: { maintenance?: boolean; enabled?: boolean; suspect?: boolean }, label: string) => {
    if (selected.size === 0) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await apiFetch('/api/sensors/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: Array.from(selected), patch: p }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '批量操作失败');
      setMsg(`${label}：已更新 ${j.updated} 个测点`);
      setSelected(new Set());
      await reloadMeta();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '批量操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="signal-line" aria-hidden="true" />

      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="px-3 py-1.5 bg-card hover:bg-card-hover border border-border-strong rounded text-sm transition-colors">
            返回首页
          </Link>
          <h1 className="text-lg font-semibold">测点主数据</h1>
          <span className="text-xs text-muted-foreground">
            共 <b className="text-foreground">{counts.all}</b>
            <span className="ml-2">· 已配置 {counts.configured}</span>
            {counts.nodata > 0 && <span className="ml-2" style={{ color: 'var(--warning)' }}>· 值缺失 {counts.nodata}</span>}
            {counts.maintenance > 0 && <span className="ml-2" style={{ color: 'var(--warning)' }}>· 检修 {counts.maintenance}</span>}
            {counts.disabled > 0 && <span className="ml-2">· 停用 {counts.disabled}</span>}
            {counts.suspect > 0 && <span className="ml-2" style={{ color: 'var(--danger)' }}>· 坏点 {counts.suspect}</span>}
          </span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索测点…"
          className="bg-card border border-border-strong rounded px-2 py-1 text-xs w-52 focus:outline-none focus:border-primary"
        />
      </header>

      {/* 筛选 + 批量操作 */}
      <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              filter === f.key ? 'bg-primary/15 border-primary text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label} {counts[f.key]}
          </button>
        ))}

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-1.5 rounded border border-border-strong bg-card px-3 py-1.5">
            <span className="text-xs text-muted-foreground">已选 <b className="text-foreground">{selected.size}</b></span>
            <button onClick={() => batch({ maintenance: false }, '取消检修')} disabled={busy} className="px-2 py-1 rounded text-xs bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">批量取消检修</button>
            <button onClick={() => batch({ maintenance: true }, '设为检修')} disabled={busy} className="px-2 py-1 rounded text-xs border border-border-strong text-foreground hover:bg-card-hover disabled:opacity-50">设为检修</button>
            <button onClick={() => batch({ enabled: false }, '停用')} disabled={busy} className="px-2 py-1 rounded text-xs border border-border-strong text-muted-foreground hover:text-foreground disabled:opacity-50">停用</button>
            <button onClick={() => batch({ enabled: true }, '启用')} disabled={busy} className="px-2 py-1 rounded text-xs border border-border-strong text-muted-foreground hover:text-foreground disabled:opacity-50">启用</button>
            <button onClick={() => batch({ suspect: false }, '清除坏点')} disabled={busy} className="px-2 py-1 rounded text-xs border border-border-strong text-muted-foreground hover:text-foreground disabled:opacity-50">清除坏点</button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground">清除选择</button>
          </div>
        )}
      </div>

      {msg && <div className="mx-4 mt-2 panel px-4 py-2 text-xs text-muted-foreground">{msg}</div>}

      <main className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <div className="empty-state h-[400px]"><span className="text-sm">加载中…</span></div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-190px)]">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-card text-muted-foreground z-10">
                  <tr>
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="全选当前筛选" />
                    </th>
                    {['测点', '类型', '无数据起始', '最后有效值', '别名', '单位', '量程下限', '量程上限', '精度', '位置', '备注', '启用', '检修', '坏点', '操作'].map((h) => (
                      <th key={h} className="text-left font-normal px-2 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ option, meta, quality: qy }) => {
                    const configured = !!metaMap[option.sensor_tag];
                    const checked = selected.has(option.sensor_tag);
                    const noData = qy?.no_data === true;
                    return (
                      <tr
                        key={option.sensor_tag}
                        className="border-t border-border/60"
                        style={{ opacity: meta.enabled === false ? 0.6 : 1, background: checked ? 'rgba(77,163,255,0.06)' : undefined }}
                      >
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={checked} onChange={() => toggle(option.sensor_tag)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: SENSOR_TYPE_COLORS[option.type as SensorType] || '#8b96a6' }} />
                          <span title={`${option.sensor_tag} · ${option.device_id}`}>{option.sensor_tag}</span>
                          {configured && <span className="ml-1" style={{ color: 'var(--info)' }} title="已配置">•</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{option.type}</td>
                        <td className="px-2 py-1.5" style={{ color: noData ? 'var(--warning)' : 'var(--muted-foreground)' }} title={noData ? `自 ${fmtTs(qy?.no_data_since)} 起无数据` : '有数据'}>
                          {noData ? fmtTs(qy?.no_data_since) : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground" title={qy?.last_ok ? `最后有效值：${fmtTs(qy.last_ok)}` : '从未有过有效值'}>
                          {fmtTs(qy?.last_ok)}
                        </td>
                        <td className="px-2 py-1.5"><input value={meta.alias} onChange={(e) => patch(option.sensor_tag, { alias: e.target.value })} placeholder="显示名" className="bg-background border border-border-strong rounded px-1.5 py-1 w-28 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input value={meta.unit} onChange={(e) => patch(option.sensor_tag, { unit: e.target.value })} placeholder={option.unit || '单位'} className="bg-background border border-border-strong rounded px-1.5 py-1 w-16 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={meta.range_min ?? ''} onChange={(e) => patch(option.sensor_tag, { range_min: e.target.value === '' ? null : Number(e.target.value) })} className="bg-background border border-border-strong rounded px-1.5 py-1 w-20 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={meta.range_max ?? ''} onChange={(e) => patch(option.sensor_tag, { range_max: e.target.value === '' ? null : Number(e.target.value) })} className="bg-background border border-border-strong rounded px-1.5 py-1 w-20 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} max={4} value={meta.precision ?? ''} onChange={(e) => patch(option.sensor_tag, { precision: e.target.value === '' ? null : Number(e.target.value) })} className="bg-background border border-border-strong rounded px-1.5 py-1 w-12 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input value={meta.location} onChange={(e) => patch(option.sensor_tag, { location: e.target.value })} className="bg-background border border-border-strong rounded px-1.5 py-1 w-24 text-foreground" /></td>
                        <td className="px-2 py-1.5"><input value={meta.note} onChange={(e) => patch(option.sensor_tag, { note: e.target.value })} className="bg-background border border-border-strong rounded px-1.5 py-1 w-32 text-foreground" /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={meta.enabled} onChange={(e) => patch(option.sensor_tag, { enabled: e.target.checked })} /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={meta.maintenance} onChange={(e) => patch(option.sensor_tag, { maintenance: e.target.checked })} /></td>
                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={meta.suspect} onChange={(e) => patch(option.sensor_tag, { suspect: e.target.checked })} /></td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => save(option.sensor_tag)} disabled={saving === option.sensor_tag} className="text-primary hover:underline mr-2 disabled:opacity-50">{saving === option.sensor_tag ? '保存中' : '保存'}</button>
                          {configured && <button onClick={() => reset(option.sensor_tag)} className="text-muted-foreground hover:text-foreground">恢复</button>}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={16} className="px-3 py-8 text-center text-muted-foreground">无匹配测点</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
