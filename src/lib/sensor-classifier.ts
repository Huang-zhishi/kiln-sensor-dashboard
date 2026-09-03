// 传感器分类规则
// 根据传感器名称关键词自动分类

export type SensorType =
  | '温度'
  | '压力'
  | '流量'
  | '阀位'
  | '液位'
  | '成分检测'
  | 'pH值'
  | '设备状态'
  | '其他';

// 传感器类型语义色（与设计 token 对齐，低饱和、可辨性优先）
export const SENSOR_TYPE_COLORS: Record<SensorType, string> = {
  '温度': '#ff4d5e',      // 红 - 高温警示
  '压力': '#f5a524',      // 烬金 - 压力注意
  '流量': '#33a2e5',      // 青蓝 - 流动
  '阀位': '#b877d9',      // 紫 - 控制
  '液位': '#4da3ff',      // 蓝 - 液体
  '成分检测': '#38c172',  // 绿 - 成分
  'pH值': '#f7c948',      // 沙黄 - 化学
  '设备状态': '#8b96a6',  // 灰 - 状态
  '其他': '#6b7280',      // 深灰 - 默认
};

export const SENSOR_TYPES: SensorType[] = [
  '温度', '压力', '流量', '阀位', '液位',
  '成分检测', 'pH值', '设备状态', '其他'
];

export type SensorLevel = 'normal' | 'warning' | 'danger';

// 在线判定：最近一次上报距now超过该时长视为离线
// 数据上报周期约 5s（TI_806F 每分钟 12 条），60s = 12 个周期无数据即可判定中断
export const OFFLINE_AFTER_MS = 60_000;

export function isSensorOnline(reportedAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!reportedAt) return false;
  const t = new Date(reportedAt).getTime();
  if (!isFinite(t)) return false;
  return now - t <= OFFLINE_AFTER_MS;
}

// 阈值语义判断：温度/压力超限时返回告警级别（与仪表盘/表格/告警列表共用）
export function getSensorLevel(tag: string, value: number): SensorLevel {
  const lower = tag.toLowerCase();
  if (lower.includes('temp') || lower.includes('温度')) {
    if (value > 800) return 'danger';
    if (value > 500) return 'warning';
  }
  if (lower.includes('pressure') || lower.includes('压力')) {
    if (value > 100) return 'danger';
    if (value > 60) return 'warning';
  }
  return 'normal';
}

// 传感器类型 -> 显示单位
export const UNIT_MAP: Record<SensorType, string> = {
  '温度': '°C',
  '压力': 'kPa',
  '流量': 'm³/h',
  '阀位': '%',
  '液位': 'm',
  '成分检测': '%',
  'pH值': 'pH',
  '设备状态': '',
  '其他': '',
};

/**
 * 从传感器名称提取窑号，如 "1#窑体温度TI_206A" -> "1#"
 */
export function extractKilnId(sensorTag: string): string {
  if (!sensorTag) return '';
  const match = sensorTag.match(/^(\d+#)/);
  return match ? match[1] : '';
}

// 分类规则：关键词 -> 类型
const CLASSIFICATION_RULES: Array<{ keywords: string[]; type: SensorType }> = [
  {
    keywords: ['温度', 'TI_', 'TI_'],
    type: '温度',
  },
  {
    keywords: ['压力', 'PI_', 'PI_'],
    type: '压力',
  },
  {
    keywords: ['流量', 'FI_', 'FI_'],
    type: '流量',
  },
  {
    keywords: ['阀位', '阀'],
    type: '阀位',
  },
  {
    keywords: ['液位', '液位'],
    type: '液位',
  },
  {
    keywords: ['含氧量', '成分', 'AI_'],
    type: '成分检测',
  },
  {
    keywords: ['PH', 'pH', '酸碱'],
    type: 'pH值',
  },
  {
    keywords: ['振动', '电流', '运行', '状态'],
    type: '设备状态',
  },
];

/**
 * 根据传感器名称分类
 */
export function classifySensor(sensorName: string): SensorType {
  const name = sensorName.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    for (const keyword of rule.keywords) {
      if (name.includes(keyword.toLowerCase())) {
        return rule.type;
      }
    }
  }

  return '其他';
}

/**
 * 批量分类传感器
 */
export function classifySensors(sensorTags: string[]): Record<SensorType, string[]> {
  const result: Record<SensorType, string[]> = {
    '温度': [],
    '压力': [],
    '流量': [],
    '阀位': [],
    '液位': [],
    '成分检测': [],
    'pH值': [],
    '设备状态': [],
    '其他': [],
  };

  sensorTags.forEach((tag) => {
    const type = classifySensor(tag);
    result[type].push(tag);
  });

  return result;
}
