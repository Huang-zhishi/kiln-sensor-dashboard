import { NextRequest, NextResponse } from 'next/server';
import { query, toRows } from '@/lib/db';
import { classifySensor, extractKilnId, UNIT_MAP } from '@/lib/sensor-classifier';

export const dynamic = 'force-dynamic';

/**
 * 传感器数值接口
 * GET /api/sensors/values
 * GET /api/sensors/values?sensor_tag=1#窑体温度TI_206A
 * GET /api/sensors/values?type=温度
 * GET /api/sensors/values?kiln_id=1#
 *
 * 返回传感器的实时数值
 * 
 * 参数：
 *   sensor_tag (可选) - 指定传感器名称，支持模糊匹配
 *   type (可选) - 按传感器类型筛选
 *   kiln_id (可选) - 按窑体筛选
 *   limit (可选) - 返回数量限制，默认 100
 * 
 * 响应格式：
 * {
 *   success: true,
 *   data: [
 *     {
 *       sensor_tag: "1#窑体温度TI_206A",
 *       device_id: "110000063330",
 *       kiln_id: "1#",
 *       type: "温度",
 *       value: 177.00,
 *       unit: "°C",
 *       reported_at: "2026-07-28T04:00:16.000Z",
 *     }
 *   ],
 *   count: 1,
 *   updated_at: "2026-07-28T04:00:16.000Z"
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sensorTag = searchParams.get('sensor_tag');
    const type = searchParams.get('type');
    const kilnId = searchParams.get('kiln_id');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    // Get latest values for all sensors
    const sql = `
      SELECT LAST(ts) as ts, LAST(sensor_value) as sensor_value, 
             device_id, sensor_tag
      FROM sensor_readings
      PARTITION BY device_id, sensor_tag
    `;

    const result = await query(sql);
    let rows = toRows(result);

    // Apply filters
    if (sensorTag) {
      const tag = sensorTag.toLowerCase();
      rows = rows.filter((r) => String(r.sensor_tag || '').toLowerCase().includes(tag));
    }

    if (kilnId) {
      rows = rows.filter((r) => {
        const tag = String(r.sensor_tag || '');
        return tag.startsWith(kilnId);
      });
    }

    if (type) {
      rows = rows.filter((r) => {
        const tag = String(r.sensor_tag || '');
        return classifySensor(tag) === type;
      });
    }

    // Limit
    rows = rows.slice(0, limit);

    const data = rows.map((r) => {
      const sensorTag = String(r.sensor_tag || '');
      const sensorType = classifySensor(sensorTag);
      return {
        sensor_tag: sensorTag,
        device_id: String(r.device_id || ''),
        kiln_id: extractKilnId(sensorTag),
        type: sensorType,
        value: Number(r.sensor_value),
        unit: UNIT_MAP[sensorType] || '',
        reported_at: r.ts,
      };
    });

    // Find latest update time
    let updatedAt = '';
    for (const r of rows) {
      if (r.ts && (!updatedAt || String(r.ts) > updatedAt)) {
        updatedAt = String(r.ts);
      }
    }

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      updated_at: updatedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}