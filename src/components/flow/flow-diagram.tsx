'use client';

import { useState, useEffect } from 'react';
import { DraggableWrapper } from '@/components/equipment/draggable-wrapper';
import { Silo, Kiln, Fan, Pump, Valve, Motor, Pipe, CurvedPipe, DataLabel } from '@/components/equipment';

interface EquipmentPosition {
  id: string;
  x: number;
  y: number;
}

const INITIAL_POSITIONS: EquipmentPosition[] = [
  { id: 'grinder', x: 80, y: 100 },
  { id: 'manganese_silo_1', x: 280, y: 80 },
  { id: 'manganese_silo_2', x: 420, y: 80 },
  { id: 'feeder_valve_1', x: 310, y: 200 },
  { id: 'feeder_valve_2', x: 450, y: 200 },
  { id: 'coal_feeder', x: 80, y: 280 },
  { id: 'hot_air_furnace', x: 280, y: 380 },
  { id: 'kiln', x: 550, y: 320 },
  { id: 'desulfurization', x: 900, y: 80 },
  { id: 'id_fan', x: 1050, y: 100 },
  { id: 'bag_filter', x: 900, y: 220 },
  { id: 'air_compressor', x: 1200, y: 100 },
  { id: 'pump_1', x: 1150, y: 200 },
  { id: 'pump_2', x: 1300, y: 200 },
  { id: 'product_silo', x: 700, y: 450 },
  { id: 'discharge_valve', x: 700, y: 520 },
];

interface FlowDiagramProps {
  data: Record<string, { value: number; unit: string; min: number; max: number }>;
}

export function FlowDiagram({ data }: FlowDiagramProps) {
  const [positions, setPositions] = useState<EquipmentPosition[]>(INITIAL_POSITIONS);

  const handlePositionChange = (id: string, newPosition: { x: number; y: number }) => {
    setPositions(prev =>
      prev.map(p => (p.id === id ? { ...p, ...newPosition } : p))
    );
  };

  const getPosition = (id: string) => {
    return positions.find(p => p.id === id) || { x: 0, y: 0 };
  };

  return (
    <svg
      viewBox="0 0 1600 650"
      className="w-full h-full"
      style={{ minHeight: '600px' }}
    >
      <defs>
        <linearGradient id="pipeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.4" />
        </linearGradient>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#00e5ff" />
        </marker>
      </defs>

      {/* 背景 */}
      <rect width="1600" height="650" fill="#0a0e1a" />

      {/* 管道连接 - 动态计算位置 */}
      <g opacity="0.6">
        {/* 锰粉仓到给料阀 */}
        <Pipe
          x1={getPosition('manganese_silo_1').x + 30}
          y1={getPosition('manganese_silo_1').y + 100}
          x2={getPosition('feeder_valve_1').x}
          y2={getPosition('feeder_valve_1').y}
          color="#ff00ff"
        />
        <Pipe
          x1={getPosition('manganese_silo_2').x + 30}
          y1={getPosition('manganese_silo_2').y + 100}
          x2={getPosition('feeder_valve_2').x}
          y2={getPosition('feeder_valve_2').y}
          color="#ff00ff"
        />

        {/* 给料阀到窑炉 */}
        <Pipe
          x1={getPosition('feeder_valve_1').x + 40}
          y1={getPosition('feeder_valve_1').y + 20}
          x2={getPosition('kiln').x}
          y2={getPosition('kiln').y + 20}
          color="#ff00ff"
        />
        <Pipe
          x1={getPosition('feeder_valve_2').x + 40}
          y1={getPosition('feeder_valve_2').y + 20}
          x2={getPosition('kiln').x}
          y2={getPosition('kiln').y + 20}
          color="#ff00ff"
        />

        {/* 热风炉到窑炉 */}
        <Pipe
          x1={getPosition('hot_air_furnace').x + 120}
          y1={getPosition('hot_air_furnace').y + 30}
          x2={getPosition('kiln').x}
          y2={getPosition('kiln').y + 60}
          color="#ffa500"
        />

        {/* 窑炉到脱硫塔 */}
        <Pipe
          x1={getPosition('kiln').x + 200}
          y1={getPosition('kiln').y + 20}
          x2={getPosition('desulfurization').x}
          y2={getPosition('desulfurization').y + 80}
          color="#00e5ff"
        />

        {/* 脱硫塔到引风机 */}
        <Pipe
          x1={getPosition('desulfurization').x + 60}
          y1={getPosition('desulfurization').y + 40}
          x2={getPosition('id_fan').x}
          y2={getPosition('id_fan').y + 30}
          color="#00e5ff"
        />

        {/* 窑炉到布袋除尘 */}
        <Pipe
          x1={getPosition('kiln').x + 200}
          y1={getPosition('kiln').y + 40}
          x2={getPosition('bag_filter').x}
          y2={getPosition('bag_filter').y + 40}
          color="#00e5ff"
        />

        {/* 布袋除尘到引风机 */}
        <Pipe
          x1={getPosition('bag_filter').x + 80}
          y1={getPosition('bag_filter').y + 40}
          x2={getPosition('id_fan').x}
          y2={getPosition('id_fan').y + 50}
          color="#00e5ff"
        />

        {/* 窑炉到成品仓 */}
        <Pipe
          x1={getPosition('kiln').x + 100}
          y1={getPosition('kiln').y + 80}
          x2={getPosition('product_silo').x}
          y2={getPosition('product_silo').y}
          color="#ff00ff"
        />
      </g>

      {/* 设备组件 - 可拖拽 */}
      <DraggableWrapper
        id="grinder"
        initialPosition={getPosition('grinder')}
        onPositionChange={handlePositionChange}
      >
        <text x="0" y="20" fill="#e2e8f0" fontSize="14" fontWeight="bold">
          磨机
        </text>
        <rect x="0" y="30" width="120" height="80" fill="#1e293b" stroke="#00e5ff" strokeWidth="2" rx="4" />
        <DataLabel
          x={0}
          y={120}
          items={[
            { label: '磨矿', value: data['grinder_flow']?.value.toFixed(1) || '0', unit: 't/h' },
            { label: '阀位', value: data['grinder_valve']?.value.toFixed(0) || '0', unit: '%' },
            { label: '电流', value: data['grinder_current']?.value.toFixed(0) || '0', unit: 'A' },
            { label: '振动', value: data['grinder_vibration']?.value.toFixed(2) || '0', unit: 'mm/s' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="manganese_silo_1"
        initialPosition={getPosition('manganese_silo_1')}
        onPositionChange={handlePositionChange}
      >
        <Silo x={0} y={0} label="1#锰粉仓" level={data['manganese_silo_1_level']?.value || 0} />
      </DraggableWrapper>

      <DraggableWrapper
        id="manganese_silo_2"
        initialPosition={getPosition('manganese_silo_2')}
        onPositionChange={handlePositionChange}
      >
        <Silo x={0} y={0} label="2#锰粉仓" level={data['manganese_silo_2_level']?.value || 0} />
      </DraggableWrapper>

      <DraggableWrapper
        id="feeder_valve_1"
        initialPosition={getPosition('feeder_valve_1')}
        onPositionChange={handlePositionChange}
      >
        <Valve x={0} y={0} label="M0202A" open={true} />
        <DataLabel
          x={50}
          y={0}
          items={[
            { label: '流量', value: data['manganese_flow_1']?.value.toFixed(0) || '0', unit: 'kg/h' },
            { label: '阀位', value: data['feeder_valve_1']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="feeder_valve_2"
        initialPosition={getPosition('feeder_valve_2')}
        onPositionChange={handlePositionChange}
      >
        <Valve x={0} y={0} label="M0202B" open={true} />
        <DataLabel
          x={50}
          y={0}
          items={[
            { label: '流量', value: data['manganese_flow_2']?.value.toFixed(0) || '0', unit: 'kg/h' },
            { label: '阀位', value: data['feeder_valve_2']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="coal_feeder"
        initialPosition={getPosition('coal_feeder')}
        onPositionChange={handlePositionChange}
      >
        <DataLabel
          x={0}
          y={0}
          items={[
            { label: '煤粉流量', value: data['coal_flow']?.value.toFixed(0) || '0', unit: 'kg/h' },
            { label: '阀位', value: data['coal_valve']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="hot_air_furnace"
        initialPosition={getPosition('hot_air_furnace')}
        onPositionChange={handlePositionChange}
      >
        <DataLabel
          x={0}
          y={0}
          items={[
            { label: '天然气流量', value: data['natural_gas_flow']?.value.toFixed(0) || '0', unit: 'm³/h' },
            { label: '阀位', value: data['natural_gas_valve']?.value.toFixed(2) || '0', unit: '' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="kiln"
        initialPosition={getPosition('kiln')}
        onPositionChange={handlePositionChange}
      >
        <Kiln x={0} y={0} label="1#还原窑" />
        <DataLabel
          x={100}
          y={-20}
          items={[
            { label: 'TI_206A', value: data['kiln_temp_1']?.value.toFixed(0) || '0', unit: '°C' },
            { label: 'TI_206B', value: data['kiln_temp_2']?.value.toFixed(0) || '0', unit: '°C' },
            { label: 'TI_206E', value: data['kiln_temp_3']?.value.toFixed(0) || '0', unit: '°C' },
            { label: 'TI_206F', value: data['kiln_temp_4']?.value.toFixed(0) || '0', unit: '°C' },
          ]}
        />
        <DataLabel
          x={100}
          y={60}
          items={[
            { label: 'PI_206B', value: data['kiln_pressure']?.value.toFixed(2) || '0', unit: 'Pa' },
            { label: '阀位', value: data['kiln_valve']?.value.toFixed(0) || '0', unit: '%' },
            { label: 'TI_207', value: data['kiln_outlet_temp']?.value.toFixed(0) || '0', unit: '°C' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="desulfurization"
        initialPosition={getPosition('desulfurization')}
        onPositionChange={handlePositionChange}
      >
        <Silo x={0} y={0} label="脱硫塔" level={50} />
        <DataLabel
          x={80}
          y={0}
          items={[
            { label: 'TI_203', value: data['desulfurization_temp']?.value.toFixed(0) || '0', unit: '°C' },
            { label: '含氧量', value: data['oxygen_content']?.value.toFixed(2) || '0', unit: '%' },
            { label: '阀位', value: data['desulfurization_valve']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="id_fan"
        initialPosition={getPosition('id_fan')}
        onPositionChange={handlePositionChange}
      >
        <Fan x={0} y={0} label="C0203" spinning={true} />
        <DataLabel
          x={60}
          y={0}
          items={[
            { label: '电流', value: data['id_fan_current']?.value.toFixed(0) || '0', unit: 'A' },
            { label: '阀位', value: data['id_fan_valve']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="bag_filter"
        initialPosition={getPosition('bag_filter')}
        onPositionChange={handlePositionChange}
      >
        <Silo x={0} y={0} label="布袋除尘" level={30} />
        <DataLabel
          x={100}
          y={0}
          items={[
            { label: 'TI_212', value: data['bag_filter_temp']?.value.toFixed(0) || '0', unit: '°C' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="air_compressor"
        initialPosition={getPosition('air_compressor')}
        onPositionChange={handlePositionChange}
      >
        <DataLabel
          x={0}
          y={0}
          items={[
            { label: 'PI_0401', value: data['air_pressure_1']?.value.toFixed(2) || '0', unit: 'MPa' },
            { label: 'PI_0402', value: data['air_pressure_2']?.value.toFixed(2) || '0', unit: 'MPa' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="pump_1"
        initialPosition={getPosition('pump_1')}
        onPositionChange={handlePositionChange}
      >
        <Pump x={0} y={0} label="P0202A泵" />
        <DataLabel
          x={80}
          y={0}
          items={[
            { label: '阀位', value: data['pump_1_valve']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="pump_2"
        initialPosition={getPosition('pump_2')}
        onPositionChange={handlePositionChange}
      >
        <Pump x={0} y={0} label="P0202B泵" />
        <DataLabel
          x={80}
          y={0}
          items={[
            { label: '阀位', value: data['pump_2_valve']?.value.toFixed(0) || '0', unit: '%' },
          ]}
        />
      </DraggableWrapper>

      <DraggableWrapper
        id="product_silo"
        initialPosition={getPosition('product_silo')}
        onPositionChange={handlePositionChange}
      >
        <Silo x={0} y={0} label="成品仓" level={data['product_level']?.value || 0} />
      </DraggableWrapper>

      <DraggableWrapper
        id="discharge_valve"
        initialPosition={getPosition('discharge_valve')}
        onPositionChange={handlePositionChange}
      >
        <Valve x={0} y={0} label="卸料阀" open={true} />
      </DraggableWrapper>

      {/* 标题 */}
      <text x="800" y="40" textAnchor="middle" fill="#ff6b00" fontSize="28" fontWeight="bold">
        1#还原系统
      </text>

      {/* 图例 */}
      <g transform="translate(50, 580)">
        <line x1="0" y1="0" x2="40" y2="0" stroke="#ff00ff" strokeWidth="3" />
        <text x="50" y="5" fill="#94a3b8" fontSize="12">物料管道</text>
        <line x1="150" y1="0" x2="190" y2="0" stroke="#ffa500" strokeWidth="3" />
        <text x="200" y="5" fill="#94a3b8" fontSize="12">热风管道</text>
        <line x1="300" y1="0" x2="340" y2="0" stroke="#00e5ff" strokeWidth="3" />
        <text x="350" y="5" fill="#94a3b8" fontSize="12">气流管道</text>
      </g>
    </svg>
  );
}
