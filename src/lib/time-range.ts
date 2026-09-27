// 时间窗口解析（前后端共用，纯函数、无 Node 依赖）
//
// 背景：历史查询原先只支持 10m/30m/1h/6h/12h/24h，且聚合间隔散落在
// API 路由、数据层、图表组件三处各自硬编码，无法查看 24h 以前的数据。
// 本模块把「预设/自定义区间 → TDengine 时间条件 + 聚合间隔」收敛为单一来源。
//
// 约定：
// - 预设值（10m/30m/1h/6h/12h/24h/3d/7d/15d/30d）直接用作 `NOW() - <value>`；
// - 自定义区间用 epoch 毫秒（start/end）表达，避免服务器/容器时区不一致导致偏移；
// - 聚合间隔随跨度自动放大，保证长周期查询点数可控、延迟稳定。

export interface TimeRangePreset {
  /** 值（同时可作为 TDengine 相对时间字面量） */
  value: string;
  /** 完整中文标签 */
  label: string;
  /** 按钮用短标签 */
  short: string;
  /** 跨度（毫秒） */
  ms: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TIME_RANGE_PRESETS: TimeRangePreset[] = [
  { value: '10m', label: '10 分钟', short: '10分', ms: 10 * MINUTE },
  { value: '30m', label: '30 分钟', short: '30分', ms: 30 * MINUTE },
  { value: '1h', label: '1 小时', short: '1时', ms: HOUR },
  { value: '6h', label: '6 小时', short: '6时', ms: 6 * HOUR },
  { value: '12h', label: '12 小时', short: '12时', ms: 12 * HOUR },
  { value: '24h', label: '24 小时', short: '24时', ms: DAY },
  { value: '3d', label: '3 天', short: '3天', ms: 3 * DAY },
  { value: '7d', label: '7 天', short: '7天', ms: 7 * DAY },
  { value: '15d', label: '15 天', short: '15天', ms: 15 * DAY },
  { value: '30d', label: '30 天', short: '30天', ms: 30 * DAY },
];

/** 自定义区间标记值（前端控件用） */
export const CUSTOM_RANGE_VALUE = 'custom';

/** 默认时间范围（与后端默认保持一致） */
export const DEFAULT_TIME_RANGE = '12h';

const PRESET_BY_VALUE = new Map(TIME_RANGE_PRESETS.map((p) => [p.value, p]));

/** 各预设的聚合间隔：短周期保精度，长周期压点数（单测点/全测点均 <2s） */
const PRESET_INTERVAL: Record<string, string> = {
  '10m': '10s',
  '30m': '10s',
  '1h': '1m',
  '6h': '1m',
  '12h': '1h',
  '24h': '1h',
  '3d': '15m',
  '7d': '30m',
  '15d': '1h',
  '30d': '3h',
};

export function getPreset(value: string | null | undefined): TimeRangePreset | undefined {
  return value ? PRESET_BY_VALUE.get(value) : undefined;
}

export function isPresetRange(value: string | null | undefined): boolean {
  return !!getPreset(value);
}

/** 按跨度选择聚合间隔（自定义区间的兜底规则） */
export function resolveInterval(spanMs: number): string {
  if (!isFinite(spanMs) || spanMs <= 0) return PRESET_INTERVAL[DEFAULT_TIME_RANGE];
  if (spanMs <= 30 * MINUTE) return '10s';
  if (spanMs <= 6 * HOUR) return '1m';
  if (spanMs <= 24 * HOUR) return '5m';
  if (spanMs <= 3 * DAY) return '15m';
  if (spanMs <= 7 * DAY) return '30m';
  if (spanMs <= 15 * DAY) return '1h';
  return '3h';
}

/** 预设取固定映射；自定义（或未知值）按跨度解析 */
export function intervalForRange(timeRange: string | null | undefined, spanMs?: number): string {
  const preset = getPreset(timeRange);
  if (preset) return PRESET_INTERVAL[preset.value];
  if (spanMs && isFinite(spanMs) && spanMs > 0) return resolveInterval(spanMs);
  return PRESET_INTERVAL[DEFAULT_TIME_RANGE];
}

/** 聚合间隔的人读标签，如 10s → “10 秒采样” */
export function intervalLabel(interval: string): string {
  const m = /^(\d+)([smhd])$/.exec(interval);
  if (!m) return interval;
  const unit = { s: '秒', m: '分钟', h: '小时', d: '天' }[m[2]] || m[2];
  return `${m[1]} ${unit}采样`;
}

/** 把 ISO / epoch 毫秒 / 数字字符串解析为 epoch 毫秒；非法返回 null */
function parseTimeMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const s = String(value).trim();
  if (!s) return null;
  // 纯数字：按 epoch 毫秒处理（客户端 datetime-local 会先转毫秒再上报）
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  return isFinite(t) ? t : null;
}

export interface ResolvedWindow {
  /** TDengine 时间谓词（不含 WHERE/AND 前缀），用于拼接 SQL */
  tsCondition: string;
  /** 聚合间隔，如 '1m' / '1h' */
  interval: string;
  /** 窗口跨度（毫秒），用于轴标签格式与缓存键 */
  spanMs: number;
  /** 结束时间（毫秒）；自定义区间用于前端展示，预设为 null */
  startMs: number | null;
  endMs: number | null;
  isCustom: boolean;
}

/**
 * 解析查询窗口为 TDengine 可用的时间条件与聚合间隔。
 * 自定义区间优先；start/end 缺一或非法时回退到预设（默认 12h）。
 */
export function resolveTimeWindow(opts: {
  timeRange?: string | null;
  start?: string | number | null;
  end?: string | number | null;
  now?: number;
}): ResolvedWindow {
  const now = opts.now ?? Date.now();
  let startMs = parseTimeMs(opts.start);
  let endMs = parseTimeMs(opts.end);

  if (startMs !== null && endMs !== null) {
    if (startMs > endMs) [startMs, endMs] = [endMs, startMs];
    // 结束时间不允许落在未来
    if (endMs > now) endMs = now;
    const spanMs = Math.max(endMs - startMs, 1000);
    return {
      tsCondition: `ts >= ${Math.floor(startMs)} AND ts <= ${Math.floor(endMs)}`,
      interval: resolveInterval(spanMs),
      spanMs,
      startMs,
      endMs,
      isCustom: true,
    };
  }

  const preset = getPreset(opts.timeRange) ?? getPreset(DEFAULT_TIME_RANGE)!;
  return {
    tsCondition: `ts > NOW() - ${preset.value}`,
    interval: PRESET_INTERVAL[preset.value],
    spanMs: preset.ms,
    startMs: null,
    endMs: null,
    isCustom: false,
  };
}

/** 由 datetime-local 值（如 2026-09-20T08:00）得到 epoch 毫秒；调用方时区生效 */
export function localInputToMs(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return isFinite(t) ? t : null;
}

/** 由 epoch 毫秒转 datetime-local 输入值（YYYY-MM-DDTHH:mm）；调用方时区生效 */
export function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
