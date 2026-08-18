'use client';

import { useState, useEffect } from 'react';
import { FlowDiagram } from '@/components/flow/flow-diagram';
import { StatusTable } from '@/components/flow/status-table';
import { BottomNav } from '@/components/flow/bottom-nav';

interface DataPoint {
  value: number;
  unit: string;
  min: number;
  max: number;
}

const REDUCTION_POINTS: Record<string, { unit: string; min: number; max: number }> = {
  grinder_flow: { unit: 't/h', min: -15, max: -5 },
  grinder_valve: { unit: '%', min: 0, max: 100 },
  grinder_current: { unit: 'A', min: -200, max: -150 },
  grinder_vibration: { unit: 'mm/s', min: 0.1, max: 0.5 },
  manganese_silo_1_level: { unit: '%', min: 30, max: 80 },
  manganese_silo_2_level: { unit: '%', min: 30, max: 80 },
  manganese_flow_1: { unit: 'kg/h', min: 8000, max: 10000 },
  manganese_flow_2: { unit: 'kg/h', min: 8000, max: 10000 },
  feeder_valve_1: { unit: '%', min: 80, max: 100 },
  feeder_valve_2: { unit: '%', min: 80, max: 100 },
  coal_flow: { unit: 'kg/h', min: -15, max: -5 },
  coal_valve: { unit: '%', min: 0, max: 10 },
  natural_gas_flow: { unit: 'm³/h', min: 1200, max: 1600 },
  natural_gas_valve: { unit: '', min: 35, max: 45 },
  kiln_temp_1: { unit: '°C', min: 140, max: 180 },
  kiln_temp_2: { unit: '°C', min: 320, max: 380 },
  kiln_temp_3: { unit: '°C', min: 750, max: 850 },
  kiln_temp_4: { unit: '°C', min: 850, max: 950 },
  kiln_pressure: { unit: 'Pa', min: 20, max: 50 },
  kiln_valve: { unit: '%', min: 70, max: 95 },
  kiln_outlet_temp: { unit: '°C', min: 700, max: 800 },
  desulfurization_temp: { unit: '°C', min: 100, max: 140 },
  oxygen_content: { unit: '%', min: 3, max: 8 },
  desulfurization_valve: { unit: '%', min: 30, max: 50 },
  id_fan_current: { unit: 'A', min: 30, max: 50 },
  id_fan_valve: { unit: '%', min: 80, max: 100 },
  bag_filter_temp: { unit: '°C', min: 150, max: 180 },
  air_pressure_1: { unit: 'MPa', min: 0, max: 0.1 },
  air_pressure_2: { unit: 'MPa', min: 0.3, max: 0.6 },
  pump_1_valve: { unit: '%', min: 80, max: 100 },
  pump_2_valve: { unit: '%', min: 0, max: 10 },
  product_level: { unit: '%', min: 40, max: 70 },
  discharge_valve: { unit: '%', min: 80, max: 100 },
  product_flow_1: { unit: 'kg/h', min: -3500, max: -2500 },
  product_flow_2: { unit: 'kg/h', min: -50, max: 50 },
};

const NAV_ITEMS = [
  { id: 'reduction_1', name: '1#还原系统' },
  { id: 'reduction_2', name: '2#还原系统' },
  { id: 'oxidation', name: '四锰氧化' },
  { id: 'drying', name: '四锰干燥' },
  { id: 'energy', name: '能源看板' },
  { id: 'main', name: '主画面' },
];

function generateData(): Record<string, DataPoint> {
  const data: Record<string, DataPoint> = {};
  for (const [key, config] of Object.entries(REDUCTION_POINTS)) {
    data[key] = {
      value: config.min + Math.random() * (config.max - config.min),
      unit: config.unit,
      min: config.min,
      max: config.max,
    };
  }
  return data;
}

export default function FlowPage() {
  const [data, setData] = useState<Record<string, DataPoint>>(generateData);
  const [activeSystem, setActiveSystem] = useState('reduction_1');
  const [statusData, setStatusData] = useState({
    runTime: { day: 1.8, night: 0.0 },
    gasFlow: { day: 85, night: 0.0 },
    dryWeight: { day: '待更新', night: '待更新' },
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setData(generateData());
      setStatusData(prev => ({
        runTime: {
          day: prev.runTime.day + 0.1,
          night: prev.runTime.night,
        },
        gasFlow: {
          day: prev.gasFlow.day + Math.random() * 5,
          night: prev.gasFlow.night,
        },
        dryWeight: prev.dryWeight,
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* 主内容区 */}
      <div className="flex-1 relative overflow-hidden">
        <FlowDiagram data={data} />

        {/* 成品流量显示 */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 space-y-3">
          <div className="bg-[#0f1729]/90 border border-[#00e5ff]/30 rounded px-4 py-2">
            <div className="text-xs text-[#94a3b8]">1#线成品流量</div>
            <div className="text-lg font-mono font-bold text-[#00e5ff]">
              {data['product_flow_1']?.value.toFixed(0) || '0'} kg/h
            </div>
          </div>
          <div className="bg-[#0f1729]/90 border border-[#00e5ff]/30 rounded px-4 py-2">
            <div className="text-xs text-[#94a3b8]">2#线成品流量</div>
            <div className="text-lg font-mono font-bold text-[#00e5ff]">
              {data['product_flow_2']?.value.toFixed(0) || '0'} kg/h
            </div>
          </div>
        </div>

        {/* 状态表格 */}
        <div className="absolute right-8 bottom-24">
          <StatusTable data={statusData} isRunning={true} />
        </div>
      </div>

      {/* 底部导航 */}
      <BottomNav active={activeSystem} onChange={setActiveSystem} />
    </div>
  );
}
