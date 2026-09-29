#!/usr/bin/env node
// SOP 测点限值 → 告警规则 种子脚本（幂等）
//
// 数据来源：火法车间作业指导书（SOP）
//   - 1# 回转窑 WH-SOP-004
//   - 2# 回转窑 WH-SOP-005
//   - 2# 烘干机 WH-SOP-003
//   - 2# 磨机   WH-SOP-001（及 1# 磨机参照）
//   - TI_206 系列测点判据更正（2026-09-28）
//
// 行为：读取 data/config/alert-rules.json，移除所有 id 以 "sop_" 开头的规则后
//       重新写入本文件的规则，**保留其它手工规则**。可反复执行。
//
// 用法：node scripts/seed-sop-rules.mjs
//
// 注意：默认 enabled=false（SOP 限值针对「投料后正常生产」稳态；点火升温期会
//       天然越限）。请工艺确认测点口径与当前工况后，在「告警中心 → 规则配置」逐条启用。

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'data', 'config', 'alert-rules.json');

/** @typedef {'high'|'low'} Dir */
/** @typedef {'P1'|'P2'|'P3'} Sev */

// [id, 测点tag, 方向, 阈值, 回差, 级别, 最短持续秒, 说明]
const DEFS = [
  // ── 1# 还原系统（1#回转窑，WH-SOP-004）────────────────────────────
  ['sop_1_ti206f_hi', '1#窑体温度TI_206F', 'high', 910, 5, 'P2', 60, '[SOP] 1#窑焙烧温度上限 850~910℃（投料后，主控点）'],
  ['sop_1_ti206f_lo', '1#窑体温度TI_206F', 'low', 850, 5, 'P2', 60, '[SOP] 1#窑焙烧温度下限 850~910℃（投料后，主控点）'],
  ['sop_1_ti206f_lock', '1#窑体温度TI_206F', 'high', 1150, 0, 'P1', 0, '[联锁] 窑温过高联锁：TI206F>1150℃（独立保护定值，切断天然气/降窑频/加大供风）'],
  ['sop_1_ti206b_lock', '1#窑体温度TI_206B', 'high', 1150, 0, 'P1', 0, '[联锁] 窑温过高联锁：TI206B>1150℃（独立保护定值）'],
  ['sop_1_ti206e_hi', '1#窑体温度TI_206E', 'high', 1100, 5, 'P2', 60, '[工艺确认] TI_206E 窑体温度 850~1100℃（独立判定，不套用 TI_206F）'],
  ['sop_1_ti206e_lo', '1#窑体温度TI_206E', 'low', 850, 5, 'P2', 60, '[工艺确认] TI_206E 窑体温度 850~1100℃（独立判定，不套用 TI_206F）'],
  ['sop_1_ti205_hi', '1#窑冷却器废气温度TI_205', 'high', 300, 5, 'P2', 60, '[SOP] 1#冷却器废气温度 250~300℃；>300 应开冷却喷淋水'],
  ['sop_1_ti205_lo', '1#窑冷却器废气温度TI_205', 'low', 250, 5, 'P3', 120, '[SOP] 1#冷却器废气温度 250~300℃'],
  ['sop_1_pi201_hi', '1#窑天然气压力PI_201', 'high', 85, 2, 'P1', 30, '[SOP] 1#窑天然气压力 80~85 kPa'],
  ['sop_1_pi201_lo', '1#窑天然气压力PI_201', 'low', 80, 2, 'P1', 30, '[SOP] 1#窑天然气压力 80~85 kPa'],
  ['sop_1_pi206a_hi', '1#窑窑头压力PI_206A', 'high', 20, 5, 'P2', 60, '[SOP] 1#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_1_pi206a_lo', '1#窑窑头压力PI_206A', 'low', -10, 5, 'P2', 60, '[SOP] 1#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_1_pi206b_hi', '1#窑窑尾压力PI_206B', 'high', 20, 5, 'P2', 60, '[SOP] 1#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_1_pi206b_lo', '1#窑窑尾压力PI_206B', 'low', -10, 5, 'P2', 60, '[SOP] 1#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_1_fi204_lo', '1#窑供气流量FI_204', 'low', 600, 50, 'P3', 120, '[SOP] C0204 供风流量正常约 600 m³/h（吹扫 2000~3000）'],

  // ── 2# 还原系统（2#回转窑，WH-SOP-005）────────────────────────────
  ['sop_2_ti806f_hi', '2#窑体温度TI_806F', 'high', 910, 5, 'P2', 60, '[SOP] 2#窑焙烧温度上限 850~910℃（投料后）'],
  ['sop_2_ti806f_lo', '2#窑体温度TI_806F', 'low', 850, 5, 'P2', 60, '[SOP] 2#窑焙烧温度下限 850~910℃（投料后）'],
  ['sop_2_ti805_hi', '2#窑冷却器热风出口温度TI_805', 'high', 300, 5, 'P2', 60, '[SOP] 2#冷却器废气温度 250~300℃；>300 应开冷却喷淋水'],
  ['sop_2_ti805_lo', '2#窑冷却器热风出口温度TI_805', 'low', 250, 5, 'P3', 120, '[SOP] 2#冷却器废气温度 250~300℃'],
  ['sop_2_pi805a_hi', '2#窑窑头压力PI_805A', 'high', 20, 5, 'P2', 60, '[SOP] 2#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_2_pi805a_lo', '2#窑窑头压力PI_805A', 'low', -10, 5, 'P2', 60, '[SOP] 2#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_2_pi806b_hi', '2#窑窑头压力PI_806B', 'high', 20, 5, 'P2', 60, '[SOP] 2#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],
  ['sop_2_pi806b_lo', '2#窑窑头压力PI_806B', 'low', -10, 5, 'P2', 60, '[SOP] 2#窑窑头/窑尾压力 -10~20 Pa（保持负压）'],

  // ── 2# 原料烘干系统（WH-SOP-003）─────────────────────────────────
  ['sop_dry_outlet_lo', '2#烘干系统烘干机出口温度', 'low', 60, 2, 'P2', 300, '[SOP] 烘干机出口温度 ≥60℃（低于则原矿水分超标）'],

  // ── 磨机（WH-SOP-001；1#磨机参照）────────────────────────────────
  ['sop_m1_m0101_hi', '1#磨机M0101主减速机温度', 'high', 65, 2, 'P2', 300, '[SOP] 设备减速机/电机温度 ≤65℃'],
  ['sop_m1_c0101f_hi', '1#磨机C0101风机电机前轴承温度', 'high', 65, 2, 'P2', 300, '[SOP] 设备电机/轴承温度 ≤65℃'],
  ['sop_m1_c0101r_hi', '1#磨机C0101风机电机后轴承温度', 'high', 65, 2, 'P2', 300, '[SOP] 设备电机/轴承温度 ≤65℃'],
  ['sop_m1_c0101ef_hi', '1#磨机C0101废气风机电机前轴承温度', 'high', 65, 2, 'P2', 300, '[SOP] 设备电机/轴承温度 ≤65℃'],
];

function nowIso() {
  return new Date().toISOString();
}

function main() {
  let data = { version: 1, rules: [] };
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  }
  const kept = (Array.isArray(data.rules) ? data.rules : []).filter(
    (r) => typeof r?.id === 'string' && !r.id.startsWith('sop_'),
  );
  const ts = nowIso();
  const sopRules = DEFS.map(([id, sensor_tag, direction, threshold, deadband, severity, min_duration_sec, note]) => ({
    id,
    sensor_tag,
    enabled: false, // 见文件头说明：默认停用，工艺确认后逐条启用
    direction,
    threshold,
    deadband,
    severity,
    min_duration_sec,
    note,
    created_at: ts,
    updated_at: ts,
  }));

  const next = { version: 1, rules: [...kept, ...sopRules] };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);

  console.log(`保留手工规则 ${kept.length} 条，写入 SOP 规则 ${sopRules.length} 条 → ${FILE}`);
}

main();
