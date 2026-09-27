'use client';

// 测点主数据治理：别名 / 单位 / 量程 / 精度 / 启停用 / 检修 / 坏点标记
// 保存后立即生效：传感器页与历史页会按元数据覆盖单位、量程、显示名。

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

export default function TagsPage() {
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [metaMap, setMetaMap] = useState<SensorMetaMap>({});
  const [query, setQuery] = useState('');
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [sRes, mRes] = await Promise.all([apiFetch('/api/sensors/list'), apiFetch('/api/sensors/meta')]);
      const sJson = await sRes.json();
      const mJson = await mRes.json();
      setSensors((sJson?.data || []).filter((o: SensorOption) => o.sensor_tag && o.sensor_tag.trim()));
      if (mJson?.success) setMetaMap(mJson.meta || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sensors
      .filter((o) => !q || o.sensor_tag.toLowerCase().includes(q))
      .filter((o) => !onlyConfigured || !!metaMap[o.sensor_tag])
      .map((o) => ({ option: o, meta: metaMap[o.sensor_tag] ?? emptyMeta(o.sensor_tag) }));
  }, [sensors, metaMap, query, onlyConfigured]);

  const stats = useMemo(() => {
    let disabled = 0;
    let maintenance = 0;
    let suspect = 0;
    for (const key of Object.keys(metaMap)) {
      const m = metaMap[key];
      if (m.enabled === false) disabled++;
      if (m.maintenance) maintenance++;
      if (m.suspect) suspect++;
    }
    return { configured: Object.keys(metaMap).length, disabled, maintenance, suspect };
  }, [metaMap]);

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
      const next = { ...m };
      delete next[tag];
      return next;
    });
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
            已配置 <b className="text-foreground">{stats.configured}</b>
            {stats.disabled > 0 && <span className="ml-2">· 停用 {stats.disabled}</span>}
            {stats.maintenance > 0 && <span className="ml-2" style={{ color: 'var(--warning)' }}>· 检修 {stats.maintenance}</span>}
            {stats.suspect > 0 && <span className="ml-2" style={{ color: 'var(--danger)' }}>· 坏点 {stats.suspect}</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索测点…"
            className="bg-card border border-border-strong rounded px-2 py-1 text-xs w-44 focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => setOnlyConfigured((v) => !v)}
            className={`px-3 py-1.5 rounded text-xs border transition-colors ${onlyConfigured ? 'bg-primary/20 border-primary text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground'}`}
          >
            仅看已配置
          </button>
        </div>
      </header>

      {msg && <div className="mx-4 mt-3 panel px-4 py-2 text-xs text-muted-foreground">{msg}</div>}

      <main className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <div className="empty-state h-[400px]"><span className="text-sm">加载中…</span></div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-150px)]">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-card text-muted-foreground z-10">
                  <tr>
                    {['测点', '类型', '别名', '单位', '量程下限', '量程上限', '精度', '位置', '备注', '启用', '检修', '坏点', '操作'].map((h) => (
                      <th key={h} className="text-left font-normal px-2 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ option, meta }) => {
                    const configured = !!metaMap[option.sensor_tag];
                    const changed = meta.updated_at !== '' || configured;
                    return (
                      <tr key={option.sensor_tag} className="border-t border-border/60" style={{ opacity: meta.enabled === false ? 0.6 : 1 }}>
                        <td className="px-2 py-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: SENSOR_TYPE_COLORS[option.type as SensorType] || '#8b96a6' }} />
                          <span title={`${option.sensor_tag} · ${option.device_id}`}>{option.sensor_tag}</span>
                          {changed && <span className="ml-1" style={{ color: 'var(--info)' }} title="已配置">•</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{option.type}</td>
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
                    <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">无匹配测点</td></tr>
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
