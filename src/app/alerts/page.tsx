'use client';

// 告警中心：活动告警 / 历史告警 / 规则配置
// - 活动告警由服务端引擎按规则实时评估
// - 处理闭环：处理人 / 处理意见 / 根因（写 TDengine alert_acks）
// - 通知：企业微信送达状态 + 手动重发

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { SensorPicker, type SensorOption } from '@/components/history/sensor-picker';
import {
  ALERT_SEVERITIES,
  SEVERITY_LABEL,
  SEVERITY_COLOR,
  DIRECTION_LABEL,
  type AlertRule,
  type ActiveAlert,
  type AlertEventItem,
  type AlertSeverity,
  type AlertDirection,
  type AlertAck,
} from '@/lib/alert-constants';

const POLL_MS = 15000;

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function fmtFull(iso: string | number): string {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '--';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--';
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
  return `${Math.floor(sec / 3600)} 时 ${Math.floor((sec % 3600) / 60)} 分`;
}

const NOTIFY_LABEL: Record<string, string> = {
  sent: '已发送',
  failed: '发送失败',
  skipped: '未配置渠道',
  none: '不通知',
};

interface Selection {
  eventKey: string;
  sensorTag: string;
  deviceId: string;
  severity: AlertSeverity;
  direction: AlertDirection;
  state: string;
  value: number;
  threshold: number;
  message: string;
  notify: string;
  ts: string;
  ack?: AlertAck | null;
  live?: boolean;
  durationSec?: number;
}

const EMPTY_RULE: AlertRule = {
  id: '',
  sensor_tag: '',
  enabled: true,
  direction: 'high',
  threshold: 0,
  deadband: 0,
  severity: 'P2',
  min_duration_sec: 0,
  note: '',
  created_at: '',
  updated_at: '',
};

export default function AlertsPage() {
  const [tab, setTab] = useState<'active' | 'history' | 'rules'>('active');
  const [active, setActive] = useState<ActiveAlert[]>([]);
  const [items, setItems] = useState<AlertEventItem[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Selection | null>(null);
  const [proc, setProc] = useState({ handler: '', comment: '', rootCause: '' });
  const [busy, setBusy] = useState(false);

  // 规则编辑
  const [draft, setDraft] = useState<AlertRule>(EMPTY_RULE);
  const [editing, setEditing] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const r = await apiFetch('/api/alerts?hours=168&limit=300');
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '告警数据读取失败');
      setActive(j.active || []);
      setItems(j.items || []);
      setError(j.warning ? `告警事件表：${j.warning}` : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '告警数据读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const r = await apiFetch('/api/alerts/rules');
      const j = await r.json();
      if (j.success) setRules(j.rules || []);
    } catch {
      // 忽略
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
    void loadRules();
    const timer = setInterval(() => void loadAlerts(), POLL_MS);
    return () => clearInterval(timer);
  }, [loadAlerts, loadRules]);

  useEffect(() => {
    apiFetch('/api/sensors/list')
      .then((r) => r.json())
      .then((j) => setSensors((j?.data || []).filter((o: SensorOption) => o.sensor_tag && o.sensor_tag.trim())))
      .catch(() => {});
  }, []);

  const openSelection = (s: Selection) => {
    setSelected(s);
    setProc({
      handler: s.ack?.handler || '',
      comment: s.ack?.comment || '',
      rootCause: s.ack?.rootCause || '',
    });
  };

  const reloadAll = async () => {
    await Promise.all([loadAlerts(), loadRules()]);
  };

  const saveProcessing = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/alerts/${encodeURIComponent(selected.eventKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acked', ...proc, device_id: selected.deviceId }),
      });
      setSelected(null);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '处理失败');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/alerts/${encodeURIComponent(selected.eventKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'new', device_id: selected.deviceId }),
      });
      setSelected(null);
      await reloadAll();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/alerts/${encodeURIComponent(selected.eventKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
      const j = await r.json();
      setError(j.notify === 'skipped' ? '未配置企业微信 Webhook（WECHAT_WEBHOOK_URL），无法发送' : '');
      await reloadAll();
    } finally {
      setBusy(false);
    }
  };

  const saveRule = async () => {
    setBusy(true);
    try {
      const r = await apiFetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, id: editing ? draft.id : undefined }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '保存失败');
      setEditing(false);
      setDraft(EMPTY_RULE);
      await reloadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存规则失败');
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (id: string) => {
    if (!confirm('确定删除该告警规则？')) return;
    await apiFetch(`/api/alerts/rules?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await reloadAll();
  };

  const toggleRule = async (rule: AlertRule) => {
    await apiFetch('/api/alerts/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    await reloadAll();
  };

  const activeCount = active.length;
  const p1Count = useMemo(() => active.filter((a) => a.severity === 'P1').length, [active]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="signal-line" aria-hidden="true" />

      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="px-3 py-1.5 bg-card hover:bg-card-hover border border-border-strong rounded text-sm transition-colors">
            返回首页
          </Link>
          <h1 className="text-lg font-semibold">告警中心</h1>
          <span className="text-xs text-muted-foreground">
            活动 <b style={{ color: activeCount ? 'var(--danger)' : 'var(--success)' }}>{activeCount}</b>
            {p1Count > 0 && <span className="ml-2" style={{ color: 'var(--danger)' }}>· P1 {p1Count}</span>}
            <span className="ml-2">· 规则 {rules.length}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(['active', 'history', 'rules'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                tab === t ? 'bg-primary/15 border-primary text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'active' ? '活动告警' : t === 'history' ? '历史告警' : '规则配置'}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 panel px-4 py-2 text-xs" style={{ borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)', color: 'var(--warning)' }}>
          {error}
        </div>
      )}

      <main className="flex-1 p-4 overflow-hidden">
        {loading ? (
          <div className="empty-state h-[400px]"><span className="text-sm">加载中…</span></div>
        ) : tab === 'active' ? (
          <div className="space-y-2">
            {active.length === 0 ? (
              <div className="empty-state h-[400px]">
                <span className="text-sm">当前无活动告警</span>
                <span className="empty-hint">在「规则配置」中为测点设置阈值后，超限将在此出现。</span>
              </div>
            ) : (
              active.map((a) => {
                const acked = a.ack?.status === 'acked';
                return (
                  <button
                    key={a.eventKey}
                    onClick={() =>
                      openSelection({
                        eventKey: a.eventKey,
                        sensorTag: a.sensorTag,
                        deviceId: a.deviceId,
                        severity: a.severity,
                        direction: a.direction,
                        state: 'active',
                        value: a.value,
                        threshold: a.threshold,
                        message: a.note || '',
                        notify: a.notify,
                        ts: new Date(a.since).toISOString(),
                        ack: a.ack,
                        live: true,
                        durationSec: a.duration_sec,
                      })
                    }
                    className="w-full text-left panel px-4 py-3 flex items-center gap-4 hover:bg-card-hover transition-colors"
                    style={{ borderLeft: `3px solid ${SEVERITY_COLOR[a.severity] || '#888'}`, opacity: acked ? 0.7 : 1 }}
                  >
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: `${SEVERITY_COLOR[a.severity]}22`, color: SEVERITY_COLOR[a.severity] }}>
                      {SEVERITY_LABEL[a.severity]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">{a.sensorTag}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {DIRECTION_LABEL[a.direction]} {a.threshold} · 当前 <b className="text-foreground">{Number(a.value).toFixed(2)}</b>
                        <span className="ml-2">持续 {fmtDuration(a.duration_sec || 0)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 text-[11px]">
                      <div className="text-muted-foreground">{NOTIFY_LABEL[a.notify] || a.notify}</div>
                      <div style={{ color: acked ? 'var(--success)' : 'var(--danger)' }}>{acked ? '已处理' : '未处理'}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : tab === 'history' ? (
          <div className="panel overflow-hidden">
            <div className="max-h-[calc(100vh-160px)] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    {['时间', '级别', '测点', '方向', '数值', '阈值', '状态', '通知', '处理'].map((h) => (
                      <th key={h} className="text-left font-normal px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const acked = e.ack?.status === 'acked';
                    return (
                      <tr
                        key={`${e.event_key}-${e.ts}`}
                        onClick={() =>
                          openSelection({
                            eventKey: String(e.event_key),
                            sensorTag: String(e.sensor_tag),
                            deviceId: String(e.device_id),
                            severity: e.severity,
                            direction: e.direction,
                            state: String(e.state),
                            value: Number(e.value),
                            threshold: Number(e.threshold),
                            message: String(e.message || ''),
                            notify: String(e.notify),
                            ts: String(e.ts),
                            ack: e.ack,
                          })
                        }
                        className="border-t border-border/60 hover:bg-card-hover cursor-pointer"
                      >
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{fmtFull(e.ts)}</td>
                        <td className="px-3 py-1.5" style={{ color: SEVERITY_COLOR[e.severity] }}>{e.severity}</td>
                        <td className="px-3 py-1.5 max-w-[240px] truncate">{e.sensor_tag}</td>
                        <td className="px-3 py-1.5">{DIRECTION_LABEL[e.direction] || e.direction}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{Number(e.value).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{Number(e.threshold).toFixed(2)}</td>
                        <td className="px-3 py-1.5" style={{ color: e.state === 'active' ? 'var(--danger)' : 'var(--success)' }}>
                          {e.state === 'active' ? '触发' : '恢复'}
                        </td>
                        <td className="px-3 py-1.5">{NOTIFY_LABEL[e.notify] || e.notify}</td>
                        <td className="px-3 py-1.5" style={{ color: acked ? 'var(--success)' : 'var(--muted-foreground)' }}>{acked ? '已处理' : '未处理'}</td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">暂无告警历史</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            {/* 规则编辑 */}
            <div className="panel p-4 xl:col-span-1">
              <h2 className="text-sm font-medium mb-3">{editing ? '编辑规则' : '新增规则'}</h2>
              <div className="space-y-2 text-xs">
                <label className="block">
                  <span className="text-muted-foreground">测点</span>
                  <div className="mt-1">
                    <SensorPicker
                      options={sensors}
                      value={sensors.find((s) => s.sensor_tag === draft.sensor_tag) || null}
                      onChange={(o) => setDraft((d) => ({ ...d, sensor_tag: o.sensor_tag }))}
                    />
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-muted-foreground">方向</span>
                    <select
                      value={draft.direction}
                      onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value as AlertDirection }))}
                      className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground"
                    >
                      <option value="high">高于上限</option>
                      <option value="low">低于下限</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">级别</span>
                    <select
                      value={draft.severity}
                      onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as AlertSeverity }))}
                      className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground"
                    >
                      {ALERT_SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">阈值</span>
                    <input type="number" value={draft.threshold} onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))} className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground" />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">死区(回差)</span>
                    <input type="number" value={draft.deadband} onChange={(e) => setDraft((d) => ({ ...d, deadband: Number(e.target.value) }))} className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground" />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">持续(秒)</span>
                    <input type="number" value={draft.min_duration_sec} onChange={(e) => setDraft((d) => ({ ...d, min_duration_sec: Number(e.target.value) }))} className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground" />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">启用</span>
                    <select value={draft.enabled ? '1' : '0'} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.value === '1' }))} className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground">
                      <option value="1">启用</option>
                      <option value="0">停用</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-muted-foreground">备注</span>
                  <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} className="mt-1 w-full bg-card border border-border-strong rounded px-2 py-1.5 text-foreground" />
                </label>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveRule} disabled={busy || !draft.sensor_tag} className="px-3 py-1.5 rounded bg-primary/20 border border-primary text-foreground hover:bg-primary/30 disabled:opacity-50">
                    {editing ? '保存修改' : '新增规则'}
                  </button>
                  {editing && (
                    <button onClick={() => { setEditing(false); setDraft(EMPTY_RULE); }} className="px-3 py-1.5 rounded border border-border-strong text-muted-foreground hover:text-foreground">
                      取消
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 规则列表 */}
            <div className="panel overflow-hidden xl:col-span-2">
              <div className="max-h-[calc(100vh-160px)] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      {['测点', '方向', '阈值', '死区', '持续', '级别', '状态', '操作'].map((h) => (
                        <th key={h} className="text-left font-normal px-3 py-2 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-1.5 max-w-[220px] truncate" title={r.note}>{r.sensor_tag}</td>
                        <td className="px-3 py-1.5">{DIRECTION_LABEL[r.direction]}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.threshold}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.deadband}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.min_duration_sec}s</td>
                        <td className="px-3 py-1.5" style={{ color: SEVERITY_COLOR[r.severity] }}>{r.severity}</td>
                        <td className="px-3 py-1.5" style={{ color: r.enabled ? 'var(--success)' : 'var(--muted-foreground)' }}>{r.enabled ? '启用' : '停用'}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <button onClick={() => { setEditing(true); setDraft(r); }} className="text-primary hover:underline mr-2">编辑</button>
                          <button onClick={() => toggleRule(r)} className="text-muted-foreground hover:text-foreground mr-2">{r.enabled ? '停用' : '启用'}</button>
                          <button onClick={() => removeRule(r.id)} style={{ color: 'var(--danger)' }}>删除</button>
                        </td>
                      </tr>
                    ))}
                    {rules.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">暂无规则，请在左侧新增</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 处理抽屉 */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md h-full bg-card border-l border-border-strong p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">告警处理</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>

            <div className="space-y-2 text-xs mb-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded" style={{ background: `${SEVERITY_COLOR[selected.severity]}22`, color: SEVERITY_COLOR[selected.severity] }}>{SEVERITY_LABEL[selected.severity]}</span>
                <span style={{ color: selected.state === 'active' ? 'var(--danger)' : 'var(--success)' }}>{selected.live || selected.state === 'active' ? '触发中' : '已恢复'}</span>
                {selected.live && <span className="text-muted-foreground">持续 {fmtDuration(selected.durationSec || 0)}</span>}
              </div>
              <div className="text-sm text-foreground break-all">{selected.sensorTag}</div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>时间：<span className="text-foreground">{fmtFull(selected.ts)}</span></div>
                <div>设备：<span className="text-foreground">{selected.deviceId}</span></div>
                <div>方向：<span className="text-foreground">{DIRECTION_LABEL[selected.direction]}</span></div>
                <div>阈值：<span className="text-foreground font-mono">{selected.threshold}</span></div>
                <div>数值：<span className="text-foreground font-mono">{Number(selected.value).toFixed(2)}</span></div>
                <div>通知：<span className="text-foreground">{NOTIFY_LABEL[selected.notify] || selected.notify}</span></div>
              </div>
              {selected.message && <div className="text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">{selected.message}</div>}
            </div>

            <div className="space-y-2 text-xs">
              <label className="block">
                <span className="text-muted-foreground">处理人</span>
                <input value={proc.handler} onChange={(e) => setProc((p) => ({ ...p, handler: e.target.value }))} placeholder="姓名 / 工号" className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground" />
              </label>
              <label className="block">
                <span className="text-muted-foreground">处理意见</span>
                <textarea value={proc.comment} onChange={(e) => setProc((p) => ({ ...p, comment: e.target.value }))} rows={3} className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground" />
              </label>
              <label className="block">
                <span className="text-muted-foreground">根因</span>
                <input value={proc.rootCause} onChange={(e) => setProc((p) => ({ ...p, rootCause: e.target.value }))} className="mt-1 w-full bg-background border border-border-strong rounded px-2 py-1.5 text-foreground" />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={saveProcessing} disabled={busy} className="px-3 py-1.5 rounded bg-primary/20 border border-primary text-foreground hover:bg-primary/30 disabled:opacity-50">保存处理</button>
              {selected.ack?.status === 'acked' && (
                <button onClick={reopen} disabled={busy} className="px-3 py-1.5 rounded border border-border-strong text-muted-foreground hover:text-foreground">取消已处理</button>
              )}
              <button onClick={resend} disabled={busy} className="px-3 py-1.5 rounded border border-border-strong text-foreground hover:bg-card-hover">重发通知</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
