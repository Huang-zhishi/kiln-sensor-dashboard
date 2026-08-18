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

export const SENSOR_TYPE_COLORS: Record<SensorType, string> = {
  '温度': '#ef4444',      // 红色 - 高温警示
  '压力': '#f59e0b',      // 橙色 - 压力注意
  '流量': '#06b6d4',      // 青色 - 流动
  '阀位': '#8b5cf6',      // 紫色 - 控制
  '液位': '#3b82f6',      // 蓝色 - 液体
  '成分检测': '#10b981',  // 绿色 - 成分
  'pH值': '#ec4899',      // 粉色 - 化学
  '设备状态': '#64748b',  // 灰色 - 状态
  '其他': '#94a3b8',      // 浅灰 - 默认
};

export const SENSOR_TYPES: SensorType[] = [
  '温度', '压力', '流量', '阀位', '液位',
  '成分检测', 'pH值', '设备状态', '其他'
];

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
