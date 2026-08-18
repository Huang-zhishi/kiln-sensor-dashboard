import { NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { classifySensor, type SensorType } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';
export const revalidate = 10;

/**
 * 传感器列表接口
 * GET /api/sensors/list
 * 
 * 返回所有传感器列表，含分类信息
 * 
 * 响应格式：
 * {
 *   success: true,
 *   data: [
 *     {
 *       sensor_tag: "1#窑体温度TI_206A",
 *       device_id: "110000063330",
 *       kiln_id: "1#",
 *       type: "温度",          // 传感器类型
 *       unit: "°C",            // 单位
 *     }
 *   ],
 *   summary: {                // 分类统计
 *     温度: 24,
 *     压力: 10,
 *     ...
 *   }
 * }
 */
export async function GET() {
  try {
    const sql = `
      SELECT DISTINCT sensor_tag, device_id
      FROM sensor_readings
      ORDER BY sensor_tag
    `;

    const result = await query(sql);
    const rows = toRows(result);

    const typeCount: Record<SensorType, number> = {
      '温度': 0, '压力': 0, '流量': 0, '阀位': 0, '液位': 0,
      '成分检测': 0, 'pH值': 0, '设备状态': 0, '其他': 0,
    };

    const UNIT_MAP: Record<string, string> = {
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

    const data = rows.map((r) => {
      const sensorTag = String(r.sensor_tag || '');
      const type = classifySensor(sensorTag);
      typeCount[type]++;
      return {
        sensor_tag: sensorTag,
        device_id: String(r.device_id || ''),
        kiln_id: extractKilnId(sensorTag),
        type,
        unit: UNIT_MAP[type] || '',
      };
    });

    return NextResponse.json({
      success: true,
      data,
      summary: typeCount,
      total: data.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function extractKilnId(sensorTag: string): string {
  const match = sensorTag.match(/^(\d+#)/);
  return match ? match[1] : '';
}